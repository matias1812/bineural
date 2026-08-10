// Simulación física de ondas en agua: ecuación de onda 2D discretizada.
// Cada gota es una cuenca circular con borde fijo (u = 0): las ondas nacen
// en sus fuentes, se propagan, rebotan en el borde y se superponen formando
// los patrones de interferencia reales — los mismos de un plato con agua y
// vibración, a escala visual.

export class WaveField {
  constructor(size, { c = 0.5, damp = 0.995 } = {}) {
    this.size = size;
    this.c = c;
    this.damp = damp;
    this.n = size * size;
    this.u = new Float32Array(this.n);
    this.prev = new Float32Array(this.n);
    this.next = new Float32Array(this.n);
    this.mask = new Uint8Array(this.n);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(size, size);
    this._cx = 0;
    this._cy = 0;
    this._r = 0;
  }

  // Define la cuenca circular y resetea el campo.
  setCircle(cx, cy, r) {
    this._cx = cx;
    this._cy = cy;
    this._r = r;
    this.mask.fill(0);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.mask[y * this.size + x] = 1;
      }
    }
  }

  reset() {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
  }

  // Excita una celda (una fuente de ondas).
  poke(x, y, amount) {
    const i = Math.round(y) * this.size + Math.round(x);
    if (i >= 0 && i < this.n) this.u[i] += amount;
  }

  // Excita un pequeño disco de celdas: el impacto de una gota cayendo al
  // agua genera una onda mucho más visible que un punto aislado.
  pokeDisc(x, y, amount) {
    const size = this.size;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue;
        const i = (cy + dy) * size + (cx + dx);
        if (i >= 0 && i < this.n) this.u[i] += amount;
      }
    }
  }

  // Un paso de la ecuación de onda: u'' = c² ∇²u con amortiguación.
  // Las celdas fuera de la cuenca valen 0 (borde fijo): las ondas rebotan
  // y se forman los patrones estacionarios de interferencia.
  step() {
    const { size, n, c, damp, mask, u, prev, next } = this;
    const c2 = c * c;
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        if (!mask[i]) {
          next[i] = 0;
          continue;
        }
        const lap =
          (mask[i - 1] ? u[i - 1] : 0) +
          (mask[i + 1] ? u[i + 1] : 0) +
          (mask[i - size] ? u[i - size] : 0) +
          (mask[i + size] ? u[i + size] : 0) -
          4 * u[i];
        next[i] = 2 * u[i] - prev[i] + c2 * lap;
      }
    }
    for (let i = 0; i < n; i++) {
      if (mask[i]) {
        let v = next[i] * damp;
        if (v > 3) v = 3;
        else if (v < -3) v = -3;
        prev[i] = u[i];
        u[i] = v;
      } else {
        u[i] = 0;
        prev[i] = 0;
        next[i] = 0;
      }
    }
  }

  // Pinta el campo en el canvas offscreen con el color dado [r, g, b]:
  // el agua conserva un color limpio y las ondas se ven como luz — las
  // crestas brillan hacia blanco y los valles se oscurecen, igual que la
  // luz reflejándose en agua real.
  render([r, g, b]) {
    const { u, mask, img } = this;
    const d = img.data;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      if (!mask[i]) {
        d[o] = 0;
        d[o + 1] = 0;
        d[o + 2] = 0;
        d[o + 3] = 0;
        continue;
      }
      // Ganancia visual: las amplitudes físicas son pequeñas, se amplifican
      // para que las ondas se vean claras sobre el color de la gota.
      const v = u[i] * 2.6;
      let bri = 0.32 + v * 0.5;
      if (bri < 0.15) bri = 0.15;
      if (bri > 1.25) bri = 1.25;
      let cr = r * bri;
      let cg = g * bri;
      let cb = b * bri;
      if (v > 0.35) {
        const w = Math.min(1, (v - 0.35) * 0.9);
        cr += (255 - cr) * w;
        cg += (255 - cg) * w;
        cb += (255 - cb) * w;
      }
      d[o] = cr > 255 ? 255 : cr;
      d[o + 1] = cg > 255 ? 255 : cg;
      d[o + 2] = cb > 255 ? 255 : cb;
      d[o + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas;
  }
}
