// assets/js/wiki.js
import { clamp } from './util.js';

/** -----------------------------
 * 공용: 무작위 제목 가져오기
 * ----------------------------- */
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
  if(data?.query?.pages){
    for(const k of Object.keys(data.query.pages)){
      const t = data.query.pages[k].title;
      if(t && !titles.includes(t)) titles.push(t);
    }
  }
  return titles;
}

/** -----------------------------
 * 공용: 검색(키워드)로 제목 가져오기
 * ----------------------------- */
export async function fetchWikipediaSearchTitles(lang='ko', query='', limit=20){
  const q = (query||'').trim();
  if(!q) return [];
  const capped = clamp(limit,1,50);
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action:'query', format:'json', list:'search',
    srsearch:q, srlimit:String(capped), srnamespace:'0',
    origin:'*'
  }).toString();
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status);
  const data = await res.json();
  const out = [];
  if(data?.query?.search){
    for(const it of data.query.search){
      if(it?.title) out.push(it.title);
    }
  }
  return out;
}

/** -----------------------------
 * 인명 판별 휴리스틱
 * ----------------------------- */
export function isLikelyPerson(title, lang='ko'){
  const t = String(title);

  const common = [
    /\(.*\b(born|died|footballer|actor|actress|singer|politician|writer|artist|baseball|basketball|tennis)\b.*\)/i,
    /\b(born|died)\b/i,
    /출생|사망|배우|가수|정치인|작가|화가|시인|체조|야구(?:선수)?|축구(?:선수)?|농구(?:선수)?|테니스(?:선수)?/
  ];
  const enName = /^[A-Z][a-z]+(?:[-\s][A-Z][a-z]+)+$/;
  const koName = /[가-힣]{2,4}\s[가-힣]{1,4}/;
  const koTight= /^[가-힣]{1,2}\s?[가-힣]{2,3}(?:\s?\([^)]+\))?$/;

  const rules = [...common,
    lang==='en'?enName:null,
    lang==='ko'?koName:null,
    lang==='ko'?koTight:null
  ].filter(Boolean);

  return rules.some(re => re.test(t));
}

/** -----------------------------
 * 위키 랜덤 균형 잡기(인명 상한)
 * ----------------------------- */
export async function fetchBalancedThings({
  lang='ko',
  total=20,
  localPool=[],
  personCap=0.2,
  oversampleFactor=3
} = {}){
  const want = clamp(total, 1, 40);
  const tryCount = clamp(Math.ceil(want * oversampleFactor), want, 120);

  let wiki = [];
  let remain = tryCount;
  while(remain > 0){
    const take = Math.min(40, remain);
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchWikipediaRandomTitles(lang, take);
    wiki.push(...chunk);
    remain -= take;
  }
  wiki = Array.from(new Set(wiki));

  const persons=[], nonHumans=[];
  for(const t of wiki){
    (isLikelyPerson(t, lang) ? persons : nonHumans).push(t);
  }

  const maxPersons = Math.floor(want * personCap);
  const pick = (arr, n) => {
    const a=[...arr], out=[];
    while(n-- > 0 && a.length){
      const i = Math.floor(Math.random()*a.length);
      out.push(a.splice(i,1)[0]);
    }
    return out;
  };

  let result=[];
  const needNon = want - maxPersons;
  result.push(...pick(nonHumans, Math.min(nonHumans.length, Math.max(0,needNon))));

  const left1 = want - result.length;
  result.push(...pick(persons, Math.min(persons.length, Math.min(left1, maxPersons))));

  const left2 = want - result.length;
  if(left2 > 0) result.push(...pick(nonHumans, Math.min(nonHumans.length, left2)));

  const left3 = want - result.length;
  if(left3 > 0 && localPool?.length) result.push(...pick(localPool, Math.min(localPool.length, left3)));

  for(let i=result.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0,want);
}

/** -----------------------------
 * 키워드(테마) 기반 생성
 * ----------------------------- */
const THEME_SYNONYMS = {
  ko: {
    '회전': ['회전','회전운동','자전','공전','스핀','각운동량','원운동','소용돌이','선풍','토네이도','회전체','드릴','턴테이블','빙글빙글'],
  },
  en: {
    'rotation': ['rotation','spin','angular momentum','circular motion','vortex','spiral','whirl','gyroscope','centrifugal','torque','turntable','swirl']
  }
};

function expandThemeQueries(lang='ko', keyword=''){
  const kw = (keyword||'').trim();
  const bag = new Set();
  if(!kw) return [];
  bag.add(kw);
  const dict = THEME_SYNONYMS[lang] || {};
  const lowerKey = kw.toLowerCase();
  for(const [k, arr] of Object.entries(dict)){
    if(k === kw || k === lowerKey) arr.forEach(x=>bag.add(x));
  }
  if(lang==='ko' && /회전|자전|공전/.test(kw)){
    ['rotation','spin','vortex','angular momentum'].forEach(x=>bag.add(x));
  }
  if(lang==='en' && /rotation|spin/.test(lowerKey)){
    ['회전','자전','공전','각운동량','소용돌이'].forEach(x=>bag.add(x));
  }
  return Array.from(bag).slice(0,12);
}

export async function fetchThemedThings({
  lang='ko',
  keyword='',
  total=20,
  // localPool 제거해도 됨
  personCap=0.2
} = {}){
  const want = clamp(total,1,40);
  const queries = expandThemeQueries(lang, keyword);
  if(!queries.length) return [];

  let bag = new Set();
  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const titles = await fetchWikipediaSearchTitles(lang, q, 40);
    titles.forEach(t => bag.add(t));
    if (bag.size >= want * 5) break;
  }

  const pool = Array.from(bag);

  const persons = [], nonHumans = [];
  for (const t of pool) {
    (isLikelyPerson(t, lang) ? persons : nonHumans).push(t);
  }

  const pick = (arr, n) => {
    const a = [...arr], out = [];
    while (n-- > 0 && a.length) {
      const i = Math.floor(Math.random() * a.length);
      out.push(a.splice(i,1)[0]);
    }
    return out;
  };

  const maxPersons = Math.floor(want * personCap);
  let result = [];

  // 비인간 우선 채우기 (정해진 양만큼 시도)
  const nonTake = Math.min(nonHumans.length, want - maxPersons);
  result.push(...pick(nonHumans, nonTake));

  // 인명 상한 내에서 보충
  const left1 = want - result.length;
  result.push(...pick(persons, Math.min(left1, maxPersons)));

  // 여전히 부족하면 남은 비인간에서 추가 시도
  const left2 = want - result.length;
  result.push(...pick(nonHumans, Math.min(left2, nonHumans.length)));

  // ⛔ 로컬 보충 없음!

  // 셔플 후, 요청 수(want)를 초과하면 자르기 (부족하면 부족한대로 반환)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, Math.min(result.length, want));
}
