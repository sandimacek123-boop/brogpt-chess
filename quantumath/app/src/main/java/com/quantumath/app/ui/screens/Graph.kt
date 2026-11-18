package com.quantumath.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.data.GraphFunction
import com.quantumath.app.data.GraphProject
import com.quantumath.app.data.Kind
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.theme.CurvePalette
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.Share
import com.quantumath.app.util.friendlyError
import com.quantumath.math.eval.AngleMode
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.plot.GraphAnalysis
import com.quantumath.math.plot.Plotter
import com.quantumath.math.plot.Polyline
import com.quantumath.math.plot.Viewport
import com.quantumath.math.symbolic.LimitSolver
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlin.math.abs
import kotlin.math.max

class SceneHolder { var scene: GraphScene? = null }

data class GFun(val id: Int, val fn: GraphFunction, val error: String? = null)
data class GPoint(val x: Double, val y: Double, val label: String, val color: Color)
data class Compiled(val type: String, val f: ((Double) -> Double)? = null, val px: ((Double) -> Double)? = null, val py: ((Double) -> Double)? = null)

class GraphViewModel(private val c: AppContainer) : ViewModel() {
    private var nextId = 1
    val functions = MutableStateFlow(listOf(GFun(nextId++, GraphFunction("sin(x)", color = CurvePalette[0].toArgb()))))
    val viewport = MutableStateFlow(Viewport(-10.0, 10.0, -6.0, 6.0))
    val canvasSize = MutableStateFlow(IntSize(1000, 600))
    val showRoots = MutableStateFlow(true); val showExtrema = MutableStateFlow(true)
    val showIntersections = MutableStateFlow(true); val showAsymptotes = MutableStateFlow(true)
    val trace = MutableStateFlow<Double?>(null)
    val projects = c.db.graphs().projects().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private var initialized = false

    private val compiled: StateFlow<Map<Int, Compiled>> = combine(functions, c.settings.map { it.degrees }.distinctUntilChanged()) { fs, deg ->
        val ev = Evaluator(if (deg) AngleMode.DEGREES else AngleMode.RADIANS, strict = false)
        fs.associate { g -> g.id to compile(g.fn, ev) }.filterValues { it != null }.mapValues { it.value!! }
    }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    private fun compile(fn: GraphFunction, ev: Evaluator): Compiled? = runCatching {
        when (fn.type) {
            "param" -> {
                val parts = fn.text.split(';', limit = 2)
                if (parts.size < 2) error("Write parametric curves as x(t); y(t)")
                Compiled("param", px = ev.function(Parser.parse(parts[0].replace("θ", "t")), "t"), py = ev.function(Parser.parse(parts[1].replace("θ", "t")), "t"))
            }
            "polar" -> Compiled("polar", f = ev.function(Parser.parse(fn.text.substringAfter("=").replace("θ", "t")), "t"))
            else -> Compiled("y", f = ev.function(Parser.parse(fn.text.substringAfter("=")), "x"))
        }
    }.getOrNull()

