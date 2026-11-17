package dev.universe.engine.astro

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

private class GalaxyModel(n: Int, seed: Int) {
    val r = FloatArray(n); val phase0 = FloatArray(n); val ecc = FloatArray(n); val z = FloatArray(n); val kind = IntArray(n); val bright = FloatArray(n)
    init {
        val rnd = Random(seed)
        for (i in 0 until n) {
            val u = rnd.nextFloat()
            kind[i] = when { u < 0.14f -> 0; u < 0.95f -> 1; else -> 2 }        // bulge, disc, star-forming knots / dust tracers
            r[i] = when (kind[i]) { 0 -> (-ln(1 - rnd.nextFloat() * 0.98f) * 0.09f).coerceAtMost(0.5f); else -> (0.04f + -ln(1 - rnd.nextFloat() * 0.985f) * 0.35f).coerceAtMost(1.15f) }
            // star-forming knots sit where the orbits crowd (the minor-axis ends); everything else is spread round its orbit
            phase0[i] = if (kind[i] == 2) (if (rnd.nextBoolean()) 0.5f else -0.5f) * PI.toFloat() + (rnd.nextFloat() - 0.5f) * 0.35f else rnd.nextFloat() * 2 * PI.toFloat()
            ecc[i] = 0.75f + rnd.nextFloat() * 0.25f
            z[i] = ((rnd.nextFloat() - 0.5f) * (if (kind[i] == 0) 0.26f else 0.035f)) * (if (kind[i] == 0) 1f else (1.2f - r[i]))
            bright[i] = rnd.nextFloat()
        }
    }
}

private class GalaxyType(val name: String, val twist: Float, val qIn: Float, val qOut: Float, val bar: Float, val arms: Float, val note: String)
private val TYPES = listOf(
    GalaxyType("Milky Way", 5.2f, 0.6f, 0.75f, 0.12f, 1f, "A barred spiral about 100,000 light-years across, with a few hundred billion stars. The Sun sits about 26,000 light-years from the centre, in the Orion Spur."),
    GalaxyType("Grand design", 6f, 0.55f, 0.65f, 0f, 1f, "Two crisp arms winding all the way out, like the Whirlpool Galaxy M51 — often driven by a passing companion galaxy."),
    GalaxyType("Loose spiral", 3.2f, 0.5f, 0.72f, 0f, 1f, "Open arms and a small bulge (type Sc). Loose spirals are rich in gas and busy making new stars."),
    GalaxyType("Barred", 4.5f, 0.55f, 0.75f, 0.3f, 1f, "A bar of stars across the centre funnels gas inward; about two-thirds of nearby spirals have one."),
    GalaxyType("Elliptical", 0f, 1f, 1f, 0f, 0f, "No disc, no arms: an old, round swarm of stars on random orbits, usually the product of galaxy mergers."),
)

private val GalaxyInfo = LabInfo(
    equations = listOf(
        "\\Omega_p = \\text{const}, \\qquad \\theta_0(r) = k\\, r",
        "v_{\\text{circ}}(r) = \\sqrt{\\frac{G M(<r)}{r}}",
        "M_{\\text{halo}}(<r) \\propto r \\quad\\Rightarrow\\quad v_{\\text{circ}} \\approx \\text{const}",
    ),
    about = "Spiral arms are not fixed structures but traffic jams. In the density-wave picture of Lin and Shu, every star follows an ordinary, slightly elliptical orbit; the ellipses are each rotated a little more than the one inside them, and where they crowd together we see an arm. Stars drift into an arm, linger, and drift out — so the arms persist while the stars move through them. The rotation curve tells a second story: if only the visible stars and gas held the galaxy together, the outer stars would orbit much more slowly than they do. The flat curve we observe requires a halo of unseen dark matter.",
    notes = listOf(
        "This is a kinematic model in the style of the classic density-wave visualisations: stars are placed on prescribed elliptical orbits rather than moving under their mutual gravity, which would require a full N-body simulation.",
        "The visible-matter rotation curve is a simple exponential-disc approximation and the dark-matter curve a pseudo-isothermal halo; real galaxies have measured curves with more structure.",
        "Colours are schematic: the bulge and old disc stars are yellower, while young blue stars and pink glowing hydrogen trace the arms.",
    ),
)

