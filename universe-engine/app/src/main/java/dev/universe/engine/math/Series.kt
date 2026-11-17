package dev.universe.engine.math

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*

private class Ser(val name: String, val tex: String, val start: Int, val limit: Double, val limitName: String, val note: String, val term: (Int) -> Double)

private val SERIES = listOf(
    Ser("Geometric", "\\sum_{n=1}^{\\infty} \\frac{1}{2^n} = 1", 1, 1.0, "1", "Each term fills half of what is left of the unit square. The error halves every step.") { 0.5.pow(it) },
    Ser("Basel", "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}", 1, PI * PI / 6, "π²/6", "Euler's 1734 surprise: squares of integers know about circles. Convergence is slow — the error after N terms is about 1/N.") { 1.0 / (it.toDouble() * it) },
    Ser("Leibniz", "\\sum_{n=0}^{\\infty} \\frac{(-1)^n}{2n+1} = \\frac{\\pi}{4}", 0, PI / 4, "π/4", "Alternating odd reciprocals zig-zag onto π/4. Beautiful and painfully slow: 500 terms give three digits.") { (if (it % 2 == 0) 1.0 else -1.0) / (2 * it + 1) },
    Ser("Alternating", "\\sum_{n=1}^{\\infty} \\frac{(-1)^{n+1}}{n} = \\ln 2", 1, ln(2.0), "ln 2", "Conditionally convergent: rearranging its terms can make it add up to any number you like (Riemann's rearrangement theorem).") { (if (it % 2 == 1) 1.0 else -1.0) / it },
    Ser("Exponential", "\\sum_{n=0}^{\\infty} \\frac{1}{n!} = e", 0, E, "e", "Factorials grow so fast that ten terms already give seven digits of e.") { var f = 1.0; for (k in 2..it) f *= k; 1 / f },
    Ser("Harmonic", "\\sum_{n=1}^{\\infty} \\frac{1}{n} = \\infty", 1, Double.NaN, "∞", "The terms shrink to zero, yet the sum grows without bound — like ln N + γ (violet), where γ ≈ 0.5772 is the Euler–Mascheroni constant.") { 1.0 / it },
)

private val WAVES = listOf("Square", "Sawtooth", "Triangle", "Pulse")

private fun waveCoef(type: Int, k: Int): Double = when (type) {
    0 -> if (k % 2 == 1) 4 / (PI * k) else 0.0
    1 -> 2 / (PI * k) * (if (k % 2 == 1) 1 else -1)
    2 -> if (k % 2 == 1) 8 / (PI * PI * k * k) * (if ((k - 1) / 2 % 2 == 0) 1 else -1) else 0.0
    else -> 2 / (PI * k) * sin(PI * k * 0.25) * 2 // 25 % duty pulse (cosine series, drawn as sine phase-shifted)
}

private fun idealWave(type: Int, ph: Double): Double {
    val x = ((ph / (2 * PI)) % 1.0 + 1.0) % 1.0
    return when (type) {
        0 -> if (x < 0.5) 1.0 else -1.0
        1 -> if (x < 0.5) 2 * x else 2 * x - 2
        2 -> if (x < 0.25) 4 * x else if (x < 0.75) 2 - 4 * x else 4 * x - 4
        else -> { val y = (x + 0.25) % 1.0; if (y < 0.125 || y > 0.875) 1.5 else -0.5 }
    }
}

private val SHAPES = listOf("Heart", "Star", "Infinity", "Clover")

private fun shapePoint(kind: Int, t: Double): Offset = when (kind) {
    0 -> Offset((16 * sin(t).pow(3)).toFloat() / 17f, -((13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)).toFloat() / 17f) - 0.1f)
    1 -> { val k = (t / (2 * PI) * 10); val i = floor(k).toInt(); val f = k - i
        fun v(j: Int): Offset { val a = j * PI / 5 - PI / 2; val r = if (j % 2 == 0) 1.0 else 0.42; return Offset((cos(a) * r).toFloat(), (sin(a) * r).toFloat()) }
        val p = v(i % 10); val q = v((i + 1) % 10); Offset(p.x + (q.x - p.x) * f.toFloat(), p.y + (q.y - p.y) * f.toFloat()) }
    2 -> { val d = 1 + sin(t) * sin(t); Offset((1.25 * cos(t) / d).toFloat(), (1.25 * sin(t) * cos(t) / d).toFloat()) }
    else -> { val r = 0.35 + 0.65 * abs(cos(2 * t)); Offset((r * cos(t)).toFloat(), (r * sin(t)).toFloat()) }
}

