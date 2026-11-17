package dev.universe.engine.chem

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
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Elements
import kotlin.math.*
import kotlin.random.Random

/** Hydrogen radial function R_nl(r) up to normalisation, r in Bohr radii. */
internal fun radial(n: Int, l: Int, r: Double): Double {
    val rho = 2 * r / n
    // generalised Laguerre L_{n-l-1}^{2l+1}(rho) by recurrence
    val k = n - l - 1; val a = 2.0 * l + 1
    var l0 = 1.0; var l1 = 1 + a - rho
    val lag = if (k == 0) l0 else { for (i in 1 until k) { val l2 = ((2 * i + 1 + a - rho) * l1 - (i + a) * l0) / (i + 1); l0 = l1; l1 = l2 }; l1 }
    return exp(-rho / 2) * rho.pow(l) * lag
}

internal class RealOrbital(val label: String, val tex: String, val l: Int, val y: (Double, Double, Double) -> Double)

internal val ORBITALS: List<RealOrbital> = listOf(
    RealOrbital("s", "s", 0) { _, _, _ -> 1.0 },
    RealOrbital("p_z", "p_z", 1) { _, _, z -> z }, RealOrbital("p_x", "p_x", 1) { x, _, _ -> x }, RealOrbital("p_y", "p_y", 1) { _, y, _ -> y },
    RealOrbital("d_z²", "d_{z^2}", 2) { x, y, z -> 3 * z * z - (x * x + y * y + z * z) }, RealOrbital("d_xz", "d_{xz}", 2) { x, _, z -> x * z }, RealOrbital("d_yz", "d_{yz}", 2) { _, y, z -> y * z },
    RealOrbital("d_x²−y²", "d_{x^2-y^2}", 2) { x, y, _ -> x * x - y * y }, RealOrbital("d_xy", "d_{xy}", 2) { x, y, _ -> x * y },
    RealOrbital("f_z³", "f_{z^3}", 3) { x, y, z -> z * (5 * z * z - 3 * (x * x + y * y + z * z)) }, RealOrbital("f_xz²", "f_{xz^2}", 3) { x, y, z -> x * (5 * z * z - (x * x + y * y + z * z)) },
    RealOrbital("f_xyz", "f_{xyz}", 3) { x, y, z -> x * y * z }, RealOrbital("f_x(x²−3y²)", "f_{x(x^2-3y^2)}", 3) { x, y, _ -> x * (x * x - 3 * y * y) },
)

/** Samples [count] points from |ψ_nlm|² for hydrogen. Each point is (x, y, z, sign). */
internal fun sampleOrbital(n: Int, orb: RealOrbital, count: Int, seed: Int = 1): FloatArray {
    val rnd = Random(seed)
    val rMax = n * n * 2.6 + 6
    val m = 600
    val cdf = DoubleArray(m + 1)
    for (i in 1..m) { val r = rMax * i / m; val R = radial(n, orb.l, r); cdf[i] = cdf[i - 1] + r * r * R * R }
    for (i in 0..m) cdf[i] /= cdf[m]
    var yMax = 0.0
    repeat(4000) { val u = rnd.nextDouble() * 2 - 1; val ph = rnd.nextDouble() * 2 * PI; val s = sqrt(1 - u * u); yMax = max(yMax, orb.y(s * cos(ph), s * sin(ph), u).pow(2)) }
    val out = FloatArray(count * 4)
    var k = 0
    var guard = 0
    while (k < count && guard++ < count * 200) {
        val u = rnd.nextDouble() * 2 - 1; val ph = rnd.nextDouble() * 2 * PI; val s = sqrt(1 - u * u)
        val dx = s * cos(ph); val dy = s * sin(ph); val dz = u
        val yv = orb.y(dx, dy, dz)
        if (rnd.nextDouble() * yMax * 1.05 > yv * yv) continue
        val c = rnd.nextDouble()
        var lo = 0; var hi = m
        while (hi - lo > 1) { val mid = (lo + hi) / 2; if (cdf[mid] < c) lo = mid else hi = mid }
        val r = rMax * (lo + (c - cdf[lo]) / (cdf[hi] - cdf[lo]).coerceAtLeast(1e-12)) / m
        val sign = sign(yv * radial(n, orb.l, r))
        out[k * 4] = (dx * r).toFloat(); out[k * 4 + 1] = (dz * r).toFloat(); out[k * 4 + 2] = (dy * r).toFloat(); out[k * 4 + 3] = sign.toFloat()
        k++
    }
    return out
}

