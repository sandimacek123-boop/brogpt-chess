package com.quantumath.math.symbolic

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Printer
import com.quantumath.math.expr.Relation
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.numeric.PolyRoots
import com.quantumath.math.numeric.Roots
import java.math.BigInteger
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max

data class Solution(val exact: Expr?, val value: Double) {
    val display: String get() = exact?.let { Printer.print(it, unicode = true) } ?: LimitSolver.fmt(value)
}

data class SolveResult(
    val variable: String,
    val solutions: List<Solution> = emptyList(),
    val complexSolutions: List<String> = emptyList(),
    val generalSolution: List<String> = emptyList(),
    val steps: List<Step> = emptyList(),
    val domain: List<String> = emptyList(),
    val rejected: List<String> = emptyList(),
    val method: String = "",
    val exact: Boolean = true,
    val identity: Boolean = false,
    val unsupported: String? = null,
)

/** A domain restriction of the original equation (denominators, even roots, logs, inverse trig). */
data class Condition(val text: String, val holds: (Double) -> Boolean)

object Solver {
    private fun p(e: Expr) = Printer.print(e, unicode = true)
    private fun c(r: Long) = Expr.Frac(Rational.of(r))
    private fun k(r: Rational): Expr = if (r.signum < 0) Expr.Neg(Expr.Frac(-r)) else Expr.Frac(r)
    private val N = Expr.Var("n")

    fun solve(rel: Relation, variable: String? = null, searchRange: Double = 100.0): SolveResult {
        val vars = (rel.left.variables() + rel.right.variables())
        val v = variable ?: when {
            vars.isEmpty() -> return checkConstant(rel)
            vars.size == 1 -> vars.first()
            "x" in vars -> "x"
            else -> vars.first()
        }
        if (rel.op != "=") return InequalitySolver.solve(rel, v)
        val f = Tidy.tidy(Expr.Sub(rel.left, rel.right))
        val conds = domainConditions(Expr.Sub(rel.left, rel.right), v)
        val steps = ArrayList<Step>()
        steps += Step("Rearrange", "Move everything to one side: ${p(f)} = 0")
        if (conds.isNotEmpty()) steps += Step("Domain", conds.joinToString("; ") { it.text })
        val others = vars - v
        val result = try {
            if (others.isEmpty()) solveSingle(f, v, steps, searchRange) else solveParametric(f, v, steps)
        } catch (e: MathError) {
            SolveResult(v, steps = steps, unsupported = e.message)
        }
        return verify(rel, v, result, conds)
    }

    private fun checkConstant(rel: Relation): SolveResult {
        val a = try { Evaluator().eval(Expr.Sub(rel.left, rel.right)) } catch (e: MathError) { return SolveResult("", unsupported = e.message) }
        return if (abs(a) < 1e-12) SolveResult("", identity = true, method = "The equation contains no variable and is true")
        else SolveResult("", method = "The equation contains no variable and is false", steps = listOf(Step("Evaluate", "${p(rel.left)} − ${p(rel.right)} = ${LimitSolver.fmt(a)} ≠ 0")))
    }

    // ------------------------------------------------------------------ main dispatch
    private fun solveSingle(f: Expr, v: String, steps: MutableList<Step>, range: Double): SolveResult {
        val t = AtomTable()
        val form = Algebra.toRat(f, t)
        val vKey = t.key(Expr.Var(v))
        val atomsWithV = (form.num.atomKeys() + form.den.atomKeys()).filter { t.atoms[it]!!.containsVar(v) }
        // (a) rational function in v
        if (atomsWithV.all { it == vKey }) {
            val numP = form.num.asUnivariate(vKey) ?: throw MathError("Unsupported")
            val denP = form.den.asUnivariate(vKey) ?: throw MathError("Unsupported")
            if (!form.den.isConstant) steps += Step("Common denominator", "Write as a single fraction: (${p(numP.toExpr(v))}) / (${p(denP.toExpr(v))}) = 0; a fraction is zero exactly when its numerator is zero and its denominator is not")
            return polynomial(numP, v, steps, denP)
        }
        // (b) polynomial in a single atom u(v) → solve for u, then isolate
        if (atomsWithV.size == 1 && form.den.isConstant) {
            val key = atomsWithV.first()
            val atom = t.atoms[key]!!
            val pu = form.num.asUnivariate(key)
            if (pu != null && pu.degree >= 1) {
                steps += Step("Substitution", "Let u = ${p(atom)}. The equation becomes ${p(pu.toExpr("u"))} = 0")
                val inner = polynomial(pu, "u", steps, Poly.ONE, real = true)
                val sols = ArrayList<Solution>()
                val general = ArrayList<String>()
                for (s in inner.solutions) {
                    val iso = isolate(atom, s.exact ?: numberExpr(s.value), v, steps)
                    sols += iso.first
                    general += iso.second
                }
                if (inner.solutions.isEmpty()) steps += Step("No real u", "No real value of u solves the polynomial, so there is no real solution")
                return SolveResult(v, sols, steps = steps, generalSolution = general, method = "Substitution u = ${p(atom)} and inverse operations", exact = inner.exact)
            }
        }
        // (b2) one square root plus polynomial terms: isolate the radical, square, solve, check
        radical(form, t, v, vKey, atomsWithV, steps)?.let { return it }
        // (c) single occurrence → isolate directly
        if (occurrences(f, v) == 1) {
            steps += Step("Isolation", "${p(Expr.Var(v))} occurs once; undo the operations around it one at a time")
            val (sols, general) = isolate(f, c(0), v, steps)
            return SolveResult(v, sols, steps = steps, generalSolution = general, method = "Isolation by inverse operations")
        }
        // (d) numeric fallback
        return numeric(f, v, steps, range)
    }

