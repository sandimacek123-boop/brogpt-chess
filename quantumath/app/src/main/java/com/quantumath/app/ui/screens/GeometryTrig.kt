package com.quantumath.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.data.Kind
import com.quantumath.app.data.Note
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.computation
import com.quantumath.math.expr.Parser
import com.quantumath.math.geometry.*
import com.quantumath.math.plot.Viewport
import com.quantumath.math.symbolic.Algebra
import com.quantumath.math.symbolic.LimitSolver
import kotlin.math.*

private fun f4(v: Double) = LimitSolver.fmt(java.math.BigDecimal(v).round(java.math.MathContext(8)).toDouble())

// =============================== Geometry ===============================

class GeometryViewModel(private val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var mode by mutableStateOf("Triangle")
    var points by mutableStateOf(listOf(Pt(-3.0, -2.0), Pt(3.0, -2.0), Pt(0.5, 3.0)))
    var snap by mutableStateOf(true)
    var showCircles by mutableStateOf(false)
    var shape by mutableStateOf("Circle")
    var d1 by mutableStateOf("3"); var d2 by mutableStateOf("4"); var d3 by mutableStateOf("5")
    var ax by mutableStateOf("1"); var ay by mutableStateOf("2"); var bx by mutableStateOf("4"); var by by mutableStateOf("6")

    fun chooseMode(m: String) {
        mode = m
        points = when (m) {
            "Triangle" -> listOf(Pt(-3.0, -2.0), Pt(3.0, -2.0), Pt(0.5, 3.0))
            "Quadrilateral" -> listOf(Pt(-3.0, -2.0), Pt(3.0, -2.0), Pt(2.0, 2.5), Pt(-2.0, 2.0))
            "Circle" -> listOf(Pt(0.0, 0.0), Pt(3.0, 0.0))
            else -> listOf(Pt(-3.0, -2.0), Pt(2.0, -3.0), Pt(4.0, 1.0), Pt(0.0, 4.0), Pt(-4.0, 2.0))
        }
    }

    fun move(i: Int, p: Pt) { points = points.toMutableList().also { it[i] = if (snap) Pt((p.x * 2).roundToInt() / 2.0, (p.y * 2).roundToInt() / 2.0) else p } }
    fun addPoint(p: Pt) { if (mode == "Polygon" && points.size < 12) points = points + (if (snap) Pt((p.x * 2).roundToInt() / 2.0, (p.y * 2).roundToInt() / 2.0) else p) }
    fun removeLast() { if (mode == "Polygon" && points.size > 3) points = points.dropLast(1) }

    val shapeOut = computation<List<Measure>>()
    fun computeShape() {
        val s = shape
        shapeOut.run {
            fun v(t: String) = parseBound(t)
            when (s) {
                "Circle" -> Shapes.circle(v(d1)); "Rectangle" -> Shapes.rectangle(v(d1), v(d2))
                "Regular polygon" -> Shapes.regularPolygon(v(d1).roundToInt(), v(d2)); "Triangle (3 sides)" -> TriangleSolver.solve(v(d1), v(d2), v(d3), null, null, null).first().let { t ->
                    listOf(Measure("Area", t.area, "Heron / ½ab·sin C"), Measure("Perimeter", t.perimeter, "P = a + b + c"), Measure("Angle A (°)", t.angleA, "law of cosines"), Measure("Angle B (°)", t.angleB, "law of cosines"), Measure("Angle C (°)", t.angleC, "A + B + C = 180°"), Measure("Circumradius", t.circumradius, "R = a / (2 sin A)"), Measure("Inradius", t.inradius, "r = Area / s"))
                }
                "Box (prism)" -> Shapes.prism(v(d1), v(d2), v(d3)); "Cylinder" -> Shapes.cylinder(v(d1), v(d2)); "Cone" -> Shapes.cone(v(d1), v(d2))
                else -> Shapes.sphere(v(d1))
            }
        }
    }

    fun save(text: String) = c.saveNote(Note(title = "Geometry: $mode", kind = Kind.GEOMETRY, input = points.joinToString { "(${f4(it.x)}, ${f4(it.y)})" }, result = text))
}

