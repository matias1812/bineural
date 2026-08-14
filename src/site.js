import './site.css';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Web Analytics de Vercel: métricas de visitas sin cookies ni rastreo
// entre sitios (respeta bloqueadores y el modo privado).
inject();

// Speed Insights de Vercel: métricas reales de rendimiento (Core Web Vitals)
// recogidas de los visitantes reales.
injectSpeedInsights();

// ── Dentro de la APK (WebView nativa) ───────────────────────────────────────
// La web empaquetada dentro de la app corre sobre file:// y el shell inyecta
// AndroidBridgeNative. Ahí no tiene sentido "instalar la APK": la vista de
// descarga/instalación se oculta (CSS) y la tarjeta se reemplaza por un aviso.
const IN_APP =
  typeof window !== 'undefined' &&
  (typeof window.AndroidBridgeNative !== 'undefined' || location.protocol === 'file:');
if (IN_APP) document.documentElement.classList.add('in-app');

// En la app ya instalada no se descarga la app: el botón principal del hero
// pasa a "Comenzar sesión" y lleva directo a los estados (la web conserva
// "Descargar la app ↓").
if (IN_APP) {
  const heroDownload = document.querySelector('.hero-cta-row a[href="/descargar"]');
  if (heroDownload) {
    heroDownload.setAttribute('href', '#estados');
    heroDownload.textContent = 'Comenzar sesión';
  }
  // En la app ya instalada, la tarjeta de descarga se convierte en un aviso de
  // que la aplicación ya está en uso (sin botón de instalar).
  const card = document.querySelector('.download-card');
  if (card) {
    card.innerHTML = `
      <h2>Ya estás usando Vyneural</h2>
      <p class="download-meta">La app está instalada en este dispositivo y funciona sin conexión.</p>
      <p>
        Esta vista es para instalar la aplicación desde el navegador. Desde acá podés
        explorar el <a href="/codigo-abierto">código abierto</a> o volver al
        <a href="/">generador</a>.
      </p>
    `;
  }
}

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
