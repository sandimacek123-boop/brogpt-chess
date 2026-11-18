package com.quantumath.math.stats

import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import kotlin.math.*

data class Descriptive(
    val n: Int, val sum: Double, val mean: Double, val median: Double, val modes: List<Double>,
    val min: Double, val max: Double, val range: Double,
    val sampleVariance: Double, val populationVariance: Double, val sampleSd: Double, val populationSd: Double,
    val q1: Double, val q3: Double, val iqr: Double, val skewness: Double, val outliers: List<Double>,
)

object Statistics {
    fun parse(text: String): List<Double> = text.split(Regex("[\\s,;]+")).filter { it.isNotBlank() }.map {
        it.toDoubleOrNull()?.takeIf { v -> v.isFinite() } ?: throw MathError("'$it' is not a number")
    }

    /** Percentile with linear interpolation between closest ranks (Hyndman–Fan type 7, as in Excel/R default). p ∈ [0, 100]. */
    fun percentile(sorted: List<Double>, p: Double): Double {
        if (sorted.isEmpty()) throw MathError("No data")
        if (p < 0 || p > 100) throw DomainError("Percentile must be between 0 and 100")
        val h = (sorted.size - 1) * p / 100.0
        val lo = floor(h).toInt(); val hi = ceil(h).toInt()
        return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
    }

    /** Numerically stable (Welford) descriptive statistics. Sample variance uses n − 1. */
    fun describe(data: List<Double>): Descriptive {
        if (data.isEmpty()) throw MathError("Enter at least one value")
        val s = data.sorted()
        val n = s.size
        var mean = 0.0; var m2 = 0.0
        data.forEachIndexed { i, x -> val d = x - mean; mean += d / (i + 1); m2 += d * (x - mean) }
        val popVar = m2 / n
        val sampVar = if (n > 1) m2 / (n - 1) else Double.NaN
        val median = if (n % 2 == 1) s[n / 2] else (s[n / 2 - 1] + s[n / 2]) / 2
        val counts = data.groupingBy { it }.eachCount()
        val maxCount = counts.values.max()
        val modes = if (maxCount == 1) emptyList() else counts.filter { it.value == maxCount }.keys.sorted()
        val q1 = percentile(s, 25.0); val q3 = percentile(s, 75.0); val iqr = q3 - q1
        val m3 = data.sumOf { (it - mean).pow(3) } / n
        val skew = if (popVar > 0) m3 / popVar.pow(1.5) else 0.0
        return Descriptive(n, data.sum(), mean, median, modes, s.first(), s.last(), s.last() - s.first(), sampVar, popVar, sqrt(sampVar), sqrt(popVar), q1, q3, iqr, skew, s.filter { it < q1 - 1.5 * iqr || it > q3 + 1.5 * iqr })
    }

    fun zScores(data: List<Double>): List<Double> {
        val d = describe(data)
        if (d.sampleSd == 0.0 || d.sampleSd.isNaN()) throw MathError("Standard deviation is zero")
        return data.map { (it - d.mean) / d.sampleSd }
    }

    data class Bin(val from: Double, val to: Double, val count: Int)

    /** Histogram with Sturges' rule unless a bin count is given. Last bin is closed on the right. */
    fun histogram(data: List<Double>, bins: Int? = null): List<Bin> {
        if (data.isEmpty()) return emptyList()
        val mn = data.min(); val mx = data.max()
        val k = (bins ?: (ceil(ln(data.size.toDouble()) / ln(2.0)).toInt() + 1)).coerceIn(1, 100)
        if (mn == mx) return listOf(Bin(mn - 0.5, mx + 0.5, data.size))
        val w = (mx - mn) / k
        val counts = IntArray(k)
        for (x in data) counts[min(k - 1, ((x - mn) / w).toInt())]++
        return (0 until k).map { Bin(mn + it * w, mn + (it + 1) * w, counts[it]) }
    }

    fun correlation(x: List<Double>, y: List<Double>): Double {
        if (x.size != y.size || x.size < 2) throw MathError("Need at least two (x, y) pairs")
        val mx = x.average(); val my = y.average()
        var sxy = 0.0; var sxx = 0.0; var syy = 0.0
        for (i in x.indices) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx).pow(2); syy += (y[i] - my).pow(2) }
        if (sxx == 0.0 || syy == 0.0) throw MathError("Correlation is undefined when a variable is constant")
        return sxy / sqrt(sxx * syy)
    }
}

data class Regression(val kind: String, val coefficients: List<Double>, val r2: Double, val equation: String, val predict: (Double) -> Double)

