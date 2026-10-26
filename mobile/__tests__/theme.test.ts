import { fmtDate, proposalColor, severityColor, statusColor } from '@/lib/theme';

// El tema real depende del modo claro/oscuro; para probar la lógica basta un objeto con los colores.
const t = {
  bg: '', card: '', text: '', muted: '', border: '', primary: 'P', primaryText: '', success: 'OK', warning: 'WARN',
  danger: 'BAD', info: 'INFO', neutral: 'NEU', track: '',
};

describe('colores por estado', () => {
  it('asigna un color a cada estado de actividad y uno neutro por defecto', () => {
    expect(statusColor(t, 'completada')).toBe('OK');
    expect(statusColor(t, 'retrasada')).toBe('BAD');
    expect(statusColor(t, 'bloqueada')).toBe('WARN');
    expect(statusColor(t, 'en_ejecucion')).toBe('INFO');
    expect(statusColor(t, 'inventado')).toBe('NEU');
  });

  it('destaca lo que espera al gestor y distingue éxito de rechazo en las propuestas', () => {
    expect(proposalColor(t, 'pendiente_gestor')).toBe('WARN');
    for (const ok of ['ejecutada', 'aprobada', 'auto_aprobada']) expect(proposalColor(t, ok)).toBe('OK');
    for (const bad of ['rechazada_gestor', 'rechazada_revisor', 'denegada_aprobador', 'fallida']) {
      expect(proposalColor(t, bad)).toBe('BAD');
    }
    expect(proposalColor(t, 'en_revision')).toBe('NEU');
  });

  it('colorea la severidad de los hallazgos', () => {
    expect(severityColor(t, 'critica')).toBe('BAD');
    expect(severityColor(t, 'media')).toBe('WARN');
    expect(severityColor(t, 'baja')).toBe('NEU');
  });
});

describe('fmtDate', () => {
  it('devuelve un guion cuando no hay fecha', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('formatea una fecha en español, con o sin hora', () => {
    expect(fmtDate('2026-10-26T15:30:00Z')).toMatch(/2026/);
    expect(fmtDate('2026-10-26T15:30:00Z', true)).toMatch(/\d{2}:\d{2}/);
  });
});
