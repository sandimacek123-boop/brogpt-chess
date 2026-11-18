package com.quantumath.math.fractal

import kotlin.math.ln
import kotlin.math.log2

/**
 * Escape-time fractals. Results are smooth iteration counts (−1 = inside the set) written into a
 * FloatArray; rows are independent so callers can render bands in parallel and progressively.
 */
data class FractalView(val centerX: Double, val centerY: Double, val scale: Double) // scale = world units per pixel

object Fractal {
    fun mandelbrotRows(out: FloatArray, w: Int, h: Int, view: FractalView, maxIter: Int, rowStart: Int, rowEnd: Int, step: Int = 1) {
        for (py in rowStart until rowEnd step step) {
            val cy = view.centerY + (py - h / 2.0) * view.scale
            for (px in 0 until w step step) {
                val cx = view.centerX + (px - w / 2.0) * view.scale
                val v = escape(0.0, 0.0, cx, cy, maxIter, cardioid = true)
                for (dy in 0 until step) for (dx in 0 until step) {
                    val yy = py + dy; val xx = px + dx
                    if (yy < h && xx < w) out[yy * w + xx] = v
                }
            }
        }
    }

    fun juliaRows(out: FloatArray, w: Int, h: Int, view: FractalView, cRe: Double, cIm: Double, maxIter: Int, rowStart: Int, rowEnd: Int, step: Int = 1) {
        for (py in rowStart until rowEnd step step) {
            val zy = view.centerY + (py - h / 2.0) * view.scale
            for (px in 0 until w step step) {
                val zx = view.centerX + (px - w / 2.0) * view.scale
                val v = escape(zx, zy, cRe, cIm, maxIter, cardioid = false)
                for (dy in 0 until step) for (dx in 0 until step) {
                    val yy = py + dy; val xx = px + dx
                    if (yy < h && xx < w) out[yy * w + xx] = v
                }
            }
        }
    }

    /** Smooth (normalised) iteration count; −1 if the orbit stays bounded. */
    fun escape(zx0: Double, zy0: Double, cx: Double, cy: Double, maxIter: Int, cardioid: Boolean): Float {
        if (cardioid) {
            // skip the main cardioid and period-2 bulb (always inside)
            val q = (cx - 0.25) * (cx - 0.25) + cy * cy
            if (q * (q + (cx - 0.25)) <= 0.25 * cy * cy) return -1f
            if ((cx + 1) * (cx + 1) + cy * cy <= 0.0625) return -1f
        }
        var x = zx0; var y = zy0
        var i = 0
        while (i < maxIter) {
            val x2 = x * x; val y2 = y * y
            if (x2 + y2 > 256.0) {
                val logZn = ln(x2 + y2) / 2
                val nu = log2(logZn / ln(2.0))
                return (i + 1 - nu).toFloat()
            }
            y = 2 * x * y + cy
            x = x2 - y2 + cx
            i++
        }
        return -1f
    }

    /** Logistic map bifurcation data: for each r, the attractor points after transients. */
    fun logisticBifurcation(rMin: Double, rMax: Double, columns: Int, keep: Int = 120): List<Pair<Double, DoubleArray>> =
        (0 until columns).map { i ->
            val r = rMin + (rMax - rMin) * i / (columns - 1).coerceAtLeast(1)
            var x = 0.5
            repeat(600) { x = r * x * (1 - x) }
            r to DoubleArray(keep) { x = r * x * (1 - x); x }
        }
}
