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
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.*
import kotlin.random.Random

private val ConstantsInfo = LabInfo(
    equations = listOf(
        "\\pi \\approx 4 \\cdot \\frac{\\text{darts inside the circle}}{\\text{darts thrown}}",
        "n \\sin\\frac{\\pi}{n} < \\pi < n \\tan\\frac{\\pi}{n}",
        "e = \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = \\sum_{k=0}^{\\infty} \\frac{1}{k!}",
        "e^{i\\theta} = \\lim_{n \\to \\infty} \\left(1 + \\frac{i\\theta}{n}\\right)^n = \\cos\\theta + i\\sin\\theta",
    ),
    about = "Three ways to meet π: by chance (random darts land in a circle with probability π/4), by squeezing a circle between polygons as Archimedes did, and digit by digit. Then e, the limit of ever more frequent compound growth. Finally the two meet: multiplying by (1 + iθ/n) is a tiny rotation-and-stretch, and doing it n times walks around the unit circle — land exactly halfway and you have Euler's identity.",
    notes = listOf(
        "The Monte Carlo estimate converges like 1.64/√N: a hundred times more darts buys one more digit. It is a terrible way to compute π and a wonderful way to understand probability.",
        "The digits come from Machin's 1706 formula π = 16·arctan(1/5) − 4·arctan(1/239), evaluated on this device in exact big-integer arithmetic.",
        "The digit walk turns each digit d into a step in direction d × 36°. If π is 'normal' (every digit equally likely — widely believed, unproven) the walk is a true random walk.",
        "(1 + 1/n)ⁿ is computed in double precision; beyond n ≈ 10¹⁵ rounding would destroy it, so the slider stops far short of that.",
    ),
)

