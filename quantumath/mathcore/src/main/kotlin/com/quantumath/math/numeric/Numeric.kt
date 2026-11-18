package com.quantumath.math.numeric

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Result of a numerical procedure with an honest error estimate. */
data class Estimate(val value: Double, val error: Double, val converged: Boolean, val note: String = "")

object Roots {
    /** Brent's method on a bracket [a, b] with f(a)·f(b) ≤ 0. Returns null if not bracketed. */
    fun brent(f: (Double) -> Double, a0: Double, b0: Double, tol: Double = 1e-14, maxIter: Int = 200): Double? {
        var a = a0; var b = b0
        var fa = f(a); var fb = f(b)
        if (fa.isNaN() || fb.isNaN()) return null
        if (fa == 0.0) return a
        if (fb == 0.0) return b
        if (fa * fb > 0) return null
        if (abs(fa) < abs(fb)) { a = b.also { b = a }; fa = fb.also { fb = fa } }
        var c = a; var fc = fa
        var mflag = true
        var d = 0.0
        repeat(maxIter) {
            var s = if (fa != fc && fb != fc) {
                a * fb * fc / ((fa - fb) * (fa - fc)) + b * fa * fc / ((fb - fa) * (fb - fc)) + c * fa * fb / ((fc - fa) * (fc - fb))
            } else b - fb * (b - a) / (fb - fa)
            val cond1 = (s - (3 * a + b) / 4) * (s - b) > 0
            val cond2 = mflag && abs(s - b) >= abs(b - c) / 2
            val cond3 = !mflag && abs(s - b) >= abs(c - d) / 2
            val cond4 = mflag && abs(b - c) < tol
            val cond5 = !mflag && abs(c - d) < tol
            if (cond1 || cond2 || cond3 || cond4 || cond5) { s = (a + b) / 2; mflag = true } else mflag = false
            val fs = f(s)
            if (fs.isNaN()) return null
            d = c; c = b; fc = fb
            if (fa * fs < 0) { b = s; fb = fs } else { a = s; fa = fs }
            if (abs(fa) < abs(fb)) { a = b.also { b = a }; fa = fb.also { fb = fa } }
            if (fb == 0.0 || abs(b - a) < tol * max(1.0, abs(b))) return b
        }
        return b
    }

    /** Golden-section minimum of g on [a, b]. */
    fun goldenMin(g: (Double) -> Double, a0: Double, b0: Double, iters: Int = 80): Double {
        val r = (sqrt(5.0) - 1) / 2
        var a = a0; var b = b0
        var c = b - r * (b - a); var d = a + r * (b - a)
        var fc = g(c); var fd = g(d)
        repeat(iters) {
            if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = g(c) } else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = g(d) }
        }
        return (a + b) / 2
    }

    /**
     * All real roots of f in [lo, hi]: sign changes refined with Brent, plus touching roots found
     * as near-zero local minima of |f|. Sign changes across poles/jumps are rejected by checking
     * that |f| is small at the refined point.
     */
    fun findAll(f: (Double) -> Double, lo: Double, hi: Double, samples: Int = 2000): List<Double> {
        val out = ArrayList<Double>()
        val n = samples
        val xs = DoubleArray(n + 1) { lo + (hi - lo) * it / n }
        val ys = DoubleArray(n + 1) { f(xs[it]) }
        val scale = ys.filter { it.isFinite() }.maxOfOrNull { abs(it) }?.coerceAtLeast(1.0) ?: 1.0
        fun accept(x: Double) {
            val y = f(x)
            if (!y.isFinite()) return
            // root must actually be (nearly) zero — rejects sign changes at poles and jumps
            val h = 1e-7 * max(1.0, abs(x))
            val slope = abs(f(x + h) - f(x - h)) / (2 * h)
            if (abs(y) <= 1e-9 * max(1.0, slope * abs(x) + 1) || abs(y) < 1e-12 * scale) {
                if (out.none { abs(it - x) <= 1e-7 * max(1.0, abs(x)) }) out += x
            }
        }
        for (i in 0 until n) {
            val y0 = ys[i]; val y1 = ys[i + 1]
            if (y0 == 0.0) { accept(xs[i]); continue }
            if (!y0.isFinite() || !y1.isFinite()) continue
            if (y0 * y1 < 0) {
                brent(f, xs[i], xs[i + 1])?.let { accept(it) }
            } else if (i > 0 && ys[i - 1].isFinite()) {
                // local minimum of |f| → possible double root
                val a = abs(ys[i - 1]); val b = abs(y0); val c = abs(y1)
                if (b <= a && b <= c && b < 1e-3 * scale) {
                    val x = goldenMin({ abs(f(it)) }, xs[i - 1], xs[i + 1])
                    accept(x)
                }
            }
        }
        if (ys[n] == 0.0) accept(xs[n])
        return out.sorted()
    }
}

