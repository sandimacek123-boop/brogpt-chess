package com.quantumath.math.symbolic

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.core.Unsupported
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Printer
import com.quantumath.math.numeric.Differentiate
import com.quantumath.math.numeric.Integrate
import com.quantumath.math.numeric.Limits
import com.quantumath.math.numeric.Roots
import kotlin.math.abs
import kotlin.math.max

data class Step(val rule: String, val detail: String)

object Derivative {
    private fun c(r: Long) = Expr.Frac(Rational.of(r))
    private val ONE = c(1); private val ZERO = c(0)
    private fun isConst(e: Expr, v: String) = !e.containsVar(v)

    data class Result(val derivative: Expr, val steps: List<Step>)

    fun differentiate(e: Expr, v: String = "x"): Result {
        val steps = ArrayList<Step>()
        val raw = d(e, v, steps)
        val tidy = Tidy.tidy(raw)
        return Result(tidy, steps.take(40))
    }

    /** n-th derivative (tidied after each step). */
    fun nth(e: Expr, v: String, n: Int): Expr { var r = e; repeat(n) { r = differentiate(r, v).derivative }; return r }

    private fun p(e: Expr) = Printer.print(e, unicode = true)

    private fun d(e: Expr, v: String, s: MutableList<Step>): Expr {
        if (isConst(e, v)) return ZERO
        return when (e) {
            is Expr.Var -> ONE
            is Expr.Neg -> Expr.Neg(d(e.arg, v, s))
            is Expr.Add -> { s += Step("Sum rule", "d/d$v[${p(e)}] = d/d$v[${p(e.left)}] + d/d$v[${p(e.right)}]"); Expr.Add(d(e.left, v, s), d(e.right, v, s)) }
            is Expr.Sub -> { s += Step("Difference rule", "d/d$v[${p(e)}] = d/d$v[${p(e.left)}] − d/d$v[${p(e.right)}]"); Expr.Sub(d(e.left, v, s), d(e.right, v, s)) }
            is Expr.Mul -> when {
                isConst(e.left, v) -> { s += Step("Constant multiple", "d/d$v[${p(e)}] = ${p(e.left)}·d/d$v[${p(e.right)}]"); Expr.Mul(e.left, d(e.right, v, s)) }
                isConst(e.right, v) -> { s += Step("Constant multiple", "d/d$v[${p(e)}] = ${p(e.right)}·d/d$v[${p(e.left)}]"); Expr.Mul(e.right, d(e.left, v, s)) }
                else -> {
                    s += Step("Product rule", "(fg)′ = f′g + fg′ with f = ${p(e.left)}, g = ${p(e.right)}")
                    Expr.Add(Expr.Mul(d(e.left, v, s), e.right), Expr.Mul(e.left, d(e.right, v, s)))
                }
            }
            is Expr.Div -> when {
                isConst(e.right, v) -> { s += Step("Constant divisor", "d/d$v[f/c] = f′/c with c = ${p(e.right)}"); Expr.Div(d(e.left, v, s), e.right) }
                else -> {
                    s += Step("Quotient rule", "(f/g)′ = (f′g − fg′)/g² with f = ${p(e.left)}, g = ${p(e.right)}")
                    Expr.Div(Expr.Sub(Expr.Mul(d(e.left, v, s), e.right), Expr.Mul(e.left, d(e.right, v, s))), Expr.Pow(e.right, c(2)))
                }
            }
            is Expr.Pow -> when {
                isConst(e.exp, v) -> {
                    s += Step(if (e.base is Expr.Var) "Power rule" else "Power rule + chain rule", "d/d$v[u^n] = n·u^(n−1)·u′ with u = ${p(e.base)}, n = ${p(e.exp)}")
                    Expr.Mul(Expr.Mul(e.exp, Expr.Pow(e.base, Tidy.tidy(Expr.Sub(e.exp, ONE)))), d(e.base, v, s))
                }
                isConst(e.base, v) -> {
                    s += Step("Exponential rule", "d/d$v[a^u] = a^u·ln(a)·u′ with a = ${p(e.base)}")
                    val lnA: Expr = if (e.base == Expr.Const("e")) ONE else Expr.Call("ln", listOf(e.base))
                    Expr.Mul(Expr.Mul(e, lnA), d(e.exp, v, s))
                }
                else -> {
                    s += Step("Logarithmic differentiation", "d/d$v[f^g] = f^g·(g′·ln f + g·f′/f)")
                    Expr.Mul(e, Expr.Add(Expr.Mul(d(e.exp, v, s), Expr.Call("ln", listOf(e.base))), Expr.Div(Expr.Mul(e.exp, d(e.base, v, s)), e.base)))
                }
            }
            is Expr.Percent -> Expr.Div(d(e.arg, v, s), c(100))
            is Expr.Fact -> throw Unsupported("Derivative of a factorial is not supported (n! is defined on integers)")
            is Expr.Call -> call(e, v, s)
            else -> throw Unsupported("Cannot differentiate ${p(e)}")
        }
    }

