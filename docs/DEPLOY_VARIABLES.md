# Variables de despliegue — Vyneural (Render + Vercel)

> Estado verificado: **2026-08-17**. Backend real: `https://vyneural-backend.onrender.com`
> (NO `vyneural-api.onrender.com` — ese hostname no tiene servicio, `x-render-routing: no-server`).

## Arquitectura

| Componente | Dónde vive | URL |
|---|---|---|
| Web/PWA/APK (frontend) | Vercel | `https://vyneural-six.vercel.app` |
| API FastAPI | Render Web Service | `https://vyneural-backend.onrender.com` |
| PostgreSQL | Render Managed PostgreSQL | vinculada vía `DATABASE_URL` |

El frontend NO guarda secretos: en Vercel solo se publica el rewrite de `/api`
(`vercel.json`) o, como alternativa, `VITE_API_URL`.

---

## Render → Web Service → Environment

### Manuales — correo (OBLIGATORIAS para que lleguen los mails)

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `matias.torres1812@gmail.com` |
| `SMTP_PASSWORD` | app password de Gmail (nunca en Git; ya está en `backend/.env` local) |
| `SMTP_FROM` | `matias.torres1812@gmail.com` |
| `SMTP_FROM_NAME` | `Vyneural` |
| `SMTP_TLS` | `true` |
| `SMTP_SSL` | `false` |
| `FRONTEND_BASE_URL` | `https://vyneural-six.vercel.app` *(nunca localhost: es la base de los enlaces del correo)* |

### Manuales — API / push

| Variable | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | generada con `py -m app.push.keys` (o la del `.env` local) |
| `VAPID_PRIVATE_KEY` | ídem (secreta) |
| `VAPID_SUBJECT` | `mailto:matias.torres1812@gmail.com` |
| `CORS_ORIGINS` | `https://vyneural-six.vercel.app,https://vyneural.cl` |
| `ENVIRONMENT` | `production` |
| `LOG_LEVEL` | `INFO` |

### Automáticas / generadas por Render

| Variable | Origen |
|---|---|
| `DATABASE_URL` | se vincula sola desde la PostgreSQL (blueprint) |
| `JWT_SECRET` | `generateValue` del blueprint (o generarla a mano) |
| `JWT_REFRESH_SECRET` | ídem |

### Opcionales

| Variable | Default | Nota |
|---|---|---|
| `REQUIRE_EMAIL_VERIFICATION` | `false` | `true` **solo después** de confirmar que el correo llega (si no, nadie inicia sesión) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | — |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | — |
| `EMAIL_VERIFICATION_EXPIRE_MINUTES` | `1440` | TTL del token de verificación (24 h) |
| `PASSWORD_RESET_EXPIRE_MINUTES` | `30` | TTL del token de reset |

---

## Vercel → Proyecto `bineural`

**Sin variables obligatorias.** El único requisito es que el rewrite de `/api`
esté publicado. Vía `vercel.json` (ya corregido en este repo):

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://vyneural-backend.onrender.com/api/:path*" }
]
```

> ⚠️ El destination debe ser la URL REAL del servicio Render. Si el servicio se
> llama distinto (p. ej. `vyneural-backend`), usar ESA URL, no la del blueprint.

**Alternativa sin `vercel.json`:** en Vercel → Project → Settings → Environment
Variables → `VITE_API_URL=https://vyneural-backend.onrender.com` (Production) y
redeploy. Ojo: se incrusta en el build; hay que re-desplegar al cambiarla.

---

## Checklist post-deploy

```bash
# 1) Backend vivo
curl -s https://vyneural-backend.onrender.com/health        # → {"status":"ok",...}
curl -s https://vyneural-backend.onrender.com/health/db     # → database ok
curl -s -o /dev/null -w "%{http_code}\n" https://vyneural-backend.onrender.com/docs  # → 200

# 2) Rewrite del frontend (debe responder FastAPI, NO el 404 de Vercel)
curl -s -w "\n%{http_code}\n" https://vyneural-six.vercel.app/api/v1/push/status

# 3) Correo: pedir un reset (llega un mail real si el SMTP está configurado)
curl -s -X POST https://vyneural-backend.onrender.com/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"email":"TU-EMAIL"}'
# → revisar bandeja + spam; si solo aparece en los logs de Render, el SMTP no está bien

# 4) Automatizado
node scripts/check-deploy.mjs
```

## Cómo se publica

1. **Render**: el deploy sale de GitHub (`matias1812/vyneural-backend`) por push a
   la rama conectada, o botón "Manual Deploy → Deploy branch" en el dashboard.
2. **Vercel**: el deploy sale de GitHub (`matias1812/vyneural.cl`) por push a la
   rama de producción (ver Vercel → Settings → Git → Production Branch), o
   "Redeploy" en el dashboard. El `vercel.json` corregido debe llegar a esa rama.
