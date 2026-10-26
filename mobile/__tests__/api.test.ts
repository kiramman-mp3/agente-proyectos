// SecureStore en memoria: las pruebas no tocan el almacenamiento del sistema.
const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));

import { api, ApiError, login, setUnauthorizedHandler } from '@/lib/api';

type FetchInit = { headers?: Record<string, string>; signal?: AbortSignal; body?: string };

const session = { token: 'token-viejo', username: 'johan', role: 'gestor' };

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

let fetchMock: jest.Mock;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('sesión', () => {
  it('inicia sesión, guarda el token y lo envía en las siguientes peticiones', async () => {
    fetchMock.mockImplementationOnce(() => respond(200, session)).mockImplementationOnce(() => respond(200, {}));
    await login('johan', 'clave');
    expect(JSON.parse(store.session).token).toBe('token-viejo');

    await api.dashboard();
    const init = fetchMock.mock.calls[1][1] as FetchInit;
    expect(init.headers?.Authorization).toBe('Bearer token-viejo');
  });

  it('muestra el mensaje del servidor cuando el login se bloquea por demasiados intentos', async () => {
    fetchMock.mockImplementationOnce(() => respond(429, { detail: 'Demasiados intentos fallidos. Intenta de nuevo en 15 min.' }));
    await expect(login('johan', 'mal')).rejects.toMatchObject({ status: 429, message: expect.stringContaining('15 min') });
  });

  it('un 401 fuera del login cierra la sesión; en el login no', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    fetchMock.mockImplementationOnce(() => respond(401, { detail: 'Usuario o contraseña incorrectos' }));
    await expect(login('johan', 'mal')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();

    fetchMock.mockImplementationOnce(() => respond(200, session)).mockImplementationOnce(() => respond(401, { detail: 'Sesión inválida' }));
    await login('johan', 'clave');
    await expect(api.dashboard()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('al cambiar la contraseña guarda el token nuevo y lo usa a partir de ahí', async () => {
    fetchMock
      .mockImplementationOnce(() => respond(200, session))
      .mockImplementationOnce(() => respond(200, { ok: true, token: 'token-nuevo' }))
      .mockImplementationOnce(() => respond(200, {}));
    await login('johan', 'clave');
    await api.changePassword('clave', 'otra-clave-1');
    expect(JSON.parse(store.session).token).toBe('token-nuevo');

    await api.dashboard();
    expect((fetchMock.mock.calls[2][1] as FetchInit).headers?.Authorization).toBe('Bearer token-nuevo');
  });
});

describe('tiempo máximo de espera', () => {
  // Un fetch que nunca responde y se corta cuando se aborta la señal, como el real.
  const hanging = (_url: string, init: FetchInit) =>
    new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => {
        const err = new Error('abortado');
        err.name = 'AbortError';
        reject(err);
      });
    });

  it('corta una petición normal a los 30 s con un mensaje claro', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hanging);
    const result = api.dashboard();
    const assertion = expect(result).rejects.toMatchObject({ status: 0, message: expect.stringContaining('tardó demasiado') });
    await jest.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('el chat espera más que una petición normal', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hanging);
    let settled = false;
    const result = api.chat([{ role: 'user', content: 'hola' }]).catch((e) => {
      settled = true;
      return e;
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false); // a los 60 s todavía espera
    await jest.advanceTimersByTimeAsync(90_000);
    expect(await result).toMatchObject({ status: 0 });
  });

  it('distingue la falta de conexión del tiempo agotado', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Network request failed')));
    await expect(api.dashboard()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('No se pudo conectar') });
  });
});
