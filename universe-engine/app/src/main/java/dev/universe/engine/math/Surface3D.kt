package dev.universe.engine.math

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Expr
import dev.universe.engine.core.ui.*
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

private val SURFACES = listOf(
    "Ripple" to "sin(sqrt(x^2+y^2) - t)", "Saddle" to "(x^2 - y^2)/4", "Gaussian" to "3e^(-(x^2+y^2)/5)", "Egg carton" to "sin(x) cos(y)",
    "Monkey saddle" to "(x^3 - 3x y^2)/12", "Sinc" to "4 sinc(sqrt(x^2+y^2))", "Standing wave" to "cos(x) cos(y) sin(t)", "Paraboloid" to "(x^2 + y^2)/5 - 2", "Cone" to "sqrt(x^2+y^2) - 2",
)

private val SurfaceInfo = LabInfo(
    equations = listOf(
        "z = f(x, y)",
        "\\nabla f = \\left(\\frac{\\partial f}{\\partial x},\\, \\frac{\\partial f}{\\partial y}\\right)",
        "z \\approx f(x_0,y_0) + f_x\\,(x-x_0) + f_y\\,(y-y_0)",
    ),
    about = "A function of two variables is a landscape. Drag to orbit, pinch to zoom. The probe shows the partial derivatives at a point — the slopes along x and y — and the tangent plane they define, which is the best flat approximation of the surface there. Use t in your formula to animate it.",
    notes = listOf(
        "The surface is sampled on a regular grid and drawn as flat quadrilaterals from back to front (painter's algorithm), so very steep or discontinuous functions look faceted.",
        "Partial derivatives are central finite differences, not symbolic derivatives.",
        "Heights outside ±1.5× the plotting range are clipped so that poles do not swamp the view.",
    ),
)