    private fun call(e: Expr.Call, v: String, s: MutableList<Step>): Expr {
        val u = e.args[0]
        val du = d(u, v, s)
        fun chain(outer: Expr, rule: String): Expr {
            s += Step(if (u is Expr.Var) rule else "$rule + chain rule", "d/d$v[${p(e)}] = ${p(outer)}${if (u is Expr.Var) "" else " · d/d$v[${p(u)}]"}")
            return Expr.Mul(outer, du)
        }
        fun f(n: String, vararg a: Expr) = Expr.Call(n, a.toList())
        return when (e.fn) {
            "sin" -> chain(f("cos", u), "d/dx sin = cos")
            "cos" -> chain(Expr.Neg(f("sin", u)), "d/dx cos = −sin")
            "tan" -> chain(Expr.Div(ONE, Expr.Pow(f("cos", u), c(2))), "d/dx tan = sec²")
            "sec" -> chain(Expr.Mul(f("sec", u), f("tan", u)), "d/dx sec = sec·tan")
            "csc" -> chain(Expr.Neg(Expr.Mul(f("csc", u), f("cot", u))), "d/dx csc = −csc·cot")
            "cot" -> chain(Expr.Neg(Expr.Div(ONE, Expr.Pow(f("sin", u), c(2)))), "d/dx cot = −csc²")
            "asin" -> chain(Expr.Div(ONE, f("sqrt", Expr.Sub(ONE, Expr.Pow(u, c(2))))), "d/dx asin = 1/√(1−x²)")
            "acos" -> chain(Expr.Neg(Expr.Div(ONE, f("sqrt", Expr.Sub(ONE, Expr.Pow(u, c(2)))))), "d/dx acos = −1/√(1−x²)")
            "atan" -> chain(Expr.Div(ONE, Expr.Add(ONE, Expr.Pow(u, c(2)))), "d/dx atan = 1/(1+x²)")
            "acot" -> chain(Expr.Neg(Expr.Div(ONE, Expr.Add(ONE, Expr.Pow(u, c(2))))), "d/dx acot = −1/(1+x²)")
            "sinh" -> chain(f("cosh", u), "d/dx sinh = cosh")
            "cosh" -> chain(f("sinh", u), "d/dx cosh = sinh")
            "tanh" -> chain(Expr.Div(ONE, Expr.Pow(f("cosh", u), c(2))), "d/dx tanh = sech²")
            "asinh" -> chain(Expr.Div(ONE, f("sqrt", Expr.Add(Expr.Pow(u, c(2)), ONE))), "d/dx asinh = 1/√(x²+1)")
            "acosh" -> chain(Expr.Div(ONE, f("sqrt", Expr.Sub(Expr.Pow(u, c(2)), ONE))), "d/dx acosh = 1/√(x²−1)")
            "atanh" -> chain(Expr.Div(ONE, Expr.Sub(ONE, Expr.Pow(u, c(2)))), "d/dx atanh = 1/(1−x²)")
            "ln" -> chain(Expr.Div(ONE, u), "d/dx ln = 1/x")
            "log10" -> chain(Expr.Div(ONE, Expr.Mul(u, f("ln", c(10)))), "d/dx log₁₀ = 1/(x·ln 10)")
            "log2" -> chain(Expr.Div(ONE, Expr.Mul(u, f("ln", c(2)))), "d/dx log₂ = 1/(x·ln 2)")
            "log" -> {
                if (e.args[1].containsVar(v)) return d(Expr.Div(f("ln", u), f("ln", e.args[1])), v, s)
                chain(Expr.Div(ONE, Expr.Mul(u, f("ln", e.args[1]))), "d/dx log_b = 1/(x·ln b)")
            }
            "exp" -> chain(f("exp", u), "d/dx eˣ = eˣ")
            "sqrt" -> chain(Expr.Div(ONE, Expr.Mul(c(2), f("sqrt", u))), "d/dx √x = 1/(2√x)")
            "cbrt" -> chain(Expr.Div(ONE, Expr.Mul(c(3), Expr.Pow(f("cbrt", u), c(2)))), "d/dx ∛x = 1/(3∛x²)")
            "root" -> d(Expr.Pow(u, Expr.Div(ONE, e.args[1])), v, s)
            "abs" -> chain(f("sign", u), "d/dx |x| = sign(x) (x ≠ 0)")
            "floor", "ceil", "round", "sign" -> { s += Step("Piecewise constant", "${e.fn} has derivative 0 wherever it is differentiable"); ZERO }
            else -> throw Unsupported("No differentiation rule for ${e.fn}")
        }
    }
}

