// Offline-first synchronization: reject malformed events before any Notion writes.
const CATEGORIES=new Set(['공부·수업','수면','식사','씻기·정리','운동','게임·취미']);
const TYPES=new Set(['','일반 자습','인터넷 강의','숙제','복습','학원','학교 수업']);
const TASK_CATS=new Set(['학원 숙제','개인 탐구·프로젝트','인강 수강 계획','수행평가','일상 할 일']);
const REPEATS=new Set(['','없음','매일','평일','매주','매월']);
const ROLES=new Set(['','대표','보조','미정']);
function checkId(x){return typeof x==='string' && /^[a-zA-Z0-9:_-]{3,160}$/.test(x)}
function string(x,limit=500){return typeof x==='string'&&x.length<=limit}
function validTask(t){return t && checkId(t.id)&&string(t.title,180)&&t.title.trim()&&TASK_CATS.has(t.category)&&string(t.subject,120)&&string(t.due??'',30)&&REPEATS.has(t.repeat??'')&&typeof t.done==='boolean'&&Array.isArray(t.checklist)&&t.checklist.length<=100&&t.checklist.every(c=>string(c.text,250)&&typeof c.done==='boolean');}
function validSession(s){
 if(!s||!checkId(s.id)||!string(s.activity,180)||!s.activity.trim()||!CATEGORIES.has(s.category)||!TYPES.has(s.type??'')||!string(s.subject??'',100)||!string(s.tag??'',100)||!ROLES.has(s.role??'')||!string(s.taskId??'',160))return false;
 if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<s.start||s.end-s.start>48*3600000||s.end>Date.now()+600000)return false;
 if(!Array.isArray(s.intervals)||s.intervals.length>300||!s.intervals.length)return false;
 let last=-Infinity;
 for(const b of s.intervals){if(!b||!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.end<b.start||b.start<s.start||b.end>s.end||b.start<last)return false;last=b.end;}
 return true;
}
export async function syncBatch(client,payload){
 if(!payload||!Array.isArray(payload.tasks)||!Array.isArray(payload.sessions)||payload.tasks.length>80||payload.sessions.length>80) throw new Error('요청 형식이 잘못됐어 (한 번에 최대 각 80개)');
 const subjects=await client.subjectsMap();
 const taskResults=[],sessionResults=[],taskIds=new Map();
 for(const t of payload.tasks){
  if(!validTask(t)){taskResults.push({id:t?.id??null,ok:false,error:'잘못된 할 일 데이터'});continue;}
  try{const page=await client.upsertTask(t,subjects);taskIds.set(t.id,page.id);taskResults.push({id:t.id,ok:true});}
  catch(e){taskResults.push({id:t.id,ok:false,error:'할 일 동기화 실패: '+e.message.slice(0,160)});}
 }
 for(const s of payload.sessions){
  if(!validSession(s)){sessionResults.push({id:s?.id??null,ok:false,error:'잘못된 시간 기록'});continue;}
  if(s.taskId&&!taskIds.has(s.taskId)){
    sessionResults.push({id:s.id,ok:false,error:'연결할 할 일이 먼저 동기화되어야 함'});continue;
  }
  try{await client.upsertSession(s,subjects,taskIds.get(s.taskId));sessionResults.push({id:s.id,ok:true});}
  catch(e){sessionResults.push({id:s.id,ok:false,error:'시간 기록 저장 실패: '+e.message.slice(0,160)});}
 }
 return {tasks:taskResults,sessions:sessionResults};
}
