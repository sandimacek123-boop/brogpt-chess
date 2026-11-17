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
import dev.universe.engine.physics.*
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

    private val physics = listOf(
        LabDef("orbits", Domain.Physics, "Gravity Sandbox", "N-body orbits, slingshots and three-body chaos.", { t, c ->
            drawCircle(UE.Amber, u * 0.09f, center); drawCircle(UE.Amber.copy(alpha = 0.25f), u * 0.17f, center)
            for (k in 0 until 2) { val r = u * (0.25f + k * 0.17f); drawCircle(c.copy(alpha = 0.3f), r, center, style = Stroke(1.2f)); val a = t * (1.6f - k * 0.7f) + k * 2; glowDot(center + Offset(cos(a) * r, sin(a) * r), if (k == 0) c else UE.Cyan, u * 0.04f) }
        }) { OrbitsLab() },
        LabDef("blackhole", Domain.Physics, "Black Hole", "Real light paths and a ray-traced accretion disc.", { t, c ->
            rotate(-18f, center) { drawOval(UE.Amber.copy(alpha = 0.85f), Offset(center.x - u * 0.46f, center.y - u * 0.1f), Size(u * 0.92f, u * 0.2f), style = Stroke(u * 0.05f)) }
            drawCircle(Color.Black, u * 0.2f, center); drawCircle(UE.Amber.copy(alpha = 0.7f + 0.3f * sin(t * 2)), u * 0.21f, center, style = Stroke(u * 0.025f))
            drawArc(c, 200f, 140f, false, Offset(center.x - u * 0.27f, center.y - u * 0.27f), Size(u * 0.54f, u * 0.54f), style = Stroke(u * 0.03f))
        }) { BlackHoleLab() },
        LabDef("collisions", Domain.Physics, "Collisions and Gases", "Momentum, Maxwell–Boltzmann, and π from colliding blocks.", { t, c ->
            for (k in 0 until 9) { val a = k * 2.1f + t * (0.7f + k * 0.13f); val p = center + Offset(cos(a) * u * (0.12f + 0.033f * k), sin(a * 1.3f) * u * (0.1f + 0.03f * k)); glowDot(p, if (k % 3 == 0) UE.Amber else c, u * 0.04f) }
            drawRect(c.copy(alpha = 0.5f), Offset(size.width * 0.06f, size.height * 0.06f), Size(size.width * 0.88f, size.height * 0.88f), style = Stroke(1.5f))
        }) { CollisionsLab() },
        LabDef("pendulum", Domain.Physics, "Pendulums and Oscillations", "Large swings, chaos, pendulum waves and resonance.", { t, c ->
            val p = at(0.5f, 0.1f); val a = 0.9f * sin(t * 1.4f); val b = 1.6f * sin(t * 2.1f + 1f)
            val p1 = p + Offset(sin(a), cos(a)) * (u * 0.36f); val p2 = p1 + Offset(sin(b), cos(b)) * (u * 0.36f)
            drawLine(Color.White, p, p1, 1.5f); drawLine(Color.White, p1, p2, 1.5f); drawCircle(c, u * 0.04f, p1); glowDot(p2, UE.Magenta, u * 0.045f)
        }) { PendulumLab() },
        LabDef("waves", Domain.Physics, "Wave Interference", "A live ripple tank: slits, diffraction, refraction.", { t, c ->
            for (src in listOf(at(0.3f, 0.3f), at(0.7f, 0.3f))) for (k in 0 until 5) { val r = ((t * 0.25f + k / 5f) % 1f) * u * 0.8f; drawCircle(c.copy(alpha = (1 - r / (u * 0.8f)) * 0.7f), r, src, style = Stroke(1.5f)) }
        }) { WavesLab() },
        LabDef("fields", Domain.Physics, "Electromagnetic Fields", "Field lines, potentials and charges spiralling in B.", { t, c ->
            val a = at(0.3f, 0.5f); val b = at(0.7f, 0.5f)
            for (k in -3..3) { val p = Path(); p.moveTo(a.x, a.y); p.quadraticTo(center.x, center.y + k * u * 0.13f + 0.02f * u * sin(t), b.x, b.y); drawPath(p, Color.White.copy(alpha = 0.5f), style = Stroke(1.2f)) }
            glowDot(a, UE.Magenta, u * 0.06f); glowDot(b, c, u * 0.06f)
        }) { FieldsLab() },
        LabDef("fluid", Domain.Physics, "Particle Fluid", "Hundreds of particles become a liquid you can pour.", { t, c ->
            val pts = ArrayList<Offset>()
            for (k in 0 until 60) { val x = (k % 12) / 11f; val row = k / 12; pts += at(0.08f + 0.84f * x, 0.92f - row * 0.1f - 0.08f * sin(x * 5f - t * 2.5f) * (row + 1) / 5f) }
            drawPoints(pts, PointMode.Points, c, u * 0.07f, StrokeCap.Round)
        }) { FluidLab() },
        LabDef("projectile", Domain.Physics, "Projectile Motion", "Parabolas, air drag and the best angle on six worlds.", { t, c ->
            curve(c.copy(alpha = 0.7f), 30, 0.03f, false) { x -> at(0.08f + 0.84f * x, 0.88f - 3.1f * x * (1 - x) * 0.85f) }
            val x = (t * 0.35f) % 1f; glowDot(at(0.08f + 0.84f * x, 0.88f - 3.1f * x * (1 - x) * 0.85f), Color.White, u * 0.05f)
        }) { ProjectileLab() },
        LabDef("energy", Domain.Physics, "Energy Skate Park", "Kinetic, potential and heat on a track you shape.", { t, c ->
            curve(c, 40, 0.035f) { x -> at(0.06f + 0.88f * x, 0.25f + 0.6f * (1 - (2 * x - 1) * (2 * x - 1))) }
            val x = 0.5f + 0.42f * sin(t * 1.3f); glowDot(at(0.06f + 0.88f * x, 0.2f + 0.6f * (1 - (2 * x - 1) * (2 * x - 1))), Color.White, u * 0.05f)
        }) { EnergyLab() },
    )

    val all: List<LabDef> = math + physics
    val byId: Map<String, LabDef> = all.associateBy { it.id }
}
