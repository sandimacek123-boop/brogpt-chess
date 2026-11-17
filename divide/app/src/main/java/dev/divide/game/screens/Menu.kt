package dev.divide.game.screens

import android.graphics.Paint
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import dev.divide.game.AppState
import dev.divide.game.R
import dev.divide.game.Screen
import dev.divide.game.data.CODEX
import dev.divide.game.game.*
import dev.divide.game.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.*

/** The menu backdrop: a ghost player dividing numbers in a dimmed Zen game. */
@Composable
fun AttractBackdrop(app: AppState, dim: Float = 0.55f) {
    val look = remember { Look().apply { hud = false; attract = true } }
    val engine = remember { Engine(Mode.Zen, 1729L) }
    val bot = remember { Bot(engine) }
    var frame by remember { mutableIntStateOf(0) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    var begun by remember { mutableStateOf(false) }
    LaunchedEffect(size) {
        if (size.width == 0) return@LaunchedEffect
        look.scale = size.width / 1000f
        engine.height = size.height / look.scale
        if (!begun) { engine.begin(); begun = true }
    }
    LaunchedEffect(Unit) {
        var last = 0L
        val t0 = System.nanoTime()
        while (true) withFrameNanos { now ->
            val dt = if (last == 0L) 0f else ((now - last) / 1e9f).coerceAtMost(0.05f)
            last = now
            if (begun) {
                val t = (now - t0) / 1e9f
                bot.step(dt, t)
                engine.banners.clear()
                look.time = t; look.dt = dt; look.trails = bot.trails; look.blade = app.save.blade
                frame++
            }
        }
    }
    Canvas(Modifier.fillMaxSize().onSizeChanged { size = it }) {
        frame
        drawIntoCanvas { app.renderer.draw(it.nativeCanvas, engine, size.width.toFloat(), size.height.toFloat(), look) }
        drawRect(Color(0xFF05040A).copy(alpha = dim))
    }
}

/** Draws the DIVIDE logo: six heavy letters cut along a diagonal, the halves offset by [split]. */
class Logo(context: android.content.Context) {
    private val face = ResourcesCompat.getFont(context, R.font.bungee)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = face; textAlign = Paint.Align.LEFT }
    private val seam = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val path = android.graphics.Path()

    /** [letters]: 0..6 how many letters have landed (fractional = the next one is falling). */
    fun draw(c: android.graphics.Canvas, x: Float, y: Float, w: Float, h: Float, main: Int, accent: Int, split: Float, letters: Float, glow: Boolean) {
        val word = "DIVIDE"
        paint.textSize = h * 0.78f
        val total = paint.measureText(word)
        if (total > w * 0.94f) paint.textSize *= w * 0.94f / total
        val tw = paint.measureText(word)
        val x0 = x + (w - tw) / 2
        val base = y + h / 2 - (paint.ascent() + paint.descent()) / 2
        val cx = x + w / 2; val cy = y + h / 2
        val ang = -0.21f
        for (side in intArrayOf(-1, 1)) {
            c.save()
            val L = w * 2
            val dx = cos(ang) * L; val dy = sin(ang) * L
            val nx = -sin(ang) * L * side; val ny = cos(ang) * L * side
            path.reset(); path.moveTo(cx - dx, cy - dy); path.lineTo(cx + dx, cy + dy); path.lineTo(cx + dx + nx, cy + dy + ny); path.lineTo(cx - dx + nx, cy - dy + ny); path.close()
            c.clipPath(path)
            c.translate(cos(ang) * split * side * 1.2f, sin(ang) * split * side * 1.2f - split * 0.25f * side)
            var px = x0
            for ((i, ch) in word.withIndex()) {
                val s = ch.toString()
                val adv = paint.measureText(s)
                val k = (letters - i).coerceIn(0f, 1f)
                if (k > 0f) {
                    c.save()
                    val sc = 1f + (1f - k).pow(2) * 1.6f
                    c.scale(sc, sc, px + adv / 2, cy)
                    paint.color = main
                    paint.alpha = (255 * k).toInt()
                    if (glow) paint.setShadowLayer(h * 0.12f, 0f, 0f, accent) else paint.clearShadowLayer()
                    c.drawText(s, px, base, paint)
                    c.restore()
                }
                px += adv
            }
            c.restore()
        }
        paint.clearShadowLayer()
        if (split > 0.5f) {
            val L = tw * 0.62f
            seam.color = accent; seam.strokeWidth = max(2f, split * 0.35f)
            if (glow) seam.setShadowLayer(18f, 0f, 0f, accent) else seam.clearShadowLayer()
            c.drawLine(cx - cos(ang) * L, cy - sin(ang) * L, cx + cos(ang) * L, cy + sin(ang) * L, seam)
            seam.clearShadowLayer()
        }
    }
}

