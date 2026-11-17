package dev.divide.game.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.divide.game.AppState
import dev.divide.game.data.*
import dev.divide.game.game.*
import dev.divide.game.ui.*
import kotlin.math.hypot
import kotlin.math.max
import kotlin.random.Random

/** Bridges engine events to sound, haptics and the Numberdex. */
class Hooks(private val app: AppState) : GameEvents {
    lateinit var engine: Engine
    val found = ArrayList<Long>()
    var biggest = 0L
    private var harvestRun = 0
    private var lastHarvest = 0L

    override fun slice(value: Long, multi: Int) {
        biggest = max(biggest, value)
        app.sound.play(if (multi >= 2) "slice_hi" else if (value > 99) "slice_lo" else "slice", 0.85f, 0.92f + Random.nextFloat() * 0.16f)
        app.sound.buzz(0)
    }
    override fun clang() { app.sound.play("clang"); app.sound.buzz(2) }
    override fun catchPrime(p: Long) { app.sound.bell(engine.combo); app.sound.buzz(1) }
    override fun harvest(p: Long) {
        val now = System.currentTimeMillis()
        harvestRun = if (now - lastHarvest < 400) harvestRun + 1 else 0
        lastHarvest = now
        app.sound.play("tick", 0.45f, 1f + minOf(harvestRun, 10) * 0.08f)
    }
    override fun multiCut(count: Int) {
        if (count >= 5) app.sound.play("impact_big") else if (count >= 3) app.sound.play("impact", 0.9f)
        app.sound.buzz(if (count >= 3) 2 else 1)
    }
    override fun shieldLost() { app.sound.play("breach"); app.sound.buzz(3) }
    override fun overdrive() { app.sound.play("riser"); app.sound.play("impact_big"); app.sound.buzz(3) }
    override fun power(p: Power) { app.sound.play("power"); app.sound.buzz(1) }
    override fun bossHit(remaining: Int) { app.sound.play("impact", 1f, 1.1f); app.sound.buzz(2) }
    override fun bossDown() { app.sound.play("boss_down"); app.sound.play("impact_big"); app.sound.buzz(3); app.sound.music(dev.divide.game.audio.Sound.Music.Battle) }
    override fun bossArrive() { app.sound.play("riser", 0.8f); app.sound.music(dev.divide.game.audio.Sound.Music.Boss); app.sound.buzz(2) }
    override fun waveStart(wave: Int) {
        val bossWave = engine.mode == Mode.BossRush || (engine.mode != Mode.Zen && wave % 3 == 0)
        if (!bossWave) app.sound.music(if (engine.mode == Mode.Zen) dev.divide.game.audio.Sound.Music.Menu else dev.divide.game.audio.Sound.Music.Battle)
    }
    override fun gameOver() { app.sound.play("gameover"); app.sound.music(dev.divide.game.audio.Sound.Music.None); app.sound.buzz(3) }
    override fun encountered(value: Long) {
        val entry = CODEX_BY_N[value] ?: return
        val key = value.toString()
        if (key in app.save.codex) return
        app.update { it.copy(codex = it.codex + key) }
        found += value
        engine.banners += Banner("NUMBERDEX +1", "$value · ${entry.title}", 0xFFB14CFF.toInt(), 1.9f, false)
        app.sound.play("power", 0.5f, 1.25f)
    }
}

class RunResult(
    val mode: Mode, val score: Long, val best: Long, val newBest: Boolean,
    val stats: List<Pair<String, String>>, val newBlades: List<Blade>, val newCodex: List<Entry>,
    val biggest: Long, val fact: String,
)

/** The running engine, exposed for instrumentation-style tests. */
object GameDebug { var engine: Engine? = null; var look: Look? = null }

private class Ptr(val swipe: Int, var x: Float, var y: Float, var ms: Long, val trail: Trail) { var speed = 0f }

fun divisorCount(n: Long): Int = NT.factorize(n).groupingBy { it }.eachCount().values.fold(1) { a, k -> a * (k + 1) }

