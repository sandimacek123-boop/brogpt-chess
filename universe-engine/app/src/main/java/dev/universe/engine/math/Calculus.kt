package dev.universe.engine.math

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*

private class CFn(val name: String, val tex: String, val f: (Double) -> Double, val df: (Double) -> Double, val anti: (Double) -> Double)

private val CFNS = listOf(
    CFn("sin x", "\\sin x", ::sin, ::cos) { -cos(it) },
    CFn("x²", "x^2", { it * it }, { 2 * it }) { it * it * it / 3 },
    CFn("x³ − 2x", "x^3 - 2x", { it * it * it - 2 * it }, { 3 * it * it - 2 }) { it.pow(4) / 4 - it * it },
    CFn("eˣ", "e^x", ::exp, ::exp, ::exp),
    CFn("1/(1+x²)", "\\frac{1}{1+x^2}", { 1 / (1 + it * it) }, { -2 * it / (1 + it * it).pow(2) }, ::atan),
    CFn("cos 2x", "\\cos 2x", { cos(2 * it) }, { -2 * sin(2 * it) }) { sin(2 * it) / 2 },
)

private class Lim(val name: String, val tex: String, val at: Double, val value: Double, val valueTex: String, val f: (Double) -> Double)

private val LIMITS = listOf(
    Lim("sin x / x", "\\lim_{x \\to 0} \\frac{\\sin x}{x}", 0.0, 1.0, "1") { sin(it) / it },
    Lim("(x²−1)/(x−1)", "\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}", 1.0, 2.0, "2") { (it * it - 1) / (it - 1) },
    Lim("(1−cos x)/x²", "\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^2}", 0.0, 0.5, "\\frac{1}{2}") { (1 - cos(it)) / (it * it) },
    Lim("x·sin(1/x)", "\\lim_{x \\to 0} x \\sin\\frac{1}{x}", 0.0, 0.0, "0") { it * sin(1 / it) },
    Lim("(eˣ−1)/x", "\\lim_{x \\to 0} \\frac{e^x - 1}{x}", 0.0, 1.0, "1") { expm1(it) / it },
    Lim("(1+x)^(1/x)", "\\lim_{x \\to 0} (1+x)^{1/x}", 0.0, E, "e") { (1 + it).pow(1 / it) },
)

private class Tay(val name: String, val tex: String, val radius: Double, val f: (Double) -> Double, val coef: (Int) -> Double)

private fun fact(n: Int): Double { var r = 1.0; for (i in 2..n) r *= i; return r }

private val TAYLOR = listOf(
    Tay("sin x", "\\sin x = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n+1}}{(2n+1)!}", Double.POSITIVE_INFINITY, ::sin) { n -> if (n % 2 == 0) 0.0 else (if ((n - 1) / 2 % 2 == 0) 1 else -1) / fact(n) },
    Tay("cos x", "\\cos x = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n}}{(2n)!}", Double.POSITIVE_INFINITY, ::cos) { n -> if (n % 2 == 1) 0.0 else (if (n / 2 % 2 == 0) 1 else -1) / fact(n) },
    Tay("eˣ", "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}", Double.POSITIVE_INFINITY, ::exp) { n -> 1 / fact(n) },
    Tay("ln(1+x)", "\\ln(1+x) = \\sum_{n=1}^{\\infty} \\frac{(-1)^{n+1} x^n}{n}", 1.0, { ln(1 + it) }) { n -> if (n == 0) 0.0 else (if (n % 2 == 1) 1.0 else -1.0) / n },
    Tay("1/(1−x)", "\\frac{1}{1-x} = \\sum_{n=0}^{\\infty} x^n", 1.0, { 1 / (1 - it) }) { 1.0 },
    Tay("arctan x", "\\arctan x = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n+1}}{2n+1}", 1.0, ::atan) { n -> if (n % 2 == 0) 0.0 else (if ((n - 1) / 2 % 2 == 0) 1.0 else -1.0) / n },
)

