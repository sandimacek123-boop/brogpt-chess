package com.quantumath.math.eval

import com.quantumath.math.core.DivisionByZero
import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import com.quantumath.math.core.OverflowError
import com.quantumath.math.core.Rational
import com.quantumath.math.core.Unsupported
import com.quantumath.math.expr.Expr
import java.math.BigDecimal
import java.math.BigInteger
import java.math.MathContext
import java.math.RoundingMode

/**
 * High-precision evaluator for the calculator. Results are correct to `digits` significant
 * digits except where `approximate` is set (functions without a BigDecimal implementation,
 * currently only Γ / non-integer factorials, fall back to double precision).
 */
class BigEvaluator(val digits: Int = 32, val angle: AngleMode = AngleMode.RADIANS, val env: Map<String, BigDecimal> = emptyMap()) {
    private val work = MathContext(digits + 10, RoundingMode.HALF_EVEN)
    private val constMc = MathContext(digits + 40, RoundingMode.HALF_EVEN)
    var approximate = false
        private set

    fun eval(e: Expr): BigDecimal = ev(e).round(MathContext(digits, RoundingMode.HALF_EVEN))

    private fun ev(e: Expr): BigDecimal = when (e) {
        is Expr.Num -> e.value
        is Expr.Frac -> e.value.toBigDecimal(constMc)
        is Expr.Const -> when (e.name) {
            "pi" -> BigMath.pi(constMc)
            "tau" -> BigMath.pi(constMc).multiply(BigDecimal(2))
            "e" -> BigMath.e(constMc)
            "phi" -> BigDecimal.ONE.add(BigDecimal(5).sqrt(constMc)).divide(BigDecimal(2), constMc)
            else -> throw Unsupported("'${e.name}' requires complex mode")
        }
        is Expr.Var -> env[e.name] ?: throw MathError("Unknown variable '${e.name}'. Store a value in it, or use the Solver/Graph for expressions with variables.")
        is Expr.Neg -> ev(e.arg).negate()
        is Expr.Add -> ev(e.left).add(ev(e.right), work)
        is Expr.Sub -> ev(e.left).subtract(ev(e.right), work)
        is Expr.Mul -> ev(e.left).multiply(ev(e.right), work)
        is Expr.Div -> {
            val d = ev(e.right)
            if (d.signum() == 0) throw DivisionByZero()
            ev(e.left).divide(d, work)
        }
        is Expr.Pow -> pow(e)
        is Expr.Percent -> ev(e.arg).divide(BigDecimal(100))
        is Expr.Fact -> fact(ev(e.arg))
        is Expr.Call -> call(e)
    }

    private fun pow(e: Expr.Pow): BigDecimal {
        val base = ev(e.base)
        val exactExp = RationalEval.tryEval(e.exp)
        if (exactExp != null) {
            if (exactExp.isInteger) return BigMath.powInt(base, exactExp.num, work)
            if (base.signum() < 0) {
                // real odd roots: (-8)^(2/3) = (∛-8)^2 = 4
                if (!exactExp.den.testBit(0)) throw DomainError("Negative base with an even-denominator exponent has no real value")
                if (exactExp.den > BigInteger.valueOf(1_000_000)) throw DomainError("Exponent denominator is too large")
                val r = BigMath.root(base, exactExp.den.toInt(), work)
                return BigMath.powInt(r, exactExp.num, work)
            }
        }
        return BigMath.pow(base, ev(e.exp), work)
    }

    private fun fact(v: BigDecimal): BigDecimal {
        val s = v.stripTrailingZeros()
        if (s.scale() <= 0) {
            val n = s.toBigIntegerExact()
            if (n.signum() < 0) throw DomainError("Factorial of a negative integer is undefined")
            if (n > BigInteger.valueOf(20_000)) throw OverflowError("n! is limited to n ≤ 20000")
            return BigDecimal(BigMath.factorial(n.toInt()))
        }
        approximate = true
        val r = Evaluator(strict = true).factorial(v.toDouble())
        if (!r.isFinite()) throw OverflowError()
        return BigDecimal(r)
    }

    private fun toRad(x: BigDecimal): BigDecimal = if (angle == AngleMode.DEGREES) x.multiply(BigMath.pi(constMc), constMc).divide(BigDecimal(180), constMc) else x
    private fun fromRad(x: BigDecimal): BigDecimal = if (angle == AngleMode.DEGREES) x.multiply(BigDecimal(180), work).divide(BigMath.pi(constMc), work) else x

    /** Exact sin/cos/tan at multiples of 90° in degree mode. */
    private fun degreeQuadrant(x: BigDecimal): Int? {
        if (angle != AngleMode.DEGREES) return null
        val r = x.remainder(BigDecimal(90))
        if (r.signum() != 0) return null
        return x.divide(BigDecimal(90)).toBigInteger().mod(BigInteger.valueOf(4)).toInt()
    }

    private fun int(v: BigDecimal, fn: String): BigInteger {
        val s = v.stripTrailingZeros()
        if (s.scale() > 0) throw DomainError("$fn requires integers")
        return s.toBigIntegerExact()
    }