private fun commit(app: AppState, e: Engine, hooks: Hooks, today: String): RunResult {
    val before = app.save
    val mode = e.mode
    val prevBest = when (mode) { Mode.Daily -> if (before.dailyKey == today) before.dailyBest else 0L; Mode.Tutorial -> 0L; else -> before.best[mode.name] ?: 0L }
    val newBest = mode != Mode.Tutorial && e.score > prevBest && e.score > 0
    var s = before.copy(
        best = if (newBest && mode != Mode.Daily) before.best + (mode.name to e.score) else before.best,
        dailyKey = if (mode == Mode.Daily) today else before.dailyKey,
        dailyBest = if (mode == Mode.Daily) max(prevBest, e.score) else before.dailyBest,
        primesCaught = before.primesCaught + e.caught,
        totalSliced = before.totalSliced + e.sliced,
        bestCombo = max(before.bestCombo, e.bestCombo),
        bestWave = if (mode == Mode.Arcade || mode == Mode.Daily) max(before.bestWave, e.wave) else before.bestWave,
        games = before.games + 1,
        clangs = before.clangs + e.clangs,
        bosses = before.bosses + e.bossesDefeated.map { it.toString() },
        tutorialDone = before.tutorialDone || (mode == Mode.Tutorial && e.tutDone),
    )
    val unlocked = BLADES.filter { it.id !in s.blades && bladeUnlocked(it.id, s) }
    s = s.copy(blades = s.blades + unlocked.map { it.id })
    app.update { s }

    val stats = buildList {
        if (mode != Mode.Tutorial && mode != Mode.Zen) add("WAVE" to "${e.wave}")
        add("DIVIDED" to "${e.sliced}")
        add("PRIMES CAUGHT" to "${e.caught}")
        add("BEST COMBO" to "×${e.bestCombo}")
        add("LONGEST CHAIN" to "${e.maxMulti}")
        add("CLANGS" to "${e.clangs}")
        if (e.bossesDefeated.isNotEmpty() || mode == Mode.BossRush) add("BOSSES BROKEN" to "${e.bossesDefeated.size}")
        add("BREACHES" to "${e.breaches}")
    }
    val big = hooks.biggest
    val fact = when {
        big <= 0 -> "Divide something next time — every composite hides its primes."
        CODEX_BY_N[big] != null -> CODEX_BY_N[big]!!.fact
        else -> "$big = ${NT.factorString(big)} has ${divisorCount(big)} divisors."
    }
    return RunResult(mode, e.score, max(prevBest, e.score), newBest, stats, unlocked, hooks.found.mapNotNull { CODEX_BY_N[it] }, big, fact)
}

