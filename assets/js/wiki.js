import { clamp } from './util.js';

export async function fetchWikipediaRandomTitles(lang='ko', limit=20){
  const capped = clamp(limit,1,40);
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action:'query', format:'json',
    generator:'random', grnnamespace:'0', grnlimit:String(capped),
    prop:'info', origin:'*'
  }).toString();
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status);
  const data = await res.json();
  const titles = [];
  if(data && data.query && data.query.pages){
    for(const k of Object.keys(data.query.pages)){
      const t = data.query.pages[k].title;
      if(t && !titles.includes(t)) titles.push(t);
    }
  }
  return titles;
}
