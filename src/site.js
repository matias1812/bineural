import './site.css';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Web Analytics de Vercel: métricas de visitas sin cookies ni rastreo
// entre sitios (respeta bloqueadores y el modo privado).
inject();

// Speed Insights de Vercel: métricas reales de rendimiento (Core Web Vitals)
// recogidas de los visitantes reales.
injectSpeedInsights();

// ---------------------------------------------------------------- Nav móvil
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('site-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.innerHTML = open ? '✕' : '☰';
  });
  // Cerrar el menú al pulsar un enlace.
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.innerHTML = '☰';
    }
  });
}

// ---------------------------------------------------------------- Año del footer
document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

// ---------------------------------------------------------------- Resaltar la página actual
const here = window.location.pathname.replace(/\/+$/, '') || '/';
const page = here === '/' ? '/' : here.replace(/^\//, '').replace(/\.html$/, '');
document.querySelectorAll('.site-links a').forEach((a) => {
  const href = a.getAttribute('href');
  const target = href === '/' ? '/' : href.replace(/^\//, '').replace(/\.html$/, '');
  if (target === page || (page && target && target !== '/' && page.startsWith(target))) {
    a.setAttribute('aria-current', 'page');
  }
});

// ---------------------------------------------------------------- Scrollspy
// En la home, resalta en la nav el enlace de la sección visible
// (#estados / #como-funciona) mientras el usuario hace scroll.
const spySections = ['estados', 'como-funciona']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const spyLinks = [...document.querySelectorAll('.site-links a[href="#estados"], .site-links a[href="#como-funciona"]')];
if (spySections.length && spyLinks.length && 'IntersectionObserver' in window) {
  const spyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        spyLinks.forEach((a) => {
          const on = a.getAttribute('href') === '#' + id;
          a.classList.toggle('active', on);
          if (on) a.setAttribute('aria-current', 'true');
          else if (a.getAttribute('aria-current') === 'true') a.removeAttribute('aria-current');
        });
      });
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  spySections.forEach((s) => spyObserver.observe(s));
}

// ---------------------------------------------------------------- Testimonios (KudosWall)
// Carga asíncrona del widget de testimonios de pro.kudoswall.com antes del
// footer. Reemplazá KUDOSWALL_WIDGET_ID por el ID de tu widget (el snippet
// que te da KudosWall es: <script src="https://kudoswall.org/widget.js"
// data-id="TU_ID" async></script>). Mientras carga se muestra un skeleton
// para evitar saltos de layout (CLS).
const KUDOSWALL_WIDGET_ID = 'REEMPLAZA_CON_TU_WIDGET_ID_DE_KUDOSWALL';
const testimonialsRoot = document.getElementById('testimonials-root');
if (testimonialsRoot && KUDOSWALL_WIDGET_ID && KUDOSWALL_WIDGET_ID.startsWith('REEMPLAZA') === false) {
  const skeleton = testimonialsRoot.querySelector('.testimonials-skeleton');
  const script = document.createElement('script');
  script.src = 'https://kudoswall.org/widget.js';
  script.dataset.id = KUDOSWALL_WIDGET_ID;
  script.async = true;
  script.defer = true;
  const hideSkeleton = () => {
    if (skeleton) skeleton.remove();
  };
  script.onload = hideSkeleton;
  script.onerror = () => {
    hideSkeleton();
    const p = document.createElement('p');
    p.className = 'testimonials-empty';
    p.textContent = 'Las experiencias de nuestros oyentes se cargan aquí.';
    testimonialsRoot.appendChild(p);
  };
  testimonialsRoot.appendChild(script);
} else if (testimonialsRoot) {
  // Sin widget configurado todavía: mantener el espacio reservado estable
  // para no saltar el layout cuando se agregue el ID.
  const skeleton = testimonialsRoot.querySelector('.testimonials-skeleton');
  if (skeleton) skeleton.remove();
  const p = document.createElement('p');
  p.className = 'testimonials-empty';
  p.textContent = 'Próximamente: experiencias de quienes usan Vyneural.';
  testimonialsRoot.appendChild(p);
}