object Differentiate {
    /** Ridders' method: Richardson-extrapolated central differences with an error estimate. */
    fun ridders(f: (Double) -> Double, x: Double, h0: Double = 0.02 * max(1.0, abs(x))): Estimate {
        val ntab = 10
        val con = 1.4; val con2 = con * con
        val a = Array(ntab) { DoubleArray(ntab) }
        var hh = h0
        a[0][0] = (f(x + hh) - f(x - hh)) / (2 * hh)
        var err = Double.MAX_VALUE
        var ans = a[0][0]
        for (i in 1 until ntab) {
            hh /= con
            a[0][i] = (f(x + hh) - f(x - hh)) / (2 * hh)
            var fac = con2
            for (j in 1..i) {
                a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1)
                fac *= con2
                val errt = max(abs(a[j][i] - a[j - 1][i]), abs(a[j][i] - a[j - 1][i - 1]))
                if (errt <= err) { err = errt; ans = a[j][i] }
            }
            if (abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break
        }
        return Estimate(ans, err, ans.isFinite() && err < 1e-5 * max(1.0, abs(ans)), "Ridders extrapolation of central differences")
    }

    fun second(f: (Double) -> Double, x: Double): Double {
        val h = 1e-4 * max(1.0, abs(x))
        return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)
    }
}

object Integrate {
    private val XGK = doubleArrayOf(0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926, 0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961, 0.207784955007898467600689403773245, 0.0)
    private val WGK = doubleArrayOf(0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518, 0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014, 0.204432940075298892414161999234649, 0.209482141084727828012999174891714)
    private val WG = doubleArrayOf(0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327)

    private fun gk15(f: (Double) -> Double, a: Double, b: Double): Pair<Double, Double> {
        val c = (a + b) / 2; val h = (b - a) / 2
        val fc = f(c)
        var rk = fc * WGK[7]
        var rg = fc * WG[3]
        for (j in 0 until 7) {
            val x = h * XGK[j]
            val f1 = f(c - x); val f2 = f(c + x)
            rk += WGK[j] * (f1 + f2)
            if (j % 2 == 1) rg += WG[j / 2] * (f1 + f2)
        }
        return rk * h to abs((rk - rg) * h)
    }

