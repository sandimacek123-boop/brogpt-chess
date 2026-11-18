package com.quantumath.app.ui.screens

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.container
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.LocalReduceMotion
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.Share
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.fractal.Fractal
import com.quantumath.math.fractal.FractalView
import com.quantumath.math.plot.Viewport
import com.quantumath.math.symbolic.LimitSolver
import kotlinx.coroutines.*
import kotlin.math.*

class VizViewModel(val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var mView by mutableStateOf(FractalView(-0.6, 0.0, 3.2 / 600))
    var jView by mutableStateOf(FractalView(0.0, 0.0, 3.2 / 600))
    var iter by mutableStateOf(300f)
    var palette by mutableStateOf(0)
    var cRe by mutableStateOf(-0.8f); var cIm by mutableStateOf(0.156f)
    var chaos by mutableStateOf("Logistic map")
    var r by mutableStateOf(3.7f)
    var sigma by mutableStateOf(10f); var rho by mutableStateOf(28f); var beta by mutableStateOf(8f / 3)
    var anim by mutableStateOf("Fourier series")
    var terms by mutableStateOf(5f)
    var riemannN by mutableStateOf(8f); var rule by mutableStateOf("Midpoint")
    var lissA by mutableStateOf(3f); var lissB by mutableStateOf(2f)
    var taylorFn by mutableStateOf("sin(x)")
}

private val Palettes = listOf("Nebula", "Inferno", "Ocean", "Aurora", "Mono")

/** Cosine-gradient palettes; t in [0, 1). */
private fun paletteColor(p: Int, t: Double): Int {
    fun ch(a: Double, b: Double, c: Double, d: Double) = (255 * (a + b * cos(2 * PI * (c * t + d))).coerceIn(0.0, 1.0)).toInt()
    val (r, g, b) = when (p) {
        0 -> Triple(ch(0.5, 0.5, 1.0, 0.75), ch(0.4, 0.4, 1.0, 0.95), ch(0.7, 0.3, 1.0, 0.15))
        1 -> Triple(ch(0.6, 0.4, 1.0, 0.0), ch(0.35, 0.35, 1.0, 0.15), ch(0.15, 0.15, 1.0, 0.35))
        2 -> Triple(ch(0.2, 0.2, 1.0, 0.5), ch(0.5, 0.4, 1.0, 0.25), ch(0.7, 0.3, 1.0, 0.1))
        3 -> Triple(ch(0.4, 0.4, 1.0, 0.3), ch(0.6, 0.4, 1.0, 0.0), ch(0.5, 0.5, 1.0, 0.6))
        else -> { val v = (255 * (0.5 + 0.5 * cos(2 * PI * t))).toInt(); Triple(v, v, v) }
    }
    return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
}

@Composable
fun VisualizationScreen(nav: NavHostController) {
    val vm = appViewModel { VizViewModel(it) }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Visualization studio", onBack = { nav.popBackStack() })
        PrimaryScrollableTabRow(selectedTabIndex = vm.tab, edgePadding = 16.dp, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Mandelbrot", "Julia", "Chaos", "Animations").forEachIndexed { i, t -> Tab(vm.tab == i, { vm.tab = i }, text = { Text(t) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            when (vm.tab) {
                0 -> FractalPanel(vm, julia = false)
                1 -> FractalPanel(vm, julia = true)
                2 -> ChaosPanel(vm)
                else -> AnimationsPanel(vm)
            }
        }
    }
}

