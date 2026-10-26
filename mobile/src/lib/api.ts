import * as SecureStore from 'expo-secure-store';

// Dirección fija del backend (Azure App Service): la app ya no pide el servidor al iniciar sesión.
export const SERVER_URL = 'https://agente-proyectos.azurewebsites.net';
const REMEMBERED_USER_KEY = 'remembered_username';
const SESSION_KEY = 'session';

export type Role = 'gestor' | 'desarrollador' | 'admin' | 'observador';
export type Session = {
  token: string;
  username: string;
  role: Role;
  full_name?: string | null;
  must_change_password?: boolean;
};

export type User = {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  active: number;
  must_change_password: number;
  created_at: string;
};

export type ActivityStatus = 'pendiente' | 'en_ejecucion' | 'completada' | 'retrasada' | 'bloqueada';

export type Activity = {
  id: string;
  name: string;
  url: string;
  list: string;
  responsables: string[];
  labels: string[];
  priority: string | null;
  start: string | null;
  due: string | null;
  days_left: number | null;
  status: ActivityStatus;
  progress: number;
  at_risk: boolean;
  risk_reasons: string[];
  blocks: string[];
  description: string;
};

export type Summary = {
  total: number;
  counts: Record<ActivityStatus, number>;
  progress_weighted: number;
  progress_completed: number;
  at_risk: number;
};

export type Dashboard = {
  board: { name: string | null; url: string | null };
  summary: Summary | null;
  last_sync: string | null;
  attention: Activity[];
  pending_decisions: number;
  unread_notifications: number;
  jobs: { id: string; next_run: string | null }[];
  credentials: Record<string, boolean>;
};

export type Proposal = {
  id: number;
  created_at: string;
  source: 'retraso' | 'codigo';
  group_key: string | null;
  action_type: string;
  target_id: string | null;
  target_name: string | null;
  params: Record<string, unknown>;
  problem: string | null;
  justification: string | null;
  impact: string | null;
  status: string;
  reviewer_verdict: string | null;
  reviewer_notes: string | null;
  approver_decision: string | null;
  approver_risk: string | null;
  approver_notes: string | null;
  manager: string | null;
  manager_comment: string | null;
  decided_at: string | null;
  executed_at: string | null;
  execution_result: string | null;
  revision_of: number | null;
  history?: AuditEntry[];
  alternatives?: { id: number; action_type: string; status: string }[];
};

export type AuditEntry = {
  id: number;
  ts: string;
  actor: string;
  actor_type: 'agente' | 'humano' | 'sistema';
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
};

export type Finding = {
  archivo: string;
  linea: number | null;
  categoria: string;
  severidad: 'baja' | 'media' | 'alta' | 'critica';
  descripcion: string;
  recomendacion: string;
  estandar_incumplido?: string | null;
  comentario_revisor?: string | null;
};

export type CodeReviewSummary = {
  id: number;
  created_at: string;
  repo: string;
  commit_from: string;
  commit_to: string;
  score: number;
  summary: string;
  findings_count: number;
  severe_count: number;
};

export type CodeReview = CodeReviewSummary & {
  findings: Finding[];
  commits: { sha: string; autor: string; fecha: string; mensaje: string }[];
  review_notes: string;
};

export type ReportSummary = { id: number; created_at: string; period_start: string; period_end: string };
export type Report = ReportSummary & { content_md: string; review_notes: string };

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type Notification = {
  id: number;
  created_at: string;
  level: 'info' | 'advertencia' | 'critico';
  title: string;
  body: string;
  entity: string | null;
  entity_id: string | null;
  read: number;
};

