package com.quantumath.math.eval

import com.quantumath.math.core.DivisionByZero
import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Unsupported
import com.quantumath.math.expr.Expr
import kotlin.math.*

/**
 * Double-precision evaluation. Two modes:
 *  - strict = true  (calculator/solver): domain violations throw MathError with a message
 *  - strict = false (graphing/numerics): domain violations yield NaN so plots can break lines
 */
class Evaluator(val angle: AngleMode = AngleMode.RADIANS, val strict: Boolean = true) {

    fun eval(e: Expr, env: Map<String, Double> = emptyMap()): Double = compile(e, env.keys.toList()).invoke(env.values.toDoubleArray().let { arr -> DoubleArray(arr.size) { arr[it] } })

    /** Compile to a closure tree; variables are read from the array in `vars` order. */
    fun compile(e: Expr, vars: List<String>): (DoubleArray) -> Double {
        val f = c(e, vars)
        return f
    }

    /** Convenience: f(x) for a single variable. Unknown variables throw on compile. */
    fun function(e: Expr, v: String = "x"): (Double) -> Double {
        val f = c(e, listOf(v))
        val buf = DoubleArray(1)
        return { x -> buf[0] = x; f(buf) }
    }

    private fun bad(msg: String): Double = if (strict) throw DomainError(msg) else Double.NaN

    private fun toRad(x: Double) = if (angle == AngleMode.DEGREES) x * PI / 180.0 else x
    private fun fromRad(x: Double) = if (angle == AngleMode.DEGREES) x * 180.0 / PI else x

    private inline fun F(noinline g: (DoubleArray) -> Double): (DoubleArray) -> Double = g

    private fun c(e: Expr, vars: List<String>): (DoubleArray) -> Double = when (e) {
        is Expr.Num -> { val v = e.value.toDouble(); F { v } }
        is Expr.Frac -> { val v = e.value.toDouble(); F { v } }
        is Expr.Const -> {
            val v = when (e.name) {
                "pi" -> PI; "e" -> E; "tau" -> 2 * PI; "phi" -> (1 + sqrt(5.0)) / 2
                else -> throw Unsupported("'${e.name}' is only available in complex mode")
            }
            F { v }
        }
        is Expr.Var -> {
            val idx = vars.indexOf(e.name)
            if (idx < 0) throw MathError("Unknown variable '${e.name}'")
            F { a -> a[idx] }
        }
        is Expr.Neg -> { val a = c(e.arg, vars); F { x -> -a(x) } }
        is Expr.Add -> { val a = c(e.left, vars); val b = c(e.right, vars); F { x -> a(x) + b(x) } }
        is Expr.Sub -> { val a = c(e.left, vars); val b = c(e.right, vars); F { x -> a(x) - b(x) } }
        is Expr.Mul -> { val a = c(e.left, vars); val b = c(e.right, vars); F { x -> a(x) * b(x) } }
        is Expr.Div -> {
            val a = c(e.left, vars)
            val b = c(e.right, vars)
            F { x ->
                val d = b(x)
                if (d == 0.0) { if (strict) throw DivisionByZero() else Double.NaN } else a(x) / d
            }
        }
        is Expr.Pow -> {
            val a = c(e.base, vars)
            val b = c(e.exp, vars)
            val oddRootDen = oddDenominator(e.exp)
            F { x -> powReal(a(x), b(x), oddRootDen) }
        }
        is Expr.Fact -> { val a = c(e.arg, vars); F { x -> factorial(a(x)) } }
        is Expr.Percent -> { val a = c(e.arg, vars); F { x -> a(x) / 100.0 } }
        is Expr.Call -> call(e, vars)
    }

    /** For exponents like 1/3 or 2/5 a negative base has a real result. */
    private fun oddDenominator(exp: Expr): Boolean {
        val r = RationalEval.tryEval(exp) ?: return false
        return !r.isInteger && r.den.testBit(0)
    }