// ---------------------------------------------------------------- Formulario de experiencias
// Envía los testimonios por email mediante un servicio de formularios
// (Formspree u otro compatible con POST JSON). Creá un formulario en
// https://formspree.io y pegá acá el endpoint, por ejemplo:
//   const FORMSPREE_ENDPOINT = 'https://formspree.io/f/abcdwxyz';
// Si el endpoint no está configurado, el formulario usa un respaldo que
// siempre funciona sin backend: compone el mensaje, lo copia al
// portapapeles y abre el DM de Instagram de la cuenta configurada para
// que la persona lo pegue y lo envíe. Así el éxito y los avisos del
// formulario se muestran siempre.
const FORMSPREE_ENDPOINT = '';
const IG_ACCOUNT = 'vyneural.cl';
const experienceForm = document.getElementById('experience-form');
if (experienceForm) {
  const expIg = document.getElementById('exp-ig');
  const expName = document.getElementById('exp-name');
  const expFreq = document.getElementById('exp-freq');
  const expText = document.getElementById('exp-text');
  const expError = document.getElementById('exp-error');
  const expDone = document.getElementById('exp-done');
  const expDoneText = document.getElementById('exp-done-text');
  const expDm = document.getElementById('exp-dm');
  const expDoneNote = document.getElementById('exp-done-note');
  const expMessage = document.getElementById('exp-message');
  const expStars = document.getElementById('exp-stars');
  const expGotcha = document.getElementById('exp-gotcha');
  const expSubmit = document.getElementById('exp-submit');

  // Selector de valoración: 1 a 5 estrellas (opcional).
  let expRating = 0;
  if (expStars) {
    expStars.addEventListener('click', (e) => {
      const star = e.target.closest('.exp-star');
      if (!star) return;
      expRating = parseInt(star.dataset.value, 10);
      expStars.querySelectorAll('.exp-star').forEach((s, i) => {
        const on = i < expRating;
        s.classList.toggle('active', on);
        s.setAttribute('aria-checked', String(on));
      });
    });
  }

  function showExpError(msg) {
    expError.textContent = msg;
    expError.classList.remove('hidden');
    expError.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function showExpDone() {
    experienceForm.classList.add('hidden');
    expDone.classList.remove('hidden');
    expDone.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function setDmVisible(on) {
    [expDm, expDoneNote, expMessage].forEach((el) => el && el.classList.toggle('hidden', !on));
  }

  // Compone el mensaje listo para pegar en el DM de Instagram.
  function buildDmMessage(igUser, exp) {
    const who = ['@' + igUser, expName.value.trim()].filter(Boolean).join(' · ');
    const freq = expFreq.value;
    return [
      '¡Hola Vyneural! 👋 Quiero compartir mi experiencia:',
      '',
      `“${exp}”`,
      freq ? `Frecuencia: ${freq}` : '',
      `— ${who}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  experienceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    expError.classList.add('hidden');
    // Honeypot anti-spam: si está completado, ignorar el envío.
    if (expGotcha && expGotcha.value) return;
    // Solo se tolera la arroba inicial: el resto debe ser un usuario válido.
    const igUser = expIg.value.trim().replace(/^@+/, '');
    if (!igUser) {
      showExpError('Poné tu usuario de Instagram para poder enviar tu experiencia.');
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(igUser)) {
      showExpError('Ese usuario de Instagram no parece válido (solo letras, números, punto y guión bajo).');
      return;
    }
    const exp = expText.value.trim();
    if (exp.length < 10) {
      showExpError('Contanos un poco más: tu experiencia necesita al menos 10 caracteres.');
      return;
    }
    const freq = expFreq.value;

    if (FORMSPREE_ENDPOINT) {
      // Envío por email (Formspree u otro compatible con POST JSON).
      expSubmit.disabled = true;
      expSubmit.textContent = 'Enviando…';
      try {
        const res = await fetch(FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: `Nueva experiencia en Vyneural — @${igUser}`,
            instagram: igUser,
            nombre: expName.value.trim(),
            frecuencia: freq,
            valoracion: expRating > 0 ? `${expRating}/5` : '',
            experiencia: exp,
          }),
        });
        if (!res.ok) throw new Error(`formspree ${res.status}`);
        setDmVisible(false);
        if (expDoneText) {
          expDoneText.textContent =
            'Tu experiencia fue enviada. La revisamos y pronto podría aparecer en esta sección.';
        }
        showExpDone();
      } catch {
        showExpError('No pudimos enviar tu experiencia. Revisá tu conexión e intentá de nuevo.');
      } finally {
        expSubmit.disabled = false;
        expSubmit.textContent = 'Enviar mi experiencia';
      }
      return;
    }

    // Respaldo sin backend: mensaje listo para el DM de Instagram. Los
    // enlaces ig.me no admiten mensaje prellenado, así que se copia al
    // portapapeles y se abre el DM para pegarlo.
    const message = buildDmMessage(igUser, exp);
    if (expMessage) expMessage.value = message;
    if (expDm) {
      expDm.href = `https://ig.me/m/${IG_ACCOUNT}`;
      expDm.textContent = `Abrir Instagram (@${IG_ACCOUNT})`;
    }
    copyText(message);
    setDmVisible(true);
    if (expDoneText) {
      expDoneText.textContent =
        'Tu mensaje quedó listo y copiado. Tocá el botón para abrir Instagram y pegalo en nuestro DM:';
    }
    showExpDone();
  });
}

// ---------------------------------------------------------------- Aviso de cookies
// La app no usa cookies de seguimiento: solo almacenamiento local del
// navegador (preferencias, sesiones, historial y recordatorios). Igual se
// muestra un aviso en la primera visita, se guarda la elección y se puede
// volver a abrir desde el footer ("Gestionar cookies").
const COOKIE_CONSENT_KEY = 'vyneural-cookie-consent';
const cookieBanner = document.getElementById('cookie-banner');
function showCookieBanner() {
  if (!cookieBanner) return;
  cookieBanner.classList.remove('hidden');
}
function hideCookieBanner(choice) {
  if (!cookieBanner) return;
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    /* sin almacenamiento disponible */
  }
  cookieBanner.classList.add('hidden');
}
if (cookieBanner) {
  try {
    if (!localStorage.getItem(COOKIE_CONSENT_KEY)) {
      // Pequeña espera para no interrumpir el arranque de la app.
      window.setTimeout(showCookieBanner, 900);
    }
  } catch {
    /* sin almacenamiento: no mostrar el aviso */
  }
  const cookieAccept = document.getElementById('cookie-accept');
  const cookieReject = document.getElementById('cookie-reject');
  if (cookieAccept) cookieAccept.addEventListener('click', () => hideCookieBanner('accepted'));
  if (cookieReject) cookieReject.addEventListener('click', () => hideCookieBanner('rejected'));
  // "Gestionar cookies" en el footer: volver a mostrar el aviso para que el
  // usuario pueda revisar o cambiar su elección.
  const cookieManage = document.getElementById('cookie-manage');
  if (cookieManage) {
    cookieManage.addEventListener('click', (e) => {
      e.preventDefault();
      showCookieBanner();
      cookieBanner.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const first = cookieBanner.querySelector('button');
      if (first) first.focus();
    });
  }
}
