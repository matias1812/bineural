// ════════════════════════════════════════════════════════════════════════════
// Burbuja flotante "Reportar un problema" (todas las páginas)
// ─────────────────────────────────────────────────────────────────────────────
// Canal de feedback con un tercero GRATUITO y SIN backend propio:
//   · FormSubmit (formsubmit.co): servicio gratis sin registro. El primer
//     envío genera un correo de confirmación al email de abajo; una vez
//     confirmado, los reportes llegan directo al inbox.
//   · BUG_WEBHOOK: si se configura la URL de un Google Apps Script (ver
//     docs/FEEDBACK_TOOLS.md), cada reporte se reenvía también a una hoja
//     de Google Sheets (campo _webhook de FormSubmit).
//   · Si el envío por fetch falla (offline / CORS / bloqueador) se cae a un
//     POST nativo del formulario; si no hay red, a un correo prefabricado.
// El contexto técnico se recoge de forma automática (navegador, página,
// resolución, audio en vivo si el generador está cargado).
// ════════════════════════════════════════════════════════════════════════════

const BUG_EMAIL = 'matias.torres1812@gmail.com';
// URL del Google Apps Script para volcar los reportes a una hoja de cálculo
// (opcional, ver docs/FEEDBACK_TOOLS.md). Vacío = desactivado.
const BUG_WEBHOOK = '';
const BUG_AJAX = `https://formsubmit.co/ajax/${BUG_EMAIL}`;
const BUG_POST = `https://formsubmit.co/${BUG_EMAIL}`;

function collectContext() {
  let ua = '';
  try {
    ua = navigator.userAgent || '';
  } catch {
    /* sin UA */
  }
  let platform = 'desconocida';
  try {
    platform =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      platform;
  } catch {
    /* sin plataforma */
  }
  // Estado de audio en vivo (solo si el generador está montado en esta página).
  let audio = null;
  try {
    const p = window.__audioProbe && window.__audioProbe();
    if (p) {
      const s = p.stats || {};
      audio = {
        ctx: p.ctx ? p.ctx.state : 'none',
        playing: !!s.playing,
        gain: s.gain != null ? +Number(s.gain).toFixed(3) : null,
        mode: s.mode || null,
        transport: p.transport ? (p.transport.paused ? 'paused' : 'playing') : 'none',
      };
    }
  } catch {
    audio = null;
  }
  return {
    pagina: (location.pathname || '/') + (location.search || ''),
    navegador: ua.slice(0, 220),
    plataforma: platform,
    resolucion: `${screen.width}x${screen.height}`,
    en_app:
      typeof window.AndroidBridgeNative !== 'undefined' || location.protocol === 'file:',
    idioma: navigator.language || '',
    audio,
    hora: new Date().toISOString(),
  };
}

function contextText(ctx) {
  const lines = [
    `Página: ${ctx.pagina}`,
    `Plataforma: ${ctx.plataforma}${ctx.en_app ? ' · dentro de la APK (WebView)' : ''}`,
    `Resolución: ${ctx.resolucion}`,
    `Idioma: ${ctx.idioma}`,
    `Fecha/hora: ${ctx.hora}`,
    `Navegador: ${ctx.navegador}`,
  ];
  if (ctx.audio) {
    lines.push(
      `Audio: ctx=${ctx.audio.ctx} · playing=${ctx.audio.playing} · gain=${ctx.audio.gain} · mode=${ctx.audio.mode} · transport=${ctx.audio.transport}`,
    );
  }
  return lines.join('\n');
}