@Composable
fun GeometryScreen(nav: NavHostController) {
    val vm = appViewModel { GeometryViewModel(it) }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Geometry workshop", onBack = { nav.popBackStack() })
        PrimaryTabRow(selectedTabIndex = vm.tab, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Construct", "Shapes & solids", "Coordinates").forEachIndexed { i, t -> Tab(vm.tab == i, { vm.tab = i }, text = { Text(t, maxLines = 1) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            when (vm.tab) {
                0 -> ConstructTab(vm)
                1 -> ShapesTab(vm)
                else -> CoordinatesTab(vm)
            }
        }
    }
}

@Composable
private fun ConstructTab(vm: GeometryViewModel) {
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    ChipRow(listOf("Triangle", "Quadrilateral", "Polygon", "Circle"), vm.mode, vm::chooseMode, { it })
    val vp = Viewport(-6.0, 6.0, -6.0, 6.0)
    val pts = vm.points
    var dragging by remember { mutableStateOf(-1) }
    Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp))) {
        Canvas(Modifier.fillMaxSize()
            .pointerInput(vm.mode) {
                detectDragGestures(onDragStart = { o ->
                    val m = Mapper(vp, size.width.toFloat(), size.height.toFloat())
                    dragging = vm.points.indices.minByOrNull { i -> hypot(m.sx(vm.points[i].x) - o.x, m.sy(vm.points[i].y) - o.y) }?.takeIf { i -> hypot(m.sx(vm.points[i].x) - o.x, m.sy(vm.points[i].y) - o.y) < 80 } ?: -1
                }, onDragEnd = { dragging = -1 }, onDragCancel = { dragging = -1 }) { change, _ ->
                    if (dragging >= 0) {
                        val m = Mapper(vp, size.width.toFloat(), size.height.toFloat())
                        vm.move(dragging, Pt(m.wx(change.position.x).coerceIn(-6.0, 6.0), m.wy(change.position.y).coerceIn(-6.0, 6.0)))
                        change.consume()
                    }
                }
            }
            .pointerInput(vm.mode) { detectTapGestures(onTap = { o -> val m = Mapper(vp, size.width.toFloat(), size.height.toFloat()); vm.addPoint(Pt(m.wx(o.x), m.wy(o.y))) }, onLongPress = { vm.removeLast() }) }
            .semantics { contentDescription = "Geometry canvas. Drag the points to reshape the ${vm.mode.lowercase()}." }
        ) {
            drawRect(if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFCFCFF))
            val m = Mapper(vp, size.width, size.height)
            drawGrid(m, lab, tm)
            val st = TextStyle(fontSize = 11.sp, fontFamily = MonoFamily, color = lab.axis)
            if (vm.mode == "Circle") {
                val r = pts[0].dist(pts[1])
                val pr = (r / vp.width * size.width).toFloat()
                drawCircle(lab.accent.copy(alpha = 0.15f), pr, Offset(m.sx(pts[0].x), m.sy(pts[0].y)))
                drawCircle(lab.accent, pr, Offset(m.sx(pts[0].x), m.sy(pts[0].y)), style = Stroke(3f))
                drawLine(lab.accent2, Offset(m.sx(pts[0].x), m.sy(pts[0].y)), Offset(m.sx(pts[1].x), m.sy(pts[1].y)), 2.5f)
                drawTextSafe(tm, "r = ${f4(r)}", Offset((m.sx(pts[0].x) + m.sx(pts[1].x)) / 2, (m.sy(pts[0].y) + m.sy(pts[1].y)) / 2 - 18), st)
            } else {
                val path = Path()
                pts.forEachIndexed { i, p -> if (i == 0) path.moveTo(m.sx(p.x), m.sy(p.y)) else path.lineTo(m.sx(p.x), m.sy(p.y)) }
                path.close()
                drawPath(path, lab.accent.copy(alpha = 0.15f)); drawPath(path, lab.accent, style = Stroke(3f))
                for (i in pts.indices) {
                    val a = pts[i]; val b = pts[(i + 1) % pts.size]
                    drawTextSafe(tm, f4(a.dist(b)), Offset((m.sx(a.x) + m.sx(b.x)) / 2 + 4, (m.sy(a.y) + m.sy(b.y)) / 2 - 16), st)
                    val prev = pts[(i - 1 + pts.size) % pts.size]
                    val ang = Coordinate.angleDeg(prev, a, b)
                    drawTextSafe(tm, "${f4(ang)}°", Offset(m.sx(a.x) + 8, m.sy(a.y) + 6), st.copy(color = lab.accent2))
                }
                if (vm.mode == "Triangle" && vm.showCircles) runCatching {
                    val (cc, rr) = circumcircle(pts[0], pts[1], pts[2])
                    drawCircle(lab.warning.copy(alpha = 0.8f), (rr / vp.width * size.width).toFloat(), Offset(m.sx(cc.x), m.sy(cc.y)), style = Stroke(2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))))
                    val (ic, ir) = incircle(pts[0], pts[1], pts[2])
                    drawCircle(lab.success.copy(alpha = 0.8f), (ir / vp.width * size.width).toFloat(), Offset(m.sx(ic.x), m.sy(ic.y)), style = Stroke(2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))))
                }
            }
            pts.forEachIndexed { i, p ->
                val o = Offset(m.sx(p.x), m.sy(p.y))
                drawCircle((if (i == dragging) lab.warning else lab.accent2).copy(alpha = 0.3f), 22f, o)
                drawCircle(if (i == dragging) lab.warning else lab.accent2, 10f, o)
                drawTextSafe(tm, ('A' + i).toString(), o + Offset(-24f, -30f), st.copy(color = MaterialTheme_onSurface(lab)))
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.weight(1f)) { SwitchRow("Snap to ½ grid", vm.snap, { vm.snap = it }) }
        if (vm.mode == "Triangle") Row(Modifier.weight(1f)) { SwitchRow("Circum/incircle", vm.showCircles, { vm.showCircles = it }) }
    }
    if (vm.mode == "Polygon") InfoPanel("Tap empty space to add a vertex (up to 12); long-press to remove the last one. Vertices are joined in order.")
    val text = remember(pts, vm.mode) { measurements(vm.mode, pts) }
    Panel(title = "Measurements", icon = Icons.Outlined.Straighten, trailing = { IconButton(onClick = { vm.save(text.joinToString("\n") { "${it.first}: ${it.second}" }) }) { Icon(Icons.Outlined.BookmarkAdd, "Save to notebook") } }) {
        for ((k, v) in text) KeyValue(k, v)
    }
}

