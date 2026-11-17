package dev.universe.engine.math

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*

private const val GOLDEN_ANGLE = 137.50776405003785

private val GoldenInfo = LabInfo(
    equations = listOf(
        "F_{n+1} = F_n + F_{n-1}, \\qquad \\lim_{n\\to\\infty}\\frac{F_{n+1}}{F_n} = \\varphi",
        "\\varphi = \\frac{1+\\sqrt{5}}{2} = 1 + \\frac{1}{1 + \\frac{1}{1 + \\frac{1}{1 + \\cdots}}}",
        "\\theta_k = k \\cdot \\frac{360\\degree}{\\varphi^2} \\approx k \\cdot 137.508\\degree, \\qquad r_k = c\\sqrt{k}",
    ),
    about = "Add the last two numbers to get the next: 1, 1, 2, 3, 5, 8, 13… The ratio of neighbours homes in on φ, the golden ratio, the one number that equals one plus its own reciprocal. Squares with Fibonacci sides pack into a spiral. And a plant that turns by 360°/φ² between successive seeds packs them as tightly as geometry allows — which is why sunflowers and pine cones show Fibonacci numbers of spirals.",
    notes = listOf(
        "The Fibonacci spiral is made of quarter circles and only approximates the true golden (logarithmic) spiral; the two agree better and better as the squares grow.",
        "The seed head uses Vogel's 1979 model: seed k at angle k·θ and radius proportional to √k so that every seed has the same area. Real flowers follow it remarkably closely but not exactly.",
        "Ratios are computed with 64-bit integers, exact up to F₉₂.",
    ),
)