object Integrator {
    data class Result(val antiderivative: Expr?, val steps: List<Step>, val verified: Boolean, val message: String)

    private fun c(r: Long) = Expr.Frac(Rational.of(r))
    private fun k(r: Rational): Expr = if (r.signum < 0) Expr.Neg(Expr.Frac(-r)) else Expr.Frac(r)

    /** Indefinite integral; any candidate is verified by differentiation before it is returned. */
    fun integrate(e: Expr, v: String = "x"): Result {
        val steps = ArrayList<Step>()
        val cand = try { integ(Tidy.tidy(e), v, steps, 0) } catch (_: MathError) { null }
        if (cand == null) return Result(null, steps, false, "No antiderivative found. Supported: polynomials, x^n, e^(ax+b), a^(ax+b), sin/cos/tan/sec²/csc² of linear arguments, 1/(ax+b), 1/(1+x²), 1/√(1−x²), sinh/cosh, ln, simple u-substitutions, x^n·(e^x | sin | cos | ln) by parts, and rational functions with linear denominator factors. Use the definite integral for a numerical answer.")
        val anti = Tidy.tidy(cand)
        val ok = verify(anti, e, v)
        return if (ok) Result(anti, steps, true, "Verified: d/d$v of the result equals the integrand at sample points")
        else Result(null, steps, false, "A candidate was found but failed verification, so it is not shown. Use the definite integral for a numerical answer.")
    }

    /** Check F′ = f numerically at points where both are defined. */
    fun verify(anti: Expr, f: Expr, v: String): Boolean {
        val df = try { Derivative.differentiate(anti, v).derivative } catch (_: MathError) { return false }
        val ev = Evaluator(strict = false)
        val a = try { ev.function(df, v) } catch (_: MathError) { return false }
        val b = try { ev.function(f, v) } catch (_: MathError) { return false }
        var checked = 0
        for (x in doubleArrayOf(0.37, 0.81, 1.23, 1.97, 2.61, -0.43, -1.29, 3.7, 0.11, -2.3, 5.1)) {
            val ya = a(x); val yb = b(x)
            if (!ya.isFinite() || !yb.isFinite()) continue
            if (abs(ya - yb) > 1e-7 * max(1.0, abs(yb))) return false
            checked++
        }
        return checked >= 3
    }

    private fun linearIn(u: Expr, v: String): Pair<Rational, Rational>? {
        val t = AtomTable()
        val f = try { Algebra.toRat(u, t) } catch (_: MathError) { return null }
        if (!f.isPolynomial) return null
        val key = t.atoms.entries.firstOrNull { it.value == Expr.Var(v) }?.key ?: return null
        val p = f.num.scale(f.den.constantValue.reciprocal()).asUnivariate(key) ?: return null
        return if (p.degree == 1) p[1] to p[0] else null
    }

    private fun integ(e: Expr, v: String, s: MutableList<Step>, depth: Int): Expr? {
        if (depth > 6) return null
        val X = Expr.Var(v)
        if (!e.containsVar(v)) { s += Step("Constant rule", "∫ c d$v = c·$v"); return Expr.Mul(e, X) }
        when (e) {
            is Expr.Neg -> return integ(e.arg, v, s, depth + 1)?.let { Expr.Neg(it) }
            is Expr.Add -> { s += Step("Sum rule", "∫(f + g) = ∫f + ∫g"); val a = integ(e.left, v, s, depth + 1) ?: return null; val b = integ(e.right, v, s, depth + 1) ?: return null; return Expr.Add(a, b) }
            is Expr.Sub -> { s += Step("Difference rule", "∫(f − g) = ∫f − ∫g"); val a = integ(e.left, v, s, depth + 1) ?: return null; val b = integ(e.right, v, s, depth + 1) ?: return null; return Expr.Sub(a, b) }
            is Expr.Mul -> {
                if (!e.left.containsVar(v)) return integ(e.right, v, s, depth + 1)?.let { s += Step("Constant multiple", "∫ c·f = c·∫f"); Expr.Mul(e.left, it) }
                if (!e.right.containsVar(v)) return integ(e.left, v, s, depth + 1)?.let { s += Step("Constant multiple", "∫ f·c = c·∫f"); Expr.Mul(e.right, it) }
            }
            is Expr.Div -> if (!e.right.containsVar(v)) return integ(e.left, v, s, depth + 1)?.let { Expr.Div(it, e.right) }
            else -> {}
        }
        basic(e, v, s)?.let { return it }
        // polynomial or rational function in v → expand / partial fractions
        rationalFunction(e, v, s)?.let { return it }
        // expand products/powers into sums and retry termwise
        val expanded = try { Algebra.expand(e) } catch (_: MathError) { null }
        if (expanded != null && expanded != e && (expanded is Expr.Add || expanded is Expr.Sub)) {
            s += Step("Expand", "Rewrite as ${Printer.print(expanded, true)}")
            integ(expanded, v, s, depth + 1)?.let { return it }
        }
        uSubstitution(e, v, s)?.let { return it }
        byParts(e, v, s, depth)?.let { return it }
        return null
    }

