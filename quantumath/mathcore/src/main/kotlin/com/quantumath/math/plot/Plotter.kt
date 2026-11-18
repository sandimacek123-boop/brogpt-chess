package com.quantumath.math.plot

import com.quantumath.math.numeric.Limits
import com.quantumath.math.numeric.Roots
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/** A continuous piece of a curve in world coordinates. */
class Polyline(val xs: DoubleArray, val ys: DoubleArray) { val size get() = xs.size }

data class Viewport(val xMin: Double, val xMax: Double, val yMin: Double, val yMax: Double) {
    val width get() = xMax - xMin
    val height get() = yMax - yMin
}

/**
 * Adaptive sampler. Starts from a uniform grid, subdivides where the curve bends or jumps in
 * screen space, and breaks the line at non-finite values and at discontinuities (a jump that
 * the midpoint does not bridge), so asymptotes are never drawn as vertical lines.
 */
object Plotter {
    fun function(f: (Double) -> Double, vp: Viewport, pixels: Int, quality: Double = 1.0, maxDepth: Int = 7): List<Polyline> {
        val n = (pixels * quality / 2).toInt().coerceIn(32, 4000)
        val out = ArrayList<Polyline>()
        val xs = ArrayList<Double>(); val ys = ArrayList<Double>()
        val yScale = vp.height
        val tol = yScale / pixels * 2 // ~2 px
        fun flush() { if (xs.size >= 2) out += Polyline(xs.toDoubleArray(), ys.toDoubleArray()); xs.clear(); ys.clear() }
        fun emit(x: Double, y: Double) { xs += x; ys += y }

        fun refine(x0: Double, y0: Double, x1: Double, y1: Double, depth: Int) {
            val xm = (x0 + x1) / 2
            val ym = f(xm)
            val bothFinite = y0.isFinite() && y1.isFinite()
            if (!ym.isFinite()) {
                if (depth < maxDepth) {
                    refine(x0, y0, xm, ym, depth + 1)
                    refine(xm, ym, x1, y1, depth + 1)
                } else { flush() }
                return
            }
            if (!bothFinite) {
                if (depth < maxDepth) { refine(x0, y0, xm, ym, depth + 1); refine(xm, ym, x1, y1, depth + 1) } else emit(xm, ym)
                return
            }
            val linear = (y0 + y1) / 2
            val jump = abs(y1 - y0)
            // discontinuity: big jump where the midpoint lies outside [y0, y1]
            val outside = ym > max(y0, y1) + tol || ym < minOf(y0, y1) - tol
            if (depth >= maxDepth) {
                if (jump > yScale * 0.5 && (outside || abs(ym - linear) > jump * 0.4)) { flush(); return }
                emit(x1, y1); return
            }
            if (abs(ym - linear) > tol || jump > yScale * 0.25) {
                refine(x0, y0, xm, ym, depth + 1)
                refine(xm, ym, x1, y1, depth + 1)
            } else emit(x1, y1)
        }

        var px = vp.xMin; var py = f(px)
        if (py.isFinite()) emit(px, py)
        for (i in 1..n) {
            val x = vp.xMin + vp.width * i / n
            val y = f(x)
            if (xs.isEmpty() && py.isFinite()) emit(px, py)
            refine(px, py, x, y, 0)
            if (!y.isFinite()) flush()
            px = x; py = y
        }
        flush()
        return out.map { clampLarge(it, vp) }
    }

    /** Keep far off-screen values bounded so canvas paths stay well-conditioned. */
    private fun clampLarge(p: Polyline, vp: Viewport): Polyline {
        val lim = vp.height * 50
        val c = (vp.yMin + vp.yMax) / 2
        return Polyline(p.xs, DoubleArray(p.size) { (p.ys[it]).coerceIn(c - lim, c + lim) })
    }