private val CalculusInfo = LabInfo(
    equations = listOf(
        "f'(x_0) = \\lim_{h \\to 0} \\frac{f(x_0+h) - f(x_0)}{h}",
        "\\int_a^b f(x)\\,dx = \\lim_{n \\to \\infty} \\sum_{i=1}^{n} f(x_i^*)\\,\\Delta x",
        "\\lim_{x \\to c} f(x) = L \\iff \\forall \\varepsilon > 0\\; \\exists \\delta > 0 : 0 < |x - c| < \\delta \\Rightarrow |f(x) - L| < \\varepsilon",
        "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n",
    ),
    about = "Four ideas carry all of calculus. A derivative is what a secant slope becomes as its two points merge. An integral is what a sum of thin rectangles becomes as they multiply. Both rest on the limit, made precise by ε and δ: however tight a tolerance ε you demand, there is a window δ that guarantees it. And smooth functions can be rebuilt from their derivatives at a single point — the Taylor series.",
    notes = listOf(
        "In the integral view the 'exact' value comes from the analytic antiderivative; the Riemann sums are computed exactly as drawn.",
        "The δ in the limit view is found numerically by scanning outward from c, so it is the largest δ that works on a fine sample, not a proof.",
        "Taylor polynomials are evaluated with Horner's rule in double precision; beyond order ~20 rounding error would dominate, so the slider stops there. Outside the radius of convergence (shaded) more terms make the fit worse — that is real, not a bug.",
    ),
)