    /** Table of standard integrals with a linear inner argument u = a·v + b. */
    private fun basic(e: Expr, v: String, s: MutableList<Step>): Expr? {
        val X = Expr.Var(v)
        fun lin(u: Expr) = linearIn(u, v)
        fun over(a: Rational, r: Expr): Expr = if (a == Rational.ONE) r else Expr.Div(r, k(a))
        when {
            e == X -> { s += Step("Power rule", "∫ $v d$v = $v²/2"); return Expr.Div(Expr.Pow(X, c(2)), c(2)) }
            e is Expr.Pow && !e.exp.containsVar(v) -> {
                val l = lin(e.base) ?: return null
                val n = RationalEval.tryEval(e.exp)
                if (n == Rational.MINUS_ONE) { s += Step("Logarithm rule", "∫ 1/u du = ln|u|"); return over(l.first, Expr.Call("ln", listOf(Expr.Call("abs", listOf(e.base))))) }
                val np1 = Tidy.tidy(Expr.Add(e.exp, c(1)))
                s += Step("Power rule", "∫ u^n du = u^(n+1)/(n+1), n ≠ −1" + if (l.first != Rational.ONE || !l.second.isZero) " (with linear substitution u = ${Printer.print(e.base, true)})" else "")
                return over(l.first, Expr.Div(Expr.Pow(e.base, np1), np1))
            }
            e is Expr.Div && !e.left.containsVar(v) -> {
                val l = lin(e.right)
                if (l != null) { s += Step("Logarithm rule", "∫ 1/u du = ln|u|"); return Expr.Mul(e.left, over(l.first, Expr.Call("ln", listOf(Expr.Call("abs", listOf(e.right)))))) }
                val sq = e.right
                if (sq is Expr.Call && sq.fn == "sqrt") {
                    val t = AtomTable(); val f = Algebra.toRat(sq.args[0], t)
                    val key = t.atoms.entries.firstOrNull { it.value == X }?.key
                    val p = key?.let { f.num.asUnivariate(it) }
                    if (f.isPolynomial && p != null && p.degree == 2 && p[1].isZero && p[2].signum < 0 && p[0].signum > 0 && f.den.constantValue == Rational.ONE) {
                        // 1/√(a² − b²x²) → asin(bx/a)/b
                        s += Step("Inverse sine", "∫ 1/√(a² − x²) dx = asin(x/a)")
                        val b = Math.sqrt(-p[2].toDouble()); val a = Math.sqrt(p[0].toDouble())
                        return Expr.Mul(e.left, Expr.Div(Expr.Call("asin", listOf(Expr.Mul(Expr.Div(numberExpr(b), numberExpr(a)), X))), numberExpr(b)))
                    }
                }
                val t = AtomTable(); val f = try { Algebra.toRat(e.right, t) } catch (_: MathError) { return null }
                val key = t.atoms.entries.firstOrNull { it.value == X }?.key ?: return null
                val p = f.num.asUnivariate(key) ?: return null
                if (f.isPolynomial && f.den.constantValue == Rational.ONE && p.degree == 2 && p[1].isZero && p[2].signum > 0 && p[0].signum > 0) {
                    s += Step("Inverse tangent", "∫ 1/(a² + x²) dx = (1/a)·atan(x/a)")
                    val a2 = p[0] / p[2]
                    val (out, inside) = Surd.sqrtOf(a2)
                    val aExpr: Expr = if (inside == java.math.BigInteger.ONE) k(out) else Expr.Mul(k(out), Expr.Call("sqrt", listOf(Expr.Frac(Rational.of(inside)))))
                    return Expr.Div(Expr.Mul(e.left, Expr.Call("atan", listOf(Expr.Div(X, aExpr)))), Expr.Mul(k(p[2]), aExpr))
                }
            }
            e is Expr.Call -> {
                val u = e.args[0]
                val l = lin(u) ?: return null
                val a = l.first
                val r: Expr = when (e.fn) {
                    "sin" -> Expr.Neg(Expr.Call("cos", listOf(u)))
                    "cos" -> Expr.Call("sin", listOf(u))
                    "tan" -> Expr.Neg(Expr.Call("ln", listOf(Expr.Call("abs", listOf(Expr.Call("cos", listOf(u)))))))
                    "exp" -> Expr.Call("exp", listOf(u))
                    "sinh" -> Expr.Call("cosh", listOf(u))
                    "cosh" -> Expr.Call("sinh", listOf(u))
                    "sqrt" -> Expr.Mul(Expr.Frac(Rational.of(2, 3)), Expr.Pow(u, Expr.Frac(Rational.of(3, 2))))
                    "ln" -> Expr.Sub(Expr.Mul(u, Expr.Call("ln", listOf(u))), u)
                    "sec" -> Expr.Call("ln", listOf(Expr.Call("abs", listOf(Expr.Add(Expr.Call("sec", listOf(u)), Expr.Call("tan", listOf(u)))))))
                    "csc" -> Expr.Neg(Expr.Call("ln", listOf(Expr.Call("abs", listOf(Expr.Add(Expr.Call("csc", listOf(u)), Expr.Call("cot", listOf(u))))))))
                    "atan" -> Expr.Sub(Expr.Mul(u, Expr.Call("atan", listOf(u))), Expr.Div(Expr.Call("ln", listOf(Expr.Add(c(1), Expr.Pow(u, c(2))))), c(2)))
                    else -> return null
                }
                s += Step("Standard integral", "∫ ${e.fn}(u) du with u = ${Printer.print(u, true)}" + if (a != Rational.ONE) ", divided by du/d$v = $a" else "")
                return over(a, r)
            }
            e is Expr.Pow && !e.base.containsVar(v) -> {
                val l = lin(e.exp) ?: return null
                s += Step("Exponential rule", "∫ a^u du = a^u / ln a")
                val lnA: Expr = if (e.base == Expr.Const("e")) c(1) else Expr.Call("ln", listOf(e.base))
                return Expr.Div(e, Expr.Mul(k(l.first), lnA))
            }
            e is Expr.Div && e.left is Expr.Frac && e.right is Expr.Pow -> {
                val rp = e.right as Expr.Pow
                if (rp.exp == c(2) && rp.base is Expr.Call) {
                    val inner = rp.base as Expr.Call
                    val l = lin(inner.args[0]) ?: return null
                    if (inner.fn == "cos") { s += Step("Standard integral", "∫ sec²u du = tan u"); return Expr.Mul(e.left, over(l.first, Expr.Call("tan", inner.args))) }
                    if (inner.fn == "sin") { s += Step("Standard integral", "∫ csc²u du = −cot u"); return Expr.Mul(e.left, over(l.first, Expr.Neg(Expr.Call("cot", inner.args)))) }
                }
            }
        }
        return null
    }

