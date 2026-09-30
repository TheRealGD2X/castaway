# Connected physical models

The island integrates one simulated minute per step. Runtime simulation uses seeded
randomness and `core/dmath.js`; it does not use the browser clock or browser transcendental
math. Save/load includes all evolving physical fields, behavioural events and accounting
state. Rendering and acoustic presentation interpolate this state without advancing it.

These are **reduced physical models**, not a claim of complete real-world accuracy.
Dimensional equations, finite resources, conservation, convergence and deterministic
replay are testable. Species parameters, atmospheric closures, spatial resolution and
acoustic conversion still require calibration against measurements. A visually plausible
animation or a stable year-long run does not establish that calibration.

## Food web

`sim/foodweb.js` stores grass, freshwater prey, plankton, coastal fish and detritus in kg
of dry organic matter. The existing shellfish beds retain live kg in the shell; assumed
organic fractions are 0.075 for mussels and 0.06 for cockles. Freshwater fish remain
250 g / 330 kcal biomass equivalents. Generic organic matter has 4000 kcal/kg; this
is an effective mixed-food energy density, not a separate lipid/protein chemistry model.

Sunlight supplies primary production. Grass converts 1.2% of incident energy using
18 MJ/kg dry production; aquatic production uses 0.6%. Actual occupied area, temperature,
stock density, soil water and a nutrient inventory limit production. Grass transpiration
debits soil water at an assumed 0.5 m³/kg production. Photosynthesis is an atmospheric
carbon input; maintenance respiration is an explicit output. Grazing removes actual grass.
Initial grass and aquatic populations are declared seed-dependent initial conditions.

Submerged bivalves consume finite plankton. Their maximum ration at the thermal reference
is about 3.8% of dry tissue per day for mussels; assumed conversion partitions are 35%
growth, 45% detritus and 20% respiration. Packing limits growth; unused potential growth
is respired, not silently discarded. Gulls consume actual exposed shellfish or coastal
fish. Coastal fish consume plankton, with 20% biomass conversion, 60% detritus and 20%
respiration, plus maintenance. Freshwater cohorts consume finite prey; oxygen, temperature
and depth reduce feeding, and poor habitat transfers mortality to detritus. Growth cannot
create fish when prey is absent. Human catches and traps debit the same cohort stocks.

Marine stocks now live in the nested ocean's transported spatial arrays, including
plankton, zooplankton, juvenile/adult fish and detritus. The former 12-hour aggregate
exchange applies only to old uncoupled worlds; coupled worlds exchange finite parcels
through solved currents. External concentrations remain declared boundary assumptions.
See [the ocean model](OCEAN.md) for resolution, C/N/O2 conversions and exact budget
boundaries. Local shellfish and gulls debit these actual spatial stocks.
Animal carcasses, undigested food and senescence become finite waste. Nitrogen is an
effective fixed 1% of dry matter; this is not a complete elemental cycle or food-composition
model. Soil and aquatic nutrient destinations are explicitly separate.

The web's dry-mass check is

`stocks + respiration + harvest + export + grazing - assimilation - import = initial`.

Adding individual animal dry bodies and animal respiration closes the same transfer
boundary during digestion, feeding and carcass tests. Human inventory is outside this
web boundary: harvest is a transfer to camp. Older plant, camp, mineral and human-body
ledgers retain their own boundaries. No single test claims a closed molecular budget for
the entire atmosphere, ocean, vegetation, human chemistry, shells and ash.

## Individual animals

`sim/animal-body.js` stores structural tissue, usable reserves, gut matter, body mass,
core temperature, water deficit, age, injury and cumulative intake/metabolism. Rabbit,
gull and dog reference masses are 1.5, 0.9 and 18 kg. Exponential digestion uses respective
120, 70 and 180 minute time constants; undigested matter returns to the web. Juvenile
rabbit growth uses digested matter, with no automatic body-mass increment.