    /** Polylines per function id, plus the (expanded) window they were sampled for. */
    private data class Plot(val lines: Map<Int, List<Polyline>>, val window: Viewport?)
    private val plot = MutableStateFlow(Plot(emptyMap(), null))
    val lines: StateFlow<Map<Int, List<Polyline>>> = plot.map { it.lines }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())
    val analysis = MutableStateFlow<List<GPoint>>(emptyList())
    val vAsymptotes = MutableStateFlow<List<Pair<Double, Color>>>(emptyList())
    val hAsymptotes = MutableStateFlow<List<Pair<Double, Color>>>(emptyList())

    init {
        viewModelScope.launch(Dispatchers.Default) {
            var lastCompiled: Map<Int, Compiled>? = null
            var lastQuality = 0.0
            combine(compiled, viewport, canvasSize, c.settings.map { it.graphQuality.factor }) { a, b, s, q -> Quad(a, b, s, q) }.conflate().collect { (comp, vp, size, q) ->
                val old = plot.value
                val w = old.window
                val needs = comp !== lastCompiled || q != lastQuality || w == null || vp.xMin < w.xMin || vp.xMax > w.xMax ||
                    vp.width < w.width / 2 / 1.6 || vp.width > w.width / 2 * 1.25 || vp.height / (w.height) !in 0.7..1.45 || vp.yMin < w.yMin - w.height || vp.yMax > w.yMax + w.height
                if (!needs) return@collect
                val win = Viewport(vp.xMin - vp.width / 2, vp.xMax + vp.width / 2, vp.yMin, vp.yMax)
                val px = (size.width * 2 * q).toInt().coerceIn(200, 6000)
                val out = HashMap<Int, List<Polyline>>()
                for ((id, cf) in comp) {
                    ensureActive()
                    val fn = functions.value.firstOrNull { it.id == id }?.fn ?: continue
                    out[id] = runCatching {
                        when (cf.type) {
                            "param" -> Plotter.parametric(cf.px!!, cf.py!!, fn.tMin, fn.tMax, (1500 * q).toInt())
                            "polar" -> Plotter.polar(cf.f!!, fn.tMin, fn.tMax, (2000 * q).toInt())
                            else -> Plotter.function(cf.f!!, win, px, 1.0, if (q > 1.5) 9 else 7)
                        }
                    }.getOrDefault(emptyList())
                }
                lastCompiled = comp; lastQuality = q
                plot.value = Plot(out, Viewport(win.xMin, win.xMax, vp.yMin, vp.yMax))
            }
        }
        // analysis, debounced
        viewModelScope.launch {
            combine(compiled, viewport.debounce(250), showRoots, showExtrema, combine(showIntersections, showAsymptotes) { a, b -> a to b }) { comp, vp, r, e, ia -> AnalysisReq(comp, vp, r, e, ia.first, ia.second) }
                .collectLatest { req -> runAnalysis(req) }
        }
    }

    private data class Quad(val a: Map<Int, Compiled>, val b: Viewport, val c: IntSize, val d: Double)
    private data class AnalysisReq(val comp: Map<Int, Compiled>, val vp: Viewport, val roots: Boolean, val extrema: Boolean, val inter: Boolean, val asym: Boolean)

    private suspend fun runAnalysis(r: AnalysisReq) = withContext(Dispatchers.Default) {
        val fs = functions.value.filter { it.fn.visible && it.fn.type == "y" }.mapNotNull { g -> r.comp[g.id]?.f?.let { Triple(g, it, Color(g.fn.color)) } }.take(6)
        val pts = ArrayList<GPoint>(); val va = ArrayList<Pair<Double, Color>>(); val ha = ArrayList<Pair<Double, Color>>()
        for ((_, f, col) in fs) {
            ensureActive()
            if (r.roots) runCatching { GraphAnalysis.roots(f, r.vp).take(40).forEach { pts += GPoint(it.x, 0.0, "root", col) } }
            if (r.extrema) runCatching { GraphAnalysis.extrema(f, r.vp).take(40).forEach { pts += GPoint(it.x, it.y, it.label, col) } }
            if (r.asym) {
                runCatching { GraphAnalysis.verticalAsymptotes(f, r.vp).take(30).forEach { va += it to col } }
                runCatching { GraphAnalysis.horizontalAsymptotes(f).forEach { ha += it to col } }
            }
        }
        if (r.inter) for (i in fs.indices) for (j in i + 1 until fs.size) { ensureActive(); runCatching { GraphAnalysis.intersections(fs[i].second, fs[j].second, r.vp).take(30).forEach { pts += GPoint(it.x, it.y, "∩", Color.White) } } }
        analysis.value = pts; vAsymptotes.value = va; hAsymptotes.value = ha
    }

    fun traceValues(x: Double): List<Pair<GFun, Double>> {
        val comp = compiled.value
        return functions.value.filter { it.fn.visible && it.fn.type == "y" }.mapNotNull { g -> comp[g.id]?.f?.let { g to it(x) } }
    }

    fun setInitial(text: String) {
        if (initialized) return
        initialized = true
        if (text.isBlank()) return
        val lines = text.split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        functions.value = emptyList()
        lines.forEach { add(it) }
        fit()
    }

    fun detectType(t: String): String = when {
        t.contains(';') -> "param"
        t.trimStart().startsWith("r=") || t.trimStart().startsWith("r =") || t.contains('θ') -> "polar"
        else -> "y"
    }

    fun add(text: String, type: String = detectType(text)): Boolean {
        val t = text.trim(); if (t.isEmpty()) return false
        val err = validate(t, type)
        val color = CurvePalette[(functions.value.size) % CurvePalette.size].toArgb()
        val g = GFun(nextId++, GraphFunction(t, type, color, tMin = 0.0, tMax = if (type == "y") 0.0 else 2 * Math.PI), err)
        functions.value = functions.value + g
        viewModelScope.launch { c.history.add(Kind.GRAPH, t, "graph (${type})") }
        c.unlock("first-graph")
        return err == null
    }

    private fun validate(t: String, type: String): String? = try {
        when (type) {
            "param" -> t.split(';', limit = 2).also { require(it.size == 2) { "Use x(t); y(t)" } }.forEach { Parser.parse(it.replace("θ", "t")) }
            "polar" -> Parser.parse(t.substringAfter("=").replace("θ", "t"))
            else -> {
                val e = Parser.parse(t.substringAfter("="))
                val extra = e.variables() - "x"
                require(extra.isEmpty()) { "y = f(x) may only use x (found ${extra.joinToString()})" }
            }
        }
        null
    } catch (e: Exception) { friendlyError(e) }

    fun update(id: Int, text: String) {
        functions.value = functions.value.map { if (it.id == id) { val type = detectType(text); it.copy(fn = it.fn.copy(text = text, type = type, tMax = if (type != "y" && it.fn.tMax == 0.0) 2 * Math.PI else it.fn.tMax), error = validate(text, type)) } else it }
    }
    fun setRange(id: Int, t0: Double, t1: Double) { functions.value = functions.value.map { if (it.id == id) it.copy(fn = it.fn.copy(tMin = t0, tMax = t1)) else it } }
    fun toggle(id: Int) { functions.value = functions.value.map { if (it.id == id) it.copy(fn = it.fn.copy(visible = !it.fn.visible)) else it } }
    fun remove(id: Int) { functions.value = functions.value.filterNot { it.id == id } }
    fun recolor(id: Int) { functions.value = functions.value.map { if (it.id == id) it.copy(fn = it.fn.copy(color = CurvePalette[(CurvePalette.indexOfFirst { c -> c.toArgb() == it.fn.color } + 1).mod(CurvePalette.size)].toArgb())) else it } }

    fun pan(dxPx: Float, dyPx: Float) {
        val s = canvasSize.value; val vp = viewport.value
        val dx = -dxPx / s.width * vp.width; val dy = dyPx / s.height * vp.height
        viewport.value = Viewport(vp.xMin + dx, vp.xMax + dx, vp.yMin + dy, vp.yMax + dy)
    }

    fun zoom(factor: Float, cx: Float, cy: Float) {
        val s = canvasSize.value; val vp = viewport.value
        val m = Mapper(vp, s.width.toFloat(), s.height.toFloat())
        val wx = m.wx(cx); val wy = m.wy(cy)
        val f = (1.0 / factor).let { val nw = vp.width * it; if (nw < 1e-9 || nw > 1e9) 1.0 else it }
        viewport.value = Viewport(wx - (wx - vp.xMin) * f, wx + (vp.xMax - wx) * f, wy - (wy - vp.yMin) * f, wy + (vp.yMax - wy) * f)
    }

    fun reset() {
        val s = canvasSize.value
        val half = 10.0 * s.height / s.width.coerceAtLeast(1)
        viewport.value = Viewport(-10.0, 10.0, -half, half)
    }

    fun equalAspect() {
        val s = canvasSize.value; val vp = viewport.value
        val cy = (vp.yMin + vp.yMax) / 2; val half = vp.width * s.height / s.width.coerceAtLeast(1) / 2
        viewport.value = Viewport(vp.xMin, vp.xMax, cy - half, cy + half)
    }

    /** Fit y to the visible functions on the current x-range. */
    fun fit() {
        val comp = compiled.value
        val vp = viewport.value
        val fs = functions.value.filter { it.fn.visible }.mapNotNull { g -> comp[g.id]?.let { g to it } }
        viewModelScope.launch(Dispatchers.Default) {
            val ev = Evaluator(strict = false)
            // compiled map may not be ready yet right after adding: compile directly
            val ys = ArrayList<Double>(); val xs = ArrayList<Double>()
            for (g in functions.value.filter { it.fn.visible }) {
                val cf = comp[g.id] ?: compile(g.fn, ev) ?: continue
                when (cf.type) {
                    "y" -> for (i in 0..400) { val y = cf.f!!(vp.xMin + vp.width * i / 400); if (y.isFinite()) ys += y }
                    else -> for (i in 0..400) {
                        val t = g.fn.tMin + (g.fn.tMax - g.fn.tMin) * i / 400
                        val (x, y) = if (cf.type == "param") cf.px!!(t) to cf.py!!(t) else cf.f!!(t).let { r -> r * kotlin.math.cos(t) to r * kotlin.math.sin(t) }
                        if (x.isFinite() && y.isFinite()) { xs += x; ys += y }
                    }
                }
            }
            if (ys.isEmpty()) return@launch
            ys.sort()
            var lo = ys[(ys.size * 0.02).toInt()]; var hi = ys[((ys.size - 1) * 0.98).toInt()]
            if (hi - lo < 1e-6) { lo -= 1; hi += 1 }
            val pad = (hi - lo) * 0.12
            if (xs.isNotEmpty()) {
                xs.sort(); val xl = xs.first(); val xh = xs.last(); val px = max(xh - xl, 1e-6) * 0.12
                viewport.value = Viewport(xl - px, xh + px, lo - pad, hi + pad)
            } else viewport.value = Viewport(vp.xMin, vp.xMax, lo - pad, hi + pad)
        }
        if (fs.isEmpty()) return
    }

    fun saveProject(name: String, existing: GraphProject? = null) = viewModelScope.launch {
        val json = Json.encodeToString(ListSerializer(GraphFunction.serializer()), functions.value.map { it.fn })
        val vp = viewport.value
        c.db.graphs().upsert(GraphProject(id = existing?.id ?: 0, name = name.ifBlank { "Graph" }, functionsJson = json, xMin = vp.xMin, xMax = vp.xMax, yMin = vp.yMin, yMax = vp.yMax))
        c.messages.emit("Graph project saved")
    }

    fun loadProject(p: GraphProject) {
        val fs = runCatching { Json.decodeFromString(ListSerializer(GraphFunction.serializer()), p.functionsJson) }.getOrDefault(emptyList())
        functions.value = fs.map { GFun(nextId++, it, validate(it.text, it.type)) }
        viewport.value = Viewport(p.xMin, p.xMax, p.yMin, p.yMax)
    }

    fun deleteProject(p: GraphProject) = viewModelScope.launch { c.db.graphs().delete(p) }
}

