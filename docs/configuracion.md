# Configuración

El backend lee su configuración de **variables de entorno** (en local, del archivo `backend/.env`; en Azure, de los
*app settings*). La plantilla está en `backend/.env.example`. Las credenciales de terceros (Trello, GitHub, IA) se
guardan **cifradas** en la base de datos, no en el `.env`.

## Variables de entorno

### Núcleo y base de datos

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `MASTER_KEY` | Clave Fernet que cifra las credenciales. Se genera con `python -m app.cli gen-key`. **Si se pierde o cambia, las credenciales guardadas no se pueden descifrar.** | *(requerida)* |
| `JWT_SECRET` | Secreto con el que se firman los tokens de sesión | *(requerida)* |
| `JWT_EXPIRE_HOURS` | Duración de la sesión | `12` |
| `DATABASE_URL` | URL de PostgreSQL (por ejemplo Neon). Vacío: SQLite local | *(vacío)* |
| `DB_PATH` | Ruta del archivo SQLite cuando no hay `DATABASE_URL` | `data/agente.db` |
| `TIMEZONE` | Zona horaria de los reportes y las tareas | `America/Guayaquil` |
| `APP_URL` | URL pública del backend | *(vacío)* |

### Seguridad y operación

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `ENABLE_DOCS` | Publica `/docs` y `/openapi.json`. Déjala en `false` en producción | `false` |
| `LOGIN_MAX_ATTEMPTS` | Intentos fallidos de login por usuario dentro de la ventana (por IP se admiten 4 veces más) | `5` |
| `LOGIN_WINDOW_SECONDS` | Duración de la ventana de intentos y del bloqueo | `900` |
| `AUDIT_RETENTION_DAYS` | Días que se conserva la bitácora de auditoría. `0`: para siempre | `0` |
| `SNAPSHOT_RETENTION_DAYS` | Días que se conservan las copias del tablero (siempre queda la más reciente). `0`: sin purga | `90` |
| `CHANGES_RETENTION_DAYS` | Días que se conservan los cambios de planificación detectados | `180` |
| `NOTIFICATION_RETENTION_DAYS` | Días que se conservan los avisos **ya leídos** | `90` |
| `KEEPALIVE_URL` | Opcional: el backend se llama a sí mismo cada 10 minutos (solo para hostings que duermen el servicio). No hace falta con Always On | *(vacío)* |

**Arranque seguro:** el backend no arranca si falta `MASTER_KEY` o `JWT_SECRET`, o si `JWT_SECRET` tiene menos de 32
caracteres. Así el error se ve al desplegar, no como un `500` al primer login.

### Proveedor de IA

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `LLM_PROVIDER` | Proveedor principal: `openrouter` o `gemini` | `openrouter` |
| `MODEL_EXECUTOR` | Modelo del Agente Ejecutor | `anthropic/claude-sonnet-4.5` |
| `MODEL_REVIEWER` | Modelo del Agente Revisor y del asistente de chat | `openai/gpt-4.1-mini` |
| `MODEL_APPROVER` | Modelo del Agente Aprobador | `openai/gpt-4.1-mini` |
| `LLM_FALLBACK_PROVIDER` | Proveedor de respaldo. Vacío: sin respaldo | *(vacío)* |
| `FALLBACK_MODEL_EXECUTOR` / `_REVIEWER` / `_APPROVER` | Modelo equivalente en el proveedor de respaldo | *(vacío)* |