@Composable
fun MenuScreen(app: AppState, onPlay: (Mode) -> Unit, onOpen: (Screen) -> Unit) {
    val context = LocalContext.current
    val logo = remember { Logo(context) }
    val boot = remember { Animatable(if (app.booted) 3f else 0f) }
    var punch by remember { mutableIntStateOf(0) }       // impact frame style shown over everything (0 = none)
    var titleRect by remember { mutableStateOf(Rect.Zero) }
    val scope = rememberCoroutineScope()
    val save = app.save
    val reduce = save.reduceFlash

    LaunchedEffect(Unit) {
        if (app.booted) return@LaunchedEffect
        app.booted = true
        launch { boot.animateTo(3f, tween(3000, easing = LinearEasing)) }
        for (i in 0 until 6) { delay(if (i == 0) 180 else 62); app.sound.play("tick", 0.8f, 0.8f + i * 0.08f) }
        delay(120)
        app.sound.play("slice", 1f, 0.8f); app.sound.play("impact_big"); app.sound.buzz(3)
        if (!reduce) { punch = Style.INK; delay(84); punch = Style.MONO; delay(42) }
        punch = 0
    }
    val t = boot.value
    val letters = ((t - 0.15f) / 0.065f).coerceIn(0f, 6f)
    val cut = when { t < 0.62f -> 0f; t < 0.75f -> (t - 0.62f) / 0.13f * 30f; else -> 30f - min(1f, (t - 0.75f) / 0.5f) * 22f }

    fun launchMode(m: Mode) {
        scope.launch {
            app.sound.play("impact", 0.9f); app.sound.buzz(2)
            if (!reduce) { punch = Style.INK; delay(70); punch = 0 }
            onPlay(m)
        }
    }

    Box(Modifier.fillMaxSize()) {
        AttractBackdrop(app)
        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.7f))
            Canvas(Modifier.fillMaxWidth().height(120.dp).onGloballyPositioned { titleRect = it.boundsInRoot() }) {
                drawIntoCanvas { logo.draw(it.nativeCanvas, 0f, 0f, size.width, size.height, DV.White.toArgb(), DV.Red.toArgb(), cut * density / 2.6f, letters, true) }
            }
            val tagA = ((t - 0.85f) / 0.3f).coerceIn(0f, 1f)
            Txt("every number breaks. primes don't.", size = 13.sp, color = DV.Dim, spacing = 1.5.sp, modifier = Modifier.graphicsLayer { alpha = tagA })
            Spacer(Modifier.weight(0.5f))

            @Composable
            fun item(i: Int, content: @Composable () -> Unit) {
                val k = ((t - 1.0f - i * 0.07f) / 0.25f).coerceIn(0f, 1f)
                Box(Modifier.fillMaxWidth().graphicsLayer { alpha = k; translationX = (1f - k).pow(2) * 120f }) { content() }
            }
            val best = save.best[Mode.Arcade.name] ?: 0L
            item(0) { BigButton("PLAY", Modifier.fillMaxWidth(), DV.Red, sub = if (best > 0) "ARCADE · BEST %,d".format(best) else "ARCADE · ENDLESS WAVES + BOSSES") { launchMode(Mode.Arcade) } }
            Spacer(Modifier.height(10.dp))
            item(1) {
                Row(Modifier.fillMaxWidth()) {
                    BigButton("BOSS RUSH", Modifier.weight(1f), DV.Gold, sub = "${save.bosses.size}/7 BROKEN") { launchMode(Mode.BossRush) }
                    Spacer(Modifier.width(10.dp))
                    val daily = if (save.dailyKey == app.today()) save.dailyBest else 0L
                    BigButton("DAILY", Modifier.weight(1f), DV.Violet, sub = if (daily > 0) "TODAY %,d".format(daily) else "SAME SEED FOR ALL") { launchMode(Mode.Daily) }
                }
            }
            Spacer(Modifier.height(10.dp))
            item(2) {
                Row(Modifier.fillMaxWidth()) {
                    BigButton("ZEN", Modifier.weight(1f), DV.Cyan, sub = "NO SHIELDS · NO PRESSURE") { launchMode(Mode.Zen) }
                    Spacer(Modifier.width(10.dp))
                    BigButton("TRAINING", Modifier.weight(1f), if (save.tutorialDone) DV.Dim else DV.White, sub = if (save.tutorialDone) "REPLAY THE BASICS" else "★ START HERE") { launchMode(Mode.Tutorial) }
                }
            }
            Spacer(Modifier.height(16.dp))
            item(3) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallButton("NUMBERDEX ${save.codex.count { k -> CODEX.any { it.n.toString() == k } }}/${CODEX.size}", Modifier.weight(1.4f), DV.Gold) { onOpen(Screen.Codex) }
                    SmallButton("BLADES", Modifier.weight(1f), DV.Cyan) { onOpen(Screen.Blades) }
                    SmallButton("⚙", Modifier.weight(0.5f), DV.Dim) { onOpen(Screen.Settings) }
                }
            }
            Spacer(Modifier.weight(0.25f))
            item(4) {
                Txt(
                    if (save.games == 0) "swipe to divide · tap to catch" else "%,d divided · %,d primes caught · best combo ×%d".format(save.totalSliced, save.primesCaught, save.bestCombo),
                    size = 11.sp, color = DV.Faint, align = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (punch != 0) ImpactOverlay(punch, titleRect, logo, letters, cut)
    }
}