function mailtoLink(subject, body) {
  return `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─────────────────────────────────────────────────────────── Construcción UI
function build() {
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'bug-fab';
  fab.className = 'bug-fab';
  fab.setAttribute('aria-label', 'Reportar un problema');
  fab.setAttribute('title', 'Reportar un problema');
  fab.innerHTML = `
    <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 20l2.3-2.3a1 1 0 0 1 .7-.3h2.5a1 1 0 0 1 .7.3L17 20"/><path d="M9.4 6.1A5 5 0 0 1 18.9 6c.1.3 0 .6-.2.8l-.4.4a.6.6 0 0 0-.2.7A6 6 0 0 0 18 11v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3a6 6 0 0 0-.1-3.1.6.6 0 0 0-.2-.7l-.4-.4a.6.6 0 0 1-.2-.8 5 5 0 0 1 4.3-2.9z"/></svg>
    <span class="bug-fab-pulse" aria-hidden="true"></span>
    <span class="bug-fab-label">Reportar un problema</span>
  `;

  const modal = document.createElement('div');
  modal.id = 'bug-modal';
  modal.className = 'bug-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="bug-modal-card" role="dialog" aria-modal="true" aria-labelledby="bug-modal-title">
      <div class="bug-modal-head">
        <h3 id="bug-modal-title">🐞 Reportar un problema</h3>
        <button type="button" id="bug-close" class="bug-close" aria-label="Cerrar">✕</button>
      </div>
      <p class="bug-sub">
        Ayudanos a mejorar Vyneural. El reporte viaja con contexto técnico
        anónimo (navegador, página y estado del audio) y se puede responder
        si dejás tu email.
      </p>
      <form id="bug-form" novalidate>
        <label class="bug-field">
          <span class="bug-label">¿Qué tipo es?</span>
          <select name="tipo">
            <option value="bug">🐛 Encontré un error</option>
            <option value="audio">🔊 Problema de audio</option>
            <option value="apk">📲 Problema en la app Android</option>
            <option value="sugerencia">💡 Sugerencia / idea</option>
            <option value="otro">✏️ Otro</option>
          </select>
        </label>
        <label class="bug-field">
          <span class="bug-label">Contanos qué pasó <em>(mín. 10 caracteres)</em></span>
          <textarea name="mensaje" rows="5" maxlength="2000" placeholder="¿Qué esperabas y qué ocurrió? ¿En qué paso?" required></textarea>
        </label>
        <label class="bug-field">
          <span class="bug-label">Tu email (opcional)</span>
          <input type="email" name="email" placeholder="para poder responderte" />
        </label>
        <input type="hidden" name="_subject" value="Reporte de Vyneural" />
        <input type="hidden" name="_template" value="table" />
        <input type="hidden" name="_captcha" value="false" />
        <input type="hidden" name="_next" value="" />
        <input type="hidden" name="_replyto" value="" />
        <button type="submit" class="bug-submit">Enviar reporte</button>
        <p id="bug-status" class="bug-status" hidden></p>
      </form>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(modal);
  return { fab, modal };
}

// ─────────────────────────────────────────────────────────────────── Comportamiento
// API estable para que otras páginas (p. ej. el menú ⋯ del generador) abran
// el modal de reporte sin depender del botón flotante. La burbuja se oculta en
// pantalla completa vía CSS (html:fullscreen / body.immersive), y el acceso
// queda disponible desde el menú de los 3 puntos.
let __api = null;
export function bugReportApi() {
  if (__api) return __api;
  return null;
}

export function initBugReport() {
  // Doble inicialización (p. ej. si main.js llegara a importar el módulo):
  // la burbuja/modal solo se construyen UNA vez por página.
  if (__api) return __api;
  const { fab, modal } = build();
  const form = modal.querySelector('#bug-form');
  const status = modal.querySelector('#bug-status');
  const closeBtn = modal.querySelector('#bug-close');
  const firstField = form.querySelector('[name="tipo"]');

  function showStatus(html, isError) {
    status.innerHTML = html;
    status.classList.toggle('bug-status-error', !!isError);
    status.hidden = false;
  }

  function open() {
    modal.hidden = false;
    // Dejar espacio al teclado en móviles.
    document.body.classList.add('bug-modal-open');
    window.setTimeout(() => firstField && firstField.focus(), 30);
  }
  function close() {
    modal.hidden = true;
    document.body.classList.remove('bug-modal-open');
    fab.focus();
  }

  // Exponer la API (open/close) para el menú ⋯ y para integraciones.
  __api = { open, close, fab };
  window.__bugReport = __api;

  fab.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;

    const msg = (form.elements.mensaje.value || '').trim();
    if (msg.length < 10) {
      showStatus('Contanos un poco más… (mínimo 10 caracteres)', true);
      return;
    }
    const email = (form.elements.email.value || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('El email no parece válido…', true);
      return;
    }

    const ctx = collectContext();
    const ctxText = contextText(ctx);
    const subject = `[${ctx.en_app ? 'APK' : 'Web'}] ${form.elements.tipo.value} · ${ctx.pagina}`;
    form.elements._subject.value = subject;
    form.elements._replyto.value = email;
    // URL de "gracias" tras el POST nativo. Dentro de la APK (file://) no hay
    // origin válido: se vuelve al sitio web, donde se muestra el toast.
    const thanksBase =
      location.origin && location.origin !== 'null'
        ? location.origin + location.pathname
        : 'https://vyneural-six.vercel.app/';
    form.elements._next.value = `${thanksBase}?reporte=ok`;

    const payload = {
      tipo: form.elements.tipo.value,
      mensaje: msg,
      email: email || '(sin email)',
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      contexto: ctxText,
      pagina: ctx.pagina,
    };

    // Google Sheets vía Apps Script (opcional): vuelco directo, fire-and-forget,
    // para no depender del webhook de FormSubmit. Configurar en docs/FEEDBACK_TOOLS.md.
    const pushToSheet = () => {
      if (!BUG_WEBHOOK) return;
      try {
        fetch(BUG_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch {
        /* no bloquea el reporte */
      }
    };

    const btn = form.querySelector('.bug-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    // 1) Intento por fetch (AJAX de FormSubmit, sin recargar la página).
    if (navigator.onLine !== false) {
      try {
        const res = await fetch(BUG_AJAX, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const j = await res.json().catch(() => null);
          if (j && j.success === 'true') {
            btn.disabled = false;
            form.hidden = true;
            showStatus('✅ ¡Gracias! Tu reporte fue enviado. Lo leemos todos.');
            pushToSheet();
            return;
          }
        }
      } catch {
        /* caemos al POST nativo */
      }
    }

    // Sin red: no tiene sentido el POST nativo → correo prefabricado.
    if (navigator.onLine === false) {
      const body = `${msg}\n\n${ctxText}`;
      btn.disabled = false;
      btn.textContent = 'Enviar reporte';
      showStatus(
        `Sin conexión: no pudimos enviar ahora. Escribinos directo a<br><a href="${mailtoLink(subject, body)}">${BUG_EMAIL}</a>`,
        true,
      );
      return;
    }

    // 2) POST nativo del formulario (FormSubmit hace el resto, sin CORS).
    //    La página vuelve sola con ?reporte=ok (toast de agradecimiento).
    pushToSheet();
    form.target = '_self';
    form.action = BUG_POST;
    form.method = 'POST';
    form.submit();
  });

  // Toast de agradecimiento cuando FormSubmit redirige de vuelta (?reporte=ok).
  if (new URLSearchParams(location.search).get('reporte') === 'ok') {
    const toast = document.createElement('div');
    toast.className = 'bug-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = '✅ ¡Gracias! Tu reporte fue enviado.';
    document.body.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('bug-toast-hide');
      window.setTimeout(() => toast.remove(), 600);
    }, 6000);
  }
}

// Auto-inicialización (páginas estáticas que cargan este módulo vía site.js).
if (typeof document !== 'undefined' && document.readyState !== 'loading') {
  initBugReport();
} else if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initBugReport);
}
