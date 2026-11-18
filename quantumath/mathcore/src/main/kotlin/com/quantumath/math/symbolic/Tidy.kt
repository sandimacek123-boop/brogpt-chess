package com.quantumath.math.symbolic

import com.quantumath.math.core.Rational
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Expr

/**
 * Local, display-oriented simplification. Every rule is an identity valid wherever the input is
 * defined (e.g. 0·f = 0 is only applied when f has no division by zero issues we could hide —
 * we accept it as standard CAS practice and state domains separately in solvers).
 */
object Tidy {
    private fun rat(e: Expr): Rational? = when (e) {
        is Expr.Frac -> e.value
        is Expr.Num -> Rational.of(e.value)
        is Expr.Neg -> rat(e.arg)?.let { -it }
        else -> null
    }
    private fun k(r: Rational): Expr = if (r.signum < 0) Expr.Neg(Expr.Frac(-r)) else Expr.Frac(r)
    private fun isZero(e: Expr) = rat(e)?.isZero == true
    private fun isOne(e: Expr) = rat(e) == Rational.ONE

    fun tidy(e: Expr): Expr {
        var cur = e
        repeat(6) {
            val next = step(cur)
            if (next == cur) return next
            cur = next
        }
        return cur
    }

    private fun step(e: Expr): Expr = when (e) {
        is Expr.Num -> Expr.Frac(Rational.of(e.value))
        is Expr.Frac, is Expr.Var, is Expr.Const -> e
        is Expr.Neg -> neg(step(e.arg))
        is Expr.Add -> add(step(e.left), step(e.right))
        is Expr.Sub -> {
            val l = step(e.left); val r = step(e.right)
            when {
                isZero(r) -> l
                isZero(l) -> neg(r)
                l == r -> Expr.Frac(Rational.ZERO)
                rat(l) != null && rat(r) != null -> k(rat(l)!! - rat(r)!!)
                r is Expr.Neg -> add(l, r.arg)
                rat(r) != null && rat(r)!!.signum < 0 -> add(l, k(-rat(r)!!))
                else -> Expr.Sub(l, r)
            }
        }
        is Expr.Mul -> mul(step(e.left), step(e.right))
        is Expr.Div -> {
            val l = step(e.left); val r = step(e.right)
            when {
                isOne(r) -> l
                isZero(l) && !isZero(r) -> Expr.Frac(Rational.ZERO)
                rat(l) != null && rat(r) != null && !rat(r)!!.isZero -> k(rat(l)!! / rat(r)!!)
                l == r && rat(l) == null -> Expr.Frac(Rational.ONE)
                l is Expr.Neg -> neg(Expr.Div(l.arg, r))
                // (c·f)/d with numeric c, d → (c/d)·f
                l is Expr.Mul && rat(l.left) != null && rat(r) != null && !rat(r)!!.isZero -> mul(k(rat(l.left)!! / rat(r)!!), l.right)
                // f / (1/g) → f·g ;  f/(c) → (1/c)·f
                rat(r) != null && !rat(r)!!.isZero && rat(l) == null -> mul(k(rat(r)!!.reciprocal()), l)
                else -> Expr.Div(l, r)
            }
        }
        is Expr.Pow -> {
            val b = step(e.base); val x = step(e.exp)
            val xr = rat(x)
            val br = rat(b)
            when {
                xr?.isZero == true -> Expr.Frac(Rational.ONE)
                xr == Rational.ONE -> b
                isOne(b) -> Expr.Frac(Rational.ONE)
                br != null && xr != null && xr.isInteger && xr.num.abs() <= java.math.BigInteger.valueOf(64) && !(br.isZero && xr.signum < 0) -> k(br.pow(xr.num.toInt()))
                b is Expr.Pow && xr != null && xr.isInteger && rat(b.exp) != null -> Expr.Pow(b.base, k(rat(b.exp)!! * xr)).let { step(it) }
                xr == Rational.HALF -> Expr.Call("sqrt", listOf(b))
                else -> Expr.Pow(b, x)
            }
        }
        is Expr.Fact -> { val a = step(e.arg); RationalEval.tryEval(Expr.Fact(a))?.let { k(it) } ?: Expr.Fact(a) }
        is Expr.Percent -> step(Expr.Div(e.arg, Expr.Frac(Rational.of(100))))
        is Expr.Call -> {
            val args = e.args.map { step(it) }
            Algebra.exactCall(e.fn, args) ?: Expr.Call(e.fn, args)
        }
    }

    /** Canonical negation: -(-a) = a, -(c) folded, -(c·a) with c < 0 → |c|·a; otherwise Neg(a). */
    private fun neg(a: Expr): Expr {
        val ra = rat(a)
        return when {
            a is Expr.Neg -> a.arg
            ra != null -> k(-ra)
            a is Expr.Mul && rat(a.left) != null && rat(a.left)!!.signum < 0 -> Expr.Mul(k(-rat(a.left)!!), a.right)
            else -> Expr.Neg(a)
        }
    }

    private fun add(l: Expr, r: Expr): Expr = when {
        isZero(l) -> r
        isZero(r) -> l
        rat(l) != null && rat(r) != null -> k(rat(l)!! + rat(r)!!)
        r is Expr.Neg -> Expr.Sub(l, r.arg)
        rat(r) != null && rat(r)!!.signum < 0 -> Expr.Sub(l, k(-rat(r)!!))
        l == r -> mul(Expr.Frac(Rational.TWO), l)
        else -> Expr.Add(l, r)
    }

    private fun mul(l: Expr, r: Expr): Expr {
        val lr = rat(l); val rr = rat(r)
        return when {
            lr?.isZero == true || rr?.isZero == true -> Expr.Frac(Rational.ZERO)
            lr == Rational.ONE -> r
            rr == Rational.ONE -> l
            lr == Rational.MINUS_ONE -> neg(r)
            rr == Rational.MINUS_ONE -> neg(l)
            lr != null && rr != null -> k(lr * rr)
            // numbers to the front, merge numeric coefficients
            rr != null -> mul(r, l)
            lr != null && lr.signum < 0 -> neg(mul(k(-lr), r))
            lr != null && r is Expr.Mul && rat(r.left) != null -> mul(k(lr * rat(r.left)!!), r.right)
            lr != null && r is Expr.Neg -> neg(mul(l, r.arg))
            lr != null -> Expr.Mul(l, r)
            l is Expr.Neg -> neg(mul(l.arg, r))
            r is Expr.Neg -> neg(mul(l, r.arg))
            l is Expr.Mul && rat(l.left) != null -> mul(l.left, mul(l.right, r))
            // x·x = x², x^a·x^b = x^(a+b)
            l == r && lr == null -> Expr.Pow(l, Expr.Frac(Rational.TWO))
            l is Expr.Pow && l.base == r && rat(l.exp) != null -> Expr.Pow(r, k(rat(l.exp)!! + Rational.ONE))
            r is Expr.Pow && r.base == l && rat(r.exp) != null -> Expr.Pow(l, k(rat(r.exp)!! + Rational.ONE))
            l is Expr.Pow && r is Expr.Pow && l.base == r.base && rat(l.exp) != null && rat(r.exp) != null -> Expr.Pow(l.base, k(rat(l.exp)!! + rat(r.exp)!!))
            // (1/a)·b → b/a
            l is Expr.Div && isOne(l.left) -> Expr.Div(r, l.right)
            else -> Expr.Mul(l, r)
        }
    }
}