    private fun numberExpr(d: Double): Expr = Rational.fromDouble(d, 1000, 1e-13)?.let { k(it) } ?: Expr.Call("sqrt", listOf(k(Rational.fromDouble(d * d, 100000, 1e-12) ?: Rational.ZERO)))

    /** Polynomials and rational functions whose denominator splits into rational linear factors. */
    private fun rationalFunction(e: Expr, v: String, s: MutableList<Step>): Expr? {
        val t = AtomTable()
        val f = try { Algebra.toRat(e, t) } catch (_: MathError) { return null }
        val keys = f.num.atomKeys() + f.den.atomKeys()
        if (keys.size != 1 || t.atoms[keys.first()] != Expr.Var(v)) return null
        val key = keys.first()
        val n = f.num.asUnivariate(key) ?: return null
        val d = f.den.asUnivariate(key) ?: return null
        val X = Expr.Var(v)
        if (d.degree == 0) {
            val p = n.scale(d[0].reciprocal())
            s += Step("Power rule (termwise)", "∫ Σ aₖ$v^k = Σ aₖ$v^(k+1)/(k+1)")
            val anti = Poly(listOf(Rational.ZERO) + p.c.mapIndexed { i, a -> a / Rational.of((i + 1).toLong()) })
            return anti.toExpr(v)
        }
        // polynomial part
        val (q, r) = n.divMod(d)
        val roots = d.rationalRoots()
        val factored = roots.fold(d.monic()) { acc, root -> var a = acc; repeat(d.multiplicity(root)) { a = a.divMod(Poly(listOf(-root, Rational.ONE))).first }; a }
        if (factored.degree != 0) return null // irreducible quadratic factors are not supported here
        s += Step("Partial fractions", "Denominator factors into linear terms with roots ${roots.joinToString(", ")}")
        var result: Expr = if (q.isZero) Expr.Frac(Rational.ZERO) else Poly(listOf(Rational.ZERO) + q.c.mapIndexed { i, a -> a / Rational.of((i + 1).toLong()) }).toExpr(v)
        // coefficients for each (x − r)^-j via the standard formula: A_{j} = (1/(m−j)!)·d^{m−j}/dx^{m−j}[(x−r)^m·R/D] at x = r
        val lead = d.lead
        for (root in roots) {
            val m = d.multiplicity(root)
            var rest = d.scale(lead.reciprocal())
            repeat(m) { rest = rest.divMod(Poly(listOf(-root, Rational.ONE))).first }
            // g(x) = r(x) / (lead·rest(x)); expand g around root via repeated derivatives
            var num = r; var den = rest.scale(lead)
            var fact = Rational.ONE
            for (i in 0 until m) {
                val coef = num.eval(root) / den.eval(root) / fact
                val power = m - i // term coef/(x − root)^power
                val lin = Expr.Sub(X, k(root))
                val term: Expr = if (power == 1) Expr.Mul(k(coef), Expr.Call("ln", listOf(Expr.Call("abs", listOf(lin)))))
                else Expr.Mul(k(-coef / Rational.of((power - 1).toLong())), Expr.Pow(lin, c(-(power - 1).toLong())))
                result = Expr.Add(result, term)
                // derivative of num/den
                val nn = num.derivative() * den - num * den.derivative()
                den *= den
                num = nn
                fact *= Rational.of((i + 1).toLong())
            }
        }
        return result
    }

