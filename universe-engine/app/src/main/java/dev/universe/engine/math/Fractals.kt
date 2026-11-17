package dev.universe.engine.math

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlin.math.*

/** Escape-time iteration. Returns a smooth (fractional) iteration count, or −1 for points that never escape. */
internal fun fractalIter(type: Int, x0: Double, y0: Double, jr: Double, ji: Double, maxIter: Int): Double {
    var zr: Double; var zi: Double
    val cr: Double; val ci: Double
    if (type == 1) { zr = x0; zi = y0; cr = jr; ci = ji } else { zr = 0.0; zi = 0.0; cr = x0; ci = if (type == 2) -y0 else y0 }
    if (type == 0) {
        // Points inside the main cardioid or the period-2 bulb never escape: skip the loop.
        val q = (x0 - 0.25) * (x0 - 0.25) + y0 * y0
        if (q * (q + (x0 - 0.25)) <= 0.25 * y0 * y0) return -1.0
        if ((x0 + 1) * (x0 + 1) + y0 * y0 <= 0.0625) return -1.0
    }
    var r2 = zr * zr; var i2 = zi * zi
    var i = 0
    while (i < maxIter && r2 + i2 <= 256.0) {
        zi = if (type == 2) abs(2 * zr * zi) + ci else 2 * zr * zi + ci
        zr = r2 - i2 + cr
        r2 = zr * zr; i2 = zi * zi
        i++
    }
    if (i >= maxIter) return -1.0
    return i + 1 - ln(ln(r2 + i2) / 2) / ln(2.0)
}

private val PALETTES = listOf("Abyss", "Plasma", "Aurora", "Ember", "Mono")

private fun fractalColor(mu: Double, palette: Int): Int {
    if (mu < 0) return 0xFF000004.toInt()
    val t = mu * 0.028
    fun ch(a: Double, b: Double, c: Double, d: Double): Int = ((a + b * cos(2 * PI * (c * t + d))).coerceIn(0.0, 1.0) * 255).toInt()
    val (r, g, b) = when (palette) {
        0 -> Triple(ch(0.32, 0.36, 1.0, 0.55), ch(0.45, 0.45, 1.0, 0.68), ch(0.62, 0.38, 1.0, 0.82))
        1 -> Triple(ch(0.55, 0.45, 1.0, 0.0), ch(0.3, 0.3, 0.8, 0.25), ch(0.6, 0.4, 1.0, 0.55))
        2 -> Triple(ch(0.25, 0.25, 0.7, 0.9), ch(0.55, 0.45, 1.0, 0.45), ch(0.55, 0.35, 0.8, 0.1))
        3 -> Triple(ch(0.6, 0.4, 1.0, 0.5), ch(0.38, 0.38, 1.0, 0.62), ch(0.16, 0.2, 1.0, 0.75))
        else -> { val v = ch(0.5, 0.5, 1.0, 0.5); Triple(v, v, v) }
    }
    return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}

internal suspend fun renderFractal(w: Int, h: Int, cx: Double, cy: Double, span: Double, maxIter: Int, type: Int, jr: Double, ji: Double, palette: Int): Bitmap = coroutineScope {
    val px = IntArray(w * h)
    val upp = span / w
    val workers = 4
    (0 until workers).map { k ->
        launch(Dispatchers.Default) {
            var y = k
            while (y < h) {
                ensureActive()
                val wy = cy - (y - h / 2.0) * upp
                val row = y * w
                for (x in 0 until w) px[row + x] = fractalColor(fractalIter(type, cx + (x - w / 2.0) * upp, wy, jr, ji, maxIter), palette)
                y += workers
            }
        }
    }.joinAll()
    Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
}

private class Frame(val bmp: ImageBitmap, val cx: Double, val cy: Double, val span: Double)

private class Place(val name: String, val x: Double, val y: Double, val span: Double)

private val PLACES = listOf(
    Place("Whole set", -0.6, 0.0, 3.4), Place("Seahorse valley", -0.7453, 0.1127, 0.012), Place("Elephant valley", 0.2925, 0.0149, 0.05),
    Place("Mini-brot", -1.7548776662, 0.0, 0.06), Place("Spiral galaxy", -0.761574, -0.0847596, 0.0006), Place("Feigenbaum point", -1.401155, 0.0, 0.02),
    Place("Lightning", -0.170337, -1.06506, 0.02),
)

