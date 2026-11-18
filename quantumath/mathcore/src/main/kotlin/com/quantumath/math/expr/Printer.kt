package com.quantumath.math.expr

import com.quantumath.math.core.Rational
import java.math.BigDecimal

/** Minimal-parenthesis printer. `unicode` uses superscripts, π and · for display. */
object Printer {
    private const val P_SUM = 1
    private const val P_PROD = 2
    private const val P_NEG = 3
    private const val P_POW = 4
    private const val P_POST = 5
    private const val P_ATOM = 6

    private val SUP = mapOf('0' to '⁰', '1' to '¹', '2' to '²', '3' to '³', '4' to '⁴', '5' to '⁵', '6' to '⁶', '7' to '⁷', '8' to '⁸', '9' to '⁹', '-' to '⁻')

    fun print(e: Expr, unicode: Boolean = false): String = Ctx(unicode).p(e)

    private fun prec(e: Expr): Int = when (e) {
        is Expr.Add, is Expr.Sub -> P_SUM
        is Expr.Mul, is Expr.Div -> P_PROD
        is Expr.Frac -> if (e.value.isInteger) (if (e.value.signum < 0) P_NEG else P_ATOM) else P_PROD
        is Expr.Num -> if (e.value.signum() < 0) P_NEG else P_ATOM
        is Expr.Neg -> P_NEG
        is Expr.Pow -> P_POW
        is Expr.Fact, is Expr.Percent -> P_POST
        else -> P_ATOM
    }

    private class Ctx(val u: Boolean) {
        fun wrap(e: Expr, need: Boolean) = if (need) "(${p(e)})" else p(e)

        fun numStr(v: BigDecimal): String {
            val s = v.stripTrailingZeros()
            return if (s.scale() < 0 && s.precision() - s.scale() <= 20) s.setScale(0).toPlainString()
            else if (s.abs() >= BigDecimal("1e-6") && s.abs() < BigDecimal("1e20")) s.toPlainString() else s.toString()
        }

        fun isNumeric(e: Expr) = e is Expr.Num || e is Expr.Frac

        fun p(e: Expr): String = when (e) {
            is Expr.Num -> numStr(e.value)
            is Expr.Frac -> e.value.toString()
            is Expr.Var -> e.name
            is Expr.Const -> if (u) when (e.name) { "pi" -> "π"; "phi" -> "φ"; "tau" -> "τ"; else -> e.name } else e.name
            is Expr.Neg -> "-" + wrap(e.arg, prec(e.arg) < P_POW)
            is Expr.Add -> {
                val r = e.right
                // a + (-b) prints as a - b
                if (r is Expr.Neg) "${p(e.left)} - ${wrap(r.arg, prec(r.arg) <= P_SUM)}"
                else if ((r is Expr.Num && r.value.signum() < 0)) "${p(e.left)} - ${numStr(r.value.negate())}"
                else if (r is Expr.Frac && r.value.signum < 0) "${p(e.left)} - ${p(Expr.Frac(-r.value))}"
                else "${p(e.left)} + ${wrap(r, prec(r) < P_SUM)}"
            }
            is Expr.Sub -> "${p(e.left)} - ${wrap(e.right, prec(e.right) <= P_SUM)}"
            is Expr.Mul -> mul(e)
            is Expr.Div -> "${wrap(e.left, prec(e.left) < P_PROD)}/${wrap(e.right, prec(e.right) <= P_PROD || prec(e.right) == P_NEG)}"
            is Expr.Pow -> {
                val base = wrap(e.base, prec(e.base) <= P_POW || e.base is Expr.Frac)
                val ex = e.exp
                if (u && (ex is Expr.Num && ex.value.stripTrailingZeros().scale() <= 0 && ex.value.abs() < BigDecimal(1000)) ) base + ex.value.stripTrailingZeros().toPlainString().map { SUP[it] ?: it }.joinToString("")
                else if (u && ex is Expr.Frac && ex.value.isInteger && ex.value.abs() < Rational.of(1000)) base + ex.value.toString().map { SUP[it] ?: it }.joinToString("")
                else "$base^${wrap(ex, prec(ex) < P_POW || ex is Expr.Neg || (ex is Expr.Frac && !(ex.value.isInteger && ex.value.signum >= 0)) || ex is Expr.Pow)}"
            }
            is Expr.Fact -> wrap(e.arg, prec(e.arg) < P_ATOM) + "!"
            is Expr.Percent -> wrap(e.arg, prec(e.arg) < P_ATOM) + "%"
            is Expr.Call -> when {
                e.fn == "abs" -> "|${p(e.args[0])}|"
                e.fn == "sqrt" && u -> "√" + wrap(e.args[0], prec(e.args[0]) < P_ATOM)
                else -> "${e.fn}(${e.args.joinToString(", ") { p(it) }})"
            }
        }

        fun mul(e: Expr.Mul): String {
            val l = e.left
            val r = e.right
            // -1·x → -x
            if (l is Expr.Frac && l.value == Rational.MINUS_ONE) return "-" + wrap(r, prec(r) < P_POW)
            // (p/q)·x → px/q, e.g. (1/6)·π → π/6
            if (l is Expr.Frac && !l.value.isInteger) {
                val v = l.value
                val rs0 = wrap(r, prec(r) <= P_PROD)
                val pn = v.num.abs()
                val head = if (pn == java.math.BigInteger.ONE) rs0 else "$pn" + (if (rs0.first().isLetter() || rs0.first() == '(' || rs0.first() == 'π' || rs0.first() == '√') rs0 else (if (u) "·" else "*") + rs0)
                return (if (v.signum < 0) "-" else "") + head + "/" + v.den
            }
            val ls = wrap(l, prec(l) < P_PROD)
            val rs = wrap(r, prec(r) < P_PROD || r is Expr.Neg || (r is Expr.Num && r.value.signum() < 0) || (r is Expr.Frac && (!r.value.isInteger || r.value.signum < 0)))
            val first = rs.firstOrNull() ?: ' '
            val rStartsSymbol = first.isLetter() || first == '(' || first == 'π' || first == '√' || first == '|'
            val lIsNumber = isNumeric(l) && prec(l) == P_ATOM
            val lIsSymbolic = l is Expr.Var || l is Expr.Const || (l is Expr.Pow && (l.base is Expr.Var || l.base is Expr.Const)) || (l is Expr.Mul && ls.lastOrNull()?.let { it.isLetter() || it == ')' } == true && ls.none { it == '*' || it == '·' })
            // implicit multiplication when unambiguous: 2x, 2sin(x), 3(x+1), xy, x²y
            val implicit = (lIsNumber && rStartsSymbol && !(r is Expr.Const && r.name == "e" && false)) ||
                (lIsSymbolic && first.isLetter() && !(ls.last().isLetter() && r is Expr.Call)) || (lIsSymbolic && first == '(') ||
                (ls.endsWith(")") && first == '(')
            return if (implicit) ls + rs else "$ls${if (u) "·" else "*"}$rs"
        }
    }
}
