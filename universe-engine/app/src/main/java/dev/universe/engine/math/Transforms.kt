package dev.universe.engine.math

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
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
import dev.universe.engine.core.ui.*
import kotlinx.coroutines.launch
import kotlin.math.*

private val TransformsInfo = LabInfo(
    equations = listOf(
        "y = a\\,f\\big(b(x - h)\\big) + k",
        "\\vec{v} = (x, y) \\mapsto x\\,\\hat{\\imath}' + y\\,\\hat{\\jmath}', \\qquad \\det A = ad - bc",
        "A\\vec{v} = \\lambda\\vec{v}, \\qquad \\lambda^2 - (a+d)\\lambda + (ad - bc) = 0",
        "w = f(z), \\quad z = x + iy",
    ),
    about = "Three kinds of transformation. Stretching and sliding a graph: every change you make to the formula has a precise geometric meaning. A matrix: the two columns say where the basis arrows î and ĵ land, and the whole plane follows — grid lines stay parallel and evenly spaced; the determinant is the factor by which areas grow, and eigenvectors are the directions that only stretch. A complex function: every point of the plane moves to f(z), bending the grid but, wherever f′ ≠ 0, keeping all angles — a conformal map.",
    notes = listOf(
        "Inside f, changes act 'backwards': b > 1 compresses the graph horizontally and +h shifts it right. That is a consequence of substituting x, not a convention.",
        "The morph slider interpolates linearly between each point and its image, z + s·(f(z) − z). It is a visual aid, not the flow of any differential equation.",
        "Grid curves that pass near a pole (for 1/z, near 0) fly off to infinity; the pen lifts there.",
    ),
)

private class Base(val name: String, val tex: (String) -> String, val f: (Double) -> Double)

private val BASES = listOf(
    Base("x²", { "($it)^2" }) { it * it }, Base("sin x", { "\\sin($it)" }, ::sin), Base("|x|", { "|$it|" }) { abs(it) }, Base("√x", { "\\sqrt{$it}" }, ::sqrt),
    Base("1/x", { "\\frac{1}{$it}" }) { 1 / it }, Base("eˣ", { "e^{$it}" }, ::exp), Base("x³", { "($it)^3" }) { it * it * it },
)

private val MATRICES = listOf(
    "Identity" to floatArrayOf(1f, 0f, 0f, 1f), "Rotate 45°" to floatArrayOf(0.7071f, -0.7071f, 0.7071f, 0.7071f), "Shear" to floatArrayOf(1f, 1f, 0f, 1f),
    "Stretch" to floatArrayOf(2f, 0f, 0f, 0.5f), "Reflect" to floatArrayOf(0f, 1f, 1f, 0f), "Squash (det 0)" to floatArrayOf(1f, 2f, 0.5f, 1f), "Fibonacci" to floatArrayOf(1f, 1f, 1f, 0f),
)

private val CMAPS = listOf("z²", "z³", "1/z", "eᶻ", "sin z", "(z−1)/(z+1)")

private fun cmap(kind: Int, x: Double, y: Double, out: DoubleArray) {
    when (kind) {
        0 -> { out[0] = x * x - y * y; out[1] = 2 * x * y }
        1 -> { out[0] = x * x * x - 3 * x * y * y; out[1] = 3 * x * x * y - y * y * y }
        2 -> { val d = x * x + y * y; out[0] = x / d; out[1] = -y / d }
        3 -> { val e = exp(x); out[0] = e * cos(y); out[1] = e * sin(y) }
        4 -> { out[0] = sin(x) * cosh(y); out[1] = cos(x) * sinh(y) }
        else -> { val d = (x + 1) * (x + 1) + y * y; out[0] = ((x - 1) * (x + 1) + y * y) / d; out[1] = (y * (x + 1) - (x - 1) * y) / d }
    }
}