@Composable
fun GraphScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { GraphViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial) }
    val fns by vm.functions.collectAsStateWithLifecycle()
    var showProjects by remember { mutableStateOf(false) }
    var showAnalysis by remember { mutableStateOf(false) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val holder = remember { SceneHolder() }
    val density = androidx.compose.ui.platform.LocalDensity.current

    Column(Modifier.fillMaxSize()) {
        LabTopBar("Graph", subtitle = "${fns.count { it.fn.visible }} of ${fns.size} visible · pinch, drag, tap to trace", actions = {
            IconButton(onClick = { showAnalysis = true }) { Icon(Icons.Outlined.Tune, "Analysis options") }
            IconButton(onClick = {
                scope.launch {
                    runCatching {
                        val sc = holder.scene ?: error("Graph not ready")
                        val sz = vm.canvasSize.value
                        val bmp = renderGraphBitmap(sc, vm, sz.width, sz.height, density).asAndroidBitmap() // main thread: shares the TextMeasurer
                        Share.image(ctx, bmp, "quantumath-graph")
                    }
                        .onFailure { android.widget.Toast.makeText(ctx, "Screenshot failed: ${it.message}", android.widget.Toast.LENGTH_SHORT).show() }
                }
            }) { Icon(Icons.Outlined.PhotoCamera, "Share screenshot of graph") }
            IconButton(onClick = { showProjects = true }) { Icon(Icons.Outlined.FolderOpen, "Saved graph projects") }
        })
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val landscape = maxWidth > maxHeight
            if (landscape) Row(Modifier.fillMaxSize()) {
                GraphCanvas(vm, Modifier.weight(1.6f).fillMaxHeight().padding(start = 12.dp, bottom = 12.dp), holder)
                FunctionList(vm, fns, Modifier.weight(1f).fillMaxHeight())
            } else Column(Modifier.fillMaxSize()) {
                GraphCanvas(vm, Modifier.fillMaxWidth().weight(1.25f).padding(horizontal = 12.dp), holder)
                FunctionList(vm, fns, Modifier.fillMaxWidth().weight(1f))
            }
        }
    }
    if (showProjects) ProjectsSheet(vm) { showProjects = false }
    if (showAnalysis) AnalysisSheet(vm) { showAnalysis = false }
}

