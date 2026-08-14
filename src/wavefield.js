// src/wavefield.js
// Wave Propagation Laboratory — Phase 2
//
// PHYSICAL MODEL: 2D scalar wave equation (FDTD — Finite Difference Time Domain)
//   u_tt = c² ∇²u - 2γ u_t       (damped wave equation)
//
// Discretized (Leapfrog, 2nd order in space and time, Δx = Δy = Δt = 1):
//   u_next[i] = (2 - 4c²) u[i] - (1 - 2γΔt) u_prev[i]
//             + c²( u[i±1] + u[i±N] )
//
// STABILITY CONDITION (CFL):
//   c · sqrt(2) ≤ 1  →  c ≤ 1/sqrt(2) ≈ 0.707
//   Exceeding this causes numerical blowup.
//
// ENERGY:
//   KE ≈ (1/2) Σ (u - u_prev)²     (kinetic — velocity proxy)
//   PE ≈ (1/2) c² Σ [(∇u)² terms]  (potential — gradient proxy)
//   E_total = KE + PE
//   Under damping: E(t) ≈ E₀ · exp(-2γt)
//
// SOURCE TYPE CLASSIFICATION:
//   step()           — PHYSICAL: FDTD solve of wave equation
//   computeEnergy()  — PHYSICAL: energy integral over grid
//   getPhysicsMetrics() — PHYSICAL / DERIVED
//   render()         — VISUAL: artistic pixel mapping of wave amplitude

const MAX_SAFE_C = 1 / Math.SQRT2; // CFL limit for 2D FDTD

