import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../public/sync.js', import.meta.url), 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
const premium = html.split('RESET LAB 3.0 — Phase A Premium Monochrome Layer')[1] || '';
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);

test('premium page preserves the expected app DOM contract', () => {
  const required = [
    'home', 'time', 'analytics', 'wellness', 'planner', 'system',
    'homeClock','homeActiveName','homeStudy','homeCount','homeTasksCount',
    'homeTimeline','homeLegend','homeTaskList','homeActiveList',
    'lifeCategory','lifeTag','studyOptions','studySubject','studyType','studyTask',
    'lifeName','lifeRole','startLife','timeActiveList','timeDate',
    'clockCanvas','dayCategoryBars','mainTimeline','timeLegend','timeHistory',
    'analysisDate','analysisStudy','analysisAcademy','analysisClass',
    'subjectBars','weeklyBars','monthlyBars','wellDate','wellSleep','wellNap',
    'wellMove','exerciseBars','dailyNote','saveNote','taskTitle','taskCategory',
    'taskSubject','taskDue','taskRepeat','taskChecklist','addTask','taskList',
    'deadlineList','syncPassword','loginPanel','loginButton','verifyButton',
    'syncButton','logoutButton','syncStatus','exportJson','exportCsv','importJson'
  ];
  for (const id of required) assert.ok(ids.includes(id), `missing UI contract: #${id}`);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  assert.equal((html.match(/class="nav-btn/g) || []).length, 6);
  assert.match(html, /class="grid dashboard-overview"/);
});

test('legacy application JavaScript remains syntactically valid and retains crucial functions', () => {
  assert.ok(appScript.length > 10000);
  assert.doesNotThrow(() => new vm.Script(appScript));
  for(const fn of ['start','stop','pause','resume','duration','intervals',
    'buildMinuteBuckets','drawTimeline','renderAnalytics','renderTasks',
    'importJSON','exportCSV','save','init']){
    assert.match(appScript, new RegExp('function\\s+' + fn + '\\s*\\('));
  }
  assert.match(appScript, /reset_lab_3_prototype_v1/);
  assert.match(appScript, /setInterval\(tick,500\)/);
  assert.match(sync, /window\.scheduleSync/);
});

test('design layer has stable numerals, accessible focus and motion preferences', () => {
  assert.ok(premium.length > 8000);
  assert.match(premium, /--sidebar-width:228px/);
  assert.match(premium, /--bg:#f5f5f3/);
  assert.match(premium, /tabular-nums/);
  assert.match(premium, /:focus-visible/);
  assert.match(premium, /prefers-reduced-motion:reduce/);
  assert.match(premium, /@media \(max-width:700px\)/);
  assert.match(premium, /font-size:9px;/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /서버 인증 및 읽기 권한 확인은 Notion 저장 성공을 보증하지 않습니다/);
});

test('design redesign requires no new browser-to-external sync or font request', () => {
  assert.doesNotMatch(premium, /@import|url\(https?:/i);
  assert.match(sync, /fetch\(path,/);
  assert.match(sync, /credentials:'same-origin'/);
});