    /** Adaptive Gauss–Kronrod 7/15 quadrature. Infinite limits handled by x = t/(1−t²). */
    fun adaptive(f: (Double) -> Double, a: Double, b: Double, tol: Double = 1e-10, maxIntervals: Int = 2000): Estimate {
        if (a == b) return Estimate(0.0, 0.0, true)
        if (a > b) return adaptive(f, b, a, tol, maxIntervals).let { it.copy(value = -it.value) }
        if (a.isInfinite() || b.isInfinite()) {
            val g: (Double) -> Double = { t -> val d = 1 - t * t; val x = t / d; f(x) * (1 + t * t) / (d * d) }
            val ta = if (a.isInfinite()) -1.0 else tOf(a)
            val tb = if (b.isInfinite()) 1.0 else tOf(b)
            return adaptive(g, ta, tb, tol, maxIntervals).copy(note = "Infinite limit mapped by x = t/(1−t²)")
        }
        data class Seg(val a: Double, val b: Double, val v: Double, val e: Double)
        val q = java.util.PriorityQueue<Seg>(compareByDescending { it.e })
        val (v0, e0) = gk15(f, a, b)
        q += Seg(a, b, v0, e0)
        var total = v0; var err = e0
        var count = 1
        while (err > tol * max(1.0, abs(total)) && count < maxIntervals) {
            val s = q.poll()
            val m = (s.a + s.b) / 2
            val (v1, e1) = gk15(f, s.a, m)
            val (v2, e2) = gk15(f, m, s.b)
            total += v1 + v2 - s.v
            err += e1 + e2 - s.e
            q += Seg(s.a, m, v1, e1); q += Seg(m, s.b, v2, e2)
            count++
            if (!total.isFinite()) break
        }
        val ok = total.isFinite() && err <= tol * max(1.0, abs(total)) * 100
        return Estimate(total, err, ok, if (ok) "Adaptive Gauss–Kronrod (7/15), $count subintervals" else "Did not converge — the integral may diverge or the integrand may be singular")
    }

    private fun tOf(x: Double): Double = if (x == 0.0) 0.0 else (-1 + sqrt(1 + 4 * x * x)) / (2 * x)

    /** Composite rules for the visualization (Riemann/trapezoid/Simpson with n panels). */
    fun riemann(f: (Double) -> Double, a: Double, b: Double, n: Int, rule: String): Double {
        val h = (b - a) / n
        return when (rule) {
            "left" -> (0 until n).sumOf { f(a + it * h) } * h
            "right" -> (1..n).sumOf { f(a + it * h) } * h
            "midpoint" -> (0 until n).sumOf { f(a + (it + 0.5) * h) } * h
            "trapezoid" -> (f(a) + f(b)) * h / 2 + (1 until n).sumOf { f(a + it * h) } * h
            else -> { // simpson (n even)
                val m = if (n % 2 == 0) n else n + 1
                val hh = (b - a) / m
                (f(a) + f(b) + (1 until m).sumOf { (if (it % 2 == 1) 4 else 2) * f(a + it * hh) }) * hh / 3
            }
        }
    }
}

object Limits {
    data class Result(val value: Double?, val left: Double?, val right: Double?, val note: String)

    /** Numeric two-sided limit using Richardson extrapolation on h = 2^-k sequences. */
    fun numeric(f: (Double) -> Double, a: Double): Result {
        fun side(dir: Double): Double? {
            if (a.isInfinite()) {
                val vals = (4..22).map { f(dir * 2.0.pow(it)) }.filter { it.isFinite() || it.isInfinite() }
                return converge(vals)
            }
            val hs = (2..30).map { dir * 2.0.pow(-it) * max(1.0, abs(a)) }
            val vals = hs.map { f(a + it) }
            return converge(vals)
        }
        if (a.isInfinite()) {
            val v = side(if (a > 0) 1.0 else -1.0)
            return Result(v, null, null, "Evaluated along x = ±2^k (k = 4…22)")
        }
        val l = side(-1.0); val r = side(1.0)
        val agree = l != null && r != null && (l == r || abs(l - r) <= 1e-6 * max(1.0, abs(l)))
        val note = when {
            l == null || r == null -> "One-sided values did not settle"
            agree -> "Left and right limits agree (Richardson-extrapolated sequences)"
            else -> "Left and right limits differ — the two-sided limit does not exist"
        }
        return Result(if (agree) (if (l!!.isInfinite()) l else (l + r!!) / 2) else null, l, r, note)
    }

    private fun Double.pow(e: Int) = Math.pow(this, e.toDouble())

