# The Castaway

A deterministic island simulation that runs in real time (Europe/London). Open the site and watch Tomas live his life.

- `index.html` runs the simulation in `v2/` (see `v2/DESIGN.md`); the original game is kept at `v1.html`.
- `data/v2/` holds the world checkpoint and Tomas's thoughts. A scheduled Claude routine (see `v2/MIND.md`) updates these files a few times a day.

The island changes as Tomas lives: paths wear, plants regrow, weather strains his buildings, and he can make
tools, clothing, pottery and a furnished home. The phone journal collects his real milestones, diary and camp
illustrations. See `v2/DESIGN.md` for the physical models and verification commands.

Rain now feeds soil, puddles, groundwater, lake and stream. Tomas can plan rain collection and drainage;
water supplies are finite, and freshwater conditions affect fish. The viewport water renderer shows changing
shallows, wave wash, currents, reflections, drifting litter, rain rings and lake ice.

Camp objects now share a construction grammar: actual supports, bindings, surfaces, covers and hollow basins
determine their usefulness and their drawings. Tomas can consider combined designs, learn from visible strain,
replace damaged components and recover some materials. Containers, working surfaces and racks are the first
families using this model. Shelters and bedding also use installed geometry; axe and fishing-line
performance follows their working parts, force, wetness and wear. Earthworks move finite water and
sediment, with excavated soil retained as spoil. Tomas compares known materials and observed loads.

On a phone, tap Tomas, an animal or a construction to inspect it. The journal's **His home** tab also opens
**Inspect camp & belongings**. Materials, damage, water, tools and design estimates come from the
current simulated state. Models are simplified and use documented assumptions; they are not
calibrated predictions of real-world structures or survival.

Vegetation now grows from finite reserves, sunlight, soil water and nutrients. Shelters
retain heat and moisture; meals keep their own weight, temperature, age and preparation
progress. Loads and hills affect effort, flowing water erodes and deposits actual soil,
and Tomas adjusts his estimates after completed work. Tap him to see separate meals and
carrying weight, or tap his shelter to see its inside conditions. See the six process models
and their conservation tests in `v2/DESIGN.md`.

Tap the sound button for a softer, continuous island soundscape: surf, wind through remaining
foliage, liquid rain on installed coverings, flowing streams and burning fuel. Sound is generated
from the current world and camera position, with no recordings or repeating sound clips.
The acoustic models and listening levels are approximations, documented in `v2/DESIGN.md`.

The world now also has a connected food web, animal digestion and thermal budgets, sight
occlusion, wind-carried scent, uncertain memories and directional hearing. Mechanical
contacts drive work progress, tool wear, motion and quiet work sounds; animal calls come
from their simulated behaviour. A numerical regional atmosphere transports heat and
moisture into a local island mesh. Its precipitation supplies the same finite surface
water that draws puddles and blocks flooded paths. See [the model equations, boundaries
and tests](v2/SIMULATION.md). These are deterministic reduced models with explicit
assumptions; conservation tests establish numerical consistency, not complete accuracy
against real weather, animal physiology or measured sound.