@Composable
fun CalculusLab() {
    var mode by remember { mutableIntStateOf(0) }
    var fi by remember { mutableIntStateOf(0) }
    val view = remember { PlotView(span = 9.0) }
    val tm = rememberTextMeasurer(cacheSize = 64)
    val path = remember { Path() }
    // derivative
    var x0 by remember { mutableDoubleStateOf(0.8) }
    var h by remember { mutableFloatStateOf(1.2f) }
    // integral
    var a by remember { mutableDoubleStateOf(-1.0) }
    var b by remember { mutableDoubleStateOf(2.0) }
    var n by remember { mutableIntStateOf(8) }
    var method by remember { mutableIntStateOf(2) }
    var grab by remember { mutableIntStateOf(0) }
    // limits
    var li by remember { mutableIntStateOf(0) }
    var eps by remember { mutableFloatStateOf(0.3f) }
    // taylor
    var ti by remember { mutableIntStateOf(0) }
    var order by remember { mutableIntStateOf(3) }
    val orderAnim by animateFloatAsState(order.toFloat(), tween(450), label = "order")
    var probeX by remember { mutableDoubleStateOf(2.0) }

    val fn = CFNS[fi]
    val lim = LIMITS[li]
    val tay = TAYLOR[ti]
    val grabPx = with(androidx.compose.ui.platform.LocalDensity.current) { 28.dp.toPx() }

    fun taylor(x: Double, ord: Float): Double {
        val whole = floor(ord).toInt(); val frac = ord - whole
        var s = 0.0; var p = 1.0
        for (k in 0..whole) { s += tay.coef(k) * p; p *= x }
        if (frac > 0f) s += tay.coef(whole + 1) * p * frac
        return s
    }
    fun riemann(): Double {
        val dx = (b - a) / n
        var s = 0.0
        when (method) {
            0 -> for (i in 0 until n) s += fn.f(a + i * dx) * dx
            1 -> for (i in 1..n) s += fn.f(a + i * dx) * dx
            2 -> for (i in 0 until n) s += fn.f(a + (i + 0.5) * dx) * dx
            3 -> for (i in 0 until n) s += (fn.f(a + i * dx) + fn.f(a + (i + 1) * dx)) / 2 * dx
            else -> s = Num.simpson(a, b, if (n % 2 == 0) n else n + 1, fn.f)
        }
        return s
    }
    fun delta(): Double {
        val e = eps.toDouble()
        var d = 0.0
        val step = view.span / 4000
        while (d < view.span) {
            val nd = d + step
            if (abs(lim.f(lim.at + nd) - lim.value) >= e || abs(lim.f(lim.at - nd) - lim.value) >= e) break
            d = nd
        }
        return d
    }

    LaunchedEffect(mode, li) {
        when (mode) {
            2 -> { view.cx = lim.at; view.cy = lim.value; view.span = 5.0 }
            3 -> { view.cx = 0.0; view.cy = 0.0; view.span = 9.0 }
            else -> { view.cx = 0.5; view.cy = 0.5; view.span = 9.0 }
        }
    }

    LabScaffold("Calculus Lab", Domain.Math, CalculusInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(view, key = mode, onSingle = { o, phase ->
                when (mode) {
                    0 -> { if (phase < 2) x0 = view.wx(o.x); true }
                    1 -> {
                        if (phase == 0) { val da = abs(o.x - view.sx(a)); val db = abs(o.x - view.sx(b)); grab = if (da < grabPx && da <= db) 1 else if (db < grabPx) 2 else 0 }
                        if (phase == 1) { if (grab == 1) a = min(view.wx(o.x), b - 0.05) else if (grab == 2) b = max(view.wx(o.x), a + 0.05) }
                        grab != 0
                    }
                    3 -> { if (phase < 2) probeX = view.wx(o.x); true }
                    else -> false
                }
            }),
        ) {
            view.bind(this)
            val dp = 1.dp.toPx()
            drawPlotGrid(view, tm)
            when (mode) {
                0 -> {
                    view.curve(path) { fn.df(it) }
                    drawPath(path, UE.Violet.copy(alpha = 0.55f), style = Stroke(1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp))))
                    view.curve(path, f = fn.f); glowPath(path, UE.Cyan, 2.2f * dp)
                    val hh = h.toDouble()
                    val y0 = fn.f(x0); val y1 = fn.f(x0 + hh)
                    val slope = (y1 - y0) / hh
                    val m = fn.df(x0)
                    val ext = view.span
                    drawLine(UE.Text.copy(alpha = 0.35f), view.pt(x0 - ext, y0 - m * ext), view.pt(x0 + ext, y0 + m * ext), 1.2f * dp)
                    glowLine(view.pt(x0 - ext, y0 - slope * ext), view.pt(x0 + ext, y0 + slope * ext), UE.Amber, 1.8f * dp, 2.4f)
                    // rise / run triangle
                    drawLine(UE.Amber.copy(alpha = 0.6f), view.pt(x0, y0), view.pt(x0 + hh, y0), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * dp, 4 * dp)))
                    drawLine(UE.Amber.copy(alpha = 0.6f), view.pt(x0 + hh, y0), view.pt(x0 + hh, y1), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * dp, 4 * dp)))
                    label(tm, "h", view.sx(x0 + hh / 2), view.sy(y0) + 4 * dp, UE.Amber, 11f, 0.5f, 0f, UE.Math)
                    glowDot(view.pt(x0, fn.df(x0)), UE.Violet, 4 * dp)
                    glowDot(view.pt(x0 + hh, y1), UE.Amber, 4.5f * dp)
                    glowDot(view.pt(x0, y0), UE.Cyan, 5.5f * dp)
                }
                1 -> {
                    val dx = (b - a) / n
                    val base = view.sy(0.0)
                    for (i in 0 until n) {
                        val xl = a + i * dx; val xr = xl + dx
                        val fill = UE.Cyan.copy(alpha = 0.2f); val edge = UE.Cyan.copy(alpha = 0.75f)
                        if (method <= 2) {
                            val yv = fn.f(when (method) { 0 -> xl; 1 -> xr; else -> (xl + xr) / 2 })
                            val top = view.sy(yv)
                            val tl = Offset(view.sx(xl), min(top, base)); val sz = Size(view.sx(xr) - view.sx(xl), abs(base - top))
                            drawRect(if (yv >= 0) fill else UE.Magenta.copy(alpha = 0.2f), tl, sz)
                            if (n <= 120) drawRect(if (yv >= 0) edge else UE.Magenta.copy(alpha = 0.75f), tl, sz, style = Stroke(dp))
                            if (method == 2 && n <= 40) drawCircle(UE.Text, 2.2f * dp, Offset(view.sx((xl + xr) / 2), top))
                        } else {
                            path.rewind(); path.moveTo(view.sx(xl), base)
                            if (method == 3) { path.lineTo(view.sx(xl), view.sy(fn.f(xl))); path.lineTo(view.sx(xr), view.sy(fn.f(xr))) }
                            else for (s in 0..8) { val x = xl + dx * s / 8; path.lineTo(view.sx(x), view.sy(fn.f(x))) }
                            path.lineTo(view.sx(xr), base); path.close()
                            drawPath(path, fill); if (n <= 120) drawPath(path, edge, style = Stroke(dp))
                        }
                    }
                    view.curve(path, f = fn.f); glowPath(path, UE.Text, 2f * dp, 2.5f)
                    for ((k, xx) in listOf(a, b).withIndex()) {
                        val px = view.sx(xx)
                        drawLine(UE.Amber, Offset(px, 0f), Offset(px, size.height), 1.3f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp)))
                        drawCircle(UE.Void, 10 * dp, Offset(px, size.height - 24 * dp)); drawCircle(UE.Amber, 10 * dp, Offset(px, size.height - 24 * dp), style = Stroke(1.5f * dp))
                        label(tm, if (k == 0) "a" else "b", px, size.height - 24 * dp, UE.Amber, 12f, 0.5f, 0.55f, UE.Math)
                    }
                }
                2 -> {
                    val e = eps.toDouble(); val d = delta()
                    drawRect(UE.Cyan.copy(alpha = 0.13f), Offset(0f, view.sy(lim.value + e)), Size(size.width, view.sy(lim.value - e) - view.sy(lim.value + e)))
                    drawLine(UE.Cyan.copy(alpha = 0.7f), Offset(0f, view.sy(lim.value + e)), Offset(size.width, view.sy(lim.value + e)), dp)
                    drawLine(UE.Cyan.copy(alpha = 0.7f), Offset(0f, view.sy(lim.value - e)), Offset(size.width, view.sy(lim.value - e)), dp)
                    drawRect(UE.Violet.copy(alpha = 0.16f), Offset(view.sx(lim.at - d), 0f), Size(view.sx(lim.at + d) - view.sx(lim.at - d), size.height))
                    drawLine(UE.Violet.copy(alpha = 0.8f), Offset(view.sx(lim.at - d), 0f), Offset(view.sx(lim.at - d), size.height), dp)
                    drawLine(UE.Violet.copy(alpha = 0.8f), Offset(view.sx(lim.at + d), 0f), Offset(view.sx(lim.at + d), size.height), dp)
                    label(tm, "L + ε", 6 * dp, view.sy(lim.value + e) - 3 * dp, UE.Cyan, 10f, 0f, 1f)
                    label(tm, "L − ε", 6 * dp, view.sy(lim.value - e) + 3 * dp, UE.Cyan, 10f, 0f, 0f)
                    label(tm, "c − δ", view.sx(lim.at - d) - 4 * dp, 8 * dp, UE.Violet, 10f, 1f, 0f)
                    label(tm, "c + δ", view.sx(lim.at + d) + 4 * dp, 8 * dp, UE.Violet, 10f, 0f, 0f)
                    view.curve(path, f = lim.f); glowPath(path, UE.Text, 2f * dp, 2.5f)
                    val p = view.pt(lim.at, lim.value)
                    drawCircle(UE.Void, 5 * dp, p); drawCircle(UE.Amber, 5 * dp, p, style = Stroke(1.8f * dp))
                }
                else -> {
                    if (tay.radius.isFinite()) {
                        drawRect(UE.Green.copy(alpha = 0.07f), Offset(view.sx(-tay.radius), 0f), Size(view.sx(tay.radius) - view.sx(-tay.radius), size.height))
                        label(tm, "radius of convergence |x| < 1", view.sx(0.0), 8 * dp, UE.Green.copy(alpha = 0.8f), 9.5f, 0.5f, 0f)
                    }
                    view.curve(path, f = tay.f); drawPath(path, UE.Text.copy(alpha = 0.75f), style = Stroke(2.2f * dp))
                    view.curve(path) { taylor(it, orderAnim) }; glowPath(path, UE.Cyan, 2.2f * dp)
                    val yv = taylor(probeX, order.toFloat()); val yt = tay.f(probeX)
                    if (yv.isFinite() && yt.isFinite()) {
                        drawLine(UE.Amber, view.pt(probeX, yv), view.pt(probeX, yt), 1.5f * dp)
                        glowDot(view.pt(probeX, yt), UE.Text, 4 * dp); glowDot(view.pt(probeX, yv), UE.Cyan, 4.5f * dp)
                    }
                    glowDot(view.pt(0.0, tay.f(0.0)), UE.Amber, 4 * dp)
                }
            }
        }
    }) {
        Segmented(listOf("Derivative", "Integral", "Limit", "Taylor"), mode) { mode = it }
        when (mode) {
            0 -> {
                ChipRow(CFNS.map { it.name }, fi) { fi = it }
                UESlider("Step h  (drag toward zero)", h, 0.001f..2.5f, log = true, accent = UE.Amber, format = { fmt(it, 3) }) { h = it }
                val slope = (fn.f(x0 + h) - fn.f(x0)) / h
                MathText("\\frac{f(x_0+h)-f(x_0)}{h} = ${fix(slope, 5)} \\quad\\to\\quad f'(x_0) = ${fix(fn.df(x0), 5)}", size = 17.sp)
                ReadoutRow {
                    Stat("x₀", fix(x0, 3)); Stat("secant slope", fix(slope, 5), UE.Amber); Stat("true slope", fix(fn.df(x0), 5), UE.Text); Stat("error", fmt(abs(slope - fn.df(x0)), 2), UE.Magenta)
                }
                Note("Drag on the graph to move x₀. The amber secant pivots onto the white tangent as h shrinks; the dashed violet curve is f′, traced by the tangent's slope.")
            }
            1 -> {
                ChipRow(CFNS.map { it.name }, fi) { fi = it }
                ChipRow(listOf("Left", "Right", "Midpoint", "Trapezoid", "Simpson"), method) { method = it }
                UESlider("Number of slices n", n.toFloat(), 1f..400f, log = true, step = 1f, format = { it.roundToInt().toString() }) { n = it.roundToInt().coerceAtLeast(1) }
                val s = riemann(); val exact = fn.anti(b) - fn.anti(a)
                MathText("\\int_{${fix(a, 2)}}^{${fix(b, 2)}} ${fn.tex}\\,dx = ${fix(exact, 6)}", size = 17.sp)
                ReadoutRow { Stat("sum", fix(s, 6), UE.Cyan); Stat("exact", fix(exact, 6)); Stat("error", fmt(abs(s - exact), 2), UE.Magenta) }
                Note(when (method) { 0, 1 -> "Endpoint rules: error shrinks like 1/n."; 2, 3 -> "Midpoint and trapezoid: error shrinks like 1/n² — double n, quarter the error."; else -> "Simpson fits parabolas: error shrinks like 1/n⁴." } + " Drag the a and b handles to move the limits.")
            }
            2 -> {
                ChipRow(LIMITS.map { it.name }, li) { li = it }
                UESlider("Tolerance ε", eps, 0.001f..1f, log = true, format = { fmt(it, 2) }) { eps = it }
                val d = delta()
                MathText("${lim.tex} = ${lim.valueTex}", size = 19.sp)
                ReadoutRow { Stat("ε (output band)", fmt(eps, 2), UE.Cyan); Stat("δ that works", fmt(d, 3), UE.Violet); Stat("f(c) itself", "undefined", UE.Amber) }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlowButton("Zoom to the band") { view.cx = lim.at; view.cy = lim.value; view.span = max(eps * 9.0, d * 3.5).coerceAtLeast(1e-4) }
                    GlowButton("Reset", accent = UE.Dim) { view.cx = lim.at; view.cy = lim.value; view.span = 5.0 }
                }
                Note("The function is not defined at c (open circle), yet every cyan tolerance band, however thin, has a violet window around c that keeps the curve inside it. That is what a limit is.")
            }
            else -> {
                ChipRow(TAYLOR.map { it.name }, ti) { ti = it }
                IntSlider("Polynomial order N", order, 0..20) { order = it }
                MathText(tay.tex, size = 17.sp)
                val yv = taylor(probeX, order.toFloat()); val yt = tay.f(probeX)
                ReadoutRow { Stat("x", fix(probeX, 3)); Stat("f(x)", fmt(yt, 6)); Stat("P_N(x)", fmt(yv, 6), UE.Cyan); Stat("error", fmt(abs(yv - yt), 2), UE.Magenta) }
                Note("Drag on the graph to compare the polynomial with the true function at any x.")
            }
        }
    }
}