private fun MaterialTheme_onSurface(lab: com.quantumath.app.ui.theme.LabColors) = if (lab.dark) Color(0xFFECEAF6) else Color(0xFF14131C)

private fun circumcircle(a: Pt, b: Pt, c: Pt): Pair<Pt, Double> {
    val d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    require(abs(d) > 1e-12)
    val ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d
    val uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d
    val o = Pt(ux, uy); return o to o.dist(a)
}

private fun incircle(a: Pt, b: Pt, c: Pt): Pair<Pt, Double> {
    val la = b.dist(c); val lb = a.dist(c); val lc = a.dist(b); val p = la + lb + lc
    val o = Pt((la * a.x + lb * b.x + lc * c.x) / p, (la * a.y + lb * b.y + lc * c.y) / p)
    return o to Coordinate.polygonArea(listOf(a, b, c)) / (p / 2)
}

private fun measurements(mode: String, p: List<Pt>): List<Pair<String, String>> = runCatching {
    if (mode == "Circle") {
        val r = p[0].dist(p[1])
        listOf("Center" to "(${f4(p[0].x)}, ${f4(p[0].y)})", "Radius" to f4(r), "Diameter" to f4(2 * r), "Circumference 2πr" to f4(2 * PI * r), "Area πr²" to f4(PI * r * r),
            "Equation" to "(x − ${f4(p[0].x)})² + (y − ${f4(p[0].y)})² = ${f4(r * r)}")
    } else {
        val out = ArrayList<Pair<String, String>>()
        out += "Vertices" to p.mapIndexed { i, q -> "${'A' + i}(${f4(q.x)}, ${f4(q.y)})" }.joinToString(" ")
        out += "Area (shoelace)" to f4(Coordinate.polygonArea(p))
        out += "Perimeter" to f4(Coordinate.perimeter(p))
        val cx = p.sumOf { it.x } / p.size; val cy = p.sumOf { it.y } / p.size
        out += "Vertex centroid" to "(${f4(cx)}, ${f4(cy)})"
        val angleSum = p.indices.sumOf { i -> Coordinate.angleDeg(p[(i - 1 + p.size) % p.size], p[i], p[(i + 1) % p.size]) }
        out += "Sum of angles" to "${f4(angleSum)}°" + if (abs(angleSum - 180.0 * (p.size - 2)) > 0.01) " (non-convex or self-intersecting)" else ""
        if (mode == "Triangle") {
            val a = p[1].dist(p[2]); val b = p[0].dist(p[2]); val c = p[0].dist(p[1])
            TriangleSolver.solve(a, b, c, null, null, null).firstOrNull()?.let { t ->
                out += "Type" to t.kind; out += "Circumradius R" to f4(t.circumradius); out += "Inradius r" to f4(t.inradius)
            } ?: run { out += "Type" to "degenerate (collinear points)" }
        }
        out
    }
}.getOrElse { listOf("Status" to (it.message ?: "Degenerate shape")) }

