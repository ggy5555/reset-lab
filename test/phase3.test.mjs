import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createNotionClient,SOURCES} from '../server/notion.mjs';

function runServer(env={}) {
  const proc=spawn(process.execPath,['server/server.mjs'],{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let logs='';proc.stderr.on('data',b=>logs+=String(b));
  return {proc,getLogs:()=>logs};
}
function delay(t){return new Promise(r=>setTimeout(r,t));}
async function serverReady(proc,port){
  for(let i=0;i<40;i++){
    if(proc.exitCode!==null)throw Error('server exited '+proc.exitCode);
    try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return r.json()}
    catch{}
    await delay(70);
  }
  throw Error('server did not start');
}
const TOKEN='ntn_'+('a'.repeat(48));
const PASS='a-strong-private-password-123';
const SECRET='b'.repeat(64);
let port=12900;
test('safe boot: placeholder environment does not enable integration login',async(t)=>{
  const PORT=++port;const {proc}=runServer({PORT:String(PORT),NODE_ENV:'development',APP_PASSWORD:'replace-with-a-password',NOTION_API_TOKEN:'replace-with-notion-token'});
  t.after(()=>proc.kill());
  const x=await serverReady(proc,PORT);assert.equal(x.loginConfigured,false);assert.equal(x.syncConfigured,false);
  const r=await fetch(`http://127.0.0.1:${PORT}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'replace-with-a-password'})});
  assert.equal(r.status,503);
});
test('safe boot: production rejects unset secrets',async()=>{
  const p=spawn(process.execPath,['server/server.mjs'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',APP_PASSWORD:'replace-with-password',AUTH_SECRET:'replace-with-secret',NOTION_API_TOKEN:''}});
  const [status]=await once(p,'exit');assert.notEqual(status,0);
});
test('login, csrf restrictions, signed cookie and private verification endpoint',async(t)=>{
  const PORT=++port;const {proc}=runServer({PORT:String(PORT),NODE_ENV:'development',APP_PASSWORD:PASS,AUTH_SECRET:SECRET,NOTION_API_TOKEN:''});
  t.after(()=>proc.kill());await serverReady(proc,PORT);
  const base=`http://127.0.0.1:${PORT}`;
  let x=await fetch(base+'/api/verify');assert.equal(x.status,401);
  x=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example','Sec-Fetch-Site':'cross-site'},body:JSON.stringify({password:PASS})});assert.equal(x.status,403);
  x=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:PASS})});assert.equal(x.status,200);
  const cookie=x.headers.get('set-cookie')?.split(';')[0];assert.match(cookie,/^resetlab_session=/);
  x=await fetch(base+'/api/verify',{headers:{Cookie:cookie}});assert.equal(x.status,503);
  x=await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(x.status,200);
  x=await fetch(base+'/api/status',{headers:{Cookie:cookie}});assert.equal(x.status,401);
});
test('notion verify checks only allowed data sources and makes no writes',async()=>{
  const seen=[];
  const api=createNotionClient({token:TOKEN,fetchImpl:async(url,opts)=>{seen.push({url,method:opts.method});return {ok:true,json:async()=>({properties:{a:{},b:{}}})};}});
  const out=await api.verifyAccess();
  assert.equal(out.allAccessible,true);
  assert.equal(out.writeTestPerformed,false);
  assert.equal(seen.length,4);
  assert.ok(seen.every(c=>c.method==='GET'&&c.url.includes('/data_sources/')));
  assert.ok(seen.every(c=>Object.values(SOURCES).some(id=>c.url.endsWith('/'+id))));
});