@Composable
fun GameScreen(app: AppState, mode: Mode, onRetry: () -> Unit, onExit: () -> Unit, onPlay: (Mode) -> Unit) {
    val density = LocalDensity.current
    val save = app.save
    val today = remember { app.today() }
    val hooks = remember { Hooks(app) }
    val engine = remember {
        val seed = if (mode == Mode.Daily) today.replace("-", "").toLong() else System.nanoTime()
        Engine(mode, seed, 2000f, hooks).also { e ->
            hooks.engine = e
            val bossValues = BOSSES.map { it.value }.toSet()
            val pool = CODEX.map { it.n }.filter { it !in bossValues }
            e.specials = pool.filter { it.toString() !in save.codex }.ifEmpty { pool }
        }
    }
    val look = remember { Look() }
    GameDebug.engine = engine; GameDebug.look = look
    look.blade = save.blade; look.reduceFlash = save.reduceFlash; look.hints = save.hints
    val trails = remember { ArrayList<Trail>() }
    look.trails = trails
    var frame by remember { mutableIntStateOf(0) }
    var paused by remember { mutableStateOf(false) }
    var started by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<RunResult?>(null) }
    var tutText by remember { mutableStateOf("") }
    var boxSize by remember { mutableStateOf(IntSize.Zero) }
    val t0 = remember { System.nanoTime() }
    fun clock() = (System.nanoTime() - t0) / 1e9f
    val startSignal = remember { app.pauseSignal }

    val topPx = WindowInsets.safeDrawing.getTop(density).toFloat()
    val botPx = WindowInsets.safeDrawing.getBottom(density).toFloat()
    LaunchedEffect(boxSize, topPx, botPx) {
        if (boxSize.width == 0) return@LaunchedEffect
        look.scale = boxSize.width / 1000f
        look.topInset = topPx
        engine.height = (boxSize.height - topPx - botPx) / look.scale
        if (!started) { engine.begin(); started = true }
    }
    LaunchedEffect(app.pauseSignal) { if (app.pauseSignal != startSignal && result == null) paused = true }
    BackHandler { if (result != null) onExit() else paused = !paused }

    LaunchedEffect(engine) {
        var last = 0L
        var hold = 0f
        while (true) {
            withFrameNanos { now ->
                val dt = if (last == 0L) 0f else ((now - last) / 1e9f).coerceAtMost(0.05f)
                last = now
                if (!started || paused) return@withFrameNanos
                engine.step(dt)
                look.time = clock(); look.dt = dt
                val q = engine.fx.frames
                if (q.isNotEmpty()) {
                    look.style = q.first(); hold += dt
                    if (hold >= 0.042f) { q.removeFirst(); hold = 0f }
                } else { look.style = Style.NORMAL; hold = 0f }
                trails.removeAll { it.released && look.time - it.lastT > 0.25f }
                if (mode == Mode.Tutorial && engine.tutText != tutText) tutText = engine.tutText
                if (result == null && ((engine.over && engine.overT > 1.7f) || (mode == Mode.Tutorial && engine.tutDone))) {
                    result = commit(app, engine, hooks, today)
                    if (mode == Mode.Tutorial) app.sound.play("boss_down", 0.8f)
                }
                frame++
            }
        }
    }

    Box(Modifier.fillMaxSize().background(DV.Ink).onSizeChanged { boxSize = it }) {
        Canvas(
            Modifier.fillMaxSize()
                .systemGestureExclusion()
                .graphicsLayer { frame; renderEffect = Distort.effect(engine, look) }
                .pointerInput(engine) {
                    val ptrs = HashMap<Long, Ptr>()
                    var nextSwipe = 1
                    var lastWhoosh = 0L
                    // one stroke segment: speed from the pointer's own timestamps, cut along the whole segment
                    fun segment(p: Ptr, wx: Float, wy: Float, ms: Long) {
                        val d = hypot(wx - p.x, wy - p.y)
                        if (d < 0.5f) return
                        val dtMs = (ms - p.ms).coerceAtLeast(4L)
                        val inst = d / (dtMs / 1000f)
                        p.speed = if (p.speed == 0f) inst else p.speed * 0.35f + inst * 0.65f
                        if (!paused && result == null) engine.swipe(p.x, p.y, wx, wy, p.swipe, p.speed)
                        val cutting = p.speed >= Engine.CUT_SPEED
                        if (cutting && !p.trail.cutting && ms - lastWhoosh > 140) { app.sound.play("slice_lo", 0.3f, 1.4f); lastWhoosh = ms }
                        p.trail.cutting = cutting
                        p.trail.add(wx, wy, clock())
                        p.x = wx; p.y = wy; p.ms = ms
                    }
                    awaitPointerEventScope {
                        while (true) {
                            val ev = awaitPointerEvent()
                            for (ch in ev.changes) {
                                val id = ch.id.value
                                val wx = ch.position.x / look.scale
                                val wy = (ch.position.y - look.topInset) / look.scale
                                if (ch.changedToDownIgnoreConsumed()) {
                                    if (paused || result != null || !started) continue
                                    val tr = Trail(nextSwipe).also { it.add(wx, wy, clock()); trails += it }
                                    ptrs[id] = Ptr(nextSwipe++, wx, wy, ch.uptimeMillis, tr)
                                    if (wy > engine.groundY + 8f) engine.activateOverdrive() else engine.tap(wx, wy)
                                } else if (ch.pressed) {
                                    val p = ptrs[id] ?: continue
                                    // replay batched samples so fast flicks cut along their real path
                                    for (h in ch.historical) segment(p, h.position.x / look.scale, (h.position.y - look.topInset) / look.scale, h.uptimeMillis)
                                    segment(p, wx, wy, ch.uptimeMillis)
                                } else {
                                    // the stretch between the last move and lift-off still cuts
                                    ptrs.remove(id)?.let { p -> segment(p, wx, wy, ch.uptimeMillis); engine.endSwipe(p.swipe); p.trail.released = true }
                                }
                                ch.consume()
                            }
                        }
                    }
                }
        ) {
            frame
            drawIntoCanvas { app.renderer.draw(it.nativeCanvas, engine, size.width, size.height, look) }
        }

        // pause button
        if (result == null) Box(
            Modifier.align(Alignment.TopEnd).windowInsetsPadding(WindowInsets.safeDrawing).padding(top = 10.dp, end = 12.dp).size(48.dp)
                .press { paused = true }.cutPanel(DV.Faint, cut = 9f),
            contentAlignment = Alignment.Center,
        ) { Txt("II", size = 18.sp, font = DV.Display, color = DV.Dim) }

        if (mode == Mode.Tutorial && tutText.isNotEmpty() && result == null && boxSize.width > 0) {
            val sc = boxSize.width / 1000f
            val topDp = with(density) { (topPx + 300f * sc).toDp() }
            Box(Modifier.align(Alignment.TopCenter).padding(top = topDp, start = 20.dp, end = 20.dp).fillMaxWidth().cutPanel(DV.Cyan, glow = true).padding(14.dp)) {
                Column {
                    Txt("TRAINING · ${engine.tutStep + 1}/7", size = 11.sp, color = DV.Cyan, bold = true, spacing = 1.5.sp)
                    Spacer(Modifier.height(4.dp))
                    Txt(tutText, size = 15.sp, lineHeight = 20.sp)
                }
            }
        }

        if (paused && result == null) PauseOverlay(app, onResume = { paused = false }, onRestart = onRetry, onQuit = {
            // a quit still counts: lifetime stats, unlocks and records are kept
            if (engine.score > 0 || engine.sliced > 0) commit(app, engine, hooks, today)
            onExit()
        })
        result?.let { ResultOverlay(app, it, onRetry = onRetry, onExit = onExit, onPlay = onPlay) }
    }
}

