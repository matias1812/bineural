import{g as E,q as S}from"./site-CvVQixPh.js";const w="modulepreload",L=function(e,t){return new URL(e,t).href},y={},F=function(t,a,r){let s=Promise.resolve();if(a&&a.length>0){let n=function(i){return Promise.all(i.map(d=>Promise.resolve(d).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};const o=document.getElementsByTagName("link"),c=document.querySelector("meta[property=csp-nonce]"),b=(c==null?void 0:c.nonce)||(c==null?void 0:c.getAttribute("nonce"));s=n(a.map(i=>{if(i=L(i,r),i in y)return;y[i]=!0;const d=i.endsWith(".css"),f=d?'[rel="stylesheet"]':"";if(!!r)for(let m=o.length-1;m>=0;m--){const q=o[m];if(q.href===i&&(!d||q.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${i}"]${f}`))return;const l=document.createElement("link");if(l.rel=d?"stylesheet":w,d||(l.as="script"),l.crossOrigin="",l.href=i,b&&l.setAttribute("nonce",b),document.head.appendChild(l),d)return new Promise((m,q)=>{l.addEventListener("load",m),l.addEventListener("error",()=>q(new Error(`Unable to preload CSS for ${i}`)))})}))}function v(n){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=n,window.dispatchEvent(o),!o.defaultPrevented)throw n}return s.then(n=>{for(const o of n||[])o.status==="rejected"&&v(o.reason);return t().catch(v)})},M=[{id:"sine",label:"Senoidal (suave)"},{id:"triangle",label:"Triangular"},{id:"square",label:"Cuadrada"},{id:"sawtooth",label:"Diente de sierra"}];let h=null,g={};function k(){return`
  <div class="auth-modal hidden" id="freq-modal" role="dialog" aria-modal="true" aria-label="Guardar frecuencia personalizada">
    <div class="auth-card">
      <div class="auth-head">
        <span class="auth-logo"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></svg></span>
        <div class="auth-title-wrap">
          <h3 id="freq-title">Guardar frecuencia personalizada</h3>
          <p id="freq-sub">Se guarda en tu cuenta y se sincroniza en todos tus dispositivos.</p>
        </div>
        <button type="button" class="auth-close" id="freq-close" aria-label="Cerrar">✕</button>
      </div>

      <form id="freq-form" novalidate>
        <div class="auth-field">
          <label for="freq-name">Nombre</label>
          <input id="freq-name" name="name" type="text" maxlength="120" autocomplete="off" required placeholder="Ej: Mi sesión de estudio" />
        </div>

        <div class="freq-row">
          <div class="auth-field">
            <label for="freq-base">Portadora (Hz)</label>
            <input id="freq-base" name="carrier" type="number" min="2" max="19999" step="0.1" required />
            <small class="auth-hint">La frecuencia base en ambos oídos.</small>
          </div>
          <div class="auth-field">
            <label for="freq-beat">Ritmo (Hz)</label>
            <input id="freq-beat" name="beat" type="number" min="0" max="499" step="0.5" required />
            <small class="auth-hint">La diferencia entre oídos (el latido).</small>
          </div>
        </div>

        <div class="auth-field">
          <label for="freq-wave">Forma de onda</label>
          <select id="freq-wave" name="waveform"></select>
        </div>

        <div class="auth-error hidden" id="freq-error" role="alert"></div>

        <button type="submit" class="auth-submit" id="freq-submit">Guardar frecuencia</button>
      </form>

      <p class="auth-foot">
        Se guarda con tu cuenta: sin sesión activa, primero te pedimos que
        inicies sesión o crees una cuenta (gratis y opcional).
      </p>
    </div>
  </div>`}function C(){document.getElementById("freq-modal")||(h=document.createElement("div"),h.innerHTML=k(),document.body.appendChild(h.firstElementChild),B())}function B(){const e=document.getElementById("freq-modal");if(!e)return;const t=()=>e.classList.add("hidden");e.querySelector("#freq-close").addEventListener("click",t),e.addEventListener("click",r=>{r.target===e&&t()}),document.addEventListener("keydown",r=>{r.key==="Escape"&&!e.classList.contains("hidden")&&t()});const a=e.querySelector("#freq-wave");a.innerHTML=M.map(r=>`<option value="${r.id}">${r.label}</option>`).join(""),e.querySelector("#freq-form").addEventListener("submit",P)}function p(e){const t=document.getElementById("freq-modal");if(!t)return;const a=t.querySelector("#freq-submit");a.disabled=e,a.textContent=e?"Guardando…":"Guardar frecuencia"}function u(e){const t=document.getElementById("freq-modal");if(!t)return;const a=t.querySelector("#freq-error");a.textContent=e,a.classList.toggle("hidden",!e)}async function P(e){e.preventDefault();const t=document.getElementById("freq-modal"),a=t.querySelector("#freq-name").value.trim(),r=parseFloat(t.querySelector("#freq-base").value),s=parseFloat(t.querySelector("#freq-beat").value),v=t.querySelector("#freq-wave").value;if(!a)return u("Poné un nombre para reconocerla después.");if(!Number.isFinite(r)||r<2||r>19999)return u("La portadora debe estar entre 2 y 19999 Hz.");if(!Number.isFinite(s)||s<0||s>499)return u("El ritmo debe estar entre 0 y 499 Hz.");p(!0);try{const n=await S({name:a.slice(0,120),carrier_frequency:Math.round(r*10)/10,beat_frequency:Math.round(s*10)/10,waveform:v,condition:"binaural",config:{source:g.source||"generator"}});t.classList.add("hidden"),t.querySelector("#freq-form").reset(),u(""),document.dispatchEvent(new CustomEvent("vyneural:freq-saved",{detail:{frequency:n}}))}catch(n){const o=n&&n.detail||"No se pudo guardar. Intentá de nuevo.";u(String(o).slice(0,300))}finally{p(!1)}}function H(e={}){C();const t=document.getElementById("freq-modal");if(g=e,!E()){const r=window.__vyneuralAuth;return r&&typeof r.open=="function"&&r.open("login"),!1}t.querySelector("#freq-name").value=e.name||"",t.querySelector("#freq-base").value=e.carrier!=null?e.carrier:220,t.querySelector("#freq-beat").value=e.beat!=null?e.beat:10;const a=t.querySelector("#freq-wave");return a.value=e.wave||"sine",u(""),t.classList.remove("hidden"),setTimeout(()=>t.querySelector("#freq-name").focus(),50),!0}export{F as _,H as o};
