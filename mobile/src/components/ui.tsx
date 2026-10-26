import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { F, RADIUS, statusColor, useTheme } from '@/lib/theme';

import { Text } from './Text';

/** Ancho máximo del contenido: en tablets y ventanas grandes se centra en vez de estirarse. */
export const CONTENT_MAX_WIDTH = 760;

/** Carga datos al enfocar la pantalla y permite refrescar con gesto. */
export function useLoader<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fn]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, reload: load };
}

/** Botón flotante que abre el asistente; se ancla a la esquina inferior derecha del área de contenido. */
export function ChatFab() {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/chat')}
      accessibilityLabel="Abrir el asistente"
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: t.primary, shadowColor: '#000' },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Ionicons name="chatbubble-ellipses" size={26} color={t.primaryText} />
    </Pressable>
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  chatFab,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  chatFab?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16, gap: 12, paddingBottom: chatFab ? 96 : 32,
          width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center',
        }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
      {chatFab && <ChatFab />}
    </View>
  );
}

/** `accent` pinta una franja lateral con el color del estado de la tarjeta. */
export function Card({
  children,
  style,
  onPress,
  accent,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accent?: string;
}) {
  const t = useTheme();
  const base = [
    styles.card,
    { backgroundColor: t.card, borderColor: t.border },
    accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: 16, lineHeight: 22, ...F.semi }, style]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: muted ? t.muted : t.text, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Section({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.text, fontSize: 17, letterSpacing: -0.2, marginTop: 14, ...F.bold }}>
      {Array.isArray(children) ? children.join('') : String(children)}
    </Text>
  );
}

/** Sello: etiqueta rectangular con borde del color del estado. */
export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, letterSpacing: 0.2, ...F.semi }}>{label}</Text>
    </View>
  );
}

const RIBBON_ORDER = ['completada', 'en_ejecucion', 'pendiente', 'bloqueada', 'retrasada'] as const;

/** Cinta segmentada: cada tramo mide lo que pesa su estado dentro del total de actividades. */
export function StatusRibbon({ counts }: { counts: Record<string, number> }) {
  const t = useTheme();
  const parts = RIBBON_ORDER.filter((k) => (counts[k] ?? 0) > 0);
  return (
    <View
      style={{ flexDirection: 'row', gap: 2, height: 14, width: '100%' }}
      accessibilityLabel={parts.map((k) => `${counts[k]} ${k.replace('_', ' ')}`).join(', ')}
    >
      {parts.length === 0 && <View style={{ flex: 1, backgroundColor: t.track, borderRadius: 2 }} />}
      {parts.map((k) => (
        <View key={k} style={{ flex: counts[k], backgroundColor: statusColor(t, k), borderRadius: 2 }} />
      ))}
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.track, { backgroundColor: t.track }]}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: color ?? t.primary }} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : 'transparent';
  const fg = variant === 'secondary' ? t.primary : t.primaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? t.primary : bg },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 15, ...F.semi }}>{label}</Text>}
    </Pressable>
  );
}

export function ErrorBox({ message }: { message: string }) {
  const t = useTheme();
  return (
    <Card accent={t.danger}>
      <Body style={{ color: t.danger }}>{message}</Body>
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <Card style={{ paddingVertical: 20 }}>
      <Body muted>{text}</Body>
    </Card>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: 1, padding: 14, gap: 6 },
  badge: {
    borderWidth: 1.5,
    borderRadius: RADIUS.stamp,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.control,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