@Composable
fun GoldenLab() {
    val app = LocalApp.current
    var mode by remember { mutableIntStateOf(0) }
    var n by remember { mutableIntStateOf(8) }
    val nAnim by animateFloatAsState(n.toFloat(), tween(500), label = "n")
    var seeds by remember { mutableIntStateOf(600) }
    var angle by remember { mutableDoubleStateOf(136.0) }
    var arms by remember { mutableStateOf(false) }
    var depth by remember { mutableIntStateOf(4) }
    val time by rememberTime(mode == 1)
    val tm = rememberTextMeasurer(cacheSize = 48)
    val path = remember { Path() }
    val isGolden = abs(angle - GOLDEN_ANGLE) < 0.06
    LaunchedEffect(isGolden) { if (isGolden && mode == 1) app.discover("golden") }

    LabScaffold("Golden Ratio", Domain.Math, GoldenInfo, canvas = {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    // Squares attach right, up, left, down; each holds a quarter turn of the spiral.
                    val k = ceil(nAnim).toInt().coerceAtLeast(1)
                    val rects = ArrayList<FloatArray>(k)   // x0, y0, side, centreX, centreY (y up)
                    var x0 = 0f; var y0 = 0f; var x1 = 1f; var y1 = 1f
                    rects += floatArrayOf(0f, 0f, 1f, 1f, 1f)
                    for (i in 2..k) {
                        val s = Num.fib(i).toFloat()
                        when ((i - 2) % 4) {
                            0 -> { rects += floatArrayOf(x1, y0, s, x1, y1); x1 += s }
                            1 -> { rects += floatArrayOf(x0, y1, s, x0, y1); y1 += s }
                            2 -> { rects += floatArrayOf(x0 - s, y0, s, x0, y0); x0 -= s }
                            else -> { rects += floatArrayOf(x0, y0 - s, s, x1, y0); y0 -= s }
                        }
                    }
                    val sc = min(w * 0.9f / (x1 - x0), h * 0.9f / (y1 - y0))
                    val ox = w / 2 - (x0 + x1) / 2 * sc; val oy = h / 2 + (y0 + y1) / 2 * sc
                    fun P(x: Float, y: Float) = Offset(ox + x * sc, oy - y * sc)
                    for ((i, r) in rects.withIndex()) {
                        val a = if (i == k - 1) (nAnim - (k - 1)).let { if (it <= 0f) 1f else it } else 1f
                        val col = lerp(UE.Violet, UE.Cyan, i / max(1f, k - 1f))
                        val tl = P(r[0], r[1] + r[2])
                        drawRect(col.copy(alpha = 0.1f * a), tl, Size(r[2] * sc, r[2] * sc))
                        drawRect(col.copy(alpha = 0.7f * a), tl, Size(r[2] * sc, r[2] * sc), style = Stroke(dp))
                        if (r[2] * sc > 26 * dp) label(tm, Num.fib(i + 1).toString(), tl.x + r[2] * sc / 2, tl.y + r[2] * sc / 2, col.copy(alpha = a), (r[2] * sc / dp * 0.2f).coerceIn(9f, 30f), 0.5f, 0.5f)
                        path.rewind()
                        val th0 = PI.toFloat() + i * PI.toFloat() / 2
                        val steps = 24
                        for (s in 0..(steps * a).toInt()) {
                            val th = th0 + s / steps.toFloat() * PI.toFloat() / 2
                            val p = P(r[3] + r[2] * cos(th), r[4] + r[2] * sin(th))
                            if (s == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
                        }
                        glowPath(path, UE.Amber, 2.2f * dp)
                    }
                }
                1 -> {
                    val c = Offset(w / 2, h / 2)
                    val maxR = min(w, h) * 0.46f
                    val scale = maxR / sqrt(seeds.toFloat())
                    val rad = angle * PI / 180
                    val groups = if (arms) 34 else 1
                    val buckets = Array(3) { ArrayList<Offset>(seeds / 3 + 1) }
                    val pulse = if (isGolden) 0.5f + 0.5f * sin(time * 3f) else 0f
                    for (k in 1..seeds) {
                        val r = scale * sqrt(k.toFloat())
                        val th = k * rad
                        val b = if (arms) (k % 34) % 3 else if (k < seeds / 3) 0 else if (k < 2 * seeds / 3) 1 else 2
                        buckets[b] += c + Offset((cos(th) * r).toFloat(), (sin(th) * r).toFloat())
                    }
                    val sz = (scale * 1.5f).coerceIn(2.5f * dp, 13 * dp)
                    val cols = if (isGolden) listOf(UE.Amber, Color(0xFFFFE08A), Color(0xFFFF9F45)) else listOf(UE.Cyan, UE.Blue, UE.Violet)
                    for (b in 0 until 3) {
                        drawPoints(buckets[b], PointMode.Points, cols[b].copy(alpha = 0.22f + 0.2f * pulse), sz * 2.2f, StrokeCap.Round, blendMode = BlendMode.Plus)
                        drawPoints(buckets[b], PointMode.Points, cols[b], sz, StrokeCap.Round)
                    }
                    if (groups > 1) label(tm, "coloured by k mod 34", w / 2, 10 * dp, UE.Dim, 10f, 0.5f, 0f)
                }
                else -> {
                    val m = 16
                    val left = 46 * dp; val right = w - 18 * dp; val top = h * 0.1f; val bot = h * 0.86f
                    fun X(i: Int) = left + (right - left) * (i - 1) / (m - 1f)
                    fun Y(v: Double) = (bot - (bot - top) * (v - 0.9) / (2.1 - 0.9)).toFloat()
                    for (v in listOf(1.0, 1.25, 1.5, 1.75, 2.0)) { drawLine(Color.White.copy(alpha = 0.07f), Offset(left, Y(v)), Offset(right, Y(v)), 1f); label(tm, fix(v, 2), left - 6 * dp, Y(v), UE.Dim, 9f, 1f, 0.5f) }
                    drawLine(UE.Amber, Offset(left, Y(Num.PHI)), Offset(right, Y(Num.PHI)), 1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp)))
                    label(tm, "φ = 1.6180339887…", right, Y(Num.PHI) - 5 * dp, UE.Amber, 11f, 1f, 1f)
                    path.rewind()
                    for (i in 1..m) { val v = Num.fib(i + 1).toDouble() / Num.fib(i); if (i == 1) path.moveTo(X(i), Y(v)) else path.lineTo(X(i), Y(v)) }
                    glowPath(path, UE.Cyan, 1.8f * dp)
                    for (i in 1..m) {
                        val v = Num.fib(i + 1).toDouble() / Num.fib(i)
                        glowDot(Offset(X(i), Y(v)), if (i == depth + 1) UE.Text else UE.Cyan, (if (i == depth + 1) 5 else 3) * dp)
                        if (i <= 9) label(tm, "${Num.fib(i + 1)}/${Num.fib(i)}", X(i), Y(v) + (if (i % 2 == 1) 9 else -9) * dp, UE.Dim, 9f, 0.5f, if (i % 2 == 1) 0f else 1f)
                    }
                    label(tm, "ratio of consecutive Fibonacci numbers", left, top - 16 * dp, UE.Dim, 10f)
                }
            }
        }
    }) {
        Segmented(listOf("Spiral", "Sunflower", "Convergence"), mode) { mode = it }
        when (mode) {
            0 -> {
                IntSlider("Squares", n, 1..16) { n = it }
                val r = Num.fib(n + 1).toDouble() / Num.fib(n)
                MathText("\\frac{F_{${n + 1}}}{F_{$n}} = \\frac{${Num.fib(n + 1)}}{${Num.fib(n)}} = ${fix(r, 8)}", size = 18.sp)
                ReadoutRow { Stat("F($n)", groupDigits(Num.fib(n))); Stat("ratio", fix(r, 8), UE.Cyan); Stat("φ − ratio", fmt(Num.PHI - r, 2), UE.Magenta) }
                Note("Each new square's side is the sum of the previous two. The bounding rectangle approaches the golden rectangle, whose sides are in the ratio φ : 1.")
            }
            1 -> {
                UESlider("Angle between successive seeds", angle.toFloat(), 0f..180f, accent = if (isGolden) UE.Amber else UE.Cyan, format = { "${fix(angle, 2)}°" }) { angle = (it * 2).roundToInt() / 2.0 }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((t, dlt) in listOf("−1°" to -1.0, "−0.1°" to -0.1, "−0.01°" to -0.01, "+0.01°" to 0.01, "+0.1°" to 0.1, "+1°" to 1.0)) Chip(t) { angle = (angle + dlt).coerceIn(0.0, 180.0).roundTo(2) }
                }
                IntSlider("Seeds", seeds, 50..2500) { seeds = it }
                Toggle("Reveal the spiral families", arms) { arms = it }
                Note(if (isGolden) "The golden angle. No spokes, no gaps: every seed has room. Count the spirals — 21 one way, 34 the other." else "Rational fractions of a turn make spokes and waste space (try 90°, 120°, 137.14° = 360°·8/21). Somewhere near 137½° everything suddenly fits.")
            }
            else -> {
                IntSlider("Continued-fraction depth", depth, 0..8) { depth = it }
                var tex = "1"
                repeat(depth.coerceAtMost(5)) { tex = "1 + \\frac{1}{$tex}" }
                if (depth > 5) tex = tex.replaceFirst("\\frac{1}{1}", "\\frac{1}{1 + \\cdots}")
                var v = 1.0
                repeat(depth) { v = 1 + 1 / v }
                MathText("$tex = ${fix(v, 7)}", size = 17.sp)
                ReadoutRow { Stat("value", fix(v, 9), UE.Cyan); Stat("φ", "1.618033989", UE.Amber); Stat("error", fmt(abs(v - Num.PHI), 2), UE.Magenta) }
                Note("φ is the number whose continued fraction is all ones — the slowest-converging of all, which makes φ the 'most irrational' number. Each level you add is exactly the next Fibonacci ratio.")
            }
        }
    }
}