/** A full-screen impact frame: manga paper (INK) or black void (MONO) with focus lines and the logo in silhouette. */
@Composable
fun ImpactOverlay(style: Int, focus: Rect, logo: Logo, letters: Float, cut: Float) {
    Canvas(Modifier.fillMaxSize()) {
        val ink = style == Style.INK
        drawRect(if (ink) DV.Paper else Color.Black)
        val cx = if (focus == Rect.Zero) size.width / 2 else focus.center.x
        val cy = if (focus == Rect.Zero) size.height * 0.3f else focus.center.y
        focusLines(cx, cy, if (ink) Color(0xFF0A0A0C) else Color.White, seed = style * 17 + 3, inner = size.width * 0.28f, count = 120)
        if (focus != Rect.Zero) drawIntoCanvas {
            logo.draw(it.nativeCanvas, focus.left, focus.top, focus.width, focus.height, (if (ink) Color(0xFF0A0A0C) else Color.White).toArgb(), (if (ink) Color(0xFF0A0A0C) else Color.White).toArgb(), cut * density / 2.6f, letters, false)
        }
    }
}

@Composable
fun WarnScreen(app: AppState, onDone: () -> Unit) {
    Box(Modifier.fillMaxSize().background(DV.Ink).windowInsetsPadding(WindowInsets.safeDrawing).padding(26.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 460.dp).fillMaxWidth().cutPanel(DV.Gold, glow = true).padding(22.dp)) {
            Txt("⚠  HEADS UP", size = 26.sp, font = DV.Display, color = DV.Gold)
            Spacer(Modifier.height(12.dp))
            Txt(
                "This game uses impact frames: single high-contrast frames, screen flashes and shakes on big hits.\n\nIf you're sensitive to flashing lights, switch on Reduce flashing. It swaps every impact frame for a soft dim and turns the flashes way down. You can change it any time in settings or from the pause menu.",
                size = 14.sp, lineHeight = 20.sp, color = DV.White,
            )
            Spacer(Modifier.height(16.dp))
            Toggle("Reduce flashing", app.save.reduceFlash, DV.Gold) { v -> app.update { it.copy(reduceFlash = v) } }
            Spacer(Modifier.height(16.dp))
            BigButton("I'M READY", Modifier.fillMaxWidth(), DV.Red, onClick = onDone)
        }
    }
}
