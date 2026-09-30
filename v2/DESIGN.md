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

## Water balance and presentation

`sim/hydro.js` integrates water every ten simulated minutes, in cubic metres. Rain and snow supply the island;
snow melts from heat and sunlight. Tile soil holds moisture, infiltrates and feeds a groundwater reservoir.
Surface hollows accumulate puddles, freeze, evaporate and transfer water downhill. Worn ground infiltrates
more slowly. Lake and stream storage receive runoff and groundwater, discharge by depth, and can spill onto
stream banks. This is a coarse island water balance: lake and stream are aggregate reservoirs, rather than
a full fluid solver. The nested ocean now has its own finite-volume circulation,
salt/heat/tracer inventories and directional wave action. It reconstructs linear waves
from solved energy and phase rather than resolving fluid particles. See [OCEAN.md](OCEAN.md).

`W.water` remains the existing pathogen concentration. `W.hydro` holds volumes, flow, temperature, oxygen,
sediment, wave energy and cumulative input/output counters. Flow affects stream flushing; depth, temperature
and oxygen affect fish carrying capacity. Drinking and filling the boiling pot remove actual water, as does
the dog's drinking. A stone/clay rain basin and reed catchment can become planner projects; installed parts
determine collecting area and capacity. Captured water has germs, leaks, evaporates and overflows. Camp drains
change surface retention and downhill transfer; standing water contributes to walking cost. Seeded chance
can detach actual bank litter into saved drifting packets; material leaving the stream is recorded.

The renderer precomputes shore distances and texture once. Each frame shades only the visible art pixels,
using a sine lookup table and a reused viewport buffer. Wavelets and shore crests shade continuously.
Wide zoom reuses interior shading in small blocks while
retaining every shoreline pixel, to bound drawing cost. Depth bands, shallow caustics, wind ripples, wave
crests, wet shore wash, stream currents, rain rings and lake ice read physical state. Nearby tree reflections
use clipped distortion strips; litter packets follow the drawn stream. These are presentation effects,
not extra simulation steps. Stream depth and lake level change the drawn shore. Flow and distance control
soft stream sound, while installed collecting surfaces add quiet rain sound. No rendering consumes RNG.

Run `node test/water.test.js` for water/material conservation, drainage, finite collection and extraction,
old checkpoint defaults and replay. The health test advances flow alongside water quality. Water release
verification also includes the required suite, a five-day life replay, both fresh and production-checkpoint
65-day survival/replay runs, and phone-sized rendering/motion checks. Benchmark results and limits are reported
with the release; desktop Chromium emulation does not establish native iPhone Safari performance.

## Shared construction grammar

`build/assembly.js` stores metre-scale nodes and bars, bindings, panels, hollow shells and retained offcuts.
Material units have approximate mass, density, stiffness, strength, permeability and recoverable fractions.
Installed quantities, graph support paths, panel overlap, mass distribution and container dimensions determine
load capacity, working surface, hanging length, dry storage, rain interception, water volume and leakage.
Object names grant none of these functions. Wetness weakens fibres; load, gust pressure and snow strain the
components. Sag and damaged parts are saved. Tomas learns conservative strength bounds only while close
enough to observe strain; those beliefs influence proposed designs. No mechanics or drawings consume RNG.

`build/designer.js` searches a bounded grammar for useful dimensions, material quantities, bracing and cover,
weighing target shortfall, safety and labour. Workbenches, drying racks, food shelves, rain collectors and
combined camp inventions use this model. Missing useful functions can produce a combined construction,
which competes with existing projects and bodily needs in the normal planner. It may prefer a simpler project.
Hearths and traps retain their existing physical models; this is a foundation for
extending procedural objects, not unrestricted invention or a general rigid-body/finite-element solver.
Support and stress calculations are engineering approximations, including conservative contact friction.