Mammalian baseline metabolism is `70 m^0.75 kcal/day`. The avian coefficient is 115,
using a deterministic fourth-root approximation to the nearby measured avian exponent.
Sleeping/roosting, walking, running and flying have different activity costs; actual
displacement adds an assumed 3.3 J/(kg m). Energy demand consumes reserves and then
tissue. Heat capacity is `3500 m J/K`. Conductance scales with the square root of mass,
wetness and exposed wind; species coat/feather coefficients differ. Core deficit adds
shivering demand and core excess adds effective cooling. Heat from a fire is a bounded
share of its actual radiative output. A curled dog's contact heat is debited from its
body and supplied to Tomas, rather than creating a fixed warmth bonus.

Burrows have an effective 3036 J/K contents/air capacity and 0.3 W/K exchange with the
ground. Actual animal heat loss enters that reservoir; the ground is an explicit thermal
boundary. Its backward-Euler exchange closes
`capacity * temperature_K = initial_J + animal_J + ground_J`.
This shared temperature matters especially to young rabbits; it does not inject an
unpaid warm nest. Ground temperature is a reduced diffusion relaxation, not a 3D soil solver.

Rabbits graze available grass and draw its assumed moisture from finite soil water;
thirst triggers a search for visible nearby water and drinking from its actual reservoir.
Small remaining human food portions remain edible instead of imposing an arbitrary
100 kcal meal threshold. Gulls obtain water from food or sea water using an
effective seabird salt-excretion assumption. Dogs drink actual freshwater or collected
surface water. Water deficits and thirst are reduced hydration variables, not renal,
electrolyte or full wet-body mass models. Mortality follows depleted tissue, extreme
core temperature or water deficit. Injury currently includes tissue deficit and slow
repair; detailed trauma, infection, organ systems and senescence are unresolved.

Rabbit reproduction requires an adult mate, adequate maternal reserves, core temperature,
hydration, breeding season and room in the warren. The seeded conception hazard expresses
unresolved individual fertility. Three embryos debit 0.03 kg maternal reserves and retain
that mass through an assumed 31-day gestation. Birth transfers embryo mass to the kits;
it creates no new organic matter. Milk transfers finite maternal reserves and hydration
only while the mother is physically in the same burrow. Mature gulls are an initial
cohort and do not yet reproduce; the lone ship's dog has no mate. Thus reproduction is
explicit for rabbits, not a complete reproductive model for every species.

Behaviour remains a simplified utility system. Threats use sight transmission; sleeping
animals/people have a smaller disturbance range. Empty beds are not useful foraging targets,
and severe hunger prioritises actual food over indefinitely following a scent or begging.
There are no artificial survival guarantees. The hatch cover may drift away from the
island: landing is a consequence of wind/tide, not a scheduled rescue for the dog.

## Numerical atmosphere and local water

`sim/atmosphere.js` uses 8×6 regional cells with 120 km spacing. A 400 m equivalent
hydrostatic layer carries height, velocity, heat, vapour and cloud, with a prescribed
3000 m moisture/thermal column. Pressure-gradient acceleration uses `g * gradient(height)`;
midpoint Coriolis rotation uses `f = 1.22e-4 s^-1`. Positive donor-cell face fluxes transport
the conserved fields on the regional periodic mesh, with CFL substeps when necessary.

Unresolved Atlantic temperature and geostrophic pressure forcing are seeded continuous
correlated fields, with 12-hour and 30-hour correlation scales. Six-hour momentum and
three-hour thermal exchanges supply explicit external forcing. They are **empirical
boundary closures**, not a resolved global atmosphere or numerical weather forecast.
Solar geometry and seasonal forcing use the existing astronomical/climate functions.
The coupled ocean's surface heat inventory now supplies sea temperature. The older
45-day prescribed response remains only for uncoupled compatibility. Bulk sea-cover
and wet-mask differences are documented in [OCEAN.md](OCEAN.md); this is not a fully
closed global atmosphere/ocean heat budget. Diagnostic “high”, “ridge”, “low” and “front” labels describe current cloud/rain
and never schedule rain or a gale. Real weather is neither downloaded nor replayed.