    private fun radical(form: RatForm, t: AtomTable, v: String, vKey: String, atomsWithV: List<String>, steps: MutableList<Step>): SolveResult? {
        val sKey = atomsWithV.singleOrNull { it != vKey } ?: return null
        val sAtom = t.atoms[sKey] as? Expr.Call ?: return null
        if (sAtom.fn != "sqrt") return null
        val inner = Algebra.toRat(sAtom.args[0], t)
        if (!inner.isPolynomial) return null
        val u = inner.num.scale(inner.den.constantValue.reciprocal()).asUnivariate(vKey) ?: return null
        // numerator = P1(v)·S + P0(v) with S = √u
        var p0 = Poly.ZERO; var p1 = Poly.ZERO
        for ((m, coef) in form.num.terms) {
            val e = m.exponentOf(sKey)
            val rest = m.without(sKey)
            if (rest.factors.any { it.first != vKey }) return null
            val term = Poly(List(rest.exponentOf(vKey) + 1) { if (it == rest.exponentOf(vKey)) coef else Rational.ZERO })
            when (e) { 0 -> p0 += term; 1 -> p1 += term; else -> return null }
        }
        if (p1.isZero) return null
        steps += Step("Isolate the radical", "${p(sAtom)} = ${p(Tidy.tidy(Expr.Neg(Expr.Div(p0.toExpr(v), p1.toExpr(v)))))}")
        val squared = u * p1 * p1 - p0 * p0
        steps += Step("Square both sides", "Squaring may introduce extraneous roots; every candidate is checked in the original equation. Result: ${p(squared.toExpr(v))} = 0")
        val res = polynomial(squared, v, steps, Poly.ONE)
        return res.copy(method = "Isolate the radical, square, solve, check")
    }

    private fun numberExpr(d: Double): Expr = Rational.fromDouble(d, 10_000, 1e-13)?.let { k(it) } ?: com.quantumath.math.expr.Expr.Num(java.math.BigDecimal(d).round(java.math.MathContext(15)))

    private fun occurrences(e: Expr, v: String): Int = when (e) {
        is Expr.Var -> if (e.name == v) 1 else 0
        is Expr.Num, is Expr.Frac, is Expr.Const -> 0
        is Expr.Neg -> occurrences(e.arg, v)
        is Expr.Add -> occurrences(e.left, v) + occurrences(e.right, v)
        is Expr.Sub -> occurrences(e.left, v) + occurrences(e.right, v)
        is Expr.Mul -> occurrences(e.left, v) + occurrences(e.right, v)
        is Expr.Div -> occurrences(e.left, v) + occurrences(e.right, v)
        is Expr.Pow -> occurrences(e.base, v) + occurrences(e.exp, v)
        is Expr.Fact -> occurrences(e.arg, v)
        is Expr.Percent -> occurrences(e.arg, v)
        is Expr.Call -> e.args.sumOf { occurrences(it, v) }
    }