Cada proveedor nombra distinto sus modelos: con OpenRouter llevan prefijo (`google/gemini-3.5-flash`, catálogo en
<https://openrouter.ai/models>) y con Gemini directo van sin prefijo (`gemini-3.5-flash`, catálogo en
<https://ai.google.dev/gemini-api/docs/models>).

### Trello y GitHub

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `TRELLO_BOARD_ID` | Identificador del tablero (en la URL `trello.com/b/<ID>/…`) | *(requerida)* |
| `LISTS_PENDING` | Listas que cuentan como pendientes (separadas por coma) | `Pendiente,Por hacer,To Do,Backlog` |
| `LISTS_IN_PROGRESS` | Listas «en ejecución» | `En progreso,En ejecución,Doing,In Progress` |
| `LISTS_DONE` | Listas «completadas» | `Hecho,Completado,Terminado,Done` |
| `LISTS_BLOCKED` | Listas «bloqueadas» | `Bloqueado,Blocked` |
| `BLOCKED_LABEL` | Etiqueta que marca una tarjeta como bloqueada | `Bloqueado` |
| `PRIORITY_LABELS` | Etiquetas de prioridad, de mayor a menor | `Alta,Media,Baja` |
| `GITHUB_REPO` | Repositorio a revisar (`usuario/repo`) | *(requerida)* |
| `GITHUB_BRANCH` | Rama a revisar; usa la de integración, no la de producción | `main` |
| `RISK_DAYS` | Días antes del vencimiento a partir de los cuales una actividad está «en riesgo» | `3` |

### Planificador

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `SCHEDULER_ENABLED` | Activa las tareas automáticas | `true` |
| `ANALYSIS_INTERVAL_MINUTES` | Frecuencia del análisis de retrasos | `60` |
| `CODE_REVIEW_INTERVAL_HOURS` | Frecuencia de la revisión de código | `24` |
| `REPORT_DAY` / `REPORT_HOUR` | Día (`mon`…`sun`) y hora del reporte semanal | `mon` / `8` |

### Correo a los gestores

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `MAIL_TRANSPORT` | `smtp`, `apps_script` o vacío (desactivado) | *(vacío)* |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | Datos SMTP (Gmail con contraseña de aplicación) | `smtp.gmail.com` / `465` / *(vacío)* |
| `MAIL_WEBHOOK_URL` | URL del relé de Google Apps Script | *(vacío)* |

Los avisos llegan al correo de los usuarios con rol **gestor**. Muchos proveedores de hosting bloquean los puertos
SMTP; en ese caso usa el relé HTTPS (`backend/deploy/apps_script_mailer.gs`).

### Usuario inicial (solo despliegues en la nube)

| Variable | Descripción |
|---|---|
| `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` | Crean el gestor inicial **solo si no existe**. Después, las contraseñas se administran desde la app. La contraseña debe tener 8 caracteres o más. |
| `BOOTSTRAP_ROLE` | Rol del usuario inicial (`gestor` por defecto) |
| `BOOTSTRAP_FULL_NAME`, `BOOTSTRAP_EMAIL` | Nombre y correo del usuario inicial |

## Credenciales cifradas

Se guardan con el CLI (se piden sin mostrarse en pantalla):

```powershell
python -m app.cli set-secret openrouter_api_key
python -m app.cli set-secret gemini_api_key
python -m app.cli set-secret trello_api_key
python -m app.cli set-secret trello_token
python -m app.cli set-secret github_token
python -m app.cli secrets      # muestra cuáles están configuradas
```

En despliegues donde el disco no persiste, no hace falta el CLI: en cada arranque `bootstrap.py` toma estas
variables de entorno, las cifra con `MASTER_KEY` y las guarda en la base: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`,
`TRELLO_API_KEY`, `TRELLO_TOKEN`, `GITHUB_TOKEN`, `SMTP_PASSWORD` y `MAIL_WEBHOOK_SECRET`.

El panel de la app avisa si falta alguna credencial necesaria. Se exigen las del proveedor de IA **principal** y las
del de **respaldo**, si hay uno.

## Proveedor de IA con respaldo

El principal se usa siempre primero. Si falla por límite de cuota (429), saturación (5xx), error de red o credencial
ausente, la misma llamada se repite con el proveedor de respaldo y el modelo equivalente del mismo rol.

*   Con respaldo configurado, el principal reintenta solo una vez (3 s) en lugar de esperar más de un minuto.
*   Cada fallback queda en el log con el aviso `Proveedor de IA '<nombre>' falló … se usa el respaldo`.
*   Si fallan los dos, el error resultante menciona ambos.

Configuración usada en producción (modelos gratuitos de OpenRouter con Gemini de respaldo):

```text
LLM_PROVIDER=openrouter
MODEL_EXECUTOR=nvidia/nemotron-3.5-super-vl:free
MODEL_REVIEWER=nvidia/nemotron-3.5-super-vl:free
MODEL_APPROVER=nvidia/nemotron-3.5-super-vl:free
LLM_FALLBACK_PROVIDER=gemini
FALLBACK_MODEL_EXECUTOR=gemini-3.8-flash
FALLBACK_MODEL_REVIEWER=gemini-3.5-flash
FALLBACK_MODEL_APPROVER=gemini-3.5-flash
```

### Modelos gratuitos de OpenRouter

*   Los modelos cuyo identificador termina en `:free` no consumen crédito, así que funcionan con una clave con
    **límite de gasto de $0**. Ese límite es una protección útil: la clave nunca podrá cobrar.
*   Si configuras un modelo **de pago** con una clave de límite $0, OpenRouter responde `403 Key limit exceeded`.
*   Los modelos gratuitos tienen límites de uso por modelo y a veces responden `429` («temporalmente limitado»).
    Para eso está el proveedor de respaldo.
*   Hay modelos gratuitos que no sirven para este uso (por ejemplo, algunos solo están disponibles en «agentic
    harnesses»). Prueba que devuelvan JSON válido antes de asignarlos: `python -m app.cli check` ejecuta una
    comprobación contra los tres modelos.

## Políticas y estándares

*   `backend/policy.json`: reglas del Agente Aprobador (ver [flujo-multiagente.md](./flujo-multiagente.md)).
*   `backend/standards.md`: estándares de programación del equipo que usa la revisión de código. Edítalo con las
    normas propias del proyecto.
