# DIVIDE

**Install:** `release/DIVIDE-1.0.0.apk` (about 2.5 MB). Needs Android 10 or newer and targets Android 15 (API 35). Allow installs from your browser or file manager, then open the file.

> Spoilers below. Play first, read later.

<details>
<summary>What it is</summary>

A fast arcade slasher built on number theory. Numbers fall. **Swipe** through a composite number to divide it: it splits into its two most balanced factors. Prime pieces fly home as points, and composite pieces keep falling until you cut them again. **Gold numbers are prime.** Tap a prime to catch it. Slicing one is a *CLANG* and costs a shield. A composite that crosses the red line is a *BREACH* and also costs a shield.

### Modes
- **Arcade:** endless waves. A boss arrives every third wave.
- **Boss Rush:** seven bosses back to back: 360, 1024, 1729, 2310, 8128, 65536 and 720720. Each cut strips one prime factor, and the orbiting beads show what's left.
- **Daily:** everyone gets the same seed for the day.
- **Zen:** no shields, slower numbers, and factor hints.
- **Training:** a seven-step interactive tutorial.

### Mechanics
- **Chains:** one stroke through 3, 4 or 5+ numbers triggers escalating impact frames and bonus points.
- **Σ Overdrive:** catching primes fills the meter. Tap it, and for six seconds every cut shatters a number straight into all of its primes.
- **Power-ups:**
  - Sieve: every even number shatters.
  - Root: every composite splits.
  - ∞: restores a shield.
  - π: slows time.
  - φ: pulls primes in along a golden spiral.
- **Ring hint:** the ring around a composite is broken into Ω(n) arcs, one per prime factor inside.
- **Numberdex:** 35 special numbers to discover in play, each with a fact. Examples: Ramanujan's 1729, the impostor 91, the Carmichael number 561, and the perfect numbers.
- **Blades:** six cosmetic trails unlocked by milestones: Edge, Sieve Saber, Golden Ratio, Fourier, Fractal Bolt and Infinity.

### Impact frames
Big hits freeze the simulation (hit-stop) and swap whole frames into alternate renderings of the same scene:

| Style | Look |
|-------|------|
| Mono | Black void with white silhouettes |
| Ink | Manga paper with black ink and focus lines |
| Negative | The whole frame inverted |
| Red | Black silhouettes on red |

Other hit effects stack on top: screen shake, shockwave rings, speed lines, chromatic split and a white flash. On Android 13+ an AGSL shader also refracts the frame around shockwaves. A boss kill ends with a finisher that cuts the entire screen in half along your stroke.

**Reduce flashing** (asked on first launch, also in settings and the pause menu) replaces every impact frame with a soft dim. It also cuts flashes to a fraction and halves shake.

</details>

## Architecture

- Kotlin 2.2 and Jetpack Compose. One activity, portrait, immersive.
- **`game/`**
  - `NumberTheory.kt`: exact integer maths.
  - `Engine.kt`: the rules. Deterministic per seed, Android-free, unit tested.
  - `Render.kt`: the whole playfield on an `android.graphics.Canvas`, with no allocation in steady state. It renders six styles: normal, mono, ink, negative, red and soft.
  - `Distort.kt`: the optional AGSL post-process.
  - `Attract.kt`: the ghost player behind the menu.
- **`audio/`**
  - `Synth.kt` synthesises every sound effect and the three music loops (menu, battle, boss) on the device at first launch. They are cached as WAV files. The APK ships no audio.
  - `Sound.kt` plays them through SoundPool and MediaPlayer, plus predefined haptic effects.
- **`data/`**: DataStore persistence for settings, records, the Numberdex and blades.
- **`screens/`**: menu with a boot title slam, game, results, Numberdex, blades and settings. Navigation uses a diagonal slash wipe.

## Build and test

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:assembleRelease        # signed APK → app/build/outputs/apk/release/
./gradlew :app:testDebugUnitTest      # rules, synth and screenshot tests
```

- `RulesTest` covers the number theory and the slice, catch and clang rules. It also checks that a boss needs exactly Ω(n) cuts, plays a bot through Arcade to wave 3+, and completes the whole Training mode.
- `SynthTest` renders every sound and checks levels.
- `ShotsTest` renders every screen with Robolectric native graphics into `app/build/shots/`. It also pushes real touch input through the game screen, including a flick delivered as only down + up, and checks it divides a number. It also drives the renderer through forced states: every impact-frame style, a boss kill and finisher, overdrive, each blade, and game over.

The APK is signed with a self-generated key in `keystore/` for personal sideloading. Generate your own key before any store release.

Typefaces: Bungee, Chakra Petch and STIX Two Math, all under the SIL Open Font License.