    // ------------------------------------------------------------------ polynomial equations
    fun polynomial(numP: Poly, v: String, steps: MutableList<Step>, denP: Poly, real: Boolean = true): SolveResult {
        if (numP.isZero) return SolveResult(v, identity = true, steps = steps, method = "Identity: every value in the domain is a solution")
        if (numP.degree == 0) {
            steps += Step("Contradiction", "The equation reduces to ${numP[0]} = 0, which is false")
            return SolveResult(v, steps = steps, method = "No solution")
        }
        val sols = ArrayList<Solution>()
        val complex = ArrayList<String>()
        var exact = true
        val X = Expr.Var(v)
        when (numP.degree) {
            1 -> {
                val a = numP[1]; val b = numP[0]
                steps += Step("Linear equation", "${p(numP.toExpr(v))} = 0 → $v = −($b)/($a)")
                val r = -b / a
                sols += Solution(k(r), r.toDouble())
            }
            2 -> {
                val a = numP[2]; val b = numP[1]; val cc = numP[0]
                val disc = b * b - Rational.of(4) * a * cc
                steps += Step("Quadratic formula", "a = $a, b = $b, c = $cc; $v = (−b ± √(b² − 4ac)) / 2a")
                steps += Step("Discriminant", "Δ = b² − 4ac = $disc" + when { disc.signum > 0 -> " > 0: two real roots"; disc.isZero -> " = 0: one repeated root"; else -> " < 0: two complex conjugate roots" })
                val twoA = Rational.TWO * a
                when {
                    disc.isZero -> { val r = -b / twoA; sols += Solution(k(r), r.toDouble()) }
                    disc.signum > 0 -> {
                        val (out, inside) = Surd.sqrtOf(disc)
                        for (sign in listOf(-1, 1)) {
                            val s = Surd(-b / twoA, out / twoA * Rational.of(sign.toLong()), inside)
                            sols += Solution(s.toExpr(), s.toDouble())
                        }
                    }
                    else -> {
                        val re = -b / twoA
                        val (out, inside) = Surd.sqrtOf(-disc)
                        val imMag = Surd(Rational.ZERO, out / twoA.abs(), inside)
                        val reStr = if (re.isZero) "" else "$re "
                        complex += "${reStr}${if (re.isZero) "" else "+ "}${p(imMag.toExpr())}·i"
                        complex += "${reStr}${if (re.isZero) "−" else "− "}${p(imMag.toExpr())}·i"
                    }
                }
            }
            else -> {
                // rational roots first, then the remaining factor
                var rest = numP.primitive().second
                val rr = rest.rationalRoots()
                if (rr.isNotEmpty()) steps += Step("Rational root theorem", "Candidates ±p/q tested; rational roots found: ${rr.joinToString(", ")}")
                for (r in rr) {
                    sols += Solution(k(r), r.toDouble())
                    val m = rest.multiplicity(r)
                    repeat(m) { rest = rest.divMod(Poly(listOf(-r, Rational.ONE))).first }
                    if (m > 1) steps += Step("Multiplicity", "$v = $r is a root of multiplicity $m")
                }
                if (rr.isNotEmpty() && rest.degree >= 1) steps += Step("Deflate", "Divide out the linear factors, leaving ${p(rest.toExpr(v))} = 0")
                if (rest.degree in 1..2) {
                    val sub = polynomial(rest, v, steps, Poly.ONE, real)
                    sols += sub.solutions; complex += sub.complexSolutions
                } else if (rest.degree >= 3) {
                    exact = false
                    steps += Step("Numerical roots", "No further exact factorization over ℚ; roots of ${p(rest.toExpr(v))} computed numerically (Aberth–Ehrlich iteration)")
                    for (z in PolyRoots.roots(rest.toDoubleArray())) {
                        if (z.im == 0.0) sols += Solution(null, z.re)
                        else if (z.im > 0) { complex += "${LimitSolver.fmt(z.re)} + ${LimitSolver.fmt(z.im)}·i"; complex += "${LimitSolver.fmt(z.re)} − ${LimitSolver.fmt(z.im)}·i" }
                    }
                }
            }
        }
        // a solution of the numerator that zeroes the denominator is not in the domain
        val kept = ArrayList<Solution>(); val rejected = ArrayList<String>()
        for (s in sols.distinctBy { Math.round(it.value * 1e9) }) {
            val dz = if (s.exact != null) RationalEval.tryEval(s.exact)?.let { denP.eval(it).isZero } ?: (abs(denP.eval(s.value)) < 1e-12) else abs(denP.eval(s.value)) < 1e-9
            if (dz) rejected += "${s.display} (makes the denominator zero)" else kept += s
        }
        if (rejected.isNotEmpty()) steps += Step("Check the denominator", "Rejected: ${rejected.joinToString()}")
        return SolveResult(v, kept.sortedBy { it.value }, complex, steps = steps, rejected = rejected, method = if (exact) "Exact algebraic solution" else "Exact factors + numerical roots", exact = exact)
    }

