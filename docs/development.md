# Desarrollo

## Requisitos

- Node ≥ 18 y npm.
- Navegador moderno (Web Audio + WebGL2 recomendado; fallback WebGL1/CPU).

## Flujo diario

```bash
npm install
npm run dev        # http://localhost:5173 (Vite, HMR)
npm test           # suite científica headless — correr antes de cada cambio
npm run build      # verificar build de producción
npm run preview    # servir el build localmente
```

### Reglas de oro al modificar

1. **Separación de dominios (P1)**: los modelos no escriben variables de otras
   capas; la única puerta Neural→Visual es `NeuralToVisualMapper`.
2. **Honestidad**: cualquier variable nueva mostrada al usuario necesita clase
   de dominio y etiqueta MEASURED/SIMULATED/DERIVED/ESTIMATED/HEURISTIC.
3. **Reproducibilidad**: si añades aleatoriedad a un modelo, acepta un seed
   (patrón de `EegInterface.setSeed`) y añade un test de determinismo.
4. **Validación**: cualquier cambio en física/modelos debe mantener `npm test`
   en verde; los tests nuevos van a `src/validation/diagnostics.js` (se ejecutan
   igual en Node y en el navegador).
5. **El canvas principal es 2D**: el GL vive en canvases offscreen propios
   (`CymaticsRenderer`); no pedir otro contexto al mismo canvas.
6. `dist/` está versionado (despliegue estático); regenerarlo con
   `npm run build` al tocar assets.

## Estructura del repositorio

```
├── index.html + *.html            # páginas (app + secundarias)
├── src/
│   ├── main.js                    # orquestación de la app
│   ├── site.js                    # nav/footer de páginas secundarias
│   ├── style.css / site.css       # estilos
│   ├── audio.js                   # motor binaural (Web Audio)
│   ├── ambient.js                 # 6 ambientes sintetizados
│   ├── wavefield.js               # FDTD 2D (laboratorio de ondas)
│   ├── cymatics.js                # cimática (Bessel, WebGL2/1/CPU)
│   ├── starfield.js               # fondo decorativo
│   ├── notifications.js           # alarmas, permisos, Media Session
│   ├── core/                      # pipeline científico
│   │   ├── states.js              #   estados puros por dominio
│   │   ├── auditory.js            #   psicoacústica
│   │   ├── neural.js              #   modelo neurofisiológico reducido
│   │   ├── eeg.js                 #   EEG sintético (seedable)
│   │   ├── cognitive.js           #   modelo psicológico + flow
│   │   ├── visual.js              #   mapeo Neural→Visual (provenance)
│   │   ├── simulation.js          #   SimulationEngine (bucle)
│   │   └── reproducibility.js     #   seed/config/versión (P12)
│   ├── models/profiles.js         # 28 perfiles con hipótesis y evidencia
│   ├── ui/hud.js                  # HUD científico (Fase 16/17)
│   └── validation/                # assert.js + diagnostics.js
├── scripts/
│   ├── run-diagnostics.mjs        # runner headless (npm test)
│   ├── gen-icons.cjs              # genera icons/ (PNG desde SVG)
│   └── gen-og.mjs                 # genera og.png
├── public/                        # manifest, sw.js, icons, og
├── docs/                          # documentación (índice en README.md)
├── vite.config.js                 # multi-página (6 entradas)
└── vercel.json                    # configuración de despliegue
```

## Despliegue (Vercel)

- Repositorio conectado a Vercel; build `npm run build`, output `dist/`.
- PWA: `public/manifest.webmanifest` + `public/sw.js`; activa en HTTPS.
- `.env.local` contiene claves opcionales (Formspree / Vercel); no commitear.
- Multi-página declarado en `vite.config.js` — añadir ahí cualquier página nueva.

## Teclas de desarrollo

| Tecla | Acción |
|---|---|
| `Espacio` | Play / pausa |
| `←` / `→` | Cambiar de estado |
| `E` | Conectar / desconectar EEG simulado |
| `M` | Alternar modo científico / cinemático del renderer cimática |

## Telemetría

`@vercel/analytics` y `@vercel/speed-insights` se inyectan en `main.js`; en
desarrollo son no-op (modo debug de Vercel).