export class WaveField {
  /**
   * @param {number} size Grid side length (cells). Grid is size×size.
   * @param {object} opts
   * @param {number} [opts.c=0.4] Wave speed (dimensionless, must satisfy CFL: c < 1/√2 ≈ 0.707).
   * @param {number} [opts.damp=0.995] Per-step amplitude retention factor (linear damping proxy).
   *   Equivalent viscous damping rate: γ ≈ -ln(damp) per step.
   */
  constructor(size, { c = 0.4, damp = 0.995 } = {}) {
    // --- CFL Validation ---
    // PHYSICAL: if c > 1/√2 the leapfrog scheme is unconditionally unstable.
    // We clamp and warn rather than silently explode.
    if (c > MAX_SAFE_C) {
      console.warn(
        `[WaveField] CFL VIOLATION: c=${c.toFixed(4)} > ${MAX_SAFE_C.toFixed(4)} (1/√2). ` +
        `Clamping to ${MAX_SAFE_C.toFixed(4)} to preserve numerical stability.`
      );
      c = MAX_SAFE_C;
    }

    this.size = size;
    this.c = c;
    this.damp = Math.max(0, Math.min(1, damp)); // strictly [0,1]
    this.n = size * size;

    // PHYSICAL: leapfrog needs u(t), u(t-Δt), u(t+Δt) at each cell
    this.u    = new Float32Array(this.n); // current
    this.prev = new Float32Array(this.n); // previous
    this.next = new Float32Array(this.n); // scratch

    this.mask = new Uint8Array(this.n);   // 1 = interior cell, 0 = exterior (Dirichlet BC u=0)
    this.soft = null;                     // VISUAL: soft alpha falloff at boundary

    // Physics metrics (updated each step)
    this._energy       = 0; // total wave energy (KE + PE approximation)
    this._stepCount    = 0; // number of steps taken
    this._clipCount    = 0; // number of cells clamped this step (non-zero = non-physical)
    this._cfl          = c * Math.SQRT2; // CFL number (stability margin; must be < 1)

    // VISUAL: offscreen canvas for pixel rendering. Created lazily on first
    // render() call so the physics core stays pure (no DOM) and can run
    // headless in Node for the scientific validation suite.
    this.canvas = null;
    this.ctx = null;
    this.img = null;

    this._cx = 0;
    this._cy = 0;
    this._r  = 0;
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL: Define circular basin with Dirichlet (fixed) boundary conditions.
  // Boundary cells have u = 0 at all times → perfect reflection (R = 1).
  // ---------------------------------------------------------------------------
  setCircle(cx, cy, r) {
    this._cx = cx;
    this._cy = cy;
    this._r  = r;
    this.mask.fill(0);
    this.soft = this.soft || new Float32Array(this.n);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx   = x - cx;
        const dy   = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) this.mask[y * this.size + x] = 1;
        // VISUAL: soft alpha falloff so the disc edge isn't pixelated
        this.soft[y * this.size + x] = Math.min(1, Math.max(0, (r + 1.5 - dist) / 1.5));
      }
    }
    this.reset();
  }

  reset() {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
    this._energy    = 0;
    this._stepCount = 0;
    this._clipCount = 0;
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL: Point source excitation (impulse at a single cell).
  // ---------------------------------------------------------------------------
  poke(x, y, amount) {
    const i = Math.round(y) * this.size + Math.round(x);
    if (i >= 0 && i < this.n && this.mask[i]) this.u[i] += amount;
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL: Disc source excitation (Gaussian-like initial condition over
  // a small 5×5 stencil, simulating a finite-size initial displacement).
  // ---------------------------------------------------------------------------
  pokeDisc(x, y, amount) {
    const size = this.size;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue;
        const i = (cy + dy) * size + (cx + dx);
        if (i >= 0 && i < this.n && this.mask[i]) this.u[i] += amount;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL: One FDTD leapfrog step.
  //
  //   Governing equation:  ∂²u/∂t² = c² ∇²u
  //   Leapfrog (Δx=Δy=Δt=1):  u_next = 2u - u_prev + c²·Lap(u)
  //   Damping applied as a multiplicative factor (linear dissipation):
  //     u_next *= damp
  //
  // NOTE: The damping factor `damp` is equivalent to a viscous damping term
  //   ∂u/∂t · γ where γ ≈ -ln(damp)/Δt. This is NOT a perfectly physical
  //   dissipation model (it does not arise from a boundary layer or volume
  //   absorption formulation), but it provides a stable, controllable proxy
  //   for energy decay. Classification: EMPIRICAL.
  //
  // CLAMPING (non-physical safeguard): If any cell exceeds ±AMP_LIMIT after
  //   the update, it is clamped to that limit. This can happen if the energy
  //   injected by poke() is very large. The clamp preserves stability but
  //   introduces a non-physical saturation. The clip counter tracks this.
  // ---------------------------------------------------------------------------
  step() {
    const { size, n, c, damp, mask, u, prev, next } = this;
    const c2       = c * c;
    const AMP_LIMIT = 5.0; // Non-physical saturation limit
    let   clipCount = 0;

    // --- Forward pass: compute u_next ---
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        if (!mask[i]) { next[i] = 0; continue; }
        const lap =
          (mask[i - 1]    ? u[i - 1]    : 0) +
          (mask[i + 1]    ? u[i + 1]    : 0) +
          (mask[i - size] ? u[i - size] : 0) +
          (mask[i + size] ? u[i + size] : 0) -
          4 * u[i];
        next[i] = 2 * u[i] - prev[i] + c2 * lap;
      }
    }

    // --- Apply damping and rotate buffers ---
    for (let i = 0; i < n; i++) {
      if (mask[i]) {
        let v = next[i] * damp;
        // Non-physical amplitude clamp — tracks clip events for diagnostics
        if (v > AMP_LIMIT)        { v = AMP_LIMIT;  clipCount++; }
        else if (v < -AMP_LIMIT)  { v = -AMP_LIMIT; clipCount++; }
        prev[i] = u[i];
        u[i]    = v;
      } else {
        u[i]    = 0;
        prev[i] = 0;
        next[i] = 0;
      }
    }

    this._clipCount = clipCount;
    this._stepCount++;

    // Update energy every 4 steps (performance: skip heavy inner loop each frame)
    if (this._stepCount % 4 === 0) {
      this._energy = this.computeEnergy();
    }
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL: Total wave energy estimate on the discrete grid.
  //   KE ≈ (1/2) Σ_interior (u[i] - prev[i])²    [velocity² proxy, Δt=1]
  //   PE ≈ (1/2) c² Σ_interior [(Δ_x u)² + (Δ_y u)²]  [gradient² proxy]
  //   E_total = KE + PE
  //
  // Under pure damping (no sources) this should decay as:
  //   E(t) ≈ E₀ · damp^(2t)  (since amplitude decays as damp^t)
  // ---------------------------------------------------------------------------
  computeEnergy() {
    const { size, n, c, mask, u, prev } = this;
    const c2 = c * c;
    let ke = 0;
    let pe = 0;
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x;
        if (!mask[i]) continue;
        const vel = u[i] - prev[i];  // Δu/Δt approximation
        ke += vel * vel;
        // Central difference gradient approximation
        const gx = mask[i + 1] ? (u[i + 1] - u[i - 1]) * 0.5 : 0;
        const gy = mask[i + size] ? (u[i + size] - u[i - size]) * 0.5 : 0;
        pe += gx * gx + gy * gy;
      }
    }
    return 0.5 * ke + 0.5 * c2 * pe;
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL/DERIVED: Return physics metrics for external monitoring/HUD.
  // All values here are either rigorously derived (CFL) or explicitly labeled.
  // ---------------------------------------------------------------------------
  getPhysicsMetrics() {
    return {
      // PHYSICAL: CFL number. Must be < 1 for stability. 
      //   CFL = c · sqrt(2) for 2D FDTD with 4-point stencil.
      cfl: this._cfl,
      // PHYSICAL (APPROXIMATE): total wave energy on grid.
      energy: this._energy,
      // DERIVED: theoretical energy decay rate per step from the damping factor.
      //   E(t) ~ damp^(2t) so rate = -2 * ln(damp) per step.
      theoreticalDampRate: -2 * Math.log(this.damp),
      // DIAGNOSTIC: if > 0, amplitude clamping occurred this step (non-physical).
      clipCount: this._clipCount,
      // PHYSICAL: wave speed parameter
      c: this.c,
      // SIMULATION: total steps taken since last reset
      stepCount: this._stepCount,
    };
  }

  // ---------------------------------------------------------------------------
  // VISUAL: Render wave amplitude to offscreen canvas pixels.
  //   This is a purely artistic mapping: wave amplitude → pixel color/brightness.
  //   The gain (2.6×) and brightness curve are HEURISTIC choices for visual clarity.
  //   Classification: VISUAL
  // ---------------------------------------------------------------------------
  render([r, g, b]) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width  = this.size;
      this.canvas.height = this.size;
      this.ctx = this.canvas.getContext('2d');
      this.img = this.ctx.createImageData(this.size, this.size);
    }
    const { u, mask, img, soft } = this;
    const d = img.data;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      if (!mask[i]) {
        d[o] = d[o + 1] = d[o + 2] = 0;
        d[o + 3] = 0;
        continue;
      }
      // VISUAL: Amplitude → brightness mapping (heuristic gain).
      const v = u[i] * 2.6;
      let bri = 0.32 + v * 0.5;
      if (bri < 0.15) bri = 0.15;
      if (bri > 1.25) bri = 1.25;
      let cr = r * bri;
      let cg = g * bri;
      let cb = b * bri;
      // VISUAL: Specular highlight on wave crests.
      if (v > 0.35) {
        const w = Math.min(1, (v - 0.35) * 0.9);
        cr += (255 - cr) * w;
        cg += (255 - cg) * w;
        cb += (255 - cb) * w;
      }
      d[o]     = cr > 255 ? 255 : cr;
      d[o + 1] = cg > 255 ? 255 : cg;
      d[o + 2] = cb > 255 ? 255 : cb;
      // VISUAL: Soft alpha falloff at circular boundary.
      d[o + 3] = soft ? Math.round(255 * soft[i]) : 255;
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas;
  }
}
