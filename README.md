# Vyneural · Bineural Engine

Generador de ondas binaurales en tiempo real (Web Audio API) con dos
simulaciones visuales independientes, un pipeline científico explícito
(estímulo → auditivo → neural → EEG → cognitivo → visual) y una suite de
validación automatizada.

> **Principio rector** (Plan Maestro Científico): ninguna metáfora visual se
> presenta como afirmación neurocientífica. Toda variable tiene una clase de
> dominio (`PHYSICAL | NEURAL | PSYCHOLOGICAL | VISUAL | EMPIRICAL | HEURISTIC`)
> y una etiqueta de honestidad (`MEASURED | SIMULATED | DERIVED | ESTIMATED |
> HEURISTIC`).

## Stack

- **Vite 6** (SPA multi-página, ES modules, sin framework).
- **Web Audio API** — motor binaural + 6 ambientes sintetizados en vivo.
- **WebGL2 → WebGL1 → CPU** — renderer de cimática con fallback progresivo.
- **Canvas 2D** — simulación de ondas de agua (FDTD) y composición final.
- **PWA** — manifest + service worker, instalable.
- **Vercel** — despliegue (analytics y speed-insights opcionales).

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo (Vite)
npm run build        # build de producción (multi-página)
npm run preview      # servir el build localmente
npm test             # suite de validación científica (headless, Node)
```

En el navegador, la misma suite se ejecuta con `window.runBineuralDiagnostics()`
en la consola.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/audit.md`](docs/audit.md) | Auditoría baseline (Fase 0): arquitectura, modelos, limitaciones |
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura y flujo de datos del pipeline |
| [`docs/scientific-model.md`](docs/scientific-model.md) | Ecuaciones, parámetros y clasificación de cada modelo |
| [`docs/validation.md`](docs/validation.md) | Suite de validación, checklist de integridad y resultados |
| [`docs/development.md`](docs/development.md) | Flujo de desarrollo, estructura del repo, despliegue |

## Estado del plan maestro

Pipeline científico (P1–P9) ✓ · Experimental Mode (P10) ✓ · Suite de validación
(P11) ✓ · Reproducibilidad (P12) ✓ · HUD científico con honestidad (P14/P17) ✓ ·
**Pendiente:** perfiles de rendimiento (P13), auditoría de páginas públicas (P18).
