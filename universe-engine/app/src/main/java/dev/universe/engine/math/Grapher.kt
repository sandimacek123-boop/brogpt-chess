package dev.universe.engine.math

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Expr
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.abs

private class Slot(text: String, val color: Color) {
    var field by mutableStateOf(TextFieldValue(text, TextRange(text.length)))
    var on by mutableStateOf(true)
    var expr by mutableStateOf<Expr?>(null)
    var error by mutableStateOf<String?>(null)
    fun set(v: TextFieldValue) {
        field = v
        val (e, err) = Expr.tryParse(v.text)
        if (e != null) expr = e
        error = if (v.text.isBlank()) null else err
        if (v.text.isBlank()) expr = null
    }
    init { set(field) }
}

private val PRESETS = listOf(
    "sin(x)/x", "x^3 - 3x", "e^(-x^2)", "a sin(b x + c)", "tan(x)", "1/x", "sqrt(4 - x^2)", "x sin(1/x)", "|x| - 2", "ln(x)", "floor(x)", "sin(x - t)", "x!", "cos(3x) e^(-x^2/8)",
)
private val KEYS = listOf("sin(", "cos(", "tan(", "ln(", "√(", "^", "π", "e", "x", "a", "b", "c", "t", "(", ")", "|", "!")

private val GrapherInfo = LabInfo(
    equations = listOf(
        "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x-h)}{2h}",
        "\\int_{x_1}^{x_2} f(x)\\,dx \\approx \\frac{h}{3}\\left[f_0 + 4f_1 + 2f_2 + \\cdots + 4f_{n-1} + f_n\\right]",
    ),
    about = "Type any function of x and it is compiled into an expression tree and plotted live. Drag to pan, pinch to zoom, tap the curve to probe it. The magenta curve is the derivative; the shaded region is the definite integral between the two handles. Parameters a, b, c appear as sliders when you use them, and t is time.",
    notes = listOf(
        "The derivative is a central finite difference with step h ≈ 10⁻⁵·max(1, |x|): accurate to roughly 10 significant digits for smooth functions, meaningless at kinks and jumps.",
        "The integral uses composite Simpson's rule with 600 intervals. It assumes the function is finite and smooth between the handles; across an asymptote the number shown is not meaningful.",
        "Curves are sampled once per 1.5 screen pixels, and the pen lifts at large jumps so that asymptotes are not joined by false vertical lines. Features narrower than a pixel can be missed.",
        "x! is evaluated as Γ(x + 1) (Lanczos approximation), which extends the factorial to non-integers.",
    ),
)

