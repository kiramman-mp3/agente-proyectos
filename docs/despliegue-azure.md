# Despliegue en Azure

El backend corre en **Azure App Service (Linux)**. La base de datos está fuera de Azure, en **Neon** (PostgreSQL
gestionado), así que redesplegar la aplicación no pierde datos.

## Recursos actuales

| Recurso | Valor |
|---|---|
| Grupo de recursos | `rg-agente-proyectos` |
| Región | `eastus2` |
| Plan de App Service | `plan-agente-proyectos` (Linux, **B1**) |
| Aplicación web | `agente-proyectos` |
| Runtime | Python 3.11 |
| URL | <https://agente-proyectos.azurewebsites.net> |
| Comando de inicio | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| Comprobación de estado | `/health` |

*   **Solo HTTPS** (`httpsOnly`) está activado: las peticiones HTTP se redirigen. TLS mínimo 1.2 y FTPS únicamente.
*   **Always On** está activado, así que el servicio no se duerme y no hace falta ningún «keepalive» (el que tenía
    el proyecto en Render se eliminó).
*   Las suscripciones **Azure for Students** restringen las regiones permitidas (`eastus2`, `westus3`,
    `canadacentral`, `brazilsouth` y `southcentralus` en esta suscripción). Elige una de ellas.
*   Un plan B1 consume el crédito de la suscripción mientras exista, incluso sin tráfico.

## Crear el entorno desde cero