@Composable
private fun GraphCanvas(vm: GraphViewModel, modifier: Modifier, holder: SceneHolder) {
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    val vp by vm.viewport.collectAsStateWithLifecycle()
    val lines by vm.lines.collectAsStateWithLifecycle()
    val fns by vm.functions.collectAsStateWithLifecycle()
    val pts by vm.analysis.collectAsStateWithLifecycle()
    val va by vm.vAsymptotes.collectAsStateWithLifecycle()
    val ha by vm.hAsymptotes.collectAsStateWithLifecycle()
    val trace by vm.trace.collectAsStateWithLifecycle()
    val bg = if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFCFCFF)
    val scene = GraphScene(vp, lines, fns, pts, va, ha, trace, lab, tm, bg)
    holder.scene = scene
    Box(modifier.clip(RoundedCornerShape(20.dp))) {
        Canvas(
            Modifier.fillMaxSize()
                .onSizeChanged { if (it.width > 0 && it.height > 0) { val first = vm.canvasSize.value == IntSize(1000, 600); vm.canvasSize.value = it; if (first) vm.equalAspect() } }
                .pointerInput(Unit) { detectTransformGestures { centroid, pan, zoom, _ -> vm.pan(pan.x, pan.y); if (zoom != 1f) vm.zoom(zoom, centroid.x, centroid.y) } }
                .pointerInput(Unit) { detectTapGestures(onDoubleTap = { vm.zoom(2f, it.x, it.y) }, onTap = { o ->
                    val s = vm.canvasSize.value; val m = Mapper(vm.viewport.value, s.width.toFloat(), s.height.toFloat())
                    // snap to a nearby analysis point
                    val snap = vm.analysis.value.minByOrNull { p -> (m.sx(p.x) - o.x).let { it * it } + (m.sy(p.y) - o.y).let { it * it } }
                    val x = if (snap != null && abs(m.sx(snap.x) - o.x) < 40 && abs(m.sy(snap.y) - o.y) < 40) snap.x else m.wx(o.x)
                    vm.trace.value = if (vm.trace.value != null && abs(m.sx(vm.trace.value!!) - o.x) < 6) null else x
                }) }
                .semantics { contentDescription = "Graph canvas showing ${fns.count { it.fn.visible }} functions. x from ${LimitSolver.fmt(vp.xMin)} to ${LimitSolver.fmt(vp.xMax)}" }
        ) {
            drawGraphScene(scene, vm)
        }
        Column(Modifier.align(Alignment.BottomEnd).padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SmallFloatingActionButton(onClick = { val s = vm.canvasSize.value; vm.zoom(1.5f, s.width / 2f, s.height / 2f) }) { Icon(Icons.Filled.Add, "Zoom in") }
            SmallFloatingActionButton(onClick = { val s = vm.canvasSize.value; vm.zoom(1 / 1.5f, s.width / 2f, s.height / 2f) }) { Icon(Icons.Filled.Remove, "Zoom out") }
            SmallFloatingActionButton(onClick = vm::fit) { Icon(Icons.Filled.FitScreen, "Fit to functions") }
            SmallFloatingActionButton(onClick = vm::reset) { Icon(Icons.Filled.CenterFocusStrong, "Reset view") }
        }
    }
}

