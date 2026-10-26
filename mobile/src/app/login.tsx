import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Body, Button, ErrorBox } from '@/components/ui';
import { getRememberedUsername, setRememberedUsername } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const { login } = useAuth();
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
      style={[styles.container, { backgroundColor: t.bg }]}
    >
      <View style={{ gap: 4, marginBottom: 16 }}>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '700' }}>Agente de Proyectos</Text>
        <Body muted>Seguimiento y control con agentes Ejecutor, Revisor y Aprobador</Body>
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
        <Switch value={remember} onValueChange={setRemember} />
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
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 46, fontSize: 15 },
});