object RegressionFit {
    /** Least-squares polynomial fit of the given degree (normal equations solved with partial pivoting). */
    fun polynomial(x: List<Double>, y: List<Double>, degree: Int): Regression {
        if (x.size != y.size) throw MathError("x and y must have the same length")
        if (x.size <= degree) throw MathError("Need more than $degree points for a degree-$degree fit")
        val m = degree + 1
        val a = Array(m) { DoubleArray(m + 1) }
        for (i in 0 until m) {
            for (j in 0 until m) a[i][j] = x.sumOf { it.pow(i + j) }
            a[i][m] = x.indices.sumOf { x[it].pow(i) * y[it] }
        }
        val c = gauss(a)
        val f: (Double) -> Double = { t -> c.indices.sumOf { c[it] * t.pow(it) } }
        val eq = (degree downTo 0).joinToString(" + ") { i -> "${fmt(c[i])}${if (i == 0) "" else if (i == 1) "x" else "x^$i"}" }.replace("+ -", "- ")
        return Regression(if (degree == 1) "Linear" else "Polynomial (degree $degree)", c.toList(), r2(x, y, f), "y = $eq", f)
    }

    fun linear(x: List<Double>, y: List<Double>) = polynomial(x, y, 1)

    /** y = a·e^(bx) by linear regression on ln y (requires y > 0). */
    fun exponential(x: List<Double>, y: List<Double>): Regression {
        if (y.any { it <= 0 }) throw MathError("Exponential regression requires all y > 0")
        val lin = linear(x, y.map { ln(it) })
        val a = exp(lin.coefficients[0]); val b = lin.coefficients[1]
        val f: (Double) -> Double = { t -> a * exp(b * t) }
        return Regression("Exponential", listOf(a, b), r2(x, y, f), "y = ${fmt(a)}·e^(${fmt(b)}x)", f)
    }

    private fun r2(x: List<Double>, y: List<Double>, f: (Double) -> Double): Double {
        val my = y.average()
        val ssTot = y.sumOf { (it - my).pow(2) }
        val ssRes = x.indices.sumOf { (y[it] - f(x[it])).pow(2) }
        return if (ssTot == 0.0) 1.0 else 1 - ssRes / ssTot
    }

    private fun gauss(a: Array<DoubleArray>): DoubleArray {
        val n = a.size
        for (c in 0 until n) {
            val p = (c until n).maxBy { abs(a[it][c]) }
            if (abs(a[p][c]) < 1e-300) throw MathError("Data is degenerate for this fit")
            val t = a[p]; a[p] = a[c]; a[c] = t
            for (r in 0 until n) if (r != c) {
                val f = a[r][c] / a[c][c]
                for (k in c..n) a[r][k] -= f * a[c][k]
            }
        }
        return DoubleArray(n) { a[it][n] / a[it][it] }
    }

    fun fmt(v: Double): String = java.math.BigDecimal(v).round(java.math.MathContext(6)).stripTrailingZeros().toPlainString()
}

object Distributions {
    /** erf with ~1e-15 relative accuracy (series for small |x|, continued fraction via erfc otherwise). */
    fun erf(x: Double): Double {
        if (x < 0) return -erf(-x)
        if (x < 2.5) {
            var sum = x; var term = x; var n = 0
            while (abs(term) > 1e-17 * abs(sum)) {
                n++
                term *= -x * x / n
                sum += term / (2 * n + 1)
            }
            return 2 / sqrt(PI) * sum
        }
        return 1 - erfc(x)
    }

    fun erfc(x: Double): Double {
        if (x < 2.5) return 1 - erf(x)
        // Lentz continued fraction for erfc
        var f: Double; var c: Double; var d: Double
        val tiny = 1e-300
        f = x; if (f == 0.0) f = tiny
        c = f; d = 0.0
        for (i in 1..300) {
            val an = i / 2.0
            d = x + an * d; if (d == 0.0) d = tiny
            c = x + an / c; if (c == 0.0) c = tiny
            d = 1 / d
            val delta = c * d
            f *= delta
            if (abs(delta - 1) < 1e-16) break
        }
        return exp(-x * x) / sqrt(PI) / f
    }

    fun normalPdf(x: Double, mu: Double = 0.0, sigma: Double = 1.0): Double {
        if (sigma <= 0) throw DomainError("σ must be positive")
        val z = (x - mu) / sigma
        return exp(-z * z / 2) / (sigma * sqrt(2 * PI))
    }

    fun normalCdf(x: Double, mu: Double = 0.0, sigma: Double = 1.0): Double {
        if (sigma <= 0) throw DomainError("σ must be positive")
        val z = (x - mu) / (sigma * sqrt(2.0))
        return if (z < 0) erfc(-z) / 2 else 1 - erfc(z) / 2
    }