@Composable
private fun FractalPanel(vm: VizViewModel, julia: Boolean) {
    val ctx = LocalContext.current
    var size by remember { mutableStateOf(IntSize.Zero) }
    var image by remember { mutableStateOf<ImageBitmap?>(null) }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var progress by remember { mutableStateOf(0f) }
    val view = if (julia) vm.jView else vm.mView
    val maxIter = vm.iter.roundToInt()
    // render at most ~640 px on the long side; progressive passes 8 → 4 → 2 → 1
    LaunchedEffect(view, size, maxIter, vm.palette, julia, vm.cRe, vm.cIm) {
        if (size.width <= 0) return@LaunchedEffect
        delay(40)
        val k = max(1.0, max(size.width, size.height) / 640.0)
        val w = (size.width / k).toInt(); val h = (size.height / k).toInt()
        val scale = view.scale * k
        val v = FractalView(view.centerX, view.centerY, scale)
        val out = FloatArray(w * h)
        val pixels = IntArray(w * h)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        for (step in intArrayOf(8, 4, 2, 1)) {
            withContext(Dispatchers.Default) {
                val bands = 8
                (0 until bands).map { b ->
                    async {
                        val r0 = h * b / bands; val r1 = h * (b + 1) / bands
                        var y = r0 - (r0 % step)
                        while (y < r1) {
                            ensureActive()
                            val ye = min(r1, y + step * 4)
                            if (julia) Fractal.juliaRows(out, w, h, v, vm.cRe.toDouble(), vm.cIm.toDouble(), maxIter, y, ye, step) else Fractal.mandelbrotRows(out, w, h, v, maxIter, y, ye, step)
                            y = ye
                        }
                    }
                }.awaitAll()
                for (i in out.indices) { val s = out[i]; pixels[i] = if (s < 0) 0xFF05050A.toInt() else paletteColor(vm.palette, (sqrt(s.toDouble()) * 0.11) % 1.0) }
                bmp.setPixels(pixels, 0, w, 0, 0, w, h)
            }
            image = bmp.copy(Bitmap.Config.ARGB_8888, false).asImageBitmap()
            bitmap = bmp
            progress = when (step) { 8 -> 0.25f; 4 -> 0.5f; 2 -> 0.75f; else -> 1f }
        }
        vm.c.unlock("fractal")
    }
    val zoom = 3.2 / (view.scale * max(1, size.width))
    Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp))
        .onSizeChanged { if (it != size) { val old = size; size = it; if (old.width == 0) { val s = 3.2 / it.width; if (julia) vm.jView = vm.jView.copy(scale = s) else vm.mView = vm.mView.copy(scale = s) } } }
        .pointerInput(julia) {
            detectTransformGestures { centroid, pan, zoomBy, _ ->
                val v0 = if (julia) vm.jView else vm.mView
                val wx = v0.centerX + (centroid.x - size.width / 2.0) * v0.scale; val wy = v0.centerY + (centroid.y - size.height / 2.0) * v0.scale
                val ns = (v0.scale / zoomBy).coerceIn(1e-15, 0.05)
                val ncx = wx - (centroid.x - size.width / 2.0) * ns - pan.x * ns
                val ncy = wy - (centroid.y - size.height / 2.0) * ns - pan.y * ns
                val nv = FractalView(ncx, ncy, ns)
                if (julia) vm.jView = nv else vm.mView = nv
            }
        }
        .pointerInput(julia) {
            detectTapGestures(onDoubleTap = { o ->
                val v0 = if (julia) vm.jView else vm.mView
                val nv = FractalView(v0.centerX + (o.x - size.width / 2.0) * v0.scale, v0.centerY + (o.y - size.height / 2.0) * v0.scale, (v0.scale / 2.5).coerceAtLeast(1e-15))
                if (julia) vm.jView = nv else vm.mView = nv
            })
        }
        .semantics { contentDescription = "${if (julia) "Julia" else "Mandelbrot"} set. Pinch or double-tap to zoom, drag to pan." }
    ) {
        image?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds, filterQuality = FilterQuality.Low) }
        if (progress < 1f) LinearProgressIndicator(progress = { progress }, Modifier.fillMaxWidth().align(Alignment.TopCenter))
    }
    Text("Center ${"%.10f".format(view.centerX)} ${if (view.centerY > 0) "−" else "+"} ${"%.10f".format(abs(view.centerY))}i · zoom ×${"%.3g".format(zoom)}", style = MaterialTheme.typography.labelMedium, fontFamily = MonoFamily, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (view.scale < 1e-13) InfoPanel("At this depth double-precision arithmetic runs out of digits (~10⁻¹³ per pixel); the image will become blocky.", icon = Icons.Outlined.Warning)
    Text("Iterations: $maxIter", style = MaterialTheme.typography.labelLarge)
    Slider(vm.iter, { vm.iter = it }, valueRange = 50f..3000f, modifier = Modifier.semantics { contentDescription = "Maximum iterations" })
    ChipRow(Palettes.indices.toList(), vm.palette, { vm.palette = it }, { Palettes[it] })
    if (julia) {
        Text("c = ${"%.4f".format(vm.cRe)} ${if (vm.cIm < 0) "−" else "+"} ${"%.4f".format(abs(vm.cIm))}i", style = MaterialTheme.typography.labelLarge, fontFamily = MonoFamily)
        Slider(vm.cRe, { vm.cRe = it }, valueRange = -1.5f..1.5f, modifier = Modifier.semantics { contentDescription = "Real part of c" })
        Slider(vm.cIm, { vm.cIm = it }, valueRange = -1.5f..1.5f, modifier = Modifier.semantics { contentDescription = "Imaginary part of c" })
        ExampleChips(listOf("Dendrite", "Rabbit", "San Marco", "Siegel disk", "Dragon"), { n ->
            val (a, b) = when (n) { "Dendrite" -> 0f to 1f; "Rabbit" -> -0.123f to 0.745f; "San Marco" -> -0.75f to 0f; "Siegel disk" -> -0.391f to -0.587f; else -> -0.8f to 0.156f }
            vm.cRe = a; vm.cIm = b
        })
    } else ExampleChips(listOf("Full set", "Seahorse valley", "Elephant valley", "Mini-brot", "Spiral"), { n ->
        val base = 3.2 / max(1, size.width)
        vm.mView = when (n) {
            "Seahorse valley" -> FractalView(-0.7453, 0.1127, base / 150); "Elephant valley" -> FractalView(0.2759, 0.0067, base / 120)
            "Mini-brot" -> FractalView(-1.7497, 0.0, base / 300); "Spiral" -> FractalView(-0.761574, -0.0847596, base / 2500)
            else -> FractalView(-0.6, 0.0, base)
        }
    })
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(onClick = { val s = 3.2 / max(1, size.width); if (julia) vm.jView = FractalView(0.0, 0.0, s) else vm.mView = FractalView(-0.6, 0.0, s) }) { Text("Reset view") }
        OutlinedButton(onClick = { bitmap?.let { Share.image(ctx, it, if (julia) "julia" else "mandelbrot") } }) { Icon(Icons.Outlined.Share, null); Spacer(Modifier.width(6.dp)); Text("Share image") }
    }
    InfoPanel(if (julia) "Julia set J(c): points z whose orbit under z ↦ z² + c stays bounded. Connected exactly when c lies in the Mandelbrot set." else "Mandelbrot set: values c for which z ↦ z² + c starting from 0 stays bounded. Colours show a smooth escape count; black points did not escape within the iteration limit.")
}

