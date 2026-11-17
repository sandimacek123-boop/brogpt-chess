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
import dev.universe.engine.core.ui.*
import kotlin.math.*

private val TrigInfo = LabInfo(
    equations = listOf(
        "(\\cos\\theta, \\sin\\theta) \\text{ is the point at angle } \\theta \\text{ on the unit circle}",
        "\\sin^2\\theta + \\cos^2\\theta = 1, \\qquad \\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}",
        "\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R, \\qquad c^2 = a^2 + b^2 - 2ab\\cos C",
        "\\vec{OH} = 3\\,\\vec{OG}",
    ),
    about = "Sine and cosine are simply the height and the width of a point travelling round a circle of radius one; unroll that motion in time and you get waves. In any triangle the three medians meet at the centroid G, the perpendicular bisectors at the circumcentre O and the altitudes at the orthocentre H — and, remarkably, O, G and H always lie on one straight line, the Euler line, with G exactly one third of the way from O to H. Two perpendicular oscillations draw Lissajous figures; a rotating radius draws roses.",
    notes = listOf(
        "Exact values are shown for multiples of 15°; other angles are decimal approximations.",
        "Triangle lengths are in arbitrary units (100 screen-independent pixels = 1 unit). Angles do not depend on the unit.",
        "A Lissajous figure closes only when the frequency ratio is rational; these use whole-number ratios.",
    ),
)

private val SIN15 = listOf("0", "\\frac{\\sqrt{6}-\\sqrt{2}}{4}", "\\frac{1}{2}", "\\frac{\\sqrt{2}}{2}", "\\frac{\\sqrt{3}}{2}", "\\frac{\\sqrt{6}+\\sqrt{2}}{4}", "1")
private val TAN15 = listOf("0", "2-\\sqrt{3}", "\\frac{\\sqrt{3}}{3}", "1", "\\sqrt{3}", "2+\\sqrt{3}", "\\infty")

/** Exact value of sin for an angle that is k × 15°. */
private fun exactSin(k0: Int): String {
    val k = ((k0 % 24) + 24) % 24
    val ref = when { k <= 6 -> k; k <= 12 -> 12 - k; k <= 18 -> k - 12; else -> 24 - k }
    val v = SIN15[ref]
    return if (k > 12 && v != "0") "-$v" else v
}
private fun exactTan(k0: Int): String {
    val k = ((k0 % 12) + 12) % 12
    val ref = if (k <= 6) k else 12 - k
    val v = TAN15[ref]
    return if (k > 6 && v != "0") "-$v" else if (ref == 6) "\\text{undefined}" else v
}