Gathered units move from inventory to site to installed parts as work proceeds. Whole-unit offcuts stay in
the assembly. Partial work resumes without charging twice. Repairs retain paid replacement pieces across
interruptions, require labour, replace the actual material and return bounded usable scraps. Salvage is a
material source in the planner, with a once-per-part state variable; it never creates a second recovery.
Stored food respects physical shelf capacity. Crafting, drying and drinking select physical capabilities,
including those of mixed designs. Rain is conserved when shells leak or overflow into surrounding ground.

`render/assembly.js` projects the same installed geometry in four orientations, with material textures,
lashings, separate supports, woven/slatted surfaces, sloping covers, hollow water basins and deformation.
It never selects a sprite by object name. A bounded cache retains 512 construction sprites; rendering is
read-only. Journal camp snapshots clone component state so later repairs cannot alter earlier pictures.
Legacy constructions migrate on load with original stage material budgets; new component and learning
state travels in the existing structure/man save fields. Optional brief additions are documented in MIND.md.

Run `node test/construction.test.js` alongside the existing required suite and water/life-upgrade tests.
It covers name-independent functions, misplaced roofs, supports, bindings, tipping, cracks, construction and
repair accounting, recovery, witnessed strain, water conservation, historical snapshots and old-save replay.
Release checks also include fresh and production-checkpoint 65-day survival/replay, advance.js, Node versus
Chromium checkpoint equality, phone screenshots and render timing. Safari on an actual iPhone is untested.


## Homes from shared parts

`build/homes.js` converts lean-tos, debris huts, octagonal roundhouses and raised bedding
into forked timber supports, ribs, woven wall bays, clay daub, separate roof sections and
bedding panels. Original stage names and material budgets are preserved on old saves.
A roof needs connected supports; its actual footprint, coverage and material density determine
rain interception. Wall and roof normals determine directional wind shielding. A doorway and
smoke opening are gaps in the geometry. The clear line towards the camp hearth determines
radiant transmission. Bedding resistance follows thickness, loose material density and wet
thermal conductivity; wet fibres conserve less heat. No additional warmth is granted on completion.
Timber forks have bearing strength distinct from fibre lashings. Existing component stress,
replacement, recovery and learning apply to homes, including completed parts of unfinished work.
The renderer projects installed parts, with a cutaway while Tomas is inside. Roof bays use
triangle rasterisation, so tapered sections keep their actual shape. Test with `homes.test.js`.


## Water engineering and sediment accounting

`build/waterworks.js` describes cut dimensions, a downhill outlet and installed stone volume.
Cuts retain their excavated soil as spoil. Stone volume divided by the crest footprint sets
barrier height. Pools have finite geometric capacity reduced by deposited sediment volume.
Hydraulic heads include cut depth; a trench without a low enough outlet can retain water.
No drain is promised to work on every slope. Engineered rectangular channels use SI Manning
flow, A R^(2/3) sqrt(head/length) / n; stone barriers use broad-crested overflow,
0.6 (2/3) sqrt(2g) width head^(3/2). Both are capped by physically available volume above
the receiving head to prevent negative water or over-draining below a crest. Natural land
routing and whole lake/stream reservoirs remain coarse ten-minute approximations.

Mineral soil, suspended silt, spoil, deposited beds, exported sediment and drinking removals
have a separate kilogram ledger. Erosion transfers from finite soil into moving water;
settling transfers suspended mass into beds rather than creating dirt. Ideal small-grain
Stokes settling uses density 2650 kg/m3, radius 6 micrometres, viscosity .0013 Pa s and
an exact deterministic exponential for a well-mixed pool. Geometry, roughness (.06), grain
size, permeability and erosion coefficients are assumed, not measured island data. This is
not a calibrated hydraulic solver, a resolved river network, or a microbiological filter.
Settling does not remove the existing infection dose. The same recorded properties draw
cuts, spoil, stone crests and silting pools. No new RNG draws are used.

