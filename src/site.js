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