@Composable
fun GrapherLab() {
    val app = LocalApp.current
    val slots = remember {
        listOf(Slot(app.prefs.grapherExpr.ifBlank { "a sin(b x + c)" }, UE.Cyan), Slot("", UE.Violet), Slot("", UE.Amber))
    }
    var active by remember { mutableIntStateOf(0) }
    val view = remember { PlotView(span = 14.0) }
    var a by remember { mutableFloatStateOf(1f) }
    var b by remember { mutableFloatStateOf(1f) }
    var c by remember { mutableFloatStateOf(0f) }
    var showDeriv by remember { mutableStateOf(false) }
    var showInt by remember { mutableStateOf(false) }
    var x1 by remember { mutableDoubleStateOf(-2.0) }
    var x2 by remember { mutableDoubleStateOf(2.0) }
    var traceX by remember { mutableStateOf<Double?>(null) }
    var dragging by remember { mutableIntStateOf(0) }
    val usesT = slots.any { it.on && it.expr?.uses("t") == true }
    val time by rememberTime(usesT)
    val tm = rememberTextMeasurer(cacheSize = 64)
    val focus = LocalFocusManager.current
    val path = remember { Path() }
    val cur = slots[active]
    val grabPx = with(androidx.compose.ui.platform.LocalDensity.current) { 26.dp.toPx() }

    fun f(s: Slot, x: Double): Double = s.expr?.eval(x, 0.0, a.toDouble(), b.toDouble(), c.toDouble(), time.toDouble()) ?: Double.NaN

    LaunchedEffect(slots[0].field.text) {
        val e = slots[0].expr
        if (e != null && slots[0].error == null) {
            app.update { it.copy(grapherExpr = slots[0].field.text) }
            if (e.isConstant && e.eval(0.0) == 42.0) app.discover("answer")
        }
    }

    LabScaffold("Function Grapher", Domain.Math, GrapherInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(
                view, key = showInt,
                onTap = { o -> focus.clearFocus(); traceX = view.wx(o.x) },
                onSingle = { o, phase ->
                    when (phase) {
                        0 -> {
                            dragging = 0
                            if (showInt) {
                                val d1 = abs(o.x - view.sx(x1)); val d2 = abs(o.x - view.sx(x2))
                                if (d1 < grabPx && d1 <= d2) dragging = 1 else if (d2 < grabPx) dragging = 2
                            }
                            dragging != 0
                        }
                        1 -> { if (dragging == 1) x1 = view.wx(o.x) else if (dragging == 2) x2 = view.wx(o.x); true }
                        else -> { dragging = 0; true }
                    }
                },
            ),
        ) {
            view.bind(this)
            drawPlotGrid(view, tm)
            val dp = 1.dp.toPx()
            // definite integral: shaded area between the handles
            if (showInt && cur.expr != null) {
                val lo = minOf(x1, x2); val hi = maxOf(x1, x2)
                val area = Path()
                val n = 160
                area.moveTo(view.sx(lo), view.sy(0.0))
                for (i in 0..n) {
                    val x = lo + (hi - lo) * i / n
                    val y = f(cur, x)
                    area.lineTo(view.sx(x), view.sy(if (y.isNaN() || y.isInfinite()) 0.0 else y).coerceIn(-size.height, 2 * size.height))
                }
                area.lineTo(view.sx(hi), view.sy(0.0)); area.close()
                drawPath(area, cur.color.copy(alpha = 0.2f))
                for ((i, xx) in listOf(x1, x2).withIndex()) {
                    val px = view.sx(xx)
                    drawLine(UE.Text.copy(alpha = 0.7f), Offset(px, 0f), Offset(px, size.height), 1.2f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp)))
                    drawCircle(UE.Void, 9 * dp, Offset(px, size.height - 22 * dp))
                    drawCircle(UE.Text, 9 * dp, Offset(px, size.height - 22 * dp), style = Stroke(1.5f * dp))
                    label(tm, "x${subscript(i + 1)}", px, size.height - 22 * dp, UE.Text, 9f, 0.5f, 0.5f)
                }
            }
            for (s in slots) {
                if (!s.on || s.expr == null) continue
                view.curve(path) { x -> f(s, x) }
                glowPath(path, s.color, 2.2f * dp)
            }
            if (showDeriv && cur.expr != null) {
                view.curve(path) { x -> Num.deriv(x) { f(cur, it) } }
                drawPath(path, UE.Magenta, style = Stroke(1.6f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8 * dp, 5 * dp))))
            }
            // roots of the active function inside the window
            if (cur.expr != null && cur.on) {
                val n = 240
                var px = view.left
                var py = f(cur, px)
                var shown = 0
                for (i in 1..n) {
                    val x = view.left + (view.right - view.left) * i / n
                    val y = f(cur, x)
                    if (shown < 14 && py.isFinite() && y.isFinite() && (py < 0) != (y < 0) && abs(y - py) < view.span) {
                        val r = Num.bisect(px, x, 40) { f(cur, it) }
                        if (abs(f(cur, r)) < 1e-6 * view.span + 1e-9) {
                            val p = view.pt(r, 0.0)
                            drawCircle(UE.Void, 4 * dp, p); drawCircle(UE.Text, 4 * dp, p, style = Stroke(1.4f * dp))
                            shown++
                        }
                    }
                    px = x; py = y
                }
            }
            // trace cursor with tangent line
            val tx = traceX
            if (tx != null && cur.expr != null) {
                val y = f(cur, tx)
                if (y.isFinite()) {
                    val m = Num.deriv(tx) { f(cur, it) }
                    val p = view.pt(tx, y)
                    val half = view.span * 0.16
                    if (m.isFinite()) glowLine(view.pt(tx - half, y - m * half), view.pt(tx + half, y + m * half), UE.Text.copy(alpha = 0.85f), 1.3f * dp, 2f)
                    drawLine(cur.color.copy(alpha = 0.35f), Offset(p.x, p.y), Offset(p.x, view.sy(0.0)), dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * dp, 4 * dp)))
                    glowDot(p, cur.color, 5 * dp)
                    val right = p.x < size.width * 0.6f
                    label(tm, "(${fmt(tx, 4)}, ${fmt(y, 4)})", p.x + (if (right) 12 else -12) * dp, p.y - 14 * dp, UE.Text, 11f, if (right) 0f else 1f, 1f)
                }
            }
        }
    }) {
        slots.forEachIndexed { i, s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(30.dp).pressable { s.on = !s.on }, contentAlignment = Alignment.Center) {
                    Box(Modifier.size(if (s.on) 14.dp else 10.dp).clip(CircleShape).background(if (s.on) s.color else UE.Faint))
                }
                Spacer(Modifier.width(6.dp))
                UEField(s.field, { s.set(it); active = i }, Modifier.weight(1f), s.color, prefix = "f${subscript(i + 1)}(x) =", error = s.error != null && i == active, onFocus = { active = i })
            }
        }
        cur.error?.let { T(it, size = 12.sp, color = UE.Red) }
        ChipRow(KEYS, -1, cur.color) { k ->
            val key = KEYS[k]
            val v = cur.field
            val start = v.selection.min; val end = v.selection.max
            cur.set(TextFieldValue(v.text.substring(0, start) + key + v.text.substring(end), TextRange(start + key.length)))
        }
        SectionLabel("Examples")
        ChipRow(PRESETS, PRESETS.indexOf(cur.field.text), cur.color) { k -> cur.set(TextFieldValue(PRESETS[k], TextRange(PRESETS[k].length))); cur.on = true; focus.clearFocus() }
        val anyA = slots.any { it.on && it.expr?.uses("a") == true }
        val anyB = slots.any { it.on && it.expr?.uses("b") == true }
        val anyC = slots.any { it.on && it.expr?.uses("c") == true }
        if (anyA) UESlider("a", a, -5f..5f, format = { fix(it, 2) }) { a = it }
        if (anyB) UESlider("b", b, -5f..5f, format = { fix(it, 2) }) { b = it }
        if (anyC) UESlider("c", c, -5f..5f, format = { fix(it, 2) }) { c = it }
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Toggle("Derivative f′", showDeriv, accent = UE.Magenta) { showDeriv = it }
            Toggle("Integral ∫", showInt, accent = cur.color) { showInt = it; if (it) { x1 = view.cx - view.span * 0.18; x2 = view.cx + view.span * 0.18 } }
        }
        val tx = traceX
        if (cur.expr != null && (tx != null || showInt)) {
            ReadoutRow {
                if (tx != null) {
                    Stat("x", fmt(tx, 5))
                    Stat("f(x)", fmt(f(cur, tx), 6), cur.color)
                    Stat("f′(x)", fmt(Num.deriv(tx) { f(cur, it) }, 5), UE.Magenta)
                }
                if (showInt) Stat("∫ f dx", fmt(Num.simpson(x1, x2, 600) { f(cur, it) }, 6), cur.color)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlowButton("Reset view") { view.cx = 0.0; view.cy = 0.0; view.span = 14.0 }
            GlowButton("Clear probe", accent = UE.Dim) { traceX = null }
        }
        Note("Tap the plot to probe a point. Drag the x₁, x₂ handles to change the integration limits.")
    }
}
