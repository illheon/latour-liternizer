const LS_KEY = 'latour_litanizer_local_things_v1';

const LOCAL_DEFAULT = [
  "소나무","황사","빙하 조각","수달","플랑크톤","파리지옥","효모","곰팡이 포자","스마트폰",
  "로봇램프","자전거 체인","드론 배터리","점자블록","태양광 패널","글라도스","하트 컨테이너",
  "루피","RTX 쉐이더","중성미자","라그랑주점","암흑물질","혜성 꼬리","머그컵","볼펜 스프링",
  "커피 찌꺼기","택배 송장","키캡","마스킹테이프","지퍼백","거버넌스","에르고딕 경로",
  "평평한 존재론","프로토콜","에러 404","꿀 아이스크림","로즈마리","유자청","발아 콩나물",
  "서브우퍼 저역","도플러 효과","LED 플리커","스테핑모터 진동","하모닉스"
];

export function loadLocalThings(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return [...LOCAL_DEFAULT];
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)&&arr.length) return arr.filter(x=>typeof x==='string' && x.trim().length);
    return [...LOCAL_DEFAULT];
  }catch{ return [...LOCAL_DEFAULT]; }
}
export function saveLocalThings(arr){
  const clean = (arr||[]).map(s=>String(s).trim()).filter(Boolean);
  localStorage.setItem(LS_KEY, JSON.stringify(clean));
  return clean;
}
export function resetLocalThings(){
  localStorage.removeItem(LS_KEY);
  return [...LOCAL_DEFAULT];
}