    /** ∫ g(u)·u′ dx = G(u) for a function argument u whose derivative divides the rest. */
    private fun uSubstitution(e: Expr, v: String, s: MutableList<Step>): Expr? {
        val inners = ArrayList<Expr>()
        fun collect(x: Expr) {
            when (x) {
                is Expr.Call -> { if (x.args[0].containsVar(v) && x.args[0] != Expr.Var(v)) inners += x.args[0]; x.args.forEach { collect(it) } }
                is Expr.Pow -> { if (x.base.containsVar(v) && x.base != Expr.Var(v)) inners += x.base; if (x.exp.containsVar(v)) inners += x.exp; collect(x.base); collect(x.exp) }
                is Expr.Mul -> { collect(x.left); collect(x.right) }
                is Expr.Div -> { collect(x.left); collect(x.right); if (x.right.containsVar(v)) inners += x.right }
                is Expr.Neg -> collect(x.arg)
                else -> {}
            }
        }
        collect(e)
        for (u in inners.distinct()) {
            val du = try { Derivative.differentiate(u, v).derivative } catch (_: MathError) { continue }
            if (!du.containsVar(v) && RationalEval.tryEval(du)?.isZero == true) continue
            // g = e / du must not contain v except through u
            val g = Tidy.tidy(Expr.Div(e, du))
            val w = "ξ" // ξ placeholder
            val replaced = replaceSub(g, u, Expr.Var(w))
            val gNorm = try { Algebra.normalForm(replaced) } catch (_: MathError) { continue }
            if (gNorm.containsVar(v)) continue
            val inner = integ(Tidy.tidy(gNorm), w, ArrayList(), 3) ?: continue
            s += Step("u-substitution", "Let u = ${Printer.print(u, true)}, du = ${Printer.print(du, true)} d$v")
            return inner.substitute(w, u)
        }
        return null
    }

    private fun replaceSub(e: Expr, target: Expr, with: Expr): Expr {
        if (e == target) return with
        return when (e) {
            is Expr.Neg -> Expr.Neg(replaceSub(e.arg, target, with))
            is Expr.Add -> Expr.Add(replaceSub(e.left, target, with), replaceSub(e.right, target, with))
            is Expr.Sub -> Expr.Sub(replaceSub(e.left, target, with), replaceSub(e.right, target, with))
            is Expr.Mul -> Expr.Mul(replaceSub(e.left, target, with), replaceSub(e.right, target, with))
            is Expr.Div -> Expr.Div(replaceSub(e.left, target, with), replaceSub(e.right, target, with))
            is Expr.Pow -> Expr.Pow(replaceSub(e.base, target, with), replaceSub(e.exp, target, with))
            is Expr.Call -> Expr.Call(e.fn, e.args.map { replaceSub(it, target, with) })
            else -> e
        }
    }