@Composable
internal fun PauseOverlay(app: AppState, onResume: () -> Unit, onRestart: () -> Unit, onQuit: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0xD805040A)).press { }, contentAlignment = Alignment.Center) {
        Column(Modifier.padding(28.dp).widthIn(max = 420.dp).fillMaxWidth().cutPanel(DV.Red, glow = true).padding(22.dp)) {
            Txt("PAUSED", size = 40.sp, font = DV.Display)
            Txt("the numbers will wait. they're patient like that.", size = 12.sp, color = DV.Dim)
            Spacer(Modifier.height(18.dp))
            BigButton("RESUME", Modifier.fillMaxWidth(), DV.Cyan, onClick = onResume)
            Spacer(Modifier.height(10.dp))
            BigButton("RESTART", Modifier.fillMaxWidth(), DV.Gold, onClick = onRestart)
            Spacer(Modifier.height(10.dp))
            BigButton("QUIT TO MENU", Modifier.fillMaxWidth(), DV.Red, onClick = onQuit)
            Spacer(Modifier.height(16.dp))
            Toggle("Reduce flashing", app.save.reduceFlash) { v -> app.update { it.copy(reduceFlash = v) } }
            Toggle("Factor hints", app.save.hints) { v -> app.update { it.copy(hints = v) } }
            Toggle("Haptics", app.save.haptics) { v -> app.update { it.copy(haptics = v) } }
        }
    }
}