Ocean evaporation uses the bulk form
`E = CE * wind * (saturated_surface_vapour_density - air_vapour_density)`,
with assumed `CE = 0.0013`. Tetens saturation includes the ideal-gas Kelvin denominator;
20 °C saturation density is about 0.0173 kg/m³. Supersaturation condenses vapour into cloud;
undersaturation evaporates cloud. The phase change uses `2.45 MJ/kg` latent heat and changes
the stored sensible heat. Cloud precipitation removes actual cloud water. External
evaporation supplies both water and latent enthalpy; heat/water ledgers account for each.

A 6×4 mesh over the island models the 30 m surface layer. Actual sea/land/tree cover
reduces local wind, while surface sensible heat changes local temperature. Open boundary
fluxes carry regional air mass, heat and moisture. Backward-Euler donor-cell transport
uses an exact upwind sweep when velocity signs agree, and CFL transport otherwise. It is
positive and conservative at large advective Courant numbers, with first-order numerical
diffusion. Compensated boundary heat totals reduce long-run cancellation error. This
coarse mesh does not resolve eddies, rain-drop trajectories or individual tree wakes.

Regional falling rain crosses the surface layer as a through-flux; it is not cloud blown
away before landing. Local condensation/drizzle and rain/snow partition supply accumulated
cell precipitation to the ten-minute hydrology update. Bodies, fires, shelter air, food
lots, camera weather and acoustic sources read their local cell. Ground/plant evaporation
returns actual lost water to the atmospheric moisture boundary. Shelter moisture continues
to use its separately documented open boundary, not a second drinking-water source.

Atmospheric checks close water and sensible-plus-latent heat budgets. Surface water retains
the existing finite soil, groundwater, snow/ice, puddle, lake and stream reservoirs. Full
hollows choose the lowest actual neighbouring free surface; transfers are bounded by
available water and positive head. Channel overflow reaches actual banks. Rendered standing
water uses pool depth. Crossings at least 0.5 m deep are rejected by walking; that depth
threshold is a declared behavioural safety assumption, not a locomotion-fluid solver.

The regional box omits vertical atmospheric structure, global fronts, measured terrain
uplift and fully advected momentum. Climate comparisons remain necessary: Stornoway's
1991–2020 mean annual rain is 1235.52 mm and mean wind is 11.90 knots. This implementation
can differ substantially; it must not be called a calibrated Hebridean climate. Long-run
audits report rain, wind, temperatures and population/survival outcomes as observations,
not pass conditions chosen to force a particular story.

The initial three-seed release audit produced approximately 614–728 mm annual rain,
with peak wind of 20.2–22.7 m/s. All three autonomous runs lost Tomas to starvation
and ended without rabbits; 7–8 gulls remained. The primary-seed repeat after the drinking
state fix retained those adverse outcomes. These runs start fresh and do not receive
later scheduled deeper-mind inputs. They expose unresolved ecological productivity,
foraging and winter survival limits, rather than validating a sustainable island.

## Senses and memory

`sim/senses.js` traces sight through actual foliage and installed vertical assembly panels.
Walls use their rotated endpoints, height, fitted fraction and condition; unsupported or
removed panels do not become invisible perfect barriers. Partial foliage/walls attenuate
hearing too. Transmission is a reduced ray model; full diffraction, terrain horizons,
frequency-dependent scattering and eyes/ears are unresolved.

Resource memories retain observed values and timestamps. Confidence decays exponentially:
two hours for mobile animals, two days for changing quantities and thirty days for static
objects. Distance/cost discounts uncertainty; forgetting does not change the real resource.
Tomas refreshes quantities only when seen. Unknown path tiles use tentative ground cost;
known terrain does not reveal unseen water depth. A failed physical crossing records the
encountered flood and causes replanning instead of allowing remote work at the target.

Rabbit scent emits a finite trace into a 6×4 near-ground field. Wind transports and exports
it; an assumed 180-minute decay removes it. The 0.5 m wind approximation is 35% of the 10 m
wind, from a rough-surface logarithmic profile. Dogs follow a local concentration gradient,
not a hidden rabbit position supplied by this field. Existing ground trails remain a
separate observation. Concentration thresholds and source rates are assumptions, and the
mesh cannot reproduce a dog's true olfactory resolution.

