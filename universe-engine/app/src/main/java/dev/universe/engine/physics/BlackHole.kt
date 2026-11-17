package dev.universe.engine.physics

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlin.math.*

/*
 * Light near a Schwarzschild black hole. Lengths are in units of the Schwarzschild radius r_s.
 * A photon's spatial path obeys u'' + u = (3/2) r_s u² with u = 1/r. In Cartesian form that is exactly
 * the motion of a particle under the central acceleration a = −(3/2) r_s h² r̂ / r⁴, where h = |r × v| is conserved.
 */

/** Traces one photon in the plane. Returns points (x0,y0,x1,y1,…) and sets [captured]. */
internal class PhotonPath(val pts: FloatArray, val n: Int, val captured: Boolean, val deflection: Double)

internal fun tracePhoton(x0: Double, y0: Double, dx: Double, dy: Double, maxR: Double = 26.0): PhotonPath {
    var x = x0; var y = y0
    val l = hypot(dx, dy)
    var vx = dx / l; var vy = dy / l
    val h2 = (x * vy - y * vx).pow(2)
    val pts = FloatArray(2 * 900)
    var n = 0
    var captured = false
    for (step in 0 until 4000) {
        if (n < 900 && step % 2 == 0) { pts[n * 2] = x.toFloat(); pts[n * 2 + 1] = y.toFloat(); n++ }
        val r2 = x * x + y * y
        val r = sqrt(r2)
        if (r < 1.0) { captured = true; break }
        if (r > maxR && x * vx + y * vy > 0) break
        val dt = 0.02 * r.coerceIn(0.6, 6.0)
        // velocity Verlet on the effective central force
        var k = -1.5 * h2 / (r2 * r2 * r)
        vx += k * x * dt / 2; vy += k * y * dt / 2
        x += vx * dt; y += vy * dt
        val q2 = x * x + y * y
        k = -1.5 * h2 / (q2 * q2 * sqrt(q2))
        vx += k * x * dt / 2; vy += k * y * dt / 2
    }
    if (n < 900) { pts[n * 2] = x.toFloat(); pts[n * 2 + 1] = y.toFloat(); n++ }
    var d = atan2(vy, vx) - atan2(dy, dx)
    while (d > PI) d -= 2 * PI
    while (d < -PI) d += 2 * PI
    return PhotonPath(pts, n, captured, d)
}

private fun hash(a: Int, b: Int): Float {
    var h = a * 374761393 + b * 668265263
    h = (h xor (h ushr 13)) * 1274126177
    return ((h xor (h ushr 16)) and 0xFFFFFF) / 16777216f
}

