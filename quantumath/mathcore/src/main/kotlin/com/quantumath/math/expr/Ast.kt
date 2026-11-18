package com.quantumath.math.expr

import com.quantumath.math.core.Rational
import java.math.BigDecimal

/**
 * Expression tree. Numbers keep their exact decimal literal (BigDecimal) so the
 * high-precision evaluator never sees binary floating-point rounding of the input.
 */
sealed class Expr {
    data class Num(val value: BigDecimal) : Expr() {
        constructor(r: Rational) : this(r.toBigDecimalOrNull() ?: BigDecimal.ZERO)
        val rational: Rational get() = Rational.of(value)
    }
    /** Exact rational constant produced by symbolic manipulation (e.g. 1/3). */
    data class Frac(val value: Rational) : Expr()
    data class Var(val name: String) : Expr()
    data class Const(val name: String) : Expr() // pi, e, phi, tau, i
    data class Neg(val arg: Expr) : Expr()
    data class Add(val left: Expr, val right: Expr) : Expr()
    data class Sub(val left: Expr, val right: Expr) : Expr()
    data class Mul(val left: Expr, val right: Expr) : Expr()
    data class Div(val left: Expr, val right: Expr) : Expr()
    data class Pow(val base: Expr, val exp: Expr) : Expr()
    data class Fact(val arg: Expr) : Expr()
    data class Percent(val arg: Expr) : Expr()
    data class Call(val fn: String, val args: List<Expr>) : Expr()

    fun containsVar(v: String): Boolean = when (this) {
        is Var -> name == v
        is Num, is Frac, is Const -> false
        is Neg -> arg.containsVar(v)
        is Add -> left.containsVar(v) || right.containsVar(v)
        is Sub -> left.containsVar(v) || right.containsVar(v)
        is Mul -> left.containsVar(v) || right.containsVar(v)
        is Div -> left.containsVar(v) || right.containsVar(v)
        is Pow -> base.containsVar(v) || exp.containsVar(v)
        is Fact -> arg.containsVar(v)
        is Percent -> arg.containsVar(v)
        is Call -> args.any { it.containsVar(v) }
    }

    fun variables(out: MutableSet<String> = sortedSetOf()): Set<String> {
        when (this) {
            is Var -> out.add(name)
            is Num, is Frac, is Const -> {}
            is Neg -> arg.variables(out)
            is Add -> { left.variables(out); right.variables(out) }
            is Sub -> { left.variables(out); right.variables(out) }
            is Mul -> { left.variables(out); right.variables(out) }
            is Div -> { left.variables(out); right.variables(out) }
            is Pow -> { base.variables(out); exp.variables(out) }
            is Fact -> arg.variables(out)
            is Percent -> arg.variables(out)
            is Call -> args.forEach { it.variables(out) }
        }
        return out
    }

    /** Replace a variable by an expression everywhere. */
    fun substitute(v: String, with: Expr): Expr = when (this) {
        is Var -> if (name == v) with else this
        is Num, is Frac, is Const -> this
        is Neg -> Neg(arg.substitute(v, with))
        is Add -> Add(left.substitute(v, with), right.substitute(v, with))
        is Sub -> Sub(left.substitute(v, with), right.substitute(v, with))
        is Mul -> Mul(left.substitute(v, with), right.substitute(v, with))
        is Div -> Div(left.substitute(v, with), right.substitute(v, with))
        is Pow -> Pow(base.substitute(v, with), exp.substitute(v, with))
        is Fact -> Fact(arg.substitute(v, with))
        is Percent -> Percent(arg.substitute(v, with))
        is Call -> Call(fn, args.map { it.substitute(v, with) })
    }

    override fun toString(): String = Printer.print(this)
}

private fun Rational.toBigDecimalOrNull(): BigDecimal? =
    try { BigDecimal(num).divide(BigDecimal(den)) } catch (_: ArithmeticException) { null }

fun num(v: Long) = Expr.Frac(Rational.of(v))
fun num(r: Rational) = Expr.Frac(r)
val X = Expr.Var("x")

/** A relation between two sides: =, <, >, ≤, ≥ */
data class Relation(val left: Expr, val op: String, val right: Expr) {
    override fun toString() = "${Printer.print(left)} $op ${Printer.print(right)}"
}
