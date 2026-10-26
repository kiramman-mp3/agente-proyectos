import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/Text';
import { Body, Button, ErrorBox } from '@/components/ui';
import { getRememberedUsername, setRememberedUsername } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { F, RADIUS, statusColor, useTheme } from '@/lib/theme';

// Misma cinta del panel, a escala de marca: completada, en ejecución, pendiente, bloqueada, retrasada.
const MARK: [string, number][] = [['completada', 5], ['en_ejecucion', 3], ['pendiente', 2], ['bloqueada', 1], ['retrasada', 1]];

export default function Login() {
  const t = useTheme();
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const pad = Math.max(24, (width - 440) / 2); // formulario centrado de hasta 440 px
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRememberedUsername().then((u) => {
      if (u) {
        setUsername(u);
        setRemember(true);
      }
    });
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = username.trim();
      await login(user, password);
      await setRememberedUsername(remember ? user : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: t.bg, paddingHorizontal: pad }]}
    >
      <View style={{ gap: 10, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', gap: 2, height: 12, width: 132 }}>
          {MARK.map(([status, flex]) => (
            <View key={status} style={{ flex, borderRadius: 2, backgroundColor: statusColor(t, status) }} />
          ))}
        </View>
        <Text style={{ color: t.text, fontSize: 38, lineHeight: 40, letterSpacing: -1.5, ...F.bold }}>
          Agente de Proyectos
        </Text>
        <Body muted>Seguimiento de actividades y decisiones sobre las propuestas de los agentes.</Body>
      </View>

      <Text style={[styles.label, { color: t.muted }]}>Usuario</Text>
      <TextInput
        style={input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={t.muted}
      />
      <Text style={[styles.label, { color: t.muted }]}>Contraseña</Text>
      <TextInput
        style={input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        onSubmitEditing={submit}
        placeholderTextColor={t.muted}
      />
      <View style={styles.rememberRow}>
        <Switch
          value={remember}
          onValueChange={setRemember}
          trackColor={{ true: t.primary, false: t.border }}
          thumbColor={t.card}
        />
        <Text style={{ color: t.text, fontSize: 14 }}>Recordar mi usuario</Text>
      </View>
      {error && <ErrorBox message={error} />}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Button label="Ingresar" onPress={submit} loading={busy} disabled={!username || !password} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
  label: { fontSize: 13, marginTop: 4, ...F.semi },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    minHeight: 48,
    fontSize: 16,
    ...F.regular,
  },
});
