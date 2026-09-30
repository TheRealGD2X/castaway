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