/** One pixel of the ray-traced view: integrate the photon backwards from the camera. Returns ARGB. */
private fun shadeRay(ox: Double, oy: Double, oz: Double, dx0: Double, dy0: Double, dz0: Double, camDist: Double): Int {
    var x = ox; var y = oy; var z = oz
    var vx = dx0; var vy = dy0; var vz = dz0
    val cx = y * vz - z * vy; val cy = z * vx - x * vz; val cz = x * vy - y * vx
    val h2 = cx * cx + cy * cy + cz * cz
    var cr = 0f; var cg = 0f; var cb = 0f
    var alpha = 0f
    var escaped = false
    for (step in 0 until 2600) {
        val r2 = x * x + y * y + z * z
        val r = sqrt(r2)
        if (r < 1.0) break
        if (r > camDist + 1 && x * vx + y * vy + z * vz > 0) { escaped = true; break }
        val dt = (0.045 * r).coerceIn(0.03, 1.2)
        val k = -1.5 * h2 / (r2 * r2 * r)
        vx += k * x * dt; vy += k * y * dt; vz += k * z * dt
        val nx = x + vx * dt; val ny = y + vy * dt; val nz = z + vz * dt
        if (y * ny < 0) {
            // crossed the equatorial plane: did we hit the accretion disc?
            val f = y / (y - ny)
            val hx = x + (nx - x) * f; val hz = z + (nz - z) * f
            val rc = hypot(hx, hz)
            if (rc > 3.0 && rc < 13.5) {
                val prof = (rc.pow(-0.75) * (1 - sqrt(3.0 / rc)).pow(0.25)) / 0.2145   // thin-disc temperature profile, peak ≈ 1
                val v = sqrt(0.5 / (rc - 1))                                        // orbital speed / c for a circular geodesic
                val vl = sqrt(vx * vx + vy * vy + vz * vz)
                // unit vector of emitted photon is −v̂_ray; orbital direction is (−z, 0, x)/r
                val cosphi = -((-hz / rc) * vx + (hx / rc) * vz) / vl
                val g = sqrt(1 - 1.5 / rc) / (1 - v * cosphi)                         // gravitational + Doppler shift
                val ang = atan2(hz, hx)
                val tex = 0.78f + 0.22f * sin((ang * 9 + rc * 2.6).toFloat()) * sin((rc * 5.3 - ang * 4).toFloat()) + 0.1f * sin((rc * 13.0).toFloat())
                val temp = 1150.0 + 3900.0 * prof * g * g
                val bb = Num.blackbody(temp)
                val inten = (prof.pow(1.5) * g.pow(4) * 1.5).toFloat() * tex * smooth(3.0, 3.5, rc) * (1f - smooth(10.5, 13.5, rc))
                val a = (0.92f * smooth(3.0, 3.5, rc)).coerceIn(0f, 1f)
                cr += (1 - alpha) * a * bb[0] * inten; cg += (1 - alpha) * a * bb[1] * inten; cb += (1 - alpha) * a * bb[2] * inten
                alpha += (1 - alpha) * a
                if (alpha > 0.985f) break
            }
        }
        x = nx; y = ny; z = nz
    }
    if (escaped && alpha < 0.985f) {
        // lensed sky: hash the outgoing direction into a star catalogue
        val l = sqrt(vx * vx + vy * vy + vz * vz)
        val th = acos((vy / l).coerceIn(-1.0, 1.0)); val ph = atan2(vz, vx)
        val fu = ph * 46; val fv = th * 46
        val gu = floor(fu).toInt(); val gv = floor(fv).toInt()
        var s = 0f
        val hsh = hash(gu, gv)
        if (hsh > 0.62f) {
            // one star per occupied cell, at a hashed position, with a tight Gaussian profile
            val du = (fu - gu) - (0.2 + 0.6 * hash(gv, gu + 7)); val dv = (fv - gv) - (0.2 + 0.6 * hash(gu + 3, gv))
            s = (exp(-(du * du + dv * dv) / 0.012) * ((hsh - 0.62f) / 0.38f).pow(2) * 2.6).toFloat()
        }
        val band = exp(-((th - PI / 2 + 0.35 * sin(ph + 0.6)) * 3.0).pow(2)).toFloat() * (0.07f + 0.03f * sin((ph * 5 + th * 3).toFloat()))
        val t = hash(gv, gu)
        cr += (1 - alpha) * (s * (0.75f + 0.5f * t) + band * 0.55f); cg += (1 - alpha) * (s * 0.9f + band * 0.7f); cb += (1 - alpha) * (s * (1.25f - 0.5f * t) + band * 1.2f)
    }
    fun tone(c: Float) = ((1 - exp(-c * 1.5f)).coerceIn(0f, 1f) * 255).toInt()
    return (0xFF shl 24) or (tone(cr) shl 16) or (tone(cg) shl 8) or tone(cb)
}

private fun smooth(a: Double, b: Double, x: Double): Float { val t = ((x - a) / (b - a)).coerceIn(0.0, 1.0); return (t * t * (3 - 2 * t)).toFloat() }

internal suspend fun renderBlackHole(n: Int, inclinationDeg: Double): Bitmap = coroutineScope {
    val px = IntArray(n * n)
    val d = 30.0
    val inc = inclinationDeg * PI / 180
    val ox = 0.0; val oy = d * cos(inc); val oz = d * sin(inc)
    val fx = -ox / d; val fy = -oy / d; val fz = -oz / d
    // right = (1,0,0); up = right × forward
    val ux = 0.0; val uy = -fz; val uz = fy
    val tanF = 13.0 / d
    (0 until 4).map { k ->
        launch(Dispatchers.Default) {
            var j = k
            while (j < n) {
                ensureActive()
                val sy = (1 - 2 * (j + 0.5) / n) * tanF
                for (i in 0 until n) {
                    val sx = (2 * (i + 0.5) / n - 1) * tanF
                    var dx = fx + sx; var dy = fy + sy * uy + 0 * ux; var dz = fz + sy * uz
                    val l = sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l
                    px[j * n + i] = shadeRay(ox, oy, oz, dx, dy, dz, d)
                }
                j += 4
            }
        }
    }.joinAll()
    Bitmap.createBitmap(px, n, n, Bitmap.Config.ARGB_8888)
}