    private fun powReal(a: Double, b: Double, oddDen: Boolean): Double {
        if (a == 0.0 && b < 0) return if (strict) throw DivisionByZero() else Double.POSITIVE_INFINITY
        if (a < 0 && b != floor(b)) {
            if (oddDen) {
                // real odd root: (-8)^(1/3) = -2 ; sign follows the numerator parity
                val r = abs(a).pow(b)
                return if (isOddNumerator(b)) -r else r
            }
            return bad("Negative base with a non-integer exponent has no real value")
        }
        val r = a.pow(b)
        if (strict && r.isInfinite() && a.isFinite() && b.isFinite()) throw com.quantumath.math.core.OverflowError()
        return r
    }

    private fun isOddNumerator(b: Double): Boolean {
        val r = com.quantumath.math.core.Rational.fromDouble(b, 1000) ?: return false
        return r.num.testBit(0)
    }

    private fun call(e: Expr.Call, vars: List<String>): (DoubleArray) -> Double {
        val args = e.args.map { c(it, vars) }
        val a0 = args.getOrNull(0)
        val a1 = args.getOrNull(1)
        return when (e.fn) {
            "sin" -> { x -> sin(toRad(a0!!(x))) }
            "cos" -> { x -> cos(toRad(a0!!(x))) }
            "tan" -> { x -> val t = toRad(a0!!(x)); if (abs(cos(t)) < 1e-15) bad("tan is undefined at odd multiples of 90°") else tan(t) }
            "sec" -> { x -> val cv = cos(toRad(a0!!(x))); if (abs(cv) < 1e-15) bad("sec is undefined here") else 1 / cv }
            "csc" -> { x -> val sv = sin(toRad(a0!!(x))); if (abs(sv) < 1e-15) bad("csc is undefined here") else 1 / sv }
            "cot" -> { x -> val sv = sin(toRad(a0!!(x))); if (abs(sv) < 1e-15) bad("cot is undefined here") else cos(toRad(a0(x))) / sv }
            "asin" -> { x -> val v = a0!!(x); if (v < -1 || v > 1) bad("asin requires -1 ≤ x ≤ 1") else fromRad(asin(v)) }
            "acos" -> { x -> val v = a0!!(x); if (v < -1 || v > 1) bad("acos requires -1 ≤ x ≤ 1") else fromRad(acos(v)) }
            "atan" -> { x -> fromRad(atan(a0!!(x))) }
            "acot" -> { x -> val v = a0!!(x); fromRad(if (v == 0.0) PI / 2 else atan(1 / v) + if (v < 0) PI else 0.0) }
            "asec" -> { x -> val v = a0!!(x); if (abs(v) < 1) bad("asec requires |x| ≥ 1") else fromRad(acos(1 / v)) }
            "acsc" -> { x -> val v = a0!!(x); if (abs(v) < 1) bad("acsc requires |x| ≥ 1") else fromRad(asin(1 / v)) }
            "sinh" -> { x -> sinh(a0!!(x)) }
            "cosh" -> { x -> cosh(a0!!(x)) }
            "tanh" -> { x -> tanh(a0!!(x)) }
            "asinh" -> { x -> asinh(a0!!(x)) }
            "acosh" -> { x -> val v = a0!!(x); if (v < 1) bad("acosh requires x ≥ 1") else acosh(v) }
            "atanh" -> { x -> val v = a0!!(x); if (v <= -1 || v >= 1) bad("atanh requires -1 < x < 1") else atanh(v) }
            "ln" -> { x -> val v = a0!!(x); if (v <= 0) bad("ln requires x > 0") else ln(v) }
            "log10" -> { x -> val v = a0!!(x); if (v <= 0) bad("log requires x > 0") else log10(v) }
            "log2" -> { x -> val v = a0!!(x); if (v <= 0) bad("log₂ requires x > 0") else log2(v) }
            "log" -> { x ->
                val v = a0!!(x); val b = a1!!(x)
                if (v <= 0) bad("log requires x > 0") else if (b <= 0 || b == 1.0) bad("log base must be positive and ≠ 1") else ln(v) / ln(b)
            }
            "exp" -> { x -> val r = exp(a0!!(x)); if (strict && r.isInfinite()) throw com.quantumath.math.core.OverflowError() else r }
            "sqrt" -> { x -> val v = a0!!(x); if (v < 0) bad("√ of a negative number is not real") else sqrt(v) }
            "cbrt" -> { x -> cbrt(a0!!(x)) }
            "root" -> { x ->
                val v = a0!!(x); val n = a1!!(x)
                if (n == 0.0) bad("0th root is undefined")
                else if (v < 0 && n == floor(n) && n.toLong() % 2 != 0L) -abs(v).pow(1 / n)
                else if (v < 0) bad("even root of a negative number is not real")
                else v.pow(1 / n)
            }
            "abs" -> { x -> abs(a0!!(x)) }
            "floor" -> { x -> floor(a0!!(x)) }
            "ceil" -> { x -> ceil(a0!!(x)) }
            "round" -> if (a1 == null) { x -> Math.round(a0!!(x)).toDouble() } else { x -> val m = 10.0.pow(a1(x)); Math.round(a0!!(x) * m) / m }
            "sign" -> { x -> sign(a0!!(x)) }
            "min" -> { x -> args.minOf { it(x) } }
            "max" -> { x -> args.maxOf { it(x) } }
            "mod" -> { x -> val b = a1!!(x); if (b == 0.0) (if (strict) throw DivisionByZero() else Double.NaN) else { val a = a0!!(x); a - b * floor(a / b) } }
            "gcd", "lcm" -> { x ->
                val a = a0!!(x); val b = a1!!(x)
                if (a != floor(a) || b != floor(b)) bad("${e.fn} requires integers")
                else {
                    val g = java.math.BigInteger.valueOf(a.toLong()).gcd(java.math.BigInteger.valueOf(b.toLong())).toDouble()
                    if (e.fn == "gcd") g else if (g == 0.0) 0.0 else abs(a / g * b)
                }
            }
            "nCr" -> { x -> binom(a0!!(x), a1!!(x)) }
            "nPr" -> { x -> val n = a0!!(x); val k = a1!!(x); if (!isNonNegInt(n) || !isNonNegInt(k) || k > n) bad("nPr requires integers 0 ≤ r ≤ n") else { var r = 1.0; for (i in 0 until k.toInt()) r *= (n - i); r } }
            "gamma" -> { x -> gamma(a0!!(x)) }
            "re", "im", "arg", "conj" -> throw Unsupported("${e.fn} is available in complex mode")
            else -> throw Unsupported("Unknown function ${e.fn}")
        }
    }