    fun parametric(x: (Double) -> Double, y: (Double) -> Double, t0: Double, t1: Double, samples: Int = 1500): List<Polyline> {
        val out = ArrayList<Polyline>()
        val xs = ArrayList<Double>(); val ys = ArrayList<Double>()
        for (i in 0..samples) {
            val t = t0 + (t1 - t0) * i / samples
            val a = x(t); val b = y(t)
            if (a.isFinite() && b.isFinite()) { xs += a; ys += b } else if (xs.size >= 2) { out += Polyline(xs.toDoubleArray(), ys.toDoubleArray()); xs.clear(); ys.clear() } else { xs.clear(); ys.clear() }
        }
        if (xs.size >= 2) out += Polyline(xs.toDoubleArray(), ys.toDoubleArray())
        return out
    }

    fun polar(r: (Double) -> Double, th0: Double, th1: Double, samples: Int = 2000): List<Polyline> =
        parametric({ t -> r(t) * cos(t) }, { t -> r(t) * sin(t) }, th0, th1, samples)
}

/** Features of a plotted function within the visible window. */
object GraphAnalysis {
    data class Point(val x: Double, val y: Double, val label: String)

    fun roots(f: (Double) -> Double, vp: Viewport): List<Point> = Roots.findAll(f, vp.xMin, vp.xMax, 3000).map { Point(it, 0.0, "root") }

    fun extrema(f: (Double) -> Double, vp: Viewport): List<Point> {
        val h = vp.width * 1e-6
        val d: (Double) -> Double = { x -> (f(x + h) - f(x - h)) / (2 * h) }
        return Roots.findAll(d, vp.xMin, vp.xMax, 3000).mapNotNull { x ->
            val y = f(x)
            if (!y.isFinite()) return@mapNotNull null
            val l = f(x - vp.width * 1e-3); val r = f(x + vp.width * 1e-3)
            when {
                l < y && r < y -> Point(x, y, "max")
                l > y && r > y -> Point(x, y, "min")
                else -> null
            }
        }
    }

    fun intersections(f: (Double) -> Double, g: (Double) -> Double, vp: Viewport): List<Point> =
        Roots.findAll({ x -> f(x) - g(x) }, vp.xMin, vp.xMax, 3000).mapNotNull { x -> val y = f(x); if (y.isFinite()) Point(x, y, "intersection") else null }

    /** Vertical asymptotes: points where |f| grows without bound from at least one side. */
    fun verticalAsymptotes(f: (Double) -> Double, vp: Viewport): List<Double> {
        val n = 2000
        val out = ArrayList<Double>()
        var prevX = vp.xMin; var prevY = f(prevX)
        for (i in 1..n) {
            val x = vp.xMin + vp.width * (i - 0.4637) / n // offset grid: avoid landing exactly on a pole
            val y = f(x)
            if (!y.isFinite() && prevY.isFinite()) continue // step over isolated undefined points
            val blow = (prevY.isFinite() && y.isFinite() && prevY * y < 0 && abs(prevY - y) > vp.height * 2) || (!y.isFinite() && !y.isNaN()) 
            if (blow) {
                // confirm growth by bisection toward the jump
                var a = prevX; var b = x
                repeat(50) { val m = (a + b) / 2; if (f(m) * f(a) > 0) a = m else b = m }
                val xm = (a + b) / 2
                val ya = f(xm - 1e-9 * max(1.0, abs(xm))); val yb = f(xm + 1e-9 * max(1.0, abs(xm)))
                if ((abs(ya) > 1e6 || abs(yb) > 1e6) && out.none { abs(it - xm) < vp.width * 1e-3 }) out += xm
            }
            prevX = x; prevY = y
        }
        return out
    }

    /** Horizontal asymptotes y = L from numeric limits at ±∞ (when finite). */
    fun horizontalAsymptotes(f: (Double) -> Double): List<Double> =
        listOf(Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY).mapNotNull { Limits.numeric(f, it).value?.takeIf { v -> v.isFinite() } }.distinct()
}
