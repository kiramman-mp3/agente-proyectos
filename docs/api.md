# Referencia de la API

La API es REST con JSON. Con el backend en marcha, la documentación interactiva (OpenAPI) está en `/docs`; en
producción: <https://agente-proyectos.azurewebsites.net/docs>.

## Autenticación

1. `POST /auth/login` con `{"username": "...", "password": "..."}` devuelve un token.
2. El resto de las peticiones envían la cabecera `Authorization: Bearer <token>`.
3. El token caduca a las `JWT_EXPIRE_HOURS` horas (12 por defecto); tras eso hay que iniciar sesión de nuevo.

```bash
curl -s https://agente-proyectos.azurewebsites.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<usuario>","password":"<contraseña>"}'
```

Respuesta: `{"token", "username", "role", "full_name", "must_change_password"}`. Si `must_change_password` es
`true`, la app obliga a cambiar la contraseña antes de seguir.

## Permisos por rol

| Permiso | `gestor` | `desarrollador` |
|---|:---:|:---:|
| `read` (consultar) | ✅ | ✅ |
| `decide` (aprobar, rechazar, pedir cambios) | ✅ | ❌ |
| `run` (sincronizar y lanzar procesos) | ✅ | ❌ |
| `users` (administrar usuarios) | ✅ | ❌ |

Los roles heredados `admin` y `observador` equivalen a `gestor` y `desarrollador`.

## Endpoints

### Sesión y usuarios

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/health` | pública | Comprobación de estado: `{"ok": true}` |
| POST | `/auth/login` | pública | Inicia sesión |
| GET | `/auth/me` | sesión | Datos del usuario actual |
| POST | `/auth/change-password` | sesión | Cambia la contraseña (`current_password`, `new_password` de 8+ caracteres) |
| GET | `/users` | `users` | Lista los usuarios |
| POST | `/users` | `users` | Crea un usuario; devuelve una contraseña temporal |
| PATCH | `/users/{uid}` | `users` | Edita nombre, correo, rol o estado activo |
| POST | `/users/{uid}/reset-password` | `users` | Genera una contraseña temporal nueva |

### Seguimiento

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/dashboard` | `read` | Resumen, actividades que requieren atención, decisiones pendientes, avisos sin leer, tareas y estado de credenciales |
| GET | `/activities` | `read` | Actividades; filtro opcional `?status=` |
| POST | `/sync` | `run` | Sincroniza con Trello |
| GET | `/changes` | `read` | Cambios detectados entre sincronizaciones (`?limit=`, máximo 500) |
| POST | `/analysis/run` | `run` | Lanza el análisis de retrasos en segundo plano |
| GET | `/analysis/status` | `read` | Estado del último análisis |

### Propuestas

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/proposals` | `read` | Lista de propuestas; filtro opcional `?status=` |
| GET | `/proposals/{pid}` | `read` | Detalle con historial y alternativas |
| POST | `/proposals/{pid}/approve` | `decide` | Aprueba y ejecuta (`{"comment": "..."}` opcional) |
| POST | `/proposals/{pid}/reject` | `decide` | Rechaza |
| POST | `/proposals/{pid}/request-changes` | `decide` | Pide una nueva versión (el comentario es obligatorio) |

### Código, reportes y bitácora

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/code-reviews`, `/code-reviews/{rid}` | `read` | Revisiones de código |
| POST | `/code-reviews/run` | `run` | Lanza una revisión |
| GET | `/reports`, `/reports/{rid}` | `read` | Reportes semanales |
| POST | `/reports/generate` | `run` | Genera un reporte ahora |
| GET | `/audit` | `read` | Bitácora de auditoría (filtro `?actor_type=`) |
| GET | `/notifications` | `read` | Avisos |
| POST | `/notifications/read-all` | `read` | Marca todos como leídos |
| POST | `/notifications/test-email` | `users` | Envía un correo de prueba a los gestores |
| GET | `/config` | `read` | Proveedor de IA, proveedor de respaldo, modelos, política, tablero y repositorio |

### Asistente

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/chat` | `read` | Responde una pregunta sobre el estado del proyecto |

Cuerpo: `{"messages": [{"role": "user" | "assistant", "content": "..."}]}` con entre 1 y 40 mensajes; el último
debe ser del usuario. Respuesta: `{"reply": "..."}`. Detalles en [asistente-chat.md](./asistente-chat.md).

## Códigos de error

| Código | Cuándo |
|---|---|
| 400 | Dato inválido, por ejemplo un rol que no existe al crear un usuario |
| 401 | Falta el token, es inválido o caducó, o las credenciales de login son incorrectas |
| 403 | El rol no tiene el permiso requerido |
| 404 | La propuesta, el usuario o el reporte no existe |
| 409 | La propuesta ya no está pendiente, o el usuario ya existe |
| 422 | Cuerpo inválido (por ejemplo, un chat que no termina con un mensaje del usuario) |
| 502 | Falló Trello, GitHub o el proveedor de IA; el mensaje indica el motivo |