@Composable
fun ConstantsLab() {
    val app = LocalApp.current
    var mode by remember { mutableIntStateOf(0) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    val tm = rememberTextMeasurer(cacheSize = 48)
    val path = remember { Path() }
    // darts
    var rate by remember { mutableFloatStateOf(40f) }
    var total by remember { mutableIntStateOf(0) }
    var inside by remember { mutableIntStateOf(0) }
    val rng = remember { Random(314159) }
    val field = remember(px) { if (px.width > 8) { val s = min(px.width, px.height) / 2; PixelField(s, s) } else null }
    val history = remember { ArrayList<FloatArray>() }
    // polygons
    var sides by remember { mutableIntStateOf(6) }
    // digits
    var digits by remember { mutableStateOf("") }
    var walkN by remember { mutableIntStateOf(1000) }
    var query by remember { mutableStateOf(TextFieldValue("")) }
    // e
    var en by remember { mutableFloatStateOf(4f) }
    // euler
    var theta by remember { mutableFloatStateOf(2.2f) }
    var steps by remember { mutableIntStateOf(8) }

    LaunchedEffect(Unit) { digits = withContext(Dispatchers.Default) { Num.piDigits(3000) } }
    LaunchedEffect(field) { total = 0; inside = 0; history.clear() }
    val frame = rememberTicker(mode == 0 && field != null) {
        val f = field ?: return@rememberTicker
        if (total >= 2_000_000) return@rememberTicker
        val n = rate.roundToInt()
        repeat(n) {
            val x = rng.nextFloat(); val y = rng.nextFloat()
            val hit = (x - 0.5f) * (x - 0.5f) + (y - 0.5f) * (y - 0.5f) <= 0.25f
            val ix = (x * f.w).toInt(); val iy = (y * f.h).toInt()
            if (hit) inside++
            for (oy in 0..1) for (ox in 0..1) if (hit) f.add(ix + ox, iy + oy, 0, 200, 240) else f.add(ix + ox, iy + oy, 150, 80, 255)
            total++
            if (total and (total - 1) == 0 || total % 5000 == 0) history += floatArrayOf(total.toFloat(), 4f * inside / total)
        }
        f.flush()
    }
    val atPi = abs(theta - PI.toFloat()) < 0.004f
    LaunchedEffect(atPi, steps) { if (atPi && steps >= 100 && mode == 4) app.discover("euler") }
    val found = remember(query.text, digits) { if (query.text.length >= 2 && digits.length > 10) digits.substring(2).indexOf(query.text) else -1 }

    LabScaffold("Constants: π, e and i", Domain.Math, ConstantsInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    frame.value
                    val side = min(w, h * 0.72f) * 0.94f
                    val tl = Offset((w - side) / 2, h * 0.03f)
                    field?.let { f -> drawImage(f.image, dstOffset = androidx.compose.ui.unit.IntOffset(tl.x.toInt(), tl.y.toInt()), dstSize = IntSize(side.toInt(), side.toInt())) }
                    drawRect(UE.Violet.copy(alpha = 0.8f), tl, Size(side, side), style = Stroke(1.2f * dp))
                    drawCircle(UE.Cyan, side / 2, tl + Offset(side / 2, side / 2), style = Stroke(1.4f * dp))
                    // convergence trace on a log axis
                    val top = tl.y + side + 18 * dp; val bot = h - 10 * dp; val left = 44 * dp; val right = w - 14 * dp
                    fun Y(v: Float) = bot - (bot - top) * ((v - 2.6f) / 1.1f).coerceIn(0f, 1f)
                    fun X(n: Float) = left + (right - left) * (ln(n) / ln(2e6f))
                    drawLine(UE.Amber, Offset(left, Y(PI.toFloat())), Offset(right, Y(PI.toFloat())), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 4 * dp)))
                    label(tm, "π", left - 6 * dp, Y(PI.toFloat()), UE.Amber, 12f, 1f, 0.5f, UE.Math)
                    for (e in 0..6) { val x = X(10f.pow(e)); drawLine(Color.White.copy(alpha = 0.08f), Offset(x, top), Offset(x, bot), 1f); label(tm, "10${superscript(e)}", x, bot + 1 * dp, UE.Dim, 8.5f, 0.5f, 0f) }
                    if (history.size > 1) { path.rewind(); history.forEachIndexed { i, p -> if (i == 0) path.moveTo(X(p[0]), Y(p[1])) else path.lineTo(X(p[0]), Y(p[1])) }; glowPath(path, UE.Cyan, 1.6f * dp) }
                }
                1 -> {
                    val c = Offset(w / 2, h / 2); val r = min(w, h) * 0.36f
                    val n = sides
                    val pin = Path(); val pout = Path()
                    for (k in 0..n) {
                        val a = 2 * PI.toFloat() * k / n - PI.toFloat() / 2
                        val pi = c + Offset(cos(a) * r, sin(a) * r)
                        val ro = r / cos(PI.toFloat() / n)
                        val ao = a + PI.toFloat() / n
                        val po = c + Offset(cos(ao) * ro, sin(ao) * ro)
                        if (k == 0) { pin.moveTo(pi.x, pi.y); pout.moveTo(po.x, po.y) } else { pin.lineTo(pi.x, pi.y); pout.lineTo(po.x, po.y) }
                    }
                    drawPath(pout, UE.Violet.copy(alpha = 0.1f)); drawPath(pout, UE.Violet, style = Stroke(1.6f * dp))
                    drawCircle(UE.Text, r, c, style = Stroke(1.6f * dp))
                    drawPath(pin, UE.Cyan.copy(alpha = 0.12f)); glowPath(pin, UE.Cyan, 1.6f * dp)
                    drawLine(UE.Dim, c, c + Offset(r, 0f), dp); label(tm, "r = ½", c.x + r / 2, c.y - 4 * dp, UE.Dim, 10f, 0.5f, 1f)
                }
                2 -> {
                    if (digits.length < 100) label(tm, "computing 3000 digits…", w / 2, h / 2, UE.Dim, 12f, 0.5f, 0.5f)
                    else {
                        val n = walkN.coerceAtMost(digits.length - 2)
                        val xs = FloatArray(n + 1); val ys = FloatArray(n + 1)
                        var minX = 0f; var maxX = 0f; var minY = 0f; var maxY = 0f
                        for (i in 0 until n) {
                            val d = digits[i + 2] - '0'
                            val a = d * PI.toFloat() / 5 - PI.toFloat() / 2
                            xs[i + 1] = xs[i] + cos(a); ys[i + 1] = ys[i] + sin(a)
                            minX = min(minX, xs[i + 1]); maxX = max(maxX, xs[i + 1]); minY = min(minY, ys[i + 1]); maxY = max(maxY, ys[i + 1])
                        }
                        val sc = min(w * 0.88f / (maxX - minX).coerceAtLeast(1f), h * 0.88f / (maxY - minY).coerceAtLeast(1f))
                        val ox = w / 2 - (minX + maxX) / 2 * sc; val oy = h / 2 - (minY + maxY) / 2 * sc
                        val chunks = 24
                        for (c in 0 until chunks) {
                            path.rewind()
                            val a = c * n / chunks; val b = (c + 1) * n / chunks
                            for (i in a..b) { if (i == a) path.moveTo(ox + xs[i] * sc, oy + ys[i] * sc) else path.lineTo(ox + xs[i] * sc, oy + ys[i] * sc) }
                            drawPath(path, lerp(UE.Violet, UE.Cyan, c / (chunks - 1f)).copy(alpha = 0.9f), style = Stroke(1.3f * dp))
                        }
                        glowDot(Offset(ox, oy), UE.Text, 4 * dp); label(tm, "3.", ox + 7 * dp, oy, UE.Text, 11f, 0f, 0.5f)
                        if (found in 0 until n) {
                            path.rewind()
                            for (i in found..min(n, found + query.text.length)) { if (i == found) path.moveTo(ox + xs[i] * sc, oy + ys[i] * sc) else path.lineTo(ox + xs[i] * sc, oy + ys[i] * sc) }
                            glowPath(path, UE.Amber, 3f * dp)
                            glowDot(Offset(ox + xs[found] * sc, oy + ys[found] * sc), UE.Amber, 5 * dp)
                        }
                    }
                }
                3 -> {
                    val n = en.toDouble()
                    val left = 48 * dp; val right = w - 16 * dp; val top = h * 0.1f; val bot = h * 0.86f
                    val lmax = 6.0
                    fun X(v: Double) = (left + (right - left) * (log10(v) / lmax)).toFloat()
                    fun Y(v: Double) = (bot - (bot - top) * ((v - 1.9) / (2.8 - 1.9))).toFloat()
                    for (e in 0..6) { drawLine(Color.White.copy(alpha = 0.07f), Offset(X(10.0.pow(e)), top), Offset(X(10.0.pow(e)), bot), 1f); label(tm, "10${superscript(e)}", X(10.0.pow(e)), bot + 4 * dp, UE.Dim, 9f, 0.5f, 0f) }
                    for (v in listOf(2.0, 2.25, 2.5, 2.75)) { drawLine(Color.White.copy(alpha = 0.07f), Offset(left, Y(v)), Offset(right, Y(v)), 1f); label(tm, fix(v, 2), left - 6 * dp, Y(v), UE.Dim, 9f, 1f, 0.5f) }
                    drawLine(UE.Amber, Offset(left, Y(E)), Offset(right, Y(E)), 1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp)))
                    label(tm, "e = 2.718281828…", right, Y(E) - 5 * dp, UE.Amber, 11f, 1f, 1f)
                    path.rewind()
                    for (i in 0..200) { val x = 10.0.pow(lmax * i / 200); val y = (1 + 1 / x).pow(x); if (i == 0) path.moveTo(X(x), Y(y)) else path.lineTo(X(x), Y(y)) }
                    glowPath(path, UE.Cyan, 2f * dp)
                    glowDot(Offset(X(n), Y((1 + 1 / n).pow(n))), UE.Text, 5 * dp)
                    label(tm, "compounding periods per year, n", (left + right) / 2, bot + 20 * dp, UE.Dim, 10f, 0.5f, 0f)
                }
                else -> {
                    val unit = min(w, h) * 0.3f
                    val c = Offset(w / 2, h * 0.52f)
                    fun P(re: Double, im: Double) = Offset(c.x + (re * unit).toFloat(), c.y - (im * unit).toFloat())
                    drawLine(Color.White.copy(alpha = 0.22f), Offset(0f, c.y), Offset(w, c.y), 1f); drawLine(Color.White.copy(alpha = 0.22f), Offset(c.x, 0f), Offset(c.x, h), 1f)
                    drawCircle(UE.Text.copy(alpha = 0.4f), unit, c, style = Stroke(1.2f * dp))
                    label(tm, "1", c.x + unit + 5 * dp, c.y + 4 * dp, UE.Dim, 10f); label(tm, "−1", c.x - unit - 5 * dp, c.y + 4 * dp, UE.Dim, 10f, 1f); label(tm, "i", c.x + 5 * dp, c.y - unit - 4 * dp, UE.Dim, 11f, 0f, 1f, UE.Math)
                    val n = steps
                    val mr = 1.0; val mi = theta.toDouble() / n
                    var zr = 1.0; var zi = 0.0
                    path.rewind(); path.moveTo(P(1.0, 0.0).x, P(1.0, 0.0).y)
                    for (k in 1..n) {
                        val nr = zr * mr - zi * mi; val ni = zr * mi + zi * mr
                        if (n <= 60) { drawLine(UE.Cyan.copy(alpha = 0.18f), c, P(nr, ni), 1f) }
                        zr = nr; zi = ni
                        path.lineTo(P(zr, zi).x, P(zr, zi).y)
                        if (n <= 40) drawCircle(UE.Cyan, 2.4f * dp, P(zr, zi))
                    }
                    glowPath(path, UE.Cyan, 2f * dp)
                    val target = P(cos(theta.toDouble()), sin(theta.toDouble()))
                    drawLine(UE.Amber.copy(alpha = 0.6f), c, target, dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 4 * dp)))
                    glowDot(target, UE.Amber, 5 * dp); glowDot(P(zr, zi), UE.Text, 5 * dp)
                    if (atPi) label(tm, "e^{iπ} = −1", target.x, target.y - 14 * dp, UE.Amber, 13f, 0.5f, 1f, UE.Display, FontWeight.Medium)
                }
            }
        }
    }) {
        ChipRow(listOf("π by chance", "π by polygons", "π digit walk", "e", "e^{iθ}"), mode) { mode = it }
        when (mode) {
            0 -> {
                UESlider("Darts per frame", rate, 1f..3000f, log = true, format = { it.roundToInt().toString() }) { rate = it }
                val est = if (total > 0) 4.0 * inside / total else 0.0
                ReadoutRow { Stat("thrown", groupDigits(total.toLong())); Stat("estimate", fix(est, 6), UE.Cyan); Stat("error", fmt(abs(est - PI), 2), UE.Magenta); Stat("expected ±", if (total > 0) fmt(1.642 / sqrt(total.toDouble()), 2) else "—", UE.Violet) }
                GlowButton("Start over", accent = UE.Dim) { field?.clear(); field?.flush(); total = 0; inside = 0; history.clear() }
                Note("The circle covers π/4 of the square, so that is the chance a random dart lands inside. The trace below shows the estimate wandering toward π on a logarithmic axis.")
            }
            1 -> {
                IntSlider("Polygon sides n", sides, 3..384) { sides = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { for (v in listOf(6, 12, 24, 48, 96, 192, 384)) Chip(v.toString(), sides == v) { sides = v } }
                val lo = sides * sin(PI / sides); val hi = sides * tan(PI / sides)
                MathText("${fix(lo, 7)} < \\pi < ${fix(hi, 7)}", size = 19.sp)
                ReadoutRow { Stat("inscribed", fix(lo, 8), UE.Cyan); Stat("circumscribed", fix(hi, 8), UE.Violet); Stat("gap", fmt(hi - lo, 2), UE.Magenta) }
                Note("Archimedes doubled a hexagon four times to reach 96 sides and proved 3 10/71 < π < 3 1/7 — two correct decimals, by hand, around 250 BC.")
            }
            2 -> {
                IntSlider("Digits walked", walkN, 50..3000) { walkN = it }
                UEField(query, { v -> query = v.copy(text = v.text.filter { it.isDigit() }.take(8)) }, Modifier.fillMaxWidth(), UE.Amber, prefix = "find", numeric = true)
                if (query.text.length >= 2) T(if (found >= 0) "“${query.text}” first appears at decimal place ${found + 1}" else "“${query.text}” does not occur in the first 3000 decimals", size = 12.5.sp, color = if (found >= 0) UE.Amber else UE.Dim)
                if (digits.length > 60) T(digits.take(62).chunked(11).joinToString(" ") + "…", size = 12.sp, color = UE.Dim, font = UE.Mono)
                Note("Each digit is a step: 0 points up, and every further digit turns another 36°. Type a birthday (e.g. 1407) to find where it first occurs.")
            }
            3 -> {
                UESlider("Compounding periods n", en, 1f..1_000_000f, log = true, format = { groupDigits(it.toLong()) }) { en = it }
                val n = floor(en.toDouble()).coerceAtLeast(1.0)
                val v = (1 + 1 / n).pow(n)
                var ser = 0.0; var f = 1.0
                val terms = min(n.toInt(), 14)
                for (k in 0..terms) { if (k > 0) f *= k; ser += 1 / f }
                MathText("\\left(1 + \\frac{1}{${n.toLong()}}\\right)^{${n.toLong()}} = ${fix(v, 8)}", size = 18.sp)
                ReadoutRow { Stat("compound value", fix(v, 8), UE.Cyan); Stat("e − value", fmt(E - v, 2), UE.Magenta); Stat("series, ${terms + 1} terms", fix(ser, 8), UE.Violet) }
                Note("One unit at 100 % interest, compounded n times a year. More frequent compounding helps less and less — it tops out at e. The factorial series reaches the same limit thousands of times faster.")
            }
            else -> {
                UESlider("Angle θ", theta, 0f..(2 * PI.toFloat()), accent = UE.Amber, format = { "${fix(it / PI.toFloat(), 3)}π" }) { theta = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { for ((name, v) in listOf("π/2" to PI.toFloat() / 2, "π" to PI.toFloat(), "3π/2" to 1.5f * PI.toFloat(), "2π" to 2 * PI.toFloat())) Chip(name, abs(theta - v) < 0.004f, UE.Amber) { theta = v } }
                UESlider("Steps n", steps.toFloat(), 1f..400f, log = true, step = 1f, format = { it.roundToInt().toString() }) { steps = it.roundToInt().coerceAtLeast(1) }
                var zr = 1.0; var zi = 0.0
                repeat(steps) { val nr = zr - zi * theta / steps; val ni = zr * theta / steps + zi; zr = nr; zi = ni }
                MathText("\\left(1 + \\frac{i\\theta}{$steps}\\right)^{$steps} = ${fix(zr, 4)} ${if (zi >= 0) "+" else "-"} ${fix(abs(zi), 4)}\\,i", size = 17.sp)
                ReadoutRow { Stat("cos θ + i sin θ", "${fix(cos(theta), 4)} ${if (sin(theta) >= 0) "+" else "−"} ${fix(abs(sin(theta)), 4)}i", UE.Amber); Stat("distance", fmt(hypot(zr - cos(theta), zi - sin(theta)), 2), UE.Magenta) }
                Note("Each factor (1 + iθ/n) is a small step at right angles to the current position. With few steps the path spirals outward; with many it hugs the circle and ends at angle θ.")
            }
        }
    }
}
