# The Castaway v2: design

A cozy pixel-art island where one castaway lives a fully simulated life in real time (Europe/London calendar).
Nothing is scripted: the world runs on physical processes, his needs come from his body's physiology, and what he
does comes from a planning mind that predicts, sets goals, searches for the cheapest way to reach them, and learns.

v1 (the current game, repo root) keeps running until v2 is proven; then a new castaway washes up on v2.

## Principles
- **Everything is a process, not a rule.** Fire burns fuel mass at a rate set by moisture and wind; wood dries and
  wets; trees drop deadwood; food spoils by temperature; he gets cold because heat leaves his body faster than he
  makes it. No "if the fire is out then relight" anywhere: he relights it because his mind predicts a cold night.
- **Deterministic everywhere.** Same seed + same thoughts = same life on every device and on replay from any save.
  Sim code uses only + - * / sqrt floor min max abs and the seeded RNG (core/rng.js); anything else (sin, exp,
  pow) goes through core/dmath.js (polynomials/tables). Never Math.random or Date in sim code.
- **Fast catch-up.** The phone replays the hours it was closed: the sim budget is ~0.2 ms per simulated minute.
- **Separation.** sim/ and mind/ never touch the DOM or rendering; render/ only reads sim state. Everything in
  core/, world/, sim/, mind/ runs headless in Node for tests.

## Layers
1. **World** (world/): island terrain fields (height, moisture, soil) at tile resolution (1 tile = 2 m), generated
   from the seed. Entities (trees, rocks, plants, items on the ground, structures, animals, him) with components.
2. **Physical processes** (sim/): weather (fronts, temperature, humidity, rain, wind by season and hour), heat,
   fire (fuel kg, moisture, burn rate, embers, ignition), wood (green/seasoned/wet), deadwood production and wind
   fall, plants (growth, flowering, fruiting, regrowth), water, food (kcal, spoilage), tides.
3. **Body** (sim/body.js): energy (glycogen, fat), hydration, core temperature from a heat balance (metabolism,
   wind, rain, wet clothes, clothing insulation, shelter, fire), sleep pressure and circadian rhythm, injuries,
   illness, fitness and skill. Hunger, thirst, cold, tiredness and pain are signals from this body.
4. **Mind** (mind/): beliefs (what he has seen, when, and how sure he is), knowledge (techniques he knows, learned
   by trying and noticing), drives -> goals via prediction of his own body and the world over hours to days,
   a GOAP planner over an action library (each action: needs, effects, time, effort, risk), an executor that turns
   actions into movement and animation, replanning on surprise, and learning of action costs and success rates.
   Claude (the scheduled routine) is his deeper mind: values, hopes, reflections, long-term goals, diary.
5. **Animals** use the same body model (simplified) and a simpler utility mind.
6. **Render** (render/): pixel art. A low-res framebuffer (16 px tiles), integer upscaling, a fixed warm palette
   with per-material colour ramps and 1 px outlines, sprites generated procedurally from entity state (so every
   simulated change shows), day/night and fire light via palette-aware tinting, smooth camera, integer zoom.
   Target 60 fps on iPhone.

## Milestones (each published at /castaway/v2/ for review)
- M1 kernel, island generation, pixel renderer, camera, day/night.
- M2 physical processes and ecology.
- M3 body.
- M4 mind; the castaway arrives.
- M5 animals and the ship's dog.
- M6 Claude mind, journal, saving and catch-up, switch-over (fresh island).

## Procedural building (src/build)
He builds what he needs as he becomes able. A designer turns a brief (prevailing wind as he has felt it, where camp
and the fire are, which materials he knows of, his build skill) into a design: a family (lean-to, debris hut, fire
ring, reflector wall, woodpile, roundhouse), a site, an orientation (a lean-to's back to the weather, its mouth to
the fire) and staged parts (poles, bracken, pine boughs, stones, withies, leaf litter, mud, reeds). What a
structure does (rain and wind kept off, bedding, reflected fire heat, a dry wood store, a stone ring that holds
embers) is computed from the parts installed, so a half-thatched roof half works. The mind weighs projects by
predicting tonight's body temperature with and without them; each stage is an ordinary planner goal (gather the
parts, then put them up), and materials put down on site stay there if he's called away. The renderer draws every
structure from its parts and progress. Families need skill: the roundhouse only once he's built enough.

## Thermal refuge
The mind also compares the next hour's heat balance at a remembered fireside seat and inside his best built
shelter (`mind/exposure.js`). Forecasts copy his body and use the ordinary physiology with the weather he can
currently feel; they do not consume randomness, change his real body, or know the next weather front. Expected
cold avoided adds weight to warming and taking cover, so warmth does not always mean sitting in exposed rain
beside a fire. He can lie awake on his existing bed to conserve heat, without receiving sleep recovery.
Depleted fat, glycogen and food in his gut produce a separate starvation signal, so ordinary hunger does not
stay at a fixed priority while his remaining energy vanishes. Eating competes more urgently with keeping warm
as those reserves fall; calories and heat are still gained only through the normal physical processes.
Danger from hypothermia continues rising below 35 degrees, even after ordinary cold has reached its maximum
signal, so an immediate collapse from cold can outweigh a slower energy deficit. A full gut quiets food urgency
while its contents digest.
Actions that need the shelter enter its tile rather than stopping beside it. These choices use existing saved
pose and action fields; old checkpoints and the mind routine's thought and brief formats remain compatible.
Run `node test/exposure.test.js` as well as the standard checks for forecasts, shelter entry, heat recovery and
replay. Long-term food supply and winter survival still need separate work.
