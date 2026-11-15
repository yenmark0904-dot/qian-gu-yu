// Local fixture only: real store hydration and atomic one-time reward, no user storage.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.window={localStorage:globalThis.localStorage};
const server=await createServer({configFile:false,resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
const {useSave}=await server.ssrLoadModule('/src/game/store.ts');
const old={ink:4321,pity:17,owned:{qin:1,machao:1,liuche:1},history:['qin'],totalPulls:22,m3:{1:{stars:2,best:1200}},sgBest:4,sgTotal:2000,mainStoryRead:[1],companionId:'qin',companionGuideDone:true,letters:{},assist:'qin'};
for(const version of [0,3,4]){memory.set('qiangu-yu',JSON.stringify({state:old,version}));await useSave.persist.rehydrate();const s=useSave.getState();assert.equal(s.ink,4321);assert.deepEqual(s.raid,{team:[],records:{}});assert.equal(s.companionId,'qin');assert.equal(s.assist,'qin');assert.deepEqual(s.m3,old.m3);assert.equal(s.sgBest,4);}
const snapshot=()=>{const s=useSave.getState();return JSON.stringify({m3:s.m3,sgBest:s.sgBest,sgTotal:s.sgTotal,owned:s.owned,pity:s.pity,mainStoryRead:s.mainStoryRead,companionId:s.companionId,letters:s.letters,assist:s.assist});};
const before=snapshot();
useSave.getState().setRaidTeam(['qin','qin','missing','liuche','machao']);
assert.deepEqual(useSave.getState().raid.team,['qin','liuche','machao']);
// 鎮厄司 locked before 第 10 關: no drop, nothing recorded.
assert.equal(useSave.getState().winRaid('ink-shadow'),null);
useSave.setState({m3:{...useSave.getState().m3,10:{stars:1,best:1}}});
const before2=JSON.stringify({owned:useSave.getState().owned,pity:useSave.getState().pity});
const w1=useSave.getState().winRaid('ink-shadow');
assert.deepEqual(w1,{drops:{jingmosha:32},first:true,ink:300});
assert.equal(useSave.getState().ink,4621);
assert.equal(useSave.getState().artifacts.materials.jingmosha,32);
const w2=useSave.getState().winRaid('ink-shadow');
assert.deepEqual(w2,{drops:{jingmosha:12},first:false,ink:0});
assert.equal(useSave.getState().ink,4621);
assert.equal(useSave.getState().artifacts.materials.jingmosha,44);
assert.equal(useSave.getState().winRaid('elite-ink-colossus'),null); // 第 20 關 not cleared
await useSave.persist.rehydrate();
assert.equal(useSave.getState().winRaid('ink-shadow').first,false);
assert.equal(useSave.getState().raid.records['ink-shadow'].clears,3);
assert.equal(JSON.stringify({owned:useSave.getState().owned,pity:useSave.getState().pity}),before2);
useSave.setState({m3:Object.fromEntries(Object.entries(useSave.getState().m3).filter(([k])=>k!=='10'))});
assert.equal(snapshot(),before);
const {sanitizeSnapshot,SNAPSHOT_KEYS}=await server.ssrLoadModule('/src/game/cloud-save.ts');
const cloud=sanitizeSnapshot(useSave.getState());assert.ok(cloud.ok);assert.ok(SNAPSHOT_KEYS.includes('raid'));
assert.deepEqual(cloud.data.raid,useSave.getState().raid);assert.equal(cloud.data.companionId,'qin');
console.log('PASS: old v0/v3/v4 saves, owned team validation, 鎮厄司 gated drops (materials; legacy 300 墨玉 once), replay/reload idempotence, cloud round-trip, map/tower/companion/letters/assist preserved');
} finally {await server.close();}
