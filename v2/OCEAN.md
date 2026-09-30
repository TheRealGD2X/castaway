# Ocean model

The sea has saved water volume, salt mass, heat, momentum, wave action and marine
inventories. It advances with the same deterministic world, every ten minutes.
The drawing and sound read this state; neither changes it or consumes world RNG.
This is a reduced ocean model with declared closures, not a calibrated Atlantic
forecast or a complete three-dimensional fluid simulation.

## Domain and inventories

| Grid | Extent | Horizontal spacing | Vertical volume fractions |
| --- | --- | --- | --- |
| Offshore | 960 × 720 km, 8 × 6 cells | 120 km | 0.05, 0.15, 0.80 |
| Shelf | 120 × 120 km, 12 × 12 cells | 10 km | 0.10, 0.30, 0.60 |
| Island | 224 × 168 m, 28 × 21 cells | 8 m | 0.40, 0.30, 0.30 |

The offshore cell replaced by the shelf has zero storage. The island footprint
is removed from its shelf cell. Island cut-cell area includes only actual sea
tiles (each 2 × 2 m); high land cannot become an averaged seabed or an artificial
square patch of dry water. Nested interfaces exchange the same finite parcels
with opposite signs. Differing vertical fractions use their overlap to map
tracers without inventing a salty or hot layer.

Offshore and shelf bathymetry are generated assumptions, not survey data. The
island seabed uses generated terrain. Initial seawater is 35 g salt per kg
seawater; temperature follows the existing sea temperature, with a 1.5 °C decrease
per layer. Existing island plankton and fish stocks are migrated into these
arrays, rather than retained as a second independent population.

Each layer stores extensive salt (kg), sensible heat (J), dissolved nutrient,
oxygen and carbon (kg), phytoplankton, zooplankton, juvenile and adult fish,
detritus, sediment and entrained air (kg), and pathogen dose units. Kelp and
erodible seabed sediment are separate, stationary inventories. With reference
`rho = 1025 kg/m³`, `Cp = 3990 J/(kg K)`:

`S = 1000 * salt / (rho * layer_volume)` in g/kg,
`T = heat / (rho * Cp * layer_volume)` in °C.

Density uses the Boussinesq linear closure
`rho' = 1025 + 0.78 * (S - 35) - 0.2 * (T - 10)`.
It is not TEOS-10 seawater thermodynamics. Volume does not expand with temperature.

## Circulation and stratification

Depth-integrated momentum uses saved staggered face velocities, hydrostatic
surface pressure, air pressure, quadratic bottom drag, wind stress and
`f = 1.22e-4 /s` Coriolis rotation. Mass-weighted pair rotations conserve their
discrete kinetic energy. A reduced density-gradient acceleration couples heat
and salt to flow. All three tracer layers share this horizontal velocity: no
vertical velocity shear, nonlinear momentum advection or resolved overturning.

Backward-Euler free-surface transport solves a symmetric pressure matrix with
preconditioned conjugate gradients (80 iterations maximum; residual saved).
The positive donor-cell tracer matrix uses banded LU shared by all 39 layer/tracer
right-hand sides. Applying the resulting face parcels gives conservative
internal transport, including parent/child exchange. A donor net-storage limiter
prevents negative water while permitting large implicit through-flow. These
first-order schemes are diffusive; stability at large Courant number is not
high-resolution accuracy.

Vertical exchange is conservative implicit diffusion. Surface breaking also
stirs neighbouring wet cells with the reduced turbulent diffusivity
`K = 0.001 + 0.1 * (epsilon * L^4)^(1/3)`.
This spreads actual heat and dissolved inventories rather than clamping hot
shallows to an arbitrary temperature.

The external ocean has prescribed 35 g/kg salinity, representative temperature
and tracer concentrations. Imports and exports have explicit ledgers. Its tide
uses M2, S2, N2, K1 and O1 angular speeds of 28.9841042, 30, 28.4397295,
15.0410686 and 13.9430356 degrees/hour. Amplitudes and phase offsets remain
idealized site assumptions. Frequencies alone do not calibrate this fictional
island's tide. Local sea level is the solved field, not a second decorative tide.

## Waves, foam and the visible surface