Equation references: [USACE Manning flow](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/6.6/stable-channel-design-functions/uniform-flow-computations),
[USGS ideal particle settling](https://pubs.usgs.gov/sir/2007/5008/section5.html).
`waterworks.test.js` checks independent equations, scaling, crest thresholds, water and mineral
conservation, lost pool capacity, removal and exact checkpoint replay. Settling is additionally
compared with its analytic solution at different intervals. New typed arrays have old-save defaults.


## Tools from working geometry

`sim/tools.js` stores cutting edges, handles, bindings and fibres in kilograms and metres.
Axe strike energy is m v^2/2; handle capacity follows cantilever bending strength; binding
and fishing-line strength follow fibre cross-sectional area, tensile strength, knot quality,
wetness and condition. Wood separation uses edge contact area and an assumed shear resistance.
Only the useful cutting power improves the cutting share of gathering/building work; carrying,
gathering and assembly labour still take time. Axe presence gives no fixed multiplier.
Archard abrasion transfers a finite volume from the edge into retained dust, widening its
radius. Overload damages bindings/handles; a parted tool remains saved as broken material.
Fishing fights exert force against the actual fibre strength. Tool parts, offcuts, broken
fragments and abrasion dust conserve the charged input mass. Older tools retain their original
charged mass; migrated fishing cord retains its excess as stock rather than inventing an edge.
Small collected branches yield their actual available wood mass, including fractional poles.

Swing speed (4 m/s), cadence (.6 Hz), stopping distance (.03 m), wood shear resistance,
fibre quality and abrasion coefficient are engineering assumptions, not a calibrated cutting
experiment. This does not simulate detailed fracture, individual fibre strands or hand contact.
`tools.test.js` checks independent energy/strength equations, wear, overload, mass accounting,
interrupted construction, short-branch yield and save/load. No new natural random draws are added.

## Work seen through the rig

`render/workpose.js` reads the current construction part, its installed geometry, nearby
work surface, paid craft progress, carried material mass and fishing target. The same rig
then lashes joints, lifts roof material, scoops excavations, carries stones and handles a
real handline. Workpieces grow from saved physical progress rather than animation time.
Hand targets are projected from assembly coordinates and bounded to the character's reach;
this is a presentation approximation, not a contact or climbing solver. Animation never
advances work, consumes materials, draws randomness or changes checkpoint state.
`workpose.test.js` checks physical inputs and that drawing instructions remain read-only.

## Comparing designs through experience

`compareDesigns` ranks the bounded grammar by unmet physical targets, estimated collection
and assembly time, conservative load capacity, rain exposure and present wind/snow load.
Known cover materials compete; remembered source distance and already-owned stock alter
estimated effort without supplying free materials. Estimates retain the top three choices
and their material budgets on the chosen assembly. Predictions do not alter its mechanics.
Construction experience records the largest load personally witnessed on each part and
whether it strained; distant failures remain unknown. Existing material bounds inform
future designs and invalidate cached proposals when those bounds change. Sheltered workspace
value follows installed enclosure and roof geometry rather than a roundhouse-name bonus.
These are practical, approximate estimates; gathering routes, future storms and service
lifetimes are uncertain. Learning comes from actual use, not scheduled tests or free objects.
`designer.test.js` checks material knowledge, effort, stock, loads, local observation and replay.

Collection estimates convert a remembered round trip from tiles to metres (2 m/tile),
then to minutes using the same 72 m/min baseline and fatigue/cold/load modifiers as walking.
The 1.25 route factor and gathering labour remain estimates rather than exact route search.
`designer.test.js` independently checks the distance/time conversion and tiredness effect.

## Looking at possessions

`render/inspection.js` describes installed parts, condition, finite stored water, sediment,
owned tools and saved design comparisons. `render/inspect.js` presents those read-only facts
in a phone sheet. Tap Tomas, tap visible construction pixels, or open the journal's home
tab and choose Inspect camp & belongings. Dragging or pinching continues to move the camera.
Object previews use the existing physical-part sprites; none are invented catalogue pictures.
Small tool masses use grams, and engineering estimates are labelled as estimates. Looking
never creates items, changes Tomas's knowledge, advances work or consumes random numbers.
`inspection.test.js` verifies physical values, wear and unchanged checkpoint state.

## Six connected physical processes

These models have conservation checks and declared units. They are simplified numerical
models, not a calibrated reconstruction of a particular island or person. Initial stocks,
material coefficients, thermal conductances and biological rates are assumptions. Passing
tests establishes internal consistency, replay and the tested equations; it does not establish
real-world predictive accuracy. No new random draws, scripted rewards or scheduled experiments
are used by these six processes.

### Finite vegetation and material flow

`sim/biomass.js` tracks live matter, stored reserves, foliage, dead wood, shoots, crops,
ground litter and floating litter in dry kilograms. Initial live stocks are 300 kg times
size for trees, 24 kg for shrubs and 2 kg for small plants. Their initial reserves and
foliage are explicit stocks, rather than a future source of unlimited harvests.

Accumulated daylight supplies chemical growth energy at an assumed 1.2% conversion and
18 MJ/kg dry matter. Rooted entities occupy separate generated tiles, each intercepting at
most that tile's 4 square metres. Temperature, available soil water and finite soil nitrogen
bound growth; 500 litres of transpired water and 0.01 kg nitrogen are charged per kg of growth.
Transpiration debits the actual hydrology soil reservoir and credits its evaporation ledger.
Reserves pay for shoots, new cover and fruit. Aging transfers living wood to dead wood and
litter; leaf and fruit losses transfer to litter. Temperature-dependent exponential decay
records respired matter and returns nitrogen. The daily integration is deliberately coarse;
it does not resolve individual roots, stomata or within-day growth. Seasonal phenology still
uses the existing calendar and temperature approximation.

The vegetation boundary obeys `remaining dry kg + respired kg + net harvested kg -
assimilated kg = initial dry kg`. Harvested kg is a boundary transfer to camp inventory,
not destruction of material. Pine cover, leaf litter, reeds, bracken, shoots, fuel and bark
now debit actual stocks. Signal fires convert their charged construction mass to fuel;
relaying a damp fire returns its exact log mass. Mud and stone collection debit the finite
mineral reservoir, retain a mineral-transfer ledger and lower the surface. Camp assemblies,
tools, offcuts and fire processing retain their existing separate accounting. This is not
a closed molecular budget for all animal bodies, atmospheric gases, marine ecology or ash.
Decaying food left on land returns measured nitrogen, recorded as an external input to the
vegetation nutrient boundary; it does not apply an unlimited fertility multiplier.

### Air, contents and moisture inside a shelter

`sim/microclimate.js` derives volume, solid heat capacity and conductances from installed
geometry, mass and enclosure. Air capacity is volume times 1.2 kg/m3 times 1005 J/(kg K);
solid contents use an assumed 1500 J/(kg K), plus 4180 J/(kg K) for absorbed water.
Coupled air/wall temperatures solve a two-node backward-Euler heat balance every minute.
Infiltration depends on enclosure and wind. Nearby fires allocate bounded fractions of their
emitted heat among shelters; distant or open shelters retain little warmth. The body reads
the actual indoor air, humidity and contents temperature. The night forecast uses the same
heat equations, held anticipated weather and assumed fire input; it cannot inspect future weather.

Rain wets a finite cover reservoir. Ventilation exchanges actual vapour; breathing supplies
vapour already represented by the body's ongoing water loss. Condensation moves vapour to
surface water and releases latent heat; drying reverses the transfer and consumes heat.
Surfaces retain an assumed 20-micrometre film; excess drips leave the shelter volume and
are recorded in its moisture output, rather than accumulating without limit.
Each shelter records its initial water and atmospheric/body inputs and outputs, with a
local moisture conservation check. Shelter vapour and bound organic water are an open
atmospheric boundary, outside the existing soil/lake/stream water ledger. They are not
counted a second time as available drinking water; shelter drips are an output at this
boundary, not an additional input to the coarse ground-water model. Moist thermal exchange is an approximate
split process, not a full psychrometric, radiation, freezing or air-flow solver; bedding and
walls share one effective contents temperature. Tapping a shelter reveals these conditions.

### Physical food lots

`sim/food.js` keeps separate lots with dry matter, water, shells where relevant, kcal,
temperature, contamination, harvest time, visible decay and accumulated heat exposure.
Consecutive gathering in one hour groups a harvest; unrelated older meals stay separate.
Trout retain the existing 250 g / 330 kcal profile. Shellfish include their shell mass and
discard it separately when prepared. Other foods use declared approximate dry energy and
water ratios. Collections, consumption, sharing and storage split actual lots; storage
capacity and structure loads use kilograms, rather than a fixed kcal-to-weight conversion.
Cooking no longer supplies a full meal plus an additional free 8% of scraps.

Food cooling uses exponential lumped heat transfer. A bounded 8% share of emitted fire
heat is apportioned by exposed area; dry matter, water and shells have different heat
capacities. Evaporation costs 2.3 MJ/kg. Larger portions heat more slowly. Cooking and drying
finish on accumulated heat and remaining water, not the original action timer; interruption
retains the actual lot temperature, water and dose. Temperature and moisture affect growth,
heat loss of contamination, and nutrient decay. The moisture ratio is a water-activity
surrogate, not a laboratory measurement; 0.85 is used as an approximate bacterial-growth
boundary. This single-organism model does not resolve spores, toxins, cross-contamination,
specific pathogens or validate food safety. Tomas chooses by age and visible decay, never
by reading the hidden organism count. Actual consumed lots supply his exposure dose.
Snares and loose quarry retain their harvest time and decay; shared scraps no longer vanish
because exactly one day elapsed. Fish remain biomass cohorts; terrestrial animals now
have individual bodies as described in `SIMULATION.md`.

### Carrying and effort

`sim/effort.js` totals actual material, tool, equipment, water and food mass. Weight and
awkward poles/boughs continuously reduce walking speed; baskets reduce awkwardness, not
gravity. Real route ascent costs `total kg * 9.81 * climbed metres` in mechanical energy,
with an assumed 25% conversion efficiency. Added load work increases the body's metabolic
cost. Work progress depends on load, fatigue and supported posture at a usable surface;
crafting and gathering scale actual progress, rather than awarding a fixed bench bonus.
These are effective effort estimates, not a musculoskeletal or balance simulation. A*
and walking both use actual elevation and terrain resistance; design collection estimates
use the same continuous load factor and observed work costs.

### Water changes the ground

`sim/geomorph.js` converts eroded/deposited kg to surface change using 1600 kg/m3 bulk
density and 4 m2 tiles. Excess boundary shear entrains a finite soil stock; roots and
compaction raise its resistance. The assumed erodibility is 0.00001 kg/(m2 s Pa), with
a base critical stress of 0.4 Pa and a finite 20 kg/m3 transport bound. Existing Stokes
settling deposits transported mass back into the ground. Saved double-precision relief
changes water heads, neighbour drainage, walking slopes and soil pore capacity. Lake-bed
deposition raises the effective bed and alters outflow. Renderer marks expose eroded and
deposited patches from that state. Drainage is rebuilt once per affected tile after each
hydrology interval; derived caches do not enter saves. Checkpoint loading rebuilds the same
drainage from saved relief. Terrain classes and the marine coastline remain coarse static
tiles; cliff failure and full coastal sediment transport are not resolved. Surface pools
and channel overflow now affect water heads, render standing water and block deep crossings.

### Learning from actual work

`mind/experience.js` compares completed observed minutes against the action's original
estimate, storing its mean ratio, Welford variance and last prediction error. Confidence
increases with observations; personal estimates blend with the original prior. The planner
and design comparison use these estimates without changing physical effort or supplying
resources. Interrupted episodes are not scored as completed work; resumed paid crafts are
excluded from full-task cost learning. Age/decay observations, prior food yield learning
and witnessed construction loads continue to have their own meaning. No forced trials
are scheduled, and future weather or hidden material state does not become knowledge.

Old checkpoints reconstruct missing living stocks, nutrient pools, relief and food lots
from declared defaults, preserving existing calorie totals and preserved-food fractions.
Legacy lots cannot recover a detailed historical moisture or temperature history. New
fields are saved; `advance.js` and `think.js` interfaces and existing brief keys are unchanged.
`processes.test.js` adds independent heat/steady-state equations, timestep convergence,
finite growth limits, dry/water/mineral conservation, physical food weights and fire energy
limits, interrupted food handling, carrying cost, learning and production checkpoint replay.

Primary references for the equations and model boundaries:

- [FAO biomass production and resource limitations](https://www.fao.org/4/t1804e/t1804e04.htm).
- [EnergyPlus air heat balance](https://energyplus.readthedocs.io/en/latest/guides/engineering-reference/2.1-basis-for-the-zone-and-air-system-integration.html).
- [FAO saturation vapour pressure](https://www.fao.org/4/x0490e/x0490e07.htm).
- [FDA water activity](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/inspection-technical-guides/water-activity-aw-foods).
- [USGS boundary shear and sediment mobility](https://pubs.usgs.gov/sir/2008/5093/section6.html).

These sources motivate the model form; they do not calibrate this island's chosen constants.

## Continuous island acoustics

`audio.js` reads the world at five snapshots per second; `render/sound-worklet.js` renders
stereo pressure continuously on the audio thread using `render/sound-field.js`. No sample clips,
repeating noise buffers, display-frame random chances, music or invented wildlife calls remain.
An audio-only seeded xorshift generator supplies unresolved turbulent excitation. It never
reads or advances `W.rng`, supplies resources, alters an animal or writes a checkpoint.
For identical seed, sample rate, listener/state input sequence and audio sample count the
PCM is repeatable, including when audio blocks or display refresh rates differ. Different
device sample rates/filter implementations need not yield bit-identical sound. Opening at
different times cannot recover historical acoustic microstructure from minute-level saves.

`render/sound-state.js` derives source strengths from existing conditions:

- Coupled surf reads actual ocean breaking watts, source distance and saved wave action.
  Its wash uses the same solved phase and display clock as the renderer, with three
  periods (6, 10 and 16 seconds) and eight directions. Procedural acoustic noise and
  quiet compression remain approximations; individual breaking-wave acoustics are
  unresolved. The former hydrology wave scale remains only for uncoupled compatibility.
- Wind excitation scales with `rho*U³/2`; leaf rustle also needs actual remaining foliage.
  Gusts read existing weather. Acoustic conversion efficiencies and texture filters are
  assumed; this is not a computational aeroacoustic solver or species-specific leaf mechanics.
- Rain uses the same liquid fraction as the surface simulation. Impact kinetic power is
  `rain_m_per_second * area * rho * v²/2`, with an assumed 6 m/s drop speed. Snow does not
  make liquid-rain hiss. Installed supported panels supply their actual projected area,
  fitted fraction and condition; leaf/reed/bracken coverings have softer impact textures.
  Collapsed, removed and unpaid panels supply no elevated roof rain. Sheltered listeners
  use the rotated floor footprint and installed enclosure for softer outdoor transmission.
- Stream excitation needs actual discharge (`hydro.flow` m³/min converted to m³/s) and
  the nearest segment's downhill head, with available gravitational power `rho*g*Q*head`.
  A small bubble population has Minnaert resonance `f=sqrt(3*gamma*P/rho)/(2*pi*r)` with
  assumed 2.5–8 mm radii. Bubble counts, entrainment fraction and damping remain approximations;
  no individual bubbles are inserted into the coarse conserved hydrology.
- Fires need actual lit fuel and heat output. Heat, banking and log moisture set the
  combustion texture and small softened fracture impulses. Individual wood cells and
  combustion acoustics are unresolved. No fire sound is created by merely selecting a task.
- Horns are rendered only for an existing ship's current saved `horn` signal, deduplicated
  by ship ID and event minute. Pressure attenuates over the actual kilometre-scale distance;
  old signals do not play when reopening. No extra horns, bird songs or owl calls are scheduled.

Compact-source pressure uses `radius/sqrt(radius²+distance²)` in metres; the extended
shore uses slower spreading from the nearest coastal tile. Multiple fires/panels use an
energy-weighted aggregate and stereo bearing. Geometry remains at tile/assembly resolution;
full diffraction, reflections, air absorption and measured propagation are not resolved.
The output deliberately compresses source energy into gentle listening levels with 0.8-second
parameter smoothing, softened transients, a 45 Hz highpass, a 4.2 kHz lowpass and gentle
compression. This is not calibrated sound pressure and cannot establish physical accuracy
or how loud a particular headphone will be. Volume and timbre still need human listening
judgement. The models connect sounds causally to the world; they are not fully accurate
real-world acoustic predictions.

Sound stays off until a gesture, fades on/off, suspends processing after muting or hiding
the page, and resumes the remembered preference when returning. Startup/processor errors
leave a working retry button. Only one context/worklet is used while toggling normally.
There are no downloads for audio. Browsers must support AudioWorklet in a secure context.

`node test/sound.test.js` checks source absence, rainfall SI units, pressure attenuation,
snow, finite foliage, supported roof geometry, distance, actual ship signals, read-only
production saves, stereo placement, bounded finite PCM at 44.1/48 kHz and exact DSP replay
across block partitions and repeated state updates. Release validation also renders the
actual worklet in Chromium, checks mute/resume/rapid toggle/remembered gesture behaviour,
and checks phone-sized UI plus the existing simulation suites. This does not establish
native iPhone Safari performance or subjective listening quality.

Equation references: [NOAA linear wave dispersion](https://polar.ncep.noaa.gov/waves/wavewatch/manual.v5.16.pdf)
and [experimental work on entrained-bubble sound](https://pmc.ncbi.nlm.nih.gov/articles/PMC6014985/).
Web Audio lifecycle follows the [AudioContext suspend/resume API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend).

## Connected ecology, atmosphere, senses and work

The newer physical models are specified in [SIMULATION.md](SIMULATION.md). They replace
the original weather-regime event selection, automatic daily shellfish replenishment,
logistic fish growth, free rabbit grazing and the dog's occasional unexplained food gain.
Fish and shellfish production require finite food; animal deaths and catches transfer
actual body matter. Rabbit litters debit maternal reserves and keep paid embryo mass;
nursing requires the mother in the burrow. Burrows retain exchanged heat with their own
ledger. Body mass controls the drawn size of growing rabbits.

The 8×6 regional atmosphere and 6×4 surface mesh persist their own heat and water fields.
Conservative transport, condensation, latent heat, ocean evaporation, Coriolis rotation
and pressure gradients produce weather. Atlantic temperature and geostrophic forcing
are prescribed seeded closures, not resolved global weather. Sea temperature has thermal
inertia. Local weather reaches bodies, fires, shelters, food, rainfall, rendering and
acoustic sources. Falling regional rain is a through-flux to the ground rather than
suspended cloud at the surface. Diagnostic labels such as “front” describe current fields
and do not schedule a future event.

Tomas observes trees and installed walls along sight rays, remembers flood depths,
discounts stale resource memories and hears uncertain bearings of actual animal calls.
Unknown route tiles are tentative ground; unseen water depth cannot select a cheaper
path. Actual movement rejects an impassable crossing and replans. The dog can follow a
coarse advected scent field. Its briefing describes the last dog observation instead of
revealing an unseen animal's present condition.

Work contacts record force, travel, stroke count, mechanical energy, heat and fracture
work. These drive paid workpieces, current animation frequency and soft acoustic impacts.
An axe's abrasion uses the same contact work. This is an equivalent-contact model with
empirical task work requirements, not a resolved fracture or musculoskeletal solver.
Rare bird/dog voices are deduplicated saved behavioural events, with finite energetic
cost, distance and wall attenuation. Rendering and sound remain read-only world views.