export type ProcessStatus = {
  running: boolean;
  last: { ok: boolean; result?: { problemas: number; propuestas: number }; error?: string; finished_at: string } | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let cachedSession: Session | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function getRememberedUsername(): Promise<string | null> {
  return SecureStore.getItemAsync(REMEMBERED_USER_KEY);
}

export async function setRememberedUsername(username: string | null) {
  if (username) await SecureStore.setItemAsync(REMEMBERED_USER_KEY, username);
  else await SecureStore.deleteItemAsync(REMEMBERED_USER_KEY);
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  cachedSession = raw ? (JSON.parse(raw) as Session) : null;
  return cachedSession;
}

export async function updateSession(patch: Partial<Session>) {
  if (!cachedSession) return null;
  cachedSession = { ...cachedSession, ...patch };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(cachedSession));
  return cachedSession;
}

export async function clearSession() {
  cachedSession = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

// Tiempo máximo de espera por petición. El chat y las acciones que usan IA necesitan más margen.
const DEFAULT_TIMEOUT_MS = 30_000;
const SLOW_TIMEOUT_MS = 150_000;

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const base = SERVER_URL.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cachedSession) headers.Authorization = `Bearer ${cachedSession.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...(init.headers as object) },
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(0, 'El servidor tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.');
    }
    throw new ApiError(0, `No se pudo conectar con ${base}`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized?.();
    throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : `Error ${res.status}`);
  }
  return body as T;
}

export async function login(username: string, password: string): Promise<Session> {
  cachedSession = null;
  const session = await request<Session>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  cachedSession = session;
  return session;
}

const post = <T,>(path: string, body: object = {}, timeoutMs?: number) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);

export const api = {
  chat: (messages: ChatMessage[]) => post<{ reply: string }>('/chat', { messages }, SLOW_TIMEOUT_MS),
  dashboard: () => request<Dashboard>('/dashboard'),
  activities: () => request<Activity[]>('/activities'),
  sync: () => post<{ changes: number }>('/sync'),
  runAnalysis: () => post<{ status: string }>('/analysis/run'),
  analysisStatus: () => request<ProcessStatus>('/analysis/status'),
  proposals: (status?: string) => request<Proposal[]>(`/proposals${status ? `?status=${status}` : ''}`),
  proposal: (id: number) => request<Proposal>(`/proposals/${id}`),
  approve: (id: number, comment?: string) => post<{ status: string }>(`/proposals/${id}/approve`, { comment }),
  reject: (id: number, comment?: string) => post<{ status: string }>(`/proposals/${id}/reject`, { comment }),
  requestChanges: (id: number, comment: string) =>
    post<{ status: string }>(`/proposals/${id}/request-changes`, { comment }),
  codeReviews: () => request<CodeReviewSummary[]>('/code-reviews'),
  codeReview: (id: number) => request<CodeReview>(`/code-reviews/${id}`),
  runCodeReview: () => post<{ status: string }>('/code-reviews/run'),
  reports: () => request<ReportSummary[]>('/reports'),
  report: (id: number) => request<Report>(`/reports/${id}`),
  generateReport: () => post<{ status: string }>('/reports/generate'),
  audit: (actorType?: string) => request<AuditEntry[]>(`/audit${actorType ? `?actor_type=${actorType}` : ''}`),
  notifications: () => request<Notification[]>('/notifications'),
  readAllNotifications: () => post('/notifications/read-all'),
  me: () => request<User>('/auth/me'),
  changePassword: async (current_password: string, new_password: string) => {
    const res = await post<{ ok: boolean; token?: string }>('/auth/change-password', { current_password, new_password });
    // El servidor invalida los tokens anteriores y entrega uno nuevo para no cerrar esta sesión.
    if (res.token) await updateSession({ token: res.token });
    return res;
  },
  users: () => request<User[]>('/users'),
  createUser: (body: { username: string; full_name?: string; email?: string; role: Role }) =>
    post<User & { temporary_password: string }>('/users', body),
  updateUser: (id: number, body: Partial<{ full_name: string; email: string; role: Role; active: boolean }>) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetPassword: (id: number) =>
    post<{ username: string; temporary_password: string }>(`/users/${id}/reset-password`),
};