@Composable
internal fun ResultOverlay(app: AppState, r: RunResult, onRetry: () -> Unit, onExit: () -> Unit, onPlay: (Mode) -> Unit) {
    val slam = remember { Animatable(0f) }
    val count = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        slam.animateTo(1f, tween(380, easing = FastOutSlowInEasing))
        count.animateTo(1f, tween(900, easing = FastOutSlowInEasing))
        if (r.newBest) { app.sound.play("power"); app.sound.buzz(2) }
    }
    val tutorial = r.mode == Mode.Tutorial
    Box(Modifier.fillMaxSize().background(Color(0xCC05040A)).press { }) {
        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))
            val k = slam.value
            Txt(
                if (tutorial) "TRAINED" else "DIVIDED", size = 62.sp, font = DV.Display, color = if (tutorial) DV.Cyan else DV.Red,
                modifier = Modifier.graphicsLayer { val s = 1f + (1f - k) * 1.4f; scaleX = s; scaleY = s; alpha = k; rotationZ = -4f * (1f - k) },
            )
            Txt(if (tutorial) "you know how to divide. now survive." else r.mode.label, size = 13.sp, color = DV.Dim, spacing = 2.sp)
            Spacer(Modifier.height(22.dp))
            if (!tutorial) {
                Txt("%,d".format((r.score * count.value).toLong()), size = 54.sp, font = DV.Display)
                Txt(if (r.newBest) "★ NEW BEST ★" else "BEST  %,d".format(r.best), size = 14.sp, color = if (r.newBest) DV.Gold else DV.Dim, bold = true, spacing = 2.sp)
                Spacer(Modifier.height(20.dp))
            }
            Column(Modifier.fillMaxWidth().cutPanel(DV.Faint).padding(16.dp)) {
                r.stats.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                        row.forEach { (label, v) ->
                            Column(Modifier.weight(1f)) {
                                Txt(label, size = 10.sp, color = DV.Dim, spacing = 1.5.sp, bold = true)
                                Txt(v, size = 22.sp, font = DV.Display)
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
            if (r.biggest > 0) {
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().cutPanel(DV.Violet).padding(16.dp)) {
                    Txt("BIGGEST CUT", size = 10.sp, color = DV.Violet, bold = true, spacing = 1.5.sp)
                    Txt("${r.biggest} = ${NT.factorString(r.biggest)}", size = 22.sp, font = DV.Math)
                    Spacer(Modifier.height(4.dp))
                    Txt(r.fact, size = 13.sp, color = DV.Dim, lineHeight = 18.sp)
                }
            }
            for (b in r.newBlades) {
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().cutPanel(Color(b.color), glow = true).padding(16.dp)) {
                    Txt("BLADE UNLOCKED", size = 10.sp, color = Color(b.color), bold = true, spacing = 1.5.sp)
                    Txt(b.name, size = 22.sp, font = DV.Display)
                    Txt("equip it from BLADES on the menu.", size = 12.sp, color = DV.Dim)
                }
            }
            if (r.newCodex.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().cutPanel(DV.Gold).padding(16.dp)) {
                    Txt("NUMBERDEX · ${r.newCodex.size} NEW", size = 10.sp, color = DV.Gold, bold = true, spacing = 1.5.sp)
                    Spacer(Modifier.height(4.dp))
                    for (en in r.newCodex) Txt("${en.n}  ·  ${en.title}", size = 15.sp)
                }
            }
            Spacer(Modifier.height(22.dp))
            Row(Modifier.fillMaxWidth()) {
                if (tutorial) BigButton("PLAY ARCADE", Modifier.weight(1f), DV.Red) { onPlay(Mode.Arcade) }
                else BigButton("AGAIN", Modifier.weight(1f), DV.Red, onClick = onRetry)
                Spacer(Modifier.width(12.dp))
                BigButton("MENU", Modifier.weight(1f), DV.Cyan, onClick = onExit)
            }
            Spacer(Modifier.height(30.dp))
        }
    }
}
