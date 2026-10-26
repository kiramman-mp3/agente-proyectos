# Seguridad

## Roles y permisos

| Rol | Puede |
|---|---|
| **gestor** | Consultar, decidir sobre propuestas, lanzar procesos (sincronizar, analizar, revisar código, generar reportes) y administrar usuarios |
| **desarrollador** | Consultar (incluido el chat) |

El permiso se comprueba en cada endpoint (ver [api.md](./api.md)). Los roles heredados `admin` y `observador` se
tratan como `gestor` y `desarrollador`.

## Contraseñas y sesiones

*   Las contraseñas se guardan con **PBKDF2-SHA256** (310 000 iteraciones y sal aleatoria). Nunca en claro.
*   Los usuarios los crea un gestor desde la app. El sistema genera una **contraseña temporal** y obliga a cambiarla
    en el primer ingreso. Un gestor puede restablecerla; la nueva también es temporal.
*   La sesión es un **JWT** firmado con `JWT_SECRET` que caduca a las `JWT_EXPIRE_HOURS` horas.
*   La app guarda el token en **Expo SecureStore** (almacenamiento cifrado del sistema). El usuario recordado se
    guarda ahí también; la contraseña no se guarda nunca.
*   Si el servidor responde `401`, la app cierra la sesión.

## Credenciales de terceros

*   Las credenciales de Trello, GitHub, OpenRouter, Gemini, SMTP y del relé de correo se guardan **cifradas con
    Fernet** (AES-128-CBC con HMAC) usando `MASTER_KEY`.
*   Las credenciales **nunca llegan a la app**. El panel solo informa si cada una está configurada o no.
*   `MASTER_KEY` y `JWT_SECRET` no deben subirse al repositorio. En Azure viven como *app settings*.
*   Si `MASTER_KEY` cambia, lo guardado deja de poder descifrarse: hay que volver a cargar las credenciales.

## Qué puede hacer el sistema sobre tus herramientas

*   Solo `backend/app/actions.py` escribe en Trello o GitHub, y únicamente con propuestas autorizadas.
*   `backend/policy.json` **prohíbe** modificar código, hacer commit o push, y eliminar o archivar tarjetas.
*   Los hallazgos graves de código se convierten en *issues* que el gestor debe aprobar. El código no se toca.
*   Todas las acciones, de agentes, personas o del sistema, quedan en `audit_log` con fecha y actor.
*   El chat es de solo lectura y no tiene herramientas para actuar.

## Buenas prácticas para quien opera el sistema

1.  **Rota cualquier clave que hayas pegado en un chat, un ticket o un correo.** Quedan en el historial.
2.  Usa tokens con el **mínimo permiso**: en GitHub, Contents en lectura e Issues en lectura y escritura.
3.  En OpenRouter, una clave con **límite de gasto $0** y modelos `:free` no puede generar costos.
4.  Cambia las contraseñas temporales cuanto antes y entrégalas por un canal privado.
5.  No subas archivos `.env`, `settings.json` ni exportaciones de variables al repositorio.
6.  Publica siempre el backend detrás de **HTTPS** (Azure App Service ya lo ofrece) y, en producción, desactiva
    `usesCleartextTraffic` en `mobile/app.json`.
7.  Haz copias de seguridad de la base de Neon si los datos son importantes.

## Qué revisar en una auditoría

| Pregunta | Dónde mirar |
|---|---|
| ¿Quién aprobó una acción? | Pestaña **Bitácora** o tabla `audit_log` |
| ¿Qué credenciales están configuradas? | `GET /dashboard` (campo `credentials`) o `python -m app.cli secrets` |
| ¿Qué política rige las acciones? | `backend/policy.json` y `GET /config` |
| ¿Quién tiene acceso? | Pantalla **Usuarios** de la app o `GET /users` |
