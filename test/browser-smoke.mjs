// Browser smoke test for PR CI. No Notion credentials or live writes are used.
// Run after a local server starts on PORT=8787 and Playwright Chromium is installed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.RESET_LAB_BASE_URL || 'http://127.0.0.1:8787';
const BEFORE = process.env.RESET_LAB_BEFORE_URL || '';
const KEY = 'reset_lab_3_prototype_v1';

async function untilHealthy(base) {
  for(let i=0;i<60;i++){
    try{const r=await fetch(base+'/api/health');if(r.ok)return;}
    catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('Local preview not ready: '+base);
}

await fs.mkdir('artifacts', {recursive:true});
await untilHealthy(BASE);
if(BEFORE) await untilHealthy(BEFORE);

const browser=await chromium.launch({headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.locator('#home.active').waitFor();
  assert.equal(await page.locator('.nav-btn').count(),6);
  assert.ok(await page.locator('#homeClock').isVisible());
  await page.screenshot({path:'artifacts/after-desktop.png',fullPage:true});

  await page.locator('[data-tab="time"]').click();
  await page.locator('#time.active').waitFor();
  await page.locator('#lifeCategory').selectOption({label:'공부·수업'});
  assert.ok(await page.locator('#studyOptions').isVisible());
  await page.locator('#studySubject').selectOption({label:'수학'});
  await page.locator('#studyType').selectOption({label:'일반 자습'});
  await page.locator('#startLife').click();
  await page.locator('#timeActiveList').getByRole('button',{name:/PAUSE/}).waitFor();
  await page.waitForTimeout(1200);

  await page.locator('#timeActiveList').getByRole('button',{name:/PAUSE/}).click();
  assert.match(await page.locator('#timeActiveList').innerText(),/PAUSED/);
  await page.waitForTimeout(350);
  await page.locator('#timeActiveList').getByRole('button',{name:/RESUME/}).click();
  await page.waitForTimeout(400);
  await page.locator('#timeActiveList').getByRole('button',{name:/STOP/}).click();

  const session=await page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions[0],KEY);
  assert.ok(session.start <= session.end);
  assert.equal(session.status,'done');
  assert.ok(session.intervals.length>=2,'pause/resume intervals preserved');
  const intervalMs=session.intervals.reduce((n,x)=>n+x.end-x.start,0);
  assert.ok(intervalMs>1000,'measured time persisted');
  assert.ok(intervalMs<=session.end-session.start,'elapsed time does not exceed wall time');
  assert.equal(await page.locator('#timeActiveList .session').count(),0);

  await page.locator('[data-tab="planner"]').click();
  await page.locator('#taskTitle').fill('디자인 PR 테스트 과제');
  await page.locator('#taskSubject').selectOption({label:'수학'});
  await page.locator('#addTask').click();
  assert.match(await page.locator('#taskList').innerText(),/디자인 PR 테스트 과제/);
  await page.locator('#taskList input[type=checkbox]').first().check();
  let stored=await page.evaluate(key => JSON.parse(localStorage.getItem(key)),KEY);
  assert.equal(stored.tasks.length,1);
  assert.equal(stored.tasks[0].done,true);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-tab="planner"]').click();
  assert.match(await page.locator('#taskList').innerText(),/디자인 PR 테스트 과제/);
  assert.equal(await page.locator('#taskList input[type=checkbox]').first().isChecked(),true);

  await page.locator('[data-tab="analytics"]').click();
  assert.match(await page.locator('#subjectBars').innerText(),/수학/);
  await page.locator('[data-tab="system"]').click();
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportJson').click()
  ]);
  assert.equal(download.suggestedFilename(),'reset_lab_3_backup.json');
  const backupPath=await download.path();
  assert.ok(backupPath);
  const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));
  assert.equal(backup.sessions.length,1);
  assert.equal(backup.tasks.length,1);

  // Simulate a new empty task state and restore exclusively from local JSON.
  await page.evaluate(key=>{
    const db=JSON.parse(localStorage.getItem(key));db.tasks=[];
    localStorage.setItem(key,JSON.stringify(db));
  },KEY);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-tab="system"]').click();
  page.on('dialog', d=>d.accept());
  await page.locator('#importJson').setInputFiles(backupPath);
  await page.waitForFunction(key=>(JSON.parse(localStorage.getItem(key)||'{}').tasks||[]).length===1,KEY);
  stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  assert.equal(stored.tasks[0].title,'디자인 PR 테스트 과제');

  // Mobile and accessible focus smoke on a fresh session.
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(BASE,{waitUntil:'domcontentloaded'});
  assert.ok(await mobile.locator('#home.active').isVisible());
  const navFont=await mobile.locator('.nav-btn').first().evaluate(el=>getComputedStyle(el).fontSize);
  assert.notEqual(navFont,'0px','mobile navigation labels must stay visible');
  await mobile.screenshot({path:'artifacts/after-mobile.png',fullPage:true});
  await mobile.locator('[data-tab="time"]').click();
  assert.ok(await mobile.locator('#time.active').isVisible());
  await mobile.waitForTimeout(220); // Let CSS focus/selection transitions settle before capture.
  await mobile.screenshot({path:'artifacts/after-mobile-time.png',fullPage:true});

  const keyboard=await browser.newPage();
  await keyboard.goto(BASE,{waitUntil:'domcontentloaded'});
  await keyboard.keyboard.press('Tab');
  assert.equal(await keyboard.evaluate(()=>document.activeElement?.getAttribute('data-tab')),'home');
  assert.ok(await keyboard.locator('.nav-btn.selected').isVisible());

  if(BEFORE){
    const oldDesktop=await browser.newPage({viewport:{width:1440,height:900}});
    await oldDesktop.goto(BEFORE,{waitUntil:'domcontentloaded'});
    await oldDesktop.screenshot({path:'artifacts/before-desktop.png',fullPage:true});
    const oldMobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await oldMobile.goto(BEFORE,{waitUntil:'domcontentloaded'});
    await oldMobile.screenshot({path:'artifacts/before-mobile.png',fullPage:true});
  }

  assert.deepEqual(errors,[],'browser page errors');
  console.log('Browser smoke passed: timer, pause/resume, time persistence, planner, charts, JSON backup/restore, mobile navigation, keyboard focus.');
} finally {
  await browser.close();
}
