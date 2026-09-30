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

## A home and a lasting island

The camp now includes a workbench, drying rack, covered food store and raised bedding. These are ordinary
designed structures with gathered parts and minute-by-minute labour, not decorations unlocked on a date.
Their installed parts provide workspace, dryness and bedding. Covered food has slower bacterial growth;
stored calories are transferred out of his inventory and must be fetched again. Rain slows exposed craft work.
A roundhouse offers sheltered workspace as well as warmth, which the mind weighs against its labour cost.
Shelter forecasts use the proposed shelter's actual properties, his cape and the felt ground temperature.

`mind/crafts.js` adds bark cordage, a woven carrying basket, a fishing line, a hafted stone axe, a reed cape
and clay pottery. Recipes consume gathered materials. Unfinished craft work is retained if he is interrupted.
The workbench improves accuracy/speed; an axe speeds wood gathering and construction and wears with use.
The basket improves berry gathering. The cape adds insulation, reduced when wet. Clay must dry and accumulate
enough heat above 600 C to sinter; a weak fire cannot create a finished pot. A line takes trout from the existing
water population through seeded encounters; pull strength can break the cord. Drying food uses an existing
rack and a sufficiently hot nearby fire, reduces pathogen load and slows subsequent growth. The mind learns
calories obtained from food work rather than assuming an empty trap or depleted patch remains productive.

Action metadata still records every read/write variable. Optional `provides` identifies the variables an action
can supply, so consuming poles to make an axe is not confused with obtaining poles while planning a house.
Relevance is recalculated after excluding unknown/unavailable destinations. The cheapest immediately feasible
action is retained as a bound and fallback when a longer search reaches its budget. This preserves a real
available meal instead of making the search budget hide it. Sleep can be reconsidered when energy reserves
become urgent, through the same needs and goals as waking life.

## Weather, wear and living ground

`sim/seasons.js` models a representative exposed surface heat balance, radiative cooling, solar gain, water,
snowfall, melt, freezing and thawing. It is a compact island surface model, not a separate climate for each
pixel. There is no winter switch or guaranteed snowfall: precipitation falls as snow only in cold air.
Snow and ice add walking cost; snow loads structures; liquid precipitation wets clothes and wood. Surface
temperature affects heat lost to the ground. Plant regrowth and fish population growth respond to temperature.
The renderer refreshes seasonal ground tint as the simulated calendar moves, and paints snow/frost/ice from
saved surface state, with tree interception and puddles on suitable terrain.

`sim/heritage.js` records footfall from actual crossed tiles. Paths wear wider with traffic and recover with
warm moist growth; path cost falls slightly as a route is worn. Burnt fuel leaves ash, decomposing scraps
enrich the ground, and nearby harvesting/regrowth shows in vegetation. Cut withies consume a tree's shoot
stock, which regrows with warmth; bracken and reeds also regrow. Rain washes rabbit scent away.
Wind pressure grows with gust speed squared; wet fibres weaken, snow adds load, and installed bracing reduces
strain. Integrity scales a structure's actual protection. Repair consumes poles, cord and cover material and
restores integrity through labour. Wave run-up can move exposed loose beach branches along the shore.

The dog remembers familiar places and shared meals, gains confidence from familiarity and successful hunting,
and can investigate local rabbit scent when it competes favourably with thirst, warmth, rest and company.
It prefers real rain cover in bad weather. Hunting uses movement, relative speeds and seeded capture chance;
a trusting dog can bring a remaining portion back, leaving a physical quarry Tomas must collect. No food is
created by a companion bonus. The dog renderer poses four jointed legs, neck, ears and tail from this state.

## Phone art and story

The renderer keeps 16 px tiles and integer display zoom. Softer warm outlines, grouped leaf highlights,
quieter beach stones, bark details and more substantial limbs improve separation. Tomas has distinct weaving,
pottery, fishing and carrying poses, with tired/ill facial variations. Tree shade shifts with the sun, roofs
shed visible drops when covered and raining, water has restrained reflections, and a house cutaway reveals
Tomas inside. Furnishings, damage, paths, ash and snow draw from physical state.

Animation samples continuous poses at 60 Hz, with bounded frame caches. A three-part presentation grid lets
joints, the camera and scenery move between art-pixel positions; head details, tile art and warm outlines
retain their original pixel sizes, without image smoothing. Drawing is capped at 60 Hz, and camera easing
uses elapsed display time. Tree crowns bend in five bands with slower, individual wind phases and gradual
canopy cutaways. These are display effects only: rendering does not advance simulation time or consume RNG.
The animation page shows representative poses alongside a moving preview.

The journal has Story so far, Tomas's words and His home tabs, a close button, finger scrolling and keyboard
focus handling. Its timeline uses actual logged events and deduplicated milestones; camp illustrations use
structure snapshots captured at those events. Older checkpoints retain their existing diary/log history;
the UI does not invent historical camp pictures or label a future fire as his first ever.

New surface, trace, scent, story, shoot, structure condition and craft/animal fields are saved, with defaults
for old checkpoints. The original mind thought interface and all existing brief keys remain compatible.
Run `node test/life-upgrades.test.js` in addition to the existing tests for material conservation, physical
weather, repair, population fishing, interruption, old checkpoint loading and deterministic replay.

The movement and ecology code uses `dmath` distance, trigonometry and rounding helpers. Integer hashing in
the seeded RNG stays unchanged. No host clock or browser trigonometry enters the simulation.

Release checks: gen, sim, fire, body, build, health, exposure and life-upgrades tests passed; the five-day life
test ended alive with identical checkpoint replay. A fresh world and the production checkpoint with its
thoughts both reached day 65 alive with a completed roundhouse, around 0.22 seconds per simulated day on
the verification machine. Food reserves were low: this is not proof of survival through an entire winter.
`advance.js` loaded and advanced the existing checkpoint; its temporary output was restored before committing.
Node and Chromium world saves matched exactly. Phone screenshots were inspected at 430 x 932 and 3x density,
including the live checkpoint, future home, journal tabs and a controlled snow fixture. Native iPhone Safari
has not been checked. Test futures and the snow fixture were not written into the live checkpoint.
