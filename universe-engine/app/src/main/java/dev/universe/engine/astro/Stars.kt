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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

fun bbColor(kelvin: Double): Color { val c = Num.blackbody(kelvin); return Color(c[0], c[1], c[2]) }

/** Zero-age main-sequence luminance, radius and lifetime for mass M (solar units). Simple power-law fits. */
internal fun msLum(m: Double) = when { m < 0.43 -> 0.23 * m.pow(2.3); m < 2 -> m.pow(4.0); else -> 1.4 * m.pow(3.5) }
internal fun msRad(m: Double) = if (m < 1) m.pow(0.8) else m.pow(0.57)
internal fun msTemp(m: Double) = 5772 * (msLum(m) / msRad(m).pow(2)).pow(0.25)
internal fun msLifeYears(m: Double) = 1e10 * m.pow(-2.5)

/** A schematic evolutionary path: (log T, log L, log R) at stage boundaries, with the fraction of total life spent getting there. */
internal class Stage(val name: String, val t: Double, val L: Double, val R: Double, val fracEnd: Double, val desc: String)

internal fun lifeStages(m: Double): List<Stage> {
    val L0 = msLum(m); val R0 = msRad(m); val T0 = msTemp(m)
    val tms = msLifeYears(m)
    val out = ArrayList<Stage>()
    out += Stage("Main sequence", T0, L0, R0, 0.0, "Fusing hydrogen into helium in the core. A star spends about 90 % of its life here, slowly brightening.")
    out += Stage("Main sequence (late)", T0 * 0.94, L0 * 1.8, R0 * 1.5, 0.9, "The core hydrogen is running out. The star has grown a little larger and brighter.")
    when {
        m < 0.5 -> {
            out += Stage("Red dwarf (end)", T0 * 1.6, L0 * 4, R0 * 0.8, 1.0, "Fully convective: the star stirs all of its hydrogen into the core and burns it for trillions of years. None has yet died — the Universe is too young.")
            out += Stage("Helium white dwarf", 9000.0, 1e-3, 0.015, 1.0, "Predicted end: a helium white dwarf the size of Earth, slowly cooling.")
        }
        m < 8 -> {
            out += Stage("Subgiant", T0 * 0.8, L0 * 2.5, R0 * 2.6, 0.93, "Hydrogen now burns in a shell around an inert helium core. The envelope begins to swell.")
            out += Stage("Red giant", 4100.0, L0 * 60 + 100, 40 * m.pow(0.4) + 10, 0.985, "The envelope balloons to a hundred times the Sun's radius and cools to orange-red. When the Sun reaches this stage it will engulf Mercury and Venus.")
            out += Stage("Helium flash / horizontal branch", 5200.0, L0 * 20 + 50, 10.0, 0.99, "The core reaches 100 million K and ignites helium, fusing it into carbon and oxygen.")
            out += Stage("Asymptotic giant", 3300.0, L0 * 200 + 3000, 200 * m.pow(0.3), 0.998, "Two burning shells; strong winds strip the outer layers. Carbon dredged up from the core enriches the galaxy.")
            out += Stage("Planetary nebula", 100000.0, L0 * 100 + 3000, 0.05, 0.999, "The ejected envelope glows, lit by the exposed hot core: a planetary nebula, lasting a few tens of thousands of years.")
            out += Stage("White dwarf", 20000.0, 0.01, 0.012, 1.0, "An Earth-sized ember of carbon and oxygen, held up by electron degeneracy pressure. A teaspoon weighs a few tonnes. It cools for billions of years.")
        }
        else -> {
            out += Stage("Blue supergiant", T0 * 0.7, L0 * 1.4, R0 * 3, 0.92, "Shell hydrogen burning. The star crosses the top of the diagram in a few thousand years.")
            out += Stage("Red supergiant", 3600.0, L0 * 1.5, 600.0 + 30 * m, 0.99, "Betelgeuse-like: a bloated red supergiant. Its core fuses ever heavier elements — carbon, neon, oxygen, silicon — each stage faster than the last.")
            out += Stage("Core collapse supernova", 30000.0, 1e9, 1e5, 0.9995, "An iron core cannot release energy by fusion. It collapses in under a second, rebounds, and the star explodes, outshining its entire galaxy for weeks.")
            if (m < 20) out += Stage("Neutron star", 600000.0, 0.1, 1.7e-5, 1.0, "A city-sized ball of neutrons, 1.4 solar masses packed into ~12 km, spinning many times a second.")
            else out += Stage("Black hole", 0.0, 0.0, 1.3e-5 * m / 3, 1.0, "The core is too massive for any pressure to stop the collapse. It forms a black hole.")
        }
    }
    // assign stage ages
    return out.map { Stage(it.name, it.t, it.L, it.R, it.fracEnd * tms * (if (m < 0.5 && it.name.startsWith("Helium")) 100.0 else 1.0), it.desc) }
}

