import { makeRng, allMoves } from '../src/game/match3.ts';
import { startRaid, raidSwap, raidSkill, RAID_BOSSES } from '../src/game/raid.ts';
const boss=RAID_BOSSES[0];
const teams=[['machao'],['libai'],['qin'],['machao','baijuyi'],['qin','libai','machao'],['sima','zhouyu','qin']];
const results=[];
for(const team of teams){let wins=0,total=0,moves=0;
for(let seed=1;seed<=100;seed++) {const rng=makeRng(seed); const owned=Object.fromEntries(team.map(id=>[id,1])); let s=startRaid(boss,team,owned,rng),action=0;
while(s.status==='play'&&action++<200){const f=s.fighters.find(f=>f.energy>=f.cost);if(f)s=raidSkill(s,f.id,boss,action*500,rng).state;else{const m=allMoves(s.board);const [a,b]=m[Math.floor(rng()*m.length)];s=raidSwap(s,a,b,boss,rng).state;}}
wins+=s.status==='won'?1:0;total+=s.damage;moves+=s.turns;
}results.push({team,winsOf100:wins,meanDamage:Math.round(total/100),meanTurns:moves/100});}
console.log(JSON.stringify(results,null,2));