private val FractalInfo = LabInfo(
    equations = listOf(
        "z_{n+1} = z_n^2 + c, \\qquad z_0 = 0",
        "c \\in M \\iff |z_n| \\le 2 \\text{ for all } n",
        "\\mu = n + 1 - \\log_2 \\ln |z_n|",
    ),
    about = "For every point c of the plane, square-and-add starting from zero. If the orbit stays bounded forever, c belongs to the Mandelbrot set (black). Outside, colour shows how quickly the orbit escapes. Pinch to dive in — the boundary never becomes simple. Turn on the orbit probe to watch the sequence itself, and to preview the Julia set that belongs to each point: connected when c is inside the set, dust when it is outside.",
    notes = listOf(
        "Membership is decided by a finite number of iterations, which grows as you zoom. Points very close to the boundary that need more iterations than the budget are drawn black, so fine filaments can look thicker than they are.",
        "Coordinates are 64-bit floats. Around a magnification of 10¹³ neighbouring pixels become the same number and the image dissolves into blocks; the zoom is capped just before that. Deeper zooms need arbitrary-precision arithmetic and perturbation theory.",
        "Colours use the smooth iteration count μ, which removes the banding of integer counts. The palette itself carries no mathematical meaning.",
        "While you pinch, the previous image is stretched as a preview and then refined in two passes on background threads.",
    ),
)

