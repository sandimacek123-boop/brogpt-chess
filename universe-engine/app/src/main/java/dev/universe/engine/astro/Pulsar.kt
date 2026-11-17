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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*

private class Psr(val name: String, val period: Double, val note: String)
private val PULSARS = listOf(
    Psr("PSR B1919+21", 1.3373, "The first pulsar, found by Jocelyn Bell Burnell in 1967 and briefly nicknamed LGM-1, 'little green men'."),
    Psr("Vela", 0.0893, "The remnant of a supernova seen about 11,000 years ago. It occasionally 'glitches', suddenly spinning faster."),
    Psr("Crab", 0.0334, "Born in the supernova recorded by Chinese astronomers in 1054. It powers the glowing Crab Nebula."),
    Psr("PSR J0437−4715", 0.005757, "One of the most precise clocks in the sky: a recycled millisecond pulsar, spun up by its companion."),
    Psr("PSR J1748−2446ad", 0.001396, "The fastest-spinning pulsar known: 716 rotations per second. Its equator moves at about a quarter of the speed of light."),
)

private val PulsarInfo = LabInfo(
    equations = listOf(
        "\\rho \\approx \\frac{1.4\\,M_\\odot}{\\tfrac{4}{3}\\pi (12\\,\\text{km})^3} \\approx 4 \\times 10^{17}\\ \\text{kg m}^{-3}",
        "v_{\\text{eq}} = \\frac{2\\pi R}{P}, \\qquad g = \\frac{GM}{R^2}, \\qquad v_{\\text{esc}} = \\sqrt{\\frac{2GM}{R}}",
        "\\cos\\psi = \\cos\\alpha\\cos\\zeta + \\sin\\alpha\\sin\\zeta\\cos\\Omega t",
    ),
    about = "When a massive star's core collapses, it can stop at the density of an atomic nucleus: a neutron star, about 12 km across but heavier than the Sun. Conservation of angular momentum makes it spin fast, and its magnetic field — a trillion times Earth's — funnels radiation into two beams around the magnetic poles. If the magnetic axis is tilted, the beams sweep round like a lighthouse, and if one crosses Earth we see a pulse every rotation.",
    notes = listOf(
        "The model assumes a 1.4 M☉, 12 km neutron star; the true radius is known only to within a kilometre or two.",
        "Each beam is modelled as a cone of fixed angular width with a smooth brightness profile; real pulse profiles are richer and differ from radio to gamma rays.",
        "Speeds and gravity are Newtonian. Near a neutron star general relativity matters: escape speed is a sizeable fraction of c, light bends noticeably and clocks run about 20 % slow at the surface.",
        "The on-screen rotation is slowed down for fast pulsars so you can follow it; the pulse trace uses the true period scaled to the time axis shown.",
    ),
)

