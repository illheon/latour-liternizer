export const $ = sel => document.querySelector(sel);
export function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

export function hashString(s){
  let h = 2166136261>>>0;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h>>>0;
}

export function makeRNG(seed){
  let x = seed || 123456789;
  return function(){
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    x = x|0;
    return ((x>>>0)/0xFFFFFFFF);
  };
}

export function flash(msg){
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style,{
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    background:'#111e', border:'1px solid #2a2d34', padding:'10px 14px',
    borderRadius:'10px', color:'#e6e7ea', fontSize:'14px', zIndex:'9999'
  });
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1000);
}
