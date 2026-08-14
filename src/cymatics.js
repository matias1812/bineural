// ============================================================================
// Simulación de cimática — Vyneural
// ============================================================================
// Alternativa al visualizador de las tres gotas: una placa circular oscura
// con tres gotas de fluido alineadas (vista cenital) cuya superficie vibra
// con patrones de Faraday empíricamente correctos.
//
// Física:
//   1. Respuesta subarmónica. Una superficie de fluido excitada a f responde
//      a la MITAD de la frecuencia (faraday, 1831): ω_s = π·f.
//   2. Dispersión de ondas de gravedad-capilaridad (agua):
//        ω_s² = g·k + (σ/ρ)·k³
//      De aquí sale el número de onda k: a más frecuencia, longitud de onda
//      menor y por lo tanto más anillos en el patrón. A frecuencias bajas
//      domina la gravedad (k pequeño → la gota entera sube y baja, sin
//      anillos); a frecuencias altas domina la capilaridad (k ∝ f^(2/3)).
//   3. Modos propios de una cuenca circular con pared vertical: la superficie
//      es libre en la pared (J'_m(k a) = 0), así que los patrones son
//      superposiciones de J_m(k r)·cos(m θ). Como en un cuenco cantor real,
//      cada gota se afina al modo angular (m, n) más cercano a la
//      resonancia: el patrón muestra la flor característica de la cimática
//      (m pétalos sobre n−1 anillos concéntricos) y los pétalos cambian con
//      la frecuencia — 2, 3, 4, 5… según el tono, igual que en los cantos.
//
// Visualización: la oscilación subarmónica (f/2) ocurre a cientos de Hz,
// muy por encima de los 60 FPS, así que se renderiza el ENVOLVENTE espacial
// del patrón estacionario (lo que muestra un lapso de tiempo real de
// cimática), con el deslizamiento lento de las fases que produce el batido
// entre modos casi degenerados. El envolvente se pinta como una foto de
// larga exposición: alto contraste, líneas nodales finas y nítidas (la sal
// de Chladni asentada sobre los nodos) y temblor mínimo — definido y
// natural, no un degradado difuso. El latido real del AudioContext marca el
// pulso de amplitud y el brillo del aro LED cenital.
//
// Rendimiento: el plato se rasteriza en un lienzo oculto de resolución
// adaptativa (más resolución si el patrón tiene más anillos) y se escala
// con suavizado, manteniendo 60 FPS en móvil y escritorio.

const TWO_PI = Math.PI * 2;

// Constantes físicas del agua (~20 °C, unidades SI).
const G = 9.81; // gravedad (m/s²)
const SIGMA_RHO = 7.29e-5; // tensión superficial / densidad (m³/s²)

// Ceros de J'_m (m = 0 … 6): modos radiales de una cuenca circular con
// pared vertical (condición de borde libre de la superficie:
// J'_m(k a) = 0). Los modos angulares (m ≥ 2) son los que producen los
// patrones florales y la deriva/rotación real de la cimática de Faraday.
const ZP0 = [
  3.8317, 7.0156, 10.1735, 13.3237, 16.4706, 19.6159,
  22.7601, 25.9037, 29.0468, 32.1897,
];
const ZP1 = [
  1.8412, 5.3314, 8.5363, 11.706, 14.8636, 18.0155,
  21.1644, 24.3113, 27.4571, 30.6019,
];
const ZP2 = [
  3.0542, 6.7061, 9.9695, 13.1704, 16.3475, 19.5129,
  22.6716, 25.826, 28.9777, 32.1273,
];
const ZP3 = [
  4.2012, 8.0152, 11.3459, 14.5858, 17.7887, 20.9725,
  24.1449, 27.3101, 30.4703, 33.6267,
];
const ZP4 = [
  5.3176, 9.2824, 12.6819, 15.9641, 19.196, 22.401,
  25.5898, 28.7678, 31.9372, 35.0995,
];
const ZP5 = [
  6.4156, 10.5199, 13.9872, 17.3128, 20.5755, 23.8038,
  27.0103, 30.2028, 33.3854, 36.5607,
];
const ZP6 = [
  7.5013, 11.7349, 15.2682, 18.6374, 21.9317, 25.1839,
  28.4065, 31.6089, 34.7967, 37.9737,
];
const ZP_BY_M = [ZP0, ZP1, ZP2, ZP3, ZP4, ZP5, ZP6];

// Ceros de J'_m para m > 6 (aproximación de McMahon, suficiente para el
// matiz de resonancia de los modos de detalle 2m/3m, que no están en las
// tablas): j'_{m,1} ≈ m + 0,80862·m^(1/3) y la separación entre ceros
// consecutivos tiende a π.
function zPrimeApprox(m, n) {
  return m + 0.80862 * Math.cbrt(m) + (n - 1) * Math.PI;
}

// Frecuencia de resonancia (rad/s) del modo (m, n) de la cuenca de radio a:
//   ω² = g·k + (σ/ρ)·k³,  k = j'_{m,n}/a
// Es la dispersión real; la diferencia δ = ω_res − ω_s con la excitación es
// el batido que produce la rotación/deriva observada en cimática real.
function modeOmega(m, n, a) {
  const k = (m <= 6 ? ZP_BY_M[m][n - 1] : zPrimeApprox(m, n)) / a;
  return Math.sqrt(G * k + SIGMA_RHO * k * k * k);
}

// Amplitud resonante (tipo Lorentz) de un modo angular desafiinado en δ:
// un modo lejos de la resonancia aporta poco al patrón, como en el agua
// real. γ es la anchura de resonancia (~2 Hz para una cuenca de 2 cm).
// Matiza la textura y el detalle mandala, que además tienen un suelo
// mínimo para que las subestructuras se vean siempre (la no linealidad
// del agua real excita armónicos aunque estén lejos de la resonancia
// lineal). El modo dominante se elige por cercanía a la resonancia y se
// normaliza para que la flor se vea siempre, como cuando se afina el
// plato a la frecuencia del canto.
// PHASE 8: Frequency-dependent resonance width Γ(ω_s).
// In real cymatics, the resonance bandwidth narrows at higher frequencies
// (the quality factor Q = ω_s / Γ increases with frequency because capillary
// waves have lower damping than gravity waves). At low ω_s (few Hz) damping is
// broad (Γ ≈ 25 rad/s); at high ω_s (>300 Hz) it narrows toward Γ_min.
// Model: Γ(f) = Γ_max / (1 + f / f_half),  f_half = 80 Hz.
// This replaces the old constant GAMMA = 12 which was physically incorrect.
const GAMMA_MAX  = 25; // rad/s — low-frequency (gravity-wave regime)
const GAMMA_MIN  =  6; // rad/s — high-frequency floor (capillary regime)
const GAMMA_HALF = 80; // Hz  — crossover frequency
function gammaAt(f) {
  // Interpolate from GAMMA_MAX → GAMMA_MIN as f increases.
  return GAMMA_MIN + (GAMMA_MAX - GAMMA_MIN) / (1 + f / GAMMA_HALF);
}
function lorentz(delta, f) {
  const g = gammaAt(f != null ? f : 100);
  return 1 / (1 + (delta / g) * (delta / g));
}

// Número de onda de Faraday para una excitación a f Hz. La superficie
// responde a ω_s = π·f (subarmónica) y k resuelve la dispersión
// gravedad-capilaridad con Newton-Raphson.
function faradayWavenumber(f) {
  const ws = Math.PI * f; // ω_s = ω_d / 2
  const ws2 = ws * ws;
  // Estimación inicial en la rama dominante: capilar si ω_s² ≫ g·k_c³.
  const kCap = Math.cbrt(ws2 / SIGMA_RHO);
  const kGra = ws2 / G;
  let k = kCap < kGra ? kCap : kGra;
  for (let i = 0; i < 10; i++) {
    const fk = G * k + SIGMA_RHO * k * k * k - ws2;
    const dfk = G + 3 * SIGMA_RHO * k * k;
    let dk = fk / dfk;
    if (dk > k * 0.8) dk = k * 0.8;
    else if (dk < -k * 0.8) dk = -k * 0.8;
    k -= dk;
    if (Math.abs(dk) < k * 1e-6) break;
  }
  return k;
}

// Radio físico del plato: se elige para que a 220 Hz (la portadora de
// referencia) quepan exactamente REF_RINGS anillos con el borde libre:
//   a = j'_{0,6} / k(220 Hz)  ≈ 10,5 mm  (una cuenca real de ~2 cm,
//   mostrada ampliada).
const REF_F = 220;
const REF_RINGS = 6;
const PHYS_A = ZP0[REF_RINGS - 1] / faradayWavenumber(REF_F);

// Anillos visibles para una frecuencia dada: número de longitudes de onda
// (π·k·a) que caben en el plato, redondeado al modo radial más cercano.
function ringsFor(f) {
  const r = Math.round((faradayWavenumber(f) * PHYS_A) / Math.PI);
  return Math.max(1, Math.min(ZP0.length, r));
}

// --------------------------------------------------------------------------
// Funciones de Bessel (modos radiales de la cuenca).
// --------------------------------------------------------------------------

// J0 por serie de potencias (x < 8) y forma asintótica (x ≥ 8).
function besselJ0(x) {
  x = Math.abs(x);
  if (x < 1e-4) return 1;
  if (x < 8) {
    const xx = x * x;
    let s = 1;
    let term = 1;
    for (let k = 1; k <= 10; k++) {
      term *= -(xx) / (4 * k * k);
      s += term;
    }
    return s;
  }
  return Math.sqrt(2 / (Math.PI * x)) * Math.cos(x - Math.PI / 4);
}

// J1 por serie de potencias (x < 8) y forma asintótica (x ≥ 8).
function besselJ1(x) {
  x = Math.abs(x);
  if (x < 1e-4) return 0;
  if (x < 8) {
    const half = x / 2;
    const xx = x * x;
    let s = half;
    let term = half;
    for (let k = 1; k <= 10; k++) {
      term *= -(xx) / (4 * k * (k + 1));
      s += term;
    }
    return s;
  }
  return Math.sqrt(2 / (Math.PI * x)) * Math.cos(x - (3 * Math.PI) / 4);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Construye la tabla radial estática de una gota: 13 valores por píxel —
// r, θ, las Bessel del patrón (J0, J_mDom, J_mS1, J_mS2 y los cinco modos
// de detalle mandala J_mD1..J_mD5) y las dos texturas espaciales fijas de
// la gota (grano capilar y moteado de la sal). Es independiente del tiempo
// (solo rotan las fases angulares y el grano tiembla con una envolvente
// global), así que se calcula una sola vez por (resolución, modo) y por
// fotograma el bucle solo evalúa los cosenos — con esto se puede subir la
// resolución del buffer (nitidez) sin perder 60 FPS y se evita recalcular
// senos por píxel. Se usa tanto para la flor actual como para la anterior
// durante la transición entre frecuencias.
// Rellena las filas y0..y1 (sin incluir y1) de una tabla radial de 13
// columnas. Se usa tanto para construir la tabla completa de un modo como
// para construirla por tramos (pendiente) sin congelar el fotograma al
// cambiar de frecuencia.
function fillRadTableRows(
  rad,
  res,
  y0,
  y1,
  argScale,
  mDom,
  mS1,
  mS2,
  mD1,
  mD2,
  mD3,
  mD4,
  mD5,
  tex
) {
  const half = res / 2;
  const maxM = Math.max(
    mDom,
    mS1,
    mS2,
    mD1 >= 1 ? mD1 : 1,
    mD2 >= 1 ? mD2 : 1,
    mD3 >= 1 ? mD3 : 1,
    mD4 >= 1 ? mD4 : 1,
    mD5 >= 1 ? mD5 : 1,
    1
  );
  const js = new Array(maxM + 1);
  // Moteado del polvo en unidades relativas al búfer (orgánico a cualquier
  // resolución, sin aliasing).
  const pkScale = res / 100;
  for (let py = y0; py < y1; py++) {
    const dy = py - half + 0.5;
    for (let px = 0; px < res; px++) {
      const dx = px - half + 0.5;
      const idx = py * res + px;
      const o = idx * 13;
      const dist = Math.hypot(dx, dy);
      rad[o] = dist;
      rad[o + 1] = Math.atan2(dy, dx);
      const arg = argScale * dist;
      js[0] = besselJ0(arg);
      if (arg < 1e-3) {
        for (let mm = 1; mm <= maxM; mm++) js[mm] = 0;
      } else {
        js[1] = besselJ1(arg);
        for (let mm = 2; mm <= maxM; mm++) {
          js[mm] = ((2 * (mm - 1)) / arg) * js[mm - 1] - js[mm - 2];
        }
      }
      rad[o + 2] = js[0];
      rad[o + 3] = js[mDom];
      rad[o + 4] = js[mS1];
      rad[o + 5] = js[mS2];
      rad[o + 6] = mD1 >= 1 ? js[mD1] : 0;
      rad[o + 7] = mD2 >= 1 ? js[mD2] : 0;
      rad[o + 8] = mD3 >= 1 ? js[mD3] : 0;
      rad[o + 9] = mD4 >= 1 ? js[mD4] : 0;
      rad[o + 10] = mD5 >= 1 ? js[mD5] : 0;
      // Grano capilar espacial (el vaivén temporal se aplica después con una
      // envolvente global por fotograma: barato y sin recalcular senos).
      rad[o + 11] =
        (Math.sin(tex.gk1 * dx) * Math.sin(tex.gk2 * dy) +
          Math.sin(tex.gk3 * (dx + dy)) * Math.sin(tex.gk4 * (dx - dy))) /
        2;
      // Moteado determinista del polvo sobre las líneas nodales (estático:
      // rompe el trazo en granos sin coste por fotograma).
      rad[o + 12] =
        Math.sin(tex.pk1 * pkScale * dx + tex.pk2 * pkScale * dy) *
        Math.sin(tex.pk3 * pkScale * dy - tex.pk4 * pkScale * dx);
    }
  }
}

// Rellena por tramos las ondas radiales precalculadas de una gota (4
// columnas por píxel, estáticas por resolución): col 0 cos(k·r) de la
// estacionaria, col 1 cos(k'·r) y col 2 sin(k'·r) de las dos viajeras
// opuestas, col 3 sin(2k'·r) del nodo de colisión de las ondas. Al tenerlas
// en tabla, el bucle por fotograma solo rota fases (cos/sin escalares) en
// vez de evaluar un coseno por píxel y por onda.
function fillRipRows(rip, rad, res, y0, y1, kRip) {
  const kRip2 = kRip * 1.6;
  const res2 = res * res;
  for (let py = y0; py < y1; py++) {
    const base = py * res;
    for (let px = 0; px < res; px++) {
      const idx = base + px;
      const dist = rad[idx * 13];
      rip[idx] = Math.cos(kRip * dist);
      rip[res2 + idx] = Math.cos(kRip2 * dist);
      rip[2 * res2 + idx] = Math.sin(kRip2 * dist);
      rip[3 * res2 + idx] = Math.sin(2 * kRip2 * dist);
    }
  }
}

// Construye la tabla radial completa de una gota (13 columnas por píxel:
// r, θ, las Bessel del patrón y las dos texturas espaciales fijas).
function buildRadTable(res, argScale, mDom, mS1, mS2, mD1, mD2, mD3, mD4, mD5, tex) {
  const rad = new Float32Array(res * res * 13);
  fillRadTableRows(rad, res, 0, res, argScale, mDom, mS1, mS2, mD1, mD2, mD3, mD4, mD5, tex);
  return rad;
}

// ============================================================================
// Ruta GPU (WebGL2): el mismo patrón de Chladni se rasteriza en shaders.
// Los valores espaciales estáticos (r, θ, Bessel, grano y polvo) se suben a
// texturas de coma flotante solo cuando cambia el modo; por fotograma solo
// se actualizan las fases, amplitudes y ondas (uniformes). La GPU evalúa el
// mismo sumatorio píxel a píxel, así que 60 FPS son estables a cualquier
// resolución — incluso con el fundido cruzado entre flores, que también
// vive en el shader (dos texturas por gota). Si no hay WebGL2 (o falla el
// shader), el rasterizador CPU de abajo continúa funcionando igual.
// ============================================================================

const GL_VS = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const GL_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

// Texturas: A (compartida entre flores) = r, θ, J0, grano capilar.
//            B = J_mDom, J_mS1, J_mS2, J_mD1
//            C = J_mD2, J_mD3, polvo, (libre)
//            Bo/Co = las de la flor ANTERIOR durante un fundido cruzado.
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uTexC;
uniform sampler2D uTexBo;
uniform sampler2D uTexCo;
uniform sampler2D uTexAo; // textura A de la flor ANTERIOR (J0 vieja en un fundido cruzado)

uniform vec2 uOffset;  // origen de esta gota en el lienzo GL (px)
uniform float uRes;
uniform float uHalf;
uniform float uRim;
uniform float uWob;

// Flor actual: pesos j = amplitud·shimmer y fases φ = rotación + fase.
uniform float uJ[8];
uniform float uPh[7];
uniform float uM[6];
// Flor anterior (fundido cruzado).
uniform float uJo[8];
uniform float uPho[7];
uniform float uMo[6];
uniform float uNewW;
uniform float uOldW;

uniform float uMEnv;
uniform float uPresence;
uniform float uAmpPat;
uniform float uAmp;
uniform float uSwell;

// Ondas radiales (fases por fotograma; la GPU evalúa el cos/sin espacial).
uniform float uRipA;
uniform float uRipC;
uniform float uRipT;
uniform float uRipN;
uniform float uRipCl;
uniform float uColC;
uniform float uCT;
uniform float uST;
uniform float uCN;
uniform float uSN;

// Sal de Chladni y color.
uniform float uGEnv;
uniform float uPSh;
uniform float uTexPow;
uniform float uTexSalt;
uniform float uSandSig;
uniform float uGain;
uniform float uMid;
uniform vec3 uPal;
uniform vec3 uDeep;
uniform vec3 uWhite;

out vec4 outColor;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }

void main() {
  // Coordenada local de esta gota (gl_FragCoord está en el lienzo GL, que
  // contiene las tres gotas); la coordenada v se invierte para que la fila 0
  // de la textura (arriba en la tabla CPU) quede arriba en el lienzo final.
  vec2 local = gl_FragCoord.xy - uOffset;
  vec2 uv = vec2((local.x + 0.5) / uRes, 1.0 - (local.y + 0.5) / uRes);
  vec4 A = texture(uTexA, uv);
  float dist = A.x;
  float th = A.y;
  float J0v = A.z;
  float grain = A.w;
  float bound = uHalf * uWob;
  if (dist >= bound) {
    outColor = vec4(0.0);
    return;
  }
  float soft = clamp01((bound - dist) / uRim);

  // Ondulación: estacionaria + dos viajeras opuestas + nodo de colisión.
  // Mismo número de onda que la tabla precalculada de la ruta CPU
  // ((2·TWO_PI·3)/half = 12π/half): las ondas viajeras tienen el MISMO
  // espaciado en ambas rutas, o el patrón GPU sale con bandas el doble de
  // anchas y pierde el aspecto cimático.
  float kRip = 37.69911184307752 / uHalf;
  float k2 = kRip * 1.6;
  float ri0 = cos(kRip * dist);
  float ri1 = cos(k2 * dist);
  float ri2 = sin(k2 * dist);
  float ri3 = sin(2.0 * k2 * dist);
  float ripp = 1.0
    + uRipA * ri0 * uRipC
    + uRipT * (ri1 * uCT - ri2 * uST)
    + uRipN * (ri1 * uCN + ri2 * uSN)
    + uRipCl * ri3 * uColC;

  vec4 B = texture(uTexB, uv);
  vec4 C = texture(uTexC, uv);
  float sum = 0.0;
  if (uNewW > 0.02) {
    sum = uJ[0] * J0v
      + uJ[1] * B.x * cos(uM[0] * th + uPh[0])
      + uJ[2] * B.x * cos(uM[0] * th + uPh[1])
      + uJ[3] * B.y * cos(uM[1] * th + uPh[2])
      + uJ[4] * B.z * cos(uM[2] * th + uPh[3])
      + uJ[5] * B.w * cos(uM[3] * th + uPh[4])
      + uJ[6] * C.x * cos(uM[4] * th + uPh[5])
      + uJ[7] * C.y * cos(uM[5] * th + uPh[6]);
    sum *= uNewW;
  }
  if (uOldW > 0.02) {
    vec4 Bo = texture(uTexBo, uv);
    vec4 Co = texture(uTexCo, uv);
    vec4 Ao = texture(uTexAo, uv);
    sum += uOldW * (
        uJo[0] * Ao.z
      + uJo[1] * Bo.x * cos(uMo[0] * th + uPho[0])
      + uJo[2] * Bo.x * cos(uMo[0] * th + uPho[1])
      + uJo[3] * Bo.y * cos(uMo[1] * th + uPho[2])
      + uJo[4] * Bo.z * cos(uMo[2] * th + uPho[3])
      + uJo[5] * Bo.w * cos(uMo[3] * th + uPho[4])
      + uJo[6] * Co.x * cos(uMo[4] * th + uPho[5])
      + uJo[7] * Co.y * cos(uMo[5] * th + uPho[6]));
  }

  float eBase = sum * ripp * uAmp * uSwell * uMEnv;
  float e = eBase + grain * uGEnv * (0.1 + abs(eBase)) * 0.045 * uAmp;

  float sand = 0.0;
  if (abs(eBase) < 0.11) {
    float sandPowder = 1.0 - uTexPow + uTexPow * C.z * uPSh;
    float env = abs(uJ[0] * J0v) + abs(uJ[1] * B.x) + abs(uJ[2] * B.x)
      + abs(uJ[3] * B.y) + abs(uJ[4] * B.z) + abs(uJ[5] * B.w)
      + abs(uJ[6] * C.x) + abs(uJ[7] * C.y);
    float envGate = clamp01((env - 0.05) / 0.25);
    sand = exp(-(eBase * eBase) / (2.0 * uSandSig * uSandSig))
      * sandPowder * envGate * (0.75 + 0.25 * uAmpPat) * uAmpPat * uPresence;
  }

  float eP = (e < 0.0 ? -1.0 : 1.0) * sqrt(abs(e));
  float tIn = (eP * uGain + uMid - 0.5) * 5.0;
  float t2 = tIn * tIn;
  float tt = tIn < -3.0 ? -1.0 : tIn > 3.0 ? 1.0 : (tIn * (27.0 + t2)) / (27.0 + 9.0 * t2);
  float v = 0.5 + 0.5 * tt;

  vec3 col;
  if (v < 0.5) {
    float u2 = v * 2.0;
    col = uPal * u2 + uDeep * (1.0 - u2);
  } else {
    float u2 = (v - 0.5) * 2.0;
    col = uWhite * u2 + uPal * (1.0 - u2);
  }
  if (sand > 0.02) {
    float sa = sand * uTexSalt * soft;
    vec3 sandCol = mix(vec3(240.0, 245.0, 252.0), uPal, 0.22);
    col = mix(col, sandCol, sa);
  }
  float wa = (0.26 + 0.1 * uAmpPat + 0.54 * v + 0.55 * sand * uAmpPat) * soft;
  outColor = vec4(col / 255.0, min(wa, 1.0));
}`;

// Versión GLSL ES 1.00 (WebGL1) derivada de la 300 es para compartir toda la
// lógica: solo cambian el encabezado, texture()→texture2D() y gl_FragColor
// en vez de out. Si la 1.00 no compila en un dispositivo, buildGLProgram
// devuelve null y el rasterizador CPU sigue funcionando igual.
function glsl100(src) {
  return src
    .replace('#version 300 es\n', '')
    .replace('precision highp sampler2D;\n', '')
    .replace('in vec2 aPos;', 'attribute vec2 aPos;')
    .replace('out vec4 outColor;\n', '')
    .replace(/texture\(/g, 'texture2D(')
    .replace(/outColor =/g, 'gl_FragColor =');
}
const GL_VS_GL1 = glsl100(GL_VS);
const GL_FS_GL1 = glsl100(GL_FS);

function compileGLShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[cimática] shader WebGL:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildGLProgram(gl, isGL2) {
  const vs = compileGLShader(gl, gl.VERTEX_SHADER, isGL2 ? GL_VS : GL_VS_GL1);
  const fs = compileGLShader(gl, gl.FRAGMENT_SHADER, isGL2 ? GL_FS : GL_FS_GL1);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[cimática] programa WebGL:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function initGL() {
  try {
    const canvas = document.createElement('canvas');
    const attrs = {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
    };
    // WebGL2 primero; si no está disponible (navegadores o GPUs viejos), se
    // intenta WebGL1 con el mismo shader en GLSL ES 1.00. Si tampoco hay,
    // null → el rasterizador CPU sigue funcionando igual.
    let gl = canvas.getContext('webgl2', attrs);
    const isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) return null;
    // WebGL1 necesita texturas de coma flotante (las tablas radiales); sin
    // la extensión no se puede rasterizar el patrón y se vuelve al CPU.
    if (!isGL2 && !gl.getExtension('OES_texture_float')) return null;
    const prog = buildGLProgram(gl, isGL2);
    if (!prog) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    // Sin VAO: el atributo se configura en el VAO por defecto, que persiste
    // entre fotogramas y funciona igual en WebGL1 y WebGL2.
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    // Textura negra de respaldo para los slots de la flor anterior vacíos.
    const blackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    const names = [
      'uTexA', 'uTexB', 'uTexC', 'uTexBo', 'uTexCo', 'uTexAo', 'uOffset', 'uRes', 'uHalf', 'uRim', 'uWob',
      'uNewW', 'uOldW',
      'uMEnv', 'uPresence', 'uAmpPat', 'uAmp', 'uSwell',
      'uRipA', 'uRipC', 'uRipT', 'uRipN', 'uRipCl', 'uColC', 'uCT', 'uST', 'uCN', 'uSN',
      'uGEnv', 'uPSh', 'uTexPow', 'uTexSalt', 'uSandSig', 'uGain', 'uMid', 'uPal', 'uDeep', 'uWhite',
    ];
    const u = {};
    for (const nm of names) u[nm] = gl.getUniformLocation(prog, nm);
    // Los arrays se consultan ELEMENTO A ELEMENTO: algunos drivers separan
    // los arrays de uniformes en escalares individuales y la consulta sin
    // índice ('uJ') devuelve null, dejando el array en cero (y el patrón
    // desaparece). Con 'uJ[0]'..'uJ[7]' siempre funcionan.
    const arrayEls = (base, n) => {
      const arr = [];
      for (let k = 0; k < n; k++) arr.push(gl.getUniformLocation(prog, `${base}[${k}]`));
      return arr;
    };
    u.uJ = arrayEls('uJ', 8);
    u.uPh = arrayEls('uPh', 7);
    u.uM = arrayEls('uM', 6);
    u.uJo = arrayEls('uJo', 8);
    u.uPho = arrayEls('uPho', 7);
    u.uMo = arrayEls('uMo', 6);
    // Los samplers se ENLAZAN a sus unidades de textura con uniform1i: sin
    // esto todos quedan en la unidad 0 (la textura A, r/θ/J0) y el shader
    // lee los valores equivocados donde debería leer las Bessel angulares —
    // el patrón se degrada a un resplandor radial sin mandala. uTexAo
    // (unidad 5) es la textura A de la flor ANTERIOR durante un fundido.
    gl.useProgram(prog);
    gl.uniform1i(u.uTexA, 0);
    gl.uniform1i(u.uTexB, 1);
    gl.uniform1i(u.uTexC, 2);
    gl.uniform1i(u.uTexBo, 3);
    gl.uniform1i(u.uTexCo, 4);
    gl.uniform1i(u.uTexAo, 5);
    return {
      gl,
      prog,
      isGL2,
      canvas,
      u,
      blackTex,
      scratch: {
        j: new Float32Array(8),
        ph: new Float32Array(7),
        m: new Float32Array(6),
        jo: new Float32Array(8),
        pho: new Float32Array(7),
        mo: new Float32Array(6),
      },
    };
  } catch (err) {
    console.warn('[cimática] WebGL no disponible:', err);
    return null;
  }
}

// Reempaqueta la tabla radial de 13 columnas en las tres texturas RGBA de la
// GPU: A (r, θ, J0, grano — J0 depende del modo, así que A se re-subir con
// cada modo), B (J_mDom, J_mS1, J_mS2, J_mD1) y C (J_mD2, J_mD3, polvo, 0).
function packGL(rad, res) {
  const n = res * res;
  const A = new Float32Array(n * 4);
  const B = new Float32Array(n * 4);
  const C = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 13;
    const a4 = i * 4;
    A[a4] = rad[o];
    A[a4 + 1] = rad[o + 1];
    A[a4 + 2] = rad[o + 2];
    A[a4 + 3] = rad[o + 11];
    B[a4] = rad[o + 3];
    B[a4 + 1] = rad[o + 4];
    B[a4 + 2] = rad[o + 5];
    B[a4 + 3] = rad[o + 6];
    C[a4] = rad[o + 7];
    C[a4 + 1] = rad[o + 8];
    C[a4 + 2] = rad[o + 12];
    C[a4 + 3] = 0;
  }
  return [A, B, C];
}

// Paletas (RGB 0-255): azul profundo para los valles, blanco para los picos.
// El color de cada gota llega desde main.js con la misma paleta del
// visualizador de gotas (izquierda azul, centro morado/acento, derecha rosa);
// si no se pasa ninguno se usan cian/índigo por defecto.
const C_DEEP = [9, 22, 48];
const C_CYAN = [34, 211, 238];
const C_INDIGO = [129, 140, 248];
const C_WHITE = [238, 249, 255];

// Granulometría propia de cada plato: cada gota usa su propia mezcla de sal
// y su propio campo capilar — como tres experimentos de cimática montados
// con polvos distintos. Frecuencias entre sí irracionales evitan la rejilla
// visible y dan un moteado orgánico.
//   gk1..gk4 — frecuencias espaciales (px⁻¹ del buffer) del chisporroteo
//              capilar sobre la superficie
//   pk1..pk4 — frecuencias del moteado que rompe las líneas nodales en
//              granos de polvo (px⁻¹)
//   sand     — grosor base de la línea nodal (σ de la campana de sal)
//   pow      — fuerza del moteado (0 = línea lisa, 1 = grano grueso)
//   salt     — cantidad de polvo acumulado (brillo de la línea)
const GRAIN_SETS = [
  { gk1: 0.34, gk2: 0.41, gk3: 0.28, gk4: 0.47, pk1: 3.1, pk2: 1.7, pk3: 3.7, pk4: 2.3, sand: 0.02, pow: 0.14, salt: 1.0 },
  { gk1: 0.52, gk2: 0.29, gk3: 0.44, gk4: 0.33, pk1: 4.6, pk2: 2.4, pk3: 3.2, pk4: 3.9, sand: 0.024, pow: 0.18, salt: 1.0 },
  { gk1: 0.23, gk2: 0.55, gk3: 0.37, gk4: 0.25, pk1: 2.6, pk2: 3.3, pk3: 4.1, pk4: 1.9, sand: 0.018, pow: 0.11, salt: 0.95 },
];

// Versión oscura de un color de gota: el agua en calma se hunde hacia un
// azul noche casi negro, con solo un matiz del color de la gota — como el
// agua real bajo la luz cenital en una foto de cimática (los valles casi
// negros, nunca un azul brillante que difumine el patrón).
function shadeDeep(c) {
  return [
    Math.round(c[0] * 0.1 + C_DEEP[0] * 0.9),
    Math.round(c[1] * 0.08 + C_DEEP[1] * 0.92),
    Math.round(c[2] * 0.14 + C_DEEP[2] * 0.86),
  ];
}

export class CymaticsRenderer {
  constructor() {
    // Un buffer por gota: se renderizan aparte (resolución alta) para que
    // los anillos salgan nítidos a cualquier tamaño de pantalla, y el plato
    // se dibuja directo con un gradiente (barato y siempre nítido).
    this._drops = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas');
      this._drops.push({ canvas: c, ctx: c.getContext('2d'), img: null, res: 0, rad: null, radK: -1, pending: null });
    }
    // Transición entre frecuencias: al cambiar el modo de una gota (p. ej.
    // al pasar de un estado a otro) el patrón anterior se desvanece mientras
    // la nueva flor se despliega, en vez de saltar de golpe. _lastKey guarda
    // la clave del modo dibujado el fotograma anterior, _lastP sus
    // parámetros (modos, amplitudes, fases y escala radial) y _morph la
    // transición en curso (b: 1 → 0 durante ~3 s).
    this._lastKey = ['', '', ''];
    this._lastP = [null, null, null];
    this._morph = [null, null, null];
    // Energía de la vibración (0..1): sube cuando suena y decae cuando no,
    // modelando la constante de tiempo con que el agua real responde a la
    // excitación y se calma al cortarla. El patrón de Faraday solo emerge
    // por encima del umbral de aceleración, como en un experimento real.
    this._energy = 0;
    this._lastT = 0;
    // Fase de precesión integrada por modo (3 gotas × 9 modos rotables):
    // cada modo acumula su propia fase angular integrando su velocidad cada
    // fotograma — la precesión es lenta, decorrelada entre modos y puede
    // invertir el sentido, como el batido real entre modos casi degenerados.
    this._rotPhase = new Float64Array(3 * 9);
    this._rotSeeded = false;
    // Rendimiento adaptativo: se mide el tiempo real de cada fotograma y la
    // resolución de las gotas sube o baja despacio para mantener los FPS en
    // cualquier dispositivo (más nitidez si sobra tiempo, más suave si no).
    this._frameEMA = 16;
    this._resMul = 1;
    // Ruta GPU (WebGL2) con fallback al rasterizador CPU: si la GPU o el
    // shader no están disponibles, _gl es null y el bucle de píxeles de
    // abajo sigue funcionando igual.
    this._gl = initGL();
    this._glDrops = [
      { texA: null, texB: null, texC: null },
      { texA: null, texB: null, texC: null },
      { texA: null, texB: null, texC: null },
    ];
    this._glRes = 0;
    
    // Neural-physics coupling.
    // _physicsTarget: raw values from the neural model (set each frame).
    // _physicsState: smoothed version with physical inertia (EMA, τ ≈ 1.5 s).
    // Separating target from smoothed state prevents instant visual jumps when
    // the neural profile changes — fluids have inertia.
    this._physicsTarget = { coherence: 0.5, velocity: 0.5, complexity: 0.5, baseFrequency: 220, dominantMode: null };
    this._physicsState  = { coherence: 0.5, velocity: 0.5, complexity: 0.5, baseFrequency: 220, dominantMode: null };

    // -------------------------------------------------------------------------
    // PHASE 3: Render Mode
    // 'cinematic'  — Full artistic rendering (all layers: grain, harmonic mD,
    //                evo() modulation, rotation, color palette). Default.
    // 'scientific' — Only physically-derived layers (Bessel eigenmodes, modal
    //                pattern with detuning). No grain, no mD harmonics, no
    //                arbitrary evo() modulation. Colors are monochrome.
    //                Use to validate the physical model independently.
    // -------------------------------------------------------------------------
    this._renderMode = 'cinematic';
  }

  /**
   * Switch rendering mode.
   * @param {'cinematic'|'scientific'} mode
   */
  setRenderMode(mode) {
    if (mode !== 'cinematic' && mode !== 'scientific') {
      console.warn(`[CymaticsRenderer] Unknown renderMode "${mode}". Use "cinematic" or "scientific".`);
      return;
    }
    this._renderMode = mode;
    console.log(`[CymaticsRenderer] Render mode: ${mode.toUpperCase()}`);
  }

  getRenderMode() {
    return this._renderMode;
  }


  pulse(strength) {
    // Add energy directly based on the pulse strength
    this._energy = Math.min(1.2, this._energy + strength * 0.2);
  }

  /**
   * Called each frame by simulation.js with the neural-derived physics state.
   * Only updates the TARGET; the smoothed _physicsState is updated inside render().
   */
  updatePhysicsState(state) {
    // Write into target only — render() will EMA-smooth toward this each frame.
    this._physicsTarget.coherence     = state.coherence     ?? 0.5;
    this._physicsTarget.velocity      = state.velocity      ?? 0.5;
    this._physicsTarget.complexity    = state.complexity    ?? 0.5;
    this._physicsTarget.baseFrequency = state.baseFrequency ?? 220;
    // dominantMode is computed internally by render(); we never clobber it here.
  }

  // (Re)crea el buffer de una gota si cambió su resolución, junto con la
  // tabla radial estática (r, θ y las Bessel del patrón) que se rellena
  // cuando cambia el modo. `pending` guarda la tabla en construcción del
  // nuevo modo (se llena por tramos para no congelar el fotograma).
  _ensureDrop(d, res) {
    if (d.res === res) return;
    d.res = res;
    d.canvas.width = res;
    d.canvas.height = res;
    d.img = d.ctx.createImageData(res, res);
    // 13 valores por píxel: r, θ, J0, J_mDom, J_mS1, J_mS2, J_mD1..J_mD5,
    // grano capilar y moteado del polvo.
    d.rad = new Float32Array(res * res * 13);
    // Ondas radiales precalculadas (4 columnas por píxel): col 0 cos(k·r)
    // de la estacionaria, col 1 cos(k'·r) y col 2 sin(k'·r) de las dos
    // viajeras opuestas, col 3 sin(2k'·r) del nodo de colisión. Estáticas
    // por resolución: por fotograma solo rotan las fases (barato).
    d.rip = new Float32Array(res * res * 4);
    d.ripK = -1;
    d.radK = -1;
    d.pending = null;
  }

  // Crea una textura RGBA de coma flotante con los datos espaciales de una
  // gota: RGBA32F en WebGL2, RGBA+FLOAT (con OES_texture_float) en WebGL1.
  _makeTex(res, data) {
    const gl = this._gl.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this._gl.isGL2) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, res, res, 0, gl.RGBA, gl.FLOAT, data);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, res, res, 0, gl.RGBA, gl.FLOAT, data);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  _deleteTex(tex) {
    if (tex && this._gl) this._gl.gl.deleteTexture(tex);
  }

  // Sube las texturas de la gota i cuando la tabla radial del nuevo modo
  // terminó de construirse por tramos (la misma rejilla que usa la ruta
  // CPU). Si cambió la resolución, se recrea el lienzo GL compartido y
  // todas las texturas de las tres gotas.
  _uploadDropGL(i, pend) {
    const gd = this._glDrops[i];
    if (!this._gl || !gd) return;
    const gl = this._gl.gl;
    const res = pend.res;
    if (this._glRes !== res) {
      this._glRes = res;
      this._gl.canvas.width = res * 3;
      this._gl.canvas.height = res;
      gl.viewport(0, 0, res * 3, res);
      for (const g of this._glDrops) {
        this._deleteTex(g.texA);
        this._deleteTex(g.texB);
        this._deleteTex(g.texC);
        g.texA = null;
        g.texB = null;
        g.texC = null;
      }
    }
    const packed = packGL(pend.rad, res);
    // La textura A lleva la J0 del MODO (argScale cambia con m, n), así que
    // también se re-suben por modo, no solo por resolución: antes solo se
    // creaba si no existía y, al cambiar de estado con la misma resolución,
    // los anillos de fondo quedaban los de un modo viejo para siempre.
    if (!this._morph[i]) {
      this._deleteTex(gd.texA);
    } else if (gd.texA && !this._morph[i].texAold) {
      // Transición en curso: la flor anterior sigue usando su J0 (textura
      // A vieja) hasta que termine el fundido; se guarda aquí para
      // restaurarla en el shader (uTexAo) y liberarla al final.
      this._morph[i].texAold = gd.texA;
    }
    gd.texA = this._makeTex(res, packed[0]);
    // Durante una transición no se borran las texturas viejas al subir las
    // nuevas: la flor anterior las usa (las limpia el final de la transición
    // o el cambio de resolución). Sin transición, se reemplazan sin fuga.
    if (!this._morph[i]) {
      this._deleteTex(gd.texB);
      this._deleteTex(gd.texC);
    }
    gd.texB = this._makeTex(res, packed[1]);
    gd.texC = this._makeTex(res, packed[2]);
  }

  // Libera las texturas de la flor anterior al terminar una transición.
  _releaseMorphTex(i) {
    const m = this._morph[i];
    if (!m || !this._gl) return;
    const gd = this._glDrops[i];
    if (gd) {
      if (m.texBold && m.texBold !== gd.texB) this._gl.gl.deleteTexture(m.texBold);
      if (m.texCold && m.texCold !== gd.texC) this._gl.gl.deleteTexture(m.texCold);
      if (m.texAold && m.texAold !== gd.texA) this._gl.gl.deleteTexture(m.texAold);
    }
  }

  /**
   * Dibuja la simulación en el contexto principal.
   * @param {CanvasRenderingContext2D} ctx  contexto del lienzo visible
   * @param {number} w  ancho del lienzo en píxeles de dispositivo
   * @param {number} h  alto del lienzo en píxeles de dispositivo
   * @param {object} params { base, beat, playing, pulse }
   *   base: frecuencia portadora (f1, 220 Hz por defecto)
   *   beat: latido binaural (Δf)
   *   playing: si la sesión está sonando
   *   pulse: 0..1, fase del latido real (1 = justo en el pulso)
   */
  render(ctx, w, h, params) {
    const { base = 220, beat = 6, pulse = 0.5, colors, playing = true, condition = 'binaural' } = params;
    // Condiciones con batido real (binaural/AM): la placa respira con el
    // latido. Las demás (tono puro, ruido, silencio) respiran a ritmo natural.
    const rhythmicCond = () => condition === 'binaural' || condition === 'amplitude-modulation';

    // PHASE 3: Render Mode gate. All artistic (HEURISTIC/VISUAL) layers are
    // disabled in 'scientific' mode so only physically-derived Bessel eigenmodes
    // are rendered. This allows the physical model to be validated independently.
    const sciMode = this._renderMode === 'scientific';

    const tMs = performance.now();
    const t = tMs / 1000;

    // ----- Energía de la vibración (decaimiento real) ----------------------
    // Al arrancar, el patrón emerge en ~0,6 s; al cortar, se apaga suave
    // (el agua se calma con su amortiguación).
    if (this._lastT === 0) this._lastT = t;
    const dt = Math.min(0.1, t - this._lastT);
    this._lastT = t;

    // SILENCE control: no hay estímulo → la placa no se excita (agua en
    // calma). Las demás condiciones mantienen la energía de vibración.
    const target = playing && condition !== 'none' ? 1 : 0;
    this._energy += (target - this._energy) * (1 - Math.exp(-dt / 0.7));
    const env = this._energy;

    // --- FIX P5: EMA-smooth physicsState toward physicsTarget (τ = 1.5 s) ---
    // When playing, track the neural model. When not playing, decay toward
    // a physical resting state (coherence→0.5, velocity→0.2).
    // This gives the fluid system inertia: profile changes appear gradually,
    // not as instant visual jumps.
    const TAU_PHYS = 1.5; // seconds time-constant for physics state smoothing
    const emaK = 1 - Math.exp(-dt / TAU_PHYS);
    if (playing) {
      // La condición experimental define el régimen de la placa (Fase 16):
      //   binaural           → interferencia de dos frecuencias (coherencia media)
      //   pure-tone          → patrón estacionario de UN tono (coherencia alta,
      //                        complejidad baja: la flor simétrica del plato)
      //   amplitude-mod...   → portadora con envolvente (velocidad alta)
      //   noise              → régimen turbulento (coherencia baja, complejidad
      //                        y velocidad altas: la estructura se rompe)
      //   none               → reposo (la placa no se excita)
      const CT = {
        binaural:               { coherence: 0.6, velocity: 0.5, complexity: 0.55 },
        'pure-tone':            { coherence: 0.85, velocity: 0.25, complexity: 0.25 },
        'amplitude-modulation': { coherence: 0.7, velocity: 0.65, complexity: 0.5 },
        noise:                  { coherence: 0.25, velocity: 0.85, complexity: 0.85 },
        none:                   { coherence: 0.5, velocity: 0.2, complexity: 0.3 },
      };
      const ct = CT[condition] || CT.binaural;
      this._physicsTarget.coherence     = ct.coherence;
      this._physicsTarget.velocity      = ct.velocity;
      this._physicsTarget.complexity    = ct.complexity;
      this._physicsTarget.baseFrequency = base;
      this._physicsState.coherence     += (this._physicsTarget.coherence     - this._physicsState.coherence)     * emaK;
      this._physicsState.velocity      += (this._physicsTarget.velocity      - this._physicsState.velocity)      * emaK;
      this._physicsState.complexity    += (this._physicsTarget.complexity    - this._physicsState.complexity)    * emaK;
      this._physicsState.baseFrequency += (this._physicsTarget.baseFrequency - this._physicsState.baseFrequency) * emaK;
    } else {
      // FIX P2: Decay toward neutral resting state when not playing.
      // Relaxation rate is 2× slower than excitation (fluids calm gradually).
      const TAU_REST = 3.0;
      const restK = 1 - Math.exp(-dt / TAU_REST);
      this._physicsState.coherence     += (0.5 - this._physicsState.coherence)     * restK;
      this._physicsState.velocity      += (0.2 - this._physicsState.velocity)      * restK;
      this._physicsState.complexity    += (0.3 - this._physicsState.complexity)    * restK;
      this._physicsState.baseFrequency += (base  - this._physicsState.baseFrequency) * restK;
    }
    const coherence = this._physicsState.coherence;
    const velocity  = this._physicsState.velocity;
    const pBase     = this._physicsState.baseFrequency;

    // Transición suave 0.18..0.85 (el reposo 0.38 queda a ~22% de amplitud).
    let pat;
    if (env <= 0.18) pat = 0;
    else if (env >= 0.85) pat = 1;
    else pat = (env - 0.18) / 0.67;
    let ampPattern = pat * pat * (3 - 2 * pat); // suavizado
    // AMPLITUDE MODULATION: la placa entera respira a la velocidad de la
    // envolvente real — el patrón crece y se retira con la modulación, no
    // solo brilla (la estructura varía con la señal, como en el agua).
    if (condition === 'amplitude-modulation') {
      const pe = playing ? pulse : 0.5;
      ampPattern *= 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(TWO_PI * pe));
    }
    const alive = 0.12 + 0.88 * env * env;
    const pulseEff = playing ? pulse : 0.5;
    const gain = 0.08 + 0.04 * ampPattern;
    const mid = 0.06 + 0.03 * ampPattern;

    // Fondo oscuro de la escena (#0b0d12).
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, w, h);

    const R = Math.min(w, h) * 0.46; // radio del plato
    const cx = w / 2;
    const cy = h / 2;

    // --- FIX P1: Decouple center drop from binaural beat -------------------
    // BEFORE (architecture violation):
    //   center drop f = beat * (0.5 + complexity)  → beat drives Faraday pattern
    //
    // AFTER (physically grounded):
    //   center drop f = resonant frequency of the dominant eigenmode
    //   for the binaural beat value, using the same dispersion relation
    //   as the other drops. This means the center drop visualizes the
    //   nearest physical resonance to the beat, not the beat itself.
    //   It is a visualization of how the physical system would respond
    //   IF excited near that frequency — a modal metaphor, not a causal claim.
    //
    // NOTE: The binaural beat (Δf) remains the STIMULUS; the visual system
    // maps it to the nearest physical eigenmode. These are distinct quantities.
    // En PURE TONE no hay batido: la gota central se afina a la resonancia
    // de la propia portadora — el plato vibra en un único modo estacionario.
    const ws_beat = Math.PI * Math.max(1, rhythmicCond() ? beat : base); // sub-harmonic of beat
    let bestD_beat = Infinity;
    let m_beat = 2, n_beat = 1;
    for (let mm = 2; mm <= 6; mm++) {
      for (let n2 = 1; n2 <= 6; n2++) {
        const w = modeOmega(mm, n2, PHYS_A);
        const dd = Math.abs(w - ws_beat);
        if (dd < bestD_beat) { bestD_beat = dd; m_beat = mm; n_beat = n2; }
      }
    }
    // The center drop's "frequency" is set to the resonant frequency of the
    // nearest eigenmode (ω_res / π → f_res), NOT the beat frequency itself.
    // This correctly represents a physically resonant mode near the stimulus.
    const ws_res_beat = modeOmega(m_beat, n_beat, PHYS_A);
    const f_center = ws_res_beat / Math.PI; // resonant frequency (Hz) of the mode

    // Store dominant mode for HUD display
    this._physicsState.dominantMode = { m: m_beat, n: n_beat, omega: ws_res_beat, detuning: ws_res_beat - ws_beat };

    const dropR = R * 0.27;
    const step = dropR * 2.2;
    // PHASE 3: In Scientific Mode use neutral monochrome palette so color is
    // not confused with physical data. In Cinematic Mode use the profile colors.
    const C_SCI_WHITE = [220, 220, 240]; // near-white for scientific clarity
    const sciPals = [C_SCI_WHITE, C_SCI_WHITE, C_SCI_WHITE];
    const dropPals = sciMode ? sciPals : (colors && colors.length === 3 ? colors : [C_CYAN, C_INDIGO, C_CYAN]);
    // NOISE: la turbulencia desentona las gotas — un ligero vaivén de
    // frecuencia alrededor de la portadora rompe el patrón estacionario y
    // las flores se reorganizan continuamente (la estructura se agita).
    const nzW = (i) => 0.5 * Math.sin(t * 7.3 + i * 2.7) + 0.5 * Math.sin(t * 3.1 + i * 5.9);
    const fR = condition === 'noise' ? 1 + 0.04 * nzW(0) : 1;
    const fC = condition === 'noise' ? 1 + 0.04 * nzW(1) : 1;
    const fL = condition === 'noise' ? 1 + 0.04 * nzW(2) : 1;
    const drops = [
      { x: cx - step, f: pBase * fR,                 p0: 0.0, pal: dropPals[0], deep: shadeDeep(dropPals[0]) },
      { x: cx,        f: Math.max(1, f_center) * fC, p0: 2.1, pal: dropPals[1], deep: shadeDeep(dropPals[1]) },
      { x: cx + step, f: (rhythmicCond() ? pBase + beat : pBase) * fL, p0: 4.2, pal: dropPals[2], deep: shadeDeep(dropPals[2]) },
    ];
    // Transición de afinación: cuando cambia la portadora, el latido o la
    // condición (p. ej. binaural → tono puro, que hace f2 = f1), las gotas
    // se afinan GRADUALMENTE con la misma EMA (τ = 1,5 s) que el resto de la
    // física — los modos dominantes se reorganizan poco a poco, sin que el
    // patrón salte de golpe. El ruido conserva su vaivén sobre el valor suave.
    if (!this._dropF) this._dropF = [pBase, pBase, pBase];
    for (let i = 0; i < 3; i++) {
      this._dropF[i] += (drops[i].f - this._dropF[i]) * emaK;
      drops[i].f = Math.max(0.5, this._dropF[i]);
    }
    const n = drops.length;

    // Evolución lenta de los modos: cada modo intercambia peso con los demás
    // a lo largo de minutos (períodos de ~3 a 7 min, desincronizados por
    // gota), como el acoplamiento no lineal de los modos de una placa real.
    // Una segunda onda más rápida (~tens de segundos) reorganiza la forma
    // de forma perceptible: el patrón cambia de silueta y nunca se repite
    // exacto — menos estático, más cimática viva.
    // VISUALIZATION MODEL (not physical): evo() is an artistic amplitude
    // oscillation with no physical derivation. In real cymatics, modal
    // amplitudes are determined by excitation power and damping quality factor Q,
    // not arbitrary sinusoidal envelopes. This function is kept because it
    // produces a visually compelling, dynamic pattern that suggests modal
    // coupling without claiming to simulate it. It is labeled here explicitly.
    // PHASE 3: disabled entirely in Scientific Mode.
    const evo = sciMode
      ? (_period, _phase) => 1 // PHYSICAL ONLY: no artistic amplitude modulation
      : (period, phase) =>
          1 +
          0.42 * Math.sin((TWO_PI * t) / period + phase) +
          0.18 * Math.sin((TWO_PI * t) / (period * 0.14) + phase * 1.7);

    // Física por gota: cada gota se afina al modo angular (m, n) cuya
    // resonancia cae más cerca de la excitación ω_s = π·f, como se afina un
    // plato cimático (o un cuenco cantor) al tono que lo hace vibrar. El
    // modo dominante produce la flor característica de la cimática real — m
    // pétalos sobre n−1 anillos concéntricos — y cambia con la frecuencia:
    // a más tono, más pétalos y más anillos. La gota central (el latido)
    // usa un modo de 2 a 5 pétalos según la frecuencia del latido.
    const mDom = new Array(n);
    const nDom = new Array(n);
    // Peso del modo radial J0 (los anillos concéntricos de fondo).
    const amp0 = new Array(n);
    // Peso y rotación del modo dominante. La rotación de un modo e^{imθ}
    // desafiinado en δ es δ/m: esa es la precesión REAL que se observa en
    // cimática — lenta, con vaivén y dirigida por el signo de δ, no un giro
    // uniforme de reloj (ver rotSpeed más abajo).
    const ampDom = new Array(n);
    const rotDom = new Array(n);
    const phaseDom = new Array(n);
    // Dos modos angulares vecinos (m±1, m±2) para dar textura: su amplitud
    // sigue la resonancia de Lorentz (aportan más cuanto más cerca están de
    // la excitación) pero con un suelo mínimo para que la textura siempre
    // se vea, como las subestructuras que excita la no linealidad real.
    const mS1 = new Array(n);
    const mS2 = new Array(n);
    const ampS1 = new Array(n);
    const ampS2 = new Array(n);
    const rotS1 = new Array(n);
    const rotS2 = new Array(n);
    const phaseS1 = new Array(n);
    const phaseS2 = new Array(n);
    // Modos de detalle mandala (patrones dentro de patrones): el doble, el
    // triple, el cuádruple, el quíntuple y el séxtuple de pétalos que el
    // dominante. Siempre activos (mientras quepan: 2m/3m ≤ 12, 4m ≤ 16 y
    // 5m/6m ≤ 18) y con peso reducido a filigrana sutil: dibujan puntas
    // internas dentro de cada pétalo y filigrana en cascada dentro de los
    // anillos — el efecto mandala de la cimática real — pero la flor
    // dominante sigue siendo la que manda y el patrón se lee limpio.
    const mD1 = new Array(n);
    const mD2 = new Array(n);
    const mD3 = new Array(n);
    const mD4 = new Array(n);
    const mD5 = new Array(n);
    const ampD1 = new Array(n);
    const ampD2 = new Array(n);
    const ampD3 = new Array(n);
    const ampD4 = new Array(n);
    const ampD5 = new Array(n);
    const rotD1 = new Array(n);
    const rotD2 = new Array(n);
    const rotD3 = new Array(n);
    const rotD4 = new Array(n);
    const rotD5 = new Array(n);
    const phaseD1 = new Array(n);
    const phaseD2 = new Array(n);
    const phaseD3 = new Array(n);
    const phaseD4 = new Array(n);
    const phaseD5 = new Array(n);
    // Componente contrarrotante del modo dominante (degeneración ±m): el
    // batido entre ambos hace que los pétalos se abran y cierren suavemente
    // mientras el patrón gira, como en el agua real.
    const ampBeat = new Array(n);
    const rotBeat = new Array(n);
    const phaseBeat = new Array(n);
    // Precesión NATURAL del patrón (no un giro de reloj): en cimática real
    // la flor casi no rota — se desliza despacio y con vaivén, como el
    // batido entre los modos degenerados ±m de una cuenca ligeramente
    // desafiinada. La dirección la da el signo del desafiño δ de cada gota,
    // la magnitud crece con |δ| (un plato justo en resonancia sostiene el
    // patrón casi quieto; desafiinado, deriva) y responde al latido que se
    // oye: los estados de sueño quedan casi inmóviles y gamma se mueve apenas
    // más vivo. Dos ondas lentas incommensurables hacen que el patrón frene,
    // acelere y a veces invierta el sentido — nunca un giro uniforme.
    // beatFactor: modulates precession speed using the binaural beat (stimulus)
    // and neural velocity (model). This is a visual metaphor — faster beats
    // → slightly livelier rotation — but is not a derived physical quantity.
    // The factor 1/8 provides approximate normalization over typical beat ranges.
    const beatFactor = Math.max(0.55, Math.min(1.45, beat / 8)) * (0.5 + velocity);
    // Velocidad angular instantánea de un modo (rad/s). La precesión real de
    // Faraday es lentísima (una vuelta cada ~10-25 min) y la dirección NO es
    // fija: la deriva cruza por cero y el patrón a veces invierte el sentido.
    // El desafiño solo matiza la magnitud; la semilla de fase distinta por
    // modo decorrela el giro de cada capa (no giran en bloque).
    const rotSpeed = (delta, phase) => {
      const detune = 0.6 + Math.min(0.8, Math.abs(delta) / 80);
      const wander =
        Math.sin(TWO_PI * 0.011 * t + phase) +
        0.55 * Math.sin(TWO_PI * 0.017 * t + phase * 2.3) +
        0.3 * Math.sin(TWO_PI * 0.031 * t + phase * 5.1);
      return 0.014 * beatFactor * detune * (0.5 + 0.75 * wander) * (0.2 + velocity * 1.5);
    };
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      const ws = Math.PI * d.f; // ω_s = π·f (respuesta subarmónica)
      let m = 2;
      let nn = 1;
      let delta = 0;
      if (i === 1) {
        // Gota del latido: pétalos ∝ frecuencia del latido (2 a 5) y un
        // par de anillos extra para que se lea como un pequeño mandala.
        m = Math.min(5, Math.max(2, 1 + Math.floor(d.f / 8)));
        nn = Math.min(6, ringsFor(d.f) + 2);
        delta = modeOmega(m, nn, PHYS_A) - ws;
      } else {
        // PHASE 8: Improved mode selection for carrier drops.
        // Primary search: angular modes m ∈ [2, 6] that produce the petal
        // (flower) patterns characteristic of Faraday waves.
        // Fallback: if the best m≥2 mode is detuned by more than 2·Γ(f),
        // extend the search to m=0 (concentric rings) and m=1 (one-arm
        // spiral). These are physical Bessel modes that appear in real cymatics
        // at very low excitation frequencies where no m≥2 mode is near resonance.
        let bestD = Infinity;
        for (let mm = 2; mm <= 6; mm++) {
          for (let n2 = 1; n2 <= 10; n2++) {
            const ww = modeOmega(mm, n2, PHYS_A);
            const dd = Math.abs(ww - ws);
            if (dd < bestD) {
              bestD = dd;
              m = mm;
              nn = n2;
              delta = ww - ws;
            }
          }
        }
        // PHASE 8 fallback: extend to m=0,1 if detuning exceeds 2·Γ.
        const twoGamma = 2 * gammaAt(d.f);
        if (bestD > twoGamma) {
          for (let mm = 0; mm <= 1; mm++) {
            for (let n2 = 1; n2 <= 10; n2++) {
              const ww = modeOmega(mm, n2, PHYS_A);
              const dd = Math.abs(ww - ws);
              if (dd < bestD) {
                bestD = dd;
                m = mm;
                nn = n2;
                delta = ww - ws;
              }
            }
          }
        }
      }
      mDom[i] = m;
      nDom[i] = nn;
      // Los patrones pequeños (pocos pétalos, como el latido de
      // concentración) ganan riqueza interna: cuanto menor es m, más peso
      // llevan las capas de detalle mandala (2m/3m/4m…) para que la flor
      // se lea definida y llena, nunca un dibujo escueto y desdibujado.
      const rich = 1 + (6 - Math.min(6, m)) * 0.15;
      // La filigrana responde al latido: en cada pulso el detalle mandala
      // surge (los pétalos se llenan de subestructura) y entre latidos se
      // retira — la ESTRUCTURA varía con el sonido, no solo el brillo.
      // Modulated by coherence: high coherence -> structured pulses, low coherence -> chaotic
      const detailPulse = (0.55 + 0.9 * pulseEff) * (0.5 + coherence);
      // Anillos de fondo siempre presentes y con peso alto: son los que
      // definen la estructura de los patrones simples, y respiran.
      amp0[i] = 0.8 * (1 + 0.16 * Math.sin(TWO_PI * 0.17 * t + d.p0 * 1.9)) * coherence;
      // La flor dominante es la protagonista: peso máximo para que el
      // patrón se lea limpio y definido. Las capas de detalle mandala
      // (2m/3m/4m…) quedan como filigrana sutil dentro de los pétalos, sin
      // recargar el conjunto. Su amplitud respira (la flor crece y se
      // encoge) y los vecinos se mueven en contrafase: la forma varía y
      // oscila continuamente, como ondas que chocan y se reorganizan.
      ampDom[i] =
        1.0 *
        evo(240, d.p0 * 1.1) *
        (1 + 0.24 * Math.sin(TWO_PI * 0.14 * t + d.p0 * 2.4) +
          0.12 * Math.sin(TWO_PI * 0.33 * t + d.p0 * 5.2));
      // Precesión integrada: la fase ya incluye la evolución temporal.
      // NOISE: precesión turbulenta — las flores se agitan sin rumbo fijo.
      rotDom[i] = this._rotPhase[i * 9 + 0] + (condition === 'noise' ? 0.35 * Math.sin(t * 11.3 + d.p0 * 3.1) + 0.25 * Math.sin(t * 17.7 + d.p0 * 7.7) : 0);
      phaseDom[i] = d.p0 * 1.3;
      // Modos secundarios: los dos vecinos angulares más cercanos en
      // resonancia (dentro de m±2), con amplitud de Lorentz y suelo mínimo.
      const cands = [];
      for (let dm = -2; dm <= 2; dm++) {
        const mm = m + dm;
        if (dm === 0 || mm < 1 || mm > 6) continue;
        cands.push({ mm, dd: Math.abs(modeOmega(mm, nn, PHYS_A) - ws) });
      }
      cands.sort((a, b) => a.dd - b.dd);
      const s1 = cands[0];
      const s2 = cands.length > 1 ? cands[1] : cands[0];
      mS1[i] = s1.mm;
      mS2[i] = s2.mm;
      const d1 = modeOmega(s1.mm, nn, PHYS_A) - ws;
      const d2 = modeOmega(s2.mm, nn, PHYS_A) - ws;
      // Vecinos casi resonantes: con un suelo más alto, a veces la flor
      // vecina (m±1) se acerca a la dominante y la silueta gana/pieree
      // pétalos de forma gradual — como cuando el plato real cae entre dos
      // resonancias y el patrón se reorganiza.
      // PHASE 8: Pass drop frequency to lorentz() so Γ is frequency-dependent.
      ampS1[i] =
        (0.16 + 0.26 * lorentz(d1, d.f)) *
        evo(170, d.p0 * 1.6) *
        (1 + 0.45 * Math.sin(TWO_PI * 0.14 * t + d.p0 * 2.4 + Math.PI)); // contrafase con la flor
      ampS2[i] =
        (0.1 + 0.18 * lorentz(d2, d.f)) *
        evo(300, d.p0 * 2.2) *
        (1 + 0.35 * Math.sin(TWO_PI * 0.21 * t + d.p0 * 4.6));
      rotS1[i] = this._rotPhase[i * 9 + 1];
      rotS2[i] = this._rotPhase[i * 9 + 2];
      phaseS1[i] = d.p0 * 1.7;
      phaseS2[i] = d.p0 * 2.1;
      // Modos de detalle mandala: 2m y 3m pétalos sobre los mismos anillos.
      // Cada uno integra su propia precesión (lenta y con deriva propia):
      // la filigrana interna se desliza despacio dentro de los pétalos, sin
      // girar en bloque con la flor, y su amplitud tiene suelo visible (la
      // resonancia solo la matiza).
      // VISUALIZATION MODEL (not physical): mD harmonic layers use multiples
      // of the dominant angular mode (2m, 3m, 4m, 5m, 6m). In real non-linear
      // cymatics, higher harmonics ARE excited when the system is driven beyond
      // the linear regime, but the specific multiples and their relative amplitudes
      // here are not derived from a non-linear model — they are heuristic choices
      // that produce a mandala-like visual effect. They are kept as an explicit
      // artistic layer within the physics-visualization pipeline.
      const m2 = m * 2 <= 12 ? m * 2 : -1;
      const m3 = m * 3 <= 12 ? m * 3 : -1;
      mD1[i] = m2;
      mD2[i] = m3;
      if (m2 >= 1 && !sciMode) {
        // Capa 2m (el doble de pétalos): filigrana sutil (~¼ del peso de la
        // flor) que dibuja puntas internas sin competir con la flor.
        // PHASE 8: Pass drop frequency to lorentz() for frequency-dependent Γ.
        ampD1[i] = (0.16 + 0.06 * lorentz(modeOmega(m2, nn, PHYS_A) - ws, d.f)) * evo(200, d.p0 * 2.7) * rich * detailPulse;
        rotD1[i] = this._rotPhase[i * 9 + 3];
        phaseD1[i] = d.p0 * 2.6 + 0.5;
      } else {
        ampD1[i] = 0;
        rotD1[i] = 0;
        phaseD1[i] = 0;
      }
      if (m3 >= 1 && !sciMode) {
        // Capa 3m (el triple de pétalos): filigrana fina de tercer nivel,
        // discreta, para no recargar la flor.
        ampD2[i] = (0.1 + 0.045 * lorentz(modeOmega(m3, nn, PHYS_A) - ws, d.f)) * evo(260, d.p0 * 3.3) * rich * detailPulse;
        rotD2[i] = this._rotPhase[i * 9 + 4];
        phaseD2[i] = d.p0 * 3.1 + 1.1;
      } else {
        ampD2[i] = 0;
        rotD2[i] = 0;
        phaseD2[i] = 0;
      }
      // Capa 4m (el cuádruple de pétalos): filigrana de cuarto nivel, muy
      // fina, que solo asoma en los anillos exteriores.
      const m4 = m * 4 <= 16 ? m * 4 : -1;
      mD3[i] = m4;
      if (m4 >= 1 && !sciMode) {
        ampD3[i] = (0.055 + 0.03 * lorentz(modeOmega(m4, nn, PHYS_A) - ws, d.f)) * evo(330, d.p0 * 3.8) * rich * detailPulse;
        rotD3[i] = this._rotPhase[i * 9 + 5];
        phaseD3[i] = d.p0 * 3.6 + 1.6;
      } else {
        ampD3[i] = 0;
        rotD3[i] = 0;
        phaseD3[i] = 0;
      }
      // Capa 5m (el quíntuple de pétalos): filigrana de quinto nivel,
      // mínima, apenas perceptible en los patrones calmados (m = 2 y 3).
      const m5 = m * 5 <= 18 ? m * 5 : -1;
      mD4[i] = m5;
      if (m5 >= 1 && !sciMode) {
        ampD4[i] = (0.04 + 0.02 * lorentz(modeOmega(m5, nn, PHYS_A) - ws, d.f)) * evo(380, d.p0 * 4.3) * rich;
        rotD4[i] = this._rotPhase[i * 9 + 6];
        phaseD4[i] = d.p0 * 4.1 + 2.0;
      } else {
        ampD4[i] = 0;
        rotD4[i] = 0;
        phaseD4[i] = 0;
      }
      // Capa 6m (el séxtuple de pétalos): la filigrana más fina del mandala,
      // solo un matiz en los patrones más simples.
      const m6 = m * 6 <= 18 ? m * 6 : -1;
      mD5[i] = m6;
      if (m6 >= 1 && !sciMode) {
        ampD5[i] = (0.028 + 0.015 * lorentz(modeOmega(m6, nn, PHYS_A) - ws, d.f)) * evo(430, d.p0 * 4.8) * rich;
        rotD5[i] = this._rotPhase[i * 9 + 7];
        phaseD5[i] = d.p0 * 4.6 + 2.4;
      } else {
        ampD5[i] = 0;
        rotD5[i] = 0;
        phaseD5[i] = 0;
      }
      // Batido de la flor: componente con el mismo m que la dominante pero
      // girando en sentido opuesto (degeneración ±m): los pétalos se abren
      // y cierran de forma bien visible, con oleadas lentas — la
      // respiración crece y mengua, no es un latido constante — como el
      // batido real entre modos casi degenerados que va y viene.
      // PHASE 3: ampBeat (counter-rotating degenerate mode visual proxy) is disabled in sciMode
      ampBeat[i] = sciMode ? 0 : 
        0.72 * evo(290, d.p0 * 2.9) *
        (0.4 + 0.6 * Math.sin(TWO_PI * 0.07 * t + d.p0 * 4.0));
      rotBeat[i] = this._rotPhase[i * 9 + 8];
      phaseBeat[i] = d.p0 * 1.9 + 0.7;

      // ----- Integración de la precesión --------------------------------
      // Cada modo suma su propia velocidad angular (lenta, con deriva que
      // cruza por cero) a su fase acumulada; en el primer fotograma se
      // siembra cada fase con su semilla para que las tres gotas y cada
      // capa arranquen desfasadas — sin sincronía entre sí.
      const L = i * 9;
      if (!this._rotSeeded) {
        this._rotPhase[L + 0] = d.p0 * 1.3;
        this._rotPhase[L + 1] = d.p0 * 1.7;
        this._rotPhase[L + 2] = d.p0 * 2.1;
        this._rotPhase[L + 3] = d.p0 * 2.6 + 0.5;
        this._rotPhase[L + 4] = d.p0 * 3.1 + 1.1;
        this._rotPhase[L + 5] = d.p0 * 3.6 + 1.6;
        this._rotPhase[L + 6] = d.p0 * 4.1 + 2.0;
        this._rotPhase[L + 7] = d.p0 * 4.6 + 2.4;
        this._rotPhase[L + 8] = d.p0 * 1.9 + 0.7;
      }
      this._rotPhase[L + 0] += rotSpeed(delta, d.p0 * 1.3) * alive * dt;
      this._rotPhase[L + 1] += rotSpeed(d1, d.p0 * 1.7) * alive * dt;
      this._rotPhase[L + 2] += rotSpeed(d2, d.p0 * 2.1) * alive * dt;
      this._rotPhase[L + 3] += rotSpeed(delta, d.p0 * 2.6) * alive * dt;
      this._rotPhase[L + 4] += rotSpeed(delta, d.p0 * 3.1) * alive * dt;
      this._rotPhase[L + 5] += rotSpeed(delta, d.p0 * 3.6) * alive * dt;
      this._rotPhase[L + 6] += rotSpeed(delta, d.p0 * 4.1) * alive * dt;
      this._rotPhase[L + 7] += rotSpeed(delta, d.p0 * 4.6) * alive * dt;
      // La contrarrotante (±m) integra su propia fase a media velocidad:
      // los pétalos abren y cierran suavemente mientras el patrón deriva.
      this._rotPhase[L + 8] += -0.5 * rotSpeed(delta, d.p0 * 1.9) * alive * dt;
    }
    this._rotSeeded = true;
    // Solo las condiciones con batido real (binaural/AM) respiran al ritmo
    // del latido; las demás respiran a un ritmo natural lento.
    const visBeat = rhythmicCond() ? beat : 0.09;
    const wobA = new Array(n);
    for (let i = 0; i < n; i++) {
      // El borde de cada gota respira con el latido (la amplitud del patrón
      // vibra con el pulso real del AudioContext); en pausa queda quieto.
      wobA[i] = 1 + 0.06 * Math.sin(TWO_PI * visBeat * t + drops[i].p0) * alive;
    }
    // Oscilación natural: cada modo tiembla a su propio ritmo (shimmer
    // desincronizado, como el batido real entre modos casi degenerados) y
    // las ondas radiales —estacionaria + viajera— hacen ondular los
    // anillos hacia dentro y hacia fuera de forma visible: el agua se ve
    // vibrar en lugar de un patrón fijo. En pausa todo se atenúa con alive.
    const shim0 = new Array(n);
    const shimDom = new Array(n);
    const shimS1 = new Array(n);
    const shimS2 = new Array(n);
    const shimD1 = new Array(n);
    const shimD2 = new Array(n);
    const shimD3 = new Array(n);
    const shimBeat = new Array(n);
    const ripAmp = new Array(n);
    const ripCos = new Array(n);
    const ripTravel = new Array(n);
    const ripIn = new Array(n);
    // Nodo de colisión: el patrón de interferencia de las dos ondas
    // opuestas (el cruce donde la superficie se levanta) respira lento —
    // los nodos aparecen, se sostienen y se disuelven, como el batido de
    // dos trenes de ondas reales cruzándose.
    const ripCol = new Array(n);
    const cosCol = new Array(n);
    // Viveza de la vibración: reproduciendo el agua "vibra" con un temblor
    // fino (6-12 % por modo); en pausa se atenúa para que la pantalla se
    // calme al interrumpir la sesión.
    const vib = 0.3 + 0.7 * alive;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      // Vibración viva: cada modo tiembla a su propio ritmo con dos
      // frecuencias desincronizadas (las líneas nodales se mueven y el
      // patrón oscila, pero siguen nítidas porque se redibujan cada
      // fotograma — el agua vibra, no se difumina).
      shim0[i] =
        1 +
        0.16 * vib * Math.sin(TWO_PI * 0.55 * t + d.p0 * 0.9) +
        0.08 * vib * Math.sin(TWO_PI * 1.13 * t + d.p0 * 3.3);
      shimDom[i] =
        1 +
        0.22 * vib * Math.sin(TWO_PI * 0.62 * t + d.p0 * 1.6) +
        0.1 * vib * Math.sin(TWO_PI * 1.27 * t + d.p0 * 4.4);
      shimS1[i] = 1 + 0.24 * vib * Math.sin(TWO_PI * 0.78 * t + d.p0 * 2.9);
      shimS2[i] = 1 + 0.26 * vib * Math.sin(TWO_PI * 0.83 * t + d.p0 * 3.7);
      shimD1[i] = 1 + 0.3 * vib * Math.sin(TWO_PI * 0.9 * t + d.p0 * 4.3);
      shimD2[i] = 1 + 0.27 * vib * Math.sin(TWO_PI * 0.97 * t + d.p0 * 5.1);
      shimD3[i] = 1 + 0.24 * vib * Math.sin(TWO_PI * 1.03 * t + d.p0 * 5.9);
      shimBeat[i] = 1 + 0.28 * vib * Math.sin(TWO_PI * 0.33 * t + d.p0 * 2.4);
      // Ondas radiales estacionarias + dos viajeras opuestas: los anillos
      // ondulan hacia dentro y hacia fuera a la vez — la onda que nace en
      // el centro y la que rebota del borde se cruzan e interfieren, como
      // en un experimento real. Las dos viajeras NO tienen amplitud fija:
      // crecen y menguan alternadas (desfase 2,1 rad), de modo que el tren
      // saliente domina un instante y el entrante el siguiente — el choque
      // recorre el radio y se ve la colisión moverse por los anillos, en
      // vez de una ondulación uniforme. Cada pulso del latido dispara una
      // oleada más fuerte (el impacto se siente en el agua).
      const surf = TWO_PI * 0.11 * t + d.p0 * 2.7;
      const pulseRip = 0.5 + 0.9 * pulseEff;
      ripAmp[i] = 0.2 * alive * (0.5 + 0.6 * pulseEff);
      ripCos[i] = Math.cos(TWO_PI * 0.5 * t + d.p0 * 1.1);
      ripTravel[i] = 0.17 * alive * pulseRip * (0.5 + 0.5 * Math.cos(surf));
      ripIn[i] = 0.17 * alive * pulseRip * (0.5 + 0.5 * Math.cos(surf + 2.1));
      // El nodo de colisión es la interferencia de DOS ondas; sin batido
      // (tono puro/ruido/silencio) apenas asoma.
      ripCol[i] = (rhythmicCond() ? 0.11 : 0.045) * alive * (0.4 + 0.6 * Math.sin(TWO_PI * 0.09 * t + d.p0 * 1.7));
      cosCol[i] = Math.cos(TWO_PI * 0.07 * t + d.p0 * 1.3);
    }
    // Amplitud general: el patrón brilla con el latido real (pulseEff) y
    // con la energía de la vibración (umbral de Faraday). El suelo se fija
    // al 60 % para que el patrón no se apague entre latidos — las líneas
    // nodales se leen siempre nítidas, sin parpadeo difuso — y cada pulso
    // se ve como una oleada de brillo que recorre el agua; en pausa
    // (pulseEff = 0.5) la amplitud queda estable.
    const amp = (0.6 + 0.4 * pulseEff) * ampPattern;
    // Oleada lenta de energía: la superficie entera crece y mengua suavemente
    // (~0,07 Hz, ±18 %), como el agua real balanceándose en la cuenca.
    const swell = 1 + 0.16 * Math.sin(TWO_PI * 0.09 * t + 1.7);

    // ----- Plato: gradiente oscuro + borde -------------------------------
    const dish = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    dish.addColorStop(0, '#0e1a30');
    dish.addColorStop(0.7, '#0a1220');
    dish.addColorStop(1, '#05070d');
    ctx.fillStyle = dish;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.fill();
    // Luz cenital sobre el plato: un reflejo suave y amplio que le da
    // profundidad de agua bajo un foco, sin robar protagonismo al patrón.
    const sheen = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
    sheen.addColorStop(0, 'rgba(125, 175, 255, 0.08)');
    sheen.addColorStop(0.45, 'rgba(125, 175, 255, 0.025)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.85, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.stroke();

    // ----- Gotas: cada una en su propio buffer de alta resolución --------
    // En la ruta GPU las tres gotas comparten un lienzo GL de 3·res × res,
    // así que todas usan la misma resolución (la mayor que necesiten).
    let glResAll = 0;
    if (this._gl) {
      let maxNeed = 0;
      for (let i = 0; i < n; i++) {
        maxNeed = Math.max(maxNeed, Math.max(nDom[i] * 16, dropR * 2));
      }
      glResAll = Math.max(48, Math.min(320, Math.round(maxNeed * this._resMul)));
    }
    // En pausa profunda (sin patrón y sin transición en curso) no hay nada
    // que calcular píxel a píxel: se dibuja una lente de agua quieta, barata,
    // y se ahorra toda la CPU del bucle (batería y fluidez del resto de la
    // página). Al volver a sonar, el patrón emerge desde el agua limpia.
    const anyMorph = this._morph.some((m) => m && m.b > 0);
    if (ampPattern < 0.02 && !anyMorph) {
      for (const d of drops) {
        const lg = ctx.createRadialGradient(d.x, cy, 0, d.x, cy, dropR);
        lg.addColorStop(0, `rgba(${d.deep[0]}, ${d.deep[1]}, ${d.deep[2]}, 0.3)`);
        lg.addColorStop(0.75, `rgba(${d.deep[0]}, ${d.deep[1]}, ${d.deep[2]}, 0.12)`);
        lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(d.x, cy, dropR, 0, TWO_PI);
        ctx.fill();
      }
      // Al volver a sonar, el primer fotograma con patrón captura la
      // instantánea actual (sin intentar fundir desde un estado antiguo).
      for (let i = 0; i < n; i++) this._lastKey[i] = '';
    } else {
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      // Resolución de la gota: mayor que antes (≈1,4× el radio dibujado y
      // 14 px por anillo) para que las líneas nodales finas salgan nítidas
      // al escalar, sin el desenfoque del suavizado. Tope de 192 px para
      // mantener 60 FPS también en móvil.
      // Resolución del buffer: el búfer cubre TODO el diámetro de la gota
      // (se dibuja a 2·dropR), así que para escalar 1:1 necesita al menos
      // 2·dropR píxeles — antes se escalaba ~2× y las líneas nodales
      // salían difuminadas, sobre todo en los patrones pequeños. Tope 320
      // para mantener 60 FPS también en móvil.
      // Resolución del buffer con ajuste adaptativo: _resMul baja si el
      // dispositivo va lento (se mide el fotograma) y sube si sobra tiempo.
      const resD = this._gl
        ? glResAll
        : Math.max(
            48,
            Math.min(320, Math.round(Math.max(nDom[i] * 16, dropR * 2) * this._resMul))
          );
      const buf = this._drops[i];
      this._ensureDrop(buf, resD);
      // Si cambió el tamaño del búfer a mitad de una transición (p. ej. al
      // redimensionar la ventana), se descarta la transición: la tabla de la
      // flor anterior se construyó para otra resolución y no encajaría.
      if (this._morph[i] && this._morph[i].p.res !== resD) {
        this._releaseMorphTex(i);
        this._morph[i] = null;
      }
      // Granulometría propia del plato: mezcla de sal y grano capilar
      // (constante por gota, derivada de su índice).
      const tex = GRAIN_SETS[i % GRAIN_SETS.length];
      const ddata = buf.img.data;
      const half = resD / 2;
      const rim = half * 0.025; // borde suave y fino (gota definida)

      // Tabla radial estática por gota: r, θ y las Bessel del patrón son
      // independientes del tiempo (solo rotan las fases angulares), así que
      // se calculan una sola vez por (resolución, modo) y por fotograma el
      // bucle solo evalúa los cosenos — con esto se puede subir la
      // resolución del buffer (nitidez) sin perder 60 FPS.
      const argScale = ZP_BY_M[mDom[i]][nDom[i] - 1] / half;
      // La clave de caché incluye TODOS los modos almacenados: dos estados
      // pueden compartir el modo dominante (m, n) — y por tanto argScale —
      // pero tener vecinos o detalles distintos, y entonces la tabla radial
      // quedaría obsoleta (columnas de otro modo).
      const radKey = `${argScale}|${mDom[i]}|${mS1[i]}|${mS2[i]}|${mD1[i]}|${mD2[i]}|${mD3[i]}|${mD4[i]}|${mD5[i]}`;
      // Transición al cambiar de frecuencia: si la clave del modo cambió
      // respecto al fotograma anterior (p. ej. al elegir otro estado, o al
      // mover el latido), la flor anterior — que YA está renderizada en
      // buf.rad — se mueve a la transición sin recalcular nada (cero coste)
      // y el nuevo modo se construye por tramos. El cambio es gradual: la
      // flor vieja se desvanece MIENTRAS la nueva se despliega (fundido
      // cruzado), la placa se reordena con una oleada y la nueva se
      // asienta — sin saltos, sin parpadeos ni vacíos.
      if (radKey !== this._lastKey[i]) {
        const lp = this._lastP[i];
        const alreadyMorphing = this._morph[i] && this._morph[i].b > 0;
        if (lp && lp.res === resD && !alreadyMorphing) {
          const gd = this._gl ? this._glDrops[i] : null;
          this._morph[i] = {
            b: 1,
            p: lp,
            radP: buf.rad,
            newStart: null,
            // Texturas de la flor anterior para el fundido cruzado en GPU:
            // la J0 vieja se captura AQUÍ (al arrancar el fundido), para que
            // la flor que se desvanece conserve sus anillos durante toda la
            // transición, incluso mientras la tabla nueva se construye.
            texAold: gd ? gd.texA : null,
            texBold: gd ? gd.texB : null,
            texCold: gd ? gd.texC : null,
          };
        }
        this._lastKey[i] = radKey;
      }
      // Instantánea del patrón de este fotograma: si el modo cambia en el
      // próximo, esta instantánea se convierte en la flor que se desvanece.
      this._lastP[i] = {
        res: resD,
        p0: d.p0,
        argScale,
        mDom: mDom[i],
        mS1: mS1[i],
        mS2: mS2[i],
        mD1: mD1[i],
        mD2: mD2[i],
        mD3: mD3[i],
        mD4: mD4[i],
        mD5: mD5[i],
        amp0: amp0[i],
        ampDom: ampDom[i],
        ampBeat: ampBeat[i],
        ampS1: ampS1[i],
        ampS2: ampS2[i],
        ampD1: ampD1[i],
        ampD2: ampD2[i],
        ampD3: ampD3[i],
        ampD4: ampD4[i],
        ampD5: ampD5[i],
        phDom: phaseDom[i],
        phBeat: phaseBeat[i],
        phS1: phaseS1[i],
        phS2: phaseS2[i],
        phD1: phaseD1[i],
        phD2: phaseD2[i],
        phD3: phaseD3[i],
        phD4: phaseD4[i],
        phD5: phaseD5[i],
      };
      // Construcción del nuevo modo por tramos (varias filas por fotograma)
      // para que el render no se congele al cambiar de frecuencia; mientras
      // tanto, la flor anterior sigue en buf.rad.
      if (buf.radK === radKey) {
        buf.pending = null;
      } else {
        if (!buf.pending || buf.pending.key !== radKey) {
          const kRip = (2 * TWO_PI * 3) / (resD / 2);
          buf.pending = {
            key: radKey,
            res: resD,
            argScale,
            mDom: mDom[i],
            mS1: mS1[i],
            mS2: mS2[i],
            mD1: mD1[i],
            mD2: mD2[i],
            mD3: mD3[i],
            mD4: mD4[i],
            mD5: mD5[i],
            tex,
            kRip,
            rows: 0,
            rad: new Float32Array(resD * resD * 13),
            rip: new Float32Array(resD * resD * 4),
          };
        }
        const pend = buf.pending;
        const chunk = Math.max(4, Math.ceil(pend.res / 8));
        const y1 = Math.min(pend.res, pend.rows + chunk);
        fillRadTableRows(
          pend.rad,
          pend.res,
          pend.rows,
          y1,
          pend.argScale,
          pend.mDom,
          pend.mS1,
          pend.mS2,
          pend.mD1,
          pend.mD2,
          pend.mD3,
          pend.mD4,
          pend.mD5,
          pend.tex
        );
        // Ondas radiales precalculadas del mismo tramo (usan r de la tabla).
        fillRipRows(pend.rip, pend.rad, pend.res, pend.rows, y1, pend.kRip);
        pend.rows = y1;
        if (pend.rows >= pend.res) {
          buf.rad = pend.rad;
          buf.radK = pend.key;
          buf.rip = pend.rip;
          buf.ripK = pend.kRip;
          buf.pending = null;
          if (this._gl) this._uploadDropGL(i, pend);
        }
      }
      const rad = buf.rad;
      // Fases del grano capilar (chisporroteo del agua): cada gota hierve
      // a su propio ritmo, desincronizado de las demás. El grano espacial
      // está precalculado en la tabla; aquí solo tiembla su envolvente
      // global (barato).
      const gt1 = TWO_PI * 0.8 * t + d.p0 * 5.7;
      const gt2 = TWO_PI * 0.9 * t + d.p0 * 6.3;
      const gt3 = TWO_PI * 0.7 * t + d.p0 * 7.1;
      const gt4 = TWO_PI * 1.1 * t + d.p0 * 7.7;
      const granEnv = 0.55 + 0.45 * Math.cos(gt1 + gt3);
      const powShimmer = 1 + 0.12 * Math.sin(gt2);

      // Fases de la transición de frecuencia (prog 0→1, ~5 s): FUNDIDO
      // CRUZADO — la flor anterior se desvanece mientras la nueva se
      // despliega, y los dos pesos suman 1 en todo momento. Los patrones se
      // superponen y los anillos del anterior se deslizan hacia los del
      // nuevo (barrer la frecuencia en un plato real produce exactamente
      // eso: el patrón intermedio es una superposición viva). La superficie
      // apenas se hunde al centro (el plato se reordena) pero nunca queda
      // vacía, y una oleada radial recorre la gota durante el cambio. La
      // transición espera si la nueva tabla aún se está construyendo y la
      // nueva flor arranca justo donde terminó la construcción, sin saltos.
      let morph = this._morph[i];
      if (morph) {
        if (buf.pending) {
          // La tabla del nuevo modo aún se construye: la flor anterior se
          // mantiene ÍNTEGRA (sin empezar el fundido) hasta que la nueva esté
          // lista — la transición nunca se vacía ni parpadea.
          morph.b = Math.max(morph.b, 0.12);
        } else if (morph.newStart == null) {
          // La tabla nueva está lista: el fundido arranca en el punto de
          // progreso actual para que la aparición de la flor sea continua.
          morph.newStart = Math.min(1, 1 - morph.b);
        }
        // ~7 s en total: gradual y sin saltos (b va 1 → 0).
        morph.b -= dt / 7.0;
        if (morph.b <= 0 && !buf.pending) {
          this._releaseMorphTex(i);
          this._morph[i] = null;
          morph = null;
        }
      }
      const pM = morph ? morph.p : null;
      const radP = morph ? morph.radP : null;
      let oldW = 0;
      let newW = 0;
      let morphEnv = 1;
      let burst = 0;
      if (morph) {
        const prog = 1 - morph.b; // 0 → 1
        const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
        // Fundido cruzado COMPLEMENTARIO: la flor vieja se mantiene a plena
        // intensidad hasta que la nueva está lista y, desde ese instante,
        // newW + oldW = 1 en todo momento (la nueva entra exactamente
        // mientras la vieja sale): sin vacíos, sin hundimiento ni doble
        // brillo — el patrón evoluciona de forma continua.
        const ns = morph.newStart == null ? 0 : morph.newStart;
        const fade = ns <= 0 ? 0 : smooth((prog - ns) / (1 - ns));
        newW = fade;
        oldW = 1 - fade;
        // La superficie respira apenas en el centro del fundido (el plato se
        // reordena) y una oleada suave recorre la gota durante el cambio.
        const dip =
          1 - smooth((prog - 0.35) / 0.3) * (1 - smooth((prog - 0.65) / 0.3));
        morphEnv = 0.8 + 0.2 * dip;
        burst = 1 + 0.7 * Math.sin(Math.PI * fade);
      }
      if (burst > 0) {
        ripAmp[i] *= burst;
        ripTravel[i] *= burst;
        ripIn[i] *= burst;
        ripCol[i] *= burst;
      }
      // Temblor del patrón anterior durante la transición: la misma
      // oscilación que la flor nueva, con las fases propias de la vieja.
      let shim0P = 1;
      let shimDomP = 1;
      let shimS1P = 1;
      let shimS2P = 1;
      let shimD1P = 1;
      let shimD2P = 1;
      let shimD3P = 1;
      let shimBeatP = 1;
      if (morph) {
        const p0 = pM.p0;
        shim0P = 1 + 0.16 * vib * Math.sin(TWO_PI * 0.55 * t + p0 * 0.9);
        shimDomP = 1 + 0.22 * vib * Math.sin(TWO_PI * 0.62 * t + p0 * 1.6);
        shimS1P = 1 + 0.24 * vib * Math.sin(TWO_PI * 0.78 * t + p0 * 2.9);
        shimS2P = 1 + 0.26 * vib * Math.sin(TWO_PI * 0.83 * t + p0 * 3.7);
        shimD1P = 1 + 0.3 * vib * Math.sin(TWO_PI * 0.9 * t + p0 * 4.3);
        shimD2P = 1 + 0.27 * vib * Math.sin(TWO_PI * 0.97 * t + p0 * 5.1);
        shimD3P = 1 + 0.24 * vib * Math.sin(TWO_PI * 1.03 * t + p0 * 5.9);
        shimBeatP = 1 + 0.28 * vib * Math.sin(TWO_PI * 0.33 * t + p0 * 2.4);
      }

      // ----- Ruta GPU (WebGL2) -------------------------------------------
      // La GPU evalúa el mismo sumatorio píxel a píxel con las texturas del
      // modo (subidas arriba, por tramos) y las fases/amplitudes como
      // uniformes; el fundido cruzado también vive en el shader con las
      // texturas de la flor anterior capturadas en la transición.
      if (this._gl) {
        const gd = this._glDrops[i];
        if (gd.texA && gd.texB && gd.texC) {
          const GL = this._gl;
          const gl = GL.gl;
          const sc = GL.scratch;
          gl.useProgram(GL.prog);
          gl.viewport(i * resD, 0, resD, resD);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, gd.texA);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, gd.texB);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, gd.texC);
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, morph && morph.texBold ? morph.texBold : GL.blackTex);
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, morph && morph.texCold ? morph.texCold : GL.blackTex);
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, morph && morph.texAold ? morph.texAold : GL.blackTex);

          // Pesos (amplitud·shimmer) y fases (rotación + fase) por modo.
          sc.j[0] = amp0[i] * shim0[i];
          sc.j[1] = ampDom[i] * shimDom[i];
          sc.j[2] = ampBeat[i] * shimBeat[i];
          sc.j[3] = ampS1[i] * shimS1[i];
          sc.j[4] = ampS2[i] * shimS2[i];
          sc.j[5] = ampD1[i] * shimD1[i];
          sc.j[6] = ampD2[i] * shimD2[i];
          sc.j[7] = ampD3[i] * shimD3[i];
          sc.ph[0] = rotDom[i] + phaseDom[i];
          sc.ph[1] = rotBeat[i] + phaseBeat[i];
          sc.ph[2] = rotS1[i] + phaseS1[i];
          sc.ph[3] = rotS2[i] + phaseS2[i];
          sc.ph[4] = rotD1[i] + phaseD1[i];
          sc.ph[5] = rotD2[i] + phaseD2[i];
          sc.ph[6] = rotD3[i] + phaseD3[i];
          sc.m[0] = mDom[i];
          sc.m[1] = mS1[i];
          sc.m[2] = mS2[i];
          sc.m[3] = mD1[i];
          sc.m[4] = mD2[i];
          sc.m[5] = mD3[i];
          if (morph) {
            const p = pM;
            sc.jo[0] = p.amp0 * shim0P;
            sc.jo[1] = p.ampDom * shimDomP;
            sc.jo[2] = p.ampBeat * shimBeatP;
            sc.jo[3] = p.ampS1 * shimS1P;
            sc.jo[4] = p.ampS2 * shimS2P;
            sc.jo[5] = p.ampD1 * shimD1P;
            sc.jo[6] = p.ampD2 * shimD2P;
            sc.jo[7] = p.ampD3 * shimD3P;
            sc.pho[0] = rotDom[i] + p.phDom;
            sc.pho[1] = rotBeat[i] + p.phBeat;
            sc.pho[2] = rotS1[i] + p.phS1;
            sc.pho[3] = rotS2[i] + p.phS2;
            sc.pho[4] = rotD1[i] + p.phD1;
            sc.pho[5] = rotD2[i] + p.phD2;
            sc.pho[6] = rotD3[i] + p.phD3;
            sc.mo[0] = p.mDom;
            sc.mo[1] = p.mS1;
            sc.mo[2] = p.mS2;
            sc.mo[3] = p.mD1;
            sc.mo[4] = p.mD2;
            sc.mo[5] = p.mD3;
          } else {
            sc.jo[0] = sc.jo[1] = sc.jo[2] = sc.jo[3] = 0;
            sc.jo[4] = sc.jo[5] = sc.jo[6] = sc.jo[7] = 0;
            sc.pho[0] = sc.pho[1] = sc.pho[2] = sc.pho[3] = 0;
            sc.pho[4] = sc.pho[5] = sc.pho[6] = 0;
            sc.mo[0] = 1;
            sc.mo[1] = 2;
            sc.mo[2] = 3;
            sc.mo[3] = 4;
            sc.mo[4] = 5;
            sc.mo[5] = 6;
          }

          // Ondas radiales (fases por fotograma; el cos/sin espacial lo
          // evalúa la GPU con r de la textura).
          const ripTph = TWO_PI * 0.55 * t + d.p0 * 2.3;
          const ripNph = TWO_PI * 0.62 * t + d.p0 * 3.1;
          const cT = Math.cos(ripTph);
          const sT = Math.sin(ripTph);
          const cN = Math.cos(ripNph);
          const sN = Math.sin(ripNph);
          const sandSig = tex.sand * (200 / resD) + 0.012 * ampPattern;
          const presence = morph ? Math.max(oldW, newW) : 1;

          const U = GL.u;
          gl.uniform2f(U.uOffset, i * resD, 0);
          gl.uniform1f(U.uRes, resD);
          gl.uniform1f(U.uHalf, half);
          gl.uniform1f(U.uRim, rim);
          gl.uniform1f(U.uWob, wobA[i]);
          for (let k = 0; k < 8; k++) gl.uniform1f(U.uJ[k], sc.j[k]);
          for (let k = 0; k < 7; k++) gl.uniform1f(U.uPh[k], sc.ph[k]);
          for (let k = 0; k < 6; k++) gl.uniform1f(U.uM[k], sc.m[k]);
          for (let k = 0; k < 8; k++) gl.uniform1f(U.uJo[k], sc.jo[k]);
          for (let k = 0; k < 7; k++) gl.uniform1f(U.uPho[k], sc.pho[k]);
          for (let k = 0; k < 6; k++) gl.uniform1f(U.uMo[k], sc.mo[k]);
          // Sin transición la flor actual pesa 1 (newW solo se define dentro
          // del bloque de morph); con transición, cada flor su peso real.
          gl.uniform1f(U.uNewW, morph ? newW : 1);
          gl.uniform1f(U.uOldW, morph ? oldW : 0);
          gl.uniform1f(U.uMEnv, morphEnv);
          gl.uniform1f(U.uPresence, presence);
          gl.uniform1f(U.uAmpPat, ampPattern);
          gl.uniform1f(U.uAmp, amp);
          gl.uniform1f(U.uSwell, swell);
          gl.uniform1f(U.uRipA, ripAmp[i]);
          gl.uniform1f(U.uRipC, ripCos[i]);
          gl.uniform1f(U.uRipT, ripTravel[i]);
          gl.uniform1f(U.uRipN, ripIn[i]);
          gl.uniform1f(U.uRipCl, ripCol[i]);
          gl.uniform1f(U.uColC, cosCol[i]);
          gl.uniform1f(U.uCT, cT);
          gl.uniform1f(U.uSN, sN);
          // PHASE 3: Disable capillary grain overlay in Scientific Mode
          gl.uniform1f(U.uGEnv, sciMode ? 0 : granEnv);
          gl.uniform1f(U.uPSh, powShimmer);
          gl.uniform1f(U.uTexPow, tex.pow);
          gl.uniform1f(U.uTexSalt, tex.salt);
          gl.uniform1f(U.uSandSig, sandSig);
          gl.uniform1f(U.uGain, gain);
          gl.uniform1f(U.uMid, mid);
          gl.uniform3fv(U.uPal, d.pal);
          gl.uniform3fv(U.uDeep, d.deep);
          gl.uniform3fv(U.uWhite, C_WHITE);

          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(GL.canvas, i * resD, 0, resD, resD, d.x - dropR, cy - dropR, dropR * 2, dropR * 2);
        }
        continue; // esta gota la dibuja la GPU
      }

      // Escalares de esta gota en variables locales: el bucle interior los
      // usa en cada píxel, así que sacarlos de los arrays (y los accesos a
      // memoria) acelera el render de forma medible. Las amplitudes ya
      // llevan su shimmer (j = a·s) y las fases su rotación (φ = r + p):
      // por píxel solo queda el coseno angular de cada modo.
      const mDom0 = mDom[i];
      const mS10 = mS1[i];
      const mS20 = mS2[i];
      const mD10 = mD1[i];
      const mD20 = mD2[i];
      const mD30 = mD3[i];
      const j0 = amp0[i] * shim0[i];
      const jDom = ampDom[i] * shimDom[i];
      const jBeat = ampBeat[i] * shimBeat[i];
      const jS1 = ampS1[i] * shimS1[i];
      const jS2 = ampS2[i] * shimS2[i];
      const jD1 = ampD1[i] * shimD1[i];
      const jD2 = ampD2[i] * shimD2[i];
      const jD3 = ampD3[i] * shimD3[i];
      // Rotaciones por separado: la flor anterior (transición) las usa con
      // sus propias fases de fase.
      const rDom = rotDom[i];
      const rS1 = rotS1[i];
      const rS2 = rotS2[i];
      const rD1 = rotD1[i];
      const rD2 = rotD2[i];
      const rD3 = rotD3[i];
      const rBeat = rotBeat[i];
      const phDom = rDom + phaseDom[i];
      const phBeat = rBeat + phaseBeat[i];
      const phS1 = rS1 + phaseS1[i];
      const phS2 = rS2 + phaseS2[i];
      const phD1 = rD1 + phaseD1[i];
      const phD2 = rD2 + phaseD2[i];
      const phD3 = rD3 + phaseD3[i];
      // Fase de la transición para este fotograma: en el fundido cruzado se
      // evalúan las DOS flores (cada una con su peso); en las colas, solo
      // la que pesa.
      const useNew = morph ? newW > 0.02 : true;
      const useOld = morph ? oldW > 0.02 : false;
      const pOld = useOld ? pM : null;
      const rpOld = useOld ? radP : null;
      const mEnv = morphEnv;
      const presence = morph ? Math.max(oldW, newW) : 1;
      const ripA = ripAmp[i];
      const ripC = ripCos[i];
      const ripT = ripTravel[i];
      const ripN = ripIn[i];
      const ripCl = ripCol[i];
      const colC = cosCol[i];
      const ripPh = d.p0 * 2.3;
      const ripPhIn = d.p0 * 3.1;
      // Fases de las ondas radiales (escalares por fotograma; la tabla
      // precalculada aporta el cos/sin espacial por píxel).
      const ripTph = TWO_PI * 0.55 * t + ripPh;
      const ripNph = TWO_PI * 0.62 * t + ripPhIn;
      const cT = Math.cos(ripTph);
      const sT = Math.sin(ripTph);
      const cN = Math.cos(ripNph);
      const bound = half * wob;
      // PHASE 3: Disable capillary grain overlay in Scientific Mode
      const gEnv = sciMode ? 0 : granEnv;
      const pSh = powShimmer;
      const texPow = tex.pow;
      const texSalt = tex.salt;
      const sandSig = tex.sand * (200 / resD) + 0.012 * ampPattern;
      const res2 = resD * resD;
      const ripTbl = buf.rip;
      const pal = d.pal;
      const dp = d.deep;
      const cr0 = pal[0];
      const cg0 = pal[1];
      const cb0 = pal[2];
      const dr0 = dp[0];
      const dg0 = dp[1];
      const db0 = dp[2];

      for (let py = 0; py < resD; py++) {
        const base = py * resD;
        for (let px = 0; px < resD; px++) {
          const idx = base + px;
          const o = idx * 13; // 13 columnas: r, θ, J0, Jm, Js1, Js2, Jd1..3, grano, polvo
          const o4 = idx * 4;
          const dist = rad[o];
          if (dist >= bound) {
            ddata[o4 + 3] = 0;
            continue;
          }
          const soft = clamp01((bound - dist) / rim);
          const th = rad[o + 1];

          // Ondulación del patrón: estacionaria más DOS ondas viajeras
          // opuestas precalculadas (tabla) — una nace en el centro y viaja
          // al borde, la otra rebota del borde hacia dentro — que chocan
          // entre sí: donde se cruzan interfieren y la superficie se
          // levanta (nodo de colisión que respira), como en un experimento
          // real. Por fotograma solo rotan las fases (escalares baratos).
          const ripp =
            1 +
            ripA * ripTbl[idx] * ripC +
            ripT * (ripTbl[res2 + idx] * cT - ripTbl[2 * res2 + idx] * sT) +
            ripN * (ripTbl[res2 + idx] * cN + ripTbl[2 * res2 + idx] * sN) +
            ripCl * ripTbl[3 * res2 + idx] * colC;
          // Elevación: la flor actual y, durante un fundido cruzado, la
          // anterior también — cada una con su peso. Al superponerse, los
          // anillos de la flor vieja se deslizan hacia los de la nueva.
          let sum = 0;
          if (useNew) {
            sum =
              j0 * rad[o + 2] +
              jDom * rad[o + 3] * Math.cos(mDom0 * th + phDom) +
              jBeat * rad[o + 3] * Math.cos(mDom0 * th + phBeat) +
              jS1 * rad[o + 4] * Math.cos(mS10 * th + phS1) +
              jS2 * rad[o + 5] * Math.cos(mS20 * th + phS2) +
              jD1 * rad[o + 6] * Math.cos(mD10 * th + phD1) +
              jD2 * rad[o + 7] * Math.cos(mD20 * th + phD2) +
              jD3 * rad[o + 8] * Math.cos(mD30 * th + phD3);
            if (morph) sum *= newW;
          }
          if (useOld) {
            const p = pOld;
            const rp = rpOld;
            // Las columnas Bessel de la tabla anterior son rp[o+2..o+8]
            // (J0, J_mDom, J_mS1, J_mS2, J_mD1, J_mD2, J_mD3) — el mismo
            // esquema que la flor nueva. Antes se leían rp[o..o+6] (r, θ,
            // J0…), lo que dibujaba la flor que se desvanecía con las
            // columnas equivocadas: el fundido parecía sucio y antinatural.
            sum +=
              oldW *
              (p.amp0 * shim0P * rp[o + 2] +
                (p.ampDom * shimDomP) *
                  rp[o + 3] *
                  Math.cos(p.mDom * th + rDom + p.phDom) +
                (p.ampBeat * shimBeatP) *
                  rp[o + 3] *
                  Math.cos(p.mDom * th + rBeat + p.phBeat) +
                (p.ampS1 * shimS1P) *
                  rp[o + 4] *
                  Math.cos(p.mS1 * th + rS1 + p.phS1) +
                (p.ampS2 * shimS2P) *
                  rp[o + 5] *
                  Math.cos(p.mS2 * th + rS2 + p.phS2) +
                (p.ampD1 * shimD1P) *
                  rp[o + 6] *
                  Math.cos(p.mD1 * th + rD1 + p.phD1) +
                (p.ampD2 * shimD2P) *
                  rp[o + 7] *
                  Math.cos(p.mD2 * th + rD2 + p.phD2) +
                (p.ampD3 * shimD3P) *
                  rp[o + 8] *
                  Math.cos(p.mD3 * th + rD3 + p.phD3));
          }
          // Envuelta de reafinación y grano capilar (precalculado): el
          // patrón brilla con la energía y el latido, y el chisporroteo del
          // agua tiembla con una envolvente global barata.
          const eBase = sum * ripp * amp * swell * mEnv;
          const gran = rad[o + 11] * gEnv;
          const e = eBase + gran * (0.1 + Math.abs(eBase)) * 0.045 * amp;
          // Arena nodal: el polvo fino se asienta sobre las líneas nodales
          // (donde la elevación cruza cero), trazando las líneas EXACTAS del
          // mandala como la sal de Chladni real. La campana es muy estrecha
          // (σ ≈ 0,02) y su grosor se adapta al tamaño del búfer para que
          // las líneas tengan el MISMO grosor en pantalla a cualquier
          // tamaño — así los patrones pequeños se leen definidos también en
          // pantallas chicas. El moteado del polvo está precalculado en la
          // tabla (columna 12) y tiembla con una envolvente global. La
          // gaussiana solo se evalúa donde puede ser visible (|eBase| bajo):
          // el resto de píxeles se ahorra el exp — la mayor parte del costo.
          let sand = 0;
          if (Math.abs(eBase) < 0.11) {
            const sandPowder = 1 - texPow + texPow * rad[o + 12] * pSh;
            // Actividad local de la onda: la sal solo se asienta donde la
            // superficie vibra de verdad (las zonas muertas cerca del borde
            // quedan sin polvo).
            const env =
              Math.abs(j0 * rad[o + 2]) +
              Math.abs(jDom * rad[o + 3]) +
              Math.abs(jBeat * rad[o + 3]) +
              Math.abs(jS1 * rad[o + 4]) +
              Math.abs(jS2 * rad[o + 5]) +
              Math.abs(jD1 * rad[o + 6]) +
              Math.abs(jD2 * rad[o + 7]) +
              Math.abs(jD3 * rad[o + 8]);
            const envGate = clamp01((env - 0.05) / 0.25);
            sand =
              Math.exp(-(eBase * eBase) / (2 * sandSig * sandSig)) *
              sandPowder *
              envGate *
              (0.75 + 0.25 * ampPattern) *
              ampPattern *
              presence;
          }
          // Compresión gamma: la amplitud física decae como 1/√r (envelope
          // de Bessel); se comprime el rango con una raíz cuadrada (cámara)
          // para que los anillos exteriores también se lean. Contraste alto
          // con curva empinada: los pétalos brillan y los valles se hunden,
          // como en una foto de cimática real.
          const eP = (e < 0 ? -1 : 1) * Math.sqrt(Math.abs(e));
          // Aproximación racional de tanh (error < 2 %): la curva 5.0 casi
          // binaria cresta→valle — línea blanca sobre plato oscuro — sin el
          // costo de Math.tanh por píxel.
          const tIn = (eP * gain + mid - 0.5) * 5.0;
          const t2 = tIn * tIn;
          const tt = tIn < -3 ? -1 : tIn > 3 ? 1 : (tIn * (27 + t2)) / (27 + 9 * t2);
          const v = 0.5 + 0.5 * tt;
          let cr, cg, cb;
          if (v < 0.5) {
            const u = v * 2;
            cr = cr0 * u + dr0 * (1 - u);
            cg = cg0 * u + dg0 * (1 - u);
            cb = cb0 * u + db0 * (1 - u);
          } else {
            const u = (v - 0.5) * 2;
            cr = C_WHITE[0] * u + cr0 * (1 - u);
            cg = C_WHITE[1] * u + cg0 * (1 - u);
            cb = C_WHITE[2] * u + cb0 * (1 - u);
          }
          // El polvo nodal se mezcla como plata suave teñida con el color de
          // la gota: las líneas del mandala se leen nítidas, sin motas al azar.
          if (sand > 0.02) {
            // La línea nodal se pinta casi blanca (sal bajo la luz cenital),
            // teñida solo un punto con el color de la gota y con la cantidad
            // de polvo propia del plato: el trazo del mandala se lee nítido.
            const sa = sand * texSalt * soft;
            cr = cr * (1 - sa) + (240 + (pal[0] - 240) * 0.22) * sa;
            cg = cg * (1 - sa) + (245 + (pal[1] - 245) * 0.22) * sa;
            cb = cb * (1 - sa) + (252 + (pal[2] - 252) * 0.22) * sa;
          }
          // Transparencia del agua: el agua es translúcida — los valles
          // dejan ver el plato oscuro a través (más transparentes) y las
          // crestas se opacan con la elevación, como el agua real bajo la
          // luz cenital: color visible y fondo visible a la vez. Sin patrón
          // (pausa) queda una lente de agua limpia y clara.
          ddata[o4] = cr > 255 ? 255 : cr;
          ddata[o4 + 1] = cg > 255 ? 255 : cg;
          ddata[o4 + 2] = cb > 255 ? 255 : cb;
          // Agua con más cuerpo: las líneas de sal se opacan y el resto del
          // agua queda translúcido y oscuro — el contraste del patrón no se
          // pierde en translucidez ni se ve lavado.
          let wa = (0.26 + 0.1 * ampPattern + 0.54 * v + 0.55 * sand * ampPattern) * soft;
          if (wa > 1) wa = 1;
          ddata[o4 + 3] = Math.round(255 * wa);
        }
      }

      buf.ctx.putImageData(buf.img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(buf.canvas, d.x - dropR, cy - dropR, dropR * 2, dropR * 2);
    }
    } // else: gotas con patrón

    // ----- Luz de aro cenital (LED) --------------------------------------
    // El arco superior brilla con la elevación media (pulso del latido) y
    // la energía de la vibración: al pausar, la luz se apaga con el patrón
    // (la excitación física es la que ilumina la placa).
    const ringA = (0.22 + 0.78 * pulseEff) * ampPattern;
    ctx.save();
    ctx.lineCap = 'round';
    // Halo exterior suave.
    ctx.strokeStyle = `rgba(34, 211, 238, ${(0.22 * ringA).toFixed(3)})`;
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.06, -Math.PI * 0.98, -Math.PI * 0.02);
    ctx.stroke();
    // Arco brillante.
    ctx.strokeStyle = `rgba(190, 240, 255, ${(0.85 * ringA).toFixed(3)})`;
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.0, -Math.PI * 0.94, -Math.PI * 0.06);
    ctx.stroke();
    ctx.restore();

    // Reflejos especulares en cada gota (luz cenital que reacciona a la
    // elevación: más brillo en el pulso del latido y con la vibración).
    for (const d of drops) {
      // Reflejo mínimo en la esquina: pequeño (radio 0.22·dropR) y de baja
      // opacidad, para que NO tape la filigrana central del mandala — solo
      // da un brillo de cristal muy discreto en el borde superior.
      const hx = d.x - dropR * 0.36;
      const hy = cy - dropR * 0.44;
      const sa = (0.11 + 0.2 * pulseEff) * ampPattern;
      const sg = ctx.createRadialGradient(hx, hy, 0, hx, hy, dropR * 0.22);
      sg.addColorStop(0, `rgba(255,255,255,${sa.toFixed(3)})`);
      sg.addColorStop(0.3, `rgba(210,240,255,${(sa * 0.18).toFixed(3)})`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(hx, hy, dropR * 0.22, 0, TWO_PI);
      ctx.fill();
    }

    // Viñeta sutil para integrar el plato con el fondo oscuro.
    const vg = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // ----- Rendimiento adaptativo -----------------------------------------
    // Se mide el tiempo real del fotograma (EMA) y la resolución de las
    // gotas sube o baja despacio: si el render tarda mucho, las gotas bajan
    // un escalón (líneas algo más suaves) para mantener los FPS; si sobra
    // tiempo, vuelven a subir hasta el máximo. No se ajusta a mitad de una
    // transición para no cortarla.
    const frameMs = performance.now() - tMs;
    this._frameEMA = this._frameEMA * 0.92 + Math.min(60, frameMs) * 0.08;
    if (!this._morph.some((m) => m && m.b > 0)) {
      if (this._frameEMA > 24 && this._resMul > 0.62) {
        this._resMul = Math.max(0.62, this._resMul * 0.985);
      } else if (this._frameEMA < 13 && this._resMul < 1) {
        this._resMul = Math.min(1, this._resMul * 1.015);
      }
    }
  }

  /**
   * Returns the dominant Bessel eigenmode computed in the last render() call.
   * Used by simulation.js to surface physically-derived mode data to the HUD.
   * @returns {{ m: number, n: number, omega: number, detuning: number } | null}
   */
  getDominantMode() {
    return this._physicsState.dominantMode || null;
  }
}