@Composable
fun TrigLab() {
    var mode by remember { mutableIntStateOf(0) }
    var theta by remember { mutableFloatStateOf(PI.toFloat() / 6) }
    var snap by remember { mutableStateOf(true) }
    var verts by remember { mutableStateOf(listOf(Offset(0.2f, 0.78f), Offset(0.84f, 0.7f), Offset(0.42f, 0.2f))) }
    var grab by remember { mutableIntStateOf(-1) }
    var showCircum by remember { mutableStateOf(true) }
    var showIn by remember { mutableStateOf(false) }
    var showEuler by remember { mutableStateOf(true) }
    var showNine by remember { mutableStateOf(false) }
    var curve by remember { mutableIntStateOf(0) }
    var fa by remember { mutableIntStateOf(3) }
    var fb by remember { mutableIntStateOf(2) }
    var phase by remember { mutableFloatStateOf(0.5f) }
    var spin by remember { mutableStateOf(true) }
    var cs by remember { mutableStateOf(Size(1f, 1f)) }
    val time by rememberTime(mode == 2)
    val tm = rememberTextMeasurer(cacheSize = 64)
    val path = remember { Path() }
    val grabPx = with(androidx.compose.ui.platform.LocalDensity.current) { 44.dp.toPx() }

    fun circleGeom(sz: Size): Triple<Offset, Float, Float> { val r = min(sz.width * 0.34f, sz.height * 0.25f); return Triple(Offset(sz.width / 2, sz.height * 0.36f), r, sz.height * 0.82f) }

    LabScaffold("Geometry and Trigonometry", Domain.Math, TrigInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(null, key = mode, onSingle = { o, ph ->
                when (mode) {
                    0 -> {
                        val (c, _, _) = circleGeom(cs)
                        if (ph < 2 && o.y < cs.height * 0.68f) {
                            var a = atan2(-(o.y - c.y), o.x - c.x); if (a < 0) a += 2 * PI.toFloat()
                            theta = if (snap) (a / (PI.toFloat() / 12)).roundToInt() * (PI.toFloat() / 12) else a
                        }
                        true
                    }
                    1 -> {
                        if (ph == 0) { grab = verts.indices.minByOrNull { (Offset(verts[it].x * cs.width, verts[it].y * cs.height) - o).getDistance() } ?: -1
                            if (grab >= 0 && (Offset(verts[grab].x * cs.width, verts[grab].y * cs.height) - o).getDistance() > grabPx) grab = -1 }
                        if (ph == 1 && grab >= 0) verts = verts.toMutableList().also { it[grab] = Offset((o.x / cs.width).coerceIn(0.04f, 0.96f), (o.y / cs.height).coerceIn(0.04f, 0.96f)) }
                        grab >= 0
                    }
                    else -> false
                }
            }),
        ) {
            cs = size
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val (c, r, waveY) = circleGeom(size)
                    val ct = cos(theta); val st = sin(theta)
                    val p = c + Offset(ct * r, -st * r)
                    drawLine(Color.White.copy(alpha = 0.2f), Offset(c.x - r * 1.35f, c.y), Offset(c.x + r * 1.35f, c.y), 1f)
                    drawLine(Color.White.copy(alpha = 0.2f), Offset(c.x, c.y - r * 1.3f), Offset(c.x, c.y + r * 1.3f), 1f)
                    drawCircle(UE.Text.copy(alpha = 0.55f), r, c, style = Stroke(1.4f * dp))
                    for (k in 0 until 24) { val a = k * PI.toFloat() / 12; drawLine(Color.White.copy(alpha = if (k % 2 == 0) 0.4f else 0.2f), c + Offset(cos(a) * r * 0.96f, -sin(a) * r * 0.96f), c + Offset(cos(a) * r * 1.04f, -sin(a) * r * 1.04f), 1f) }
                    drawArc(UE.Amber.copy(alpha = 0.25f), 0f, -theta * 180f / PI.toFloat(), true, Offset(c.x - r * 0.22f, c.y - r * 0.22f), Size(r * 0.44f, r * 0.44f))
                    label(tm, "θ", c.x + cos(theta / 2) * r * 0.32f, c.y - sin(theta / 2) * r * 0.32f, UE.Amber, 13f, 0.5f, 0.5f, UE.Math)
                    // tangent segment on the line x = 1
                    if (abs(ct) > 0.03f) {
                        val tEnd = Offset(c.x + r, (c.y - st / ct * r).coerceIn(-h, 2 * h))
                        drawLine(UE.Amber.copy(alpha = 0.3f), c, tEnd, dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 4 * dp)))
                        glowLine(Offset(c.x + r, c.y), tEnd, UE.Amber, 2f * dp, 2.4f)
                    }
                    glowLine(c, Offset(p.x, c.y), UE.Violet, 2.6f * dp); glowLine(Offset(p.x, c.y), p, UE.Cyan, 2.6f * dp)
                    drawLine(UE.Text, c, p, 1.6f * dp)
                    label(tm, "cos θ", (c.x + p.x) / 2, c.y + (if (st >= 0) 5 else -5) * dp, UE.Violet, 10.5f, 0.5f, if (st >= 0) 0f else 1f)
                    label(tm, "sin θ", p.x + (if (ct >= 0) 6 else -6) * dp, (c.y + p.y) / 2, UE.Cyan, 10.5f, if (ct >= 0) 0f else 1f, 0.5f)
                    glowDot(p, UE.Text, 5.5f * dp)
                    // unrolled waves
                    val wl = 28 * dp; val wr = w - 16 * dp; val amp = h * 0.11f
                    drawLine(Color.White.copy(alpha = 0.2f), Offset(wl, waveY), Offset(wr, waveY), 1f)
                    for ((k, lab) in listOf("0", "π/2", "π", "3π/2", "2π").withIndex()) { val x = wl + (wr - wl) * k / 4f; drawLine(Color.White.copy(alpha = 0.15f), Offset(x, waveY - amp), Offset(x, waveY + amp), 1f); label(tm, lab, x, waveY + amp + 3 * dp, UE.Dim, 9f, 0.5f, 0f) }
                    path.rewind(); for (i in 0..120) { val a = i / 120f * 2 * PI.toFloat(); val x = wl + (wr - wl) * i / 120f; val y = waveY - cos(a) * amp; if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
                    drawPath(path, UE.Violet, style = Stroke(1.8f * dp))
                    path.rewind(); for (i in 0..120) { val a = i / 120f * 2 * PI.toFloat(); val x = wl + (wr - wl) * i / 120f; val y = waveY - sin(a) * amp; if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
                    glowPath(path, UE.Cyan, 1.8f * dp)
                    val mx = wl + (wr - wl) * theta / (2 * PI.toFloat())
                    drawLine(UE.Text.copy(alpha = 0.5f), Offset(mx, waveY - amp), Offset(mx, waveY + amp), dp)
                    glowDot(Offset(mx, waveY - st * amp), UE.Cyan, 4 * dp); glowDot(Offset(mx, waveY - ct * amp), UE.Violet, 4 * dp)
                }
                1 -> {
                    val A = Offset(verts[0].x * w, verts[0].y * h); val B = Offset(verts[1].x * w, verts[1].y * h); val C = Offset(verts[2].x * w, verts[2].y * h)
                    val a = (B - C).getDistance(); val b = (A - C).getDistance(); val c = (A - B).getDistance()
                    val d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y))
                    path.rewind(); path.moveTo(A.x, A.y); path.lineTo(B.x, B.y); path.lineTo(C.x, C.y); path.close()
                    drawPath(path, UE.Cyan.copy(alpha = 0.07f)); glowPath(path, UE.Cyan, 2f * dp)
                    if (abs(d) > 1f) {
                        val a2 = A.x * A.x + A.y * A.y; val b2 = B.x * B.x + B.y * B.y; val c2 = C.x * C.x + C.y * C.y
                        val O = Offset((a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d, (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d)
                        val G = (A + B + C) / 3f
                        val H = A + B + C - O * 2f
                        val R = (O - A).getDistance()
                        val I = (A * a + B * b + C * c) / (a + b + c)
                        val area = abs(d) / 4
                        if (showCircum) { drawCircle(UE.Violet.copy(alpha = 0.7f), R, O, style = Stroke(1.2f * dp)) }
                        if (showIn) { drawCircle(UE.Green.copy(alpha = 0.8f), area / ((a + b + c) / 2), I, style = Stroke(1.2f * dp)); glowDot(I, UE.Green, 3.5f * dp); label(tm, "I", I.x + 6 * dp, I.y - 6 * dp, UE.Green, 11f, 0f, 1f, UE.Math) }
                        if (showNine) { drawCircle(UE.Magenta.copy(alpha = 0.7f), R / 2, (O + H) / 2f, style = Stroke(1.2f * dp)) }
                        if (showEuler) {
                            for ((P, Q) in listOf(A to (B + C) / 2f, B to (A + C) / 2f, C to (A + B) / 2f)) drawLine(Color.White.copy(alpha = 0.16f), P, Q, 1f)
                            val dir = H - O
                            if (dir.getDistance() > 2f) { val u = dir / dir.getDistance(); drawLine(UE.Amber, O - u * (w + h), O + u * (w + h), 1.4f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8 * dp, 5 * dp))) }
                            glowDot(O, UE.Violet, 4 * dp); glowDot(G, UE.Text, 4 * dp); glowDot(H, UE.Amber, 4 * dp)
                            label(tm, "O", O.x + 7 * dp, O.y + 5 * dp, UE.Violet, 12f, 0f, 0f, UE.Math); label(tm, "G", G.x + 7 * dp, G.y + 5 * dp, UE.Text, 12f, 0f, 0f, UE.Math); label(tm, "H", H.x + 7 * dp, H.y + 5 * dp, UE.Amber, 12f, 0f, 0f, UE.Math)
                        }
                    }
                    val G = (A + B + C) / 3f
                    for ((P, name) in listOf(A to "A", B to "B", C to "C")) {
                        glowDot(P, UE.Cyan, 7 * dp)
                        val out = P - G; val u = if (out.getDistance() > 1f) out / out.getDistance() else Offset(0f, -1f)
                        label(tm, name, P.x + u.x * 18 * dp, P.y + u.y * 18 * dp, UE.Text, 14f, 0.5f, 0.5f, UE.Math)
                    }
                }
                else -> {
                    val c = Offset(w / 2, h / 2); val r = min(w, h) * 0.42f
                    drawRect(Color.White.copy(alpha = 0.05f), Offset(c.x - r, c.y - r), Size(2 * r, 2 * r), style = Stroke(1f))
                    val ph = if (spin) time * 0.5f else phase * PI.toFloat()
                    path.rewind()
                    val n = 1400
                    fun pt(t: Float): Offset = when (curve) {
                        0 -> c + Offset(sin(fa * t + ph) * r, -sin(fb * t) * r)
                        1 -> { val k = fa.toFloat() / fb; val rr = cos(k * t + ph * 0f) * r; c + Offset(cos(t + ph * 0.3f) * rr, -sin(t + ph * 0.3f) * rr) }
                        else -> { val R = 1f; val rs = fb.toFloat() / (fa + fb + 1); val dd = rs * (0.6f + 0.8f * (0.5f + 0.5f * sin(ph))); val q = (R - rs) / rs
                            c + Offset(((R - rs) * cos(t) + dd * cos(q * t)) * r * 0.82f, -((R - rs) * sin(t) - dd * sin(q * t)) * r * 0.82f) }
                    }
                    val span = when (curve) { 0 -> 2 * PI.toFloat(); 1 -> 2 * PI.toFloat() * fb; else -> 2 * PI.toFloat() * fb }
                    for (i in 0..n) { val p = pt(span * i / n); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
                    glowPath(path, if (curve == 1) UE.Magenta else UE.Cyan, 1.8f * dp)
                    glowDot(pt((time * 0.9f) % span), UE.Text, 4.5f * dp)
                }
            }
        }
    }) {
        Segmented(listOf("Unit circle", "Triangle", "Curves"), mode) { mode = it }
        when (mode) {
            0 -> {
                val deg = theta * 180 / PI
                val k = (deg / 15).roundToInt()
                val exact = abs(deg - k * 15) < 0.01
                UESlider("Angle θ", deg.toFloat(), 0f..360f, accent = UE.Amber, format = { "${fix(it, 1)}°  =  ${fix(it / 180f, 4)}π rad" }) { v -> theta = (if (snap) (v / 15f).roundToInt() * 15f else v) * PI.toFloat() / 180f }
                Toggle("Snap to 15° steps (exact values)", snap) { snap = it }
                if (exact) MathText("\\sin\\theta = ${exactSin(k)} \\qquad \\cos\\theta = ${exactSin(k + 6)} \\qquad \\tan\\theta = ${exactTan(k)}", size = 16.sp)
                ReadoutRow {
                    Stat("sin θ", fix(sin(theta), 5), UE.Cyan); Stat("cos θ", fix(cos(theta), 5), UE.Violet)
                    Stat("tan θ", if (abs(cos(theta)) < 1e-4) "∞" else fmt(tan(theta), 5), UE.Amber); Stat("sin² + cos²", fix(sin(theta) * sin(theta) + cos(theta) * cos(theta), 5))
                }
                Note("Drag the point round the circle. Its height is the sine and its width the cosine; the amber segment on the tangent line is, fittingly, the tangent.")
            }
            1 -> {
                val w = cs.width; val h = cs.height
                val A = Offset(verts[0].x * w, verts[0].y * h); val B = Offset(verts[1].x * w, verts[1].y * h); val C = Offset(verts[2].x * w, verts[2].y * h)
                val u = with(androidx.compose.ui.platform.LocalDensity.current) { 100.dp.toPx() }
                val a = (B - C).getDistance() / u; val b = (A - C).getDistance() / u; val c = (A - B).getDistance() / u
                val angA = acos(((b * b + c * c - a * a) / (2 * b * c)).coerceIn(-1f, 1f)); val angB = acos(((a * a + c * c - b * b) / (2 * a * c)).coerceIn(-1f, 1f)); val angC = PI.toFloat() - angA - angB
                val s = (a + b + c) / 2; val area = sqrt(max(0f, s * (s - a) * (s - b) * (s - c)))
                ReadoutRow { Stat("a", fix(a, 3)); Stat("b", fix(b, 3)); Stat("c", fix(c, 3)); Stat("area", fix(area, 3), UE.Cyan) }
                ReadoutRow {
                    Stat("∠A", fix(angA * 180 / PI, 1) + "°"); Stat("∠B", fix(angB * 180 / PI, 1) + "°"); Stat("∠C", fix(angC * 180 / PI, 1) + "°")
                    Stat("a / sin A = 2R", fix(a / sin(angA), 3), UE.Violet)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { Toggle("Circumcircle", showCircum, accent = UE.Violet) { showCircum = it }; Toggle("Incircle", showIn, accent = UE.Green) { showIn = it } }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { Toggle("Euler line", showEuler, accent = UE.Amber) { showEuler = it }; Toggle("Nine-point circle", showNine, accent = UE.Magenta) { showNine = it } }
                Note("Drag the corners. However you deform the triangle, O, G and H stay on one line, the angles sum to 180°, and a/sin A equals the circumscribed diameter.")
            }
            else -> {
                ChipRow(listOf("Lissajous", "Rose", "Spirograph"), curve) { curve = it }
                IntSlider(if (curve == 0) "Horizontal frequency a" else "n", fa, 1..9) { fa = it }
                IntSlider(if (curve == 0) "Vertical frequency b" else "d", fb, 1..9) { fb = it }
                Toggle("Animate phase", spin) { spin = it }
                if (!spin) UESlider("Phase δ", phase, 0f..2f, format = { "${fix(it, 2)}π" }) { phase = it }
                MathText(when (curve) { 0 -> "x = \\sin(${fa}t + \\delta), \\quad y = \\sin(${fb}t)"; 1 -> "r = \\cos\\left(\\frac{$fa}{$fb}\\theta\\right)"; else -> "x = (R-r)\\cos t + d\\cos\\frac{R-r}{r}t" }, size = 17.sp)
                Note(when (curve) { 0 -> "Two perpendicular vibrations. Oscilloscopes used these figures to compare frequencies: the ratio a : b is the number of lobes along each side."; 1 -> "With k = n/d in lowest terms the rose has n petals if both are odd, otherwise 2n."; else -> "A small wheel rolling inside a large one, with a pen off-centre — the hypotrochoid of the drawing toy." })
            }
        }
    }
}
