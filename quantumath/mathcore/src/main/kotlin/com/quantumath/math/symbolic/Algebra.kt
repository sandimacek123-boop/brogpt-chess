package com.quantumath.math.symbolic

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Printer
import java.math.BigInteger

data class Transformation(val title: String, val result: Expr, val justification: String)

object Algebra {
    private fun rat(e: Expr): Rational? = when (e) {
        is Expr.Frac -> e.value
        is Expr.Num -> Rational.of(e.value)
        is Expr.Neg -> rat(e.arg)?.let { -it }
        else -> null
    }
    private fun k(r: Rational): Expr = if (r.signum < 0) Expr.Neg(Expr.Frac(-r)) else Expr.Frac(r)

    /** If arg normalises to q·π with rational q, return q. */
    private fun piMultiple(e: Expr): Rational? {
        val t = AtomTable()
        val f = try { toRat(e, t) } catch (_: MathError) { return null }
        if (!f.isPolynomial) return null
        val p = f.num.scale(f.den.constantValue.reciprocal())
        if (p.isZero) return Rational.ZERO
        val piKey = t.atoms.entries.firstOrNull { it.value == Expr.Const("pi") }?.key ?: return null
        if (p.terms.size != 1) return null
        val (mono, coef) = p.terms.entries.first()
        return if (mono.factors == listOf(piKey to 1)) coef else null
    }

    private val SQRT2_2: Expr = Expr.Div(Expr.Call("sqrt", listOf(Expr.Frac(Rational.TWO))), Expr.Frac(Rational.TWO))
    private val SQRT3_2: Expr = Expr.Div(Expr.Call("sqrt", listOf(Expr.Frac(Rational.of(3)))), Expr.Frac(Rational.TWO))

    /** Exact values for sin/cos/tan at multiples of π/6 and π/4, reduced by symmetry. */
    private fun exactTrig(fn: String, q: Rational): Expr? {
        fun mod2(x: Rational): Rational = x - Rational.of(Rational.of(x.num, x.den * BigInteger.TWO).floor() * BigInteger.TWO)
        val r = mod2(q)
        if (r.den !in setOf(BigInteger.ONE, BigInteger.TWO, BigInteger.valueOf(3), BigInteger.valueOf(4), BigInteger.valueOf(6))) return null
        fun sinOf(x: Rational): Expr? {
            val (base, negative) = when {
                x <= Rational.HALF -> x to false
                x <= Rational.ONE -> (Rational.ONE - x) to false
                x <= Rational.of(3, 2) -> (x - Rational.ONE) to true
                else -> (Rational.TWO - x) to true
            }
            val v: Expr = when (base) {
                Rational.ZERO -> return Expr.Frac(Rational.ZERO)
                Rational.of(1, 6) -> Expr.Frac(Rational.HALF)
                Rational.of(1, 4) -> SQRT2_2
                Rational.of(1, 3) -> SQRT3_2
                Rational.HALF -> Expr.Frac(Rational.ONE)
                else -> return null
            }
            return if (negative) Tidy.tidy(Expr.Neg(v)) else v
        }
        val s = sinOf(r)
        val c = sinOf(mod2(r + Rational.HALF))
        return when (fn) {
            "sin" -> s
            "cos" -> c
            "tan" -> if (s == null || c == null || rat(c)?.isZero == true) null else when (r.den.toInt()) {
                1, 2 -> Expr.Frac(Rational.ZERO) // c ≠ 0 here, so r is a multiple of π
                4 -> Expr.Frac(if ((r == Rational.of(1, 4) || r == Rational.of(5, 4))) Rational.ONE else Rational.MINUS_ONE)
                else -> { // π/6 multiples: tan = ±√3/3 or ±√3
                    val sq3: Expr = Expr.Call("sqrt", listOf(Expr.Frac(Rational.of(3))))
                    val sign = if ((rat(s) ?: Rational.ONE).signum * (rat(c) ?: Rational.ONE).signum < 0 || ((s is Expr.Neg) xor (c is Expr.Neg))) -1 else 1
                    val mag: Expr = if (r.den.toInt() == 6) Expr.Div(sq3, Expr.Frac(Rational.of(3))) else sq3
                    if (sign < 0) Expr.Neg(mag) else mag
                }
            }
            else -> null
        }
    }

