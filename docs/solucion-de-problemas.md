# Solución de problemas

## Backend en Azure

### Responde `503 Service Unavailable` después de desplegar
Revisa los logs de inicio:

```powershell
az webapp log download -g rg-agente-proyectos -n agente-proyectos --log-file logs.zip
```

En `LogFiles/StartupLogs/…containerStream.log` busca la causa. La más común:

*   **`uvicorn: not found` y `Container exited with exit code 127`:** la compilación del despliegue no terminó, así que
    no existe el entorno virtual (`antenv`) ni el manifiesto de Oryx. **Solución:** vuelve a desplegar el zip y espera
    a que `/health` responda. Comprueba también que `requirements.txt` esté en la raíz del zip.

### `az webapp deploy` termina con error o se queda esperando
El comando puede agotar su tiempo mientras la compilación sigue. Comprueba `GET /health` durante unos minutos antes
de repetir. Si sigue en 503, aplica la solución anterior.

### `/health` responde, pero la app dice «Faltan credenciales en el servidor»
Falta alguna credencial cifrada. El panel indica cuál. Cárgala como variable de entorno (`GEMINI_API_KEY`,
`OPENROUTER_API_KEY`, `TRELLO_API_KEY`, `TRELLO_TOKEN`, `GITHUB_TOKEN`); se cifra sola en el siguiente arranque.
Recuerda que se exigen las del proveedor de IA principal **y** las del de respaldo.

### `No se pudo descifrar '<nombre>': la MASTER_KEY no coincide`
La `MASTER_KEY` actual no es la que cifró las credenciales de la base. Restaura la original o vuelve a cargar las
credenciales con la clave nueva.

### Las sesiones se cierran solas tras un redespliegue
Cambió `JWT_SECRET`. Mantén el mismo valor entre despliegues.

### El login responde «Usuario o contraseña incorrectos» con el usuario inicial
`BOOTSTRAP_USERNAME` y `BOOTSTRAP_PASSWORD` solo crean el usuario si **no existe**. Si ya existía y su contraseña se
cambió desde la app, la del entorno ya no vale. Un gestor puede restablecerla desde **Usuarios**
(`POST /users/{id}/reset-password`).

## Proveedor de IA

### `Key limit exceeded` (HTTP 403) de OpenRouter
La clave tiene un límite de gasto y el modelo configurado es **de pago**. Usa un modelo `:free`, sube el límite de la
clave o configura un proveedor de respaldo.

### `429 … temporalmente limitado` de un modelo gratuito
Es un límite de uso del modelo. Si hay proveedor de respaldo se usa solo; si no, reintenta más tarde o cambia de
modelo.

### `… is only available on agentic harnesses` o respuestas sin JSON
Ese modelo no sirve para este uso. Prueba otro y valida con `python -m app.cli check`.

### El chat responde `502 El asistente no está disponible`
El proveedor principal y el de respaldo fallaron; el mensaje incluye ambos motivos. Revisa las claves
(`GET /dashboard` → `credentials`) y los nombres de los modelos de cada proveedor.

## App móvil

### En WSA, la app es una tira vertical que no se redimensiona
La orientación estaba bloqueada en vertical. Está corregida (`"orientation": "default"` en `app.json`) en los builds
nuevos; reinstala un APK reciente.

### El botón flotante, el ícono o el nombre nuevos no aparecen
Expo Go ignora el ícono y el nombre de `app.json`; se ven solo en un APK o IPA compilado. Si es un cambio de código,
reinicia Metro con `npx expo start -c` (con `CI=1` no vigila los cambios).

### `adb` muestra `unauthorized` con WSA
En la ventana de Ajustes de Android acepta el diálogo **¿Permitir la depuración USB?** y marca «Permitir siempre».

### Al pulsar «Atrás» en WSA se abre otra aplicación
Expo Go cerró su última pantalla y Android volvió a la app anterior. Abre de nuevo el enlace `exp://…` de Metro.

### La pantalla de login pide el servidor
Es una versión anterior de la app. En las versiones recientes la dirección del servidor es fija y el campo no existe; instala un APK o IPA reciente.

### No puedo instalar el IPA
El IPA no está firmado. Instálalo con AltStore (firma con tu Apple ID). Las apps firmadas con cuenta gratuita
caducan a los 7 días.

### El build de EAS se queda en `IN_QUEUE`
Es la cola del plan gratuito. Puedes cancelarlo con `npx eas-cli build:cancel <id>` y volver a lanzarlo.

## Trello y GitHub

| Síntoma | Causa probable |
|---|---|
| El panel dice «Sin sincronizar» | Falta sincronizar o no hay `TRELLO_BOARD_ID`; usa **Sincronizar** en el Panel |
| Una tarjeta aparece como pendiente cuando está hecha | El nombre de su lista no está en `LISTS_DONE`, o no tiene la fecha marcada como cumplida |
| No se detectan dependencias | La descripción no tiene una línea `Depende de: <nombre o shortLink>` |
| La revisión de código no encuentra commits | `GITHUB_REPO`/`GITHUB_BRANCH` mal configurados o el token no tiene permiso de lectura |
| No se crean *issues* | El token de GitHub necesita Issues en lectura y escritura |

## Correo

*   **No llegan los avisos:** confirma `MAIL_TRANSPORT`, que los gestores tengan correo en su perfil y prueba con
    `POST /notifications/test-email`.
*   **SMTP no funciona en el hosting:** muchos proveedores bloquean esos puertos; usa el relé de Google Apps Script.
