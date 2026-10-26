# App móvil

La app está hecha con **Expo 57**, **React Native** y **TypeScript**, y usa **Expo Router** para la navegación. Está
pensada para el gestor del proyecto, pero los desarrolladores también pueden entrar con permisos de consulta.

## Pantallas

| Pantalla | Archivo | Qué muestra |
|---|---|---|
| Inicio de sesión | `src/app/login.tsx` | Usuario y contraseña, con la opción **Recordar mi usuario** |
| Cambio de contraseña | `src/app/change-password.tsx` | Se muestra tras entrar con una contraseña temporal |
| Panel | `src/app/(tabs)/index.tsx` | Porcentaje de avance, cinta de estados, decisiones pendientes y actividades que requieren atención |
| Actividades | `src/app/(tabs)/activities.tsx` | Todas las actividades con filtro por estado |
| Propuestas | `src/app/(tabs)/proposals.tsx` y `proposal/[id].tsx` | Propuestas de los agentes; el gestor aprueba, rechaza o pide cambios |
| Código | `src/app/(tabs)/code.tsx` y `code-review/[id].tsx` | Revisiones de código y sus hallazgos |
| Reportes | `src/app/(tabs)/reports.tsx` y `report/[id].tsx` | Reportes semanales |
| Asistente | `src/app/chat.tsx` | Chat para preguntar por el estado del proyecto |
| Notificaciones | `src/app/notifications.tsx` | Avisos del sistema |
| Bitácora | `src/app/audit.tsx` | Historial de lo que hicieron agentes, personas y el sistema |
| Mi cuenta / Usuarios | `src/app/account.tsx`, `users.tsx`, `user/[id].tsx` | Perfil, cambio de contraseña y (solo gestores) administración de usuarios |

El **botón flotante** de chat aparece en la esquina inferior derecha de las cinco pestañas y abre el asistente.

## Conexión con el backend

La dirección del servidor es una **constante** en `mobile/src/lib/api.ts`:

```ts
export const SERVER_URL = 'https://agente-proyectos.azurewebsites.net';
```

La pantalla de login ya no pide el servidor. Para apuntar la app a otro backend (por ejemplo uno local en
`http://192.168.1.10:8000`), cambia esa constante. Si usas HTTP sin cifrar en Android, el `app.json` ya habilita
`usesCleartextTraffic`; en producción usa HTTPS y desactiva esa opción.

La sesión (token JWT) y el usuario recordado se guardan con **Expo SecureStore**. La contraseña nunca se guarda.

## Desarrollo local

```bash
cd mobile
npm install
npx expo start            # Expo Go: escanea el QR con el teléfono en la misma red
npm run android           # emulador o dispositivo Android con adb
npm run typecheck         # verificación de tipos
```

*   La vista web (`npm run web`) **no funciona**: falta `react-native-web` y `expo-secure-store` no existe en web.
*   Con **Windows Subsystem for Android (WSA)** activa el modo desarrollador, acepta la depuración USB y conecta
    `adb connect 127.0.0.1:58526`. Luego `npx expo start --android` instala Expo Go y abre la app.
*   Si cambiaste archivos y Metro no los toma, reinícialo con `npx expo start -c`. Ejecutado con la variable `CI=1`,
    Metro no vigila los cambios.

## Diseño

La interfaz usa un sistema propio, definido en `src/lib/theme.ts` y `src/components/ui.tsx`.

*   **Paleta «papel y sello»** en claro y oscuro: fondo verdoso, tinta de pino y un único color de peligro
    (bermellón) reservado para retrasos.
*   **Tipografía:** Schibsted Grotesk en tres pesos (`F.regular`, `F.semi`, `F.bold`). Con fuentes personalizadas el
    peso se elige por familia, no con `fontWeight`; por eso existe el componente `Text` de `src/components/Text.tsx`.
*   **Cinta de estados** (`StatusRibbon`): cada tramo mide lo que pesa su estado dentro del total de actividades.
*   **Tarjetas** rectas con una franja lateral del color del estado, y **sellos** (`Badge`) rectangulares para las
    etiquetas de estado.
*   **Adaptable:** el contenido se centra con un ancho máximo (`CONTENT_MAX_WIDTH`, 760 px) en tablets y ventanas
    grandes, y la orientación es libre (`"orientation": "default"` en `app.json`).

## Ícono y nombre

El nombre visible es **Agente de Proyectos**. El ícono es una «A» cuya barra es la cinta de estados. Los archivos
están en `mobile/assets/` (`icon.png`, `android-icon-*.png`, `splash-icon.png`, `favicon.png`) y el color de fondo del
ícono adaptativo de Android está en `app.json`.

## Generar el APK y el IPA