@Composable
fun TransformsLab() {
    var mode by remember { mutableIntStateOf(0) }
    val tm = rememberTextMeasurer(cacheSize = 64)
    val path = remember { Path() }
    val scope = rememberCoroutineScope()
    // function transform
    var bi by remember { mutableIntStateOf(1) }
    var a by remember { mutableFloatStateOf(1.5f) }
    var b by remember { mutableFloatStateOf(1f) }
    var hh by remember { mutableFloatStateOf(0f) }
    var k by remember { mutableFloatStateOf(0f) }
    val view = remember { PlotView(span = 12.0) }
    // matrix
    var m by remember { mutableStateOf(floatArrayOf(1f, 1f, 0f, 1f)) }
    val morph = remember { Animatable(1f) }
    var grab by remember { mutableIntStateOf(0) }
    var cs by remember { mutableStateOf(Size(1f, 1f)) }
    // complex
    var ci by remember { mutableIntStateOf(0) }
    var s by remember { mutableFloatStateOf(1f) }
    val grabPx = with(androidx.compose.ui.platform.LocalDensity.current) { 40.dp.toPx() }
    fun unit(sz: Size) = min(sz.width, sz.height) / 8.5f

    LabScaffold("Transformations", Domain.Math, TransformsInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(if (mode == 0) view else null, key = mode, onSingle = { o, ph ->
                if (mode != 1) false else {
                    val u = unit(cs); val c = Offset(cs.width / 2, cs.height / 2)
                    val ti = c + Offset(m[0] * u, -m[2] * u); val tj = c + Offset(m[1] * u, -m[3] * u)
                    if (ph == 0) { val di = (ti - o).getDistance(); val dj = (tj - o).getDistance(); grab = if (di < grabPx && di <= dj) 1 else if (dj < grabPx) 2 else 0 }
                    if (ph == 1 && grab != 0) {
                        val x = ((o.x - c.x) / u * 4).roundToInt() / 4f; val y = (-(o.y - c.y) / u * 4).roundToInt() / 4f
                        m = if (grab == 1) floatArrayOf(x, m[1], y, m[3]) else floatArrayOf(m[0], x, m[2], y)
                    }
                    grab != 0
                }
            }),
        ) {
            cs = size
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    view.bind(this); drawPlotGrid(view, tm)
                    val base = BASES[bi]
                    view.curve(path, f = base.f); drawPath(path, UE.Text.copy(alpha = 0.4f), style = Stroke(1.6f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp))))
                    view.curve(path) { x -> a * base.f(b * (x - hh)) + k }; glowPath(path, UE.Cyan, 2.3f * dp)
                    if (hh != 0f || k != 0f) arrow(view.pt(0.0, base.f(0.0).takeIf { it.isFinite() } ?: 0.0), view.pt(hh.toDouble(), (a * (base.f(0.0).takeIf { it.isFinite() } ?: 0.0) + k)), UE.Amber, 1.5f * dp, 9 * dp)
                }
                1 -> {
                    val u = unit(size); val c = Offset(w / 2, h / 2)
                    val t = morph.value
                    val A = m[0] * t + (1 - t); val B = m[1] * t; val C = m[2] * t; val D = m[3] * t + (1 - t)
                    fun P(x: Float, y: Float) = Offset(c.x + (A * x + B * y) * u, c.y - (C * x + D * y) * u)
                    for (g in -9..9) { drawLine(Color.White.copy(alpha = 0.05f), Offset(c.x + g * u, 0f), Offset(c.x + g * u, h), 1f); drawLine(Color.White.copy(alpha = 0.05f), Offset(0f, c.y + g * u), Offset(w, c.y + g * u), 1f) }
                    for (g in -12..12) {
                        drawLine(UE.Violet.copy(alpha = if (g == 0) 0.9f else 0.3f), P(g.toFloat(), -14f), P(g.toFloat(), 14f), (if (g == 0) 1.6f else 1f) * dp)
                        drawLine(UE.Cyan.copy(alpha = if (g == 0) 0.9f else 0.3f), P(-14f, g.toFloat()), P(14f, g.toFloat()), (if (g == 0) 1.6f else 1f) * dp)
                    }
                    path.rewind(); val p0 = P(0f, 0f); val p1 = P(1f, 0f); val p2 = P(1f, 1f); val p3 = P(0f, 1f)
                    path.moveTo(p0.x, p0.y); path.lineTo(p1.x, p1.y); path.lineTo(p2.x, p2.y); path.lineTo(p3.x, p3.y); path.close()
                    val det = A * D - B * C
                    drawPath(path, (if (det >= 0) UE.Amber else UE.Magenta).copy(alpha = 0.28f)); drawPath(path, if (det >= 0) UE.Amber else UE.Magenta, style = Stroke(1.4f * dp))
                    val tr = m[0] + m[3]; val dt = m[0] * m[3] - m[1] * m[2]; val disc = tr * tr - 4 * dt
                    if (disc >= 0 && t > 0.98f) {
                        for (sign in listOf(1f, -1f)) {
                            val lam = (tr + sign * sqrt(disc)) / 2
                            var vx = m[1]; var vy = lam - m[0]
                            if (abs(vx) + abs(vy) < 1e-5f) { vx = lam - m[3]; vy = m[2] }
                            if (abs(vx) + abs(vy) < 1e-5f) continue
                            val l = hypot(vx, vy); vx /= l; vy /= l
                            drawLine(UE.Green.copy(alpha = 0.8f), Offset(c.x - vx * 20 * u, c.y + vy * 20 * u), Offset(c.x + vx * 20 * u, c.y - vy * 20 * u), 1.3f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8 * dp, 5 * dp)))
                            label(tm, "λ = ${fix(lam, 3)}", c.x + vx * 3.3f * u + 6 * dp, c.y - vy * 3.3f * u, UE.Green, 10f)
                            if (disc < 1e-6f) break
                        }
                    }
                    arrow(c, P(1f, 0f), UE.Cyan, 3f * dp, 13 * dp); arrow(c, P(0f, 1f), UE.Violet, 3f * dp, 13 * dp)
                    val li = P(1f, 0f); val lj = P(0f, 1f)
                    drawCircle(UE.Cyan.copy(alpha = 0.25f), 13 * dp, li); drawCircle(UE.Violet.copy(alpha = 0.25f), 13 * dp, lj)
                    label(tm, "î", li.x + 10 * dp, li.y + 8 * dp, UE.Cyan, 14f, 0f, 0f, UE.Math); label(tm, "ĵ", lj.x + 10 * dp, lj.y - 6 * dp, UE.Violet, 14f, 0f, 1f, UE.Math)
                }
                else -> {
                    val u = min(w, h) / 6.4f; val c = Offset(w / 2, h / 2)
                    val out = DoubleArray(2)
                    drawLine(Color.White.copy(alpha = 0.12f), Offset(0f, c.y), Offset(w, c.y), 1f); drawLine(Color.White.copy(alpha = 0.12f), Offset(c.x, 0f), Offset(c.x, h), 1f)
                    drawCircle(Color.White.copy(alpha = 0.1f), u, c, style = Stroke(1f))
                    val lines = 16; val seg = 90
                    for (dir in 0..1) for (li in 0..lines) {
                        val fixed = -2.0 + 4.0 * li / lines
                        path.rewind()
                        var pen = false
                        var lx = 0f; var ly = 0f
                        for (q in 0..seg) {
                            val v = -2.0 + 4.0 * q / seg
                            val x = if (dir == 0) v else fixed; val y = if (dir == 0) fixed else v
                            cmap(ci, x, y, out)
                            val px2 = (c.x + (x + s * (out[0] - x)) * u).toFloat(); val py2 = (c.y - (y + s * (out[1] - y)) * u).toFloat()
                            val ok = px2.isFinite() && py2.isFinite() && abs(px2 - c.x) < w * 3 && abs(py2 - c.y) < h * 3
                            if (ok && pen && hypot(px2 - lx, py2 - ly) < w * 0.6f) path.lineTo(px2, py2) else if (ok) path.moveTo(px2, py2)
                            pen = ok; lx = px2; ly = py2
                        }
                        drawPath(path, (if (dir == 0) UE.Cyan else UE.Violet).copy(alpha = if (li == lines / 2) 0.95f else 0.5f), style = Stroke((if (li == lines / 2) 1.8f else 1.1f) * dp))
                    }
                    label(tm, "Re", w - 8 * dp, c.y - 4 * dp, UE.Dim, 10f, 1f, 1f); label(tm, "Im", c.x + 5 * dp, 6 * dp, UE.Dim, 10f)
                }
            }
        }
    }) {
        Segmented(listOf("Graph", "Matrix", "Complex map"), mode) { mode = it }
        when (mode) {
            0 -> {
                ChipRow(BASES.map { it.name }, bi) { bi = it }
                UESlider("a — vertical stretch", a, -3f..3f, format = { fix(it, 2) }) { a = (it * 20).roundToInt() / 20f }
                UESlider("b — horizontal compression", b, -3f..3f, format = { fix(it, 2) }) { b = ((it * 20).roundToInt() / 20f).let { v -> if (abs(v) < 0.05f) 0.05f else v } }
                UESlider("h — shift right", hh, -5f..5f, accent = UE.Amber, format = { fix(it, 2) }) { hh = (it * 10).roundToInt() / 10f }
                UESlider("k — shift up", k, -5f..5f, accent = UE.Amber, format = { fix(it, 2) }) { k = (it * 10).roundToInt() / 10f }
                val inner = (if (b == 1f) "" else fix(b, 2)) + (if (hh == 0f) "x" else if (b == 1f) "x ${if (hh > 0) "-" else "+"} ${fix(abs(hh), 1)}" else "(x ${if (hh > 0) "-" else "+"} ${fix(abs(hh), 1)})")
                MathText("y = ${if (a == 1f) "" else fix(a, 2)}${BASES[bi].tex(inner)}${if (k == 0f) "" else (if (k > 0) " + " else " - ") + fix(abs(k), 1)}", size = 19.sp)
                Note(buildString {
                    append(if (abs(a) > 1) "Stretched vertically ×${fix(abs(a), 2)}. " else if (abs(a) < 1) "Flattened vertically ×${fix(abs(a), 2)}. " else "")
                    if (a < 0) append("Flipped upside down. ")
                    append(if (abs(b) > 1) "Squeezed horizontally by ${fix(abs(b), 2)}. " else if (abs(b) < 1) "Widened horizontally by ${fix(1 / abs(b), 2)}. " else "")
                    if (b < 0) append("Mirrored left–right. ")
                    if (hh != 0f) append("Moved ${fix(abs(hh), 1)} ${if (hh > 0) "right" else "left"}. ")
                    if (k != 0f) append("Moved ${fix(abs(k), 1)} ${if (k > 0) "up" else "down"}. ")
                    if (isEmpty()) append("Dashed: the original. Move a slider and the curve responds.")
                })
            }
            1 -> {
                ChipRow(MATRICES.map { it.first }, MATRICES.indexOfFirst { it.second.contentEquals(m) }) { i -> m = MATRICES[i].second.copyOf(); scope.launch { morph.snapTo(0f); morph.animateTo(1f, tween(1100, easing = FastOutSlowInEasing)) } }
                val det = m[0] * m[3] - m[1] * m[2]; val tr = m[0] + m[3]; val disc = tr * tr - 4 * det
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    T("A = ", size = 16.sp, font = UE.Math)
                    T("⎡ ${fix(m[0], 2).padStart(5)}  ${fix(m[1], 2).padStart(5)} ⎤\n⎣ ${fix(m[2], 2).padStart(5)}  ${fix(m[3], 2).padStart(5)} ⎦", size = 14.sp, font = UE.Mono, lineHeight = 19.sp)
                    Spacer(Modifier.width(16.dp))
                    GlowButton("Replay") { scope.launch { morph.snapTo(0f); morph.animateTo(1f, tween(1300, easing = FastOutSlowInEasing)) } }
                }
                ReadoutRow {
                    Stat("det (area ×)", fix(det, 3), if (det >= 0) UE.Amber else UE.Magenta); Stat("trace", fix(tr, 3))
                    Stat("eigenvalues", if (disc >= 0) "${fix((tr + sqrt(disc)) / 2, 3)}, ${fix((tr - sqrt(disc)) / 2, 3)}" else "${fix(tr / 2, 2)} ± ${fix(sqrt(-disc) / 2, 2)}i", UE.Green)
                }
                Note(when { abs(det) < 1e-4f -> "Determinant zero: the plane collapses onto a line. Information is destroyed — this matrix has no inverse."
                    det < 0 -> "Negative determinant: the plane has been flipped over (orientation reversed), like looking at it in a mirror."
                    disc < 0 -> "No real eigenvectors: every direction gets turned. Complex eigenvalues mean rotation."
                    else -> "Drag the tips of î and ĵ. The green dashed lines are eigenvectors — directions that are only scaled, by λ." })
            }
            else -> {
                ChipRow(CMAPS, ci) { ci = it }
                UESlider("Morph  z → f(z)", s, 0f..1f, format = { "${(it * 100).roundToInt()} %" }) { s = it }
                MathText(when (ci) { 0 -> "w = z^2 = (x^2 - y^2) + 2xy\\,i"; 1 -> "w = z^3"; 2 -> "w = \\frac{1}{z} = \\frac{\\bar{z}}{|z|^2}"; 3 -> "w = e^z = e^x(\\cos y + i\\sin y)"; 4 -> "w = \\sin z = \\sin x\\cosh y + i\\cos x\\sinh y"; else -> "w = \\frac{z-1}{z+1}" }, size = 17.sp)
                Note(when (ci) { 0 -> "Squaring doubles every angle from the origin and squares every distance. The grid lines become two families of parabolas that still cross at right angles."
                    2 -> "Inversion: inside and outside of the unit circle swap, and straight lines turn into circles through the origin."
                    3 -> "Vertical lines wrap into circles and horizontal lines fan out as rays: the exponential turns addition into rotation and scaling."
                    5 -> "A Möbius transformation: it sends circles and lines to circles and lines, and carries the right half-plane onto the unit disc."
                    else -> "Cyan curves were horizontal lines, violet were vertical. They bend — but everywhere they still meet at 90°." })
            }
        }
    }
}
