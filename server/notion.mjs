// Notion integration for RESET LAB 3.0. This module is server-only.
// Never expose NOTION_API_TOKEN in browser code or version control.
export const SOURCES = Object.freeze({
  subjects: 'edbf7061-2ff6-4260-aba0-0225cd368e63',
  tasks: '45dfb885-cd20-4243-9b1a-be08338da30a',
  sessions: '0a201b4a-b181-4124-91d8-a9245e461659',
  intervals: '8ae79d18-15dd-44ba-a6af-55c2965615cd',
});

const rich = s => [{ type: 'text', text: {content: String(s).slice(0, 1950)} }];
const idtext = s => ({rich_text: rich(s)});
const select = s => s ? {select:{name:s}} : {select:null};
const date = t => t == null ? {date:null} : {date:{start:new Date(t).toISOString()}};
const relation = arr => ({relation:arr.map(id=>({id}))});
const checked = v => ({checkbox:!!v});
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

export function createNotionClient({token, fetchImpl=fetch, baseURL='https://api.notion.com/v1', ids=SOURCES}) {
  if (!token) throw new Error('NOTION_API_TOKEN is not configured');
  async function request(method, path, data) {
    let response;
    for (let attempt=0;attempt<4;attempt++){
      response = await fetchImpl(baseURL + path, {
        method,
        headers:{Authorization:'Bearer '+token, 'Notion-Version':'2025-09-03', 'Content-Type':'application/json'},
        ...(data===undefined?{}:{body:JSON.stringify(data)}),
      });
      if (response.ok) return response.json();
      if (![429,500,502,503,504].includes(response.status) || attempt===3) break;
      let ra=Number(response.headers?.get?.('retry-after'));
      await wait(Number.isFinite(ra)&&ra>0 ? Math.min(ra*1000,5000) : 200*(attempt+1));
    }
    const details = await response.text();
    // Do not include Authorization headers, tokens or arbitrary raw upstream data in errors.
    throw new Error('Notion API '+response.status+' ('+details.slice(0,180).replace(/[\r\n]/g,' ')+')');
  }
  async function query(sourceId, filter) {
    let next=null, result=[];
    do {
      const data=await request('POST','/data_sources/'+sourceId+'/query',{page_size:100,...(filter?{filter}:{}),...(next?{start_cursor:next}:{})});
      result=result.concat(data.results??[]);
      next=data.has_more ? data.next_cursor : null;
    } while(next && result.length<1500);
    return result;
  }
  async function findByText(sourceId, prop, value) {
    const matches=await query(sourceId,{property:prop,rich_text:{equals:value}});
    return matches[0]??null;
  }
  async function subjectsMap(){
    const rows=await query(ids.subjects);const m=new Map();
    for (const row of rows) {
      const name=(row.properties?.['과목']?.title??[]).map(x=>x.plain_text??x.text?.content??'').join('');
      if(name)m.set(name,row.id);
    }
    return m;
  }
  function checkSubject(s,subjects) {
    if (!s) return [];
    const id=subjects.get(s);if(!id)throw new Error('등록된 과목을 찾을 수 없음: '+s);
    return [id];
  }
  async function upsertTask(t,subjects){
    const prior=await findByText(ids.tasks,'외부 할 일 ID',t.id);
    const props={
      '할 일':{title:rich(t.title)}, '외부 할 일 ID':idtext(t.id),
      '분류':select(t.category), '과목':relation(checkSubject(t.subject,subjects)),
      '완료':checked(t.done), '반복':select(t.repeat || '없음'),
      '마감일':t.due?{date:{start:t.due}}:{date:null},
      '세부 체크리스트':{rich_text:rich((t.checklist??[]).map(c=>(c.done?'[x] ':'[ ] ')+c.text).join('\n'))},
    };
    return prior ? request('PATCH','/pages/'+prior.id,{properties:props}) : request('POST','/pages',{parent:{type:'data_source_id',data_source_id:ids.tasks},properties:props});
  }
  async function upsertSession(s,subjects,taskPageId) {
    const prior=await findByText(ids.sessions,'외부 세션 ID',s.id);
    const start=s.start;
    const end=s.end;
    const seconds=Math.round((s.intervals??[]).reduce((n,x)=>n+x.end-x.start,0)/1000);
    const props={
      '활동':{title:rich(s.activity)},'외부 세션 ID':idtext(s.id),
      '대분류':select(s.category),'세부 태그':{multi_select:s.tag?[{name:s.tag}]:[]},
      '공부 유형':select(s.type),'과목':relation(checkSubject(s.subject,subjects)),
      '연결된 할 일':relation(taskPageId?[taskPageId]:[]),
      '시작':date(start),'종료':date(end),'유효시간(초)':{number:seconds},
      '일시정지(초)':{number:Math.max(0,Math.round((end-start)/1000-seconds))},
      '구분':select(s.role||'미정'), '상태':select('완료'), '저장 방식':select('웹앱'),
    };
    const page=prior ? await request('PATCH','/pages/'+prior.id,{properties:props}) : await request('POST','/pages',{parent:{type:'data_source_id',data_source_id:ids.sessions},properties:props});
    // Persist each unpaused sub-interval separately. Both session and interval writes are idempotent.
    for(let i=0;i<s.intervals.length;i++){
      const block=s.intervals[i], key=s.id+':'+i;
      const existing=await findByText(ids.intervals,'외부 구간 ID',key);
      const blockProps={
        '구간':{title:rich((i+1)+' / '+s.activity)},'외부 구간 ID':idtext(key),
        '연결 세션':relation([page.id]),'시작':date(block.start),'종료':date(block.end),
        '지속(초)':{number:Math.round((block.end-block.start)/1000)},
      };
      if(existing) await request('PATCH','/pages/'+existing.id,{properties:blockProps});
      else await request('POST','/pages',{parent:{type:'data_source_id',data_source_id:ids.intervals},properties:blockProps});
    }
    return page;
  }
  async function verifyAccess() {
    const names={subjects:'01 SUBJECTS',tasks:'02 TASKS',sessions:'05 SESSIONS',intervals:'06 SESSION INTERVALS'};
    const access={};
    // Each API call uses the same token the uploader uses, but does not alter data.
    for(const [name,id] of Object.entries(ids)){
      if(!(name in names))continue;
      try {
        const result=await request('GET','/data_sources/'+id);
        access[name]={ok:true,properties:Object.keys(result.properties||{}).length};
      }catch(err){
        access[name]={ok:false,reason:/Notion API (401|403|404)/.test(err.message)?'연결 권한 또는 API 키를 확인해줘':'API 연결 오류'};
      }
    }
    return {access,allAccessible:Object.values(access).every(x=>x.ok),writeTestPerformed:false};
  }
  return {request,query,findByText,subjectsMap,upsertTask,upsertSession,verifyAccess};
}
