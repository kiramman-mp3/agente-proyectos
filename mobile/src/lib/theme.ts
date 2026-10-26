import { useColorScheme } from 'react-native';

// Paleta "papel y sello": papel verdoso, tinta de pino y bermellón reservado para retrasos y peligro.
const light = {
  bg: '#ECEFE8',
  card: '#F9FAF6',
  text: '#12251F',
  muted: '#58675F',
  border: '#CBD3C9',
  primary: '#0F6B57',
  primaryText: '#F9FAF6',
  success: '#0F6B57',
  warning: '#9A6200',
  danger: '#C23B22',
  info: '#2F5F86',
  neutral: '#6F7D75',
  track: '#D5DCD2',
};

const dark: typeof light = {
  bg: '#0D1814',
  card: '#14221C',
  text: '#E4EBE5',
  muted: '#97A79D',
  border: '#2A3B33',
  primary: '#5FC5A4',
  primaryText: '#0D1814',
  success: '#5FC5A4',
  warning: '#E3B04B',
  danger: '#F0735C',
  info: '#7AAEDB',
  neutral: '#82918A',
  track: '#2A3B33',
};

/** Schibsted Grotesk: con fuentes personalizadas el grosor se elige por familia, no por fontWeight. */
export const F = {
  regular: { fontFamily: 'SchibstedGrotesk_400Regular' },
  semi: { fontFamily: 'SchibstedGrotesk_600SemiBold' },
  bold: { fontFamily: 'SchibstedGrotesk_800ExtraBold' },
} as const;

export const RADIUS = { card: 6, control: 8, stamp: 4 } as const;

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_ejecucion: 'En ejecución',
  completada: 'Completada',
  retrasada: 'Retrasada',
  bloqueada: 'Bloqueada',
};

export function statusColor(t: Theme, status: string): string {
  return (
    { pendiente: t.neutral, en_ejecucion: t.info, completada: t.success, retrasada: t.danger, bloqueada: t.warning }[
      status
    ] ?? t.neutral
  );
}

export const ROLE_LABEL: Record<string, string> = {
  gestor: 'Gestor del proyecto',
  desarrollador: 'Desarrollador',
  admin: 'Gestor del proyecto',
  observador: 'Desarrollador',
};

export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  en_revision: 'En revisión',
  rechazada_revisor: 'Rechazada por Revisor',
  denegada_aprobador: 'Denegada por Aprobador',
  pendiente_gestor: 'Pendiente de tu decisión',
  aprobada: 'Aprobada',
  auto_aprobada: 'Autorizada por política',
  rechazada_gestor: 'Rechazada por gestor',
  modificacion_solicitada: 'Modificación solicitada',
  ejecutada: 'Ejecutada',
  fallida: 'Falló la ejecución',
  descartada: 'Descartada',
};

export function proposalColor(t: Theme, status: string): string {
  if (status === 'pendiente_gestor') return t.warning;
  if (status === 'ejecutada' || status === 'aprobada' || status === 'auto_aprobada') return t.success;
  if (status.startsWith('rechazada') || status === 'denegada_aprobador' || status === 'fallida') return t.danger;
  return t.neutral;
}

export const ACTION_LABEL: Record<string, string> = {
  reprogramar: 'Reprogramar',
  cambiar_prioridad: 'Cambiar prioridad',
  reasignar: 'Reasignar responsables',
  cambiar_estado: 'Cambiar estado',
  comentar: 'Comentar en tarjeta',
  crear_issue: 'Crear issue en GitHub',
};

export function severityColor(t: Theme, s: string): string {
  return { critica: t.danger, alta: t.danger, media: t.warning, baja: t.neutral }[s] ?? t.neutral;
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}
