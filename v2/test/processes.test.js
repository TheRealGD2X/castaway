import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {biomassMass,growPlants,plantMass,moveFruit} from '../src/sim/biomass.js';
import {ecoDay,ecoTen} from '../src/sim/eco.js';
import {waterVolume,mineralMass,hydroTen} from '../src/sim/hydro.js';
import {thermalBalance,microclimateStep,climateParams,vapourDensity} from '../src/sim/microclimate.js';
import {newBatch,addBatch,takeBatches,heatFood,finishFood,foodMass,waterActivity,foodRate,moveFood} from '../src/sim/food.js';
import {carriedMass,loadFactor,workRate,effortMet} from '../src/sim/effort.js';
import {elevation,moveRelief,erosionMass,reroute} from '../src/sim/geomorph.js';
import {learnCost,estimateCost} from '../src/mind/experience.js';
import {FAMILIES,place,propsOf} from '../src/build/build.js';
import {ACTIONS} from '../src/mind/actions.js';
import {exposure} from '../src/mind/exposure.js';
import {T} from '../src/world/gen.js';
import {walk} from '../src/sim/man.js';
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const W=createWorld(SEED,BORN,{man:false});
const balanced=()=>biomassMass(W)+W.bio.respiredKg+W.bio.harvestedKg-W.bio.assimilatedKg;
const initial=balanced(),water=waterVolume(W)+W.hydro.evap;W.wx.temp=18;W.wx.sun=600;
for(let d=0;d<30;d++){for(let n=0;n<144;n++)ecoTen(W);ecoDay(W);near(balanced(),initial,1e-6);}
near(waterVolume(W)+W.hydro.evap,water,1e-7);assert(W.bio.assimilatedKg>0);assert(W.bio.respiredKg>0);assert(W.soilN.some(v=>v>0));
const plant=W.ents.find(e=>e.k==='bramble'),old=plantMass(plant);plant.reserveKg=0;const mass=plantMass(plant);moveFruit(W,plant,1);near(plantMass(plant),mass);assert(plant.fruit<=1);
const dark=createWorld(SEED,BORN,{man:false});dark.bio.solarJ=0;growPlants(dark);assert.equal(dark.bio.assimilatedKg,0);
dark.bio.solarJ=600*86400;dark.hydro.soil.fill(0);growPlants(dark);assert.equal(dark.bio.assimilatedKg,0);
dark.hydro.soil.fill(.22);dark.soilN.fill(0);growPlants(dark);assert.equal(dark.bio.assimilatedKg,0);
console.log('ok   dry biomass and transpired water conserve; light, water and finite nutrients independently limit growth');

const c={airT:23,wallT:8},p={airCapacity:6000,wallCapacity:50000,airWall:14,vent:4,wallOutside:6};
const result=thermalBalance(c,p,5,120,60),energy=p.airCapacity*(result.airT-c.airT)+p.wallCapacity*(result.wallT-c.wallT);
near(energy,result.exchanged,1e-8);
const isolated={...p,vent:0,wallOutside:0};let box={...c};for(let i=0;i<60;i++)box=thermalBalance(box,isolated,0,0);near(p.airCapacity*box.airT+p.wallCapacity*box.wallT,p.airCapacity*c.airT+p.wallCapacity*c.wallT,1e-7);
const steady=p.airWall===0?0:5+120/(p.vent+p.airWall*p.wallOutside/(p.airWall+p.wallOutside));let hot={airT:5,wallT:5};for(let i=0;i<2000;i++)hot=thermalBalance(hot,p,5,120);near(hot.airT,steady,1e-7);
const integrate=dt=>{let b={airT:5,wallT:5};for(let t=0;t<3600;t+=dt)b=thermalBalance(b,p,5,120,dt);return b.airT;};const reference=integrate(1);assert(Math.abs(integrate(30)-reference)<Math.abs(integrate(60)-reference));
near(vapourDensity(20,1),.01728,.0001);
const living=createWorld(SEED,BORN),M=living.man,stages=FAMILIES.roundhouse.make({cover:'reeds',bedMat:'bracken'}),home=place(living,{k:'roundhouse',x:M.x,y:M.y,dir:0,stages});home.stage=stages.length;home.props=propsOf(home);living.wx.temp=5;living.wx.hum=.95;living.wx.rain=3;
for(let i=0;i<120;i++)microclimateStep(living);const climate=home.climate;
near(climate.vapourKg+climate.condensateKg+climate.boundWaterKg-climate.moistureIn+climate.moistureOut,climate.initialWaterKg,1e-9);assert(climate.boundWaterKg>0);
living.wx.rain=0;living.wx.hum=.3;living.wx.temp=20;const wet=climate.boundWaterKg;for(let i=0;i<500;i++)microclimateStep(living);assert(climate.boundWaterKg<wet);
climate.condensateKg+=20;climate.moistureIn+=20;microclimateStep(living);assert(climate.drippedKg>0);assert(climate.condensateKg<=climateParams(home).surfaceArea*.02+1e-9);
near(climate.vapourKg+climate.condensateKg+climate.boundWaterKg-climate.moistureIn+climate.moistureOut,climate.initialWaterKg,1e-9);
console.log('ok   coupled heat matches energy and steady-state equations, converges with smaller steps, and rain/drying conserve shelter moisture');

