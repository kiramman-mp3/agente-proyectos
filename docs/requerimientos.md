# Matriz de requerimientos

Trazabilidad entre cada requerimiento del proyecto y la evidencia que lo cumple en el sistema.

| ID | Requerimiento | Evidencia en el sistema |
|---|---|---|
| REQ-01 | Planificación: actividades, responsables, fechas, prioridades y estados | `tracking.build_activities`; app → pestaña **Actividades** |
| REQ-02 | Estado de cada tarea y avance general | 5 estados y avance ponderado y por completadas (`tracking.summarize`); app → **Panel** |
| REQ-03 | Datos de Trello y detección de cambios | `integrations/trello.py`; comparación de instantáneas (`tracking.diff_snapshots`), tabla `plan_changes` y endpoint `/changes` |
| REQ-04 | Detección automática de retrasos y riesgos, con causas e impacto | Riesgo por vencimiento y por avance frente al tiempo transcurrido; impacto por dependencias transitivas (`blocks`); causa analizada por el Ejecutor |
| REQ-05 | Alternativas correctivas presentadas al gestor | `executor.propose_corrective_actions` (reprogramar, prioridad, reasignar, estado, comentario); app → **Propuestas** |
| REQ-06 | Reporte semanal automático | `orchestrator.generate_weekly_report`: cifras calculadas sin IA, redacción del Ejecutor validada por el Revisor; app → **Reportes** |
| REQ-07 | Revisión de código | `orchestrator.run_code_review`: diffs de GitHub, análisis estático (`code_analysis.py`) e IA según `standards.md`; el Revisor descarta falsos positivos; app → **Código** |
| REQ-08 | Flujo Ejecutor → Revisor → Aprobador | `orchestrator.process_proposal`; detalle de cada etapa en la pantalla de la propuesta |
| REQ-09 | El gestor acepta, rechaza o modifica | Endpoints `/proposals/{id}/approve`, `/reject` y `/request-changes`; notificaciones en la app y **correo al gestor** ante retrasos, bloqueos o fallos críticos (`mailer.py`) |
| REQ-10 | Historial completo con fecha, hora y actor | Tabla `audit_log` (agente, humano o sistema) en PostgreSQL persistente (Neon); app → **Bitácora** (ícono de reloj en el Panel) |
| REQ-11 | Permisos y protección de credenciales | Credenciales cifradas con Fernet (AES-128-CBC con HMAC) usando `MASTER_KEY`; roles **gestor** (decide, ejecuta y administra usuarios) y **desarrollador** (consulta); usuarios gestionados desde la app, con contraseña temporal de cambio obligatorio; JWT; contraseñas PBKDF2-SHA256; token en el almacenamiento seguro del teléfono (`expo-secure-store`); las credenciales de Trello y GitHub nunca llegan a la app |

## Funcionalidades añadidas

Estas no figuraban en la matriz original:

| Funcionalidad | Evidencia |
|---|---|
| Asistente conversacional de solo lectura | `backend/app/chat.py`, `POST /chat`, `mobile/src/app/chat.tsx` y botón flotante ([asistente-chat.md](./asistente-chat.md)) |
| Proveedor de IA de respaldo | `backend/app/llm.py` (`LLM_FALLBACK_PROVIDER`, `FALLBACK_MODEL_*`) ([configuracion.md](./configuracion.md)) |
| Despliegue en Azure App Service | [despliegue-azure.md](./despliegue-azure.md) |
| Endurecimiento de seguridad (login limitado, sesiones revocables, solo HTTPS, decisiones atómicas) | [seguridad.md](./seguridad.md) |
| Purga automática de datos antiguos y tareas seguras con varias instancias | `backend/app/retention.py`, `db.claim_job` ([arquitectura.md](./arquitectura.md)) |
| Integración continua y despliegue opcional a Azure | `.github/workflows/` ([desarrollo.md](./desarrollo.md)) |
| Aplicación adaptable a tablet con identidad visual propia | `mobile/src/lib/theme.ts`, `mobile/src/components/ui.tsx` ([app-movil.md](./app-movil.md)) |

## Pruebas automatizadas

Las pruebas de `backend/tests` (41) cubren: estados, riesgo, dependencias, avance, detección de cambios, cifrado,
selección del proveedor de IA y su respaldo, validaciones del Revisor, análisis estático, flujo multiagente completo
con aprobación del gestor, permisos por rol, usuarios y correo, reporte semanal, revisión de código que crea un
*issue* sin tocar el código, el chat y el endurecimiento de seguridad. La app tiene además 12 pruebas con Jest. Más
detalles en [desarrollo.md](./desarrollo.md).
