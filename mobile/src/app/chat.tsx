import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { Markdown } from '@/components/Markdown';
import { Text } from '@/components/Text';
import { Body, CONTENT_MAX_WIDTH } from '@/components/ui';
import { api, ChatMessage } from '@/lib/api';
import { F, RADIUS, useTheme } from '@/lib/theme';

const SUGGESTIONS = [
  '¿Cómo va el avance general?',
  '¿Qué actividades están retrasadas o en riesgo?',
  '¿Qué propuestas esperan mi decisión?',
  '¿Qué dice el último reporte semanal?',
];

type Item = ChatMessage & { failed?: boolean };

export default function ChatScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Item>>(null);
  // En pantallas anchas el chat se centra: el margen lateral reparte lo que sobra del ancho máximo.
  const { width } = useWindowDimensions();
  const side = Math.max(0, (width - CONTENT_MAX_WIDTH) / 2);

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    // Los mensajes fallidos no se reenvían al servidor como historial.
    const history: ChatMessage[] = [...items.filter((m) => !m.failed), { role: 'user', content }];
    setItems((prev) => [...prev, { role: 'user', content }]);
    setText('');
    setBusy(true);
    try {
      const { reply } = await api.chat(history);
      setItems((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) => [...prev, { role: 'assistant', content: msg, failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  const empty = items.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, paddingHorizontal: 16 + side, gap: 10, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          empty ? (
            <View style={{ gap: 6, marginBottom: 12 }}>
              <Text style={{ color: t.text, fontSize: 26, letterSpacing: -0.8, ...F.bold }}>Pregunta por el proyecto</Text>
              <Body muted>
                Respondo con los datos del último sync de Trello, las propuestas, el reporte semanal y la revisión de
                código. No puedo cambiar nada: solo consultar.
              </Body>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.role === 'user' ? (
            <View style={[styles.bubble, styles.mine, { backgroundColor: t.primary }]}>
              <Text style={{ color: t.primaryText, fontSize: 15, lineHeight: 21 }}>{item.content}</Text>
            </View>
          ) : (
            <View
              style={[
                styles.bubble,
                styles.theirs,
                { backgroundColor: t.card, borderColor: item.failed ? t.danger : t.border },
              ]}
            >
              {item.failed ? <Text style={{ color: t.danger, fontSize: 14, lineHeight: 20 }}>{item.content}</Text> : <Markdown>{item.content}</Markdown>}
            </View>
          )
        }
        ListFooterComponent={
          busy ? (
            <View style={[styles.bubble, styles.theirs, { backgroundColor: t.card, borderColor: t.border }]}>
              <ActivityIndicator color={t.primary} />
            </View>
          ) : null
        }
      />

      {empty && (
        <View style={[styles.chips, { paddingHorizontal: 16 + side }]}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => void send(s)}
              style={({ pressed }) => [styles.chip, { borderColor: t.primary }, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ color: t.primary, fontSize: 13, ...F.semi }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.composer, { backgroundColor: t.card, borderTopColor: t.border, paddingHorizontal: 10 + side }]}>
        <TextInput
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
          value={text}
          onChangeText={setText}
          placeholder="Escribe tu pregunta"
          placeholderTextColor={t.muted}
          multiline
          maxLength={1500}
        />
        <Pressable
          onPress={() => void send(text)}
          disabled={busy || !text.trim()}
          accessibilityLabel="Enviar"
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: t.primary },
            (busy || !text.trim()) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="arrow-up" size={22} color={t.primaryText} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '92%', borderRadius: RADIUS.card, paddingHorizontal: 12, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start', borderWidth: 1 },
  chips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'flex-start' },
  chip: { borderWidth: 1.5, borderRadius: RADIUS.control, paddingHorizontal: 12, paddingVertical: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    ...F.regular,
  },
  send: { width: 44, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
});