M.inv={};M.foodBatches=[];M.foodTime=10;addBatch(M,400,2,'fish',true);M.foodTime=100;addBatch(M,400,.001,'fish',true);assert.equal(M.foodBatches.length,2);assert.notEqual(M.foodBatches[0].load,M.foodBatches[1].load);
const kcal=M.inv.raw,dry=M.foodBatches.reduce((v,b)=>v+b.dryKg,0);const early=takeBatches(M,100,true);near(early.kcal,100);near(early.load,200);near(M.inv.raw,kcal-100);
const store={props:{storageKg:.12},foodBatches:[]};finishFood(M);const held=M.foodBatches.reduce((v,b)=>v+foodMass(b),0);moveFood(M,store,700,true);assert(store.foodBatches.reduce((v,b)=>v+foodMass(b),0)<=.12+1e-9);near(M.inv.food+store.stock,700);moveFood(M,store,1000,false);near(M.foodBatches.reduce((v,b)=>v+foodMass(b),0),held);
const big=newBatch(M,1000,4,'fish',true),small=newBatch(M,100,4,'fish',true);M.foodBatches=[big,small];const total=M.foodBatches.reduce((v,b)=>v+foodMass(b),0);let done=false;for(let i=0;i<200;i++){done=heatFood(M,{heat:4000});if(i===0)assert(small.temp>big.temp);if(done)break;}assert(done);near(M.foodBatches.reduce((v,b)=>v+b.dryKg,0),.275);assert(big.load<4);const dose=big.dose;foodRate(big,5,.8,10);assert.equal(big.dose,dose);assert(big.temp<95);
let dried=false;for(let i=0;i<2000;i++){dried=heatFood(M,{heat:9000},true);if(dried)break;}assert(dried);assert(waterActivity(big)<.85);assert(M.foodEvaporatedKg>0);assert(M.foodBatches.reduce((v,b)=>v+foodMass(b),0)<total);
console.log('ok   food lots retain separate contamination, split/transfer without duplicating mass or calories, heat by mass, retain interrupted progress and dry by water loss');
const trout=newBatch(M,330,0,'fish',true),mussels=newBatch(M,300,0,'mussels',true);near(foodMass(trout),.25);near(foodMass(mussels),1);near(mussels.shellKg,2/3);
M.foodBatches=[mussels];const shellMass=foodMass(mussels);finishFood(M);near(foodMass(mussels)+(M.foodShellWasteKg||0),shellMass);
const portion=newBatch(M,400,1,'fish',true);M.foodBatches=[portion];const startT=portion.temp,startWater=portion.waterKg,capacity=portion.dryKg*1700+portion.waterKg*4180;
heatFood(M,{heat:5000});assert(capacity*(portion.temp-startT)+(startWater-portion.waterKg)*2.3e6<=5000*.08*60+1e-7);
console.log('ok   a 250-gram trout stays 250 grams, shellfish include discarded shells, and food cannot receive more heat than the allocated fire energy');