    // ------------------------------------------------------------------ isolation by inverse operations
    /** Solve expr(v) = rhs where v occurs exactly once in expr. Returns particular solutions and general forms. */
    private fun isolate(expr0: Expr, rhs0: Expr, v: String, steps: MutableList<Step>): Pair<List<Solution>, List<String>> {
        data class Branch(val lhs: Expr, val rhs: Expr, val periodic: Boolean)
        var branches = listOf(Branch(expr0, rhs0, false))
        val finished = ArrayList<Branch>()
        var guard = 0
        while (branches.isNotEmpty() && guard++ < 40) {
            val next = ArrayList<Branch>()
            for (b in branches) {
                val l = b.lhs; val r = Tidy.tidy(b.rhs)
                if (l is Expr.Var && l.name == v) { finished += b.copy(rhs = r); continue }
                fun go(newL: Expr, newR: Expr, why: String, periodic: Boolean = b.periodic) {
                    steps += Step(why, "${p(newL)} = ${p(Tidy.tidy(newR))}")
                    next += Branch(newL, newR, periodic)
                }
                val rv = rationalValue(r)
                when (l) {
                    is Expr.Neg -> go(l.arg, Expr.Neg(r), "Multiply both sides by −1")
                    is Expr.Add -> if (l.left.containsVar(v)) go(l.left, Expr.Sub(r, l.right), "Subtract ${p(l.right)}") else go(l.right, Expr.Sub(r, l.left), "Subtract ${p(l.left)}")
                    is Expr.Sub -> if (l.left.containsVar(v)) go(l.left, Expr.Add(r, l.right), "Add ${p(l.right)}") else go(l.right, Expr.Sub(l.left, r), "Rearrange")
                    is Expr.Mul -> if (l.left.containsVar(v)) go(l.left, Expr.Div(r, l.right), "Divide by ${p(l.right)}") else go(l.right, Expr.Div(r, l.left), "Divide by ${p(l.left)}")
                    is Expr.Div -> if (l.left.containsVar(v)) go(l.left, Expr.Mul(r, l.right), "Multiply by ${p(l.right)}") else {
                        if (rv?.isZero == true) { steps += Step("No solution", "${p(l.left)}/(…) can never equal 0"); }
                        else go(l.right, Expr.Div(l.left, r), "Take reciprocals")
                    }
                    is Expr.Pow -> if (!l.exp.containsVar(v)) {
                        val n = RationalEval.tryEval(l.exp)
                        when {
                            n != null && n.isInteger && !n.num.testBit(0) -> {
                                if (rv != null && rv.signum < 0) steps += Step("No real solution", "An even power cannot equal a negative number")
                                else {
                                    val root = Tidy.tidy(Expr.Pow(r, k(n.reciprocal())))
                                    go(l.base, root, "Take the ${n}th root (positive branch)")
                                    if (rv?.isZero != true) go(l.base, Expr.Neg(root), "Take the ${n}th root (negative branch)")
                                }
                            }
                            n != null && n.isInteger -> go(l.base, Expr.Call("root", listOf(r, k(n))).let { rr -> if (rv != null) realRootExpr(rv, n.num.toInt()) ?: rr else rr }, "Take the real ${n}th root")
                            else -> go(l.base, Expr.Pow(r, Tidy.tidy(Expr.Div(c(1), l.exp))), "Raise both sides to the power 1/${p(l.exp)} (checked afterwards)")
                        }
                    } else {
                        // a^g(v) = r → g(v) = log_a(r)
                        if (rv != null && rv.signum <= 0) steps += Step("No real solution", "${p(l.base)}^(…) is always positive")
                        else go(l.exp, if (l.base == Expr.Const("e")) Expr.Call("ln", listOf(r)) else Expr.Div(Expr.Call("ln", listOf(r)), Expr.Call("ln", listOf(l.base))), "Take logarithms")
                    }
                    is Expr.Call -> {
                        val u = l.args[0]
                        val twoPiN = Expr.Mul(Expr.Mul(c(2), Expr.Const("pi")), N)
                        when (l.fn) {
                            "sqrt" -> if (rv != null && rv.signum < 0) steps += Step("No real solution", "√ is never negative") else go(u, Expr.Pow(r, c(2)), "Square both sides (valid because ${p(r)} ≥ 0; checked afterwards)")
                            "cbrt" -> go(u, Expr.Pow(r, c(3)), "Cube both sides")
                            "exp" -> if (rv != null && rv.signum <= 0) steps += Step("No real solution", "eᵘ is always positive") else go(u, Expr.Call("ln", listOf(r)), "Take the natural logarithm")
                            "ln" -> go(u, Expr.Pow(Expr.Const("e"), r), "Exponentiate: u = e^(rhs)")
                            "log10" -> go(u, Expr.Pow(c(10), r), "Exponentiate: u = 10^(rhs)")
                            "log2" -> go(u, Expr.Pow(c(2), r), "Exponentiate: u = 2^(rhs)")
                            "log" -> go(u, Expr.Pow(l.args[1], r), "Exponentiate with base ${p(l.args[1])}")
                            "abs" -> if (rv != null && rv.signum < 0) steps += Step("No solution", "|u| is never negative") else { go(u, r, "|u| = c gives u = c"); if (rv?.isZero != true) go(u, Expr.Neg(r), "…or u = −c") }
                            "sin" -> trigBranch(rv, r, "asin") { a ->
                                go(u, Expr.Add(Expr.Call("asin", listOf(r)), twoPiN), "Inverse sine, general solution", true)
                                go(u, Expr.Add(Expr.Sub(Expr.Const("pi"), Expr.Call("asin", listOf(r))), twoPiN), "Second branch: π − asin(c)", true)
                            }.let { if (!it) steps += Step("No real solution", "sin u is between −1 and 1") }
                            "cos" -> trigBranch(rv, r, "acos") { _ ->
                                go(u, Expr.Add(Expr.Call("acos", listOf(r)), twoPiN), "Inverse cosine, general solution", true)
                                go(u, Expr.Sub(twoPiN, Expr.Call("acos", listOf(r))), "Second branch: −acos(c)", true)
                            }.let { if (!it) steps += Step("No real solution", "cos u is between −1 and 1") }
                            "tan" -> go(u, Expr.Add(Expr.Call("atan", listOf(r)), Expr.Mul(Expr.Const("pi"), N)), "Inverse tangent, general solution (period π)", true)
                            "asin" -> go(u, Expr.Call("sin", listOf(r)), "Apply sin (requires −π/2 ≤ rhs ≤ π/2)")
                            "acos" -> go(u, Expr.Call("cos", listOf(r)), "Apply cos (requires 0 ≤ rhs ≤ π)")
                            "atan" -> go(u, Expr.Call("tan", listOf(r)), "Apply tan (requires −π/2 < rhs < π/2)")
                            "sinh" -> go(u, Expr.Call("asinh", listOf(r)), "Apply asinh")
                            "cosh" -> { go(u, Expr.Call("acosh", listOf(r)), "Apply acosh"); go(u, Expr.Neg(Expr.Call("acosh", listOf(r))), "…and its negative") }
                            "tanh" -> go(u, Expr.Call("atanh", listOf(r)), "Apply atanh")
                            else -> throw MathError("Cannot invert ${l.fn}; try the numerical solver")
                        }
                    }
                    else -> throw MathError("Cannot isolate ${p(Expr.Var(v))} in ${p(l)}")
                }
            }
            branches = next
        }
        // turn finished branches into particular solutions
        val sols = ArrayList<Solution>()
        val general = ArrayList<String>()
        val ev = Evaluator(strict = false)
        for (b in finished) {
            val rhs = Algebra.simplify(b.rhs).last().result
            if (b.periodic) {
                general += "${p(Expr.Var(v))} = ${p(rhs)},  n ∈ ℤ"
                val fn = try { ev.function(rhs, "n") } catch (_: MathError) { continue }
                for (n in -6..6) {
                    val x = fn(n.toDouble())
                    if (x.isFinite() && x >= -1e-12 && x < 2 * PI - 1e-12) {
                        val exactN = Tidy.tidy(Algebra.normalForm(rhs.substitute("n", c(n.toLong()))))
                        sols += Solution(exactN, if (abs(x) < 1e-12) 0.0 else x)
                    }
                }
            } else {
                val x = try { ev.eval(rhs) } catch (_: MathError) { Double.NaN }
                if (x.isFinite()) sols += Solution(rhs, x)
            }
        }
        return sols.distinctBy { Math.round(it.value * 1e9) }.sortedBy { it.value } to general.distinct()
    }