    /** Exact evaluation of a function call on already-simplified arguments, or null. */
    fun exactCall(fn: String, args: List<Expr>): Expr? {
        val a = args.firstOrNull() ?: return null
        val r = rat(a)
        return when (fn) {
            "sqrt" -> if (r != null && r.signum >= 0) {
                val (outside, inside) = Surd.sqrtOf(r)
                when {
                    inside == BigInteger.ONE -> k(outside)
                    outside == Rational.ONE -> null
                    else -> Expr.Mul(k(outside), Expr.Call("sqrt", listOf(Expr.Frac(Rational.of(inside)))))
                }
            } else if (a is Expr.Pow && rat(a.exp) == Rational.TWO) Expr.Call("abs", listOf(a.base)) else null
            "abs" -> if (r != null) k(r.abs()) else if (a is Expr.Const && a.name in setOf("pi", "e")) a else null
            "ln" -> when {
                r == Rational.ONE -> Expr.Frac(Rational.ZERO)
                a == Expr.Const("e") -> Expr.Frac(Rational.ONE)
                a is Expr.Call && a.fn == "exp" -> a.args[0]
                a is Expr.Pow && a.base == Expr.Const("e") -> a.exp
                else -> null
            }
            "log10", "log2" -> {
                val b = if (fn == "log10") BigInteger.TEN else BigInteger.TWO
                if (r != null && r.signum > 0) exactLog(r, b)?.let { k(Rational.of(it.toLong())) } else null
            }
            "exp" -> when {
                r?.isZero == true -> Expr.Frac(Rational.ONE)
                a is Expr.Call && a.fn == "ln" -> null // e^(ln u) = u only for u > 0; keep unevaluated
                else -> null
            }
            "sin", "cos", "tan" -> when {
                r?.isZero == true -> Expr.Frac(if (fn == "cos") Rational.ONE else Rational.ZERO)
                else -> piMultiple(a)?.let { exactTrig(fn, it) }
            }
            "asin", "acos", "atan" -> exactInverseTrig(fn, a)
            "floor" -> r?.let { k(Rational.of(it.floor())) }
            "ceil" -> r?.let { k(Rational.of((-it).floor().negate())) }
            "sign" -> r?.let { k(Rational.of(it.signum.toLong())) }
            else -> null
        }
    }

    private val PI: Expr = Expr.Const("pi")
    private fun piTimes(q: Rational): Expr = Tidy.tidy(if (q.isZero) Expr.Frac(Rational.ZERO) else Expr.Mul(Expr.Frac(q), PI))

    /** asin/acos/atan of the standard exact values (0, ±1/2, ±√2/2, ±√3/2, ±1, ±√3, ±√3/3). */
    private fun exactInverseTrig(fn: String, a: Expr): Expr? {
        val v = try { com.quantumath.math.eval.Evaluator().eval(a) } catch (_: Exception) { return null }
        fun near(x: Double, y: Double) = Math.abs(x - y) < 1e-14
        val s2 = Math.sqrt(2.0) / 2; val s3 = Math.sqrt(3.0) / 2
        val q: Rational? = when (fn) {
            "asin" -> listOf(0.0 to Rational.ZERO, 0.5 to Rational.of(1, 6), s2 to Rational.of(1, 4), s3 to Rational.of(1, 3), 1.0 to Rational.HALF)
                .firstNotNullOfOrNull { (x, r) -> if (near(v, x)) r else if (near(v, -x)) -r else null }
            "acos" -> listOf(1.0 to Rational.ZERO, s3 to Rational.of(1, 6), s2 to Rational.of(1, 4), 0.5 to Rational.of(1, 3), 0.0 to Rational.HALF, -0.5 to Rational.of(2, 3), -s2 to Rational.of(3, 4), -s3 to Rational.of(5, 6), -1.0 to Rational.ONE)
                .firstNotNullOfOrNull { (x, r) -> if (near(v, x)) r else null }
            "atan" -> listOf(0.0 to Rational.ZERO, Math.sqrt(3.0) / 3 to Rational.of(1, 6), 1.0 to Rational.of(1, 4), Math.sqrt(3.0) to Rational.of(1, 3))
                .firstNotNullOfOrNull { (x, r) -> if (near(v, x)) r else if (near(v, -x)) -r else null }
            else -> null
        }
        return q?.let { piTimes(it) }
    }

    private fun exactLog(r: Rational, b: BigInteger): Int? {
        if (r.isInteger) { var p = BigInteger.ONE; for (i in 0..4000) { if (p == r.num) return i; if (p > r.num) break; p *= b } }
        if (r.num == BigInteger.ONE) { var p = BigInteger.ONE; for (i in 0..4000) { if (p == r.den) return -i; if (p > r.den) break; p *= b } }
        return null
    }

