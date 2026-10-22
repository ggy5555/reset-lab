import test from 'node:test';
import assert from 'node:assert/strict';
import {syncBatch} from '../server/sync.mjs';
import {createNotionClient,SOURCES} from '../server/notion.mjs';

function fixture(){
 const rows=new Map(Object.values(SOURCES).map(id=>[id,[]]));let seq=1;
 rows.get(SOURCES.subjects).push({id:'subject-math',properties:{'과목':{title:[{plain_text:'수학'}]}}});
 const calls=[];
 async function mockFetch(url,config){
  const parts=url.split('/');const endpoint=parts.slice(4);const body=config.body?JSON.parse(config.body):{};
  calls.push({url,method:config.method,body,headers:config.headers});
  let data,status=200;
  if(config.method==='POST'&&endpoint[0]==='data_sources'){
    const sourceId=endpoint[1];let list=rows.get(sourceId)||[];
    if(body.filter?.rich_text?.equals){const {property,rich_text}=body.filter;list=list.filter(p=>p.properties[property]?.rich_text?.[0]?.text?.content===rich_text.equals);}
    data={results:list,has_more:false,next_cursor:null};
  } else if(config.method==='POST'&&endpoint[0]==='pages'){
    const row={id:'page-'+seq++,properties:body.properties};rows.get(body.parent.data_source_id).push(row);data=row;
  } else if(config.method==='PATCH'&&endpoint[0]==='pages'){
    const id=endpoint[1];const row=[...rows.values()].flat().find(p=>p.id===id);assert.ok(row);row.properties={...row.properties,...body.properties};data=row;
  } else {status=404;data={message:'Not found'};}
  return {ok:status===200,status,headers:{get(){return null}},json:async()=>data,text:async()=>JSON.stringify(data)};
 }
 return {rows,calls,client:createNotionClient({token:'mock-token',baseURL:'https://api.notion.com/v1',fetchImpl:mockFetch})};
}
function record(){const end=Date.now()-5000;return {id:'sess-id-1234',activity:'수학 숙제',category:'공부·수업',subject:'수학',type:'숙제',tag:'',role:'미정',taskId:'task-id-1234',start:end-60000,end,intervals:[{start:end-60000,end:end-30000},{start:end-25000,end}],status:'done'};}
function taskRow(){return {id:'task-id-1234',title:'수학 학원 숙제',category:'학원 숙제',subject:'수학',due:'',repeat:'없음',done:false,checklist:[{text:'1쪽',done:true}]};}

test('create Notion task, linked session, and precise unpaused interval rows',async()=>{
 const fx=fixture();const result=await syncBatch(fx.client,{tasks:[taskRow()],sessions:[record()]});
 assert.deepEqual(result.tasks.map(x=>x.ok),[true]);assert.deepEqual(result.sessions.map(x=>x.ok),[true]);
 assert.equal(fx.rows.get(SOURCES.tasks).length,1);
 assert.equal(fx.rows.get(SOURCES.sessions).length,1);
 assert.equal(fx.rows.get(SOURCES.intervals).length,2);
 const s=fx.rows.get(SOURCES.sessions)[0];
 assert.equal(s.properties['유효시간(초)'].number,55);
 assert.equal(s.properties['일시정지(초)'].number,5);
 assert.deepEqual(s.properties['과목'].relation,[{id:'subject-math'}]);
 assert.deepEqual(s.properties['연결된 할 일'].relation,[{id:fx.rows.get(SOURCES.tasks)[0].id}]);
 assert.ok(fx.calls.every(c=>c.headers.Authorization==='Bearer mock-token'));
 assert.ok(fx.calls.every(c=>c.headers['Notion-Version']==='2025-09-03'));
});
test('retrying an already saved session is idempotent including interval rows',async()=>{
 const fx=fixture();const input={tasks:[taskRow()],sessions:[record()]};
 await syncBatch(fx.client,input);await syncBatch(fx.client,input);
 assert.equal(fx.rows.get(SOURCES.tasks).length,1);
 assert.equal(fx.rows.get(SOURCES.sessions).length,1);
 assert.equal(fx.rows.get(SOURCES.intervals).length,2);
});
test('invalid time intervals are rejected without writes',async()=>{
 const fx=fixture();const rec=record();rec.intervals[1].start=rec.intervals[0].start;
 const result=await syncBatch(fx.client,{tasks:[],sessions:[rec]});
 assert.equal(result.sessions[0].ok,false);assert.equal(fx.rows.get(SOURCES.sessions).length,0);
});
test('session with unsynced referenced task cannot silently lose relation',async()=>{
 const fx=fixture();const result=await syncBatch(fx.client,{tasks:[],sessions:[record()]});
 assert.equal(result.sessions[0].ok,false);assert.equal(fx.rows.get(SOURCES.sessions).length,0);
});
test('sync batch size validation',async()=>{
 const fx=fixture();await assert.rejects(syncBatch(fx.client,{tasks:new Array(81).fill({}),sessions:[]}),/최대/);
});