@Composable
fun SurfaceLab() {
    val app = LocalApp.current
    val n = when (app.prefs.quality) { 0 -> 24; 2 -> 44; else -> 32 }
    var field by remember { mutableStateOf(TextFieldValue(SURFACES[0].second)) }
    var expr by remember { mutableStateOf(Expr.parse(SURFACES[0].second)) }
    var error by remember { mutableStateOf<String?>(null) }
    var range by remember { mutableFloatStateOf(6f) }
    var zScale by remember { mutableFloatStateOf(1f) }
    var wire by remember { mutableStateOf(true) }
    var probe by remember { mutableStateOf(false) }
    var px by remember { mutableFloatStateOf(1.5f) }
    var py by remember { mutableFloatStateOf(1f) }
    val cam = remember { Cam3(0.7f, 0.55f, 15f, 1.9f) }
    val time by rememberTime(expr.uses("t"))
    val tm = rememberTextMeasurer(cacheSize = 16)
    val focus = LocalFocusManager.current
    val zs = remember(n) { FloatArray((n + 1) * (n + 1)) }
    val sx = remember(n) { FloatArray((n + 1) * (n + 1)) }
    val sy = remember(n) { FloatArray((n + 1) * (n + 1)) }
    val path = remember { Path() }
    val out = remember { FloatArray(4) }

    fun setText(v: TextFieldValue) {
        field = v
        val (e, err) = Expr.tryParse(v.text)
        if (e != null) expr = e
        error = err
    }
    fun f(x: Double, y: Double): Double = expr.eval(x, y, t = time.toDouble())

    LabScaffold("Surface Explorer", Domain.Math, SurfaceInfo, canvas = {
        Canvas(Modifier.fillMaxSize().orbitGestures(cam, 6f, 40f) { focus.clearFocus() }) {
            cam.begin(size.width, size.height, 0.52f)
            val r = range
            val clip = r * 1.5f
            val k = 5f / r // world scaling so the plotted square always spans 10 units
            var zmin = Float.MAX_VALUE; var zmax = -Float.MAX_VALUE
            for (j in 0..n) for (i in 0..n) {
                val x = -r + 2 * r * i / n; val y = -r + 2 * r * j / n
                var z = f(x.toDouble(), y.toDouble()).toFloat()
                if (z.isNaN()) z = 0f
                z = z.coerceIn(-clip, clip)
                zs[j * (n + 1) + i] = z
                if (z < zmin) zmin = z; if (z > zmax) zmax = z
                cam.project(x * k, z * k * zScale, y * k, out)
                sx[j * (n + 1) + i] = out[0]; sy[j * (n + 1) + i] = out[1]
            }
            val zr = max(zmax - zmin, 1e-4f)
            // floor frame
            val corners = arrayOf(floatArrayOf(-5f, -5f), floatArrayOf(5f, -5f), floatArrayOf(5f, 5f), floatArrayOf(-5f, 5f))
            val floorY = (zmin * k * zScale).coerceAtMost(0f) - 0.4f
            for (c in 0 until 4) {
                val a = corners[c]; val b = corners[(c + 1) % 4]
                cam.project(a[0], floorY, a[1], out); val p0 = Offset(out[0], out[1])
                cam.project(b[0], floorY, b[1], out); val p1 = Offset(out[0], out[1])
                drawLine(Color.White.copy(alpha = 0.18f), p0, p1, 1f)
            }
            cam.project(5.6f, floorY, -5f, out); label(tm, "x", out[0], out[1], UE.Cyan, 12f, 0.5f, 0.5f, UE.Math)
            cam.project(-5f, floorY, 5.6f, out); label(tm, "y", out[0], out[1], UE.Violet, 12f, 0.5f, 0.5f, UE.Math)
            // back-to-front traversal from the camera's side of the grid
            val cdx = -sin(cam.yaw); val cdz = cos(cam.yaw)
            val iAsc = cdx > 0; val jAsc = cdz > 0
            val outerJ = abs(cdz) > abs(cdx)
            val lineC = Color.White.copy(alpha = 0.16f)
            for (o in 0 until n) for (q in 0 until n) {
                val i = if (outerJ) (if (iAsc) q else n - 1 - q) else (if (iAsc) o else n - 1 - o)
                val j = if (outerJ) (if (jAsc) o else n - 1 - o) else (if (jAsc) q else n - 1 - q)
                val a = j * (n + 1) + i; val b = a + 1; val c = a + n + 2; val d = a + n + 1
                val zc = (zs[a] + zs[b] + zs[c] + zs[d]) / 4
                // cheap Lambert term from the facet's slope
                val dzx = (zs[b] - zs[a]) * n / (2 * r); val dzy = (zs[d] - zs[a]) * n / (2 * r)
                val light = (0.62f + 0.38f * ((-0.5f * dzx - 0.3f * dzy + 1f) / sqrt(dzx * dzx + dzy * dzy + 1f))).coerceIn(0.25f, 1.15f)
                val base = UE.ramp(((zc - zmin) / zr) * 0.92f + 0.04f)
                path.rewind()
                path.moveTo(sx[a], sy[a]); path.lineTo(sx[b], sy[b]); path.lineTo(sx[c], sy[c]); path.lineTo(sx[d], sy[d]); path.close()
                drawPath(path, lerp(Color.Black, base, light.coerceAtMost(1f)).copy(alpha = 0.93f))
                if (wire) drawPath(path, lineC, style = Stroke(1f))
            }
            if (probe) {
                val x0 = px.toDouble(); val y0 = py.toDouble()
                val z0 = f(x0, y0).toFloat()
                val h = 1e-4
                val fx = ((f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)).toFloat()
                val fy = ((f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)).toFloat()
                val e = r * 0.28f
                val pts = arrayOf(floatArrayOf(-e, -e), floatArrayOf(e, -e), floatArrayOf(e, e), floatArrayOf(-e, e))
                path.rewind()
                for ((idx, p) in pts.withIndex()) {
                    cam.project((px + p[0]) * k, (z0 + fx * p[0] + fy * p[1]) * k * zScale, (py + p[1]) * k, out)
                    if (idx == 0) path.moveTo(out[0], out[1]) else path.lineTo(out[0], out[1])
                }
                path.close()
                drawPath(path, UE.Amber.copy(alpha = 0.28f)); drawPath(path, UE.Amber, style = Stroke(1.5.dp.toPx()))
                cam.project(px * k, z0 * k * zScale, py * k, out)
                val p0 = Offset(out[0], out[1])
                val gl = sqrt(fx * fx + fy * fy).coerceAtLeast(1e-4f)
                cam.project((px + fx / gl * e) * k, (z0 + gl * e) * k * zScale, (py + fy / gl * e) * k, out)
                arrow(p0, Offset(out[0], out[1]), UE.Magenta, 2.dp.toPx(), 10.dp.toPx())
                glowDot(p0, UE.Amber, 5.dp.toPx())
            }
        }
    }) {
        UEField(field, ::setText, Modifier.fillMaxWidth(), prefix = "z =", error = error != null)
        error?.let { T(it, size = 12.sp, color = UE.Red) }
        ChipRow(SURFACES.map { it.first }, SURFACES.indexOfFirst { it.second == field.text }) { i -> setText(TextFieldValue(SURFACES[i].second, TextRange(SURFACES[i].second.length))); focus.clearFocus() }
        UESlider("Domain  −R ≤ x, y ≤ R", range, 2f..12f, format = { "R = ${fix(it, 1)}" }) { range = it }
        UESlider("Vertical exaggeration", zScale, 0.2f..3f, format = { "×${fix(it, 2)}" }) { zScale = it }
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Toggle("Wireframe", wire) { wire = it }
            Toggle("Tangent plane probe", probe, accent = UE.Amber) { probe = it }
        }
        if (probe) {
            UESlider("x₀", px, -range..range, accent = UE.Amber, format = { fix(it, 2) }) { px = it }
            UESlider("y₀", py, -range..range, accent = UE.Amber, format = { fix(it, 2) }) { py = it }
            val x0 = px.coerceIn(-range, range).toDouble(); val y0 = py.coerceIn(-range, range).toDouble(); val h = 1e-4
            val fx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h); val fy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
            ReadoutRow {
                Stat("f(x₀,y₀)", fmt(f(x0, y0), 4), UE.Amber)
                Stat("∂f/∂x", fmt(fx, 4)); Stat("∂f/∂y", fmt(fy, 4)); Stat("|∇f|", fmt(sqrt(fx * fx + fy * fy), 4), UE.Magenta)
            }
            Note("The magenta arrow points along the gradient: the direction of steepest ascent.")
        }
    }
}
