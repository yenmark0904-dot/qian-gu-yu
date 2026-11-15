// Local isolated fixture; no signed-in browser, uploads, or production changes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage();
await context.route('**/*', route => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url()) ? route.continue() : route.abort());
await context.addInitScript(()=>{
 if(!localStorage.getItem('qiangu-yu')) localStorage.setItem('qiangu-yu',JSON.stringify({version:5,state:{ink:8123,owned:{qin:31,sima:31,tao:31},totalPulls:93,muted:true,lastDaily:new Date().toLocaleDateString('en-CA'),mainStoryPrologueRead:true,coachSeen:99,companionGuideDone:true,mainStoryRead:[1],artifacts:{},m3:{}}}));
 localStorage.setItem('qgy-survey-v1',JSON.stringify({invited:true,dismissed:true}));
});
const errors=[];const missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404&&/portraits|sprites|prologue|hall-bg/.test(r.url()))missing.push(r.url())});
const vn=()=>page.getByTestId('bond-story-vn');
const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qiangu-yu')));
async function goCodex(){await page.getByRole('button',{name:/^圖鑑 \d+$/}).click();}
async function character(name){await page.getByText(name,{exact:true}).first().click();await page.getByTestId('codex-chapters').waitFor();}
async function openChapter(i){await page.getByTestId('codex-chapters').locator('button.chapter-row').nth(i).click();}
async function advance(){await vn().press('Enter');await page.waitForTimeout(25);}
async function toDialogue(){for(let i=0;i<15;i++){if(await vn().locator('.prologue-vn-speaker').count())return;await advance()}throw Error('no dialogue');}
async function finish(){for(let i=0;i<120;i++){const btn=vn().getByTestId('main-story-close');if(await btn.count()){await btn.click();return;}const choices=vn().locator('.prologue-vn-choices button');if(await choices.count())await choices.first().click();else await advance();}throw Error('did not finish');}
async function shot(path){await page.waitForFunction(()=>[...document.querySelectorAll('.prologue-vn img')].every(i=>i.complete&&i.naturalWidth>0));await page.waitForTimeout(180);await page.screenshot({path:`screenshots/${path}`});assert.ok(await vn().evaluate(el=>{const r=el.getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight}));}
try{
 await page.goto('http://127.0.0.1:5185/');await page.waitForTimeout(1400);
 const later=page.getByRole('button',{name:'稍後',exact:true});if(await later.count())await later.click();
 await goCodex();await character('秦始皇');await openChapter(0);
 await page.getByRole('button',{name:'我已年滿 18 歲',exact:true}).waitFor();
 assert.equal(await vn().count(),0,'VN must not render behind the adult gate');
 assert.equal(await page.getByText('巨燭燒到一半，案上的竹簡還未收起。我抱著修補過的符紙進殿，嬴政卻沒有先看符。',{exact:true}).count(),0);
 await page.getByRole('button',{name:'返回',exact:true}).click();assert.equal(await vn().count(),0);
 await openChapter(0);await page.getByRole('button',{name:'我已年滿 18 歲',exact:true}).click();await vn().waitFor();
 await toDialogue();assert.match(await vn().locator('img').getAttribute('src'),/^\/cg\/prologue\/qin.png$/);await shot('bond-vn-qin-1.png');
 // Current bond source is linear; branching choices are covered on main story, not invented here.
 assert.equal(await vn().getByTestId('story-skip').isEnabled(),true);
 const speedStart=Number(await vn().getAttribute('data-beat'));await vn().getByTestId('story-fast').click();await page.waitForTimeout(750);await vn().getByTestId('story-fast').click();assert.ok(Number(await vn().getAttribute('data-beat'))>speedStart);await advance();
 const cursor=Number(await vn().getAttribute('data-beat'));
 await vn().press('Escape');assert.equal(await vn().count(),0);assert.equal(await page.getByTestId('codex-chapters').count(),1,'Esc closes VN, not character sheet');
 await openChapter(0);assert.equal(Number(await vn().getAttribute('data-beat')),cursor);assert.equal(await vn().getAttribute('data-branch'),'');
 await page.reload();await page.waitForTimeout(900);await goCodex();await character('秦始皇');await openChapter(0);assert.equal(Number(await vn().getAttribute('data-beat')),cursor,'reload preserves cursor');await finish();
 const qin=(await save()).state.bondStoryPlay['qin:0'];assert.equal(qin.done,true);assert.equal(qin.choice,undefined);
 await openChapter(3);await finish();await page.getByTestId('codex-cg-full').waitFor();assert.equal(await page.getByTestId('codex-cg-full').getAttribute('src'),'/cg/qin.jpg');await page.getByRole('dialog',{name:'秦始皇 專屬 CG',exact:true}).click();
 await page.locator('.codex-close').click();await character('司馬相如');await openChapter(0);await toDialogue();await shot('bond-vn-ss.png');await vn().press('Escape');await openChapter(2);await finish();await page.getByRole('dialog',{name:'CG 準備中',exact:true}).waitFor();assert.equal(await page.getByTestId('codex-cg-full').count(),0);await page.getByRole('button',{name:'返回章節',exact:true}).click();
 await page.locator('.codex-close').click();await character('陶淵明');await openChapter(0);await toDialogue();await shot('bond-vn-r.png');await finish();
 const stored=await save();assert.equal(stored.version,5);assert.equal(stored.state.ink,8123);assert.deepEqual(stored.state.owned,{qin:31,sima:31,tao:31});assert.equal(stored.state.bondStoryPlay['tao:1'].done,true);
 // First-meeting and low-rank saves never reveal a locked CG.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('qiangu-yu'));s.state.owned.qin=1;localStorage.setItem('qiangu-yu',JSON.stringify(s));});await page.reload();await page.waitForTimeout(900);await goCodex();await character('秦始皇');assert.equal(await page.getByTestId('codex-chapters').locator('[data-state="locked"]').count(),3);await openChapter(0);await finish();assert.equal(await page.getByTestId('codex-cg-full').count(),0);
 // Main-story callers still use their original parser/stage and remain playable.
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('qiangu-yu'));s.state.m3=Object.fromEntries(Array.from({length:250},(_,i)=>[String(i+1),{stars:3,best:3000}]));for(const k of ['mainStoryRead','mainStoryHanRead','mainStoryWuRead','mainStoryQiRead','mainStoryTangRead'])s.state[k]=Array.from({length:10},(_,i)=>i+1);s.state.volumeAwards=Array.from({length:50},(_,i)=>i+1);localStorage.setItem('qiangu-yu',JSON.stringify(s));});
 await page.reload();await page.waitForTimeout(900);await page.getByTestId('home-match').click();if(await page.getByTestId('main-story').count())await page.getByTestId('main-story').press('Escape');await page.getByTestId('main-story-chapter-tabs').waitFor();
 for(const chapter of [1,3,4,5]){
   await page.getByTestId(`main-story-tab-${chapter}`).click();await page.getByTestId(`main-story-btn-${chapter===1?'':chapter===3?'wu-':chapter===4?'qi-':'tang-'}1`).click();
   const stage=page.getByTestId(chapter===1?'main-story':chapter===3?'main-story-wu':chapter===4?'main-story-qi':'main-story-tang');await stage.waitFor();
   for(let step=0;step<250;step++){
     const choices=stage.locator('.prologue-vn-choices button');
     if(await choices.count()){await choices.first().click();break;}
     if(chapter===1 && await stage.locator('.prologue-vn-speaker').count())await page.screenshot({path:'screenshots/bond-vn-main-comparison.png'});
     await stage.press('Enter');await page.waitForTimeout(15);
   }
   await stage.press('Escape');assert.equal(await stage.count(),0);
 }
 // Existing card entrance stays intact; its reading CTA now opens the same VN.
 await page.reload();await page.waitForTimeout(900);await goCodex();await character('秦始皇');
 await page.getByRole('button',{name:'看天命演出',exact:true}).click();await page.getByRole('dialog',{name:'秦始皇登場',exact:true}).waitFor();
 await page.getByRole('button',{name:'閱讀天命書',exact:true}).click();await vn().waitFor();assert.equal(await vn().getAttribute('data-bond-key'),'qin:0');await vn().press('Escape');assert.equal(await page.getByRole('dialog',{name:'秦始皇登場',exact:true}).count(),1);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 await writeFile('screenshots/bond-vn-ui-results.json',JSON.stringify({viewport:{width:390,height:844},adultGate:true,resumeAfterEscAndReload:true,bondSpeed:true,ssrLastChapterCg:true,ssPreparationOnly:true,lockedCgProtected:true,mainStoryQinWuQiTang:true,summonReplayVn:true,persistVersion:5,unrelatedSavePreserved:true,errors,missing},null,2));
 console.log('PASS: mobile screenshots, gate, speed, resume, CG flow, main story choices, v5 save preservation');
}finally{await browser.close();}