    /** Integration by parts for xⁿ·(e^(ax), sin, cos) and xⁿ·ln x (LIATE). */
    private fun byParts(e: Expr, v: String, s: MutableList<Step>, depth: Int): Expr? {
        if (e !is Expr.Mul) return null
        val X = Expr.Var(v)
        fun polyDeg(x: Expr): Int? {
            val t = AtomTable(); val f = try { Algebra.toRat(x, t) } catch (_: MathError) { return null }
            if (!f.isPolynomial) return null
            val keys = f.num.atomKeys()
            if (keys.isEmpty()) return 0
            if (keys.size != 1 || t.atoms[keys.first()] != X) return null
            return f.num.asUnivariate(keys.first())?.degree
        }
        val (a, b) = e.left to e.right
        val (poly, other) = when {
            polyDeg(a) != null && polyDeg(b) == null -> a to b
            polyDeg(b) != null && polyDeg(a) == null -> b to a
            else -> return null
        }
        val isLog = other is Expr.Call && (other.fn == "ln" || other.fn == "atan" || other.fn == "asin")
        return if (isLog) {
            // u = ln-type, dv = poly
            val vPart = integ(poly, v, ArrayList(), depth + 1) ?: return null
            val du = Derivative.differentiate(other, v).derivative
            val rest = integ(Tidy.tidy(Algebra.normalForm(Expr.Mul(vPart, du))), v, ArrayList(), depth + 1) ?: return null
            s += Step("Integration by parts", "∫u dv = uv − ∫v du with u = ${Printer.print(other, true)}, dv = ${Printer.print(poly, true)} d$v")
            Expr.Sub(Expr.Mul(other, vPart), rest)
        } else {
            // u = polynomial, dv = exp/sin/cos
            val vPart = integ(other, v, ArrayList(), depth + 1) ?: return null
            val du = Derivative.differentiate(poly, v).derivative
            val rest = integ(Tidy.tidy(Expr.Mul(du, vPart)), v, ArrayList(), depth + 1) ?: return null
            s += Step("Integration by parts", "∫u dv = uv − ∫v du with u = ${Printer.print(poly, true)}, dv = ${Printer.print(other, true)} d$v")
            Expr.Sub(Expr.Mul(poly, vPart), rest)
        }
    }

    /** Definite integral: symbolic F(b) − F(a) when a verified antiderivative is continuous on [a, b], else adaptive quadrature. */
    data class Definite(val value: Double, val error: Double, val method: String, val exact: Expr?, val converged: Boolean)

    fun definite(e: Expr, v: String, a: Double, b: Double): Definite {
        val f = Evaluator(strict = false).function(e, v)
        val num = Integrate.adaptive(f, a, b)
        val sym = if (a.isFinite() && b.isFinite()) integrate(e, v) else null
        if (sym?.antiderivative != null) {
            val F = Evaluator(strict = false).function(sym.antiderivative, v)
            val exactVal = F(b) - F(a)
            // trust F(b) − F(a) only if quadrature agrees (guards against discontinuities of F inside [a, b])
            if (exactVal.isFinite() && num.converged && abs(exactVal - num.value) <= 1e-6 * max(1.0, abs(exactVal))) {
                return Definite(exactVal, num.error, "Fundamental theorem of calculus: F(b) − F(a) with F = ${Printer.print(sym.antiderivative, true)} (confirmed by quadrature)", sym.antiderivative, true)
            }
        }
        return Definite(num.value, num.error, num.note, null, num.converged)
    }
}

object LimitSolver {
    data class Result(val value: Double?, val display: String, val steps: List<Step>, val exact: Boolean)