Actual behaviour can emit a saved short bird/dog call with a finite energetic cost.
Tomas receives a masked, attenuated bearing in an eight-direction observation, not the
caller's ID or exact coordinates. Recent noises influence exploratory direction when
urgent needs allow it. The camera hears the same current event with distance and wall
attenuation. Existing animal utility/search heuristics remain coarse, and do not model
complete cognition or all sensory inference.

## Physical contacts and presentation

`sim/contact.js` uses force in N, travel in m, strokes and mechanical work in J. Each
contact satisfies `energy = force * travel * strokes = heat + fracture_work`. Hand/tool
capacity and available metabolic power bound delivery. An assumed 22% mechanical efficiency
caps useful power above resting metabolism. Actual stroke frequency drives the animation
period and quiet impact synthesis. Axe abrasion uses the same load-times-travel work.
Joint contacts retain force, effective deflection and heat. Paid craft/repair/build work
keeps accumulated progress and installed/consumed material through interruptions.

Profiles for weaving, carving, building and digging are equivalent strokes. Their task
requirements and material/skill adjustments remain empirical. They do not resolve a hand's
full trajectory, crack propagation, tendon loads or contact acoustics. Visual sprites and
interpolation represent the minute-scale physical process; the renderer is not a second
independent physics engine. Growing animals draw smaller from their actual mass. The audio
conversion deliberately gives gentle listening levels; it is not measured pressure at a
headphone. The previous acoustic specification in `DESIGN.md` remains applicable.

## Verification

Run from the repository root:

```sh
node v2/test/coupled.test.js
node v2/test/life.test.js 5
node v2/test/sim.test.js 60
node v2/test/year.test.js
```

The coupled suite checks independent saturation units, periodic and open-boundary transport
conservation/positivity and time-step convergence, atmosphere/local heat and water balances,
dry-food and animal transfer budgets, birth mass, maternal presence, burrow heat, occlusion,
uncertain observations, unseen route invariance, physical crossing failure, contact energy,
read-only acoustic state and finite DSP. It migrates the production checkpoint and proves
exact save/load replay. The existing body, build, construction, designer, exposure, fire,
generation, health, homes, inspection, life-upgrades, processes, sound, tools, water,
waterworks and workpose suites remain release checks.

The year audit runs three seeds, checks daily finite/nonnegative stocks and atmospheric
water balances, then repeats the final day from a checkpoint byte-for-byte. It prints
survival, populations and causes rather than hiding adverse outcomes. Five-day survival
is checked separately. Browser QA uses the actual worklet and 430×932 @3x phone layout,
including rendering, sound controls and recovery; native iPhone Safari and human listening
quality still need device/listening validation.

Before publishing, `advance.js` is exercised using the existing production checkpoint.
Its checkpoint/brief outputs are restored exactly after that trial; a validation run must
not rewrite production history. The scheduled routine subsequently advances the new
models from the preserved checkpoint. Missing new fields migrate from declared defaults,
not invented historical measurements; subsequent checkpoints preserve their exact state.

## Primary references

- [NOAA bulk ocean-atmosphere heat and moisture flux forms](https://www.pmel.noaa.gov/people/cronin/encycl/ms0157.pdf).
- [Met Office Stornoway long-term climate averages](https://www.metoffice.gov.uk/research/climate/maps-and-data/location-specific-long-term-averages/gsvg3nc).
- [FAO bivalve feeding and growth](https://www.fao.org/4/y5720e/y5720e07.htm).
- [FAO dry-tissue bivalve food rations](https://www.fao.org/4/y5720e/y5720e09.htm).
- [FAO rabbit nutrition, feed and water intake](https://www.fao.org/4/x5082e/X5082E05.htm).
- [Herring gull behaviour and metabolic-cost estimates](https://link.springer.com/article/10.1186/s40462-019-0159-3).
- [Measured avian thermal conductance and thermoregulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC6517701/).

The references support model forms and comparisons. They do not validate all chosen
constants, and this implementation does not reproduce each referenced research model.
