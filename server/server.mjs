// RESET LAB 3.0: one-user, offline-first Notion sync gateway.
// All Notion secrets stay on the server. No third-party browser cookies required.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes, createHmac, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createNotionClient} from './notion.mjs';
import {syncBatch} from './sync.mjs';

const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === 'production';
const PASS = process.env.APP_PASSWORD || '';
const TOKEN = process.env.NOTION_API_TOKEN || '';
const SECRET = process.env.AUTH_SECRET || '';
const placeholder = s => !s || /replace[_-]|changeme|your[_-]own|sample|example|placeholder/i.test(s);
const passReady = !placeholder(PASS) && PASS.length >= 14;
const secretReady = !placeholder(SECRET) && SECRET.length >= 32;
const tokenReady = !placeholder(TOKEN) && TOKEN.length >= 24;

if (IS_PROD && (!passReady || !secretReady)) {
  // Report validity flags only: never print the environment variable values.
  throw new Error(`PRODUCTION SECURITY: invalid settings: ${!passReady ? 'APP_PASSWORD ' : ''}${!secretReady ? 'AUTH_SECRET' : ''}. Require APP_PASSWORD 14+ characters and AUTH_SECRET 32+ characters.`);
}
const secretKey = secretReady ? SECRET : randomBytes(32).toString('hex');
const notion = tokenReady ? createNotionClient({token:TOKEN}) : null;
if (!tokenReady) console.warn('Notion sync disabled until a real NOTION_API_TOKEN is configured.');
if (!passReady) console.warn('Server login disabled until a strong APP_PASSWORD is configured.');
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const sessions = new Map();
const failures = new Map();

function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}
const sign = id => createHmac('sha256', secretKey).update(id).digest('hex');
const cookieValue = id => `${id}.${sign(id)}`;
const sessionCookie = (v, age=604800) => `resetlab_session=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${IS_PROD ? '; Secure' : ''}`;
function getSessionId(req) {
  const token = (req.headers.cookie || '').match(/(?:^|;\s*)resetlab_session=([^;]+)/)?.[1];
  if (!token) return null;
  const [id, mac] = token.split('.');
  if (!id || !mac || !/^[a-f\d]{48}$/.test(id) || !/^[a-f\d]{64}$/.test(mac)) return null;
  const good = Buffer.from(sign(id), 'hex');
  if (!timingSafeEqual(good, Buffer.from(mac, 'hex'))) return null;
  const expires = sessions.get(id);
  if (!expires || expires < Date.now()) {sessions.delete(id);return null;}
  return id;
}
function sameOrigin(req) {
  const fetchSite=req.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') return false;
  if (fetchSite && !['same-origin','none','same-site'].includes(fetchSite)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // CLI and other non-browser clients still require login.
  try {
    const originURL = new URL(origin);
    const hostname = req.headers.host;
    const forwardedHost = req.headers['x-forwarded-host'];
    return originURL.host === hostname || (forwardedHost && originURL.host === forwardedHost);
  } catch {return false;}
}
async function readJSON(req) {
  const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/json')throw Object.assign(new Error('Content-Type must be application/json'),{status:415});
  let size=0,chunks=[];
  for await(const buf of req) {
    size+=buf.length;
    if(size>512_000)throw Object.assign(new Error('Request too large'),{status:413});
    chunks.push(buf);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
  catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}
}
async function serve(req,res,pathName){
  const names={'/':'index.html','/index.html':'index.html','/sync.js':'sync.js'};
  const name=names[pathName];
  if(!name)return json(res,404,{error:'Not found'});
  const data=await fs.readFile(path.join(publicDir,name));
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
  res.end(data);
}

const app=http.createServer(async(req,res)=>{
  headers(res);
  const uri=new URL(req.url||'/', 'http://localhost');
  try {
    if(req.method === 'POST' && !sameOrigin(req))return json(res,403,{error:'Cross-origin request blocked'});
    if(uri.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'phase3',loginConfigured:passReady,syncConfigured:!!(notion&&passReady)});
    if(uri.pathname==='/api/login'&&req.method==='POST'){
      if(!passReady)return json(res,503,{error:'서버 APP_PASSWORD가 아직 설정되지 않았어'});
      const remote=req.socket.remoteAddress||'unknown';
      const rate=failures.get(remote)||{attempts:0,until:0};
      if(rate.until>Date.now())return json(res,429,{error:'로그인 시도가 많아. 잠시 후 다시 시도해줘'});
      const data=await readJSON(req), input=String(data.password||'');
      const allowed=input.length===PASS.length&&timingSafeEqual(Buffer.from(input),Buffer.from(PASS));
      if(!allowed){rate.attempts++;if(rate.attempts>=5){rate.until=Date.now()+60_000;rate.attempts=0}failures.set(remote,rate);return json(res,401,{error:'서버 비밀번호 확인 필요'});}
      failures.delete(remote);
      const id=randomBytes(24).toString('hex');sessions.set(id,Date.now()+604800000);
      res.setHeader('Set-Cookie',sessionCookie(cookieValue(id)));
      return json(res,200,{ok:true,ready:!!notion});
    }
    if(uri.pathname.startsWith('/api/')){
      const id=getSessionId(req);
      if(!id)return json(res,401,{error:'서버 로그인이 필요해'});
      if(uri.pathname==='/api/status'&&req.method==='GET')return json(res,200,{authenticated:true,ready:!!notion});
      if(uri.pathname==='/api/logout'&&req.method==='POST'){
        sessions.delete(id);
        res.setHeader('Set-Cookie',sessionCookie('',0));
        return json(res,200,{ok:true});
      }
      if(uri.pathname==='/api/verify'&&req.method==='GET'){
        if(!notion)return json(res,503,{error:'NOTION_API_TOKEN이 연결되지 않았어'});
        const diagnostics=await notion.verifyAccess();
        return json(res,200,{ok:true,...diagnostics});
      }
      if(uri.pathname==='/api/sync'&&req.method==='POST'){
        if(!notion)return json(res,503,{error:'NOTION_API_TOKEN이 연결되지 않았어'});
        const body=await readJSON(req);
        return json(res,200,await syncBatch(notion,body));
      }
      return json(res,404,{error:'Unknown route'});
    }
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
    return serve(req,res,uri.pathname);
  } catch(e) {
    if(e.status)return json(res,e.status,{error:e.message});
    console.error('[RESET LAB]', String(e.message||e).slice(0,220));
    return json(res,500,{error:'서버 오류: 로그와 Notion 설정을 확인해줘'});
  }
});

if(!process.env.RESET_LAB_NO_LISTEN)app.listen(PORT,'0.0.0.0',()=>console.log(`RESET LAB 3.0 Phase 3 listening on port ${PORT}`));
export {app};
