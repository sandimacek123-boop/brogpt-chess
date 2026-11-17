package dev.universe.engine

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import dev.universe.engine.core.ui.Domain
import dev.universe.engine.core.ui.UE
import dev.universe.engine.core.ui.glowDot
import dev.universe.engine.core.ui.glowPath
import dev.universe.engine.math.*
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

private const val TAU = (2 * PI).toFloat()
private val DrawScope.u: Float get() = size.minDimension
private fun DrawScope.at(x: Float, y: Float) = Offset(size.width * x, size.height * y)

private inline fun DrawScope.curve(c: Color, n: Int = 48, w: Float = 0.045f, glow: Boolean = true, f: (Float) -> Offset) {
    val p = Path()
    for (i in 0..n) { val o = f(i / n.toFloat()); if (i == 0) p.moveTo(o.x, o.y) else p.lineTo(o.x, o.y) }
    if (glow) glowPath(p, c, u * w) else drawPath(p, c, style = Stroke(u * w, cap = StrokeCap.Round))
}

/** Registry of every laboratory in the engine. Order here is the order shown in each field. */
object Labs {
    private val math = listOf(
        LabDef("grapher", Domain.Math, "Function Grapher", "Plot anything. Probe slopes, areas and roots.", { t, c ->
            drawLine(c.copy(alpha = 0.3f), at(0f, 0.5f), at(1f, 0.5f), 1f)
            curve(c) { x -> at(x, 0.5f - 0.32f * sin(x * 7f - t * 2f) * (0.4f + x)) }
        }) { GrapherLab() },
        LabDef("surface", Domain.Math, "Surface Explorer", "Functions of two variables as living 3D landscapes.", { t, c ->
            for (k in 0 until 5) curve(androidx.compose.ui.graphics.lerp(UE.Violet, c, k / 4f), 24, 0.03f, false) { x -> at(0.08f + x * 0.7f + k * 0.045f, 0.82f - k * 0.13f - 0.16f * sin(x * 6f + k * 0.9f - t * 1.6f) * sin(x * PI.toFloat())) }
        }) { SurfaceLab() },
        LabDef("calculus", Domain.Math, "Calculus Lab", "Secants become tangents. Rectangles become areas.", { t, c ->
            val n = 5
            for (i in 0 until n) { val x = 0.1f + 0.8f * i / n; val hgt = 0.2f + 0.5f * sin((i + 0.5f) / n * PI.toFloat()); drawRect(c.copy(alpha = 0.25f), at(x, 0.9f - hgt), Size(size.width * 0.8f / n - 2f, size.height * hgt)) }
            curve(c) { x -> at(0.1f + 0.8f * x, 0.9f - 0.2f - 0.5f * sin(x * PI.toFloat())) }
            val px = 0.5f + 0.3f * sin(t); glowDot(at(0.1f + 0.8f * px, 0.7f - 0.5f * sin(px * PI.toFloat())), Color.White, u * 0.05f)
        }) { CalculusLab() },
        LabDef("series", Domain.Math, "Series and Fourier", "Infinite sums, spinning circles, draw-your-own epicycles.", { t, c ->
            var o = at(0.35f, 0.5f)
            for (k in 0 until 3) { val r = u * 0.26f / (2 * k + 1); val a = (2 * k + 1) * t * 1.4f; drawCircle(c.copy(alpha = 0.4f), r, o, style = Stroke(1.5f)); val n = o + Offset(cos(a) * r, sin(a) * r); drawLine(Color.White, o, n, 1.5f); o = n }
            glowDot(o, UE.Amber, u * 0.045f)
        }) { SeriesLab() },
        LabDef("fractal", Domain.Math, "Fractal Explorer", "Dive a trillion-fold into Mandelbrot and Julia sets.", { t, c ->
            val pts = ArrayList<Offset>()
            for (i in 0 until 26) for (j in 0 until 26) {
                val cr = -2.1f + 2.8f * i / 25; val ci = -1.2f + 2.4f * j / 25
                var zr = 0f; var zi = 0f; var n = 0
                while (n < 14 && zr * zr + zi * zi < 4f) { val q = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = q; n++ }
                if (n == 14) pts += at(0.04f + 0.92f * i / 25, 0.06f + 0.88f * j / 25)
            }
            drawPoints(pts, PointMode.Points, c.copy(alpha = 0.7f + 0.3f * sin(t * 2)), u * 0.05f, StrokeCap.Round)
        }) { FractalLab() },
        LabDef("garden", Domain.Math, "Fractal Garden", "Snowflakes, ferns, dragons and trees from one rule each.", { t, c ->
            fun br(x: Float, y: Float, a: Float, l: Float, d: Int) { val nx = x + sin(a) * l; val ny = y - cos(a) * l; drawLine(c.copy(alpha = 0.4f + d * 0.12f), Offset(x, y), Offset(nx, ny), 1f + d * 0.6f, StrokeCap.Round); if (d > 0) { val sw = 0.5f + 0.08f * sin(t * 1.5f); br(nx, ny, a - sw, l * 0.7f, d - 1); br(nx, ny, a + sw, l * 0.7f, d - 1) } }
            br(size.width / 2, size.height * 0.96f, 0f, u * 0.3f, 4)
        }) { FractalGardenLab() },
        LabDef("golden", Domain.Math, "Golden Ratio", "Fibonacci spirals and the angle sunflowers know.", { t, c ->
            val pts = ArrayList<Offset>()
            for (k in 1..70) { val r = u * 0.055f * sqrt(k.toFloat()); val a = k * 2.39996f + t * 0.3f; pts += center + Offset(cos(a) * r, sin(a) * r) }
            drawPoints(pts, PointMode.Points, c, u * 0.055f, StrokeCap.Round)
        }) { GoldenLab() },
        LabDef("primes", Domain.Math, "Prime Patterns", "Ulam spirals, polar rays and the prime number theorem.", { t, c ->
            val pts = ArrayList<Offset>()
            for (p in intArrayOf(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149)) { val a = p + t * 0.2f; pts += center + Offset(cos(a) * p * u * 0.0031f, sin(a) * p * u * 0.0031f) }
            drawPoints(pts, PointMode.Points, c, u * 0.06f, StrokeCap.Round)
        }) { PrimesLab() },
        LabDef("trig", Domain.Math, "Geometry and Trigonometry", "The unit circle, the Euler line, Lissajous figures.", { t, c ->
            val r = u * 0.36f; drawCircle(c.copy(alpha = 0.5f), r, center, style = Stroke(1.5f))
            val p = center + Offset(cos(t) * r, -sin(t) * r)
            drawLine(UE.Violet, center, Offset(p.x, center.y), u * 0.04f, StrokeCap.Round); drawLine(c, Offset(p.x, center.y), p, u * 0.04f, StrokeCap.Round); drawLine(Color.White, center, p, 1.5f)
            glowDot(p, Color.White, u * 0.045f)
        }) { TrigLab() },
        LabDef("constants", Domain.Math, "Constants: π, e and i", "Throw darts for π. Walk its digits. Meet Euler's identity.", { t, c ->
            drawCircle(c.copy(alpha = 0.5f), u * 0.4f, center, style = Stroke(1.5f))
            val pts = ArrayList<Offset>(); val out = ArrayList<Offset>()
            for (k in 0 until 40) { val x = abs(sin(k * 12.9898f + 1f) * 43758.547f) % 1f; val y = abs(sin(k * 78.233f + 2f) * 12543.123f) % 1f; if (k > ((t * 6) % 40)) continue; val o = at(0.1f + 0.8f * x, 0.1f + 0.8f * y); if ((o - center).getDistance() < u * 0.4f) pts += o else out += o }
            drawPoints(pts, PointMode.Points, c, u * 0.05f, StrokeCap.Round); drawPoints(out, PointMode.Points, UE.Violet, u * 0.05f, StrokeCap.Round)
        }) { ConstantsLab() },
        LabDef("transforms", Domain.Math, "Transformations", "Bend graphs, shear the plane, warp it with complex maps.", { t, c ->
            val s = 0.5f + 0.5f * sin(t)
            for (g in -2..2) { drawLine(UE.Violet.copy(alpha = 0.7f), center + Offset((g * 0.18f + -0.4f * s * 0.5f) * u, -0.4f * u), center + Offset((g * 0.18f + 0.4f * s * 0.5f) * u, 0.4f * u), 1.5f); drawLine(c.copy(alpha = 0.7f), center + Offset(-0.45f * u, g * 0.18f * u), center + Offset(0.45f * u, g * 0.18f * u), 1.5f) }
        }) { TransformsLab() },
    )

    val all: List<LabDef> = math
    val byId: Map<String, LabDef> = all.associateBy { it.id }
}