    private inline fun trigBranch(rv: Rational?, r: Expr, fn: String, body: (Expr) -> Unit): Boolean {
        val value = rv?.toDouble() ?: try { Evaluator().eval(r) } catch (_: MathError) { Double.NaN }
        if (value.isFinite() && (value < -1 - 1e-12 || value > 1 + 1e-12)) return false
        body(r)
        return true
    }

    private fun realRootExpr(r: Rational, n: Int): Expr? {
        val neg = r.signum < 0
        val v = Math.pow(abs(r.toDouble()), 1.0 / n)
        val rr = Rational.fromDouble(v, 1000) ?: return null
        if (rr.pow(n) != r.abs()) return null
        return k(if (neg) -rr else rr)
    }

    private fun rationalValue(e: Expr): Rational? = RationalEval.tryEval(e)

    // ------------------------------------------------------------------ parametric (other symbols present)
    private fun solveParametric(f: Expr, v: String, steps: MutableList<Step>): SolveResult {
        val t = AtomTable()
        val form = Algebra.toRat(f, t)
        val vKey = t.key(Expr.Var(v))
        if (form.num.atomKeys().any { it != vKey && t.atoms[it]!!.containsVar(v) }) throw MathError("Equations with ${p(Expr.Var(v))} inside functions and other symbols are not supported symbolically")
        val byPower = HashMap<Int, MPoly>()
        for ((m, coef) in form.num.terms) {
            val e = m.exponentOf(vKey)
            byPower[e] = (byPower[e] ?: MPoly.ZERO) + MPoly(mapOf(m.without(vKey) to coef))
        }
        val deg = byPower.keys.maxOrNull() ?: 0
        fun co(i: Int) = (byPower[i] ?: MPoly.ZERO).toExpr(t)
        return when (deg) {
            1 -> {
                val sol = Algebra.simplify(Expr.Neg(Expr.Div(co(0), co(1)))).last().result
                steps += Step("Linear in ${p(Expr.Var(v))}", "(${p(co(1))})·$v + (${p(co(0))}) = 0 → $v = ${p(sol)}, provided ${p(co(1))} ≠ 0")
                SolveResult(v, listOf(Solution(sol, Double.NaN)), steps = steps, method = "Solved symbolically in terms of the other variables", domain = listOf("${p(co(1))} ≠ 0"))
            }
            2 -> {
                val a = co(2); val b = co(1); val cc = co(0)
                val disc = Algebra.simplify(Expr.Sub(Expr.Pow(b, c(2)), Expr.Mul(Expr.Mul(c(4), a), cc))).last().result
                steps += Step("Quadratic in ${p(Expr.Var(v))}", "a = ${p(a)}, b = ${p(b)}, c = ${p(cc)}; Δ = ${p(disc)}")
                val sols = listOf(-1, 1).map { s ->
                    Solution(Tidy.tidy(Expr.Div(Expr.Add(Expr.Neg(b), Expr.Mul(c(s.toLong()), Expr.Call("sqrt", listOf(disc)))), Expr.Mul(c(2), a))), Double.NaN)
                }
                SolveResult(v, sols, steps = steps, method = "Quadratic formula with symbolic coefficients", domain = listOf("${p(a)} ≠ 0", "real solutions require ${p(disc)} ≥ 0"))
            }
            else -> throw MathError("With other symbols present, only equations linear or quadratic in ${p(Expr.Var(v))} are solved symbolically")
        }
    }