@Composable
private fun ShapesTab(vm: GeometryViewModel) {
    val out by vm.shapeOut.state.collectAsStateWithLifecycle()
    val shapes = listOf("Circle", "Rectangle", "Triangle (3 sides)", "Regular polygon", "Box (prism)", "Cylinder", "Cone", "Sphere")
    ChipRow(shapes, vm.shape, { vm.shape = it; vm.shapeOut.clear() }, { it })
    val labels = when (vm.shape) {
        "Circle", "Sphere" -> listOf("Radius r"); "Rectangle" -> listOf("Width", "Height"); "Triangle (3 sides)" -> listOf("a", "b", "c")
        "Regular polygon" -> listOf("Sides n", "Side length s"); "Box (prism)" -> listOf("Width", "Depth", "Height"); else -> listOf("Radius r", "Height h")
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        NumberField(labels[0], vm.d1, { vm.d1 = it }, Modifier.weight(1f))
        if (labels.size > 1) NumberField(labels[1], vm.d2, { vm.d2 = it }, Modifier.weight(1f))
        if (labels.size > 2) NumberField(labels[2], vm.d3, { vm.d3 = it }, Modifier.weight(1f))
    }
    PrimaryButton("Compute", vm::computeShape, Modifier.fillMaxWidth())
    OutcomeView(out) { ms ->
        Panel(title = vm.shape) { for (m in ms) { KeyValue(m.label, f4(m.value)); Text(m.formula, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = MonoFamily) } }
    }
}