@Composable
fun FractalLab() {
    val app = LocalApp.current
    val view = remember { PlotView(-0.6, 0.0, 3.4, minSpan = 3e-13, maxSpan = 8.0) }
    var type by remember { mutableIntStateOf(0) }
    var palette by remember { mutableIntStateOf(0) }
    var detail by remember { mutableFloatStateOf(1f) }
    var probe by remember { mutableStateOf(false) }
    var probeC by remember { mutableStateOf<Offset?>(null) }
    var jr by remember { mutableDoubleStateOf(-0.8) }
    var ji by remember { mutableDoubleStateOf(0.156) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    var frame by remember { mutableStateOf<Frame?>(null) }
    var busy by remember { mutableStateOf(false) }
    val tm = rememberTextMeasurer(cacheSize = 16)
    val resScale = when (app.prefs.quality) { 0 -> 0.34f; 2 -> 0.66f; else -> 0.5f }
    val zoom = 3.4 / view.span
    val maxIter = ((110 + 62 * ln(zoom.coerceAtLeast(1.0)) / ln(2.0)) * detail).toInt().coerceIn(60, 6000)

    LaunchedEffect(view.cx, view.cy, view.span, type, palette, px, maxIter, jr, ji) {
        if (px.width < 8) return@LaunchedEffect
        delay(45)
        busy = true
        val w = (px.width * resScale).toInt().coerceAtLeast(16); val h = (px.height * resScale).toInt().coerceAtLeast(16)
        val cx = view.cx; val cy = view.cy; val span = view.span
        val quick = renderFractal(w / 4, h / 4, cx, cy, span, maxIter, type, jr, ji, palette)
        frame = Frame(quick.asImageBitmap(), cx, cy, span)
        val full = renderFractal(w, h, cx, cy, span, maxIter, type, jr, ji, palette)
        frame = Frame(full.asImageBitmap(), cx, cy, span)
        busy = false
    }
    LaunchedEffect(zoom > 1e9) { if (zoom > 1e9 && type == 0) app.discover("deepzoom") }

    // Live Julia preview for the probed point (small, so it is computed synchronously).
    val pc = probeC
    val probeWorld = if (pc != null) Pair(view.wx(pc.x), view.wy(pc.y)) else null
    val juliaPreview = remember(probeWorld, palette) {
        if (probeWorld == null || type != 0) null else {
            val n = 96
            val buf = IntArray(n * n)
            for (y in 0 until n) for (x in 0 until n) buf[y * n + x] = fractalColor(fractalIter(1, (x - n / 2.0) * 3.2 / n, -(y - n / 2.0) * 3.2 / n, probeWorld.first, probeWorld.second, 90), palette)
            Bitmap.createBitmap(buf, n, n, Bitmap.Config.ARGB_8888).asImageBitmap()
        }
    }

    LabScaffold("Fractal Explorer", Domain.Math, FractalInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().onSizeChanged { px = it }.plotInteract(view, key = probe, onSingle = { o, phase ->
                if (!probe) false else { if (phase < 2) probeC = o; true }
            }),
        ) {
            view.bind(this)
            val dp = 1.dp.toPx()
            drawRect(Color(0xFF000004))
            frame?.let { f ->
                val s = (f.span / view.span).toFloat() * (size.width / f.bmp.width)
                val left = ((f.cx - view.cx) / view.span * size.width + size.width / 2 - f.bmp.width * s / 2).toFloat()
                val top = ((view.cy - f.cy) / view.span * size.width + size.height / 2 - f.bmp.height * s / 2).toFloat()
                if (left.isFinite() && top.isFinite() && abs(left) < 1e7f && abs(top) < 1e7f) {
                    drawImage(f.bmp, dstOffset = IntOffset(left.roundToInt(), top.roundToInt()), dstSize = IntSize((f.bmp.width * s).roundToInt().coerceAtLeast(1), (f.bmp.height * s).roundToInt().coerceAtLeast(1)), filterQuality = FilterQuality.Low)
                }
            }
            if (probe && probeWorld != null && type != 1) {
                // orbit of z -> z^2 + c for the probed c
                val path = Path()
                var zr = 0.0; var zi = 0.0
                val (cr, ciRaw) = probeWorld
                val ci = if (type == 2) -ciRaw else ciRaw
                path.moveTo(view.sx(0.0), view.sy(0.0))
                var escaped = false
                for (i in 0 until 120) {
                    val nr = zr * zr - zi * zi + cr
                    val ni = (if (type == 2) abs(2 * zr * zi) else 2 * zr * zi) + ci
                    zr = nr; zi = ni
                    if (zr * zr + zi * zi > 1e6) { escaped = true; break }
                    val sy = view.sy(if (type == 2) -zi else zi)
                    path.lineTo(view.sx(zr), sy)
                    if (i < 40) drawCircle(UE.Text.copy(alpha = 0.9f - i * 0.018f), 2.2f * dp, Offset(view.sx(zr), sy))
                }
                drawPath(path, UE.Text.copy(alpha = 0.75f), style = Stroke(1.1f * dp))
                glowDot(pc!!, if (escaped) UE.Amber else UE.Green, 5 * dp)
                juliaPreview?.let { jp ->
                    val sz = 112 * dp
                    val tl = Offset(size.width - sz - 12 * dp, 12 * dp)
                    drawImage(jp, dstOffset = IntOffset(tl.x.roundToInt(), tl.y.roundToInt()), dstSize = IntSize(sz.roundToInt(), sz.roundToInt()))
                    drawRect(UE.Cyan.copy(alpha = 0.8f), tl, Size(sz, sz), style = Stroke(1.2f * dp))
                    label(tm, "Julia set of this point", tl.x + sz / 2, tl.y + sz + 4 * dp, UE.Text, 9.5f, 0.5f, 0f)
                }
            }
            if (busy) drawCircle(UE.Cyan, 4 * dp, Offset(14 * dp, 14 * dp))
            if (view.span <= 3.2e-13) label(tm, "64-bit precision floor reached", size.width / 2, size.height - 18 * dp, UE.Amber, 11f, 0.5f, 1f)
        }
    }) {
        Segmented(listOf("Mandelbrot", "Julia", "Burning Ship"), type) {
            type = it; probeC = null
            if (it == 1) { view.cx = 0.0; view.cy = 0.0; view.span = 3.4 } else if (it == 2) { view.cx = -0.5; view.cy = 0.5; view.span = 3.6 } else { view.cx = -0.6; view.cy = 0.0; view.span = 3.4 }
        }
        ReadoutRow {
            Stat("Re", fmt(view.cx, 8)); Stat("Im", fmt(view.cy, 8))
            Stat("zoom", "×" + fmt(zoom, 3), UE.Cyan); Stat("iterations", maxIter.toString(), UE.Violet)
        }
        if (type == 0) {
            SectionLabel("Famous places")
            ChipRow(PLACES.map { it.name }, -1) { i -> view.cx = PLACES[i].x; view.cy = PLACES[i].y; view.span = PLACES[i].span }
        }
        if (type == 1) {
            UESlider("Re(c)", jr.toFloat(), -1.6f..0.6f, format = { fix(it, 4) }) { jr = it.toDouble() }
            UESlider("Im(c)", ji.toFloat(), -1.2f..1.2f, format = { fix(it, 4) }) { ji = it.toDouble() }
            Note("Every point c of the Mandelbrot set has its own Julia set. Slide c across the boundary and watch it shatter from one piece into dust.")
        }
        SectionLabel("Palette")
        ChipRow(PALETTES, palette) { palette = it }
        UESlider("Iteration budget", detail, 0.4f..4f, log = true, format = { "×${fix(it, 2)}" }) { detail = it }
        if (type != 1) {
            Toggle("Orbit probe (drag on the image)", probe, accent = UE.Amber) { probe = it; if (!it) probeC = null }
            if (probe && probeWorld != null && type == 0) {
                GlowButton("Explore this Julia set", accent = UE.Amber) { jr = probeWorld.first; ji = probeWorld.second; type = 1; probeC = null; view.cx = 0.0; view.cy = 0.0; view.span = 3.4 }
            }
        }
        Note("Drag to pan, pinch to zoom. The iteration budget rises automatically with depth; raise it further if fine filaments look solid.")
    }
}