private val StarsInfo = LabInfo(
    equations = listOf(
        "L = 4\\pi R^2 \\sigma T^4",
        "L \\propto M^{3.5}, \\qquad t_{\\text{MS}} \\approx 10^{10}\\,\\text{yr} \\left(\\frac{M}{M_\\odot}\\right)^{-2.5}",
        "M_{\\text{Ch}} \\approx 1.4\\,M_\\odot",
    ),
    about = "A star's whole life is decided at birth by its mass. Heavier stars burn hotter and brighter and use up their hydrogen much faster: a star 20 times the Sun's mass lives a thousand times shorter. The Hertzsprung–Russell diagram plots brightness against surface temperature; stars spend most of their lives on the diagonal 'main sequence', then swell into giants. Below about 8 solar masses the end is a white dwarf; above, a supernova leaves a neutron star or a black hole.",
    notes = listOf(
        "Luminosity, radius and temperature on the main sequence come from simple power-law fits. The evolutionary paths after the main sequence are schematic sketches through the right regions of the diagram, not results of stellar-structure models.",
        "The boundaries between fates (0.5, 8 and ~20 solar masses) are approximate; mass loss, rotation, metallicity and binary companions all move them.",
        "Temperatures are mapped to black-body colours. The star sizes on screen are logarithmic: real supergiants are a billion times larger in volume than white dwarfs.",
    ),
)

private val FAMOUS = listOf("Proxima Cen" to 0.12f, "Sun" to 1f, "Sirius A" to 2.06f, "Vega" to 2.1f, "Rigel" to 21f, "Betelgeuse" to 18f, "Eta Carinae" to 40f)