M.inv={poles:4,stones:3,cord:2};M.foodBatches=[];M.tools={};near(carriedMass(M),12.18);const light=loadFactor(M);M.inv.stones=15;assert(loadFactor(M)>light);const slower=workRate(living,M);M.inv={};assert(workRate(living,M)>slower);M.inv.stones=15;M.pose='walk';M.walkedM=50;M.climbedM=2;assert(effortMet(living,M,3.3)>3.3);
console.log('ok   every carried material contributes kilograms; heavier and awkward loads reduce speed/work and climbing adds metabolic effort');
const walking=createWorld(SEED,BORN),walker=walking.man,wa=Math.floor(walker.y)*walking.MW+Math.floor(walker.x),wb=wa+1;
walking.ter[wb]=T.GRASS;walking.relief[wb]=elevation(walking,wa)+1-elevation(walking,wb);walker.B.fatigue=0;walker.B.core=37;walker.inv={};walker.foodBatches=[];walker.path=[wa,wb];
let climbed=0,walked=0;for(let n=0;n<100&&walker.path;n++){walk(walking,walker,.005);climbed+=walker.climbedM;walked+=walker.walkedM;}
assert.equal(walker.path,null);near(climbed,1);near(walked,2);
console.log('ok   walking a slope in partial steps charges its distance and ascent exactly once');
M.carry=0;const beforeForecast=save(living);exposure(living,M,{x:M.x+1,y:M.y});assert.equal(save(living),beforeForecast);
console.log('ok   exposure forecasts read actual loads and indoor conditions without changing the world or body');

const earth=createWorld(SEED,BORN,{man:false}),i=earth.hydroMap.land.find(i=>earth.ter[i]===T.GRASS),height=elevation(earth,i),minerals=mineralMass(earth);
earth.hydro.solid[i]-=64;earth.hydro.silt[i]+=64;moveRelief(earth,i,-64);near(elevation(earth,i),height-.01);near(mineralMass(earth),minerals);
earth.wx={...earth.wx,temp:10,rain:0,sun:0,wind:0,hum:1};earth.surface.temp=10;earth.hydro.pool[i]=0;hydroTen(earth);near(mineralMass(earth),minerals,1e-5);assert(earth.relief[i]>-.01);assert.equal(erosionMass(.01,0,2,600),0);assert(erosionMass(.01,.1,2,600)>erosionMass(.01,.1,2,600,1));
const restored=load(save(earth));assert.equal(save(restored),save(earth));assert.deepEqual([...restored.hydroMap.down],[...earth.hydroMap.down]);
console.log('ok   soil mass lowers/raises actual terrain by density, roots resist erosion, settling conserves minerals and restored drainage is identical');

const learner={};assert.equal(estimateCost(learner,'weave',40),40);for(let i=0;i<10;i++)learnCost(learner,'weave',40,80);assert(estimateCost(learner,'weave',40)>60);assert.equal(learner.experience.weave.m2,0);learnCost(learner,'weave',40,20);assert(learner.experience.weave.m2>0);assert.equal(learner.experience.weave.last.error,-20);
console.log('ok   completed observations alter estimates with confidence; prediction error and variance survive as ordinary saved state');
const dog=living.animals.find(a=>a.sp==='dog');dog.adrift=0;dog.dead=0;dog.x=M.x+8;dog.y=M.y;M.inv={};M.foodBatches=[];addBatch(M,400,0,'fish');assert.doesNotThrow(()=>ACTIONS.feedDog.exec(living,M,{x:dog.x,y:dog.y},{phase:'go',left:20}));
console.log('ok   approaching a distant companion uses the walking executor without losing food or referring to an unrelated work timer');

const cp=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),thoughts=JSON.parse(fs.readFileSync(new URL('../../data/v2/mind.json',import.meta.url))),oldWorld=load(cp.blob,thoughts);
assert(oldWorld.bio&&oldWorld.soilN&&oldWorld.relief&&oldWorld.man.foodBatches);for(let i=0;i<600;i++)step(oldWorld);const replay=load(save(oldWorld),thoughts);for(let i=0;i<600;i++){step(oldWorld);step(replay);}assert.equal(save(oldWorld),save(replay));assert(oldWorld.man.B.alive);
console.log('ok   production saves migrate; all six processes replay exactly with Tomas alive');