private const val G = 6.6743e-11
private const val C = 2.99792458e8
private const val MSUN = 1.98847e30
private const val HBAR = 1.054571817e-34
private const val KB = 1.380649e-23
private const val YEAR = 3.15576e7

private class Known(val name: String, val solar: Double)
private val KNOWN = listOf(Known("Stellar (Cygnus X-1)", 21.2), Known("GW150914 remnant", 62.0), Known("Sagittarius A*", 4.3e6), Known("M87*", 6.5e9), Known("TON 618", 6.6e10))

private class Ruler(val name: String, val km: Double)
private val RULERS = listOf(Ruler("a city (20 km)", 20.0), Ruler("the Moon", 3474.8), Ruler("Earth", 12742.0), Ruler("Jupiter", 139820.0), Ruler("the Sun", 1.3927e6),
    Ruler("Mercury's orbit", 1.158e8), Ruler("Earth's orbit", 2.992e8), Ruler("Neptune's orbit", 8.99e9), Ruler("the heliosphere", 3.6e10), Ruler("a light-month", 7.8e11))

private fun lengthStr(km: Double): String = when {
    km < 1e6 -> "${fmt(km, 4)} km"
    km < 1.5e11 -> "${fmt(km / 1.495978707e8, 4)} AU"
    else -> "${fmt(km / 9.4607e12, 4)} light-years"
}

private fun timeStr(years: Double): String = if (years < 1) "${fmt(years * YEAR, 3)} s" else "${fmt(years, 3)} years"

private val BlackHoleInfo = LabInfo(
    equations = listOf(
        "r_s = \\frac{2GM}{c^2}",
        "\\frac{d^2u}{d\\varphi^2} + u = \\frac{3}{2} r_s u^2, \\qquad u = \\frac{1}{r}",
        "b_{\\text{crit}} = \\frac{3\\sqrt{3}}{2}\\, r_s \\approx 2.598\\, r_s, \\qquad \\delta\\varphi \\approx \\frac{2 r_s}{b} \\quad (b \\gg r_s)",
        "\\frac{d\\tau}{dt} = \\sqrt{1 - \\frac{r_s}{r}}, \\qquad T_H = \\frac{\\hbar c^3}{8\\pi G M k_B}",
    ),
    about = "A non-rotating black hole is described completely by the Schwarzschild solution of general relativity. Light follows null geodesics of that geometry: far away it is deflected slightly, at 1.5 r_s it can orbit, and any ray aimed with impact parameter below 2.6 r_s is swallowed — that is why the 'shadow' looks 2.6 times larger than the horizon. The ray-traced view integrates one such geodesic per pixel, backwards from your eye, through a hot thin accretion disc. Light from the far side of the disc is bent over the top and under the bottom; the side rotating toward you is brighter and bluer.",
    notes = listOf(
        "The photon paths are exact Schwarzschild null geodesics, integrated numerically with small steps. The hole does not rotate (no Kerr frame dragging), which real astrophysical black holes do.",
        "The disc is an idealised, infinitely thin, opaque sheet between the innermost stable orbit (3 r_s) and 13.5 r_s with a standard thin-disc temperature profile. Its brightness is scaled by g⁴ where g combines gravitational redshift and Doppler shift for circular orbits; the turbulent streaks are procedural decoration.",
        "Colours map an illustrative temperature to a black-body colour. A real disc around a stellar black hole glows in X-rays; around a supermassive one, in ultraviolet.",
        "The background stars are a procedural catalogue, not the real sky.",
        "Tidal stretching is the Newtonian estimate 2GML/r³ for a 2 m body; Hawking temperature and evaporation time are for an isolated hole in empty space and ignore the cosmic microwave background, which is far warmer than any astrophysical black hole.",
    ),
)