    private fun converge(vals: List<Double>): Double? {
        val finite = vals.filter { !it.isNaN() }
        if (finite.size < 6) return null
        val tail = finite.takeLast(6)
        if (tail.all { it.isInfinite() } && tail.map { it > 0 }.distinct().size == 1) return tail.last()
        if (tail.all { abs(it) > 1e12 } && tail.zipWithNext().all { (x, y) -> abs(y) >= abs(x) }) return if (tail.last() > 0) Double.POSITIVE_INFINITY else Double.NEGATIVE_INFINITY
        // pick the most stable consecutive pair (avoids cancellation noise at tiny h)
        var best: Double? = null
        var bestDiff = Double.MAX_VALUE
        for (i in 1 until finite.size) {
            val d = abs(finite[i] - finite[i - 1])
            if (d < bestDiff) { bestDiff = d; best = finite[i] }
        }
        val b = best ?: return null
        return if (bestDiff <= 1e-6 * max(1.0, abs(b))) round12(b) else null
    }

    private fun round12(v: Double): Double {
        val r = Math.rint(v)
        if (abs(v - r) < 1e-9) return r
        return v
    }
}

/** Polynomial root finding (all complex roots) via Aberth–Ehrlich iteration. coeffs[i] = a_i (ascending powers). */
object PolyRoots {
    data class C(val re: Double, val im: Double) {
        operator fun plus(o: C) = C(re + o.re, im + o.im)
        operator fun minus(o: C) = C(re - o.re, im - o.im)
        operator fun times(o: C) = C(re * o.re - im * o.im, re * o.im + im * o.re)
        operator fun div(o: C): C { val d = o.re * o.re + o.im * o.im; return C((re * o.re + im * o.im) / d, (im * o.re - re * o.im) / d) }
        fun abs() = Math.hypot(re, im)
    }

    fun roots(coeffs: DoubleArray): List<C> {
        var n = coeffs.size - 1
        while (n > 0 && coeffs[n] == 0.0) n--
        if (n < 1) return emptyList()
        val a = DoubleArray(n + 1) { coeffs[it] / coeffs[n] }
        // zero roots
        var zeros = 0
        while (zeros < n && a[zeros] == 0.0) zeros++
        val b = a.copyOfRange(zeros, n + 1)
        val m = b.size - 1
        val result = ArrayList<C>()
        repeat(zeros) { result += C(0.0, 0.0) }
        if (m == 0) return result
        val radius = 1 + (0 until m).maxOf { abs(b[it]) }
        val z = Array(m) { k -> val t = 2 * Math.PI * k / m + 0.4; C(radius * 0.5 * Math.cos(t), radius * 0.5 * Math.sin(t)) }
        fun eval(x: C): Pair<C, C> {
            var p = C(b[m], 0.0); var dp = C(0.0, 0.0)
            for (i in m - 1 downTo 0) { dp = dp * x + p; p = p * x + C(b[i], 0.0) }
            return p to dp
        }
        for (iter in 0 until 500) {
            var maxStep = 0.0
            for (i in 0 until m) {
                val (p, dp) = eval(z[i])
                if (p.abs() == 0.0) continue
                val ratio = p / dp
                var s = C(0.0, 0.0)
                for (j in 0 until m) if (j != i) s = s + C(1.0, 0.0) / (z[i] - z[j])
                val w = ratio / (C(1.0, 0.0) - ratio * s)
                z[i] = z[i] - w
                maxStep = max(maxStep, w.abs() / max(1.0, z[i].abs()))
            }
            if (maxStep < 1e-15) break
        }
        // polish with Newton and clean tiny imaginary parts
        for (i in 0 until m) {
            var x = z[i]
            repeat(5) { val (p, dp) = eval(x); if (dp.abs() > 0) x = x - p / dp }
            z[i] = if (abs(x.im) < 1e-10 * max(1.0, abs(x.re))) C(x.re, 0.0) else x
        }
        result += z
        return result.sortedWith(compareBy({ it.re }, { it.im }))
    }
}

fun Double.cleanZero(eps: Double = 1e-13): Double = if (abs(this) < eps) 0.0 else this
fun minOf3(a: Double, b: Double, c: Double) = min(a, min(b, c))