/** Everything needed to draw the graph; also used to render a screenshot bitmap off-screen. */
class GraphScene(
    val vp: Viewport, val lines: Map<Int, List<Polyline>>, val fns: List<GFun>, val pts: List<GPoint>,
    val va: List<Pair<Double, Color>>, val ha: List<Pair<Double, Color>>, val trace: Double?,
    val lab: com.quantumath.app.ui.theme.LabColors, val tm: androidx.compose.ui.text.TextMeasurer, val bg: Color,
)

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawGraphScene(sc: GraphScene, vm: GraphViewModel) {
    val vp = sc.vp; val lines = sc.lines; val fns = sc.fns; val pts = sc.pts; val va = sc.va; val ha = sc.ha; val trace = sc.trace
    val lab = sc.lab; val tm = sc.tm; val bg = sc.bg
    drawRect(bg)
    val m = Mapper(vp, size.width, size.height)
    drawGrid(m, lab, tm)
    val dash = PathEffect.dashPathEffect(floatArrayOf(12f, 10f))
    for ((x, col) in va) drawLine(col.copy(alpha = 0.7f), Offset(m.sx(x), 0f), Offset(m.sx(x), size.height), 1.5f, pathEffect = dash)
    for ((y, col) in ha) drawLine(col.copy(alpha = 0.7f), Offset(0f, m.sy(y)), Offset(size.width, m.sy(y)), 1.5f, pathEffect = dash)
    for (g in fns) if (g.fn.visible) lines[g.id]?.let { drawPolylines(m, it, Color(g.fn.color), 3.2f) }
    for (p in pts) {
        val o = Offset(m.sx(p.x), m.sy(p.y))
        if (o.x < -10 || o.x > size.width + 10 || o.y < -10 || o.y > size.height + 10) continue
        drawCircle(bg, 7f, o); drawCircle(p.color, 6f, o, style = Stroke(2.5f))
    }
    trace?.let { tx ->
        val px = m.sx(tx)
        drawLine(lab.axis, Offset(px, 0f), Offset(px, size.height), 1f, pathEffect = dash)
        val vals = vm.traceValues(tx)
        var ly = 12f
        val near = pts.filter { abs(it.x - tx) < vp.width * 1e-6 }
        val header = "x = ${LimitSolver.fmt(tx)}" + (near.firstOrNull()?.let { "  (${it.label})" } ?: "")
        val st = TextStyle(fontSize = 12.sp, fontFamily = MonoFamily)
        val boxW = 220f.coerceAtMost(size.width - 16f)
        val left = if (px + boxW + 16 < size.width) px + 10 else px - boxW - 10
        drawRoundRect(bg.copy(alpha = 0.85f), Offset(left - 6, 6f), androidx.compose.ui.geometry.Size(boxW, 22f + vals.size * 18f), androidx.compose.ui.geometry.CornerRadius(10f))
        drawTextSafe(tm, header, Offset(left, ly), st.copy(color = lab.axis)); ly += 18f
        for ((g, y) in vals) {
            val col = Color(g.fn.color)
            if (y.isFinite()) { val o = Offset(px, m.sy(y)); drawCircle(col, 7f, o); drawCircle(Color.White, 2.5f, o) }
            drawTextSafe(tm, "y = ${LimitSolver.fmt(y)}", Offset(left, ly), st.copy(color = col)); ly += 18f
        }
    }

}

