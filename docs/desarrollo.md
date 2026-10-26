# Desarrollo

## Preparar el entorno

```powershell
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# App móvil
cd ..\mobile
npm install
```

El backend funciona sin servicios externos si no defines `DATABASE_URL` (usa SQLite en `backend/data/`). Para ejecutar
los procesos reales necesitas las credenciales de Trello, GitHub y de un proveedor de IA
(ver [configuracion.md](./configuracion.md)).

## Pruebas

### Backend

```powershell
cd backend
pytest
```

Son **28 pruebas** que no necesitan red: usan una base SQLite temporal por prueba, un Trello simulado y modelos de
IA simulados. Cubren:

*   estados, riesgo, dependencias, avance y detección de cambios;
*   cifrado de credenciales y selección del proveedor de IA, con su respaldo;
*   validaciones del Revisor y análisis estático;
*   el flujo multiagente completo con aprobación del gestor;
*   permisos por rol, usuarios y correo;
*   reporte semanal y revisión de código que crea un *issue* sin tocar el código;
*   el chat: contexto, recorte del historial y errores del proveedor.

Para probar también contra PostgreSQL: `TEST_DATABASE_URL=<url> pytest`. Cada prueba usa un esquema temporal que
se elimina al terminar.

### Móvil

```bash
cd mobile
npm run typecheck
npx expo export --platform android    # comprueba que el bundle compila (genera mobile/dist, ignorado por git)
```

No hay pruebas automatizadas de interfaz: se verifica a mano en Expo Go, un emulador o WSA.

## Flujo de ramas

*   `main` es la rama estable. Lo que está en `main` es lo que se publica.
*   `develop` es la rama de integración.
*   Los cambios se desarrollan en una rama de trabajo (`feat/…`, `fix/…`), se mergean a `develop` y de ahí a `main`
    con commits de merge (`--no-ff`).

```bash
git checkout -b feat/mi-cambio
# ... commits ...
git checkout develop && git merge --no-ff feat/mi-cambio
git checkout main && git merge --no-ff develop
git push origin develop main
```

## Convenciones

*   **Commits:** formato [Conventional Commits](https://www.conventionalcommits.org/) en español, con ámbito cuando
    ayuda: `feat(mobile): …`, `fix(backend): …`, `chore: …`, `docs: …`.
*   **Backend:** sigue `backend/standards.md` (es el mismo documento que usa el Agente Ejecutor al revisar código):
    nombres claros, funciones pequeñas, sin duplicación, sin credenciales en el código, consultas parametrizadas y
    pruebas para la lógica nueva.
*   **Lo determinista sin IA:** si algo se puede calcular con código (estados, cifras, fechas), no lo delegues a un
    modelo.
*   **Escrituras externas:** cualquier cambio en Trello o GitHub va en `backend/app/actions.py` y debe pasar por una
    propuesta autorizada.
*   **Móvil:** estilos y colores salen de `src/lib/theme.ts` (`useTheme`, `F`, `RADIUS`); no uses `fontWeight`, usa las
    familias `F.regular`, `F.semi` y `F.bold`. Usa `Text` de `src/components/Text.tsx` en lugar del de React Native.
*   **Secretos:** nunca en el código, en commits ni en la documentación.

## Cómo añadir cosas habituales

### Un endpoint nuevo
1. Agrégalo en `backend/app/main.py` con `Depends(require("<permiso>"))`.
2. Añade el modelo Pydantic de entrada si recibe cuerpo.
3. Escribe la prueba en `backend/tests/` y documenta el endpoint en [api.md](./api.md).

### Un tipo de acción correctiva nuevo
1. Permítelo en `backend/policy.json` (`acciones_permitidas`) y decide si es auto-ejecutable o prohibido.
2. Impleméntalo en `backend/app/actions.py`.
3. Enséñaselo al Ejecutor en `agents/executor.py` y valida sus parámetros en `agents/reviewer.py`.
4. Añade su etiqueta en `mobile/src/lib/theme.ts` (`ACTION_LABEL`) y en `backend/app/chat.py` (`ACTION_TYPE`).

### Una pantalla nueva en la app
1. Crea el archivo en `mobile/src/app/` (Expo Router lo registra solo).
2. Si debe ir en el stack, regístrala en `mobile/src/app/_layout.tsx`.
3. Usa `Screen`, `Card`, `Title`, `Body` y los demás componentes de `src/components/ui.tsx`. Pasa `chatFab` a `Screen`
   si es una pestaña y debe mostrar el botón de chat.

### Cambiar el proveedor o los modelos de IA
Solo variables de entorno: `LLM_PROVIDER`, `MODEL_*`, `LLM_FALLBACK_PROVIDER` y `FALLBACK_MODEL_*`. No hace falta
tocar el código.