@Composable
private fun CoordinatesTab(vm: GeometryViewModel) {
    Text("Two points", style = MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        NumberField("x₁", vm.ax, { vm.ax = it }, Modifier.weight(1f)); NumberField("y₁", vm.ay, { vm.ay = it }, Modifier.weight(1f))
        NumberField("x₂", vm.bx, { vm.bx = it }, Modifier.weight(1f)); NumberField("y₂", vm.by, { vm.by = it }, Modifier.weight(1f))
    }
    val r = runCatching {
        val a = Pt(parseBound(vm.ax), parseBound(vm.ay)); val b = Pt(parseBound(vm.bx), parseBound(vm.by))
        val dx = b.x - a.x; val dy = b.y - a.y
        val mid = Coordinate.midpoint(a, b)
        val slope = if (abs(dx) < 1e-15) null else dy / dx
        val d2 = dx * dx + dy * dy
        val exact = runCatching { pu(Algebra.simplify(Parser.parse("sqrt(${java.math.BigDecimal(d2).stripTrailingZeros().toPlainString()})")).last().result) }.getOrNull()
        listOf(
            "Distance" to (exact?.let { "$it ≈ ${f4(sqrt(d2))}" } ?: f4(sqrt(d2))),
            "Midpoint" to "(${f4(mid.x)}, ${f4(mid.y)})",
            "Slope" to (slope?.let { f4(it) } ?: "undefined (vertical line)"),
            "Line" to (if (slope == null) "x = ${f4(a.x)}" else "y = ${f4(slope)}x + ${f4(a.y - slope * a.x)}"),
            "Angle of inclination" to "${f4(Math.toDegrees(atan2(dy, dx)))}°",
            "Perpendicular slope" to (if (slope == null) "0" else if (abs(slope) < 1e-15) "undefined" else f4(-1 / slope)),
        ) to (a to b)
    }
    r.onSuccess { (rows, ab) ->
        Panel(title = "Results") { rows.forEach { (k, v) -> KeyValue(k, v) } }
        val lab = LocalLab.current
        val (a, b) = ab
        val pad = max(2.0, max(abs(b.x - a.x), abs(b.y - a.y)) * 0.4)
        val vp = Viewport(min(a.x, b.x) - pad, max(a.x, b.x) + pad, min(a.y, b.y) - pad, max(a.y, b.y) + pad)
        MiniPlot(emptyList(), vp, points = listOf(PlotPoint(a.x, a.y, lab.accent, "P₁"), PlotPoint(b.x, b.y, lab.accent2, "P₂"), PlotPoint((a.x + b.x) / 2, (a.y + b.y) / 2, lab.warning, "M")),
            segments = listOf(PlotSegment(a.x, a.y, b.x, b.y, lab.accent)), description = "Segment between the two points")
    }.onFailure { ErrorPanel(it.message ?: "Enter four numbers") }
}

// =============================== Trigonometry ===============================

class TrigViewModel(private val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var theta by mutableStateOf(PI / 6)
    var snap by mutableStateOf(true)
    var sa by mutableStateOf(""); var sb by mutableStateOf(""); var sc by mutableStateOf("")
    var angA by mutableStateOf("30"); var angB by mutableStateOf(""); var angC by mutableStateOf("")
    var convert by mutableStateOf("135")
    val tri = computation<List<Triangle>>()
    init { sa = "8"; sb = "6" }

    fun setAngle(t: Double) {
        var x = t.mod(2 * PI)
        if (snap) x = (Math.toDegrees(x) / 15).roundToInt() * 15.0 * PI / 180
        theta = x.mod(2 * PI)
    }

    fun solveTriangle() {
        fun v(s: String) = s.trim().takeIf { it.isNotEmpty() }?.let { parseBound(it) }
        tri.run(onOk = { ts -> c.history.add(Kind.TRIG, "a=$sa b=$sb c=$sc A=$angA B=$angB C=$angC", ts.joinToString(" | ") { "a=${f4(it.a)} b=${f4(it.b)} c=${f4(it.c)} A=${f4(it.angleA)}° B=${f4(it.angleB)}° C=${f4(it.angleC)}°" }) }) {
            val r = TriangleSolver.solve(v(sa), v(sb), v(sc), v(angA), v(angB), v(angC))
            if (r.isEmpty()) throw com.quantumath.math.core.MathError("No triangle has these measurements")
            r
        }
    }
}