    // ------------------------------------------------------------------ numerical fallback
    private fun numeric(f: Expr, v: String, steps: MutableList<Step>, range: Double): SolveResult {
        val fn = Evaluator(strict = false).function(f, v)
        val roots = Roots.findAll(fn, -range, range, 20000)
        steps += Step("Numerical search", "No exact method applies. Scanned [−${LimitSolver.fmt(range)}, ${LimitSolver.fmt(range)}] for sign changes and touching points, refined with Brent's method. Roots outside this interval are not reported.")
        return SolveResult(v, roots.map { Solution(numberIfExact(fn, it), it) }, steps = steps, method = "Numerical (Brent's method)", exact = false)
    }

    private fun numberIfExact(fn: (Double) -> Double, x: Double): Expr? {
        val r = Rational.fromDouble(x, 1000, 1e-11) ?: return null
        return if (fn(r.toDouble()) == 0.0) k(r) else null
    }

    // ------------------------------------------------------------------ domain + verification
    fun domainConditions(e: Expr, v: String): List<Condition> {
        val out = ArrayList<Condition>()
        val ev = Evaluator(strict = false)
        fun f(x: Expr): ((Double) -> Double)? = try { ev.function(x, v) } catch (_: MathError) { null }
        fun walk(x: Expr) {
            when (x) {
                is Expr.Div -> { if (x.right.containsVar(v)) f(x.right)?.let { g -> out += Condition("${p(x.right)} ≠ 0") { t -> abs(g(t)) > 1e-12 } }; walk(x.left); walk(x.right) }
                is Expr.Pow -> {
                    val n = RationalEval.tryEval(x.exp)
                    if (x.base.containsVar(v) && n != null && n.signum < 0) f(x.base)?.let { g -> out += Condition("${p(x.base)} ≠ 0") { t -> abs(g(t)) > 1e-12 } }
                    if (x.base.containsVar(v) && n != null && !n.isInteger && !n.den.testBit(0)) f(x.base)?.let { g -> out += Condition("${p(x.base)} ≥ 0") { t -> g(t) >= -1e-12 } }
                    walk(x.base); walk(x.exp)
                }
                is Expr.Call -> {
                    val a = x.args[0]
                    if (a.containsVar(v)) f(a)?.let { g ->
                        when (x.fn) {
                            "sqrt" -> out += Condition("${p(a)} ≥ 0") { t -> g(t) >= -1e-12 }
                            "ln", "log10", "log2", "log" -> out += Condition("${p(a)} > 0") { t -> g(t) > 0 }
                            "asin", "acos" -> out += Condition("−1 ≤ ${p(a)} ≤ 1") { t -> g(t) in -1.0 - 1e-12..1.0 + 1e-12 }
                            "tan" -> out += Condition("cos(${p(a)}) ≠ 0") { t -> abs(kotlin.math.cos(g(t))) > 1e-12 }
                            else -> {}
                        }
                    }
                    x.args.forEach { walk(it) }
                }
                is Expr.Neg -> walk(x.arg)
                is Expr.Add -> { walk(x.left); walk(x.right) }
                is Expr.Sub -> { walk(x.left); walk(x.right) }
                is Expr.Mul -> { walk(x.left); walk(x.right) }
                else -> {}
            }
        }
        walk(e)
        return out.distinctBy { it.text }
    }

    /** Substitute every candidate into the ORIGINAL equation; reject those outside the domain or not satisfying it. */
    private fun verify(rel: Relation, v: String, r: SolveResult, conds: List<Condition>): SolveResult {
        if (r.solutions.isEmpty() || r.solutions.all { it.value.isNaN() }) return r.copy(domain = r.domain + conds.map { it.text })
        val ev = Evaluator(strict = false)
        val lhs = try { ev.function(rel.left, v) } catch (_: MathError) { return r }
        val rhs = try { ev.function(rel.right, v) } catch (_: MathError) { return r }
        val kept = ArrayList<Solution>(); val rejected = ArrayList(r.rejected)
        for (s in r.solutions) {
            val x = s.value
            val bad = conds.firstOrNull { !it.holds(x) }
            if (bad != null) { rejected += "${s.display} (violates ${bad.text})"; continue }
            val a = lhs(x); val b = rhs(x)
            val tol = 1e-7 * max(1.0, max(abs(a), abs(b)))
            if (!a.isFinite() || !b.isFinite() || abs(a - b) > tol) { rejected += "${s.display} (does not satisfy the original equation: extraneous)"; continue }
            kept += s
        }
        val steps = r.steps.toMutableList()
        if (kept.isNotEmpty()) steps += Step("Check", "Each solution was substituted into the original equation and satisfies it")
        if (rejected.size > r.rejected.size) steps += Step("Extraneous roots", rejected.drop(r.rejected.size).joinToString("; "))
        return r.copy(solutions = kept, rejected = rejected, steps = steps, domain = conds.map { it.text })
    }
}

