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
*   **Las sesiones son revocables.** Cada usuario tiene una versión de token (`users.token_version`). Cambiar o
    restablecer la contraseña, cambiar el rol o desactivar al usuario la incrementa, y los tokens emitidos antes dejan
    de valer. Al cambiar su propia contraseña, el servidor devuelve un token nuevo para que esa sesión siga abierta.
*   **Límite de intentos de login:** 5 fallos por usuario en 15 minutos (y 20 por IP) bloquean el acceso con `429`.
    Los nombres inexistentes cuentan igual y la respuesta tarda lo mismo que con un usuario real, así no se puede
    averiguar qué usuarios existen. Solo se audita el fallo de usuarios que existen, para que nadie llene la bitácora
    con nombres inventados. El contador está en memoria: es válido porque la API corre en una sola instancia.
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
*   **Las decisiones del gestor son atómicas.** Aprobar, rechazar o pedir cambios usa un `UPDATE … WHERE
    status = 'pendiente_gestor'`; si dos decisiones llegan a la vez (doble toque, dos gestores), solo una gana y la
    acción en Trello o GitHub no se ejecuta dos veces. La otra recibe `409`.
*   **Comentarios automáticos saneados.** La política permite autoejecutar comentarios, cuyo texto lo genera un modelo
    que lee tarjetas de Trello (contenido externo). Antes de publicarlos se eliminan los enlaces y las menciones (`@`),
    se aplanan los saltos de línea y se limitan a 400 caracteres. Si prefieres que todo pase por una persona, quita
    `comentar` de `auto_ejecutables` en `backend/policy.json`.

## Buenas prácticas para quien opera el sistema

1.  **Rota cualquier clave que hayas pegado en un chat, un ticket o un correo.** Quedan en el historial.
2.  Usa tokens con el **mínimo permiso**: en GitHub, Contents en lectura e Issues en lectura y escritura.
3.  En OpenRouter, una clave con **límite de gasto $0** y modelos `:free` no puede generar costos.
4.  Cambia las contraseñas temporales cuanto antes y entrégalas por un canal privado.
5.  No subas archivos `.env`, `settings.json` ni exportaciones de variables al repositorio.
6.  El backend en Azure está configurado como **solo HTTPS** (`httpsOnly`), con TLS 1.2 mínimo y FTPS únicamente, y la
    app Android ya no permite tráfico sin cifrar (`usesCleartextTraffic: false`). Si apuntas la app a un backend
    local por HTTP, activa esa opción solo para desarrollo.
6a. `/docs` y `/openapi.json` están desactivados en producción (`ENABLE_DOCS=false`).
7.  Haz copias de seguridad de la base de Neon si los datos son importantes.

## Qué revisar en una auditoría

| Pregunta | Dónde mirar |
|---|---|
| ¿Quién aprobó una acción? | Pestaña **Bitácora** o tabla `audit_log` |
| ¿Qué credenciales están configuradas? | `GET /dashboard` (campo `credentials`) o `python -m app.cli secrets` |
| ¿Qué política rige las acciones? | `backend/policy.json` y `GET /config` |
| ¿Qué datos se purgan y cuándo? | `backend/app/retention.py` y las variables `*_RETENTION_DAYS`; la purga queda en la bitácora (`purga_datos_antiguos`) |
| ¿Quién tiene acceso? | Pantalla **Usuarios** de la app o `GET /users` |