Each cell has 24 saved action bins: periods 6, 10 and 16 seconds, each with eight
directions. The linear dispersion relation is solved numerically:

`omega² = g * k * tanh(k * depth)`;
`cp = omega / k`;
`cg = cp/2 * (1 + 2*k*depth / sinh(2*k*depth))`.

Action moves with group velocity plus the along-ray current using positive
implicit upwind sweeps. Refraction transfers action between adjacent directional
bins, at most one 45° sector per step. Nested boundaries transfer actual action
and share frequency, global phase coordinates and seeded phase offsets.
Travel time solves the upwind eikonal equation `|gradient travel| = 1/cp`.
Travel time, phase gradients and the depth used to derive them are saved, so
subsequent wetting/drying and reloads cannot silently change wave phase.

Wind stress supplies wave energy with an assumed 5% conversion efficiency.
Bottom friction, whitecapping and depth-limited breaking (`Hs <= 0.78*depth`
before the operator-split losses) dissipate action into water heat. Action left
in an exposed cell goes into a recorded seabed heat bank. The wave budget is

`E = initial + wind + boundary + nest - bottom - whitecap - breaking - current`.

`E = sum(action * omega)` and
`Hs = 4 * sqrt(E / (rho*g*area))`.
Reduced isotropic radiation stress exchanges bounded work with mean flow.
Its wave ledger closes; this does not constitute an exact global kinetic-energy
budget for the whole staggered flow solver and atmospheric forcing.

Breaking entrains finite bubbles (assumed `5e-8 kg/J`), which advect, rise at
0.1 m/s and burst with a 90-second time scale. Foam coverage uses a declared
0.005 kg/m² entrained-air reference. It is not independently animated noise.

The renderer reconstructs linear modes with
`amplitude = sqrt(2*mode_energy / (rho*g*area))`, using solved phase and normals.
It samples the visible viewport at 1–4 m spacing, filters sub-Nyquist modes and
interpolates wet neighbours. Two-metre terrain supplies shoreline detail;
sediment, plankton, foam and seabed changes affect the same water pixels. Panning
off the island reads the shelf and then offshore spectrum. Reflections, the
dog's hatch cover and marine debris use this surface. Surf sound power comes
from actual breaking watts, with distance attenuation; its wash follows the same
phase clock. Procedural noise, acoustic conversion and quiet listening compression
remain presentation approximations, not calibrated pressure recordings.

This is a linear spectral reconstruction: it does not resolve nonlinear breakers,
individual water particles, diffraction, reflected waves, capillary waves or
arbitrary frequencies between the three period bins. Freshwater rain rings and
ripples retain their older presentation model.

## Connected processes

Regional atmosphere and ocean exchange sensible heat. Actual surface temperature
feeds the next atmospheric bulk evaporation calculation. Accumulated rain and
evaporation are applied to wet ocean area; evaporation leaves salt behind and
debits latent heat. Implicit sensible/longwave heat exchange avoids unstable
temperature jumps in thin wet cells. Solar radiation and outgoing longwave cross
the external Sun/space boundary. The coarse atmosphere's representative sea cover
and the ocean wet mask differ, and evaporation is limited by available storage;
this is not an exactly closed global air/land/sea molecular budget.

Actual river discharge, salt, sediment and pathogens enter the island ocean.
Freshwater carbon and nutrient exports debit finite reservoirs. Tide flooding
and return flow transfer water and salt into surface pools. Spray also removes
finite seawater, depositing salt and sediment on shore. Salty soil reduces plant
water uptake; immersion exchanges body heat with water. Drinking carries actual
salt, boiling retains it, and an explicit reduced salt-excretion/water-cost model
affects Tomas. This is not a full kidney/electrolyte physiology model.

Surf erodes real beach soil into suspended sediment. Seabed erosion/deposition
transfers stored mineral mass and changes bed elevation. The wet cut-cell mask
remains fixed; land flooding uses the island pool model, not a moving 3D shore mesh.
Other flood-carried organic material and pathogen transfers are recorded exports,
not a resolved coastal soil chemistry cycle.