    // ------------------------------------------------------------------ normal form
    /** Convert to the rational normal form over atoms. */
    fun toRat(e: Expr, t: AtomTable): RatForm = when (e) {
        is Expr.Num -> RatForm.constant(Rational.of(e.value))
        is Expr.Frac -> RatForm.constant(e.value)
        is Expr.Var -> RatForm.of(MPoly.atom(t.key(e)))
        is Expr.Const -> RatForm.of(MPoly.atom(t.key(e)))
        is Expr.Neg -> -toRat(e.arg, t)
        is Expr.Add -> toRat(e.left, t) + toRat(e.right, t)
        is Expr.Sub -> toRat(e.left, t) - toRat(e.right, t)
        is Expr.Mul -> toRat(e.left, t) * toRat(e.right, t)
        is Expr.Div -> toRat(e.left, t) / toRat(e.right, t)
        is Expr.Percent -> toRat(e.arg, t) / RatForm.constant(Rational.of(100))
        is Expr.Pow -> {
            val ex = Tidy.tidy(e.exp)
            val n = RationalEval.tryEval(ex)
            val base = toRat(e.base, t)
            if (n != null && n.isInteger && n.num.abs() <= BigInteger.valueOf(64) && (base.num.terms.size <= 1 || n.num.abs() <= BigInteger.valueOf(30))) {
                base.pow(n.num.toInt())
            } else {
                val be = base.toExpr(t)
                val br = rat(be)
                // numeric base with rational exponent: try an exact result (8^(1/3) = 2)
                if (br != null && n != null && br.signum > 0) exactRationalPower(br, n)?.let { RatForm.constant(it) }
                    ?: RatForm.of(MPoly.atom(t.key(Tidy.tidy(Expr.Pow(be, ex)))))
                else RatForm.of(MPoly.atom(t.key(Tidy.tidy(Expr.Pow(be, ex)))))
            }
        }
        is Expr.Fact -> RationalEval.tryEval(e)?.let { RatForm.constant(it) } ?: RatForm.of(MPoly.atom(t.key(Expr.Fact(simplifyNoTrig(e.arg)))))
        is Expr.Call -> {
            val args = e.args.map { simplifyNoTrig(it) }
            val exact = exactCall(e.fn, args)
            if (exact != null) toRat(exact, t) else RatForm.of(MPoly.atom(t.key(Expr.Call(e.fn, args))))
        }
    }

    private fun exactRationalPower(b: Rational, n: Rational): Rational? {
        if (n.den > BigInteger.valueOf(64) || n.num.abs() > BigInteger.valueOf(64)) return null
        val q = n.den.toInt()
        fun iroot(x: BigInteger): BigInteger? {
            val r = x.toDouble().let { Math.round(Math.pow(it, 1.0 / q)) }
            for (c in listOf(r - 1, r, r + 1)) if (c >= 0 && BigInteger.valueOf(c).pow(q) == x) return BigInteger.valueOf(c)
            return null
        }
        val rn = iroot(b.num) ?: return null
        val rd = iroot(b.den) ?: return null
        return Rational.of(rn, rd).pow(n.num.toInt())
    }

    private fun simplifyNoTrig(e: Expr): Expr {
        val t = AtomTable()
        return try { toRat(e, t).toExpr(t) } catch (_: MathError) { Tidy.tidy(e) }
    }

    /** Apply sin²u + cos²u = 1 within the numerator. */
    private fun pythagorean(f: RatForm, t: AtomTable): RatForm {
        var num = f.num
        var changed = true
        var guard = 0
        while (changed && guard++ < 20) {
            changed = false
            val sinKeys = t.atoms.filter { (_, v) -> v is Expr.Call && v.fn == "sin" }
            loop@ for ((sk, sv) in sinKeys) {
                val ck = t.key(Expr.Call("cos", (sv as Expr.Call).args))
                for ((m, c) in num.terms) {
                    if (m.exponentOf(sk) < 2) continue
                    val rest = Mono(m.factors.mapNotNull { (a, e) -> if (a == sk) (if (e > 2) a to e - 2 else null) else a to e })
                    val partner = rest * Mono(listOf(ck to 2))
                    if (num.terms[partner] == c) {
                        num = num - MPoly(mapOf(m to c, partner to c)) + MPoly(mapOf(rest to c))
                        changed = true
                        break@loop
                    }
                }
            }
        }
        return RatForm(num, f.den).normalize()
    }

    fun normalForm(e: Expr): Expr {
        val t = AtomTable()
        val f = pythagorean(toRat(e, t), t)
        return f.toExpr(t)
    }

