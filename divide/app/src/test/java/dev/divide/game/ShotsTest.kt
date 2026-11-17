package dev.divide.game

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import dev.divide.game.data.CODEX
import dev.divide.game.data.Save
import dev.divide.game.game.*
import dev.divide.game.screens.ResultOverlay
import dev.divide.game.screens.RunResult
import dev.divide.game.data.BLADES
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.cos
import kotlin.math.sin

/** Renders screens and forced impact-frame states to app/build/shots for visual QC; any crash fails the build. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-420dpi")
class ShotsTest {
    @get:Rule val rule = createComposeRule()

    private val demo = Save(
        flashAsked = true, tutorialDone = true, games = 23, totalSliced = 3402, primesCaught = 1203, bestCombo = 47, bestWave = 9,
        best = mapOf("Arcade" to 48210L, "BossRush" to 30115L), codex = CODEX.take(19).map { it.n.toString() }.toSet() + "1729",
        blades = setOf("edge", "sieve", "golden"), blade = "edge", bosses = setOf("360", "1024", "1729"),
    )

    private fun app(screen: Screen, mode: Mode = Mode.Arcade, save: Save = demo, ms: Long = 2500) {
        rule.mainClock.autoAdvance = false
        rule.setContent { DivideApp(screen, mode, save) }
        var t = 0L
        while (t < ms) { rule.mainClock.advanceTimeBy(250); t += 250 }
    }

    private fun shot(name: String) = rule.onRoot().captureRoboImage("build/shots/$name.png")

    @Test fun menu() { app(Screen.Menu, ms = 3000); shot("menu") }
    @Test fun boot() {
        rule.mainClock.autoAdvance = false
        rule.setContent { DivideApp(null, Mode.Arcade, demo) }
        var t = 0L
        while (t < 400) { rule.mainClock.advanceTimeBy(16); t += 16 }
        shot("boot_1_letters")
        while (t < 650) { rule.mainClock.advanceTimeBy(16); t += 16 }
        shot("boot_2_impact")
        while (t < 3200) { rule.mainClock.advanceTimeBy(100); t += 100 }
        shot("boot_3_done")
    }
    @Test fun warn() { app(Screen.Warn, save = Save()); shot("warn") }
    @Test fun codex() { app(Screen.Codex); shot("codex") }
    @Test fun blades() { app(Screen.Blades); shot("blades") }
    @Test fun settings() { app(Screen.Settings); shot("settings") }

    @Test fun tutorial() {
        app(Screen.Game, Mode.Tutorial, ms = 5000); shot("game_tutorial")
        rule.onNodeWithText("II").performClick()
        repeat(4) { rule.mainClock.advanceTimeBy(250) }
        shot("game_pause")
    }

    @Test fun swipesCut() {
        app(Screen.Game, Mode.Zen, ms = 4000)
        val e = dev.divide.game.screens.GameDebug.engine!!; val look = dev.divide.game.screens.GameDebug.look!!
        fun target(): Ent? = e.ents.firstOrNull { it.alive && it.kind == Kind.Composite && !it.harvest && it.y > 250f && it.y < e.groundY - 300f }
        var guard = 0
        while (target() == null && guard++ < 80) rule.mainClock.advanceTimeBy(250)
        // 1) a flick reported as down + up only (no move events), the way slow devices deliver it
        var t = target()!!
        val before = e.sliced
        rule.onRoot().performTouchInput {
            down(androidx.compose.ui.geometry.Offset(t.x * look.scale, (t.y - 260f) * look.scale + look.topInset))
            advanceEventTime(60)
            updatePointerTo(0, androidx.compose.ui.geometry.Offset(t.x * look.scale + 4f, (t.y + 300f) * look.scale + look.topInset))
            up()
        }
        rule.mainClock.advanceTimeBy(100)
        check(e.sliced > before) { "flick did not cut (sliced=${e.sliced})" }
        // 2) an ordinary multi-sample swipe
        guard = 0
        while (target() == null && guard++ < 80) rule.mainClock.advanceTimeBy(250)
        t = target()!!
        val b2 = e.sliced
        rule.onRoot().performTouchInput {
            swipe(androidx.compose.ui.geometry.Offset((t.x - 250f) * look.scale, t.y * look.scale + look.topInset), androidx.compose.ui.geometry.Offset((t.x + 250f) * look.scale, (t.y + 40f) * look.scale + look.topInset), durationMillis = 90)
        }
        rule.mainClock.advanceTimeBy(100)
        check(e.sliced > b2) { "swipe did not cut" }
    }

    @Test fun arcadeLive() { app(Screen.Game, Mode.Arcade, ms = 6000); shot("game_arcade_live") }

    @Test fun results() {
        rule.mainClock.autoAdvance = false
        val r = RunResult(Mode.Arcade, 52310, 52310, true, listOf("WAVE" to "9", "DIVIDED" to "214", "PRIMES CAUGHT" to "88", "BEST COMBO" to "×52", "LONGEST CHAIN" to "6", "CLANGS" to "3", "BOSSES BROKEN" to "3", "BREACHES" to "2"),
            listOf(BLADES[3]), CODEX.filter { it.n in setOf(1729L, 91L) }, 8128, CODEX.first { it.n == 8128L }.fact)
        rule.setContent { val ctx = androidx.compose.ui.platform.LocalContext.current; val scope = androidx.compose.runtime.rememberCoroutineScope(); val a = androidx.compose.runtime.remember { AppState(ctx, scope).also { it.apply(demo) } }; ResultOverlay(a, r, {}, {}, {}) }
        repeat(10) { rule.mainClock.advanceTimeBy(250) }
        shot("game_results")
    }

    // ------------------------------------------------------------------ direct renderer probes
    private val W = 1080; private val H = 2339

    private fun render(name: String, e: Engine, look: Look) {
        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val r = renderer ?: Renderer(ApplicationProvider.getApplicationContext()).also { renderer = it }
        look.scale = W / 1000f; look.topInset = 60f
        r.draw(Canvas(bmp), e, W.toFloat(), H.toFloat(), look)
        File("build/shots").mkdirs()
        File("build/shots/$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    private var renderer: Renderer? = null

    private fun engine(mode: Mode, seed: Long = 11): Engine = Engine(mode, seed, (H - 60f) / (W / 1000f)).also { it.begin() }
    private fun run(e: Engine, look: Look, sec: Float) { var t = 0f; while (t < sec) { e.step(1 / 60f); look.time += 1 / 60f; look.dt = 1 / 60f; t += 1 / 60f } }
    private fun cut(e: Engine, target: Ent, ang: Float, id: Int, look: Look): Trail {
        val reach = target.r + 220f
        val x0 = target.x - cos(ang) * reach; val y0 = target.y - sin(ang) * reach
        val x1 = target.x + cos(ang) * reach; val y1 = target.y + sin(ang) * reach
        val tr = Trail(id); tr.cutting = true
        for (k in 0..12) { val f = k / 12f; tr.add(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, look.time - (12 - k) * 0.008f) }
        e.swipe(x0, y0, x1, y1, id, 3000f); e.endSwipe(id)
        return tr
    }

    @Test fun probes() {
        // ---- arcade: numbers falling, then a slice with shells, harvest and a blade trail
        val look = Look()
        val e = engine(Mode.Arcade, 5)
        run(e, look, 7.5f)
        render("probe_01_play", e, look)
        val target = e.ents.filter { it.kind == Kind.Composite && !it.harvest && it.y > 300 }.maxByOrNull { it.value }
        if (target != null) {
            val tr = cut(e, target, -0.5f, 77, look)
            look.trails = listOf(tr)
            e.fx.frames.clear()
            repeat(5) { e.step(1 / 60f); look.time += 1 / 60f }
            render("probe_02_slice", e, look)
        }
        // ---- every impact-frame style on the same moment
        e.impact(intArrayOf(1), shockX = 500f, shockY = 900f, speedX = 500f, speedY = 900f)
        for ((i, n) in listOf(Style.MONO to "mono", Style.INK to "ink", Style.NEG to "neg", Style.RED to "red").withIndex()) {
            look.style = n.first
            render("probe_0${3 + i}_impact_${n.second}", e, look)
        }
        look.style = Style.INK; look.reduceFlash = true
        render("probe_07_impact_reduced", e, look)
        look.reduceFlash = false; look.style = Style.NORMAL; look.trails = emptyList()

        // ---- boss rush: arrival, hits, finisher
        val lb = Look()
        val b = engine(Mode.BossRush, 3)
        run(b, lb, 3.6f)
        b.fx.frames.clear()
        render("probe_08_boss", b, lb)
        val boss = b.boss!!
        var id = 500
        repeat(3) { lb.trails = listOf(cut(b, boss, 0.6f, id++, lb)); run(b, lb, 0.4f) }
        b.fx.frames.clear()
        lb.trails = listOf(cut(b, boss, -0.4f, id++, lb)); repeat(3) { b.step(1 / 60f); lb.time += 1 / 60f }
        render("probe_09_boss_hit", b, lb)
        while (b.boss != null) { lb.trails = listOf(cut(b, b.boss!!, 0.35f, id++, lb)); if (b.boss == null) break; run(b, lb, 0.4f) }
        // the finisher: impact frames then the split screen
        lb.style = b.fx.frames.firstOrNull() ?: Style.NORMAL
        render("probe_10_boss_kill_impact", b, lb)
        b.fx.frames.clear(); b.fx.hitStop = 0f; lb.style = Style.NORMAL
        repeat(8) { b.step(1 / 60f); lb.time += 1 / 60f }
        render("probe_11_boss_split", b, lb)

        // ---- overdrive + power auras
        val lo = Look()
        val o = engine(Mode.Arcade, 9)
        run(o, lo, 6f)
        o.overdrive = 100f
        o.activateOverdrive(); o.fx.frames.clear(); o.fx.flash = 0f
        o.magnetT = 3f
        run(o, lo, 1.0f)
        render("probe_12_overdrive", o, lo)

        // ---- every blade
        val lt = Look(); val t = engine(Mode.Zen, 2); run(t, lt, 0.5f); t.banners.clear()
        val trails = BLADES.mapIndexed { i, bl -> Trail(i).also { tr -> tr.cutting = true; for (k in 0..15) tr.add(120f + k * 50f, 300f + i * 300f + 60f * sin(k * 0.5f), lt.time - (15 - k) * 0.008f) } }
        for ((i, bl) in BLADES.withIndex()) { lt.blade = bl.id; lt.trails = listOf(trails[i]); render("probe_13_blade_${bl.id}", t, lt) }

        // ---- game over
        val lg = Look()
        val g = engine(Mode.Arcade, 4)
        g.shields = 1
        var guard = 0
        while (!g.over && guard++ < 60 * 40) { g.step(1 / 60f); lg.time += 1 / 60f }
        check(g.over) { "game never ended" }
        lg.style = g.fx.frames.firstOrNull() ?: 0
        render("probe_14_gameover_impact", g, lg)
        g.fx.frames.clear(); lg.style = 0
        run(g, lg, 1.2f)
        render("probe_15_gameover", g, lg)
    }
}
