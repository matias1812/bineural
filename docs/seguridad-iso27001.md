# Seguridad — Auditoría según ISO/IEC 27001 (Anexo A)

> Documento vivo de trabajo. Cada ítem del Anexo A aplicable a Vyneural
> (web + API + APK) se audita contra el código real y se marca su estado.
> Fecha de la auditoría: 2026-08-16. Estado global: **parcial → producción requiere cierre de "pendientes".**

Leyenda: ✅ implementado · 🟡 parcial (documentado el riesgo) · ❌ pendiente · ➖ no aplica

---

## A.5 — Políticas de seguridad de la información

| Control | Estado | Evidencia / acción |
|---|---|---|
| A.5.1 Dirección de gestión | 🟡 | Este documento + `docs/accounts.md` + `hoja-de-ruta.html`. Falta una política formal firmada para producción. |
| A.5.10 Aceptable uso | ➖ | App personal, sin red corporativa. |

## A.6 — Organización

| Control | Estado | Evidencia |
|---|---|---|
| A.6.8 Revisión de seguridad | 🟡 | La auditoría la hace el agente de desarrollo en cada ciclo; sin revisión externa independiente. |
| A.6.9 Contacto con grupos de interés | ➖ | Sin proveedores terceros críticos (excepto SMTP/hosting en prod). |

## A.7 — Recursos humanos (confidencialidad)

| Control | Estado | Evidencia |
|---|---|---|
| A.7.2 Acuerdos de confidencialidad | ➖ | App personal. |

## A.8 — Gestión de activos

| Control | Estado | Evidencia |
|---|---|---|
| A.8.1 Inventario de activos | ✅ | Repos: `backvyneural` (API) y `bineural` (web/APK); activos: código, PostgreSQL, SMTP, VAPID keys. |
| A.8.9 Gestión de activos de información | 🟡 | `.env` ignorado por Git (secreto `cambia-este-*` por defecto); falta rotación documentada. |
| A.8.10 Aceptable uso | ➖ | Idem A.5.10. |
| A.8.12 Prevención de pérdida de datos | 🟡 | El correo en dev se loguea con el enlace (pérdida de privacidad controlada en dev); en prod solo SMTP. Backups de Postgres no automatizados (pendiente). |

## A.9 — Control de acceso

| Control | Estado | Evidencia |
|---|---|---|
| A.9.1.1 Política de control de acceso | ✅ | Modelo: `user_id` del token JWT → cada query filtra por propietario (favorites/frequencies/itineraries/alarms). Revisar rutas: `auth`, `users`, `sync`. |
| A.9.1.2 Registro de usuarios | ✅ | `POST /auth/register` con verificación de email (`REQUIRE_EMAIL_VERIFICATION`), términos requeridos en UI. |
| A.9.2.1 Registro y baja | ✅ | Logout borra tokens (access + refresh revocado en DB). |
| A.9.2.2 Asignación de privilegios | ✅ | Un único rol de usuario; sin admin expuesto. |
| A.9.2.4 Gestión de credenciales secretas | ✅ | Argon2id (`time_cost=3`, `memory_cost=64 MiB`, `parallelism=2`). JWT HS256 con secretos separados (access 15 min / refresh 30 días revocable) por env, nunca hardcodeados. |
| A.9.3 Responsabilidad de los usuarios | 🟡 | Sin MFA (pendiente para producción) ni aviso de "sesiones activas". |
| A.9.4.1 Restricción de acceso a la información | ✅ | Cambio de contraseña exige contraseña actual y cierra las demás sesiones. Reset de contraseña invalida sesiones previas. |

## A.10 — Criptografía

| Control | Estado | Evidencia |
|---|---|---|
| A.10.1.1 Política de control criptográfico | 🟡 | TLS obligatorio en prod (documentado); dev en HTTP local. Sin política formal. |
| A.10.1.2 Gestión de claves | 🟡 | Secretos por env; VAPID keys por env; falta rotación/almacén de claves (pendiente). |

## A.12 — Seguridad de las operaciones

| Control | Estado | Evidencia |
|---|---|---|
| A.12.1.4 Separación de entornos | ✅ | Dev (`uvicorn --reload` + SQLite/Postgres local) vs prod (SMTP, flags) separados por `.env`. |
| A.12.2 Protección contra malware | ➖ | Sin descargas ejecutables; APK firmada con keystore propio (verificar firma antes de publicar). |
| A.12.3 Copias de seguridad | ❌ | **Pendiente**: automatizar backup de PostgreSQL (pg_dump cron) y definir RPO/RTO. |
| A.12.4 Registro y seguimiento | ✅ | Log por request: `req_id, method, path, status, latency, user` (nunca secretos). Diagnóstico forense en APK (`Diagnostics`). |
| A.12.6.1 Gestión de vulnerabilidades técnicas | 🟡 | Dependencias sin escaneo automatizado (pendiente: `pip-audit` / `npm audit` en CI). |
| A.12.7 Controles de auditoría | 🟡 | Sin logs de auditoría de eventos sensibles (login fallido, cambio de clave) persistidos. |