    fun limit(e: Expr, v: String, at: Double): Result {
        val steps = ArrayList<Step>()
        val ev = Evaluator(strict = false)
        if (at.isFinite()) {
            // 1) direct substitution when continuous
            val f = ev.function(e, v)
            val direct = f(at)
            val h = 1e-9 * max(1.0, abs(at))
            val right = f(at + h); val left = f(at - h)
            if (direct.isFinite() && right.isFinite() && left.isFinite() && abs(direct - right) < 1e-6 * max(1.0, abs(direct)) && abs(direct - left) < 1e-6 * max(1.0, abs(direct))) {
                steps += Step("Direct substitution", "The expression is defined and continuous at $v = ${fmt(at)}, so the limit equals f(${fmt(at)})")
                return Result(direct, fmt(direct), steps, true)
            }
            // 2) L'Hôpital for 0/0 quotients
            if (e is Expr.Div) {
                var n = e.left; var d = e.right
                repeat(5) { round ->
                    val nv = ev.function(n, v)(at); val dv = ev.function(d, v)(at)
                    if (abs(nv) < 1e-12 && abs(dv) < 1e-12) {
                        steps += Step("L'Hôpital's rule", "Both numerator and denominator → 0, so lim f/g = lim f′/g′ (round ${round + 1})")
                        n = Derivative.differentiate(n, v).derivative
                        d = Derivative.differentiate(d, v).derivative
                    } else if (dv != 0.0 && nv.isFinite() && dv.isFinite() && steps.isNotEmpty()) {
                        val r = nv / dv
                        // L'Hôpital needs differentiability near the point; confirm with the two-sided numeric limit
                        val check = Limits.numeric(ev.function(e, v), at)
                        if (check.value != null && abs(check.value - r) <= 1e-6 * max(1.0, abs(r))) {
                            steps += Step("Evaluate", "f′/g′ at $v = ${fmt(at)}: ${fmt(nv)} / ${fmt(dv)} = ${fmt(r)} (confirmed numerically)")
                            return Result(r, fmt(r), steps, true)
                        }
                        steps += Step("L'Hôpital not applicable", "The quotient of derivatives gives ${fmt(r)}, but the numerical two-sided limit disagrees — the functions are not differentiable near $v = ${fmt(at)}")
                        return@repeat
                    } else return@repeat
                }
            }
        }
        val num = Limits.numeric(ev.function(e, v), at)
        steps += Step("Numerical estimate", num.note)
        val disp = when {
            num.value != null -> fmt(num.value)
            num.left != null && num.right != null -> "does not exist (left → ${fmt(num.left)}, right → ${fmt(num.right)})"
            else -> "could not be determined numerically"
        }
        return Result(num.value, disp, steps, false)
    }

    fun fmt(d: Double): String = when {
        d == Double.POSITIVE_INFINITY -> "∞"
        d == Double.NEGATIVE_INFINITY -> "−∞"
        d.isNaN() -> "undefined"
        else -> java.math.BigDecimal(d).round(java.math.MathContext(12)).stripTrailingZeros().let { if (it.scale() < 0) it.setScale(0) else it }.toPlainString()
    }
}

object Analysis {
    data class CriticalPoint(val x: Double, val y: Double, val kind: String)

    /** Critical points of f on [lo, hi] from roots of the symbolic derivative, classified by the first-derivative test. */
    fun criticalPoints(e: Expr, v: String, lo: Double, hi: Double): List<CriticalPoint> {
        val d = Derivative.differentiate(e, v).derivative
        val ev = Evaluator(strict = false)
        val f = ev.function(e, v)
        val fp = ev.function(d, v)
        val xs = Roots.findAll(fp, lo, hi, 4000)
        return xs.mapNotNull { x ->
            val y = f(x)
            if (!y.isFinite()) return@mapNotNull null
            val h = 1e-4 * max(1.0, abs(x))
            val l = fp(x - h); val r = fp(x + h)
            val kind = when {
                l > 0 && r < 0 -> "local maximum"
                l < 0 && r > 0 -> "local minimum"
                else -> "stationary (inflection or flat)"
            }
            CriticalPoint(x, y, kind)
        }
    }

    data class Tangent(val slope: Double, val intercept: Double, val y0: Double, val equation: String, val slopeError: Double)

    fun tangent(e: Expr, v: String, x0: Double): Tangent {
        val ev = Evaluator(strict = false)
        val f = ev.function(e, v)
        val y0 = f(x0)
        if (!y0.isFinite()) throw MathError("f is not defined at $v = ${LimitSolver.fmt(x0)}")
        val d = try { Derivative.differentiate(e, v).derivative } catch (_: MathError) { null }
        val (m, err) = if (d != null) ev.function(d, v)(x0) to 0.0 else Differentiate.ridders(f, x0).let { it.value to it.error }
        if (!m.isFinite()) throw MathError("f is not differentiable at $v = ${LimitSolver.fmt(x0)}")
        val b = y0 - m * x0
        return Tangent(m, b, y0, "y = ${LimitSolver.fmt(m)}·($v − ${LimitSolver.fmt(x0)}) + ${LimitSolver.fmt(y0)}", err)
    }
}