@Composable
private fun ChaosPanel(vm: VizViewModel) {
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    ChipRow(listOf("Logistic map", "Lorenz attractor"), vm.chaos, { vm.chaos = it }, { it })
    if (vm.chaos == "Logistic map") {
        val data by produceState<List<Pair<Double, DoubleArray>>>(emptyList()) { value = withContext(Dispatchers.Default) { Fractal.logisticBifurcation(2.5, 4.0, 700, 160) } }
        Canvas(Modifier.fillMaxWidth().aspectRatio(1.3f).clip(RoundedCornerShape(16.dp)).semantics { contentDescription = "Bifurcation diagram of the logistic map for r from 2.5 to 4" }) {
            drawRect(if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFCFCFF))
            val m = Mapper(Viewport(2.5, 4.0, 0.0, 1.0), size.width, size.height)
            drawGrid(m, lab, tm)
            val col = lab.accent.copy(alpha = 0.35f)
            for ((rr, xs) in data) { val px = m.sx(rr); for (x in xs) drawRect(col, Offset(px, m.sy(x)), androidx.compose.ui.geometry.Size(1.5f, 1.5f)) }
            drawLine(lab.warning, Offset(m.sx(vm.r.toDouble()), 0f), Offset(m.sx(vm.r.toDouble()), size.height), 2f)
        }
        Text("r = ${"%.4f".format(vm.r)}", style = MaterialTheme.typography.labelLarge, fontFamily = MonoFamily)
        Slider(vm.r, { vm.r = it }, valueRange = 2.5f..4f, modifier = Modifier.semantics { contentDescription = "Growth rate r" })
        val series = remember(vm.r) { var x = 0.2; List(60) { val v = x; x = vm.r * x * (1 - x); v } }
        MiniPlot(emptyList(), Viewport(0.0, 60.0, 0.0, 1.0), height = 160.dp, description = "Time series of the logistic map", extraDraw = { m ->
            for (i in 1 until series.size) drawLine(lab.accent2, Offset(m.sx(i - 1.0), m.sy(series[i - 1])), Offset(m.sx(i.toDouble()), m.sy(series[i])), 2f)
            for (i in series.indices) drawCircle(lab.accent2, 3f, Offset(m.sx(i.toDouble()), m.sy(series[i])))
        })
        InfoPanel("xₙ₊₁ = r·xₙ(1 − xₙ). The fixed point loses stability at r = 3; period doubling accumulates near r ≈ 3.5699 (Feigenbaum), after which chaos is interrupted by windows such as period 3 near r ≈ 3.83.")
    } else {
        val reduce = LocalReduceMotion.current
        var shown by remember { mutableStateOf(if (reduce) 12000 else 0) }
        var playing by remember { mutableStateOf(!reduce) }
        val pts = remember(vm.sigma, vm.rho, vm.beta) { lorenz(vm.sigma.toDouble(), vm.rho.toDouble(), vm.beta.toDouble(), 12000) }
        LaunchedEffect(pts) { shown = if (reduce) pts.size else 0 }
        LaunchedEffect(playing, pts) { while (playing && shown < pts.size) { withFrameNanos { }; shown = min(pts.size, shown + 40) } }
        Canvas(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(16.dp)).semantics { contentDescription = "Lorenz attractor projected on the x–z plane" }) {
            drawRect(if (lab.dark) Color(0xFF05050A) else Color(0xFFFCFCFF))
            val xs = pts.map { it.first }; val zs = pts.map { it.third }
            val m = Mapper(Viewport((xs.minOrNull() ?: -20.0) - 2, (xs.maxOrNull() ?: 20.0) + 2, (zs.minOrNull() ?: 0.0) - 2, (zs.maxOrNull() ?: 50.0) + 2), size.width, size.height)
            val path = Path()
            for (i in 0 until shown) { val (x, _, z) = pts[i]; if (i == 0) path.moveTo(m.sx(x), m.sy(z)) else path.lineTo(m.sx(x), m.sy(z)) }
            drawPath(path, Brush.linearGradient(listOf(lab.accent, lab.accent2)), style = Stroke(1.4f))
            if (shown > 0) { val (x, _, z) = pts[shown - 1]; drawCircle(lab.warning, 6f, Offset(m.sx(x), m.sy(z))) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (shown >= pts.size) shown = 0; playing = !playing }) { Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause" else "Play") }
            Text("${shown} / ${pts.size} RK4 steps (dt = 0.005)", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("σ = ${"%.2f".format(vm.sigma)}", style = MaterialTheme.typography.labelLarge); Slider(vm.sigma, { vm.sigma = it }, valueRange = 1f..20f)
        Text("ρ = ${"%.2f".format(vm.rho)}", style = MaterialTheme.typography.labelLarge); Slider(vm.rho, { vm.rho = it }, valueRange = 1f..50f)
        Text("β = ${"%.3f".format(vm.beta)}", style = MaterialTheme.typography.labelLarge); Slider(vm.beta, { vm.beta = it }, valueRange = 0.5f..5f)
        InfoPanel("x′ = σ(y − x), y′ = x(ρ − z) − y, z′ = xy − βz, integrated with 4th-order Runge–Kutta from (1, 1, 1). Classic chaotic values: σ = 10, ρ = 28, β = 8/3.")
    }
}