private class Epi(val freq: IntArray, val re: FloatArray, val im: FloatArray, val amp: FloatArray)

/** Discrete Fourier transform of a closed path, sorted by amplitude: the recipe for the epicycles. */
private fun epicycles(pts: List<Offset>): Epi {
    val m = pts.size
    val freq = IntArray(m); val re = FloatArray(m); val im = FloatArray(m); val amp = FloatArray(m)
    for (idx in 0 until m) {
        val k = if (idx <= m / 2) idx else idx - m
        var sr = 0.0; var si = 0.0
        for (n in 0 until m) {
            val a = -2 * PI * k * n / m
            val c = cos(a); val s = sin(a)
            sr += pts[n].x * c - pts[n].y * s
            si += pts[n].x * s + pts[n].y * c
        }
        freq[idx] = k; re[idx] = (sr / m).toFloat(); im[idx] = (si / m).toFloat(); amp[idx] = hypot(sr / m, si / m).toFloat()
    }
    val order = (0 until m).sortedByDescending { if (freq[it] == 0) Float.MAX_VALUE else amp[it] }
    return Epi(IntArray(m) { freq[order[it]] }, FloatArray(m) { re[order[it]] }, FloatArray(m) { im[order[it]] }, FloatArray(m) { amp[order[it]] })
}

private fun resample(raw: List<Offset>, m: Int): List<Offset> {
    if (raw.size < 3) return emptyList()
    val closed = raw + raw.first()
    val cum = FloatArray(closed.size)
    for (i in 1 until closed.size) cum[i] = cum[i - 1] + (closed[i] - closed[i - 1]).getDistance()
    val total = cum.last()
    if (total < 1f) return emptyList()
    val out = ArrayList<Offset>(m)
    var j = 0
    for (i in 0 until m) {
        val d = total * i / m
        while (j < closed.size - 2 && cum[j + 1] < d) j++
        val seg = (cum[j + 1] - cum[j]).coerceAtLeast(1e-6f)
        val f = (d - cum[j]) / seg
        out += closed[j] + (closed[j + 1] - closed[j]) * f
    }
    return out
}

private val SeriesInfo = LabInfo(
    equations = listOf(
        "S_N = \\sum_{n=1}^{N} a_n, \\qquad S = \\lim_{N \\to \\infty} S_N",
        "f(t) = \\sum_{k=1}^{\\infty} b_k \\sin(k\\omega t)",
        "c_k = \\frac{1}{M}\\sum_{n=0}^{M-1} z_n\\, e^{-2\\pi i k n / M}, \\qquad z(t) = \\sum_k c_k\\, e^{2\\pi i k t}",
    ),
    about = "An infinite series is the limit of its partial sums. Some settle on a number (often an unexpected one), others drift to infinity even though their terms vanish. Fourier's insight was that any periodic shape is a sum of pure rotations: each spinning circle is one term e^{2πikt}, and stacking them tip-to-tail draws the curve. Draw your own closed loop and the engine computes its discrete Fourier transform and replays it with circles.",
    notes = listOf(
        "Partial sums are accumulated in double precision, which is exact to about 15 digits here.",
        "Near a jump, a truncated Fourier series always overshoots by about 9% of the jump no matter how many terms are used — the Gibbs phenomenon. It is visible on the square and sawtooth waves.",
        "Your drawing is resampled to 256 points evenly spaced along its length before the transform, so pauses of your finger do not matter. With all 256 circles the reconstruction passes exactly through those samples.",
    ),
)

