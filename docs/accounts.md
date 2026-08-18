# Cuentas, verificación y sincronización (aditivo)

Desde la FASE 17 el proyecto tiene un backend opcional (FastAPI + PostgreSQL,
en `../backvyneural`). La web, la PWA y la APK siguen funcionando 100% local y
sin cuenta: todo lo que toca el backend es **aditivo** y solo actúa cuando el
usuario inicia sesión.

## Reglas de oro

- **Sin sesión, sin backend**: el generador no cambia su comportamiento.
- **Sin audio por datos**: favoritos, frecuencias, alarmas e itinerarios son
  datos sincronizados; NUNCA reproducen audio por sí solos.
- **Un aviso push no reproduce audio**: el service worker solo muestra la
  notificación; la reproducción exige gesto del usuario.

## Módulos del frontend

| Módulo | Rol |
|---|---|
| `src/api/client.js` | Fetch con token, refresh con rotación, sesión en localStorage |
| `src/api/auth.js` | register / login / logout / me / verifyEmail / resend / forgot / reset / changePassword |
| `src/ui/auth.js` | Modal login · registro (confirmar clave + términos) · olvidé mi contraseña · estados post-registro |
| `src/ui/freq-modal.js` | Modal compartido "Guardar frecuencia personalizada" (generador + `/cuenta`) |
| `src/api/fav-sync.js` | Favoritos del generador ↔ nube (idempotente, con `state_id`) |
| `src/api/push.js` | Suscripción web push VAPID por dispositivo |
| `src/cuenta.js` | `/cuenta`: perfil, favoritos, frecuencias, alarmas, itinerarios (con vista de horario) y push |

## Páginas

- `/cuenta` — vista de usuario con sesión (badge de verificación, reenvío de
  correo, cambio de contraseña con re-autenticación, vista de horario del
  itinerario con sus alarmas).
- `/verificar?token=…` — confirma el correo tras el registro.
- `/restablecer?token=…` — crea contraseña nueva desde el correo de
  recuperación.
- `/preguntas-frecuentes` — FAQ con acordeón accesible.

## Push web

- El backend publica `GET /api/v1/push/status` (VAPID); el frontend suscribe el
  dispositivo con `pushManager.subscribe` y registra el endpoint.
- `src/cuenta.js` muestra el **estado real del dispositivo** (suscrito o no) y
  avisa cuando falta contexto seguro (HTTPS / localhost).

## Verificación estricta

El flag `REQUIRE_EMAIL_VERIFICATION` del backend (default `false`) bloquea el
login de correos sin confirmar. En producción conviene activarlo: la UI ya
tiene la pantalla "Confirmá tu correo" y el reenvío.

## Despliegue

- El proxy de desarrollo de Vite redirige `/api` a `http://127.0.0.1:8000`
  (`VITE_PROXY_TARGET` para cambiarlo).
- En producción, Vercel redirige `/api` al backend con `vercel.json`.
- El email se imprime en el log en dev (`EMAIL [VERIFY] / [RESET]`) y se envía
  por SMTP en producción (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASSWORD`, `EMAIL_FROM`, `FRONTEND_BASE_URL`).

### Estado actual (2026-08-17) — "el correo no llega"

Síntoma reportado: "mande uno nuevo… puse reenviar y no llegó". Causa raíz
**de despliegue, no de código**:

1. **El backend NO está desplegado en Render.** `https://vyneural-api.onrender.com`
   responde `404` en todo con `x-render-routing: no-server` (no hay servicio en
   ese hostname; ver `../backvyneural/docs/RENDER_DEPLOY.md` §6).
2. **El rewrite de `/api` no está publicado en Vercel.** El `vercel.json` local
   tiene `rewrites` pero está sin commitear; la web desplegada devuelve el 404
   nativo de Vercel para `/api/*` (no el de FastAPI).
3. El SMTP (Gmail) está **verificado y funciona** localmente
   (`EMAIL entregado: SI`); solo hay que desplegar el backend con esas
   variables de entorno.

Para verificar en vivo, cualquier `/api` de la web desplegada debe responder
con FastAPI (no con el 404 de Vercel) y `/health` del backend con `ok`.

### Reenvío honesto

`POST /api/v1/auth/resend-verification` devuelve `email_sent: bool`: `true`
si el correo se entregó por SMTP, `false` si el SMTP no está configurado o
falló (en ese caso el enlace solo se loguea). La UI usa ese flag para no
mostrar "Correo enviado ✓" cuando en realidad no salió nada, y muestra el
error de reenvío en la vista visible (bug corregido: antes caía en un div
oculto).