/** Render the current graph into a bitmap (software canvas; no RenderNode needed). */
fun renderGraphBitmap(sc: GraphScene, vm: GraphViewModel, w: Int, h: Int, density: androidx.compose.ui.unit.Density): ImageBitmap {
    val img = ImageBitmap(w, h)
    androidx.compose.ui.graphics.drawscope.CanvasDrawScope().draw(density, androidx.compose.ui.unit.LayoutDirection.Ltr, androidx.compose.ui.graphics.Canvas(img), androidx.compose.ui.geometry.Size(w.toFloat(), h.toFloat())) { drawGraphScene(sc, vm) }
    return img
}

@Composable
private fun FunctionList(vm: GraphViewModel, fns: List<GFun>, modifier: Modifier) {
    var text by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("auto") }
    LazyColumn(modifier, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Column {
                ExprInput(text, { text = it }, label = when (type) { "param" -> "x(t); y(t)"; "polar" -> "r(θ) — use t or θ"; else -> "y = f(x)" }, placeholder = when (type) { "param" -> "cos(3t); sin(2t)"; "polar" -> "1 + cos(t)"; else -> "x^2 - 2" },
                    onDone = { if (vm.add(text, if (type == "auto") vm.detectType(text) else type)) text = "" }, keys = listOf("x", "t", "^", "(", ")", "√", "π", "sin", "cos", "tan", "ln", "abs", ";"))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ChipRow(listOf("auto", "y", "param", "polar"), type, { type = it }, { mapOf("auto" to "Auto", "y" to "y = f(x)", "param" to "Parametric", "polar" to "Polar")[it]!! }, Modifier.weight(1f))
                    FilledIconButton(onClick = { if (vm.add(text, if (type == "auto") vm.detectType(text) else type)) text = "" }) { Icon(Icons.Filled.Add, "Add function") }
                }
            }
        }
        if (fns.isEmpty()) item { Text("Add a function to start plotting. Examples: x^3 - 3x, 1/(x-1), cos(3t); sin(2t), 1 + cos(t) (polar).", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        items(fns, key = { it.id }) { g -> FunctionRow(vm, g) }
    }
}