@Composable
fun BlackHoleLab(domain: Domain = Domain.Physics) {
    val app = LocalApp.current
    var mode by remember { mutableIntStateOf(0) }
    val tm = rememberTextMeasurer(cacheSize = 48)
    val path = remember { Path() }
    val time by rememberTime(mode == 0)
    // light paths
    var rays by remember { mutableIntStateOf(25) }
    var probeB by remember { mutableFloatStateOf(3.2f) }
    var point by remember { mutableStateOf(false) }
    val beams = remember(rays, point) {
        List(rays) { i ->
            val f = (i + 0.5) / rays
            if (point) { val a = (f - 0.5) * 2 * 1.15; tracePhoton(-9.0, 0.0, cos(a), sin(a)) } else tracePhoton(-16.0, (f - 0.5) * 2 * 8.5, 1.0, 0.0)
        }
    }
    val probe = remember(probeB) { tracePhoton(-16.0, probeB.toDouble(), 1.0, 0.0) }
    // ray-traced
    var incl by remember { mutableFloatStateOf(80f) }
    var image by remember { mutableStateOf<ImageBitmap?>(null) }
    var rendering by remember { mutableStateOf(false) }
    val res = when (app.prefs.quality) { 0 -> 150; 2 -> 320; else -> 220 }
    LaunchedEffect(mode, incl, res) {
        if (mode != 1) return@LaunchedEffect
        delay(120)
        rendering = true
        image = renderBlackHole(res / 3, incl.toDouble()).asImageBitmap()
        image = renderBlackHole(res, incl.toDouble()).asImageBitmap()
        rendering = false
    }
    // numbers
    var solar by remember { mutableFloatStateOf(4.3e6f) }
    var rOver by remember { mutableFloatStateOf(3f) }
    LaunchedEffect(rOver < 1f) { if (rOver < 1f && mode == 2) app.discover("horizon") }

    LabScaffold("Black Hole", domain, BlackHoleInfo, canvas = {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val u = min(w / 26f, h / 22f)
                    val c = Offset(w * 0.56f, h / 2)
                    fun P(x: Float, y: Float) = Offset(c.x + x * u, c.y - y * u)
                    for (pp in beams) {
                        path.rewind()
                        for (k in 0 until pp.n) { val q = P(pp.pts[k * 2], pp.pts[k * 2 + 1]); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                        drawPath(path, (if (pp.captured) UE.Magenta else UE.Cyan).copy(alpha = 0.5f), style = Stroke(1.1f * dp))
                        val idx = ((time * 60f) % pp.n).toInt().coerceIn(0, pp.n - 1)
                        drawCircle(if (pp.captured) UE.Magenta else Color.White, 2.2f * dp, P(pp.pts[idx * 2], pp.pts[idx * 2 + 1]))
                    }
                    if (!point) {
                        path.rewind()
                        for (k in 0 until probe.n) { val q = P(probe.pts[k * 2], probe.pts[k * 2 + 1]); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                        glowPath(path, UE.Amber, 2.2f * dp)
                        drawLine(UE.Amber.copy(alpha = 0.35f), P(-16f, probeB), P(13f, probeB), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 5 * dp)))
                    }
                    drawCircle(UE.Violet.copy(alpha = 0.6f), 3 * u, c, style = Stroke(dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp))))
                    drawCircle(UE.Amber.copy(alpha = 0.8f), 1.5f * u, c, style = Stroke(dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * dp, 3 * dp))))
                    drawCircle(Brush.radialGradient(listOf(Color.Black, Color.Black, UE.Blue.copy(alpha = 0.5f), Color.Transparent), c, u * 1.5f), u * 1.5f, c)
                    drawCircle(Color.Black, u, c); drawCircle(Color.White.copy(alpha = 0.7f), u, c, style = Stroke(dp))
                    label(tm, "event horizon  r_s", c.x, c.y + u + 3 * dp, UE.Text, 9f, 0.5f, 0f)
                    label(tm, "photon sphere  1.5 r_s", c.x + 1.5f * u * 0.72f, c.y - 1.5f * u * 0.72f - 2 * dp, UE.Amber, 9f, 0f, 1f)
                    label(tm, "innermost stable orbit  3 r_s", c.x + 3f * u * 0.72f, c.y + 3f * u * 0.72f + 2 * dp, UE.Violet, 9f, 0f, 0f)
                }
                1 -> {
                    drawRect(Color.Black)
                    image?.let { im ->
                        val s = min(w, h)
                        drawImage(im, dstOffset = IntOffset(((w - s) / 2).toInt(), ((h - s) / 2).toInt()), dstSize = IntSize(s.toInt(), s.toInt()))
                    }
                    if (rendering) { drawCircle(UE.Amber, 4 * dp, Offset(14 * dp, 14 * dp)); label(tm, "tracing ${res * res} geodesics…", 24 * dp, 14 * dp, UE.Amber, 10f, 0f, 0.5f) }
                }
                else -> {
                    val rsKm = 2 * G * solar * MSUN / (C * C) / 1000
                    val ruler = RULERS.minByOrNull { abs(ln(it.km / (2 * rsKm))) }!!
                    val ratio = (ruler.km / (2 * rsKm)).toFloat()
                    val big = min(w * 0.2f, h * 0.22f)
                    val rHole = if (ratio > 1) big / ratio.coerceAtMost(40f) else big
                    val rRuler = if (ratio > 1) big else (big * ratio).coerceAtLeast(2 * dp)
                    val ch = Offset(w * 0.3f, h * 0.36f); val crr = Offset(w * 0.74f, h * 0.36f)
                    val ring = (rOver.coerceAtLeast(0.2f)) * rHole
                    drawCircle(UE.Violet.copy(alpha = 0.5f), 3 * rHole, ch, style = Stroke(dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 4 * dp))))
                    drawCircle(UE.Amber.copy(alpha = 0.7f), 1.5f * rHole, ch, style = Stroke(dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * dp, 3 * dp))))
                    drawCircle(Brush.radialGradient(listOf(Color.Black, UE.Blue.copy(alpha = 0.45f), Color.Transparent), ch, rHole * 1.6f), rHole * 1.6f, ch)
                    drawCircle(Color.Black, rHole, ch); drawCircle(Color.White.copy(alpha = 0.8f), rHole, ch, style = Stroke(dp))
                    drawCircle(UE.Cyan, ring, ch, style = Stroke(1.6f * dp))
                    label(tm, "horizon, diameter ${lengthStr(2 * rsKm)}", ch.x, ch.y + max(3 * rHole, 24 * dp) + 8 * dp, UE.Text, 10f, 0.5f, 0f)
                    drawCircle(UE.Green.copy(alpha = 0.18f), rRuler, crr); drawCircle(UE.Green, rRuler, crr, style = Stroke(1.2f * dp))
                    label(tm, ruler.name, crr.x, crr.y + max(rRuler, 20 * dp) + 8 * dp, UE.Green, 10f, 0.5f, 0f)
                    label(tm, "to scale", w / 2, h * 0.06f, UE.Dim, 10f, 0.5f, 0f)
                    // the unfortunate astronaut: stretched by the tidal gradient, Newtonian estimate
                    val M = solar * MSUN; val rs = rsKm * 1000; val r = rOver * rs
                    val tidal = 2 * G * M * 2.0 / (r * r * r)
                    val stretch = (1 + log10(1 + tidal / 9.81).toFloat() * 0.55f).coerceIn(1f, 7f)
                    val base = Offset(w / 2, h * 0.9f); val bodyH = 16 * dp * stretch; val bw = 9 * dp / sqrt(stretch)
                    val col = if (rOver < 1f) UE.Red else if (tidal > 100) UE.Amber else UE.Cyan
                    drawLine(col, base, base - Offset(0f, bodyH), 2.4f * dp)
                    drawCircle(col, bw * 0.55f, base - Offset(0f, bodyH + bw * 0.5f))
                    drawLine(col, base - Offset(bw, bodyH * 0.7f), base - Offset(-bw, bodyH * 0.7f), 2f * dp)
                    drawLine(col, base, base + Offset(-bw * 0.8f, 9 * dp), 2f * dp); drawLine(col, base, base + Offset(bw * 0.8f, 9 * dp), 2f * dp)
                    label(tm, if (rOver < 1f) "inside the horizon" else "tidal stretch across 2 m: ${fmt(tidal / 9.81, 2)} g", w / 2, h * 0.95f + 4 * dp, col, 10f, 0.5f, 0f)
                }
            }
        }
    }) {
        Segmented(listOf("Light paths", "Ray-traced view", "Numbers"), mode, accent = domain.accent) { mode = it }
        when (mode) {
            0 -> {
                Toggle("Point source instead of a parallel beam", point, accent = domain.accent) { point = it }
                IntSlider("Number of rays", rays, 5..61, accent = domain.accent) { rays = it }
                if (!point) {
                    UESlider("Impact parameter b of the amber ray", probeB, 0.2f..8.5f, accent = UE.Amber, format = { "${fix(it, 2)} r_s" }) { probeB = it }
                    val defl = abs(probe.deflection) * 180 / PI
                    ReadoutRow {
                        Stat("fate", if (probe.captured) "captured" else "escapes", if (probe.captured) UE.Magenta else UE.Cyan)
                        Stat("deflection", if (probe.captured) "—" else fix(defl, 1) + "°", UE.Amber)
                        Stat("weak-field 2r_s/b", fix(2.0 / probeB * 180 / PI, 1) + "°", UE.Dim)
                        Stat("b_crit", "2.598 r_s", UE.Violet)
                    }
                    Note("Slide b down toward 2.598: the ray winds around the photon sphere, and Einstein's simple weak-field formula (which made his name in 1919) falls far behind the true bending.")
                } else Note("A lamp near a black hole. Rays leaving within about 50° of the inward direction are captured; the rest are bent, some more than 180°.")
            }
            1 -> {
                UESlider("Viewing inclination", incl, 55f..89.5f, accent = UE.Amber, format = { "${fix(it, 1)}° from the axis" }) { incl = it }
                ReadoutRow { Stat("rays", groupDigits(res.toLong() * res)); Stat("observer", "30 r_s"); Stat("disc", "3 – 13.5 r_s", UE.Amber); Stat("shadow", "5.2 r_s wide", UE.Violet) }
                Note("The arc over the top is the far side of the disc, its light bent toward you. The thin ring hugging the shadow is light that circled the hole before escaping. One side is brighter and whiter because that gas is orbiting toward you at up to half the speed of light.")
            }
            else -> {
                UESlider("Mass", solar, 1f..1e11f, log = true, accent = domain.accent, format = { "${fmt(it, 3)} M☉" }) { solar = it }
                ChipRow(KNOWN.map { it.name }, KNOWN.indexOfFirst { abs(it.solar / solar - 1) < 0.01 }, domain.accent) { solar = KNOWN[it].solar.toFloat() }
                val M = solar.toDouble() * MSUN
                val rs = 2 * G * M / (C * C)
                ReadoutRow { Stat("Schwarzschild radius", lengthStr(rs / 1000), UE.Cyan); Stat("mean density", fmt(M / (4.0 / 3 * PI * rs * rs * rs), 2) + " kg/m³") }
                ReadoutRow {
                    Stat("Hawking temperature", fmt(HBAR * C * C * C / (8 * PI * G * M * KB), 2) + " K", UE.Amber)
                    Stat("evaporation time", fmt(5120 * PI * G * G * M * M * M / (HBAR * C.pow(4)) / YEAR, 2) + " yr", UE.Violet)
                }
                UESlider("Your distance from the centre", rOver, 0.5f..20f, log = true, accent = if (rOver < 1f) UE.Red else UE.Cyan, format = { "${fix(it, 2)} r_s" }) { rOver = it }
                val r = rOver * rs
                if (rOver > 1f) ReadoutRow {
                    Stat("clock rate vs far away", fix(sqrt(1 - 1.0 / rOver), 4), UE.Cyan)
                    Stat("escape speed", fix(sqrt(1.0 / rOver), 3) + " c")
                    Stat("light crossing r_s", timeStr(rs / C / YEAR))
                } else ReadoutRow { Stat("clock rate", "undefined", UE.Red); Stat("escape speed", "> c", UE.Red); Stat("time to the centre", "< " + timeStr(PI * rs / (2 * C) / YEAR), UE.Red) }
                Note(if (rOver < 1f) "No signal you send can cross back out. For a supermassive hole the crossing itself is gentle; the end comes within at most π r_s / 2c of your own time."
                    else "Compare a stellar hole with a supermassive one: the small one would pull you apart long before the horizon, while you could cross M87*'s horizon without feeling anything unusual.")
            }
        }
    }
}