Requiere la [CLI de Azure](https://learn.microsoft.com/cli/azure/install-azure-cli) con `az login` hecho en la
suscripción correcta (`az account show`).

```powershell
$RG  = "rg-agente-proyectos"
$APP = "agente-proyectos"          # debe ser único en azurewebsites.net

az group create -n $RG -l eastus2
az appservice plan create -g $RG -n plan-agente-proyectos --is-linux --sku B1 -l eastus2
az webapp create -g $RG -p plan-agente-proyectos -n $APP --runtime "PYTHON:3.11"

az webapp update -g $RG -n $APP --https-only true

az webapp config set -g $RG -n $APP --always-on true `
  --startup-file "uvicorn app.main:app --host 0.0.0.0 --port 8000" `
  --generic-configurations '{"healthCheckPath":"/health"}'

az webapp config appsettings set -g $RG -n $APP --settings `
  WEBSITES_PORT=8000 SCM_DO_BUILD_DURING_DEPLOYMENT=true `
  APP_URL=https://$APP.azurewebsites.net
```

Los nombres de aplicación web son globales: si `agente-proyectos` está ocupado, elige otro y actualiza
`SERVER_URL` en `mobile/src/lib/api.ts`. **Una aplicación web no se puede renombrar**; para cambiar el nombre hay
que crear otra y borrar la anterior.

## Variables de entorno

Todas las variables de [configuracion.md](./configuracion.md) se cargan como *app settings*. Para cargar muchas a la
vez sin dejarlas en el historial de la consola, escríbelas en un JSON temporal fuera del repositorio:

```powershell
# settings.json: {"MASTER_KEY": "...", "JWT_SECRET": "...", "DATABASE_URL": "...", ...}
az webapp config appsettings set -g $RG -n $APP --settings "@settings.json"
Remove-Item settings.json        # bórralo al terminar
```

Reglas importantes:

*   `MASTER_KEY` y `JWT_SECRET` deben ser **los mismos** que usaba el entorno anterior. Con otra `MASTER_KEY` las
    credenciales cifradas en la base no se pueden descifrar, y con otro `JWT_SECRET` se cierran las sesiones abiertas.
*   `DATABASE_URL` apunta a Neon. Sin ella el backend usa SQLite en un disco que **no persiste**.
*   No dejes las variables en el repositorio ni en archivos `.env` versionados.

## Publicar una versión nueva

El despliegue es por **zip** desde el código local. Desde la raíz del repositorio:

```powershell
# Empaqueta lo versionado de backend/ con requirements.txt en la raíz del zip
git archive --format=zip -o $env:TEMP\backend.zip HEAD:backend
az webapp deploy -g $RG -n $APP --src-path $env:TEMP\backend.zip --type zip
```

`git archive` toma el último commit. Para desplegar cambios sin commitear, genera el zip con Python
(`zipfile`) a partir de `git ls-files -co --exclude-standard backend`. Evita `Compress-Archive` de Windows
PowerShell 5.1: escribe las rutas con barras invertidas y el zip resultante puede no desempaquetarse bien en Linux.

Puntos a tener en cuenta:

*   `requirements.txt` debe estar en la **raíz del zip**; Azure (Oryx) lo detecta y crea el entorno virtual.
*   No incluyas `.venv`, `data/` ni `.env` en el zip.
*   El comando puede tardar varios minutos y a veces termina con un error de espera aunque la compilación siga en
    curso. **Comprueba siempre** el resultado con `GET /health` antes de darlo por fallido.

### Verificación posterior

```powershell
curl https://agente-proyectos.azurewebsites.net/health        # {"ok":true}
curl https://agente-proyectos.azurewebsites.net/health/ready  # {"ok":true,"db":"ok"} (verifica la base de datos)
az webapp log tail -g $RG -n $APP                              # logs en vivo
az webapp log download -g $RG -n $APP --log-file logs.zip      # descarga los logs
```

## Qué hace el backend al arrancar

1. Abre la base de datos y crea las tablas que falten.
2. Ejecuta `bootstrap.py`: cifra las credenciales recibidas por entorno y crea el gestor inicial si no existe.
3. Inicia el planificador de tareas.

## Correo en la nube

Muchos hosting bloquean SMTP. El proyecto usa un relé HTTPS con Google Apps Script:

1. Publica `backend/deploy/apps_script_mailer.gs` como aplicación web de Apps Script.
2. Configura `MAIL_TRANSPORT=apps_script`, `MAIL_WEBHOOK_URL` y `MAIL_WEBHOOK_SECRET`.
3. Prueba con el endpoint `POST /notifications/test-email` (solo gestores).

## Automatizar el despliegue (GitHub Actions)

El repositorio incluye `.github/workflows/deploy-azure.yml`. En cada push a `main` que toque `backend/` (o al lanzarlo
a mano desde la pestaña **Actions**) ejecuta las pruebas, publica en Azure y espera a que `/health/ready` responda.

Para activarlo hay que guardar el **perfil de publicación** como secreto del repositorio. Sin él, el flujo solo
ejecuta las pruebas y deja un aviso; no falla.

```powershell
# 1. Descarga el perfil de publicación (contiene credenciales: no lo subas ni lo pegues en ningún sitio)
az webapp deployment list-publishing-profiles -g rg-agente-proyectos -n agente-proyectos --xml > perfil.xml

# 2. Guárdalo como secreto del repositorio y bórralo
gh secret set AZURE_WEBAPP_PUBLISH_PROFILE < perfil.xml
Remove-Item perfil.xml
```

Si cambias el nombre de la aplicación web, actualiza `AZURE_WEBAPP_NAME` en el workflow. Mientras uses el plan B1 con
autenticación básica por SCM habilitada, el perfil de publicación funciona; si la deshabilitas, usa el método de
inicio de sesión con OpenID Connect de `azure/login`.

## Varias instancias

El plan B1 corre con una sola instancia. Si escalas a más, las tareas programadas siguen ejecutándose una sola vez
(se reservan en la tabla `job_locks`), pero el límite de intentos de login está en memoria y cada instancia llevaría
su propia cuenta; en ese caso conviene moverlo a la base de datos.

## Problemas frecuentes

Consulta [solucion-de-problemas.md](./solucion-de-problemas.md): `503` tras desplegar, `uvicorn: not found`, tiempo
de espera del comando de despliegue y credenciales que no se descifran.
