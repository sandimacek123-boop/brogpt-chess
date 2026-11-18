package com.quantumath.math.eval

import com.quantumath.math.core.DomainError
import com.quantumath.math.core.OverflowError
import java.math.BigDecimal
import java.math.BigInteger
import java.math.MathContext
import java.math.RoundingMode

/**
 * Arbitrary-precision elementary functions on BigDecimal.
 * Every function computes with guard digits and returns a value correct to `mc.precision`
 * significant digits (up to the final rounding). Inputs are limited to keep runtimes bounded.
 */
object BigMath {
    private val TWO = BigDecimal(2)
    private val piCache = HashMap<Int, BigDecimal>()
    private val ln10Cache = HashMap<Int, BigDecimal>()
    const val MAX_EXP_ARG = 1_000_000

    private fun guard(mc: MathContext, extra: Int = 12) = MathContext(mc.precision + extra, RoundingMode.HALF_EVEN)

    /** π by Machin's formula: π = 16·atan(1/5) − 4·atan(1/239). */
    fun pi(mc: MathContext): BigDecimal = synchronized(piCache) {
        piCache.getOrPut(mc.precision) {
            val w = guard(mc)
            val a = atanInv(5, w).multiply(BigDecimal(16), w)
            val b = atanInv(239, w).multiply(BigDecimal(4), w)
            a.subtract(b, w).round(mc)
        }
    }

    /** atan(1/n) = Σ (-1)^k / ((2k+1) n^(2k+1)) */
    private fun atanInv(n: Int, mc: MathContext): BigDecimal {
        val nn = BigDecimal(n)
        val n2 = nn.multiply(nn)
        var term = BigDecimal.ONE.divide(nn, mc) // 1/n^(2k+1)
        var sum = term
        var k = 1
        val eps = BigDecimal.ONE.movePointLeft(mc.precision + 2)
        while (true) {
            term = term.divide(n2, mc)
            val t = term.divide(BigDecimal(2 * k + 1), mc)
            if (t.abs() < eps) break
            sum = if (k % 2 == 1) sum.subtract(t, mc) else sum.add(t, mc)
            k++
        }
        return sum
    }

    fun e(mc: MathContext): BigDecimal = exp(BigDecimal.ONE, mc)

