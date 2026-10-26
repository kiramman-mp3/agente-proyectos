import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Empty, ErrorBox, Loading, Row, Screen, Title, useLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ACTION_LABEL, fmtDate, PROPOSAL_STATUS_LABEL, proposalColor, useTheme } from '@/lib/theme';

const TABS = [
  { key: 'pendiente_gestor', label: 'Pendientes' },
  { key: '', label: 'Todas' },
] as const;

const POLL_MS = 3000;
const MAX_WAIT_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ProposalsScreen() {
  const t = useTheme();
  const [tab, setTab] = useState<string>('pendiente_gestor');
  const loader = useCallback(() => api.proposals(tab || undefined), [tab]);
  const { data, error, refreshing, refresh, reload } = useLoader(loader);
  const { canDecide } = useAuth();
  const [generating, setGenerating] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Lanza el análisis de retrasos al instante y refresca la lista hasta que los agentes terminan.
  const generate = async () => {
    setGenerating(true);
    try {
      await api.runAnalysis();
      const started = Date.now();
      let status = await api.analysisStatus();
      while (mounted.current && Date.now() - started < MAX_WAIT_MS) {
        await sleep(POLL_MS);
        status = await api.analysisStatus();
        await reload();
        if (!status.running) break;
      }
      if (!mounted.current) return;
      const last = status.last;
      if (status.running) {
        Alert.alert('Sigue en proceso', 'Los agentes siguen trabajando. Las propuestas aparecerán aquí al terminar.');
      } else if (last && !last.ok) {
        Alert.alert('Error', last.error ?? 'No se pudo completar el análisis.');
      } else if (last?.result) {
        Alert.alert(
          'Análisis terminado',
          last.result.propuestas
            ? `Se generaron ${last.result.propuestas} propuestas nuevas.`
            : 'No se detectaron actividades con retrasos o riesgos nuevos.',
        );
      }
    } catch (e) {
      if (mounted.current) Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setGenerating(false);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
        {TABS.map((x) => (
          <Pressable
            key={x.key}
            onPress={() => setTab(x.key)}
            style={{ flex: 1, padding: 10, alignItems: 'center', backgroundColor: tab === x.key ? t.primary : t.card }}
          >
            <Text style={{ color: tab === x.key ? t.primaryText : t.text, fontWeight: '600' }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {canDecide && (
        <Row>
          <Button label="Generar propuestas ahora" onPress={generate} loading={generating} />
        </Row>
      )}
      {generating && <Body muted>Los agentes están analizando el proyecto, esto puede tardar un par de minutos…</Body>}
      {error && <ErrorBox message={error} />}
      {!data && !error && <Loading />}
      {data?.length === 0 && (
        <Empty text={tab ? 'No hay propuestas esperando tu decisión.' : 'Todavía no hay propuestas.'} />
      )}
      {data?.map((p) => (
        <Card key={p.id} onPress={() => router.push({ pathname: '/proposal/[id]', params: { id: String(p.id) } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge label={PROPOSAL_STATUS_LABEL[p.status] ?? p.status} color={proposalColor(t, p.status)} />
            <Body muted>#{p.id} · {fmtDate(p.created_at, true)}</Body>
          </Row>
          <Title>
            {ACTION_LABEL[p.action_type] ?? p.action_type}: {p.target_name ?? 'repositorio'}
          </Title>
          {p.problem ? <Body muted>{p.problem}</Body> : null}
          {p.approver_risk && <Body muted>Riesgo evaluado: {p.approver_risk}</Body>}
        </Card>
      ))}
    </Screen>
  );
}