@Composable
fun StarsLab() {
    var mass by remember { mutableFloatStateOf(1f) }
    var progress by remember { mutableFloatStateOf(0f) }
    var playing by remember { mutableStateOf(false) }
    val stages = remember(mass) { lifeStages(mass.toDouble()) }
    val tm = rememberTextMeasurer(cacheSize = 64)
    val path = remember { Path() }
    val pop = remember {
        val r = java.util.Random(4); List(420) { val m = exp(ln(0.1) + (ln(30.0) - ln(0.1)) * r.nextDouble().pow(2.2)); val giant = r.nextFloat() < 0.08f
            val t = if (giant) 3500 + r.nextDouble() * 2000 else msTemp(m) * (1 + r.nextGaussian() * 0.04); val l = if (giant) 50 + r.nextDouble() * 900 else msLum(m) * exp(r.nextGaussian() * 0.25); Triple(t, l, giant) }
    }
    val wd = remember { val r = Random(8); List(40) { Pair(7000 + r.nextDouble() * 20000, 1e-4 * exp(r.nextDouble() * 4)) } }
    rememberTicker(playing) { dt -> progress = (progress + dt * 0.06f).coerceAtMost(1f); if (progress >= 1f) playing = false }
    val time by rememberTime()

    // interpolate state along the stage list; progress maps nonlinearly to time so short phases are visible
    val n = stages.size
    val fpos = progress * (n - 1)
    val k = floor(fpos).toInt().coerceIn(0, n - 2); val f = (fpos - k).toDouble()
    val a = stages[k]; val b = stages[k + 1]
    val logT = if (b.t <= 0) ln(a.t) else ln(a.t) + (ln(b.t) - ln(a.t)) * f
    val logL = if (b.L <= 0) ln(a.L) else ln(a.L) + (ln(b.L) - ln(a.L)) * f
    val logR = ln(a.R) + (ln(b.R) - ln(a.R)) * f
    val age = a.fracEnd + (b.fracEnd - a.fracEnd) * f
    val cur = if (f < 0.5) a else b
    val isBH = cur.name == "Black hole" && f > 0.5
    val boom = if (b.name.startsWith("Core collapse")) f.toFloat() else if (a.name.startsWith("Core collapse")) (1 - f).toFloat() else 0f

    LabScaffold("Life of a Star", Domain.Astro, StarsInfo, canvas = {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            // star portrait
            val c = Offset(w / 2, h * 0.22f)
            val pr = (h * 0.035f * (1 + (logR / ln(10.0)).toFloat() * 0.55f + 2.8f)).coerceIn(3 * dp, h * 0.17f)
            if (isBH) {
                drawCircle(Brush.radialGradient(listOf(Color.Transparent, UE.Amber.copy(alpha = 0.5f), Color.Transparent), c, h * 0.08f), h * 0.08f, c)
                drawCircle(Color.Black, h * 0.04f, c); drawCircle(UE.Amber.copy(alpha = 0.8f), h * 0.042f, c, style = Stroke(1.5f * dp))
            } else {
                val col = bbColor(exp(logT))
                val glow = if (cur.name.startsWith("Planetary")) 3.5f else 2.2f
                if (cur.name.startsWith("Planetary")) for (q in 0 until 3) drawCircle(listOf(UE.Cyan, UE.Magenta, UE.Green)[q].copy(alpha = 0.18f), pr * (5f + q * 1.6f) + q * 6 * dp * sin(time + q), c, style = Stroke(10 * dp), blendMode = BlendMode.Plus)
                drawCircle(Brush.radialGradient(listOf(col.copy(alpha = 0.6f), Color.Transparent), c, pr * glow), pr * glow, c, blendMode = BlendMode.Plus)
                drawCircle(Brush.radialGradient(listOf(Color.White, col, col.copy(alpha = 0.8f)), c, pr), pr, c)
                // convection granules
                if (pr > 14 * dp) for (q in 0 until 14) { val ang = q * 2.4f + time * 0.07f; val rr = pr * (0.25f + 0.6f * ((q * 0.37f) % 1f)); drawCircle(Color.Black.copy(alpha = 0.035f), pr * 0.2f, c + Offset(cos(ang) * rr, sin(ang) * rr)) }
            }
            if (boom > 0f) drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = boom), UE.Cyan.copy(alpha = boom * 0.5f), Color.Transparent), c, h * 0.35f * boom + 1), h * 0.35f * boom + 1, c, blendMode = BlendMode.Plus)
            label(tm, cur.name, c.x, h * 0.42f, UE.Text, 13f, 0.5f, 0f, UE.Display, FontWeight.Medium)
            // HR diagram
            val left = 40 * dp; val right = w - 12 * dp; val top = h * 0.49f; val bot = h - 22 * dp
            fun X(t: Double) = (left + (right - left) * ((ln(45000.0) - ln(t)) / (ln(45000.0) - ln(2300.0)))).toFloat()
            fun Y(l: Double) = (bot - (bot - top) * ((log10(l) + 4.5) / 11.0)).toFloat()
            drawRect(Color.White.copy(alpha = 0.03f), Offset(left, top), Size(right - left, bot - top))
            for (e in -4..6 step 2) { drawLine(Color.White.copy(alpha = 0.06f), Offset(left, Y(10.0.pow(e))), Offset(right, Y(10.0.pow(e))), 1f); label(tm, "10${superscript(e)}", left - 4 * dp, Y(10.0.pow(e)), UE.Dim, 8.5f, 1f, 0.5f) }
            for (t in listOf(30000.0, 10000.0, 6000.0, 3000.0)) label(tm, "${groupDigits(t.toLong())} K", X(t), bot + 3 * dp, UE.Dim, 8.5f, 0.5f, 0f)
            label(tm, "luminosity (L☉)", left + 4 * dp, top + 3 * dp, UE.Dim, 8.5f)
            val pts = Array(5) { ArrayList<Offset>() }
            for ((t, l, _) in pop) { val bucket = ((ln(t) - ln(2500.0)) / (ln(40000.0) - ln(2500.0)) * 5).toInt().coerceIn(0, 4); pts[bucket] += Offset(X(t), Y(l)) }
            for (q in 0 until 5) drawPoints(pts[q], PointMode.Points, bbColor(2500.0 * (16.0).pow((q + 0.5) / 5)).copy(alpha = 0.55f), 3 * dp, StrokeCap.Round)
            drawPoints(wd.map { Offset(X(it.first), Y(it.second)) }, PointMode.Points, Color.White.copy(alpha = 0.4f), 2.4f * dp, StrokeCap.Round)
            label(tm, "main sequence", X(9000.0), Y(msLum(2.3)) - 14 * dp, UE.Dim, 9f, 0.5f, 1f); label(tm, "giants", X(4200.0), Y(300.0) - 10 * dp, UE.Dim, 9f, 0.5f, 1f); label(tm, "white dwarfs", X(14000.0), Y(3e-4) + 8 * dp, UE.Dim, 9f, 0.5f, 0f)
            path.rewind()
            var started = false
            for (s in stages) { if (s.t <= 0 || s.L > 1e7) continue; val q = Offset(X(s.t), Y(s.L)); if (!started) { path.moveTo(q.x, q.y); started = true } else path.lineTo(q.x, q.y) }
            drawPath(path, UE.Amber.copy(alpha = 0.6f), style = Stroke(1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 4 * dp))))
            if (!isBH && exp(logL) < 1e7) glowDot(Offset(X(exp(logT)), Y(exp(logL))), bbColor(exp(logT)), 6 * dp)
        }
    }) {
        UESlider("Mass at birth", mass, 0.1f..40f, log = true, accent = Domain.Astro.accent, format = { "${fmt(it, 3)} M☉" }) { mass = it; progress = 0f; playing = false }
        ChipRow(FAMOUS.map { it.first }, FAMOUS.indexOfFirst { abs(it.second - mass) < 0.01f }, Domain.Astro.accent) { mass = FAMOUS[it].second; progress = 0f; playing = false }
        UESlider("Life stage", progress, 0f..1f, accent = UE.Amber, format = { "${(it * 100).roundToInt()} %" }) { progress = it; playing = false }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlowButton(if (playing) "Pause" else "Play its life", accent = Domain.Astro.accent, filled = !playing) { if (progress >= 1f) progress = 0f; playing = !playing }
            GlowButton("Back to birth", accent = UE.Dim) { progress = 0f; playing = false }
        }
        ReadoutRow {
            Stat("age", fmt(age, 3) + " yr", UE.Amber); Stat("surface", if (isBH) "—" else "${groupDigits(exp(logT).roundToLong())} K", bbColor(exp(logT).coerceAtLeast(1000.0)))
            Stat("luminosity", if (isBH) "—" else fmt(exp(logL), 3) + " L☉"); Stat("radius", fmt(exp(logR), 3) + " R☉")
        }
        ReadoutRow { Stat("main-sequence life", fmt(msLifeYears(mass.toDouble()), 3) + " years", Domain.Astro.accent); Stat("fate", stages.last().name, UE.Violet) }
        Note(cur.desc)
    }
}
