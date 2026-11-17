package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlin.math.*

/**
 * Finite-difference solution of the 2D wave equation u_tt = c² ∇²u on a grid, with absorbing edges,
 * reflecting walls and a per-cell wave speed (for refraction). Courant number c·Δt/Δx = 0.5.
 */
internal class WaveTank(val w: Int, val h: Int) {
    var u = FloatArray(w * h); var prev = FloatArray(w * h); private var nxt = FloatArray(w * h)
    val wall = BooleanArray(w * h)
    val c2 = FloatArray(w * h) { 0.25f }
    val intensity = FloatArray(w * h)
    private val sponge = FloatArray(w * h)
    var steps = 0

    init {
        val m = 12
        for (y in 0 until h) for (x in 0 until w) {
            val d = minOf(x, y, w - 1 - x, h - 1 - y)
            sponge[y * w + x] = if (d >= m) 1f else 1f - 0.085f * ((m - d) / m.toFloat()).pow(2)
        }
    }

    fun clear() { u.fill(0f); prev.fill(0f); intensity.fill(0f); steps = 0 }
    fun clearWalls() { wall.fill(false); c2.fill(0.25f) }

    fun step() {
        for (y in 1 until h - 1) {
            var i = y * w + 1
            for (x in 1 until w - 1) {
                if (wall[i]) nxt[i] = 0f
                else {
                    val lap = u[i - 1] + u[i + 1] + u[i - w] + u[i + w] - 4 * u[i]
                    nxt[i] = (2 * u[i] - prev[i] + c2[i] * lap) * sponge[i]
                }
                i++
            }
        }
        val t = prev; prev = u; u = nxt; nxt = t
        for (i in u.indices) intensity[i] += (u[i] * u[i] - intensity[i]) * 0.02f
        steps++
    }

    /** Soft source: adds to the field rather than overwriting it, so waves pass through undisturbed. */
    fun drive(x: Int, y: Int, value: Float) { if (x in 1 until w - 1 && y in 1 until h - 1 && !wall[y * w + x]) u[y * w + x] += value }
}

private val WavesInfo = LabInfo(
    equations = listOf(
        "\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u",
        "d\\sin\\theta = m\\lambda \\quad\\Rightarrow\\quad \\Delta y \\approx \\frac{\\lambda L}{d}",
        "\\frac{\\sin\\theta_1}{\\sin\\theta_2} = \\frac{c_1}{c_2} = n",
        "f_{\\text{beat}} = |f_1 - f_2|",
    ),
    about = "This is a ripple tank. The surface obeys the wave equation, solved here on a grid sixty times a second — interference, diffraction through slits, reflection off the walls you paint and refraction in the slow region are not drawn in, they emerge. Where crest meets crest the waves reinforce; where crest meets trough they cancel, leaving the quiet 'nodal' lines that convinced Thomas Young in 1801 that light is a wave.",
    notes = listOf(
        "The grid has finite resolution: wavelengths shorter than about 8 cells travel slightly too slowly (numerical dispersion), most noticeably along the diagonals.",
        "Edges absorb waves with a damping layer so the tank behaves as if it were open. A little reflection from the edges remains.",
        "Walls force the field to zero (a fixed boundary), so reflected waves are inverted. This is a scalar wave: it has no polarisation, unlike light.",
        "The fringe-spacing formula λL/d is the small-angle, far-field result; close to the slits the pattern is more complicated, as the simulation shows.",
    ),
)