    fun exp(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.signum() == 0) return BigDecimal.ONE
        if (x.abs() > BigDecimal(MAX_EXP_ARG)) throw OverflowError("exp argument is too large (|x| > $MAX_EXP_ARG)")
        // halve until |r| < 1/2, Taylor, then square back; extra guard digits for the squarings
        var k = 0
        var r = x
        val half = BigDecimal("0.5")
        while (r.abs() > half) { r = r.divide(TWO); k++ }
        val w = MathContext(mc.precision + 12 + (k * 0.31).toInt(), RoundingMode.HALF_EVEN)
        var sum = BigDecimal.ONE
        var term = BigDecimal.ONE
        val eps = BigDecimal.ONE.movePointLeft(w.precision + 2)
        var n = 1
        while (true) {
            term = term.multiply(r, w).divide(BigDecimal(n), w)
            if (term.abs() < eps) break
            sum = sum.add(term, w)
            n++
        }
        repeat(k) { sum = sum.multiply(sum, w) }
        return sum.round(mc)
    }

    private fun ln10(mc: MathContext): BigDecimal = synchronized(ln10Cache) { ln10Cache.getOrPut(mc.precision) { lnCore(BigDecimal.TEN, mc) } }

    /** Natural log for x > 0: x = m·10^k with m ∈ [1,10), ln x = ln m + k·ln 10. */
    fun ln(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.signum() <= 0) throw DomainError("ln requires x > 0")
        if (x.compareTo(BigDecimal.ONE) == 0) return BigDecimal.ZERO
        val w = guard(mc)
        val k = x.precision() - x.scale() - 1
        val m = x.movePointLeft(k)
        val lnm = lnCore(m, w)
        return if (k == 0) lnm.round(mc) else lnm.add(ln10(w).multiply(BigDecimal(k), w), w).round(mc)
    }

    /** Halley iteration y ← y + 2(m − e^y)/(m + e^y), cubic convergence from a double guess. */
    private fun lnCore(m: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        var y = BigDecimal(Math.log(m.toDouble()))
        val eps = BigDecimal.ONE.movePointLeft(w.precision - 2)
        repeat(60) {
            val ey = exp(y, w)
            val delta = m.subtract(ey, w).multiply(TWO, w).divide(m.add(ey, w), w)
            y = y.add(delta, w)
            if (delta.abs() < eps) return y.round(mc)
        }
        return y.round(mc)
    }

    fun log(x: BigDecimal, base: BigDecimal, mc: MathContext): BigDecimal {
        if (base.signum() <= 0 || base.compareTo(BigDecimal.ONE) == 0) throw DomainError("log base must be positive and ≠ 1")
        val w = guard(mc)
        // exact powers of the base (e.g. log10(1000) = 3) avoid tiny rounding artefacts
        exactLog(x, base)?.let { return BigDecimal(it) }
        return ln(x, w).divide(ln(base, w), w).round(mc)
    }

    private fun exactLog(x: BigDecimal, base: BigDecimal): Int? {
        if (x.signum() <= 0) return null
        val b = base.stripTrailingZeros()
        if (b.scale() > 0 || b < TWO) return null
        var p = BigDecimal.ONE
        for (k in 0..4000) {
            val c = p.compareTo(x)
            if (c == 0) return k
            if (c > 0) break
            p = p.multiply(b)
        }
        // negative powers: x = b^-k
        var q = BigDecimal.ONE
        for (k in 1..4000) {
            q = q.multiply(b)
            val inv = try { BigDecimal.ONE.divide(q) } catch (_: ArithmeticException) { return null }
            val c = inv.compareTo(x)
            if (c == 0) return -k
            if (c < 0) break
        }
        return null
    }

    fun sqrt(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.signum() < 0) throw DomainError("√ of a negative number is not real")
        if (x.signum() == 0) return BigDecimal.ZERO
        return x.sqrt(guard(mc)).round(mc)
    }

    /** Real n-th root; odd roots of negative numbers are allowed. */
    fun root(x: BigDecimal, n: Int, mc: MathContext): BigDecimal {
        if (n == 0) throw DomainError("0th root is undefined")
        if (n < 0) return BigDecimal.ONE.divide(root(x, -n, guard(mc)), mc)
        if (x.signum() == 0) return BigDecimal.ZERO
        if (x.signum() < 0) {
            if (n % 2 == 0) throw DomainError("Even root of a negative number is not real")
            return root(x.negate(), n, mc).negate()
        }
        if (n == 1) return x.round(mc)
        if (n == 2) return sqrt(x, mc)
        val w = guard(mc)
        // Newton: y ← ((n−1)y + x / y^(n−1)) / n, starting from exp(ln x / n)
        var y = exp(ln(x, w).divide(BigDecimal(n), w), w)
        val nn = BigDecimal(n)
        val eps = BigDecimal.ONE.movePointLeft(w.precision - 3)
        repeat(100) {
            val next = y.multiply(BigDecimal(n - 1), w).add(x.divide(y.pow(n - 1, w), w), w).divide(nn, w)
            if (next.subtract(y).abs() <= eps.multiply(next.abs())) { y = next; return snapInteger(y, mc) }
            y = next
        }
        return snapInteger(y, mc)
    }

    /** If the value is within rounding noise of an integer whose power reproduces x, return the integer. */
    private fun snapInteger(y: BigDecimal, mc: MathContext): BigDecimal {
        val r = y.setScale(0, RoundingMode.HALF_EVEN)
        return if (y.subtract(r).abs() < BigDecimal.ONE.movePointLeft(mc.precision + 4)) r else y.round(mc)
    }

    /** Integer power with negative exponents. */
    fun powInt(x: BigDecimal, n: BigInteger, mc: MathContext): BigDecimal {
        if (n.signum() == 0) return BigDecimal.ONE
        if (x.signum() == 0) {
            if (n.signum() < 0) throw com.quantumath.math.core.DivisionByZero()
            return BigDecimal.ZERO
        }
        if (n.abs() > BigInteger.valueOf(999_999_999)) throw OverflowError()
        // estimate magnitude to avoid materialising astronomically long numbers
        val mag = (x.precision() - x.scale() - 1).toDouble() * n.toDouble()
        if (Math.abs(mag) > 100_000_000) throw OverflowError()
        val w = guard(mc)
        val r = x.pow(n.abs().toInt(), w)
        return if (n.signum() < 0) BigDecimal.ONE.divide(r, mc) else r.round(mc)
    }

    /** x^y for real y: exact for integer y, exp(y·ln x) otherwise. */
    fun pow(x: BigDecimal, y: BigDecimal, mc: MathContext): BigDecimal {
        val ys = y.stripTrailingZeros()
        if (ys.scale() <= 0) return powInt(x, ys.toBigIntegerExact(), mc)
        if (x.signum() == 0) {
            if (y.signum() > 0) return BigDecimal.ZERO
            throw com.quantumath.math.core.DivisionByZero()
        }
        if (x.signum() < 0) throw DomainError("Negative base with a non-integer exponent has no real value")
        val w = guard(mc)
        return exp(y.multiply(ln(x, w), w), w).round(mc)
    }

    // ------------------------------------------------------------------ trigonometry
    private enum class Snap { NONE, ZERO, ONE, MINUS_ONE }

    /** sin with argument reduction; exact zeros at multiples of π (to working precision). */
    fun sin(x: BigDecimal, mc: MathContext): BigDecimal = trig(x, mc, true)
    fun cos(x: BigDecimal, mc: MathContext): BigDecimal = trig(x, mc, false)

    private fun trig(x: BigDecimal, mc: MathContext, isSin: Boolean): BigDecimal {
        val intDigits = Math.max(0, x.precision() - x.scale())
        if (intDigits > 1000) throw OverflowError("Angle is too large for accurate reduction")
        val w = MathContext(mc.precision + 15 + intDigits, RoundingMode.HALF_EVEN)
        val pi = pi(w)
        val halfPi = pi.divide(TWO, w)
        // reduce to r ∈ [−π/4, π/4] with quadrant q
        val q = x.divide(halfPi, w).setScale(0, RoundingMode.HALF_EVEN)
        val r = x.subtract(halfPi.multiply(q, w), w)
        val quadrant = q.toBigInteger().mod(BigInteger.valueOf(4)).toInt()
        val snapEps = BigDecimal.ONE.movePointLeft(mc.precision + 6)
        val tiny = r.abs() < snapEps
        // sin(r + qπ/2)
        val useSin = if (isSin) quadrant % 2 == 0 else quadrant % 2 == 1
        val negate = if (isSin) quadrant >= 2 else (quadrant == 1 || quadrant == 2)
        val v = if (useSin) { if (tiny) BigDecimal.ZERO else sinTaylor(r, w) } else { if (tiny) BigDecimal.ONE else cosTaylor(r, w) }
        return (if (negate) v.negate() else v).round(mc)
    }

    private fun sinTaylor(r: BigDecimal, mc: MathContext): BigDecimal {
        val r2 = r.multiply(r, mc)
        var term = r
        var sum = r
        var k = 1
        val eps = BigDecimal.ONE.movePointLeft(mc.precision + 2)
        while (true) {
            term = term.multiply(r2, mc).divide(BigDecimal((2 * k) * (2 * k + 1)), mc).negate()
            if (term.abs() < eps) break
            sum = sum.add(term, mc)
            k++
        }
        return sum
    }

    private fun cosTaylor(r: BigDecimal, mc: MathContext): BigDecimal {
        val r2 = r.multiply(r, mc)
        var term = BigDecimal.ONE
        var sum = BigDecimal.ONE
        var k = 1
        val eps = BigDecimal.ONE.movePointLeft(mc.precision + 2)
        while (true) {
            term = term.multiply(r2, mc).divide(BigDecimal((2 * k - 1) * (2 * k)), mc).negate()
            if (term.abs() < eps) break
            sum = sum.add(term, mc)
            k++
        }
        return sum
    }

    fun tan(x: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        val c = cos(x, w)
        if (c.signum() == 0 || c.abs() < BigDecimal.ONE.movePointLeft(mc.precision + 5)) throw DomainError("tan is undefined at odd multiples of π/2")
        return sin(x, w).divide(c, mc)
    }

    fun atan(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.signum() == 0) return BigDecimal.ZERO
        val w = guard(mc)
        if (x.abs() > BigDecimal.ONE) {
            val r = pi(w).divide(TWO, w).subtract(atan(BigDecimal.ONE.divide(x.abs(), w), w), w)
            return (if (x.signum() < 0) r.negate() else r).round(mc)
        }
        // halve the angle until |y| < 0.1: atan(y) = 2·atan(y / (1 + √(1 + y²)))
        var y = x
        var doublings = 0
        val small = BigDecimal("0.1")
        while (y.abs() > small) {
            y = y.divide(BigDecimal.ONE.add(BigDecimal.ONE.add(y.multiply(y, w), w).sqrt(w), w), w)
            doublings++
        }
        val y2 = y.multiply(y, w)
        var term = y
        var sum = y
        var k = 1
        val eps = BigDecimal.ONE.movePointLeft(w.precision + 2)
        while (true) {
            term = term.multiply(y2, w).negate()
            val t = term.divide(BigDecimal(2 * k + 1), w)
            if (t.abs() < eps) break
            sum = sum.add(t, w)
            k++
        }
        return sum.multiply(TWO.pow(doublings), w).round(mc)
    }

    fun asin(x: BigDecimal, mc: MathContext): BigDecimal {
        val c = x.abs().compareTo(BigDecimal.ONE)
        if (c > 0) throw DomainError("asin requires -1 ≤ x ≤ 1")
        val w = guard(mc)
        if (c == 0) return pi(w).divide(TWO, w).let { if (x.signum() < 0) it.negate() else it }.round(mc)
        return atan(x.divide(BigDecimal.ONE.subtract(x.multiply(x, w), w).sqrt(w), w), w).round(mc)
    }

    fun acos(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.abs() > BigDecimal.ONE) throw DomainError("acos requires -1 ≤ x ≤ 1")
        val w = guard(mc)
        return pi(w).divide(TWO, w).subtract(asin(x, w), w).round(mc)
    }

    fun sinh(x: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        val ex = exp(x, w)
        return ex.subtract(BigDecimal.ONE.divide(ex, w), w).divide(TWO, mc)
    }

    fun cosh(x: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        val ex = exp(x, w)
        return ex.add(BigDecimal.ONE.divide(ex, w), w).divide(TWO, mc)
    }

    fun tanh(x: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        if (x.abs() > BigDecimal(5000)) return BigDecimal(x.signum())
        val e2 = exp(x.multiply(TWO), w)
        return e2.subtract(BigDecimal.ONE, w).divide(e2.add(BigDecimal.ONE, w), mc)
    }

    fun asinh(x: BigDecimal, mc: MathContext): BigDecimal {
        val w = guard(mc)
        // asinh is odd; compute for |x| for stability
        val ax = x.abs()
        val r = ln(ax.add(ax.multiply(ax, w).add(BigDecimal.ONE, w).sqrt(w), w), w)
        return (if (x.signum() < 0) r.negate() else r).round(mc)
    }

    fun acosh(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x < BigDecimal.ONE) throw DomainError("acosh requires x ≥ 1")
        val w = guard(mc)
        return ln(x.add(x.multiply(x, w).subtract(BigDecimal.ONE, w).sqrt(w), w), mc)
    }

    fun atanh(x: BigDecimal, mc: MathContext): BigDecimal {
        if (x.abs() >= BigDecimal.ONE) throw DomainError("atanh requires -1 < x < 1")
        val w = guard(mc)
        return ln(BigDecimal.ONE.add(x).divide(BigDecimal.ONE.subtract(x), w), w).divide(TWO, mc)
    }

    fun factorial(n: Int): BigInteger {
        if (n < 0) throw DomainError("Factorial of a negative integer is undefined")
        if (n > 20_000) throw OverflowError("n! is limited to n ≤ 20000 in the calculator")
        // product tree for speed
        fun prod(a: Int, b: Int): BigInteger = if (b - a < 16) { var r = BigInteger.ONE; for (i in a..b) r = r.multiply(BigInteger.valueOf(i.toLong())); r } else { val m = (a + b) ushr 1; prod(a, m).multiply(prod(m + 1, b)) }
        return if (n < 2) BigInteger.ONE else prod(2, n)
    }
}
