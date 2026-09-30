// A factual, illustrated record; prose comes from his diary and events from his actual life.
import { cal } from '../core/time.js';
import { campSnapshot } from '../sim/heritage.js';
import { FAMILIES } from '../build/build.js';
import { structSprite } from './structs.js';
const escape = text => String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const icons = { home:'⌂', fire:'♨', dog:'♡', sea:'≈', health:'✚', craft:'✦', island:'❧', food:'◒' };
function stamp(W,t) {const c=cal(W.born,t);return `Day ${Math.floor(t/1440)+1} · ${String(c.h).padStart(2,'0')}:${String(c.mi).padStart(2,'0')}`;}
export function lifeEntries(W) {
  const entries=(W.story||[]).slice(), M=W.man, used=new Set(entries.map(e=>e.t+':'+e.kind));
  let seenFire=false;
  for(const l of M.log||[]) {
    const [t,k,what,stage]=l;let kind,text;
    if(k==='built'&&FAMILIES[what]){kind='home';text='He finished the '+stage+' of his '+FAMILIES[what].label+'.';}
    else if(k==='fire'&&!seenFire){kind='fire';text='He coaxed his first flame from the hand drill.';seenFire=true;}
    else if(k==='ill'){kind='health';text='He fell ill and needed time to recover.';}
    else if(k==='recovered'){kind='health';text='The illness passed. He was getting his strength back.';}
    else if(k==='ship'){kind='sea';text='He saw a ship far out beyond the reefs.';}
    if(text&&!used.has(t+':'+kind)){entries.push({t,kind,text});used.add(t+':'+kind);}
  }
  return entries.sort((a,b)=>b.t-a.t).slice(0,120);
}
export function paintCamp(cv,structures) {
  cv.width=180;cv.height=100;const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  g.fillStyle='#c8ceab';g.fillRect(0,0,180,100);g.fillStyle='#b3bd94';g.fillRect(0,73,180,27);
  g.fillStyle='#b6a884';g.beginPath();g.ellipse(90,66,50,20,0,0,Math.PI*2);g.fill();
  const ordered=structures.slice().sort((a,b)=>a.y-b.y);
  for(const s of ordered){const sp=structSprite(s);if(!sp)continue;const px=90+s.x*10,py=57+s.y*8;g.drawImage(sp.img,Math.round(px-sp.ox),Math.round(py-sp.oy));}
  g.fillStyle='#f4efda';g.fillRect(0,0,180,5);g.fillRect(0,95,180,5);
}
export function setupJournal(button,panel,getWorld) {
  let tab='story',lastFocus=null;
  function close(){panel.style.display='none';button.setAttribute('aria-expanded','false');lastFocus?.focus();}
  function draw(){
    const W=getWorld(),M=W.man,J=(M.journal||[]).slice().reverse(),entries=lifeEntries(W),home=campSnapshot(W),dog=W.animals.find(a=>a.sp==='dog'&&!a.adrift&&!a.dead&&M.mem.dog);
    panel.innerHTML=`<div class="journal-head"><div><span class="eyebrow">THE CASTAWAY</span><h2>A life on the island</h2></div><button class="journal-close" aria-label="Close journal">×</button></div>
      <div class="journal-intro">Day ${Math.floor(W.t/1440)+1} with Tomas${dog?' and '+escape(dog.name):''}. Every entry comes from their life here.</div>
      <nav class="journal-tabs" aria-label="Journal sections">${[['story','Story so far'],['words',"Tomas’s words"],['home','His home']].map(([k,label])=>`<button data-tab="${k}" aria-pressed="${tab===k}">${label}</button>`).join('')}</nav>
      <div class="journal-body">${tab==='story'?(entries.length?entries.map((e,i)=>`<article class="story-card"><span class="story-mark">${icons[e.kind]||'·'}</span><div><time>${stamp(W,e.t)}</time><p>${escape(e.text)}</p>${e.camp?.length?`<canvas class="camp-picture" data-picture="${i}" aria-label="His camp at this moment"></canvas>`:''}</div></article>`).join(''):'<p>The first pages are still being lived. His discoveries will appear here.</p>'):
      tab==='words'?(J.length?J.map(j=>`<article class="diary-card"><time>${stamp(W,j.t)}</time><p>${escape(j.text).replace(/\n/g,'<br>')}</p></article>`).join(''):'<p>He has not written in his journal yet.</p>'):
      `<canvas class="camp-picture" id="home-picture" aria-label="His camp as it stands now"></canvas><h3>Made by his own hands</h3>${home.length?home.map(s=>`<div class="home-row"><strong>${escape(s.label||FAMILIES[s.k]?.label||s.k)}</strong><span>${s.stage>=s.stages.length?'Complete':escape(s.stages[s.stage]?.name||'under way')+' in progress'}${s.integrity<.88?' · needs repair':''}</span></div>`).join(''):'<p>He is still finding a place to make his home.</p>'}<h3>Useful things</h3><p>${[['basket','a woven basket'],['line','a fishing line'],['axe','a stone axe'],['wrap','a warm woven cape'],['clayPot','a fired clay pot'],['pot','a bark pot']].filter(([k])=>M.inv[k]&&!(k==='pot'&&M.inv.clayPot)).map(([,label])=>escape(label)).join(', ')||'He is learning what the island can provide.'}</p>`}</div>`;
    panel.querySelector('.journal-close').addEventListener('click',close);
    panel.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;draw();panel.querySelector(`[data-tab="${tab}"]`).focus();}));
    panel.querySelectorAll('[data-picture]').forEach(cv=>paintCamp(cv,entries[+cv.dataset.picture].camp));
    const cv=panel.querySelector('#home-picture');if(cv)paintCamp(cv,home);
  }
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','journal');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Tomas’s journal');panel.setAttribute('aria-modal','true');
  button.addEventListener('click',()=>{if(panel.style.display==='block'){close();return;}lastFocus=document.activeElement;draw();panel.style.display='block';button.setAttribute('aria-expanded','true');panel.querySelector('.journal-close').focus();});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const bs=[...panel.querySelectorAll('button')];const i=bs.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();bs.at(-1).focus();}else if(!e.shiftKey&&i===bs.length-1){e.preventDefault();bs[0].focus();}}});
}