    private fun isNonNegInt(v: Double) = v >= 0 && v == floor(v)

    private fun binom(n: Double, k: Double): Double {
        if (!isNonNegInt(n) || !isNonNegInt(k)) return bad("nCr requires non-negative integers")
        if (k > n) return 0.0
        var r = 1.0
        val kk = min(k, n - k).toInt()
        for (i in 1..kk) r = r * (n - kk + i) / i
        return Math.rint(r)
    }

    fun factorial(v: Double): Double {
        if (v.isNaN()) return v
        if (v == floor(v)) {
            if (v < 0) return bad("Factorial of a negative integer is undefined")
            if (v > 170) return if (strict) throw com.quantumath.math.core.OverflowError("${v.toLong()}! exceeds double precision; use the high-precision calculator") else Double.POSITIVE_INFINITY
            var r = 1.0
            for (i in 2..v.toInt()) r *= i
            return r
        }
        return gamma(v + 1)
    }

    companion object {
        private val LANCZOS = doubleArrayOf(
            0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
            -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
        )

        /** Lanczos approximation (g = 7), ~15 significant digits. */
        fun gammaRaw(x: Double): Double {
            if (x < 0.5) return PI / (sin(PI * x) * gammaRaw(1 - x))
            val xx = x - 1
            var a = LANCZOS[0]
            val t = xx + 7.5
            for (i in 1 until 9) a += LANCZOS[i] / (xx + i)
            return sqrt(2 * PI) * t.pow(xx + 0.5) * exp(-t) * a
        }
    }

    fun gamma(x: Double): Double {
        if (x == floor(x) && x <= 0) return bad("Γ is undefined at non-positive integers")
        return gammaRaw(x)
    }
}