@Composable
fun SeriesLab() {
    var mode by remember { mutableIntStateOf(0) }
    var si by remember { mutableIntStateOf(1) }
    var nTerms by remember { mutableIntStateOf(20) }
    var wave by remember { mutableIntStateOf(0) }
    var harmonics by remember { mutableIntStateOf(5) }
    var speed by remember { mutableFloatStateOf(1f) }
    var raw by remember { mutableStateOf(listOf<Offset>()) }
    var drawing by remember { mutableStateOf(false) }
    var shape by remember { mutableIntStateOf(0) }
    var epi by remember { mutableStateOf<Epi?>(null) }
    var circles by remember { mutableIntStateOf(24) }
    var canvasSize by remember { mutableStateOf(Size(1f, 1f)) }
    val time by rememberTime(mode > 0, speed)
    val tm = rememberTextMeasurer(cacheSize = 48)
    val path = remember { Path() }
    val ser = SERIES[si]

    fun loadShape(kind: Int) {
        shape = kind
        val r = min(canvasSize.width, canvasSize.height) * 0.36f
        epi = epicycles(resample(List(400) { shapePoint(kind, it / 400.0 * 2 * PI) * r }, 256))
    }
    LaunchedEffect(mode, canvasSize) { if (mode == 2 && epi == null && canvasSize.width > 10f) loadShape(0) }

    LabScaffold("Series and Fourier", Domain.Math, SeriesInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(null, key = mode, onSingle = { o, phase ->
                if (mode != 2) false else {
                    val c = Offset(canvasSize.width / 2, canvasSize.height / 2)
                    when (phase) {
                        0 -> { drawing = true; raw = listOf(o - c); epi = null; shape = -1 }
                        1 -> raw = raw + (o - c)
                        else -> { drawing = false; val rs = resample(raw, 256); epi = if (rs.isEmpty()) null else epicycles(rs) }
                    }
                    true
                }
            }),
        ) {
            canvasSize = size
            val dp = 1.dp.toPx()
            val w = size.width; val h = size.height
            when (mode) {
                0 -> {
                    val n = nTerms
                    val sums = DoubleArray(n)
                    var s = 0.0
                    for (i in 0 until n) { s += ser.term(ser.start + i); sums[i] = s }
                    val top = h * 0.07f; val plotH = h * 0.6f; val left = 46 * dp; val right = w - 16 * dp
                    var lo = sums.min(); var hi = sums.max()
                    if (!ser.limit.isNaN()) { lo = min(lo, ser.limit); hi = max(hi, ser.limit) }
                    val pad = (hi - lo).coerceAtLeast(1e-9) * 0.12; lo -= pad; hi += pad
                    fun X(i: Int) = left + (right - left) * (if (n == 1) 0.5f else i / (n - 1f))
                    fun Y(v: Double) = (top + plotH * (1 - (v - lo) / (hi - lo))).toFloat()
                    drawRect(Color.White.copy(alpha = 0.025f), Offset(left, top), Size(right - left, plotH))
                    val step = niceStep(hi - lo, 5)
                    var gv = ceil(lo / step) * step
                    while (gv <= hi) { drawLine(Color.White.copy(alpha = 0.07f), Offset(left, Y(gv)), Offset(right, Y(gv)), 1f); label(tm, tickLabel(gv, step), left - 6 * dp, Y(gv), UE.Dim, 9f, 1f, 0.5f); gv += step }
                    if (!ser.limit.isNaN()) {
                        drawLine(UE.Amber, Offset(left, Y(ser.limit)), Offset(right, Y(ser.limit)), 1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp)))
                        label(tm, ser.limitName, right - 4 * dp, Y(ser.limit) - 4 * dp, UE.Amber, 12f, 1f, 1f)
                    } else {
                        path.rewind()
                        for (i in 0 until n) { val v = ln((ser.start + i).toDouble()) + Num.EULER_GAMMA; if (i == 0) path.moveTo(X(i), Y(v)) else path.lineTo(X(i), Y(v)) }
                        drawPath(path, UE.Violet, style = Stroke(1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp))))
                    }
                    path.rewind()
                    for (i in 0 until n) if (i == 0) path.moveTo(X(i), Y(sums[i])) else path.lineTo(X(i), Y(sums[i]))
                    glowPath(path, UE.Cyan, 1.8f * dp)
                    if (n <= 80) for (i in 0 until n) drawCircle(UE.Cyan, 2.6f * dp, Offset(X(i), Y(sums[i])))
                    glowDot(Offset(X(n - 1), Y(sums[n - 1])), UE.Text, 4 * dp)
                    label(tm, "partial sums S_N", left + 6 * dp, top + 6 * dp, UE.Dim, 9.5f)
                    // term bars
                    val bTop = h * 0.74f; val bH = h * 0.2f
                    val maxT = (0 until n).maxOf { abs(ser.term(ser.start + it)) }.coerceAtLeast(1e-12)
                    val bw = ((right - left) / n).coerceAtMost(26 * dp)
                    label(tm, "terms a_n", left + 6 * dp, bTop - 14 * dp, UE.Dim, 9.5f)
                    drawLine(Color.White.copy(alpha = 0.2f), Offset(left, bTop + bH / 2), Offset(right, bTop + bH / 2), 1f)
                    for (i in 0 until n) {
                        val t = ser.term(ser.start + i)
                        val bh = (abs(t) / maxT * bH / 2).toFloat()
                        val x = if (n == 1) (left + right) / 2 - bw / 2 else left + (right - left - bw) * i / (n - 1f)
                        drawRect(if (t >= 0) UE.Cyan.copy(alpha = 0.8f) else UE.Magenta.copy(alpha = 0.8f), Offset(x, if (t >= 0) bTop + bH / 2 - bh else bTop + bH / 2), Size((bw - 1.5f).coerceAtLeast(1f), bh))
                    }
                }
                1 -> {
                    val ph = time * 1.4
                    val unit = min(w * 0.17f, h * 0.2f)
                    var c = Offset(w * 0.24f, h * 0.5f)
                    var count = 0
                    var k = 1
                    while (count < harmonics && k < 400) {
                        val b = waveCoef(wave, k)
                        if (b != 0.0) {
                            val r = (abs(b) * unit).toFloat()
                            val ang = k * ph + (if (b < 0) PI else 0.0) + (if (wave == 3) PI / 2 else 0.0)
                            val tip = c + Offset((cos(ang) * r).toFloat(), -(sin(ang) * r).toFloat())
                            drawCircle(UE.Violet.copy(alpha = (0.55f - count * 0.012f).coerceAtLeast(0.15f)), r, c, style = Stroke(dp))
                            drawLine(UE.Text.copy(alpha = 0.8f), c, tip, 1.3f * dp)
                            c = tip; count++
                        }
                        k++
                    }
                    val x0 = w * 0.47f
                    fun partial(p: Double): Double {
                        var s = 0.0; var cnt = 0; var kk = 1
                        while (cnt < harmonics && kk < 400) { val b = waveCoef(wave, kk); if (b != 0.0) { s += b * sin(kk * p + (if (wave == 3) PI / 2 else 0.0)); cnt++ }; kk++ }
                        return s
                    }
                    val span = 3.6 * PI
                    path.rewind()
                    var pen = false
                    var lastY = 0.0
                    for (i in 0..200) {
                        val p = ph - span * i / 200
                        val y = idealWave(wave, p)
                        val pt = Offset(x0 + (w - x0 - 8 * dp) * i / 200f, h * 0.5f - (y * unit).toFloat())
                        if (pen && abs(y - lastY) < 0.5) path.lineTo(pt.x, pt.y) else path.moveTo(pt.x, pt.y)
                        pen = true; lastY = y
                    }
                    drawPath(path, UE.Text.copy(alpha = 0.3f), style = Stroke(1.2f * dp))
                    path.rewind()
                    for (i in 0..300) {
                        val p = ph - span * i / 300
                        val pt = Offset(x0 + (w - x0 - 8 * dp) * i / 300f, h * 0.5f - (partial(p) * unit).toFloat())
                        if (i == 0) path.moveTo(pt.x, pt.y) else path.lineTo(pt.x, pt.y)
                    }
                    glowPath(path, UE.Cyan, 2f * dp)
                    drawLine(UE.Amber.copy(alpha = 0.7f), c, Offset(x0, c.y), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 4 * dp)))
                    glowDot(c, UE.Amber, 4 * dp); glowDot(Offset(x0, c.y), UE.Cyan, 4 * dp)
                }
                else -> {
                    val ctr = Offset(w / 2, h / 2)
                    val e = epi
                    if (e == null) {
                        if (raw.size > 1) {
                            path.rewind()
                            raw.forEachIndexed { i, p -> if (i == 0) path.moveTo(ctr.x + p.x, ctr.y + p.y) else path.lineTo(ctr.x + p.x, ctr.y + p.y) }
                            glowPath(path, UE.Text, 2f * dp)
                        } else label(tm, "draw a closed loop with one finger", w / 2, h / 2, UE.Dim, 13f, 0.5f, 0.5f, UE.Display)
                    } else {
                        val m = e.freq.size
                        val cnt = circles.coerceAtMost(m)
                        val t = (time * 0.11) % 1.0
                        fun pos(tt: Double, upTo: Int): Offset {
                            var x = 0f; var y = 0f
                            for (i in 0 until upTo) { val a = 2 * PI * e.freq[i] * tt; val cs = cos(a).toFloat(); val sn = sin(a).toFloat(); x += e.re[i] * cs - e.im[i] * sn; y += e.re[i] * sn + e.im[i] * cs }
                            return Offset(ctr.x + x, ctr.y + y)
                        }
                        // faint target (all terms) and the bright partial reconstruction traced so far
                        path.rewind()
                        for (i in 0..m) { val p = pos(i.toDouble() / m, m); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
                        drawPath(path, UE.Text.copy(alpha = 0.16f), style = Stroke(1.2f * dp))
                        path.rewind()
                        val steps = (t * 360).toInt().coerceAtLeast(1)
                        for (i in 0..steps) { val p = pos(t * i / steps, cnt); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
                        glowPath(path, UE.Cyan, 2.2f * dp)
                        var c = ctr
                        var x = 0f; var y = 0f
                        for (i in 0 until cnt) {
                            val a = 2 * PI * e.freq[i] * t; val cs = cos(a).toFloat(); val sn = sin(a).toFloat()
                            x += e.re[i] * cs - e.im[i] * sn; y += e.re[i] * sn + e.im[i] * cs
                            val tip = Offset(ctr.x + x, ctr.y + y)
                            if (i > 0 && e.amp[i] > 0.6f) { drawCircle(UE.Violet.copy(alpha = 0.4f), e.amp[i], c, style = Stroke(dp)); drawLine(UE.Text.copy(alpha = 0.7f), c, tip, dp) }
                            c = tip
                        }
                        glowDot(c, UE.Amber, 4 * dp)
                    }
                }
            }
        }
    }) {
        Segmented(listOf("Partial sums", "Fourier waves", "Draw with circles"), mode) { mode = it }
        when (mode) {
            0 -> {
                ChipRow(SERIES.map { it.name }, si) { si = it }
                UESlider("Number of terms N", nTerms.toFloat(), 1f..500f, log = true, step = 1f, format = { it.roundToInt().toString() }) { nTerms = it.roundToInt().coerceAtLeast(1) }
                MathText(ser.tex, size = 19.sp)
                var s = 0.0
                for (i in 0 until nTerms) s += ser.term(ser.start + i)
                ReadoutRow {
                    Stat("S_N", fix(s, 8), UE.Cyan)
                    Stat("limit", if (ser.limit.isNaN()) "diverges" else fix(ser.limit, 8), UE.Amber)
                    Stat(if (ser.limit.isNaN()) "ln N + γ" else "error", if (ser.limit.isNaN()) fix(ln((ser.start + nTerms - 1).toDouble()) + Num.EULER_GAMMA, 6) else fmt(abs(s - ser.limit), 2), UE.Magenta)
                }
                Note(ser.note)
            }
            1 -> {
                ChipRow(WAVES, wave) { wave = it }
                IntSlider("Harmonics (spinning circles)", harmonics, 1..40) { harmonics = it }
                UESlider("Speed", speed, 0.1f..3f, format = { "×${fix(it, 1)}" }) { speed = it }
                MathText(when (wave) { 0 -> "f(t) = \\frac{4}{\\pi}\\sum_{k\\,\\text{odd}} \\frac{\\sin(kt)}{k}"; 1 -> "f(t) = \\frac{2}{\\pi}\\sum_{k=1}^{\\infty} \\frac{(-1)^{k+1}}{k}\\sin(kt)"; 2 -> "f(t) = \\frac{8}{\\pi^2}\\sum_{k\\,\\text{odd}} \\frac{(-1)^{(k-1)/2}}{k^2}\\sin(kt)"; else -> "f(t) = \\sum_{k=1}^{\\infty} \\frac{4}{\\pi k}\\sin\\frac{\\pi k}{4}\\cos(kt)" }, size = 17.sp)
                Note("Each circle turns k times faster than the first and is 1/k (or 1/k²) the size. The tip of the last one traces the wave; the faint line is the ideal shape. Sharp corners need infinitely many circles.")
            }
            else -> {
                ChipRow(SHAPES, shape) { loadShape(it) }
                IntSlider("Circles used", circles, 1..128) { circles = it }
                UESlider("Speed", speed, 0.1f..3f, format = { "×${fix(it, 1)}" }) { speed = it }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { GlowButton("Clear and draw") { epi = null; raw = emptyList(); shape = -1 } }
                Note("Draw any closed loop on the canvas. Circles are sorted by size, so the first few capture the overall shape and the small fast ones add the detail.")
            }
        }
    }
}