/** Approximate sRGB colour of monochromatic light (CIE-like piecewise fit), or null outside 380–750 nm. */
fun wavelengthColor(nm: Double): Color? {
    if (nm < 380 || nm > 750) return null
    val (r, g, b) = when {
        nm < 440 -> Triple(-(nm - 440) / 60, 0.0, 1.0)
        nm < 490 -> Triple(0.0, (nm - 440) / 50, 1.0)
        nm < 510 -> Triple(0.0, 1.0, -(nm - 510) / 20)
        nm < 580 -> Triple((nm - 510) / 70, 1.0, 0.0)
        nm < 645 -> Triple(1.0, -(nm - 645) / 65, 0.0)
        else -> Triple(1.0, 0.0, 0.0)
    }
    val f = when { nm < 420 -> 0.3 + 0.7 * (nm - 380) / 40; nm > 700 -> 0.3 + 0.7 * (750 - nm) / 50; else -> 1.0 }
    return Color(r.toFloat() * f.toFloat(), g.toFloat() * f.toFloat(), b.toFloat() * f.toFloat())
}

private const val RYDBERG_H = 1.0967758e7
private val SERIES = mapOf(1 to "Lyman (ultraviolet)", 2 to "Balmer (visible)", 3 to "Paschen (infrared)", 4 to "Brackett (infrared)", 5 to "Pfund (infrared)")

private val OrbitalsInfo = LabInfo(
    equations = listOf(
        "\\psi_{n\\ell m}(r,\\theta,\\varphi) = R_{n\\ell}(r)\\, Y_{\\ell m}(\\theta,\\varphi)",
        "R_{n\\ell} \\propto e^{-r/na_0}\\left(\\frac{2r}{na_0}\\right)^{\\ell} L_{n-\\ell-1}^{2\\ell+1}\\!\\left(\\frac{2r}{na_0}\\right)",
        "E_n = -\\frac{13.6\\ \\text{eV}}{n^2}, \\qquad \\frac{1}{\\lambda} = R_H\\left(\\frac{1}{n_1^2} - \\frac{1}{n_2^2}\\right)",
    ),
    about = "An electron in an atom has no orbit. It has a wavefunction ψ, and |ψ|² is the probability of finding it at each point. Each dot in the cloud is one possible position, drawn at random from exactly that probability — so where the dots crowd, the electron is likely to be. Colour shows the sign of ψ, which matters when orbitals overlap to form bonds; the empty surfaces between colours are nodes where the electron is never found. When an electron drops between energy levels it emits a photon carrying exactly the energy difference: those wavelengths are hydrogen's fingerprint, seen in every nebula.",
    notes = listOf(
        "Clouds are exact hydrogen orbitals (one electron, non-relativistic Schrödinger equation), sampled by inverse-transform sampling in r and rejection sampling in direction. Heavier atoms have similar shapes but different sizes and energies because of electron–electron repulsion.",
        "Real (rather than complex) combinations of the spherical harmonics are shown, the familiar dumbbell and cloverleaf shapes chemists use.",
        "The Bohr model with electrons on circles is historically important and gets hydrogen's energy levels right, but it is wrong about almost everything else.",
        "Wavelength-to-colour mapping is an approximation of human colour vision.",
    ),
)