    private fun call(e: Expr.Call): BigDecimal {
        val a = e.args.map { ev(it) }
        val x = a[0]
        return when (e.fn) {
            "sin" -> degreeQuadrant(x)?.let { BigDecimal(intArrayOf(0, 1, 0, -1)[it]) } ?: BigMath.sin(toRad(x), work)
            "cos" -> degreeQuadrant(x)?.let { BigDecimal(intArrayOf(1, 0, -1, 0)[it]) } ?: BigMath.cos(toRad(x), work)
            "tan" -> degreeQuadrant(x)?.let { if (it % 2 == 1) throw DomainError("tan is undefined at odd multiples of 90°") else BigDecimal.ZERO } ?: BigMath.tan(toRad(x), work)
            "sec" -> BigDecimal.ONE.divide(nonZero(call(Expr.Call("cos", e.args)), "sec"), work)
            "csc" -> BigDecimal.ONE.divide(nonZero(call(Expr.Call("sin", e.args)), "csc"), work)
            "cot" -> {
                val s = nonZero(call(Expr.Call("sin", e.args)), "cot")
                call(Expr.Call("cos", e.args)).divide(s, work)
            }
            "asin" -> fromRad(BigMath.asin(x, work))
            "acos" -> fromRad(BigMath.acos(x, work))
            "atan" -> fromRad(BigMath.atan(x, work))
            "acot" -> fromRad(if (x.signum() == 0) BigMath.pi(work).divide(BigDecimal(2), work) else BigMath.atan(BigDecimal.ONE.divide(x, work), work).let { if (x.signum() < 0) it.add(BigMath.pi(work)) else it })
            "asec" -> { if (x.abs() < BigDecimal.ONE) throw DomainError("asec requires |x| ≥ 1"); fromRad(BigMath.acos(BigDecimal.ONE.divide(x, work), work)) }
            "acsc" -> { if (x.abs() < BigDecimal.ONE) throw DomainError("acsc requires |x| ≥ 1"); fromRad(BigMath.asin(BigDecimal.ONE.divide(x, work), work)) }
            "sinh" -> BigMath.sinh(x, work)
            "cosh" -> BigMath.cosh(x, work)
            "tanh" -> BigMath.tanh(x, work)
            "asinh" -> BigMath.asinh(x, work)
            "acosh" -> BigMath.acosh(x, work)
            "atanh" -> BigMath.atanh(x, work)
            "ln" -> BigMath.ln(x, work)
            "log10" -> BigMath.log(x, BigDecimal.TEN, work)
            "log2" -> BigMath.log(x, BigDecimal(2), work)
            "log" -> BigMath.log(x, a[1], work)
            "exp" -> BigMath.exp(x, work)
            "sqrt" -> BigMath.sqrt(x, work).let { snap(it, x, 2) }
            "cbrt" -> BigMath.root(x, 3, work)
            "root" -> {
                val n = int(a[1], "root degree")
                if (n.abs() > BigInteger.valueOf(1_000_000)) throw DomainError("Root degree is too large")
                BigMath.root(x, n.toInt(), work)
            }
            "abs" -> x.abs()
            "floor" -> x.setScale(0, RoundingMode.FLOOR)
            "ceil" -> x.setScale(0, RoundingMode.CEILING)
            "round" -> if (a.size == 2) x.setScale(int(a[1], "round digits").toInt(), RoundingMode.HALF_UP) else x.setScale(0, RoundingMode.HALF_UP)
            "sign" -> BigDecimal(x.signum())
            "min" -> a.min()
            "max" -> a.max()
            "mod" -> {
                if (a[1].signum() == 0) throw DivisionByZero()
                val q = x.divide(a[1], 0, RoundingMode.FLOOR)
                x.subtract(a[1].multiply(q))
            }
            "gcd" -> BigDecimal(int(x, "gcd").gcd(int(a[1], "gcd")))
            "lcm" -> {
                val p = int(x, "lcm"); val q = int(a[1], "lcm")
                val g = p.gcd(q)
                if (g.signum() == 0) BigDecimal.ZERO else BigDecimal((p / g * q).abs())
            }
            "nCr", "nPr" -> {
                val n = int(x, e.fn); val k = int(a[1], e.fn)
                if (n.signum() < 0 || k.signum() < 0) throw DomainError("${e.fn} requires non-negative integers")
                if (n > BigInteger.valueOf(100_000)) throw OverflowError("${e.fn} is limited to n ≤ 100000")
                if (k > n) BigDecimal.ZERO
                else BigDecimal(if (e.fn == "nCr") com.quantumath.math.numbertheory.NumberTheory.binomial(n.toInt(), k.toInt()) else com.quantumath.math.numbertheory.NumberTheory.permutations(n.toInt(), k.toInt()))
            }
            "gamma" -> {
                approximate = true
                val r = Evaluator(strict = true).gamma(x.toDouble())
                if (!r.isFinite()) throw OverflowError()
                BigDecimal(r)
            }
            else -> throw Unsupported("${e.fn} is not available here")
        }
    }

    private fun nonZero(v: BigDecimal, fn: String): BigDecimal {
        if (v.signum() == 0) throw DomainError("$fn is undefined here")
        return v
    }

    /** √ of a perfect square is returned exactly. */
    private fun snap(r: BigDecimal, x: BigDecimal, n: Int): BigDecimal {
        val i = r.setScale(0, RoundingMode.HALF_EVEN)
        return if (i.pow(n).compareTo(x) == 0) i else r
    }

    companion object {
        fun rationalOf(v: BigDecimal): Rational = Rational.of(v)
    }
}