@Composable
private fun FunctionRow(vm: GraphViewModel, g: GFun) {
    var editing by remember { mutableStateOf(false) }
    var edit by remember(g.id) { mutableStateOf(g.fn.text) }
    val col = Color(g.fn.color)
    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(if (g.fn.visible) col else Color.Transparent).clickable { vm.recolor(g.id) }.semantics { contentDescription = "Change color" })
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f).clickable { editing = !editing }) {
                    Text((if (g.fn.type == "y") "y = " else if (g.fn.type == "polar") "r = " else "") + g.fn.text.substringAfter(if (g.fn.type != "param" && g.fn.text.contains('=')) "=" else "\u0000"), fontFamily = MonoFamily, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(when (g.fn.type) { "param" -> "parametric, t ∈ [${LimitSolver.fmt(g.fn.tMin)}, ${LimitSolver.fmt(g.fn.tMax)}]"; "polar" -> "polar, θ ∈ [${LimitSolver.fmt(g.fn.tMin)}, ${LimitSolver.fmt(g.fn.tMax)}]"; else -> "function of x" },
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { vm.toggle(g.id) }) { Icon(if (g.fn.visible) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff, if (g.fn.visible) "Hide" else "Show") }
                IconButton(onClick = { vm.remove(g.id) }) { Icon(Icons.Outlined.Delete, "Remove function") }
            }
            g.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (editing) {
                OutlinedTextField(edit, { edit = it; vm.update(g.id, it) }, Modifier.fillMaxWidth(), singleLine = true, textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily))
                if (g.fn.type != "y") {
                    var t0 by remember { mutableStateOf(LimitSolver.fmt(g.fn.tMin)) }; var t1 by remember { mutableStateOf(LimitSolver.fmt(g.fn.tMax)) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        NumberField("t min", t0, { t0 = it; runCatching { vm.setRange(g.id, parseBound(it), g.fn.tMax) } }, Modifier.weight(1f))
                        NumberField("t max", t1, { t1 = it; runCatching { vm.setRange(g.id, g.fn.tMin, parseBound(it)) } }, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun AnalysisSheet(vm: GraphViewModel, onDismiss: () -> Unit) {
    val r by vm.showRoots.collectAsStateWithLifecycle(); val e by vm.showExtrema.collectAsStateWithLifecycle()
    val i by vm.showIntersections.collectAsStateWithLifecycle(); val a by vm.showAsymptotes.collectAsStateWithLifecycle()
    val pts by vm.analysis.collectAsStateWithLifecycle()
    val va by vm.vAsymptotes.collectAsStateWithLifecycle(); val ha by vm.hAsymptotes.collectAsStateWithLifecycle()
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Analysis", style = MaterialTheme.typography.titleLarge)
            SwitchRow("Roots", r, { vm.showRoots.value = it })
            SwitchRow("Maxima & minima", e, { vm.showExtrema.value = it })
            SwitchRow("Intersections", i, { vm.showIntersections.value = it })
            SwitchRow("Asymptotes", a, { vm.showAsymptotes.value = it }, "Vertical: |f| → ∞; horizontal: numeric limits at ±∞")
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("In the current window", style = MaterialTheme.typography.titleSmall)
            LazyColumn(Modifier.heightIn(max = 320.dp)) {
                items(pts) { p -> KeyValue(p.label, "(${LimitSolver.fmt(p.x)}, ${LimitSolver.fmt(p.y)})") }
                items(va) { (x, _) -> KeyValue("vertical asymptote", "x = ${LimitSolver.fmt(x)}") }
                items(ha) { (y, _) -> KeyValue("horizontal asymptote", "y = ${LimitSolver.fmt(y)}") }
            }
            Text("Points are found numerically on the visible x-range (Brent's method on sign changes and on f′). Pan or zoom to search elsewhere. Only y = f(x) curves are analysed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun ProjectsSheet(vm: GraphViewModel, onDismiss: () -> Unit) {
    val projects by vm.projects.collectAsStateWithLifecycle()
    var name by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Graph projects", style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(name, { name = it }, Modifier.weight(1f), label = { Text("Name") }, singleLine = true)
                Spacer(Modifier.width(8.dp))
                Button(onClick = { vm.saveProject(name); name = "" }) { Text("Save") }
            }
            if (projects.isEmpty()) Text("No saved projects yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
            LazyColumn(Modifier.heightIn(max = 400.dp)) {
                items(projects, key = { it.id }) { p ->
                    ListItem(headlineContent = { Text(p.name) }, supportingContent = { Text(java.text.DateFormat.getDateTimeInstance().format(java.util.Date(p.updatedAt))) },
                        trailingContent = { Row {
                            IconButton(onClick = { vm.saveProject(p.name, p) }) { Icon(Icons.Outlined.Save, "Overwrite with current graph") }
                            IconButton(onClick = { vm.deleteProject(p) }) { Icon(Icons.Outlined.Delete, "Delete project") }
                        } },
                        modifier = Modifier.clickable { vm.loadProject(p); onDismiss() })
                }
            }
        }
    }
}