@Composable
fun OrbitalsLab() {
    val app = LocalApp.current
    val ctx = LocalContext.current
    var mode by remember { mutableIntStateOf(0) }
    var n by remember { mutableIntStateOf(2) }
    var oi by remember { mutableIntStateOf(1) }
    var spin by remember { mutableStateOf(true) }
    val valid = ORBITALS.filter { it.l < n }
    val orb = valid.getOrElse(valid.indexOfFirst { it === ORBITALS[oi] }.let { if (it < 0) 0 else it }) { valid[0] }
    val count = (5000 * app.prefs.q).roundToInt()
    val pts = remember(n, orb, count) { sampleOrbital(n, orb, count) }
    val cam = remember { Cam3(0.6f, 0.35f, 30f, 1.7f) }
    LaunchedEffect(n) { cam.dist = (n * n * 3.2f + 8f) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val time by rememberTime()
    val out = remember { FloatArray(4) }
    val buckets = remember { Array(6) { ArrayList<Offset>(2000) } }
    val path = remember { Path() }
    // Bohr
    var z by remember { mutableIntStateOf(10) }
    val els = remember { Elements.all(ctx) }
    // spectrum
    var upper by remember { mutableIntStateOf(3) }
    var lower by remember { mutableIntStateOf(2) }
    var jumpT by remember { mutableFloatStateOf(-1f) }

    rememberTicker(spin && mode == 1) { dt -> cam.yaw += dt * 0.35f }

    LabScaffold("Atoms and Orbitals", Domain.Chem, OrbitalsInfo, canvas = {
        Canvas(Modifier.fillMaxSize().then(if (mode == 1) Modifier.orbitGestures(cam, 3f, 120f) { spin = false } else Modifier)) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val e = els[z - 1]
                    drawShells(e, time, e.family.color, Offset(w / 2, h * 0.47f), min(w, h) * 0.42f)
                    label(tm, e.symbol, w / 2, h * 0.47f, UE.Void, (min(w, h) / dp * 0.05f).coerceIn(10f, 18f), 0.5f, 0.5f, UE.Display, FontWeight.Bold)
                    label(tm, "${e.name} — ${e.shells.joinToString(", ")} electrons per shell", w / 2, h - 12 * dp, UE.Dim, 11f, 0.5f, 1f, UE.Display)
                }
                1 -> {
                    cam.begin(w, h, 0.5f)
                    for (b in buckets) b.clear()
                    val maxD = cam.dist + n * n * 2.6f + 6
                    for (k in 0 until pts.size / 4) {
                        if (!cam.project(pts[k * 4], pts[k * 4 + 1], pts[k * 4 + 2], out)) continue
                        val depth = ((out[2] - (2 * cam.dist - maxD)) / (2 * (maxD - cam.dist)).coerceAtLeast(1f)).coerceIn(0f, 0.999f)
                        val db = (depth * 3).toInt().coerceIn(0, 2)
                        buckets[(if (pts[k * 4 + 3] >= 0) 0 else 3) + db] += Offset(out[0], out[1])
                    }
                    for (b in 0 until 6) {
                        val col = if (b < 3) UE.Cyan else UE.Magenta
                        val a = 0.75f - (b % 3) * 0.22f
                        drawPoints(buckets[b], PointMode.Points, col.copy(alpha = a * 0.25f), 5 * dp, StrokeCap.Round, blendMode = BlendMode.Plus)
                        drawPoints(buckets[b], PointMode.Points, col.copy(alpha = a), 1.8f * dp, StrokeCap.Round, blendMode = BlendMode.Plus)
                    }
                    // axes
                    val L = n * n * 1.6f + 3
                    for ((v, name) in listOf(Triple(L, 0f, 0f) to "x", Triple(0f, 0f, L) to "y", Triple(0f, L, 0f) to "z")) {
                        cam.project(0f, 0f, 0f, out); val o = Offset(out[0], out[1])
                        if (cam.project(v.first, v.second, v.third, out)) { drawLine(Color.White.copy(alpha = 0.25f), o, Offset(out[0], out[1]), dp); label(tm, name, out[0], out[1], UE.Dim, 12f, 0.5f, 0.5f, UE.Math) }
                    }
                    if (cam.project(0f, 0f, 0f, out)) glowDot(Offset(out[0], out[1]), UE.Amber, 2.5f * dp)
                    // radial probability inset
                    val bx = 12 * dp; val by = h - 92 * dp; val bw = w * 0.42f; val bh = 72 * dp
                    drawRect(Color(0xCC070814), Offset(bx, by), Size(bw, bh))
                    path.rewind()
                    val rMax = n * n * 2.6 + 6
                    var pMax = 0.0
                    val vals = DoubleArray(121) { i -> val r = rMax * i / 120; val R = radial(n, orb.l, r); (r * r * R * R).also { pMax = max(pMax, it) } }
                    for (i in 0..120) { val q = Offset(bx + bw * i / 120f, by + bh - (vals[i] / pMax).toFloat() * (bh - 14 * dp)); if (i == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    drawPath(path, UE.Amber, style = Stroke(1.4f * dp))
                    label(tm, "radial probability r²R²", bx + 4 * dp, by + 2 * dp, UE.Dim, 8.5f)
                }
                else -> {
                    val left = 60 * dp; val right = w * 0.62f; val top = h * 0.08f; val bot = h * 0.66f
                    fun Y(nn: Int) = bot - (bot - top) * (1 - 1f / (nn * nn)) / (1 - 1f / 49)
                    for (nn in 1..6) {
                        val y = Y(nn)
                        drawLine(if (nn == upper || nn == lower) UE.Text else Color.White.copy(alpha = 0.35f), Offset(left, y), Offset(right, y), (if (nn == upper || nn == lower) 2f else 1f) * dp)
                        label(tm, "n = $nn", left - 6 * dp, y, UE.Dim, 10f, 1f, 0.5f)
                        label(tm, "${fix(-13.6 / (nn * nn), 2)} eV", right + 6 * dp, y, UE.Dim, 9.5f, 0f, 0.5f)
                    }
                    label(tm, "ionised (0 eV)", right + 6 * dp, top - 2 * dp, UE.Faint, 9f, 0f, 1f)
                    drawLine(Color.White.copy(alpha = 0.15f), Offset(left, top), Offset(right, top), dp)
                    val lam = 1e9 / (RYDBERG_H * (1.0 / (lower * lower) - 1.0 / (upper * upper)))
                    val col = wavelengthColor(lam) ?: if (lam < 380) UE.Violet else UE.Red
                    val jt = jumpT
                    val x = (left + right) / 2
                    val ey = if (jt in 0f..1f) Y(upper) + (Y(lower) - Y(upper)) * jt else Y(lower)
                    arrow(Offset(x, Y(upper)), Offset(x, Y(lower)), col.copy(alpha = 0.6f), 2 * dp, 10 * dp)
                    glowDot(Offset(x, ey), UE.Cyan, 6 * dp)
                    if (jt > 0f) {
                        val px = x + (w - x) * ((jt - 0.3f).coerceAtLeast(0f) * 1.6f)
                        path.rewind()
                        for (i in 0..60) { val xx = x + 10 * dp + (px - x) * i / 60f; val yy = (Y(lower) + Y(upper)) / 2 + sin(i * 0.9f - time * 20) * 7 * dp; if (i == 0) path.moveTo(xx, yy) else path.lineTo(xx, yy) }
                        if (jt > 0.3f) glowPath(path, col, 2 * dp)
                    }
                    // spectrum strip: Balmer lines and the chosen line
                    val sTop = h * 0.76f; val sBot = h * 0.86f; val sl = 16 * dp; val sr = w - 16 * dp
                    for (i in 0..200) { val nm = 380.0 + 370 * i / 200; val c = wavelengthColor(nm) ?: Color.Black; drawLine(c.copy(alpha = 0.12f), Offset(sl + (sr - sl) * i / 200f, sTop), Offset(sl + (sr - sl) * i / 200f, sBot), (sr - sl) / 200f + 1) }
                    for (u in 3..7) { val nm = 1e9 / (RYDBERG_H * (0.25 - 1.0 / (u * u))); val xx = sl + (sr - sl) * ((nm - 380) / 370).toFloat(); drawLine(wavelengthColor(nm) ?: Color.White, Offset(xx, sTop), Offset(xx, sBot), 2.5f * dp) }
                    if (lam in 380.0..750.0) { val xx = sl + (sr - sl) * ((lam - 380) / 370).toFloat(); drawLine(Color.White, Offset(xx, sTop - 6 * dp), Offset(xx, sBot + 6 * dp), dp) }
                    label(tm, "380 nm", sl, sBot + 4 * dp, UE.Dim, 9f); label(tm, "750 nm", sr, sBot + 4 * dp, UE.Dim, 9f, 1f, 0f)
                    label(tm, "visible lines of hydrogen (Balmer series)", (sl + sr) / 2, sTop - 4 * dp, UE.Dim, 9.5f, 0.5f, 1f)
                }
            }
        }
    }) {
        Segmented(listOf("Shells", "Orbitals", "Spectrum"), mode, accent = Domain.Chem.accent) { mode = it }
        when (mode) {
            0 -> {
                UESlider("Element (atomic number Z)", z.toFloat(), 1f..118f, step = 1f, accent = Domain.Chem.accent, format = { "${it.roundToInt()} · ${els[it.roundToInt() - 1].name}" }) { z = it.roundToInt().coerceIn(1, 118) }
                val e = els[z - 1]
                ReadoutRow { Stat("configuration", e.config, UE.Cyan); Stat("valence e⁻", e.shells.last().toString(), Domain.Chem.accent) }
                Note("Shells fill in a strict order. The outermost electrons — the valence electrons — decide how an atom bonds, which is why the periodic table repeats.")
            }
            1 -> {
                ChipRow((1..4).map { "n = $it" }, n - 1, Domain.Chem.accent) { n = it + 1 }
                ChipRow(valid.map { "$n${it.label}" }, valid.indexOf(orb), UE.Cyan) { oi = ORBITALS.indexOf(valid[it]) }
                MathText("\\psi_{$n${orb.tex}}", size = 18.sp)
                ReadoutRow {
                    Stat("energy", "${fix(-13.6 / (n * n), 3)} eV", UE.Amber); Stat("radial nodes", "${n - orb.l - 1}"); Stat("angular nodes", "${orb.l}")
                    Stat("most likely r", "${fix(run { var best = 0.0; var bv = 0.0; for (i in 1..2000) { val r = (n * n * 2.6 + 6) * i / 2000; val v = r * r * radial(n, orb.l, r).pow(2); if (v > bv) { bv = v; best = r } }; best }, 2)} a₀", UE.Cyan)
                }
                Toggle("Auto-rotate", spin) { spin = it }
                Note("Cyan where ψ > 0, magenta where ψ < 0. Drag to turn the cloud; ${count} sampled positions.")
            }
            else -> {
                IntSlider("Electron starts in level", upper, 2..6, accent = UE.Amber) { upper = it; if (lower >= upper) lower = upper - 1 }
                IntSlider("…and drops to level", lower, 1..(upper - 1), accent = UE.Cyan) { lower = it }
                GlowButton("Emit photon", accent = Domain.Chem.accent, filled = true) { jumpT = 0f }
                val lam = 1e9 / (RYDBERG_H * (1.0 / (lower * lower) - 1.0 / (upper * upper)))
                val ev = 13.6 * (1.0 / (lower * lower) - 1.0 / (upper * upper))
                ReadoutRow { Stat("wavelength", "${fix(lam, 1)} nm", wavelengthColor(lam) ?: UE.Dim); Stat("energy", "${fix(ev, 3)} eV"); Stat("series", SERIES[lower] ?: "—", UE.Violet) }
                Note(if (lower == 2 && upper == 3) "Hydrogen-alpha, 656 nm: the deep red that colours emission nebulae in astrophotographs." else "Only drops to level 2 give visible light. Lyman photons are ultraviolet; Paschen and beyond are infrared.")
            }
        }
    }
    LaunchedEffect(jumpT >= 0f) { if (jumpT >= 0f) { while (jumpT < 1.4f) { kotlinx.coroutines.delay(16); jumpT += 0.025f }; jumpT = -1f } }
}
