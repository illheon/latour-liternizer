import { $, clamp, hashString, makeRNG, flash } from './util.js';
import { loadLocalThings, saveLocalThings, resetLocalThings } from './local.js';
import { fetchBalancedThings, fetchThemedThings } from './wiki.js';


let LOCAL_THINGS = loadLocalThings();
let WIKI_THINGS = [];
let litany = [];
let lastSeed = 0;
let backfillLocalWhenShort = true; // 기본은 보충 ON

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

function fitCanvas(){
  const ratio = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = '100%';
  canvas.style.height= '100%';
  ctx.setTransform(ratio,0,0,ratio,0,0);
}

function drawWrappedText(ctx, str, x, y, maxW, leading){
  const words = str.split(' ');
  let line = '', yy = y;
  for(let i=0;i<words.length;i++){
    const test = line + words[i] + ' ';
    if(ctx.measureText(test).width > maxW){
      ctx.fillText(line, x, yy);
      line = words[i] + ' ';
      yy += leading;
    }else{
      line = test;
    }
  }
  if(line) ctx.fillText(line, x, yy);
}

function draw(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#0e0f12';
  ctx.fillRect(0,0,w,h);

  ctx.fillStyle = 'rgb(154,160,166)';
  ctx.font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  const srcLabel = ($('#source').value==='wiki') ? `WIKIPEDIA (${ $('#lang').value })` : 'LOCAL';
  ctx.fillText(`LATOUR LITANIZER — ${srcLabel}`, 24, 40);

  const margin = 72;
  const columnWidth = Math.min(w - margin*2, 900);
  let text = litany.join(', ') + '.';
  if($('#caps').checked) text = text.toUpperCase();

  for(let i=0;i<6;i++){
    const a = 10 - (10/5)*i;
    ctx.strokeStyle = `rgba(127,209,255,${a/100})`;
    ctx.beginPath();
    ctx.moveTo(margin, h*0.22 - 30 - i*4);
    ctx.lineTo(margin + columnWidth, h*0.22 - 30 - i*4);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgb(230,231,234)';
  ctx.font = '28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  drawWrappedText(ctx, text, margin, h*0.22, columnWidth, 38);

  ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  ctx.fillStyle = 'rgb(122,170,200)';
  ctx.fillText(`seed: ${lastSeed>>>0}`, 24, h-20);
}

function generate(resetSeed){
  const n = clamp(parseInt($('#count').value,10), 6, 40);
  const seedStr = ($('#seed').value || '').trim();
  if(resetSeed){
    lastSeed = seedStr ? hashString(seedStr) : (Math.random()*1e9)|0;
  }
  const rng = makeRNG(lastSeed || 1);
  const source = $('#source').value;

  let pool = (source==='wiki') ? [...WIKI_THINGS] : [...LOCAL_THINGS];

// ⛔ 소스가 wiki이고 보충이 꺼져 있으면 로컬 보충 금지
if (pool.length < n && !(source==='wiki' && backfillLocalWhenShort === false)) {
  const add = LOCAL_THINGS.filter(x => !pool.includes(x));
  pool.push(...add);
}

  litany = [];
  for(let i=0;i<n && pool.length>0;i++){
    const idx = Math.floor(rng()*pool.length);
    litany.push(pool.splice(idx,1)[0]);
  }
  draw();
}

async function pullTheme(){
  const n     = clamp(parseInt($('#count').value,10), 6, 40);
  const lang  = $('#lang').value;
  const kwRaw = $('#themeKeyword').value;
  const kw    = (kwRaw||'').trim();

  if(!kw){ flash('키워드를 입력해 주세요'); return; }

  flash(`"${kw}" 관련 항목 수집 중…`);
  try{
    const titles = await fetchThemedThings({
      lang, keyword: kw, total: n, personCap: 0.2
    });
    if(!titles.length) { flash('관련 결과가 부족합니다'); return; }
    WIKI_THINGS = titles;
    $('#source').value = 'wiki';
      // ← 키워드 모드: 보충 끔
  backfillLocalWhenShort = false;
    flash(`"${kw}" 관련 ${titles.length}개 생성`);
    generate(true);
  }catch(e){
    console.error(e);
    flash('키워드 생성 실패');
  }
}


async function pullFromWiki(){
  const n    = clamp(parseInt($('#count').value,10), 6, 40);
  const lang = $('#lang').value;

  // 인명 상한 비율(원하면 0.1~0.3 사이로 조절)
  const PERSON_CAP = 0.2;        // 20%
  const OVERSAMPLE = 3;          // 위키 과샘플 배수

  flash('위키에서 가져오는 중…');
  try{
    const titles = await fetchBalancedThings({
      lang, total: n,
      localPool: LOCAL_THINGS,    // 부족분 보충
      personCap: PERSON_CAP,
      oversampleFactor: OVERSAMPLE
    });
    if(!titles.length) throw new Error('결과 없음');
    WIKI_THINGS = titles;
    $('#source').value = 'wiki';
    backfillLocalWhenShort = true;

    flash(`위키(균형)에서 ${titles.length}개 로드됨 (인명≤${Math.round(PERSON_CAP*100)}%)`);
    generate(true);
  }catch(e){
    console.error(e);
    flash('가져오기 실패 (네트워크/권한 확인)');
  }
}


function openEditor(){
  $('#ta').value = LOCAL_THINGS.join('\n');
  $('#modalWrap').style.display = 'grid';
}
function closeEditor(){ $('#modalWrap').style.display = 'none'; }
function saveEditor(){
  const lines = $('#ta').value.split('\n').map(s=>s.trim()).filter(Boolean);
  LOCAL_THINGS = saveLocalThings(lines);
  if($('#source').value==='local') generate(true);
  flash(`로컬 데이터 ${LOCAL_THINGS.length}개 저장`);
  closeEditor();
}
async function handleImport(evt){
  const f = evt.target.files[0];
  if(!f) return;
  try{
    const text = await f.text();
    const arr = JSON.parse(text);
    if(!Array.isArray(arr)) throw new Error('JSON 배열 아님');
    LOCAL_THINGS = saveLocalThings(arr);
    $('#ta').value = LOCAL_THINGS.join('\n');
    flash('JSON 불러오기 완료');
  }catch(e){
    console.error(e);
    flash('가져오기 실패: JSON 형식 확인');
  }finally{ evt.target.value=''; }
}
function handleExport(){
  const data = JSON.stringify(LOCAL_THINGS, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'latour-local-things.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  flash('JSON 내보내기 완료');
}

function savePNG(){
  const link = document.createElement('a');
  link.download = 'latour-litanizer.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function bindUI(){
  $('#regen').onclick = ()=> generate(true);
  $('#save').onclick  = savePNG;
  $('#copy').onclick  = async ()=> {
    let t = litany.join(', ') + '.';
    if($('#caps').checked) t = t.toUpperCase();
    try{
      await navigator.clipboard.writeText(t);
      flash('복사됨!');
    }catch{ flash('복사 실패: 권한 확인'); }
  };
  $('#count').oninput = ()=> generate(false);
  $('#caps').onchange = draw;
  $('#seed').addEventListener('change', ()=> generate(true));
  $('#pullwiki').onclick = pullFromWiki;
  $('#editLocal').onclick = openEditor;

  // Modal
  $('#btnCancel').onclick = closeEditor;
  $('#btnSaveLocal').onclick = saveEditor;
  $('#btnReset').onclick = ()=>{
    LOCAL_THINGS = resetLocalThings();
    $('#ta').value = LOCAL_THINGS.join('\n');
    flash('기본값으로 복원됨');
  };
  $('#btnImport').onclick = ()=> $('#fileInput').click();
  $('#fileInput').addEventListener('change', handleImport);
  $('#btnExport').onclick = handleExport;
}

function init(){
  fitCanvas();
  window.addEventListener('resize', ()=>{ fitCanvas(); draw(); });
  bindUI();
  generate(true);
}

init();