private fun lorenz(s: Double, r: Double, b: Double, n: Int): List<Triple<Double, Double, Double>> {
    var x = 1.0; var y = 1.0; var z = 1.0; val dt = 0.005
    fun f(x: Double, y: Double, z: Double) = Triple(s * (y - x), x * (r - z) - y, x * y - b * z)
    return List(n) {
        val k1 = f(x, y, z); val k2 = f(x + dt / 2 * k1.first, y + dt / 2 * k1.second, z + dt / 2 * k1.third)
        val k3 = f(x + dt / 2 * k2.first, y + dt / 2 * k2.second, z + dt / 2 * k2.third); val k4 = f(x + dt * k3.first, y + dt * k3.second, z + dt * k3.third)
        x += dt / 6 * (k1.first + 2 * k2.first + 2 * k3.first + k4.first); y += dt / 6 * (k1.second + 2 * k2.second + 2 * k3.second + k4.second); z += dt / 6 * (k1.third + 2 * k2.third + 2 * k3.third + k4.third)
        Triple(x, y, z)
    }
}

@Composable
private fun AnimationsPanel(vm: VizViewModel) {
    val lab = LocalLab.current
    val reduce = LocalReduceMotion.current
    var playing by remember { mutableStateOf(false) }
    var phase by remember { mutableStateOf(0.0) }
    ChipRow(listOf("Fourier series", "Taylor series", "Riemann sums", "Lissajous"), vm.anim, { vm.anim = it; playing = false }, { it })
    LaunchedEffect(playing, vm.anim) {
        var last = 0L
        while (playing) {
            val t = withFrameNanos { it }
            if (last != 0L) {
                val dt = (t - last) / 1e9
                when (vm.anim) {
                    "Fourier series" -> { phase += dt; if (phase > 0.35) { phase = 0.0; vm.terms = if (vm.terms >= 40f) 1f else vm.terms + 1f } }
                    "Taylor series" -> { phase += dt; if (phase > 0.6) { phase = 0.0; vm.terms = if (vm.terms >= 15f) 1f else vm.terms + 1f } }
                    "Riemann sums" -> { phase += dt; if (phase > 0.4) { phase = 0.0; vm.riemannN = if (vm.riemannN >= 64f) 1f else vm.riemannN * 2 } }
                    else -> phase += dt * 0.8
                }
            }
            last = t
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        FilledTonalButton(onClick = { playing = !playing }, enabled = !reduce) { Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text(if (playing) "Pause" else "Animate") }
        if (reduce) Text("  Animations are off (Reduce motion). Use the sliders.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    when (vm.anim) {
        "Fourier series" -> {
            val n = vm.terms.roundToInt()
            val square: (Double) -> Double = { x -> if (sin(x) >= 0) 1.0 else -1.0 }
            val partial: (Double) -> Double = { x -> var s = 0.0; for (k in 0 until n) { val m = 2 * k + 1; s += sin(m * x) / m }; 4 / PI * s }
            MiniPlot(listOf(PlotCurve(square, lab.axis, dashed = true), PlotCurve(partial, lab.accent)), Viewport(-2 * PI, 2 * PI, -1.6, 1.6), height = 240.dp, description = "Square wave and its Fourier partial sum with $n terms")
            Text("$n odd harmonics:  (4/π) Σ sin((2k+1)x)/(2k+1)", fontFamily = MonoFamily, style = MaterialTheme.typography.bodyMedium)
            Slider(vm.terms, { vm.terms = it }, valueRange = 1f..40f, steps = 38)
            InfoPanel("The overshoot near each jump never disappears — it tends to about 9% of the jump (the Gibbs phenomenon) while the wiggles get narrower.")
        }
        "Taylor series" -> {
            ChipRow(listOf("sin(x)", "cos(x)", "e^x", "ln(1+x)", "1/(1-x)"), vm.taylorFn, { vm.taylorFn = it }, { it })
            val deg = vm.terms.roundToInt().coerceAtMost(15)
            val coeffs: (Int) -> Double = { k -> when (vm.taylorFn) {
                "sin(x)" -> if (k % 2 == 0) 0.0 else (if ((k / 2) % 2 == 0) 1.0 else -1.0) / fact(k)
                "cos(x)" -> if (k % 2 == 1) 0.0 else (if ((k / 2) % 2 == 0) 1.0 else -1.0) / fact(k)
                "e^x" -> 1.0 / fact(k)
                "ln(1+x)" -> if (k == 0) 0.0 else (if (k % 2 == 1) 1.0 else -1.0) / k
                else -> 1.0
            } }
            val f = Evaluator(strict = false).function(Parser.parse(vm.taylorFn))
            val p: (Double) -> Double = { x -> var s = 0.0; var xp = 1.0; for (k in 0..deg) { s += coeffs(k) * xp; xp *= x }; s }
            MiniPlot(listOf(PlotCurve(f, lab.axis, dashed = true), PlotCurve(p, lab.accent2)), Viewport(-6.0, 6.0, -4.0, 4.0), height = 240.dp, description = "Function and its Taylor polynomial of degree $deg")
            Text("Taylor polynomial of degree $deg about 0", style = MaterialTheme.typography.bodyMedium)
            Slider(vm.terms.coerceAtMost(15f), { vm.terms = it }, valueRange = 1f..15f, steps = 13)
            if (vm.taylorFn == "ln(1+x)" || vm.taylorFn == "1/(1-x)") InfoPanel("This series converges only for |x| < 1 (radius of convergence 1): outside, adding terms makes the approximation worse.")
        }
        "Riemann sums" -> {
            val n = vm.riemannN.roundToInt().coerceAtLeast(1)
            val f: (Double) -> Double = { x -> x * x }
            val a = 0.0; val b = 2.0; val w = (b - a) / n
            val xs = (0 until n).map { i -> when (vm.rule) { "Left" -> a + i * w; "Right" -> a + (i + 1) * w; else -> a + (i + 0.5) * w } }
            val sum = xs.sumOf { f(it) * w }
            ChipRow(listOf("Left", "Midpoint", "Right"), vm.rule, { vm.rule = it }, { it })
            MiniPlot(listOf(PlotCurve(f, lab.accent)), Viewport(-0.2, 2.3, -0.4, 4.6), height = 240.dp, description = "Riemann sum with $n rectangles", extraDraw = { m ->
                for (i in 0 until n) { val x0 = a + i * w; val h = f(xs[i])
                    drawRect(lab.accent2.copy(alpha = 0.3f), Offset(m.sx(x0), m.sy(h)), androidx.compose.ui.geometry.Size(m.sx(x0 + w) - m.sx(x0), m.sy(0.0) - m.sy(h)))
                    drawRect(lab.accent2, Offset(m.sx(x0), m.sy(h)), androidx.compose.ui.geometry.Size(m.sx(x0 + w) - m.sx(x0), m.sy(0.0) - m.sy(h)), style = Stroke(1.2f)) }
            })
            KeyValue("Rectangles n", n.toString()); KeyValue("${vm.rule} sum", LimitSolver.fmt(sum)); KeyValue("Exact ∫₀² x² dx", "8/3 ≈ 2.66666666667"); KeyValue("Error", LimitSolver.fmt(sum - 8.0 / 3))
            Slider(vm.riemannN, { vm.riemannN = it }, valueRange = 1f..128f)
        }
        else -> {
            val a = vm.lissA.roundToInt(); val b = vm.lissB.roundToInt()
            val pts = remember(a, b, phase) { com.quantumath.math.plot.Plotter.parametric({ t -> sin(a * t + phase) }, { t -> sin(b * t) }, 0.0, 2 * PI, 800) }
            MiniPlot(emptyList(), Viewport(-1.3, 1.3, -1.3, 1.3), height = 280.dp, description = "Lissajous curve with frequencies $a and $b", extraDraw = { m -> drawPolylines(m, pts, lab.accent, 3f) })
            Text("x = sin(${a}t + δ), y = sin(${b}t)", fontFamily = MonoFamily)
            Text("a = $a", style = MaterialTheme.typography.labelLarge); Slider(vm.lissA, { vm.lissA = it }, valueRange = 1f..9f, steps = 7)
            Text("b = $b", style = MaterialTheme.typography.labelLarge); Slider(vm.lissB, { vm.lissB = it }, valueRange = 1f..9f, steps = 7)
        }
    }
}

private fun fact(k: Int): Double { var r = 1.0; for (i in 2..k) r *= i; return r }