@Composable
fun PulsarLab() {
    var period by remember { mutableDoubleStateOf(1.3373) }
    var alpha by remember { mutableFloatStateOf(45f) }
    var zeta by remember { mutableFloatStateOf(55f) }
    var beamW by remember { mutableFloatStateOf(14f) }
    var pick by remember { mutableIntStateOf(0) }
    val haptics = LocalHaptics.current
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val cam = remember { Cam3(0.0f, 0.25f, 7f, 1.6f) }
    val stars = remember { StarData(140, 33) }
    var phase by remember { mutableDoubleStateOf(0.0) }
    var lastPulse by remember { mutableIntStateOf(0) }
    // visual rotation rate: true rate if ≥ 0.25 s, otherwise slowed to ~2 turns/s
    val visualPeriod = max(period, 0.5)
    val time by rememberTime()
    rememberTicker(true) { dt ->
        phase += dt / visualPeriod * 2 * PI
        val turns = (phase / (2 * PI)).toInt()
        if (period >= 0.15 && turns != lastPulse) { lastPulse = turns; haptics.tick() }
    }
    val a = alpha * PI / 180; val z = zeta * PI / 180; val bw = beamW * PI / 180
    /** Received intensity at rotation phase [ph]: two Gaussian beams around the ±magnetic poles. */
    fun intensity(ph: Double): Double {
        val c1 = (cos(a) * cos(z) + sin(a) * sin(z) * cos(ph)).coerceIn(-1.0, 1.0)
        val psi1 = acos(c1); val psi2 = acos(-c1)
        return exp(-(psi1 / bw).pow(2) * 1.5) + 0.7 * exp(-(psi2 / bw).pow(2) * 1.5)
    }

    LabScaffold("Neutron Stars and Pulsars", Domain.Astro, PulsarInfo, canvas = {
        Canvas(Modifier.fillMaxSize().orbitGestures(cam, 3f, 20f)) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            drawStars(stars, time, 0.001f, 0.7f)
            cam.begin(w, h * 0.68f, 0.5f)
            val out = FloatArray(4)
            val ph = phase
            // magnetic axis direction in 3D: tilted by α from the spin axis (y), rotating about y
            val mx = (sin(a) * cos(ph)).toFloat(); val my = cos(a).toFloat(); val mz = (sin(a) * sin(ph)).toFloat()
            // beams: cones drawn as fans of lines
            for (sgn in listOf(1f, -1f)) {
                for (k in 0 until 26) {
                    val t = k / 26f * 2 * PI.toFloat()
                    // vector perpendicular to m
                    val ux = -mz; val uy = 0f; val uz = mx; val ul = hypot(ux, uz).coerceAtLeast(1e-4f)
                    val vx = my * uz / ul - 0f; val vy = mz * ux / ul - mx * uz / ul; val vz = -my * ux / ul
                    val s = tan(bw.toFloat())
                    val dx = sgn * mx + s * (cos(t) * ux / ul + sin(t) * vx); val dy = sgn * my + s * (sin(t) * vy); val dz = sgn * mz + s * (cos(t) * uz / ul + sin(t) * vz)
                    val L = 3.6f
                    if (cam.project(sgn * mx * 0.9f, sgn * my * 0.9f, sgn * mz * 0.9f, out)) {
                        val p0 = Offset(out[0], out[1])
                        if (cam.project(dx * L, dy * L, dz * L, out)) drawLine(UE.Cyan.copy(alpha = 0.07f), p0, Offset(out[0], out[1]), 6 * dp, blendMode = BlendMode.Plus)
                    }
                }
            }
            // spin axis
            if (cam.project(0f, -2.4f, 0f, out)) { val p0 = Offset(out[0], out[1]); if (cam.project(0f, 2.4f, 0f, out)) drawLine(Color.White.copy(alpha = 0.25f), p0, Offset(out[0], out[1]), dp) }
            // magnetic field lines (dipole loops in planes containing m)
            for (k in 0 until 6) {
                val rot = k / 6f * PI.toFloat()
                path.rewind(); var pen = false
                for (q in 0..60) {
                    val th = 0.18f + (PI.toFloat() - 0.36f) * q / 60f
                    val r = 2.2f * sin(th).pow(2) + 0.0f
                    // local frame: m and a perpendicular rotated by rot
                    val ux = -mz; val uz = mx; val ul = hypot(ux, uz).coerceAtLeast(1e-4f)
                    val px = (cos(rot) * ux / ul) ; val pz = (cos(rot) * uz / ul); val py = sin(rot)
                    val x = r * (cos(th) * mx + sin(th) * px); val y = r * (cos(th) * my + sin(th) * py); val zz = r * (cos(th) * mz + sin(th) * pz)
                    if (cam.project(x, y, zz, out)) { if (pen) path.lineTo(out[0], out[1]) else path.moveTo(out[0], out[1]); pen = true }
                }
                drawPath(path, UE.Violet.copy(alpha = 0.35f), style = Stroke(dp))
            }
            // the star
            if (cam.project(0f, 0f, 0f, out)) {
                val c = Offset(out[0], out[1]); val r = 0.55f * out[3]
                drawCircle(Brush.radialGradient(listOf(UE.Cyan.copy(alpha = 0.35f), Color.Transparent), c, r * 3), r * 3, c, blendMode = BlendMode.Plus)
                drawCircle(Brush.radialGradient(listOf(Color.White, Color(0xFFBFE8FF), Color(0xFF5A7FBF)), c - Offset(r * 0.3f, r * 0.3f), r * 1.4f), r, c)
            }
            for (sgn in listOf(1f, -1f)) if (cam.project(sgn * mx * 0.55f, sgn * my * 0.55f, sgn * mz * 0.55f, out)) glowDot(Offset(out[0], out[1]), UE.Cyan, 3 * dp)
            // observer direction marker
            val ox = (sin(z)).toFloat() * 3.4f; val oy = cos(z).toFloat() * 3.4f
            if (cam.project(ox, oy, 0f, out)) { label(tm, "to Earth", out[0], out[1] - 6 * dp, UE.Amber, 9.5f, 0.5f, 1f, UE.Display); glowDot(Offset(out[0], out[1]), UE.Amber, 3 * dp) }
            // pulse trace
            val top = h * 0.72f; val bot = h - 18 * dp; val left = 14 * dp; val right = w - 14 * dp
            drawRect(Color.White.copy(alpha = 0.03f), Offset(left, top), Size(right - left, bot - top))
            path.rewind()
            val turns = 3.0
            for (q in 0..360) {
                val p = ph - turns * 2 * PI * (1 - q / 360.0)
                val v = intensity(p).coerceIn(0.0, 1.6)
                val pt = Offset(left + (right - left) * q / 360f, bot - (bot - top) * 0.85f * (v / 1.6).toFloat())
                if (q == 0) path.moveTo(pt.x, pt.y) else path.lineTo(pt.x, pt.y)
            }
            glowPath(path, UE.Cyan, 1.6f * dp)
            label(tm, "signal received at Earth — last 3 rotations (${fmt(3 * period * 1000, 3)} ms)", left + 4 * dp, top + 3 * dp, UE.Dim, 9f)
        }
    }) {
        ChipRow(PULSARS.map { it.name }, pick, Domain.Astro.accent) { pick = it; period = PULSARS[it].period }
        UESlider("Rotation period", period.toFloat(), 0.0013f..8f, log = true, accent = Domain.Astro.accent, format = { if (it < 1) "${fmt(it * 1000.0, 3)} ms" else "${fmt(it, 3)} s" }) { period = it.toDouble(); pick = -1 }
        UESlider("Magnetic tilt α", alpha, 0f..90f, accent = UE.Violet, format = { "${fix(it, 0)}°" }) { alpha = it }
        UESlider("Our viewing angle ζ", zeta, 0f..90f, accent = UE.Amber, format = { "${fix(it, 0)}°" }) { zeta = it }
        UESlider("Beam width", beamW, 4f..35f, accent = UE.Cyan, format = { "${fix(it, 0)}°" }) { beamW = it }
        val R = 12000.0; val M = 1.4 * 1.98847e30; val G = 6.6743e-11; val c = 2.99792458e8
        ReadoutRow { Stat("spin rate", "${fmt(1 / period, 3)} / s", Domain.Astro.accent); Stat("equator speed", "${fmt(2 * PI * R / period / c * 100, 3)} % c", UE.Amber); Stat("density", fmt(M / (4.0 / 3 * PI * R * R * R), 2) + " kg/m³") }
        ReadoutRow { Stat("surface gravity", "${fmt(G * M / (R * R) / 9.81, 2)} g", UE.Violet); Stat("escape speed", "${fix(sqrt(2 * G * M / R) / c, 2)} c", UE.Cyan); Stat("teaspoon weighs", "${fmt(M / (4.0 / 3 * PI * R * R * R) * 5e-6 / 1e9, 2)} Mt") }
        Note(if (pick >= 0) PULSARS[pick].note else "If |ζ − α| is larger than the beam width, the beam never sweeps across us: the pulsar is there but invisible. Most pulsars in the galaxy are hidden this way.")
    }
}
