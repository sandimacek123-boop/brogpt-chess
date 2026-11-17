# Universe Engine

A native Android laboratory for mathematics, physics, astronomy and chemistry. Every simulation runs live on the device from the equations shown in the app; nothing is pre-rendered and nothing needs a network connection.

**Install:** `release/UniverseEngine-1.0.0.apk` (about 2 MB). Android 8.0 or newer, targets Android 15 (API 35). Allow installs from your browser or file manager, then open the file.

## What's inside: 31 laboratories

**Mathematics (11)**
- Function grapher: type any formula, then pan, zoom and probe it. Shows the derivative, the integral between draggable limits, roots, parameters a/b/c and time t.
- Surface explorer: z = f(x, y) in 3D, with a tangent plane and gradient probe.
- Calculus lab: secants becoming tangents, five Riemann/Simpson rules, ε–δ limits and Taylor polynomials.
- Series and Fourier: partial sums of famous series, a Fourier wave builder, and draw-your-own epicycles (DFT of your drawing).
- Fractal explorer: Mandelbrot, Julia and Burning Ship sets on four threads, an orbit probe with a live Julia preview, and zoom down to the 64-bit precision limit.
- Fractal garden: Koch snowflake, Sierpinski (geometric and chaos game), fractal tree, dragon curve and Barnsley fern.
- Golden ratio: Fibonacci spiral, Vogel's sunflower model and continued fractions.
- Prime patterns: Ulam spiral, polar prime plot up to 10⁶, an animated sieve of Eratosthenes, and π(x) against Li(x).
- Geometry and trigonometry: unit circle with exact values, triangle centres and the Euler line, Lissajous curves, roses and spirographs.
- Constants: π by Monte Carlo, by Archimedes' polygons and as a digit walk (computed with Machin's formula), e by compound interest, and Euler's identity built from small rotations.
- Transformations: graph transformations, 2×2 matrices with determinant and eigenvectors, and conformal complex maps.

**Physics (9)**
- Gravity sandbox: N-body leapfrog. Includes the figure-eight orbit, Trojan points, Burrau's chaotic problem, launchable bodies and Kepler ellipses.
- Black hole: Schwarzschild light paths and a per-pixel geodesic ray tracer with a Doppler-boosted accretion disc. Also tidal forces, Hawking temperature and time dilation.
- Collisions and gases: hard-disc gas against Maxwell–Boltzmann, pressure versus the ideal gas law, and the colliding-blocks π experiment.
- Pendulums: exact large-angle period, double-pendulum chaos with twin divergence, a pendulum wave and resonance curves.
- Wave interference: a finite-difference ripple tank with slits, refraction, a parabolic mirror and paintable walls, plus a superposition view.
- Electromagnetic fields: draggable charges with traced field lines and the potential, and a Boris-pushed charge in E and B fields.
- Particle fluid: double-density relaxation with tilt-to-pour, plus water, honey and gel presets.
- Projectile motion: quadratic drag with RK4 on six worlds, and the optimal angle.
- Energy skate park: a track you reshape, with friction and live kinetic, potential and heat bars.

**Astronomy (6)**
- Solar system: real planet positions for any date from 1800 to 2050 (JPL elements), a fly-to camera, moons and light delay.
- Life of a star: a Hertzsprung–Russell diagram with evolutionary paths for 0.1–40 solar masses.
- Neutron stars and pulsars: a lighthouse model with a live pulse profile and real pulsar presets.
- Black holes up close: the ray-traced view.
- Galaxies: density-wave spiral arms and rotation curves with and without dark matter.
- Cosmic scale: 62 powers of ten, from the Planck length to the observable Universe.

**Chemistry (5)**
- Periodic table: all 118 elements, eight colour modes, and a temperature slider that melts and boils them.
- Atoms and orbitals: Bohr shells, hydrogen orbitals sampled from |ψ|², and the hydrogen emission spectrum.
- Molecules in 3D: 16 molecules built from SMILES with VSEPR geometry, bond angles, shape and dipole.
- Chemical bonding: electronegativity, the ionic/covalent/metallic continuum and the likely formula.
- Reaction kinetics: collision theory, catalysts, Arrhenius behaviour and dynamic equilibrium.

Every laboratory has an **f(x)** sheet. It lists the governing equations, explains the visuals in plain language, and states every approximation the model makes.

There are also a few things the manual does not mention. The discovery journal keeps track of them.

## Architecture

- Kotlin 2.2, Jetpack Compose (BOM 2025.06), single activity, minSdk 26, targetSdk 35.
- `core/ui`: the design system. It has glass panels, instrument controls, a TeX-subset math typesetter (STIX Two Math glyphs) and plotting helpers (`PlotView`, `Cam3` projection, `PixelField` textures).
- `core/math`: an expression compiler (closure trees) and numerics. Numerics covers Simpson integration, the Lanczos gamma function, the Kepler solver, the sieve, Machin π and the AGM elliptic integral.
- `math/`, `physics/`, `astro/`, `chem/`: one file per laboratory. The simulation cores (N-body, fluid, geodesics, reaction box, molecule builder) are plain Kotlin classes that can be tested on the JVM.
- `data/`: settings and progress are persisted with DataStore. Element data lives in `assets/elements.json`.
- Rendering is custom `Canvas` drawing. It uses painter's-algorithm 3D, per-pixel ray tracing on worker threads, and additive glow. Particle counts and resolutions scale with the Eco/Balanced/Ultra setting.

## Build and test

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:assembleRelease          # signed APK → app/build/outputs/apk/release/
./gradlew :app:testDebugUnitTest        # numerics, molecules, and screenshot smoke tests
```

`NumericsTest` checks the physics and maths cores against known results. Examples:

- π(10⁶) = 78,498.
- The first 50 digits of π.
- Kepler's equation and the elliptic integral.
- N-body energy and angular momentum conservation.
- The colliding blocks give exactly 3, 31, 314 and 3,141 collisions.
- A photon is captured just inside b = 2.598 r_s and escapes just outside it.
- Weak-field light bending, the vacuum projectile range, and Earth's J2000 position.
- Element data integrity.

`MoleculeTest` checks formulas, bond lengths and VSEPR angles. `ScreenshotTest` renders every screen of the app off-device (Robolectric native graphics) to `app/build/shots/`. `WideScreenshotTest` does the same for the tablet/landscape layout.

The APK is signed with a self-generated key in `keystore/` for personal sideloading. Generate your own key before any store release.

## Credits

- Typefaces: Space Grotesk, JetBrains Mono and STIX Two Math, all under the SIL Open Font License.
- Element data: [periodic-table-data-complete](https://www.npmjs.com/package/periodic-table-data-complete) (MIT licence, compiled from Wikipedia).
- Planetary elements: E. M. Standish, JPL, "Approximate Positions of the Planets".
- Fluid method: Clavet, Beaudoin and Poulin (2005). The density-wave galaxy picture follows Lin and Shu.
