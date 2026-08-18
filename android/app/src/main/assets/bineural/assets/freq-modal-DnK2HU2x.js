import{w as g,d as E,x as L,a as M,z as k}from"./site-BEReyNnk.js";import{f as C}from"./freq-cover-DHdNxLHU.js";const B="modulepreload",P=function(e,r){return new URL(e,r).href},y={},G=function(r,a,t){let s=Promise.resolve();if(a&&a.length>0){let n=function(i){return Promise.all(i.map(c=>Promise.resolve(c).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};const o=document.getElementsByTagName("link"),d=document.querySelector("meta[property=csp-nonce]"),b=(d==null?void 0:d.nonce)||(d==null?void 0:d.getAttribute("nonce"));s=n(a.map(i=>{if(i=P(i,t),i in y)return;y[i]=!0;const c=i.endsWith(".css"),f=c?'[rel="stylesheet"]':"";if(!!t)for(let m=o.length-1;m>=0;m--){const q=o[m];if(q.href===i&&(!c||q.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${i}"]${f}`))return;const l=document.createElement("link");if(l.rel=c?"stylesheet":B,c||(l.as="script"),l.crossOrigin="",l.href=i,b&&l.setAttribute("nonce",b),document.head.appendChild(l),c)return new Promise((m,q)=>{l.addEventListener("load",m),l.addEventListener("error",()=>q(new Error(`Unable to preload CSS for ${i}`)))})}))}function v(n){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=n,window.dispatchEvent(o),!o.defaultPrevented)throw n}return s.then(n=>{for(const o of n||[])o.status==="rejected"&&v(o.reason);return r().catch(v)})},R=()=>g("/api/v1/alarms"),j=e=>L("/api/v1/alarms",e),$=e=>E(`/api/v1/alarms/${e}`),x=[{id:"sine",label:"Senoidal (suave)"},{id:"triangle",label:"Triangular"},{id:"square",label:"Cuadrada"},{id:"sawtooth",label:"Diente de sierra"}];let h=null,w={};function F(){return`
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
        <div class="freq-cover-preview" id="freq-cover-preview" aria-hidden="true"></div>
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
  </div>`}function _(){document.getElementById("freq-modal")||(h=document.createElement("div"),h.innerHTML=F(),document.body.appendChild(h.firstElementChild),z())}function z(){const e=document.getElementById("freq-modal");if(!e)return;const r=()=>e.classList.add("hidden");e.querySelector("#freq-close").addEventListener("click",r),e.addEventListener("click",t=>{t.target===e&&r()}),document.addEventListener("keydown",t=>{t.key==="Escape"&&!e.classList.contains("hidden")&&r()});const a=e.querySelector("#freq-wave");a.innerHTML=x.map(t=>`<option value="${t.id}">${t.label}</option>`).join(""),e.querySelector("#freq-form").addEventListener("submit",A),["#freq-name","#freq-base","#freq-beat","#freq-wave"].forEach(t=>{e.querySelector(t).addEventListener("input",S)})}function S(){const e=document.getElementById("freq-modal");if(!e)return;const r=e.querySelector("#freq-cover-preview");r&&(r.innerHTML=C({name:e.querySelector("#freq-name").value,carrier_frequency:parseFloat(e.querySelector("#freq-base").value)||0,beat_frequency:parseFloat(e.querySelector("#freq-beat").value)||0,waveform:e.querySelector("#freq-wave").value},64))}function p(e){const r=document.getElementById("freq-modal");if(!r)return;const a=r.querySelector("#freq-submit");a.disabled=e,a.textContent=e?"Guardando…":"Guardar frecuencia"}function u(e){const r=document.getElementById("freq-modal");if(!r)return;const a=r.querySelector("#freq-error");a.textContent=e,a.classList.toggle("hidden",!e)}async function A(e){e.preventDefault();const r=document.getElementById("freq-modal"),a=r.querySelector("#freq-name").value.trim(),t=parseFloat(r.querySelector("#freq-base").value),s=parseFloat(r.querySelector("#freq-beat").value),v=r.querySelector("#freq-wave").value;if(!a)return u("Poné un nombre para reconocerla después.");if(!Number.isFinite(t)||t<2||t>19999)return u("La portadora debe estar entre 2 y 19999 Hz.");if(!Number.isFinite(s)||s<0||s>499)return u("El ritmo debe estar entre 0 y 499 Hz.");p(!0);try{const n=await k({name:a.slice(0,120),carrier_frequency:Math.round(t*10)/10,beat_frequency:Math.round(s*10)/10,waveform:v,condition:"binaural",config:{source:w.source||"generator"}});r.classList.add("hidden"),r.querySelector("#freq-form").reset(),u(""),document.dispatchEvent(new CustomEvent("vyneural:freq-saved",{detail:{frequency:n}}))}catch(n){const o=n&&n.detail||"No se pudo guardar. Intentá de nuevo.";u(String(o).slice(0,300))}finally{p(!1)}}function V(e={}){_();const r=document.getElementById("freq-modal");if(w=e,!M()){const t=window.__vyneuralAuth;return t&&typeof t.open=="function"&&t.open("login"),!1}r.querySelector("#freq-name").value=e.name||"",r.querySelector("#freq-base").value=e.carrier!=null?e.carrier:220,r.querySelector("#freq-beat").value=e.beat!=null?e.beat:10;const a=r.querySelector("#freq-wave");return a.value=e.wave||"sine",u(""),S(),r.classList.remove("hidden"),setTimeout(()=>r.querySelector("#freq-name").focus(),50),!0}export{G as _,j as c,$ as d,R as l,V as o};