@Composable
fun TrigScreen(nav: NavHostController) {
    val vm = appViewModel { TrigViewModel(it) }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Trigonometry explorer", onBack = { nav.popBackStack() })
        PrimaryTabRow(selectedTabIndex = vm.tab, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Unit circle", "Triangle solver", "Convert").forEachIndexed { i, t -> Tab(vm.tab == i, { vm.tab = i }, text = { Text(t, maxLines = 1) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            when (vm.tab) { 0 -> UnitCircleTab(vm); 1 -> TriangleTab(vm); else -> ConvertTab(vm) }
        }
    }
}

private fun exactTrig(fn: String, deg: Double): String? {
    if (abs(deg - deg.roundToInt()) > 1e-9) return null
    val d = deg.roundToInt()
    if (fn == "tan" && (d % 180 == 90)) return "undefined"
    return runCatching { pu(Algebra.simplify(Parser.parse("$fn($d*pi/180)")).last().result) }.getOrNull()?.takeIf { !it.contains("sin") && !it.contains("cos") && !it.contains("tan") }
}

@Composable
private fun UnitCircleTab(vm: TrigViewModel) {
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    val t = vm.theta
    val deg = Math.toDegrees(t)
    Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp))) {
        Canvas(Modifier.fillMaxSize()
            .pointerInput(Unit) { detectDragGestures { change, _ -> val cx = size.width / 2f; val cy = size.height / 2f; vm.setAngle(atan2(-(change.position.y - cy).toDouble(), (change.position.x - cx).toDouble())); change.consume() } }
            .pointerInput(Unit) { detectTapGestures { o -> vm.setAngle(atan2(-(o.y - size.height / 2f).toDouble(), (o.x - size.width / 2f).toDouble())) } }
            .semantics { contentDescription = "Unit circle. Angle ${f4(deg)} degrees. Drag around the circle to change it." }
        ) {
            drawRect(if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFCFCFF))
            val vp = Viewport(-1.6, 1.6, -1.6, 1.6)
            val m = Mapper(vp, size.width, size.height)
            drawGrid(m, lab, tm, labels = false)
            val r = (1 / vp.width * size.width).toFloat()
            val o = Offset(m.sx(0.0), m.sy(0.0))
            drawCircle(lab.axis.copy(alpha = 0.6f), r, o, style = Stroke(2f))
            for (k in 0 until 24) { val a = k * PI / 12; drawCircle(lab.axis.copy(alpha = 0.5f), 3f, Offset(m.sx(cos(a)), m.sy(sin(a)))) }
            val p = Offset(m.sx(cos(t)), m.sy(sin(t)))
            // angle arc
            drawArc(lab.warning.copy(alpha = 0.6f), 0f, -deg.toFloat(), false, topLeft = o - Offset(r * 0.25f, r * 0.25f), size = Size(r * 0.5f, r * 0.5f), style = Stroke(3f))
            // cos (horizontal) and sin (vertical) segments
            drawLine(lab.accent2, o, Offset(p.x, o.y), 5f)
            drawLine(lab.accent, Offset(p.x, o.y), p, 5f)
            // tan on the tangent line x = 1
            if (abs(cos(t)) > 1e-6) {
                val tv = tan(t).coerceIn(-1.55, 1.55)
                drawLine(lab.curves[2], Offset(m.sx(1.0), m.sy(0.0)), Offset(m.sx(1.0), m.sy(tv)), 4f)
                drawLine(lab.curves[2].copy(alpha = 0.4f), o, Offset(m.sx(1.0), m.sy(tv)), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)))
            }
            drawLine(lab.axis, o, p, 2.5f)
            drawCircle(lab.warning.copy(alpha = 0.3f), 24f, p); drawCircle(lab.warning, 11f, p)
            val st = TextStyle(fontSize = 12.sp, fontFamily = MonoFamily)
            drawTextSafe(tm, "cos", Offset((o.x + p.x) / 2 - 12, o.y + 6), st.copy(color = lab.accent2))
            drawTextSafe(tm, "sin", Offset(p.x + 8, (o.y + p.y) / 2), st.copy(color = lab.accent))
            val coord = "(${f4(cos(t))}, ${f4(sin(t))})"
            val cw = tm.measure(coord, st).size.width
            val lx = if (p.x + 14f + cw > size.width - 6f) p.x - 14f - cw else p.x + 14f
            val ly = if (p.y - 30f < 4f) p.y + 14f else p.y - 30f
            drawTextSafe(tm, coord, Offset(lx.coerceAtLeast(4f), ly), st.copy(color = lab.warning))
        }
    }
    SwitchRow("Snap to multiples of 15°", vm.snap, { vm.snap = it })
    Slider(value = deg.toFloat(), onValueChange = { vm.setAngle(Math.toRadians(it.toDouble())) }, valueRange = 0f..359.99f, modifier = Modifier.semantics { contentDescription = "Angle in degrees" })
    Panel(title = "θ = ${f4(deg)}°  =  ${exactRad(deg) ?: f4(t)} rad") {
        for (fn in listOf("sin", "cos", "tan")) {
            val v = when (fn) { "sin" -> sin(t); "cos" -> cos(t); else -> if (abs(cos(t)) < 1e-12) Double.NaN else tan(t) }
            val ex = exactTrig(fn, deg)
            KeyValue("$fn θ", (ex?.let { if (it == "undefined") it else "$it ≈ ${f4(v)}" } ?: f4(v)))
        }
        KeyValue("Quadrant", when { deg % 90 == 0.0 -> "on an axis"; deg < 90 -> "I (all positive)"; deg < 180 -> "II (sin > 0)"; deg < 270 -> "III (tan > 0)"; else -> "IV (cos > 0)" }, mono = false)
        KeyValue("Reference angle", "${f4(listOf(deg, 180 - deg, deg - 180, 360 - deg).first { it in 0.0..90.0 })}°")
    }
    MiniPlot(listOf(PlotCurve({ sin(it) }, lab.accent), PlotCurve({ cos(it) }, lab.accent2, dashed = true)), Viewport(0.0, 2 * PI, -1.5, 1.5), height = 160.dp,
        points = listOf(PlotPoint(t, sin(t), lab.accent), PlotPoint(t, cos(t), lab.accent2)), description = "Sine and cosine waves with the current angle marked")
}