object InequalitySolver {
    /** f(x) op 0 by a sign chart over the zeros of numerator and denominator and domain boundaries. */
    fun solve(rel: Relation, v: String): SolveResult {
        val f = Tidy.tidy(Expr.Sub(rel.left, rel.right))
        val steps = ArrayList<Step>()
        steps += Step("Rearrange", "${Printer.print(f, true)} ${rel.op} 0")
        val ev = Evaluator(strict = false)
        val fn = ev.function(f, v)
        val conds = Solver.domainConditions(f, v)
        val crit = ArrayList<Pair<Double, String>>()
        val t = AtomTable()
        val form = try { Algebra.toRat(f, t) } catch (_: MathError) { null }
        val key = t.atoms.entries.firstOrNull { it.value == Expr.Var(v) }?.key
        val numP = key?.let { form?.num?.asUnivariate(it) }
        val denP = key?.let { form?.den?.asUnivariate(it) }
        if (numP != null && denP != null) {
            for (s in Solver.polynomial(numP, v, ArrayList(), Poly.ONE).solutions) crit += s.value to s.display
            if (denP.degree >= 1) for (s in Solver.polynomial(denP, v, ArrayList(), Poly.ONE).solutions) crit += s.value to s.display
            steps += Step("Critical points", "Zeros of the numerator and denominator: ${crit.joinToString { it.second }.ifEmpty { "none" }}")
        } else {
            for (x in Roots.findAll(fn, -100.0, 100.0, 20000)) crit += x to LimitSolver.fmt(x)
            // poles: sign changes where |f| blows up
            steps += Step("Critical points (numerical)", "Zeros found in [−100, 100]: ${crit.joinToString { it.second }.ifEmpty { "none" }}")
        }
        // domain boundaries (e.g. ln x needs x > 0)
        for (cd in conds) {
            val boundary = predicateBoundaries(cd.holds, -100.0, 100.0)
            for (b in boundary) if (crit.none { abs(it.first - b) < 1e-7 }) crit += b to LimitSolver.fmt(b)
        }
        val pts = crit.distinctBy { Math.round(it.first * 1e9) }.sortedBy { it.first }
        val strict = rel.op == "<" || rel.op == ">"
        fun ok(y: Double) = when (rel.op) { "<" -> y < 0; "<=" -> y <= 0; ">" -> y > 0; else -> y >= 0 }
        fun inDomain(x: Double) = conds.all { it.holds(x) } && fn(x).isFinite()
        val pieces = ArrayList<String>()
        val bounds = listOf(Double.NEGATIVE_INFINITY to "-∞") + pts + listOf(Double.POSITIVE_INFINITY to "∞")
        val chart = ArrayList<String>()
        for (i in 0 until bounds.size - 1) {
            val (a, an) = bounds[i]; val (b, bn) = bounds[i + 1]
            val mid = when { a.isInfinite() && b.isInfinite() -> 0.0; a.isInfinite() -> b - 1 - abs(b); b.isInfinite() -> a + 1 + abs(a); else -> (a + b) / 2 }
            val y = fn(mid)
            val good = inDomain(mid) && ok(y)
            chart += "($an, $bn): f(${LimitSolver.fmt(mid)}) = ${LimitSolver.fmt(y)} → ${if (good) "✓" else "✗"}"
            if (good) {
                val leftClosed = !strict && !a.isInfinite() && inDomain(a) && ok(fn(a))
                val rightClosed = !strict && !b.isInfinite() && inDomain(b) && ok(fn(b))
                pieces += "${if (leftClosed) "[" else "("}$an, $bn${if (rightClosed) "]" else ")"}"
            }
        }
        // isolated points satisfying ≤ / ≥ (e.g. (x−1)² ≤ 0)
        if (!strict) for ((x, name) in pts) if (inDomain(x) && ok(fn(x)) && pieces.none { it.contains(name) }) pieces += "{$name}"
        steps += Step("Sign chart", chart.joinToString("\n"))
        val merged = merge(pieces)
        steps += Step("Solution set", if (merged.isEmpty()) "∅ (no solution)" else merged.joinToString(" ∪ "))
        return SolveResult(v, steps = steps, generalSolution = listOf(if (merged.isEmpty()) "No solution" else "$v ∈ ${merged.joinToString(" ∪ ")}"), method = "Sign chart", domain = conds.map { it.text }, exact = numP != null)
    }

    /** Points where a boolean predicate changes value (bisection to machine precision). */
    private fun predicateBoundaries(pred: (Double) -> Boolean, lo: Double, hi: Double, samples: Int = 4000): List<Double> {
        val out = ArrayList<Double>()
        var x0 = lo; var p0 = pred(x0)
        for (i in 1..samples) {
            val x1 = lo + (hi - lo) * i / samples
            val p1 = pred(x1)
            if (p1 != p0) {
                var a = x0; var b = x1
                repeat(80) { val m = (a + b) / 2; if (pred(m) == p0) a = m else b = m }
                val bnd = (a + b) / 2
                out += if (abs(bnd) < 1e-12) 0.0 else Rational.fromDouble(bnd, 1000, 1e-12)?.toDouble() ?: bnd
            }
            x0 = x1; p0 = p1
        }
        return out
    }

