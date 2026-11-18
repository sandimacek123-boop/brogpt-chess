package com.quantumath.math.core

import java.math.BigDecimal
import java.math.BigInteger
import java.math.MathContext
import java.math.RoundingMode

/** Exact rational number p/q in lowest terms with q > 0. */
class Rational private constructor(val num: BigInteger, val den: BigInteger) : Comparable<Rational> {

    companion object {
        val ZERO = Rational(BigInteger.ZERO, BigInteger.ONE)
        val ONE = Rational(BigInteger.ONE, BigInteger.ONE)
        val TWO = Rational(BigInteger.TWO, BigInteger.ONE)
        val MINUS_ONE = Rational(BigInteger.ONE.negate(), BigInteger.ONE)
        val HALF = of(1, 2)

        fun of(n: BigInteger, d: BigInteger = BigInteger.ONE): Rational {
            if (d.signum() == 0) throw DivisionByZero()
            var nn = n
            var dd = d
            if (dd.signum() < 0) {
                nn = nn.negate(); dd = dd.negate()
            }
            val g = nn.gcd(dd)
            return if (g == BigInteger.ONE || g.signum() == 0) Rational(nn, if (nn.signum() == 0) BigInteger.ONE else dd)
            else Rational(nn / g, dd / g)
        }

        fun of(n: Long, d: Long = 1): Rational = of(BigInteger.valueOf(n), BigInteger.valueOf(d))
        fun of(n: Int): Rational = of(n.toLong())

        /** Exact conversion of a decimal (e.g. 0.125 -> 1/8). */
        fun of(d: BigDecimal): Rational {
            val s = d.stripTrailingZeros()
            return if (s.scale() <= 0) of(s.toBigIntegerExact()) else of(s.unscaledValue(), BigInteger.TEN.pow(s.scale()))
        }

        /** Parse "3", "-3/4", "0.25", "1e-3". */
        fun parse(text: String): Rational {
            val t = text.trim()
            val slash = t.indexOf('/')
            return if (slash >= 0) of(BigDecimal(t.substring(0, slash).trim())).div(of(BigDecimal(t.substring(slash + 1).trim())))
            else of(BigDecimal(t))
        }

        /**
         * Best rational approximation with denominator ≤ maxDen (continued fractions).
         * Returns null when the double is not within tol of such a fraction.
         */
        fun fromDouble(x: Double, maxDen: Long = 10_000, tol: Double = 1e-12): Rational? {
            if (!x.isFinite()) return null
            if (x == Math.rint(x) && Math.abs(x) < 9e15) return of(x.toLong())
            var h0 = 0L; var h1 = 1L; var k0 = 1L; var k1 = 0L
            var v = x
            repeat(40) {
                val a = Math.floor(v)
                if (Math.abs(a) > 1e15) return null
                val ai = a.toLong()
                val h2 = ai * h1 + h0
                val k2 = ai * k1 + k0
                if (k2 > maxDen || k2 <= 0) return null
                h0 = h1; h1 = h2; k0 = k1; k1 = k2
                if (Math.abs(h1.toDouble() / k1 - x) <= tol * Math.max(1.0, Math.abs(x))) return of(h1, k1)
                val frac = v - a
                if (frac == 0.0) return null
                v = 1.0 / frac
            }
            return null
        }
    }

    val isZero get() = num.signum() == 0
    val isInteger get() = den == BigInteger.ONE
    val signum get() = num.signum()

    operator fun plus(o: Rational) = of(num * o.den + o.num * den, den * o.den)
    operator fun minus(o: Rational) = of(num * o.den - o.num * den, den * o.den)
    operator fun times(o: Rational) = of(num * o.num, den * o.den)
    operator fun div(o: Rational): Rational {
        if (o.isZero) throw DivisionByZero()
        return of(num * o.den, den * o.num)
    }
    operator fun unaryMinus() = Rational(num.negate(), den)
    fun abs() = if (num.signum() < 0) -this else this
    fun reciprocal() = if (isZero) throw DivisionByZero() else of(den, num)

    /** Integer power (exponent may be negative). Guarded against absurd sizes. */
    fun pow(e: Int): Rational {
        if (e == 0) return ONE
        val bits = Math.max(num.bitLength(), den.bitLength()).toLong() * Math.abs(e)
        if (bits > 200_000) throw OverflowError()
        return if (e > 0) of(num.pow(e), den.pow(e)) else reciprocal().pow(-e)
    }

    fun toDouble(): Double {
        val d = num.toDouble() / den.toDouble()
        if (d.isFinite()) return d
        return BigDecimal(num).divide(BigDecimal(den), MathContext.DECIMAL64).toDouble()
    }

    fun toBigDecimal(mc: MathContext): BigDecimal = BigDecimal(num).divide(BigDecimal(den), mc)

    fun floor(): BigInteger {
        val (q, r) = num.divideAndRemainder(den)
        return if (r.signum() < 0) q - BigInteger.ONE else q
    }

    override fun compareTo(other: Rational) = (num * other.den).compareTo(other.num * den)
    override fun equals(other: Any?) = other is Rational && num == other.num && den == other.den
    override fun hashCode() = num.hashCode() * 31 + den.hashCode()
    override fun toString() = if (isInteger) num.toString() else "$num/$den"

    /** Mixed-number style decimal string with up to `digits` significant digits. */
    fun toDecimalString(digits: Int = 15): String =
        toBigDecimal(MathContext(digits, RoundingMode.HALF_EVEN)).stripTrailingZeros().let { if (it.scale() < 0) it.setScale(0) else it }.toPlainString()
}