Marine production draws sunlight and actual dissolved carbon/nitrogen. Feeding
removes actual prey; respiration consumes available oxygen; mortality becomes
detritus. Declared dry-organic fractions are 0.4 carbon and 0.01 nitrogen, with
1.067 kg oxygen per kg effective organic conversion. Kelp grows from bottom-layer
nutrients/light and sheds real tissue. Juveniles mature with a 120-day scale;
adult-to-egg transfer uses a 365-day scale and spends existing adult tissue.
Air carbon/oxygen exchange has explicit equilibrium assumptions. Shellfish and
gulls consume the local spatial stock. These generic pools do not resolve species,
individual marine age cohorts or a complete elemental chemistry model.

Floating packets and loose wood follow interpolated solved current, spectral
Stokes drift and assumed windage. Swept steps prevent land tunnelling; objects
beach only on actual contact with exposed terrain. Wood leaving the island
continues as a marine packet. Tracking extends 60 km from the island; leaving
that window is an explicit mass export. The ocean continues beyond it, but there
is no infinite object-tracking list or forced dog/debris arrival.

## Persistence and checks

All evolving fields, face velocities, phases, ledgers and their compensated-sum
remainders are saved. Loading older checkpoints declares new ocean initial
conditions at the checkpoint time; it does not invent historical ocean weather.
Tomas's cached existing structures are reconnected by id on load, including after
his death. Rendering, inspection and audio control are read-only.

Run `node v2/test/ocean.test.js` for still-water balance, tracer/nest conservation,
dispersion limits, group/phase propagation and time-step comparison, wave energy,
marine carbon/nitrogen, salt transport/collection, swept drift, ten-day uneven-bed
stability, surf mixing, phase persistence, planner-reference replay and offshore
rendering. `node v2/test/ocean-audit.js 365` runs daily positivity/finite-field,
water/salt/heat/pathogen ledgers, wave budgets, atmospheric water and final-day
exact checkpoint replay through an annual trajectory.

Release validation also uses the existing regression suite, five-day living-Tomas
replay, long coupled trajectories, byte-restored production advance, phone views
at 430 × 932 @3x, actual audio-worklet output and Node/browser save comparison.
The expanded model currently costs seconds per simulated day on the verification
machine; the original 0.5-second target is not met. Catch-up yields between small
chunks so the page can remain responsive. Desktop phone emulation does not
establish native iPhone Safari performance or human listening quality.

Validation on 30 September 2026 passed the 19 short regression files, the
five-day life test (alive and exact replay), a 60-day coupled replay, a 365-day
budget/positivity/final-day replay audit and a separate 30-day post-death replay.
The annual trajectory's sampled wet-cell temperatures spanned 3.49–23.47 °C;
its maximum significant wave height was 11.36 m offshore. Tomas died from
starvation in that trajectory: stability is not a survival guarantee. The last
wood-export change was covered by the subsequent short suite, five-day life
replay and 30-day audit; the annual run preceded that small transfer fix.
Fresh day-three Node and browser saves matched byte-for-byte. Phone daylight,
night/fog, motion, zoom, ocean inspection and actual worklet/mute/failure recovery
checks passed. Production advancement loaded successfully, with checkpoint and
brief restored byte-for-byte. Measured runs were roughly 3–10 seconds per day
depending on living-planner workload and concurrent checks.

## References and scope

- [SWAN action balance](https://swanmodel.sourceforge.io/online_doc/swantech/node5.html)
  motivates spectral transport; this implementation is not SWAN or its full physics.
- [NEMO ocean engines](https://nemo-ocean.eu/framework/components/engines/) and
  [ROMS](https://github.com/myroms/roms) provide context for processes and numerical
  choices, not validation of this much smaller solver.
- [NOAA harmonic constituents](https://tidesandcurrents.noaa.gov/about_harmonic_constituents)
  and [constituent speeds](https://tidesandcurrents.noaa.gov/harcon.html?id=8720587)
  support the astronomical frequencies, not the fictional site's amplitudes.
- [NOAA seawater salinity](https://oceanservice.noaa.gov/facts/whysalty.html)
  supports the 35 g/kg reference initial condition.

Numerical consistency is checked within explicit subsystem boundaries. No test
claims measured Atlantic accuracy, exact whole-world C/N/energy closure or a
guarantee of Tomas's survival. His future still follows the simulation.
