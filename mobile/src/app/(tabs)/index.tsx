import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import { ActivityCard } from '@/components/ActivityCard';
import { Badge, Body, Button, Card, ErrorBox, Loading, Row, Screen, Section, StatusRibbon, Title, useLoader } from '@/components/ui';
import { api, ActivityStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { F, fmtDate, STATUS_LABEL, statusColor, useTheme } from '@/lib/theme';

const ORDER: ActivityStatus[] = ['completada', 'en_ejecucion', 'pendiente', 'retrasada', 'bloqueada'];

export default function DashboardScreen() {
  const t = useTheme();
  const navigation = useNavigation();
  const { canDecide } = useAuth();
  const { data, error, refreshing, refresh } = useLoader(api.dashboard);
  const [busy, setBusy] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 18, marginRight: 16 }}>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={t.text} />
            {!!data?.unread_notifications && (
              <View
                style={{
                  position: 'absolute', right: -6, top: -4, backgroundColor: t.danger,
                  borderRadius: 8, minWidth: 16, paddingHorizontal: 3, alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, ...F.bold }}>{data.unread_notifications}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/audit')} hitSlop={8}>
            <Ionicons name="time-outline" size={22} color={t.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/account')} hitSlop={8}>
            <Ionicons name="person-circle-outline" size={24} color={t.text} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, data?.unread_notifications, t]);

  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      Alert.alert('Listo', message);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data && !error) return <Loading />;
  const s = data?.summary;
  const missing = Object.entries(data?.credentials ?? {}).filter(([, ok]) => !ok).map(([k]) => k);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} chatFab>
      {error && <ErrorBox message={error} />}
      {missing.length > 0 && <ErrorBox message={`Faltan credenciales en el servidor: ${missing.join(', ')}`} />}

      {data && (
        <Pressable onPress={data.board.url ? () => Linking.openURL(data.board.url!) : undefined} style={{ gap: 2 }}>
          <Title style={{ fontSize: 22, letterSpacing: -0.4, ...F.bold }}>{data.board.name ?? 'Sin sincronizar'}</Title>
          <Body muted>Sincronizado {fmtDate(data.last_sync, true)}</Body>
        </Pressable>
      )}

      {s ? (
        <View style={{ gap: 12, marginVertical: 4 }}>
          <Row style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'nowrap' }}>
            <Text style={{ color: t.text, fontSize: 64, lineHeight: 64, letterSpacing: -3, ...F.bold }}>
              {s.progress_weighted}%
            </Text>
            <Body muted style={{ flex: 1, paddingBottom: 6 }}>
              de avance. {s.counts.completada} de {s.total} actividades completadas ({s.progress_completed}%).
            </Body>
          </Row>
          <StatusRibbon counts={s.counts} />
          <View>
            {ORDER.map((st) => (
              <Row
                key={st}
                style={{
                  justifyContent: 'space-between', flexWrap: 'nowrap', paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: t.border,
                }}
              >
                <Row style={{ gap: 10, flexWrap: 'nowrap' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: statusColor(t, st) }} />
                  <Body>{STATUS_LABEL[st]}</Body>
                </Row>
                <Text style={{ color: t.text, fontSize: 16, ...F.bold }}>{s.counts[st]}</Text>
              </Row>
            ))}
          </View>
        </View>
      ) : (
        data && <Body muted>Aún no hay datos. Sincroniza con Trello para empezar.</Body>
      )}

      {data && data.pending_decisions > 0 && (
        <Card onPress={() => router.push('/proposals')} accent={t.warning}>
          <Row>
            <Ionicons name="alert-circle-outline" size={20} color={t.warning} />
            <Title>{data.pending_decisions} propuestas esperan tu decisión</Title>
          </Row>
        </Card>
      )}

      {canDecide && (
        <Row>
          <Button
            label="Sincronizar"
            variant="secondary"
            loading={busy === 'sync'}
            onPress={() => run('sync', api.sync, 'Tablero sincronizado con Trello.')}
          />
          <Button
            label="Analizar retrasos"
            loading={busy === 'analysis'}
            onPress={() =>
              run('analysis', api.runAnalysis,
                'Los agentes están analizando el proyecto. Las propuestas aparecerán en unos minutos.')
            }
          />
        </Row>
      )}

      <Section>Requieren atención ({data?.attention.length ?? 0})</Section>
      {data?.attention.length === 0 && <Body muted>No hay actividades retrasadas, bloqueadas ni en riesgo.</Body>}
      {data?.attention.map((a) => (
        <ActivityCard key={a.id} activity={a} />
      ))}

      {!!data?.jobs.length && (
        <>
          <Section>Tareas automáticas</Section>
          {data.jobs.map((j) => (
            <Row key={j.id}>
              <Badge label={{ analysis: 'Análisis', code: 'Código', report: 'Reporte' }[j.id] ?? j.id} color={t.info} />
              <Body muted>próxima: {fmtDate(j.next_run, true)}</Body>
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}
