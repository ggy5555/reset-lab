'use strict';
// The browser does not receive the Notion token. Only the same-origin server may write to Notion.
(function(){
  let online=false,ready=false,busy=false,timer=null;
  const e=id=>document.getElementById(id);
  function mark(msg,kind='info'){
    if(e('syncStatus')){e('syncStatus').textContent=msg;e('syncStatus').dataset.kind=kind;}
    const badge=e('cloudBadge'); if(badge)badge.textContent=kind==='success'?'SERVER CONNECTED':kind==='error'?'SYNC ERROR':'LOCAL + SYNC';
    if(e('loginPanel'))e('loginPanel').hidden=online;
    if(e('syncButton'))e('syncButton').disabled=!online||!ready||busy;
    if(e('verifyButton'))e('verifyButton').disabled=!online||!ready||busy;
  }
  async function call(path,body){
    const res=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const val=await res.json().catch(()=>({error:'응답 읽기 실패'}));
    if(!res.ok)throw new Error(val.error||'Server HTTP '+res.status);
    return val;
  }
  function countPending(){return db.sessions.filter(s=>s.syncState!=='synced').length+db.tasks.filter(t=>t.syncState!=='synced').length;}
  async function check(){
    if(location.protocol==='file:'){mark('파일 모드: 로컬 기록만 가능. 자동 동기화는 제공된 Node 서버로 실행해야 해.');return;}
    try{
      const st=await call('/api/status');online=!!st.authenticated;ready=!!st.ready;
      mark(ready?`서버 연결됨 · 노션 저장 대기 ${countPending()}개`:'서버 로그인됨 · Notion 키 미설정',ready?'success':'info');
      if(ready)await sync();
    } catch(err){online=false;ready=false;mark('로그인 전: 기록은 현재 브라우저에 안전하게 보관됨');}
  }
  async function login(){
    const pwd=e('syncPassword')?.value||'';
    if(!pwd){mark('서버 비밀번호를 입력해줘','error');return;}
    try{const st=await call('/api/login',{password:pwd});e('syncPassword').value='';online=true;ready=!!st.ready;mark(ready?'서버 연결 완료 · 노션 동기화 중':'서버 로그인 완료 · Notion 키 미설정',ready?'success':'error');if(ready)await sync();}
    catch(err){mark(err.message,'error')}
  }
  async function verify(){
    if(!online||!ready)return;
    try{
      const status=await call('/api/verify');
      const each=Object.entries(status.access||{}).map(([k,v])=>`${k}:${v.ok?'OK':'연결 확인 필요'}`).join(' / ');
      mark(status.allAccessible?'DB 4개 읽기 권한 확인 · '+each:'DB 접근 미완료 · '+each,status.allAccessible?'success':'error');
    }catch(err){mark('권한 검사 실패 · '+err.message,'error');}
  }
  async function sync(){
    if(busy||!online||!ready)return;
    const unsynced=db.sessions.filter(s=>s.syncState!=='synced');
    const linked=new Set(unsynced.map(s=>s.taskId).filter(Boolean));
    const tasks=db.tasks.filter(t=>t.syncState!=='synced'||linked.has(t.id));
    if(!tasks.length&&!unsynced.length){mark('학교 Notion으로 전송할 새 기록 없음','success');return;}
    busy=true;mark(`동기화 중 · ${unsynced.length}개 세션 / ${tasks.length}개 할 일`);
    try{
      const result=await call('/api/sync',{tasks:tasks.slice(0,80),sessions:unsynced.slice(0,80)});
      const doneTasks=new Set(result.tasks.filter(x=>x.ok).map(x=>x.id));
      const doneSessions=new Set(result.sessions.filter(x=>x.ok).map(x=>x.id));
      db.tasks.filter(t=>doneTasks.has(t.id)).forEach(t=>t.syncState='synced');
      db.sessions.filter(s=>doneSessions.has(s.id)).forEach(s=>s.syncState='synced');
      save(false);render();
      const errors=[...result.tasks,...result.sessions].filter(x=>!x.ok);
      if(errors.length){mark(`부분 완료 · 실패 ${errors.length}개: ${errors[0].error}`,'error');}
      else mark(`노션 저장 완료 · 세션 ${doneSessions.size}개 / 할 일 ${doneTasks.size}개`,'success');
      // Data above per-batch limit is handled on next click to avoid burst API writes.
    }catch(err){mark('서버 전송 실패 · 로컬 기록 유지: '+err.message,'error')}
    finally{busy=false;if(e('syncButton'))e('syncButton').disabled=!ready;}
  }
  window.scheduleSync=function(){
    if(!ready||!online)return;
    clearTimeout(timer);timer=setTimeout(sync,1800);
  };
  window.resetlabSyncNow=sync;
  document.addEventListener('DOMContentLoaded',()=>{
    e('loginButton')?.addEventListener('click',login);
    e('syncPassword')?.addEventListener('keydown',x=>{if(x.key==='Enter')login()});
    e('syncButton')?.addEventListener('click',sync);
    e('verifyButton')?.addEventListener('click',verify);
    e('logoutButton')?.addEventListener('click',async()=>{try{await call('/api/logout',{});online=false;ready=false;mark('로그아웃됨');}catch(err){mark(err.message,'error')}});
    check();
  });
})();
