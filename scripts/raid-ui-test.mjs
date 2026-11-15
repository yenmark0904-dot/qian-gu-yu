// Isolated headless test fixture; never connects to a user's/desktop browser session.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { allMoves, boardFrom } from '../src/game/match3.ts';
const browser = await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const reports=[];
await mkdir('screenshots',{recursive:true});
try {
for (const viewport of [{width:390,height:844},{width:375,height:667},{width:1280,height:900}]) {
 const context=await browser.newContext({viewport,reducedMotion:'reduce'});
 const errors=[]; const page=await context.newPage();
 if(viewport.width===375) await context.route('**/portraits/*.jpg*',r=>r.fulfill({status:404,body:'missing art fixture'})); page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{
  const today=new Date().toLocaleDateString('en-CA');
  localStorage.setItem('qiangu-yu',JSON.stringify({version:4,state:{ink:8000,owned:{qin:1,zhouyu:1,sima:1,machao:1},totalPulls:4,muted:true,lastDaily:today,mainStoryPrologueRead:true,mainStoryRead:[1,2,3,4,5],mainStoryHanRead:[1,2,3,4,5,6,7,8,9,10],mainStoryWuRead:[1,2,3,4,5,6,7,8,9,10],mainStoryQiRead:[1,2,3,4,5,6,7,8,9,10],mainStoryTangRead:[1,2,3,4,5,6,7,8,9,10],raid:{team:['qin','zhouyu','sima'],records:{}}}}));
  localStorage.setItem('qgy-survey-v1',JSON.stringify({invited:true,dismissed:true}));
 });
 await page.goto(process.env.RAID_TEST_URL || 'http://127.0.0.1:8080/');
 await page.waitForTimeout(1500);
 await page.getByTestId('home-match').click();
 await page.waitForTimeout(700);
 await page.screenshot({path:'screenshots/raid-map-debug.png'});

 await page.getByTestId('raid-entry').click();
 await page.getByTestId('raid-lobby').waitFor();
 assert.equal(await page.getByTestId('raid-team').locator('button').count(),3);
 if(viewport.width===375){await page.waitForTimeout(150);assert.equal(await page.locator('.raid-team img').count(),0);assert.equal(await page.locator('.raid-team .raid-face').count(),3);}
 // Test team editing through the lobby, including one/two fighter launches.
 if(viewport.width===390){
  await page.getByTestId('raid-team').locator('button').nth(2).click();
  // 統一三人戰隊: a 2-person 編隊 is topped up to three by 自動配對 at the start (no 1/2-person fights).
  await page.getByTestId('raid-start').click();assert.equal(await page.locator('.raid-assists>div').count(),3);
  await page.getByRole('button',{name:'撤回',exact:true}).click();
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('qiangu-yu')).state.raid.team)).length,3);
  // 自動配對 button: always three
  await page.getByTestId('raid-team').locator('button').nth(1).click();
  await page.getByTestId('raid-auto').click();
  await page.waitForTimeout(150);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('qiangu-yu')).state.raid.team)).length,3);
  assert.equal(await page.locator('.raid-team .raid-face').count(),3);
 }
 await page.getByTestId('raid-start').click();
 await page.getByTestId('raid-board').waitFor();
 const layout=await page.evaluate(()=>{
  const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  return {board:box('.raid-board'),cell:box('.raid-cell'),assist:box('.raid-assists'),info:box('.raid-combat-info'),options:box('.raid-options'),w:innerWidth,h:innerHeight,doc:document.documentElement.scrollWidth};
 });
 assert.ok(layout.cell.width>=43,JSON.stringify(layout));
 assert.ok(layout.cell.height>=44,JSON.stringify(layout));
 assert.ok(layout.info.bottom <= viewport.height,JSON.stringify(layout));
 assert.ok(layout.options.bottom <= viewport.height,JSON.stringify(layout));
 assert.ok(layout.doc<=viewport.width,JSON.stringify(layout));
 await page.waitForFunction(()=>[...document.querySelectorAll('.raid-battle img')].every(i=>i.complete));
 await page.screenshot({path:`screenshots/raid-${viewport.width}x${viewport.height}.png`});
 await page.getByText('略過技能',{exact:true}).click();
 let turns=0,skills=0;
 while(await page.getByTestId('raid-result').count()===0 && turns<45) {
   await page.waitForFunction(()=>document.querySelector('[data-testid="raid-board"]')?.getAttribute('data-busy')==='0');
   const ready=page.locator('.raid-assists button[data-full="1"]:not(:disabled)');
   if(await ready.count()){await ready.first().click();skills++; await page.waitForTimeout(100);continue;}
   const cells=await page.locator('.raid-cell').evaluateAll(list=>list.map(e=>({kind:Number(e.dataset.kind),special:e.dataset.special,seal:Number(e.dataset.seal)})));
   const rows=Array.from({length:8},(_,r)=>cells.slice(r*7,(r+1)*7).map(p=>String(Math.max(0,p.kind))).join(''));
   const specials=cells.flatMap((p,i)=>p.special?[[Math.floor(i/7),i%7,p.special]]:[]);
   const seals=Array.from({length:8},(_,r)=>cells.slice(r*7,(r+1)*7).map(p=>p.seal));
   const board=boardFrom(rows,specials,seals);const moves=allMoves(board); assert.ok(moves.length,'no softlock');
   // Choose a move producing the highest immediate engine score for a strategic rather than random player.
   const {trySwap,makeRng}=await import('../src/game/match3.ts');
   const [a,b]=moves.map(m=>({m,score:trySwap(board,...m,makeRng(777)).score||0})).sort((a,b)=>b.score-a.score)[0].m;
   const first=page.locator('.raid-cell').nth(a.r*7+a.c),second=page.locator('.raid-cell').nth(b.r*7+b.c);
   await first.press('Enter');await second.press('Enter');turns++;await page.waitForTimeout(100);
 }
 await page.getByTestId('raid-result').waitFor({timeout:10000});
 const won=await page.getByTestId('raid-result').getAttribute('data-won');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('qiangu-yu')).state);
 if(won==='1'){assert.equal(stored.ink,8300);assert.equal(stored.raid.records['ink-shadow'].rewardClaimed,true);assert.deepEqual(stored.m3,{});}
 assert.equal(await page.locator('.raid-assists .m3-skill-face').count(),3);
 await page.screenshot({path:`screenshots/raid-result-${viewport.width}.png`});
 await page.getByRole('button',{name:'免費再戰',exact:true}).click();
 assert.ok((await page.locator('.raid-combat-info').innerText()).includes('剩餘 20 步'));
 assert.equal(await page.locator('.raid-assists button[data-full="1"]').count(),0);
 assert.deepEqual(errors,[]);
 reports.push({viewport,layout,turns,skills,won,errors});
 await context.close();
}
} finally {await browser.close();}
await writeFile('raid-ui-results.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
