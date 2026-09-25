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