    /** Simplify: the shortest of the tidied input, the rational normal form and (univariate) factored form. */
    fun simplify(e: Expr): List<Transformation> {
        val out = ArrayList<Transformation>()
        val tidy = Tidy.tidy(e)
        out += Transformation("Tidy", tidy, "Constant folding and identities such as 1·u = u, u + 0 = u, u^1 = u")
        val nf = try { normalForm(e) } catch (ex: MathError) { null }
        if (nf != null && nf != tidy) out += Transformation("Combine like terms", nf, "Expanded into a sum of terms over a common denominator; like terms combined; common factors cancelled (valid where the original expression is defined); sin²u + cos²u = 1 applied")
        val fac = try { factor(e).takeIf { it.isNotEmpty() }?.last()?.result } catch (_: MathError) { null }
        if (fac != null && fac != nf && fac != tidy) out += Transformation("Factored", fac, "Factored over the rationals")
        val best = out.minBy { Printer.print(it.result).length }
        out += Transformation("Simplest form", best.result, "Shortest equivalent form found")
        return out
    }

    fun expand(e: Expr): Expr {
        val t = AtomTable()
        val f = toRat(e, t)
        return f.toExpr(t)
    }

    // ------------------------------------------------------------------ factoring
    /** Factor a univariate polynomial over ℚ: content × linear factors × remaining irreducible-or-unfactored parts. */
    fun factorPoly(p: Poly, v: String): Pair<Expr, List<String>> {
        val notes = ArrayList<String>()
        if (p.degree < 1) return (p.toExpr(v)) to notes
        val (content, prim) = p.primitive()
        val factors = ArrayList<Pair<Poly, Int>>()
        for ((sf, mult) in prim.squareFree()) {
            var rest = sf.primitive().second
            for (r in rest.rationalRoots()) {
                val lin = Poly(listOf(Rational.of(-r.num), Rational.of(r.den)))
                while (rest.degree >= 1 && rest.eval(r).isZero) { rest = rest.divMod(lin).first; }
                factors += lin to mult
                notes += "x = $r is a rational root (rational root theorem), so (${lin.toExpr(v)}) is a factor"
            }
            rest = rest.primitive().second
            if (rest.degree == 4) {
                val q = quarticSplit(rest)
                if (q != null) { factors += q.first to mult; factors += q.second to mult; notes += "Quartic split into two quadratics with integer coefficients"; rest = Poly.ONE }
            }
            if (rest.degree >= 1) {
                factors += rest to mult
                if (rest.degree == 2) {
                    val disc = rest[1] * rest[1] - Rational.of(4) * rest[2] * rest[0]
                    notes += "${rest.toExpr(v)} has discriminant $disc and no rational roots, so it is irreducible over ℚ" + if (disc.signum < 0) " (complex roots)" else " (irrational real roots)"
                } else notes += "${rest.toExpr(v)} has no rational roots; no further factorization found over ℚ"
            }
        }
        // collect overall numeric factor so that product equals p
        var prod = Poly.ONE
        for ((f, m) in factors) prod *= f.pow(m)
        val scale = if (prod.isZero) content else p.lead / prod.lead
        var expr: Expr? = null
        fun mulIn(x: Expr) { expr = if (expr == null) x else Expr.Mul(expr!!, x) }
        val grouped = factors.groupBy({ it.first }, { it.second }).map { it.key to it.value.sum() }
        // deterministic order: by degree, then linear factors by ascending root
        for ((f, m) in grouped.sortedWith(compareBy({ it.first.degree }, { if (it.first.degree == 1) (-it.first[0] / it.first[1]).toDouble() else 0.0 }))) {
            val fe = f.toExpr(v)
            mulIn(if (m == 1) fe else Expr.Pow(fe, Expr.Frac(Rational.of(m.toLong()))))
        }
        val body = expr ?: Expr.Frac(Rational.ONE)
        val result = if (scale == Rational.ONE) body else if (scale == Rational.MINUS_ONE) Expr.Neg(body) else Expr.Mul(k(scale), body)
        return result to notes
    }

