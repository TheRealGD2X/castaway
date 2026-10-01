// The desktop calls the ORIGINAL simulation. Scheduling and snapshots live here;
// neither render frequency nor graphics quality enters the authoritative state.
import {createWorld,step,save,load} from '../../v2/src/sim/world.js';
import {SEED,BORN} from '../../v2/src/config.js';
export class Session {
  constructor(checkpoint,thoughts=[]){this.thoughts=thoughts;this.world=checkpoint?load(checkpoint,thoughts):createWorld(SEED,BORN,{thoughts});}
  advance(target,limit=Infinity){if(!Number.isSafeInteger(target)||target<0)throw Error('Invalid simulation minute');let n=0;while(this.world.t<target&&n<limit){step(this.world);n++;}return n;}
  snapshot(){return {blob:save(this.world),t:this.world.t,born:this.world.born,seed:this.world.seed,thoughts:this.thoughts};}
}