## A.13 — Seguridad de las comunicaciones

| Control | Estado | Evidencia |
|---|---|---|
| A.13.1.1 Redes | ➖ | Hosting único; sin segmentación. |
| A.13.2.1 Política de transferencia de información | ✅ | Solo HTTPS en prod; API con security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`) — añadidos en esta auditoría. |
| A.13.2.3 Mensajería electrónica | ✅ | Emails con enlaces con token de un solo uso (TTL 24 h verificación / 30 min reset). |

## A.14 — Adquisición, desarrollo y mantenimiento

| Control | Estado | Evidencia |
|---|---|---|
| A.14.1.2 Seguridad en el desarrollo | ✅ | Auditoría de sanitización: todo dato de usuario va por `escapeHtml`/`textContent` (auth, cuenta, verificar, restablecer, rutina, FAQ, modal de frecuencias). Sin `innerHTML` con datos sin escapar. |
| A.14.1.3 Protección de datos en desarrollo | 🟡 | Logs de email en dev exponen enlaces (controlado); sin datos reales de clientes. |
| A.14.2.1 Política de desarrollo seguro | 🟡 | Pruebas de seguridad manuales + E2E; falta pipeline automatizado. |
| A.14.2.5 Reglas de desarrollo | ✅ | Validación espejo backend/frontend, N+1 corregido (selectinload), caché con invalidación en mutaciones. |
| A.14.2.7 Entorno de desarrollo externalizado | ➖ | In-house. |
| A.14.3.1 Protección de datos de prueba | ✅ | Usuarios de prueba sintéticos (`sched*/e2e*@vyneural.cl`). |

**A.14 — amenazas web aplicadas al código:**

| Amenaza | Estado | Evidencia |
|---|---|---|
| Inyección SQL | ✅ | SQLAlchemy con parámetros, sin f-strings en queries. |
| XSS | ✅ | Escapado auditado (único hueco corregido: `initial` del avatar). |
| CSRF | ✅ | API sin cookies: token Bearer en header; CORS restringido a orígenes de config. |
| Enumeración de usuarios | ✅ | Login 401 genérico; forgot-password respuesta genérica + rate limit 3/min. |
| Fuerza bruta | ✅ | Rate limits por IP: login/register/refresh/push/forgot. |
| Tokens en localStorage | 🟡 | Access token en `localStorage` (riesgo XSS residual) — mitigado por el escapado y por el refresh corto (15 min). Para endurecer: cookies HttpOnly/Secure o almacenamiento en memoria con re-login. |
| Sensibilidad del secreto JWT | 🟡 | Default `cambia-este-secreto` — **obligatorio** cambiarlo en producción. |
| Over-posting | ✅ | Schemas Pydantic con `extra="forbid"`/campos explícitos. |

## A.16 — Gestión de incidentes

| Control | Estado | Evidencia |
|---|---|---|
| A.16.1.1 Responsabilidades | 🟡 | El propio desarrollador; sin SLA. |
| A.16.1.5 Respuesta | ✅ | Formulario de reporte de bugs en la app (`/report-bug`), log forense en APK (`/diagnostico`). |

## A.17 — Continuidad del negocio

| Control | Estado | Evidencia |
|---|---|---|
| A.17.1.1 Plan de continuidad | ❌ | **Pendiente**: documentar plan (restore de Postgres, rebuild APK, DNS). |

## A.18 — Cumplimiento

| Control | Estado | Evidencia |
|---|---|---|
| A.18.1.1 Requisitos legales | 🟡 | Aviso médico (`aviso-medico.html`), términos y política de privacidad en el signup. Revisar cumplimiento RGPD/Ley 19.628 (Chile) para producción. |
| A.18.1.3 Protección de datos | ✅ | Derecho al olvido: `DELETE /users/me` (verificar que borre datos y sesiones). |

---

## Checklist de cierre para producción (orden de prioridad)

1. **Cambiar secretos JWT** por defecto y rotarlos (A.10/A.14). *Bloqueante.*
2. **HTTPS + HSTS + CSP** en el host estático y la API (A.13). *Bloqueante.*
3. **Backups automatizados** de PostgreSQL + restauración probada (A.12.3). *Bloqueante.*
4. **Escaneo de dependencias** (`pip-audit` + `npm audit`) en CI (A.12.6).
5. **MFA opcional** y aviso de sesiones activas (A.9.3).
6. **Logs de auditoría** de eventos sensibles persistidos (A.12.4/A.12.7).
7. Revisar **firma de la APK** (keystore en lugar seguro) antes de publicar (A.12.2).
8. Plan de **continuidad e incidentes** documentado (A.16/A.17).