@Composable
fun GalaxyLab() {
    val app = LocalApp.current
    var type by remember { mutableIntStateOf(0) }
    var twist by remember { mutableFloatStateOf(TYPES[0].twist) }
    var dark by remember { mutableStateOf(true) }
    var speed by remember { mutableFloatStateOf(1f) }
    var mode by remember { mutableIntStateOf(0) }
    val n = (5200 * app.prefs.q).roundToInt()
    val model = remember(n) { GalaxyModel(n, 3) }
    val cam = remember { Cam3(0.2f, 0.95f, 1.75f, 1.25f) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val stars = remember { StarData(120, 51) }
    var t by remember { mutableFloatStateOf(0f) }
    val frame = rememberTicker(true) { dt -> t += dt * speed * 0.15f }
    val buckets = remember { Array(6) { ArrayList<Offset>(n / 3) } }
    val out = remember { FloatArray(4) }
    val g = TYPES[type]
    fun vcirc(r: Float, withDark: Boolean): Float {
        val rd = 0.22f
        val x = r / rd
        val disc = sqrt((1 - exp(-x) * (1 + x)) / max(r, 1e-3f)) * 0.62f
        val halo = if (withDark) sqrt(1 - atan(r / 0.25f) / (r / 0.25f).coerceAtLeast(1e-3f)) * 0.95f else 0f
        return sqrt(disc * disc + halo * halo)
    }

    LabScaffold("Galaxies", Domain.Astro, GalaxyInfo, canvas = {
        Canvas(Modifier.fillMaxSize().orbitGestures(cam, 0.9f, 6f)) {
            frame.value
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            drawStars(stars, t, 0.0005f, 0.6f)
            if (mode == 0) {
                cam.begin(w, h, 0.5f)
                for (b in buckets) b.clear()
                val armK = if (g.arms > 0f) twist else 0f
                for (i in 0 until n) {
                    val r = model.r[i]
                    val e = if (g.arms > 0f) g.qIn + (g.qOut - g.qIn) * (r / 1.2f) else 0.65f + 0.35f * model.ecc[i]
                    val bar = if (r < 0.35f) g.bar * (1 - r / 0.35f) else 0f
                    val tilt = (if (g.arms > 0f) armK * r else model.phase0[i] * 7.1f) + (0f)
                    val omega = vcirc(r.coerceAtLeast(0.02f), dark) / r.coerceAtLeast(0.02f)
                    val th = if (model.kind[i] == 2 && g.arms > 0f) model.phase0[i] else model.phase0[i] + omega * t
                    val a = r; val b = r * (e - bar).coerceIn(0.25f, 1f)
                    val lx = a * cos(th); val ly = b * sin(th)
                    val x = lx * cos(tilt) - ly * sin(tilt); val y = lx * sin(tilt) + ly * cos(tilt)
                    if (!cam.project(x, model.z[i] * (if (g.arms > 0f) 1f else 5f) * (1f + 3f * (if (g.arms > 0f) 0f else 1f)), y, out)) continue
                    val bk = when (model.kind[i]) {
                        0 -> 0
                        2 -> if (g.arms > 0f) 5 else 1
                        else -> if (g.arms > 0f) (if (model.bright[i] > 0.85f) 4 else if (r < 0.45f) 1 else if (model.bright[i] > 0.55f) 3 else 2) else 1
                    }
                    buckets[bk] += Offset(out[0], out[1])
                }
                val cols = listOf(Color(0xFFFFD9A0), Color(0xFFFFF0D6), Color(0xFFBFD4FF), Color(0xFF9EC0FF), Color(0xFFDDEBFF), Color(0xFFFF6FB0))
                val sizes = floatArrayOf(2.2f, 1.8f, 1.5f, 1.7f, 2.4f, 2.6f)
                cam.project(0f, 0f, 0f, out)
                val c = Offset(out[0], out[1]); val R = out[3] * 0.35f
                drawCircle(Brush.radialGradient(listOf(Color(0xFFFFE2B0).copy(alpha = 0.35f), Color(0xFFFF9F60).copy(alpha = 0.08f), Color.Transparent), c, R * 1.3f), R * 1.3f, c, blendMode = BlendMode.Plus)
                for (k in 0 until 6) {
                    val dim = if (k <= 1) 0.45f else 1f
                    drawPoints(buckets[k], PointMode.Points, cols[k].copy(alpha = (if (k == 5) 0.2f else 0.07f) * dim), sizes[k] * 2.6f * dp, StrokeCap.Round, blendMode = BlendMode.Plus)
                    drawPoints(buckets[k], PointMode.Points, cols[k].copy(alpha = (if (k == 5) 0.7f else 0.6f) * dim), sizes[k] * dp * 0.75f, StrokeCap.Round, blendMode = BlendMode.Plus)
                }
                if (type == 0) {
                    // the Sun: on a disc star orbit at 0.52 of the radius
                    val r = 0.52f; val th = 1.2f + vcirc(r, dark) / r * t
                    if (cam.project(r * cos(th), 0f, r * sin(th), out)) { glowDot(Offset(out[0], out[1]), UE.Amber, 3.5f * dp); label(tm, "Sun", out[0] + 6 * dp, out[1], UE.Amber, 9.5f, 0f, 0.5f, UE.Display) }
                }
            } else {
                val left = 46 * dp; val right = w - 16 * dp; val top = h * 0.12f; val bot = h * 0.82f
                fun X(r: Float) = left + (right - left) * r / 1.2f
                fun Y(v: Float) = bot - (bot - top) * v / 1.25f
                drawRect(Color.White.copy(alpha = 0.03f), Offset(left, top), Size(right - left, bot - top))
                for (kly in 0..5) { val r = kly * 0.2f; label(tm, "${kly * 10}k ly", X(r), bot + 4 * dp, UE.Dim, 9f, 0.5f, 0f) }
                for (v in listOf(0.25f, 0.5f, 0.75f, 1f)) { drawLine(Color.White.copy(alpha = 0.06f), Offset(left, Y(v)), Offset(right, Y(v)), 1f); label(tm, "${(v * 230).roundToInt()} km/s", left - 4 * dp, Y(v), UE.Dim, 8.5f, 1f, 0.5f) }
                for ((withDark, col) in listOf(false to UE.Amber, true to UE.Cyan)) {
                    path.rewind(); for (k in 1..120) { val r = 1.2f * k / 120f; val q = Offset(X(r), Y(vcirc(r, withDark))); if (k == 1) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    if (withDark) glowPath(path, col, 2 * dp) else drawPath(path, col, style = Stroke(1.8f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp))))
                }
                // "observed" points with scatter
                val rnd = Random(2)
                for (k in 0 until 26) { val r = 0.08f + k * 0.043f; val v = vcirc(r, true) * (1 + (rnd.nextFloat() - 0.5f) * 0.06f); drawCircle(UE.Text, 2.6f * dp, Offset(X(r), Y(v))); drawLine(UE.Text.copy(alpha = 0.5f), Offset(X(r), Y(v - 0.03f)), Offset(X(r), Y(v + 0.03f)), dp) }
                label(tm, "measured (illustrative)", right, Y(1.12f), UE.Text, 9.5f, 1f, 1f)
                label(tm, "with dark-matter halo", right, Y(vcirc(1.2f, true)) + 6 * dp, UE.Cyan, 9.5f, 1f, 0f)
                label(tm, "visible matter only", right, Y(vcirc(1.2f, false)) - 6 * dp, UE.Amber, 9.5f, 1f, 1f)
            }
        }
    }) {
        Segmented(listOf("Galaxy", "Rotation curve"), mode, accent = Domain.Astro.accent) { mode = it }
        ChipRow(TYPES.map { it.name }, type, Domain.Astro.accent) { type = it; twist = TYPES[it].twist }
        if (TYPES[type].arms > 0f) UESlider("Arm winding (orbit twist)", twist, 0f..10f, accent = UE.Violet, format = { fix(it, 1) }) { twist = it }
        UESlider("Time", speed, 0f..4f, accent = Domain.Astro.accent, format = { "×${fix(it, 1)}" }) { speed = it }
        Toggle("Dark-matter halo", dark, accent = UE.Cyan) { dark = it }
        ReadoutRow { Stat("stars drawn", groupDigits(n.toLong())); Stat("Sun's orbit", if (dark) "≈ 230 Myr" else "≈ 330 Myr", UE.Amber); Stat("halo mass", if (dark) "≈ 85 % of total" else "none", UE.Cyan) }
        Note(if (!dark) "Without the halo the outer disc rotates far more slowly than inside — the arms shear and wind up, and real galaxies are not observed to do this." else TYPES[type].note)
    }
}