    /** (a x² + b x + c)(d x² + e x + f) with integers; p is primitive with integer coefficients. */
    private fun quarticSplit(p: Poly): Pair<Poly, Poly>? {
        val c = (0..4).map { p[it].num.toLong() }
        if (c.any { Math.abs(it) > 1_000_000 }) return null
        fun divs(n: Long): List<Long> = if (n == 0L) emptyList() else (1..Math.abs(n)).filter { Math.abs(n) % it == 0L }.flatMap { listOf(it, -it) }
        if (c[0] == 0L) return null
        for (a in divs(c[4]).filter { it > 0 }) {
            val d = c[4] / a
            for (cc in divs(c[0])) {
                val f = c[0] / cc
                fun tryBE(bl: Long, el: Long): Pair<Poly, Poly>? {
                    // check every coefficient of (a x² + b x + cc)(d x² + e x + f)
                    if (a * el + bl * d != c[3] || a * f + bl * el + cc * d != c[2] || bl * f + cc * el != c[1]) return null
                    val q1 = Poly(listOf(Rational.of(cc), Rational.of(bl), Rational.of(a)))
                    val q2 = Poly(listOf(Rational.of(f), Rational.of(el), Rational.of(d)))
                    return if (q1 * q2 == p) q1 to q2 else null
                }
                // b·d + a·e = c3 and b·f + cc·e = c1 (Cramer); degenerate systems fall back to a bounded search on b
                val det2 = d * cc - a * f
                if (det2 != 0L) {
                    val bNum = c[3] * cc - a * c[1]
                    val eNum = d * c[1] - f * c[3]
                    if (bNum % det2 == 0L && eNum % det2 == 0L) tryBE(bNum / det2, eNum / det2)?.let { return it }
                } else {
                    for (bl in -64L..64L) {
                        val rem = c[3] - bl * d
                        if (rem % a != 0L) continue
                        tryBE(bl, rem / a)?.let { return it }
                    }
                }
            }
        }
        return null
    }

    fun factor(e: Expr): List<Transformation> {
        val t = AtomTable()
        val f = toRat(e, t)
        val vars = (f.num.atomKeys() + f.den.atomKeys())
        val out = ArrayList<Transformation>()
        if (vars.size == 1 && f.num.asUnivariate(vars.first()) != null && f.den.asUnivariate(vars.first()) != null) {
            val key = vars.first()
            val atomExpr = t.atoms[key]!!
            val v = "\u0000"
            val (num, notesN) = factorPoly(f.num.asUnivariate(key)!!, v)
            val (den, notesD) = factorPoly(f.den.asUnivariate(key)!!, v)
            val body = if (f.den.isConstant && f.den.constantValue == Rational.ONE) num else Expr.Div(num, den)
            val res = body.substitute(v, atomExpr)
            val notes = (notesN + notesD).map { it.replace("\u0000", Printer.print(atomExpr)) }
            out += Transformation("Factored over ℚ", res, notes.joinToString("; ").ifEmpty { "Extracted the common numeric factor" })
            return out
        }
        // multivariate: numeric content, common monomial and difference of squares
        var num = f.num
        val content = num.numericContent()
        num = num.scale(content.reciprocal())
        val mono = num.monomialContent()
        if (mono.factors.isNotEmpty()) num = num.divideMono(mono)
        var core = num.toExpr(t)
        val notes = ArrayList<String>()
        if (content != Rational.ONE) notes += "common numeric factor $content"
        if (mono.factors.isNotEmpty()) notes += "common factor ${MPoly(mapOf(mono to Rational.ONE)).toExpr(t)}"
        diffOfSquares(num, t)?.let { core = it; notes += "difference of squares a² − b² = (a − b)(a + b)" }
        var res: Expr = core
        if (mono.factors.isNotEmpty()) res = Expr.Mul(MPoly(mapOf(mono to Rational.ONE)).toExpr(t), res)
        if (content != Rational.ONE) res = Expr.Mul(k(content), res)
        if (!f.den.isConstant || f.den.constantValue != Rational.ONE) res = Expr.Div(res, f.den.toExpr(t))
        out += Transformation("Factored", res, if (notes.isEmpty()) "No common factors found (multivariate factoring is limited to common factors and differences of squares)" else notes.joinToString("; "))
        return out
    }

    private fun diffOfSquares(p: MPoly, t: AtomTable): Expr? {
        if (p.terms.size != 2) return null
        val (a, b) = p.sortedTerms()
        if (a.second.signum == b.second.signum) return null
        fun sq(m: Mono, c: Rational): Expr? {
            if (m.factors.any { it.second % 2 != 0 }) return null
            val (out, inside) = Surd.sqrtOf(c.abs())
            if (inside != BigInteger.ONE) return null
            val half = Mono(m.factors.map { it.first to it.second / 2 })
            return MPoly(mapOf(half to out)).toExpr(t)
        }
        val pos = if (a.second.signum > 0) a else b
        val neg = if (a.second.signum > 0) b else a
        val x = sq(pos.first, pos.second) ?: return null
        val y = sq(neg.first, neg.second) ?: return null
        return Expr.Mul(Expr.Sub(x, y), Expr.Add(x, y))
    }

    fun substitute(e: Expr, v: String, with: Expr): Expr = Tidy.tidy(e.substitute(v, with))
}
