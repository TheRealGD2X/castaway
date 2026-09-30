// Shelter geometry uses the original charged stage budgets, including older saves.
// Forks, ribs, coverings and bedding are real parts of the shared assembly model.
export function homeAssembly(s) {
  if(!['leanto','debrisHut','roundhouse','bedding'].includes(s.k))return null;
  const nodes=[],parts=[],node=p=>{nodes.push(p);return nodes.length-1;};
  const add=(stage,kind,mat,amount,fields)=>parts.push({id:parts.length,stage,kind,mat,amount,condition:s.integrity??1,...fields});
  const bar=(stage,a,b,amount)=>add(stage,'bar','poles',amount,{a,b});
  const fork=(stage,k,amount)=>add(stage,'joint','poles',amount,{node:k,quality:1});
  const panel=(stage,mat,amount,points,supports)=>add(stage,'panel',mat,amount,{points,nodes:supports});
  const cover=stage=>Object.keys(s.stages[stage].need).find(k=>['bracken','boughs','debris','reeds'].includes(k));
  let floor,ceiling=1.2;
  if(s.k==='bedding'){
    floor=[[-.7,-.35,0],[.7,-.35,0],[.7,.35,0],[-.7,.35,0]];
    const top=floor.map(p=>node([p[0],p[1],.25]));
    floor.forEach((p,k)=>{bar(0,node(p),top[k],.35);bar(0,top[k],top[(k+1)%4],.65);add(0,'joint','withies',1,{node:top[k],quality:.95});});
    panel(1,cover(1),8,floor.map(p=>[p[0],p[1],.25]),top);
  }else if(s.k==='roundhouse'){
    // Eight straight wall bays form an octagonal home. One bay has a real doorway.
    ceiling=1.35;const ring=[[-1,-.45],[-.45,-1],[.45,-1],[1,-.45],[1,.45],[.45,1],[-.45,1],[-1,.45]];
    floor=ring.map(([x,y])=>[x,y,0]);
    const tops=ring.map(([x,y])=>node([x,y,ceiling]));
    ring.forEach(([x,y],k)=>{bar(0,node([x,y,0]),tops[k],1.55);fork(0,tops[k],.2);});
    const walls=[];
    for(let k=0;k<8;k++){
      const a=ring[k],b=ring[(k+1)%8];
      if(k===3){walls.push({points:[[a[0],a[1],1.05],[b[0],b[1],1.05],[b[0],b[1],ceiling],[a[0],a[1],ceiling]],nodes:[tops[k],tops[(k+1)%8]]});}
      else walls.push({points:[[a[0],a[1],0],[b[0],b[1],0],[b[0],b[1],ceiling],[a[0],a[1],ceiling]],nodes:[tops[k],tops[(k+1)%8]]});
    }
    for(const [stage,mat]of[[1,'withies'],[2,'mud']])for(const wall of walls)panel(stage,mat,s.stages[stage].need[mat]/walls.length,wall.points,wall.nodes);
    // A small ridge ring leaves a smoke opening. Each thatch section follows its rafters.
    const high=ring.map(([x,y])=>node([x*.12,y*.12,2]));
    for(let k=0;k<8;k++){bar(3,tops[k],high[k],1.05);bar(3,high[k],high[(k+1)%8],.1);fork(3,high[k],.1);
      panel(4,'reeds',45/8,[nodes[tops[k]],nodes[tops[(k+1)%8]],nodes[high[(k+1)%8]],nodes[high[k]]],[tops[k],tops[(k+1)%8],high[k],high[(k+1)%8]]);}
    panel(5,cover(5),8,[[-.75,-.65,.02],[.75,-.65,.02],[.75,.15,.02],[-.75,.15,.02]],[]);
  }else{
    const width=s.k==='leanto'?1.4:1.5,half=width/2;
    floor=[[-half,-.7,0],[half,-.7,0],[half,.7,0],[-half,.7,0]];
    const ridge=s.k==='leanto'?half:0;
    const ends=[node([ridge,-.7,1.2]),node([ridge,.7,1.2])];
    for(let k=0;k<2;k++){bar(0,node([ridge,k? .7:-.7,0]),ends[k],.85);fork(0,ends[k],.15);}bar(0,ends[0],ends[1],1);
    const slopes=s.k==='leanto'?[-half]:[-half,half],ribStage=1,roofStage=s.k==='leanto'?1:2;
    for(const x of slopes){const supports=[];
      for(let k=0;k<4;k++){const y=-.7+k*1.4/3,a=node([x,y,0]);let b=k===0?ends[0]:k===3?ends[1]:node([ridge,y,1.2]);
        if(k===1||k===2){bar(ribStage,b,ends[0],.2);fork(ribStage,b,.15);}
        bar(ribStage,a,b,(s.k==='leanto'?4:8)/slopes.length/4-(k===1||k===2?.35:0));supports.push(a,b);}
      const pts=x<ridge?[[x,-.7,0],[ridge,-.7,1.2],[ridge,.7,1.2],[x,.7,0]]:[[ridge,-.7,1.2],[x,-.7,0],[x,.7,0],[ridge,.7,1.2]];
      panel(roofStage,cover(roofStage),s.stages[roofStage].need[cover(roofStage)]/slopes.length,pts,supports);
    }
    const bedStage=s.stages.length-1;panel(bedStage,cover(bedStage),s.stages[bedStage].need[cover(bedStage)],floor.map(p=>[p[0]*.9,p[1]*.9,.02]),[]);
  }
  // Reconcile every material exactly to its existing stage budget; no free resources on migration.
  for(let k=0;k<s.stages.length;k++)for(const mat of Object.keys(s.stages[k].need)){
    const chosen=parts.filter(p=>p.stage===k&&p.mat===mat),sum=chosen.reduce((v,p)=>v+p.amount,0);
    if(sum)for(const p of chosen)p.amount*=s.stages[k].need[mat]/sum;
    else add(k,'stock',mat,s.stages[k].need[mat],{center:[0,0,0]});
  }
  return{version:1,nodes,parts,floor,ceiling,habitat:s.k!=='bedding',label:s.k==='leanto'?'forked timber lean-to':s.k==='debrisHut'?'leaf-covered sleeping hut':s.k==='roundhouse'?'woven and clay-lined roundhouse':'lashed raised bed'};
}