private fun exactRad(deg: Double): String? {
    if (abs(deg - deg.roundToInt()) > 1e-9) return null
    val r = com.quantumath.math.core.Rational.of(deg.roundToInt().toLong(), 180)
    return when { r.isZero -> "0"; r.num.toInt() == 1 && r.den.toInt() == 1 -> "π"; r.den.toInt() == 1 -> "${r.num}π"; r.num.toInt() == 1 -> "π/${r.den}"; else -> "${r.num}π/${r.den}" }
}

@Composable
private fun TriangleTab(vm: TrigViewModel) {
    val out by vm.tri.state.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    InfoPanel("Enter any three values including at least one side (angles in degrees). Side a is opposite angle A. SSA input may give two triangles (ambiguous case).")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        NumberField("a", vm.sa, { vm.sa = it }, Modifier.weight(1f)); NumberField("b", vm.sb, { vm.sb = it }, Modifier.weight(1f)); NumberField("c", vm.sc, { vm.sc = it }, Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        NumberField("A°", vm.angA, { vm.angA = it }, Modifier.weight(1f)); NumberField("B°", vm.angB, { vm.angB = it }, Modifier.weight(1f)); NumberField("C°", vm.angC, { vm.angC = it }, Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PrimaryButton("Solve triangle", vm::solveTriangle, Modifier.weight(1f))
        OutlinedButton(onClick = { vm.sa = ""; vm.sb = ""; vm.sc = ""; vm.angA = ""; vm.angB = ""; vm.angC = ""; vm.tri.clear() }, Modifier.heightIn(min = 48.dp)) { Text("Clear") }
    }
    OutcomeView(out) { ts ->
        if (ts.size > 2 || ts.size == 2) InfoPanel("Ambiguous case (SSA): two different triangles fit these measurements.", icon = Icons.Outlined.CallSplit)
        ts.forEachIndexed { i, t ->
            Panel(title = if (ts.size > 1) "Triangle ${i + 1}" else "Solution", icon = Icons.Outlined.ChangeHistory) {
                TriangleDrawing(t, lab)
                KeyValue("Sides", "a = ${f4(t.a)}, b = ${f4(t.b)}, c = ${f4(t.c)}")
                KeyValue("Angles", "A = ${f4(t.angleA)}°, B = ${f4(t.angleB)}°, C = ${f4(t.angleC)}°")
                KeyValue("Area", f4(t.area)); KeyValue("Perimeter", f4(t.perimeter))
                KeyValue("Circumradius / inradius", "${f4(t.circumradius)} / ${f4(t.inradius)}")
                KeyValue("Type", t.kind, mono = false); KeyValue("Method", t.method, mono = false)
            }
        }
    }
}

@Composable
private fun TriangleDrawing(t: Triangle, lab: com.quantumath.app.ui.theme.LabColors) {
    val tm = rememberTextMeasurer()
    Canvas(Modifier.fillMaxWidth().height(180.dp).semantics { contentDescription = "Drawing of the triangle" }) {
        // place A at origin, B on x-axis (side c), C using angle A and side b
        val ax = 0.0; val ay = 0.0; val bx = t.c; val by = 0.0
        val cx = t.b * cos(Math.toRadians(t.angleA)); val cy = t.b * sin(Math.toRadians(t.angleA))
        val minX = min(ax, cx); val maxX = max(bx, cx); val maxY = cy
        val s = min((size.width - 60) / (maxX - minX), (size.height - 50) / maxY).toFloat()
        fun P(x: Double, y: Double) = Offset(30 + ((x - minX) * s).toFloat(), size.height - 25 - (y * s).toFloat())
        val path = Path().apply { moveTo(P(ax, ay).x, P(ax, ay).y); lineTo(P(bx, by).x, P(bx, by).y); lineTo(P(cx, cy).x, P(cx, cy).y); close() }
        drawPath(path, lab.accent.copy(alpha = 0.15f)); drawPath(path, lab.accent, style = Stroke(3f))
        val st = TextStyle(fontSize = 12.sp, color = lab.axis)
        drawTextSafe(tm, "A", P(ax, ay) + Offset(-16f, -8f), st); drawTextSafe(tm, "B", P(bx, by) + Offset(6f, -8f), st); drawTextSafe(tm, "C", P(cx, cy) + Offset(-4f, -22f), st)
    }
}

@Composable
private fun ConvertTab(vm: TrigViewModel) {
    NumberField("Angle", vm.convert, { vm.convert = it }, Modifier.fillMaxWidth(), supporting = "Degrees, or radians written with pi (e.g. 3pi/4)")
    val txt = vm.convert.trim()
    val res = runCatching {
        if (txt.contains("pi") || txt.contains("π")) { val r = parseBound(txt); "rad → deg" to "${f4(Math.toDegrees(r))}°" }
        else { val d = parseBound(txt); "deg → rad" to "${exactRad(d) ?: f4(Math.toRadians(d))} ≈ ${f4(Math.toRadians(d))} rad" }
    }
    res.onSuccess { (k, v) -> ResultPanel(k, v) }.onFailure { if (txt.isNotEmpty()) ErrorPanel(it.message ?: "Invalid angle") }
    Panel(title = "Exact values") {
        for (d in listOf(0, 30, 45, 60, 90, 120, 135, 150, 180)) KeyValue("${d}°  (${exactRad(d.toDouble())})", "sin ${exactTrig("sin", d.toDouble())}   cos ${exactTrig("cos", d.toDouble())}   tan ${exactTrig("tan", d.toDouble())}")
    }
}