@Composable
fun WavesLab() {
    val app = LocalApp.current
    var mode by remember { mutableIntStateOf(0) }
    var preset by remember { mutableIntStateOf(0) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    var lambda by remember { mutableFloatStateOf(11f) }
    var sepF by remember { mutableFloatStateOf(0.3f) }
    var showI by remember { mutableStateOf(false) }
    var paint by remember { mutableStateOf(false) }
    var running by remember { mutableStateOf(true) }
    var f1 by remember { mutableFloatStateOf(5f) }
    var f2 by remember { mutableFloatStateOf(5.6f) }
    var standing by remember { mutableStateOf(false) }
    val time by rememberTime(mode == 1)
    val tm = rememberTextMeasurer(cacheSize = 16)
    val path = remember { Path() }
    val gw = when (app.prefs.quality) { 0 -> 96; 2 -> 168; else -> 128 }
    val tank = remember(px, gw) { if (px.width < 8) null else WaveTank(gw, (gw.toFloat() * px.height / px.width).roundToInt().coerceIn(40, 400)) }
    val field = remember(tank) { tank?.let { PixelField(it.w, it.h) } }
    val sources = remember { mutableStateListOf<Offset>() }   // normalised positions
    var grabbed by remember { mutableIntStateOf(-1) }

    fun build() {
        val t = tank ?: return
        t.clear(); t.clearWalls(); sources.clear()
        when (preset) {
            0 -> { sources += Offset(0.5f - sepF / 2, 0.3f); sources += Offset(0.5f + sepF / 2, 0.3f) }
            1, 2 -> {
                val wy = (t.h * 0.3f).toInt()
                val gap = max(2, (lambda * 0.45f).toInt())
                val d = (sepF * t.w * 0.5f).toInt()
                for (x in 0 until t.w) {
                    val open = if (preset == 1) abs(x - t.w / 2) <= gap else (abs(x - (t.w / 2 - d)) <= gap / 2 || abs(x - (t.w / 2 + d)) <= gap / 2)
                    if (!open) { t.wall[wy * t.w + x] = true; t.wall[(wy + 1) * t.w + x] = true }
                }
            }
            3 -> for (y in 0 until t.h) for (x in 0 until t.w) if (y > t.h * 0.42f + (x - t.w / 2) * 0.0f) t.c2[y * t.w + x] = 0.25f / (1.5f * 1.5f)
            4 -> { sources += Offset(0.5f, 0.25f); val cy = (t.h * 0.62f).toInt(); for (x in 0 until t.w) { val y = cy + ((x - t.w / 2f).pow(2) / (t.w * 0.9f)).toInt(); for (k in 0..1) if (y - k in 0 until t.h) t.wall[(y - k) * t.w + x] = true } }
            else -> sources += Offset(0.5f, 0.5f)
        }
    }
    LaunchedEffect(tank, preset, sepF, if (preset == 1 || preset == 2) lambda else 0f) { build() }

    val frame = rememberTicker(running && mode == 0 && tank != null) {
        val t = tank ?: return@rememberTicker
        val omega = 2 * PI.toFloat() * 0.5f / lambda
        repeat(3) {
            val s = sin(omega * t.steps)
            for (src in sources) t.drive((src.x * t.w).toInt(), (src.y * t.h).toInt(), s * 0.9f)
            if (preset in 1..3) {
                // plane wave: a driven line; tilted for the refraction preset so that it meets the boundary at an angle
                for (x in 2 until t.w - 2) {
                    val y = if (preset == 3) (t.h * 0.08f + x * 0.38f).toInt() else 4
                    val ph = if (preset == 3) 0f else 0f
                    if (preset != 3 || x < t.w * 0.7f) t.drive(x, y, sin(omega * t.steps + ph) * 0.35f)
                }
            }
            t.step()
        }
        val f = field ?: return@rememberTicker
        val n = t.w * t.h
        for (i in 0 until n) {
            f.px[i] = if (t.wall[i]) 0xFFB8C4E0.toInt() else if (showI) {
                val v = (sqrt(t.intensity[i]) * 3.2f).coerceIn(0f, 1f)
                val r = (v * v * 255).toInt(); val g = (v * 229).toInt(); val b = (min(1f, v * 1.6f) * 255).toInt()
                (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            } else {
                val v = (t.u[i] * 2.4f).coerceIn(-1f, 1f)
                val slow = if (t.c2[i] < 0.2f) 14 else 0
                if (v >= 0) (0xFF shl 24) or ((v * v * 200).toInt() shl 16) or ((slow + v * 229).toInt().coerceAtMost(255) shl 8) or (slow * 2 + (v * 255).toInt()).coerceAtMost(255)
                else (0xFF shl 24) or ((-v * 142).toInt() shl 16) or ((slow + -v * 60).toInt() shl 8) or (slow * 2 + (-v * 255).toInt()).coerceAtMost(255)
            }
        }
        f.flush()
    }

    LabScaffold("Wave Interference", Domain.Physics, WavesInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().onSizeChanged { px = it }.plotInteract(null, key = mode to paint, onSingle = { o, ph ->
                val t = tank
                if (mode != 0 || t == null) false else {
                    val n = Offset(o.x / px.width, o.y / px.height)
                    if (paint) {
                        if (ph < 2) { val cx = (n.x * t.w).toInt(); val cy = (n.y * t.h).toInt(); for (dy in -1..1) for (dx in -1..1) { val x = cx + dx; val y = cy + dy; if (x in 1 until t.w - 1 && y in 1 until t.h - 1) { t.wall[y * t.w + x] = true; t.u[y * t.w + x] = 0f; t.prev[y * t.w + x] = 0f } } }
                        true
                    } else {
                        if (ph == 0) { grabbed = sources.indices.minByOrNull { (sources[it] - n).getDistance() } ?: -1; if (grabbed >= 0 && (sources[grabbed] - n).getDistance() > 0.12f) grabbed = -1 }
                        if (ph == 1 && grabbed >= 0) sources[grabbed] = Offset(n.x.coerceIn(0.05f, 0.95f), n.y.coerceIn(0.05f, 0.95f))
                        grabbed >= 0
                    }
                }
            }),
        ) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            if (mode == 0) {
                frame.value
                field?.let { drawField(it, additive = false) }
                for (s in sources) { val p = Offset(s.x * w, s.y * h); drawCircle(Color.Black.copy(alpha = 0.5f), 9 * dp, p); drawCircle(UE.Amber, 9 * dp, p, style = Stroke(1.6f * dp)); drawCircle(UE.Amber, 3 * dp, p) }
                if (preset == 3) label(tm, "slower medium  (n = 1.5)", w - 10 * dp, h * 0.42f + 6 * dp, UE.Text.copy(alpha = 0.8f), 10f, 1f, 0f, UE.Display)
            } else {
                val mid = h / 2; val amp = h * 0.11f
                fun y1(x: Float) = sin(2 * PI.toFloat() * (f1 * x - time * 1.2f))
                fun y2(x: Float) = if (standing) sin(2 * PI.toFloat() * (f1 * x + time * 1.2f)) else sin(2 * PI.toFloat() * (f2 * x - time * 1.2f * f2 / f1))
                for ((k, fn) in listOf<(Float) -> Float>(::y1, ::y2).withIndex()) {
                    val cy = if (k == 0) h * 0.17f else h * 0.36f
                    path.rewind(); for (i in 0..300) { val x = i / 300f; val q = Offset(x * w, cy - fn(x) * amp * 0.7f); if (i == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    drawPath(path, if (k == 0) UE.Cyan else UE.Violet, style = Stroke(1.6f * dp))
                }
                path.rewind(); for (i in 0..400) { val x = i / 400f; val q = Offset(x * w, h * 0.7f - (y1(x) + y2(x)) * amp); if (i == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                glowPath(path, UE.Text, 2.2f * dp)
                label(tm, "wave 1", 10 * dp, h * 0.06f, UE.Cyan, 10f); label(tm, "wave 2", 10 * dp, h * 0.25f, UE.Violet, 10f); label(tm, "sum", 10 * dp, h * 0.5f, UE.Text, 10f)
                drawLine(Color.White.copy(alpha = 0.12f), Offset(0f, h * 0.7f), Offset(w, h * 0.7f), 1f)
                drawLine(Color.White.copy(alpha = 0.08f), Offset(0f, mid * 0.94f), Offset(w, mid * 0.94f), 1f)
            }
        }
    }) {
        Segmented(listOf("Ripple tank", "Superposition"), mode, accent = Domain.Physics.accent) { mode = it }
        if (mode == 0) {
            ChipRow(listOf("Two sources", "Single slit", "Double slit", "Refraction", "Parabolic mirror", "One source"), preset, Domain.Physics.accent) { preset = it }
            UESlider("Wavelength λ", lambda, 6f..24f, accent = Domain.Physics.accent, format = { "${fix(it, 1)} cells" }) { lambda = it }
            if (preset == 0 || preset == 2) UESlider(if (preset == 0) "Source separation d" else "Slit separation d", sepF, 0.08f..0.6f, accent = UE.Amber, format = { "${fix(it * (tank?.w ?: 100) * (if (preset == 2) 1f else 1f), 0)} cells" }) { sepF = it }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Toggle("Time-averaged intensity", showI, accent = UE.Cyan) { showI = it }
                Toggle("Paint walls", paint, accent = UE.Amber) { paint = it }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlowButton(if (running) "Pause" else "Run", accent = Domain.Physics.accent) { running = !running }
                GlowButton("Still water", accent = UE.Dim) { tank?.clear() }
                GlowButton("Remove walls", accent = UE.Dim) { build() }
            }
            val t = tank
            if (t != null && (preset == 0 || preset == 2)) {
                val d = sepF * t.w * (if (preset == 2) 1f else 1f)
                ReadoutRow { Stat("d / λ", fix(d / lambda, 2), UE.Amber); Stat("nodal lines", (2 * floor(d / lambda + 0.5f)).toInt().toString(), UE.Cyan); Stat("first minimum at", fix(asin((lambda / (2 * d)).coerceAtMost(1f)) * 180 / PI.toFloat(), 1) + "°", UE.Violet) }
            }
            Note(when (preset) { 0 -> "Drag the sources. Quiet channels fan out where the path difference is a half-integer number of wavelengths; switch to intensity to see them as dark lines."
                1 -> "A wave squeezed through a gap spreads out again — the narrower the gap relative to λ, the wider the spread. That is diffraction."
                2 -> "Young's experiment. Each slit becomes a new source and the two interfere into bright and dark fringes."
                3 -> "Below the boundary the wave travels 1.5× slower. The crests bunch up and the wave turns toward the normal, exactly as Snell's law demands."
                4 -> "Circular waves from the focus of a parabola reflect into flat wavefronts — the principle of every satellite dish and car headlight."
                else -> "Paint walls with a finger to build your own slits, mirrors and resonators." })
        } else {
            UESlider("Wave 1 frequency", f1, 2f..9f, accent = UE.Cyan, format = { fix(it, 2) }) { f1 = it }
            if (!standing) UESlider("Wave 2 frequency", f2, 2f..9f, accent = UE.Violet, format = { fix(it, 2) }) { f2 = it }
            Toggle("Send wave 2 the opposite way (standing wave)", standing, accent = UE.Violet) { standing = it }
            ReadoutRow { if (standing) { Stat("nodes per unit", fix(2 * f1, 1), UE.Amber); Stat("node spacing", "λ / 2") } else { Stat("beat frequency", fix(abs(f1 - f2), 2), UE.Amber); Stat("carrier", fix((f1 + f2) / 2, 2)) } }
            Note(if (standing) "Two identical waves travelling in opposite directions add up to a wave that does not travel at all: fixed nodes, and antinodes swinging between them. Every guitar string and organ pipe works this way." else "Two close frequencies drift in and out of step, so the sum swells and fades |f₁ − f₂| times per unit — the beats musicians listen for when tuning.")
        }
    }
}
