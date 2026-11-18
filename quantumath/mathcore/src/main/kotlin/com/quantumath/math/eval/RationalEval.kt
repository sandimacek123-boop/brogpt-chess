package com.quantumath.math.eval

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.expr.Expr
import java.math.BigInteger

/** Exact evaluation over ℚ. Returns null when the expression is not closed over the rationals. */
object RationalEval {
    fun tryEval(e: Expr, env: Map<String, Rational> = emptyMap()): Rational? = try { ev(e, env) } catch (_: MathError) { null } catch (_: ArithmeticException) { null }

    private fun ev(e: Expr, env: Map<String, Rational>): Rational? = when (e) {
        is Expr.Num -> Rational.of(e.value)
        is Expr.Frac -> e.value
        is Expr.Var -> env[e.name]
        is Expr.Const -> null
        is Expr.Neg -> ev(e.arg, env)?.let { -it }
        is Expr.Add -> ev(e.left, env)?.let { a -> ev(e.right, env)?.let { a + it } }
        is Expr.Sub -> ev(e.left, env)?.let { a -> ev(e.right, env)?.let { a - it } }
        is Expr.Mul -> ev(e.left, env)?.let { a -> ev(e.right, env)?.let { a * it } }
        is Expr.Div -> ev(e.left, env)?.let { a -> ev(e.right, env)?.let { a / it } }
        is Expr.Pow -> {
            val b = ev(e.base, env)
            val x = ev(e.exp, env)
            if (b == null || x == null || !x.isInteger || x.num.abs() > BigInteger.valueOf(10_000)) null
            else b.pow(x.num.toInt())
        }
        is Expr.Percent -> ev(e.arg, env)?.let { it / Rational.of(100) }
        is Expr.Fact -> ev(e.arg, env)?.let { r ->
            if (!r.isInteger || r.signum < 0 || r.num > BigInteger.valueOf(1000)) null
            else Rational.of((2..r.num.toInt()).fold(BigInteger.ONE) { acc, i -> acc * BigInteger.valueOf(i.toLong()) })
        }
        is Expr.Call -> {
            val a = e.args.map { ev(it, env) ?: return null }
            when (e.fn) {
                "abs" -> a[0].abs()
                "floor" -> Rational.of(a[0].floor())
                "ceil" -> Rational.of((-a[0]).floor().negate())
                "sign" -> Rational.of(a[0].signum.toLong())
                "min" -> a.minOrNull()
                "max" -> a.maxOrNull()
                "mod" -> if (a[1].isZero) null else a[0] - a[1] * Rational.of((a[0] / a[1]).floor())
                "gcd" -> if (a[0].isInteger && a[1].isInteger) Rational.of(a[0].num.gcd(a[1].num)) else null
                "lcm" -> if (a[0].isInteger && a[1].isInteger) { val g = a[0].num.gcd(a[1].num); if (g.signum() == 0) Rational.ZERO else Rational.of((a[0].num / g * a[1].num).abs()) } else null
                "nCr" -> if (a[0].isInteger && a[1].isInteger && a[0].signum >= 0 && a[1].signum >= 0 && a[0].num <= BigInteger.valueOf(100_000)) Rational.of(com.quantumath.math.numbertheory.NumberTheory.binomial(a[0].num.toInt(), a[1].num.toInt())) else null
                "nPr" -> if (a[0].isInteger && a[1].isInteger && a[0].signum >= 0 && a[1].signum >= 0 && a[1] <= a[0] && a[0].num <= BigInteger.valueOf(100_000)) Rational.of(com.quantumath.math.numbertheory.NumberTheory.permutations(a[0].num.toInt(), a[1].num.toInt())) else null
                else -> null
            }
        }
    }
}
