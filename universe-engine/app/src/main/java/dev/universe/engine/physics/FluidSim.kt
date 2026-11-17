package dev.universe.engine.physics

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Particle fluid after Clavet, Beaudoin & Poulin, "Particle-based Viscoelastic Fluid Simulation" (2005).
 * Each step: apply gravity and viscosity, advect, then relax positions so that the smoothed density
 * approaches the rest density (pressure) with a short-range "near" term that prevents clumping.
 * Time step is one unit; world units are arbitrary (the box is [w] × [h]).
 */
class FluidSim(val n: Int, val w: Float, val h: Float, seed: Int = 1) {
    val x = FloatArray(n); val y = FloatArray(n); val vx = FloatArray(n); val vy = FloatArray(n)
    private val px = FloatArray(n); private val py = FloatArray(n)
    var radius = 3.0f          // interaction radius
    var restDensity = 2.4f
    var stiffness = 0.1f
    var nearStiffness = 0.3f
    var viscosity = 0.03f      // linear term; the quadratic term is fixed
    var gx = 0f; var gy = 0.012f
    /** Pointer force: position, strength (positive pushes away, negative pulls), 0 = off. */
    var fx = 0f; var fy = 0f; var fStrength = 0f

    private val cols = (w / radius).toInt() + 2; private val rows = (h / radius).toInt() + 2
    private val head = IntArray(cols * rows); private val next = IntArray(n)
    private val nb = IntArray(64); private val nq = FloatArray(64); private val ndx = FloatArray(64); private val ndy = FloatArray(64)

    init {
        val rnd = Random(seed)
        val spacing = 1.45f
        val perRow = max(1, ((w * 0.6f) / spacing).toInt())
        for (i in 0 until n) {
            x[i] = w * 0.2f + (i % perRow) * spacing + rnd.nextFloat() * 0.3f
            y[i] = h - 1.2f - (i / perRow) * spacing - rnd.nextFloat() * 0.3f
        }
    }

    private fun cellOf(i: Int): Int = (y[i] / radius).toInt().coerceIn(0, rows - 1) * cols + (x[i] / radius).toInt().coerceIn(0, cols - 1)

    private fun buildGrid() {
        head.fill(-1)
        for (i in 0 until n) { val c = cellOf(i); next[i] = head[c]; head[c] = i }
    }

    /** Collects neighbours of i within the interaction radius; returns their count. */
    private fun neighbours(i: Int, onlyHigher: Boolean): Int {
        var count = 0
        val cx = (x[i] / radius).toInt().coerceIn(0, cols - 1); val cy = (y[i] / radius).toInt().coerceIn(0, rows - 1)
        val r2 = radius * radius
        for (oy in -1..1) for (ox in -1..1) {
            val ax = cx + ox; val ay = cy + oy
            if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue
            var j = head[ay * cols + ax]
            while (j >= 0) {
                if (j != i && (!onlyHigher || j > i)) {
                    val dx = x[j] - x[i]; val dy = y[j] - y[i]
                    val d2 = dx * dx + dy * dy
                    if (d2 < r2 && count < 64) {
                        val d = sqrt(d2).coerceAtLeast(1e-4f)
                        nb[count] = j; nq[count] = d / radius; ndx[count] = dx / d; ndy[count] = dy / d; count++
                    }
                }
                j = next[j]
            }
        }
        return count
    }

    fun step() {
        for (i in 0 until n) {
            vx[i] += gx; vy[i] += gy
            if (fStrength != 0f) {
                val dx = x[i] - fx; val dy = y[i] - fy
                val d2 = dx * dx + dy * dy
                val reach = 9f
                if (d2 < reach * reach && d2 > 1e-4f) { val d = sqrt(d2); val s = fStrength * (1 - d / reach) / d; vx[i] += dx * s; vy[i] += dy * s }
            }
        }
        buildGrid()
        // viscosity: damp approaching pairs
        if (viscosity > 0f) for (i in 0 until n) {
            val c = neighbours(i, true)
            for (k in 0 until c) {
                val j = nb[k]
                val u = (vx[i] - vx[j]) * ndx[k] + (vy[i] - vy[j]) * ndy[k]
                if (u > 0) {
                    val imp = (1 - nq[k]) * (viscosity * u + 0.03f * u * u) / 2
                    vx[i] -= imp * ndx[k]; vy[i] -= imp * ndy[k]; vx[j] += imp * ndx[k]; vy[j] += imp * ndy[k]
                }
            }
        }
        for (i in 0 until n) { px[i] = x[i]; py[i] = y[i]; x[i] += vx[i]; y[i] += vy[i] }
        buildGrid()
        // double-density relaxation
        for (i in 0 until n) {
            val c = neighbours(i, false)
            var rho = 0f; var rhoNear = 0f
            for (k in 0 until c) { val a = 1 - nq[k]; rho += a * a; rhoNear += a * a * a }
            val p = stiffness * (rho - restDensity); val pNear = nearStiffness * rhoNear
            var sx = 0f; var sy = 0f
            for (k in 0 until c) {
                val a = 1 - nq[k]
                val d = min((p * a + pNear * a * a) * radius * 0.5f, radius * 0.25f)
                val j = nb[k]
                x[j] += d * ndx[k]; y[j] += d * ndy[k]
                sx -= d * ndx[k]; sy -= d * ndy[k]
            }
            x[i] += sx; y[i] += sy
        }
        val m = 0.6f
        for (i in 0 until n) {
            if (x[i] < m) x[i] = m + (m - x[i]) * 0.0f else if (x[i] > w - m) x[i] = w - m
            if (y[i] < m) y[i] = m else if (y[i] > h - m) y[i] = h - m
            vx[i] = x[i] - px[i]; vy[i] = y[i] - py[i]
            val sp2 = vx[i] * vx[i] + vy[i] * vy[i]
            if (sp2 > 4f) { val s = 2f / sqrt(sp2); vx[i] *= s; vy[i] *= s }
        }
    }

    fun maxSpeed(): Float { var m = 0f; for (i in 0 until n) m = max(m, sqrt(vx[i] * vx[i] + vy[i] * vy[i])); return m }
    fun meanSpeed(): Float { var s = 0f; for (i in 0 until n) s += sqrt(vx[i] * vx[i] + vy[i] * vy[i]); return s / n }
}
