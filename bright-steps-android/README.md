# Bright Steps 🌟

A calm, Brilliant-style math app for kids with autism, ADHD and other learning differences.
Android, Kotlin + Jetpack Compose, works fully offline.

## What's inside

7 topics, 20 short lessons (4–7 steps each):
Numbers · Adding & Taking Away · Times & Sharing · Fractions · **Algebra** (mystery box → x → two-step equations → plugging in) · Shapes (perimeter, area) · Patterns & Logic

## Built for focus and calm

- One thing per screen, short lessons, progress bar at the top
- No timers, no sounds, no flashing, no lives — unlimited tries
- Wrong answers get a gentle amber "try again" + a hint (never alarm red); after 3 tries it shows the answer
- 🔊 "Read it to me" button on every step (Android text-to-speech)
- 🌿 Break button everywhere → breathing circle; the lesson waits where you left it
- Big tap targets, a big number pad, literal and simple wording
- Follows the phone's text size, dark mode and "remove animations" settings
- Stars and per-topic progress are saved on the device

## Install on a phone

Download `BrightSteps.apk` to the phone, open it, and allow "install unknown apps" when asked.

## Build it yourself

Open this folder in Android Studio and press Run, or:

```
./gradlew test assembleDebug   # APK → app/build/outputs/apk/debug/app-debug.apk
```

Lessons live in `app/src/main/java/com/brightsteps/app/Content.kt` — add a `Learn`, `Choice` or `NumberInput` step to add content. `ContentTest` checks every question is answerable.
