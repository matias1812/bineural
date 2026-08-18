const p=[["#7c3aed","#c4b5fd"],["#0ea5e9","#bae6fd"],["#f97316","#fed7aa"],["#10b981","#a7f3d0"],["#ec4899","#fbcfe8"],["#eab308","#fef08a"]];function g(t){const o=`${(t==null?void 0:t.name)||""}|${(t==null?void 0:t.carrier_frequency)||0}|${(t==null?void 0:t.beat_frequency)||0}|${(t==null?void 0:t.waveform)||""}`;let a=0;for(let n=0;n<o.length;n++)a=a*31+o.charCodeAt(n)>>>0;return a}function f(t,o,a){const n=a/2,e=a*.32,l=2,s=48,d=[];for(let h=0;h<=s;h++){const $=h/s,u=$*o,i=$*l*Math.PI*2;let c;if(t==="square")c=n-e*Math.sign(Math.sin(i)||1);else if(t==="triangle")c=n-e*(2/Math.PI)*Math.asin(Math.sin(i));else if(t==="sawtooth"){const r=i/(Math.PI*2)%1;c=n-e*(2*(r-Math.floor(r+.5)))}else c=n-e*Math.sin(i);d.push(`${u.toFixed(1)},${c.toFixed(1)}`)}return`M${d.join(" L")}`}function x(t){return String(t??"").replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function M(t,o=48){const a=g(t),[n,e]=p[a%p.length],l=f((t==null?void 0:t.waveform)||"sine",o,o),s=`fc-${a.toString(36)}`;return`<svg class="freq-cover" viewBox="0 0 ${o} ${o}" width="${o}" height="${o}" role="img" aria-label="Portada de ${x((t==null?void 0:t.name)||"frecuencia")}">
    <defs>
      <linearGradient id="${s}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${e}" />
        <stop offset="1" stop-color="${n}" />
      </linearGradient>
    </defs>
    <rect width="${o}" height="${o}" rx="${(o*.22).toFixed(1)}" fill="url(#${s})" />
    <path d="${l}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1.5,o*.045).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" />
  </svg>`}export{M as f};