Los instaladores se compilan en la nube con **EAS Build** (cuenta gratuita en expo.dev; la cuenta del proyecto es
`kiramman`). Los perfiles están en `mobile/eas.json`.

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview        # APK instalable
npx eas-cli@latest build -p ios --profile ios-altstore       # IPA sin firmar
```

Añade `--no-wait` para no esperar en la terminal. El enlace de descarga aparece en la consola y en
<https://expo.dev/accounts/kiramman/projects/agente-proyectos/builds>. Los instaladores para el público se publican como
assets de un [release de GitHub](https://github.com/kiramman-mp3/agente-proyectos/releases). Las compilaciones del plan gratuito entran en
una cola y pueden tardar varios minutos.

| Perfil | Plataforma | Resultado |
|---|---|---|
| `preview` | Android | `.apk` para instalar directamente |
| `production` | Android | `.aab` para Google Play |
| `ios-altstore` | iOS | `.ipa` **sin firmar**, para firmarlo e instalarlo con AltStore |

### Instalar el APK

*   **Teléfono:** abre el enlace de descarga del build y permite instalar apps de orígenes desconocidos.
*   **WSA o emulador:** `adb install -r app.apk` conserva los datos de la app.

### Instalar el IPA

El IPA no está firmado: se instala con [AltStore](https://altstore.io/), que lo firma con tu Apple ID. Las apps
instaladas así caducan a los 7 días con una cuenta gratuita y AltStore debe renovarlas.

## Compilar el APK en local (Windows)

EAS no puede compilar en local en Windows (`eas build --local` solo funciona en Linux y macOS), pero el APK se puede
generar con Gradle usando el SDK de Android Studio. Sirve cuando la cola de EAS es larga o no quieres gastar cuota.

### Requisitos

| Componente | Versión probada |
|---|---|
| Android SDK | plataforma 36 y `build-tools` 36 |
| NDK | `27.1.12297006` |
| CMake | `3.22.1` |
| JDK | **17** (también sirve el 21). **No uses el JDK 25** que trae Android Studio: la herramienta `prefab` imprime un aviso y el plugin de Android lo trata como error. |

Si no tienes un JDK 17, Gradle suele descargar uno en `%USERPROFILE%\.gradle\jdks\`. Los componentes del SDK se
instalan desde *Android Studio → SDK Manager*.

### Procedimiento

1. **Copia el proyecto a una ruta corta.** Windows limita las rutas a 260 caracteres y `ninja` falla con
   `Stat(...)` al compilar los módulos nativos desde una ruta larga. No uses `subst`: rompe el autolinking de Expo.
2. **Instala las dependencias y genera el proyecto nativo** en esa copia (así no se modifica el repositorio:
   `expo prebuild` reescribe los scripts `android` e `ios` de `package.json`).
3. **Compila con Gradle.**

```powershell
robocopy mobile C:\m /E /XD android .expo dist node_modules
cd C:\m
npm ci
npx expo prebuild -p android --no-install

$env:JAVA_HOME    = "$env:USERPROFILE\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2"   # ajusta la ruta a tu JDK 17
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon
```

El APK queda en `C:\m\android\app\build\outputs\apk\release\app-release.apk`. La primera compilación tarda unos 13
minutos (descarga dependencias y compila el código nativo).

### Qué tener en cuenta

*   **Firma:** el APK sale firmado con la clave de depuración de la plantilla de Expo, no con la keystore de EAS. Es
    válido para instalar directamente, pero Android no permite instalarlo **encima** de un APK de EAS: desinstala
    el anterior primero.
*   **Arquitecturas:** `-PreactNativeArchitectures=arm64-v8a,x86_64` acorta el tiempo y el tamaño (unos 63 MB frente a
    unos 100 MB). Cubre los teléfonos actuales, WSA y los emuladores x86_64. Quita ese parámetro para incluir también
    `armeabi-v7a` y `x86`.
*   **Para publicar, usa el de EAS:** su keystore es estable entre versiones, así que los usuarios pueden actualizar
    sin desinstalar.
*   **iOS:** no se puede compilar en local en Windows (requiere macOS con Xcode). El IPA sale siempre de EAS.
*   La carpeta `mobile/android/` está en `.gitignore`; no se versiona.

### Errores conocidos

| Error | Causa y solución |
|---|---|
| `A restricted method in java.lang.System has been called` en una tarea `configureCMake…` | Estás usando el JDK 25. Usa JDK 17 o 21. |
| `ninja: error: Stat(…)` con una ruta muy larga | Compilas desde una ruta larga. Copia el proyecto a `C:\m` (paso 1). |
| `Process 'command 'cmd'' finished with non-zero exit value 1` en `settings.gradle` | Estás compilando desde una unidad creada con `subst`. Usa una carpeta real. |
| `ConfigError: The expected package.json path … does not exist` | La copia del proyecto está vacía; en PowerShell usa `robocopy` (en Git Bash, sus opciones `/E` se confunden con rutas). |

## Publicar un release con el APK y el IPA

Los instaladores para el público se publican como *assets* de un release de GitHub, con los archivos que genera
**EAS** (APK con las cuatro arquitecturas y keystore estable, e IPA sin firmar para AltStore).

1. Genera los dos builds con EAS y espera a que terminen (`FINISHED`). Obtén las URL con
   `npx eas-cli@latest build:view <id> --json` (campo `artifacts.buildUrl`).
2. Descarga los archivos y renómbralos con la versión, por ejemplo `agente-de-proyectos-v1.0.0.apk` y
   `agente-de-proyectos-v1.0.0.ipa`.
3. Asegúrate de que `main` contiene el código que se compiló y crea el release con la CLI de GitHub (`gh auth login`
   la primera vez):

```powershell
gh release create v1.0.0 --target main --title "Agente de Proyectos v1.0.0" --notes-file notas.md `
  agente-de-proyectos-v1.0.0.apk agente-de-proyectos-v1.0.0.ipa
```

4. Para añadir o reemplazar archivos de un release existente: `gh release upload v1.0.0 <archivo> --clobber`.

Sube la versión en `mobile/app.json` (`version`) antes de cada release nuevo. El repositorio es público, así que los
archivos del release también lo son: no incluyas nada con credenciales. El APK y el IPA solo contienen la URL del
backend, nunca sus claves.

## Versión y actualizaciones

El `version` está en `app.json` (`1.0.0`) y `appVersionSource` es `local` en `eas.json`. Para actualizar una app ya
instalada, genera un build nuevo e instálalo encima. Si cambias el ícono o el nombre, también se actualizan al
instalar el nuevo build, no con Expo Go.