    /** Inverse normal CDF (Acklam's algorithm + one Halley refinement step). */
    fun normalInv(p: Double, mu: Double = 0.0, sigma: Double = 1.0): Double {
        if (p <= 0 || p >= 1) throw DomainError("p must be strictly between 0 and 1")
        val a = doubleArrayOf(-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00)
        val b = doubleArrayOf(-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01)
        val c = doubleArrayOf(-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00)
        val d = doubleArrayOf(7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00)
        val pl = 0.02425
        var x = when {
            p < pl -> { val q = sqrt(-2 * ln(p)); (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1) }
            p <= 1 - pl -> { val q = p - 0.5; val r = q * q; (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1) }
            else -> { val q = sqrt(-2 * ln(1 - p)); -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1) }
        }
        val e = normalCdf(x) - p
        val u = e * sqrt(2 * PI) * exp(x * x / 2)
        x -= u / (1 + x * u / 2)
        return mu + sigma * x
    }

    private fun lnChoose(n: Int, k: Int): Double = lnGamma(n + 1.0) - lnGamma(k + 1.0) - lnGamma(n - k + 1.0)

    fun lnGamma(x: Double): Double {
        if (x < 0.5) return ln(PI / abs(sin(PI * x))) - lnGamma(1 - x)
        val g = 7.0
        val coef = doubleArrayOf(0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7)
        val xx = x - 1
        var a = coef[0]
        val t = xx + g + 0.5
        for (i in 1 until 9) a += coef[i] / (xx + i)
        return 0.5 * ln(2 * PI) + (xx + 0.5) * ln(t) - t + ln(a)
    }

    fun binomialPmf(k: Int, n: Int, p: Double): Double {
        if (n < 0 || p < 0 || p > 1) throw DomainError("Requires n ≥ 0 and 0 ≤ p ≤ 1")
        if (k < 0 || k > n) return 0.0
        if (p == 0.0) return if (k == 0) 1.0 else 0.0
        if (p == 1.0) return if (k == n) 1.0 else 0.0
        return exp(lnChoose(n, k) + k * ln(p) + (n - k) * ln(1 - p))
    }

    fun binomialCdf(k: Int, n: Int, p: Double): Double = (0..min(k, n)).sumOf { binomialPmf(it, n, p) }.coerceAtMost(1.0)

    fun poissonPmf(k: Int, lambda: Double): Double {
        if (lambda <= 0) throw DomainError("λ must be positive")
        if (k < 0) return 0.0
        return exp(k * ln(lambda) - lambda - lnGamma(k + 1.0))
    }

    fun poissonCdf(k: Int, lambda: Double): Double = (0..k).sumOf { poissonPmf(it, lambda) }.coerceAtMost(1.0)

    fun exponentialCdf(x: Double, rate: Double): Double { if (rate <= 0) throw DomainError("Rate must be positive"); return if (x < 0) 0.0 else 1 - exp(-rate * x) }
    fun uniformCdf(x: Double, a: Double, b: Double): Double { if (b <= a) throw DomainError("Requires a < b"); return ((x - a) / (b - a)).coerceIn(0.0, 1.0) }
    fun geometricPmf(k: Int, p: Double): Double { if (p <= 0 || p > 1) throw DomainError("Requires 0 < p ≤ 1"); return if (k < 1) 0.0 else (1 - p).pow(k - 1) * p }
}

/** Seeded probability experiments (deterministic for a given seed). */
object Experiments {
    data class Outcome(val label: String, val count: Int, val theoretical: Double)

    fun coins(flips: Int, seed: Long): List<Outcome> {
        val r = java.util.Random(seed)
        var heads = 0
        repeat(flips) { if (r.nextBoolean()) heads++ }
        return listOf(Outcome("Heads", heads, 0.5), Outcome("Tails", flips - heads, 0.5))
    }

    fun dice(rolls: Int, dice: Int, seed: Long): List<Outcome> {
        val r = java.util.Random(seed)
        val counts = IntArray(6 * dice + 1)
        repeat(rolls) { var s = 0; repeat(dice) { s += r.nextInt(6) + 1 }; counts[s]++ }
        // exact distribution of the sum by convolution
        var dist = DoubleArray(7) { if (it == 0) 0.0 else 1.0 / 6 }.let { d -> d.copyOf(6 * dice + 1) }
        for (k in 2..dice) {
            val next = DoubleArray(6 * dice + 1)
            for (s in dist.indices) if (dist[s] > 0) for (f in 1..6) if (s + f < next.size) next[s + f] += dist[s] / 6
            dist = next
        }
        return (dice..6 * dice).map { Outcome(it.toString(), counts[it], dist[it]) }
    }

    /** Monte-Carlo estimate of π from random points in the unit square. */
    fun monteCarloPi(points: Int, seed: Long): Pair<Double, List<Pair<Double, Double>>> {
        val r = java.util.Random(seed)
        var inside = 0
        val shown = ArrayList<Pair<Double, Double>>()
        repeat(points) {
            val x = r.nextDouble(); val y = r.nextDouble()
            if (x * x + y * y <= 1) inside++
            if (shown.size < 3000) shown += x to y
        }
        return 4.0 * inside / points to shown
    }
}
