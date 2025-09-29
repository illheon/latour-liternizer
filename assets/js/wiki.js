// assets/js/wiki.js
import { clamp } from './util.js';

/** 기본: 무작위 제목 가져오기 */
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

/** 사람일 확률이 높은 제목 휴리스틱 필터 */
export function isLikelyPerson(title, lang='ko'){
  const t = String(title);

  // 공통 패턴(생년/직업/국적 표시 등)
  const common = [
    /\(.*\b(born|died|footballer|actor|actress|singer|politician|writer|artist|baseball|basketball|tennis)\b.*\)/i,
    /\b(born|died)\b/i,
    /출생|사망|배우|가수|정치인|작가|화가|시인|체조|야구(?:선수)?|축구(?:선수)?|농구(?:선수)?|테니스(?:선수)?/,
  ];

  // 영어식 이름 “Firstname Lastname” (둘 다 알파벳 대문자 시작)
  const enName = /^[A-Z][a-z]+(?:[-\s][A-Z][a-z]+)+$/;

  // 한국어 인명: 띄어쓰기 1회 이상 + 한글 대다수, 혹은 ‘OOO(1980년생)’ 류
  const koName = /[가-힣]{2,4}\s[가-힣]{1,4}/;

  // 한 글자 성 + 두/세 글자 이름 패턴이 제목 전체이거나 괄호로 보충됨
  const koTight = /^[가-힣]{1,2}\s?[가-힣]{2,3}(?:\s?\([^)]+\))?$/;

  const rules = [
    ...common,
    lang === 'en' ? enName : null,
    lang === 'ko' ? koName : null,
    lang === 'ko' ? koTight : null,
  ].filter(Boolean);

  return rules.some(re => re.test(t));
}

/**
 * 균형 잡힌 목록 생성:
 * - 위키에서 많이(과샘플) 뽑아와 사람 추정 제목 제외
 * - 남는 수가 부족하면 로컬에서 보충
 * - 최종적으로 '인명 상한 비율'을 강제 (기본 20%)
 */
export async function fetchBalancedThings({
  lang='ko',
  total=20,
  localPool=[],
  personCap=0.2,     // 전체 중 인명 최대 비율
  oversampleFactor=3 // 위키 과샘플 비율 (total*3 만큼 시도)
} = {}){
  const want = clamp(total, 1, 40);
  const tryCount = clamp(Math.ceil(want * oversampleFactor), want, 120);

  // 1) 위키 과샘플
  let wiki = [];
  // generator=random는 콜당 최대 40 → 여러 번 호출해 모음
  let remain = tryCount;
  while(remain > 0){
    const take = Math.min(40, remain);
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchWikipediaRandomTitles(lang, take);
    wiki.push(...chunk);
    remain -= take;
  }
  // 중복 제거
  wiki = Array.from(new Set(wiki));

  // 2) 인명/비인명 분리
  const persons   = [];
  const nonHumans = [];
  for(const t of wiki){
    (isLikelyPerson(t, lang) ? persons : nonHumans).push(t);
  }

  // 3) 목표 비율에 맞게 합성
  const maxPersons = Math.floor(want * personCap);
  const pick = (arr, n) => {
    const a = [...arr];
    const out = [];
    while(n-- > 0 && a.length){
      const i = Math.floor(Math.random()*a.length);
      out.push(a.splice(i,1)[0]);
    }
    return out;
  };

  // 우선 비인간 우선으로 채우고, 남으면 인명에서 상한까지
  let result = [];
  const needNon = want - maxPersons; // 비인간 최소 목표치
  const nonTake = Math.min(nonHumans.length, Math.max(0, needNon));
  result.push(...pick(nonHumans, nonTake));

  // 남은 자리 중 인명 상한 안에서 채우기
  const left1 = want - result.length;
  const personTake = Math.min(persons.length, Math.min(left1, maxPersons));
  result.push(...pick(persons, personTake));

  // 아직 모자라면 비인간에서 추가
  const left2 = want - result.length;
  if(left2 > 0){
    result.push(...pick(nonHumans, Math.min(nonHumans.length, left2)));
  }

  // 그래도 부족하면 로컬에서 보충
  const left3 = want - result.length;
  if(left3 > 0 && localPool?.length){
    result.push(...pick(localPool, Math.min(localPool.length, left3)));
  }

  // 최종 셔플
  for(let i=result.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, want);
}