    /** Join adjacent intervals sharing a closed endpoint, e.g. (−∞, 1] ∪ [1, 2) → (−∞, 2). */
    private fun merge(p: List<String>): List<String> {
        val out = ArrayList<String>()
        for (s in p) {
            val last = out.lastOrNull()
            if (last != null && last.endsWith("]") && s.startsWith("[") && last.substringAfterLast(", ").dropLast(1) == s.drop(1).substringBefore(",")) {
                out[out.size - 1] = last.substringBeforeLast(", ") + ", " + s.substringAfter(", ")
            } else out += s
        }
        return out
    }
}

object SystemSolver {
    data class Result(val variables: List<String>, val solution: Matrix.SystemSolution?, val steps: List<Step>, val numeric: List<Double>? = null, val message: String)

    /** Linear systems solved exactly by Gauss–Jordan elimination; 2×2 nonlinear systems by Newton's method. */
    fun solve(relations: List<Relation>): Result {
        val exprs = relations.map { Tidy.tidy(Expr.Sub(it.left, it.right)) }
        val vars = exprs.flatMap { it.variables() }.toSortedSet().toList()
        if (vars.isEmpty()) throw MathError("No variables")
        val steps = ArrayList<Step>()
        val rows = ArrayList<List<Rational>>(); val rhs = ArrayList<Rational>()
        var linear = true
        for (e in exprs) {
            val t = AtomTable()
            val f = Algebra.toRat(e, t)
            if (!f.isPolynomial) { linear = false; break }
            val p = f.num.scale(f.den.constantValue.reciprocal())
            val row = MutableList(vars.size) { Rational.ZERO }
            var constant = Rational.ZERO
            for ((m, coef) in p.terms) {
                when {
                    m.factors.isEmpty() -> constant = coef
                    m.factors.size == 1 && m.factors[0].second == 1 -> {
                        val name = (t.atoms[m.factors[0].first] as? Expr.Var)?.name
                        val idx = vars.indexOf(name)
                        if (idx < 0) { linear = false; break }
                        row[idx] = coef
                    }
                    else -> { linear = false; break }
                }
            }
            if (!linear) break
            rows += row; rhs += -constant
        }
        if (linear) {
            val a = Matrix.of(rows)
            val (sol, rr) = a.solve(rhs)
            steps += Step("Augmented matrix", "Coefficients of ${vars.joinToString(", ")} with constants on the right")
            rr.steps.forEach { steps += Step(it.description, it.matrix.toString()) }
            val msg = when (sol) {
                is Matrix.SystemSolution.Unique -> "Unique solution: " + vars.indices.joinToString(", ") { "${vars[it]} = ${sol.x[it]}" }
                is Matrix.SystemSolution.Infinite -> "Infinitely many solutions (free: ${sol.freeVariables.joinToString { vars[it] }})"
                Matrix.SystemSolution.None -> "No solution: the system is inconsistent"
            }
            return Result(vars, sol, steps, message = msg)
        }
        if (vars.size != 2 || exprs.size != 2) throw MathError("Nonlinear systems are supported for two equations in two unknowns")
        val ev = Evaluator(strict = false)
        val f1 = ev.compile(exprs[0], vars); val f2 = ev.compile(exprs[1], vars)
        val found = ArrayList<DoubleArray>()
        for (sx in -5..5) for (sy in -5..5) {
            var x = doubleArrayOf(sx * 1.7 + 0.1, sy * 1.7 - 0.2)
            for (it in 0 until 60) {
                val a = f1(x); val b = f2(x)
                if (!a.isFinite() || !b.isFinite()) break
                val h = 1e-7
                val j11 = (f1(doubleArrayOf(x[0] + h, x[1])) - a) / h; val j12 = (f1(doubleArrayOf(x[0], x[1] + h)) - a) / h
                val j21 = (f2(doubleArrayOf(x[0] + h, x[1])) - b) / h; val j22 = (f2(doubleArrayOf(x[0], x[1] + h)) - b) / h
                val det = j11 * j22 - j12 * j21
                if (abs(det) < 1e-14) break
                x = doubleArrayOf(x[0] - (a * j22 - b * j12) / det, x[1] - (b * j11 - a * j21) / det)
                if (abs(a) + abs(b) < 1e-13) break
            }
            if (abs(f1(x)) + abs(f2(x)) < 1e-9 && found.none { abs(it[0] - x[0]) + abs(it[1] - x[1]) < 1e-6 }) found += x
        }
        steps += Step("Newton's method", "Started from a grid of 121 initial points in [−8.4, 8.4]²; converged solutions are listed. Solutions far outside this region may be missed.")
        return Result(vars, null, steps, found.flatMap { it.toList() }, if (found.isEmpty()) "No solution found numerically" else found.joinToString("; ") { "(${vars[0]}, ${vars[1]}) ≈ (${LimitSolver.fmt(it[0])}, ${LimitSolver.fmt(it[1])})" })
    }
}
