package com.quantumath.math.symbolic

import com.quantumath.math.core.DivisionByZero
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Printer

/**
 * Multivariate polynomial over "atoms". An atom is a variable or any non-polynomial
 * subexpression (sin(x), e^x, √x…) treated as an opaque symbol, so like terms combine
 * correctly (2·sin(x) + 3·sin(x) = 5·sin(x)) without pretending to know identities.
 */
class Mono(val factors: List<Pair<String, Int>>) : Comparable<Mono> {
    val degree get() = factors.sumOf { it.second }
    operator fun times(o: Mono): Mono {
        val m = sortedMapOf<String, Int>()
        for ((k, e) in factors) m[k] = (m[k] ?: 0) + e
        for ((k, e) in o.factors) m[k] = (m[k] ?: 0) + e
        return Mono(m.filter { it.value != 0 }.map { it.key to it.value })
    }
    fun exponentOf(k: String) = factors.firstOrNull { it.first == k }?.second ?: 0
    fun without(k: String) = Mono(factors.filter { it.first != k })
    override fun compareTo(other: Mono): Int {
        // graded: higher total degree first, then lexicographic by atom with higher exponents first
        if (degree != other.degree) return other.degree - degree
        val n = minOf(factors.size, other.factors.size)
        for (i in 0 until n) {
            val (ka, ea) = factors[i]; val (kb, eb) = other.factors[i]
            if (ka != kb) return AtomOrder.compare(ka, kb)
            if (ea != eb) return eb - ea
        }
        return factors.size - other.factors.size
    }
    override fun equals(other: Any?) = other is Mono && factors == other.factors
    override fun hashCode() = factors.hashCode()
    companion object { val ONE = Mono(emptyList()) }
}

/** Single-letter variables first (alphabetical), then other atoms. */
object AtomOrder : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        val va = a.length == 1 && a[0].isLetter(); val vb = b.length == 1 && b[0].isLetter()
        if (va != vb) return if (va) -1 else 1
        return a.compareTo(b)
    }
}

class AtomTable {
    val atoms = HashMap<String, Expr>()
    fun key(e: Expr): String { val k = Printer.print(e); atoms[k] = e; return k }
}

class MPoly(val terms: Map<Mono, Rational>) {
    companion object {
        val ZERO = MPoly(emptyMap())
        val ONE = constant(Rational.ONE)
        fun constant(r: Rational) = if (r.isZero) ZERO else MPoly(mapOf(Mono.ONE to r))
        fun atom(k: String) = MPoly(mapOf(Mono(listOf(k to 1)) to Rational.ONE))
        const val MAX_TERMS = 4000
    }
    val isZero get() = terms.isEmpty()
    val isConstant get() = terms.keys.all { it.factors.isEmpty() }
    val constantValue: Rational get() = terms[Mono.ONE] ?: Rational.ZERO

    operator fun plus(o: MPoly): MPoly {
        val m = HashMap(terms)
        for ((k, v) in o.terms) { val s = (m[k] ?: Rational.ZERO) + v; if (s.isZero) m.remove(k) else m[k] = s }
        return MPoly(m)
    }
    operator fun unaryMinus() = MPoly(terms.mapValues { -it.value })
    operator fun minus(o: MPoly) = this + (-o)
    operator fun times(o: MPoly): MPoly {
        if (terms.size * o.terms.size > MAX_TERMS * 4) throw MathError("Expression is too large to expand")
        val m = HashMap<Mono, Rational>()
        for ((ka, va) in terms) for ((kb, vb) in o.terms) {
            val k = ka * kb
            val s = (m[k] ?: Rational.ZERO) + va * vb
            if (s.isZero) m.remove(k) else m[k] = s
        }
        if (m.size > MAX_TERMS) throw MathError("Expression is too large to expand")
        return MPoly(m)
    }
    fun scale(r: Rational) = if (r.isZero) ZERO else MPoly(terms.mapValues { it.value * r })
    fun pow(n: Int): MPoly { var r = ONE; var b = this; var k = n; while (k > 0) { if (k and 1 == 1) r *= b; b *= b; k = k shr 1 }; return r }

    fun atomKeys(): Set<String> = terms.keys.flatMap { m -> m.factors.map { it.first } }.toSet()

    /** If this is a polynomial in exactly the single atom k (or constant), return it as a univariate Poly. */
    fun asUnivariate(k: String): Poly? {
        if (atomKeys().any { it != k }) return null
        val maxDeg = terms.keys.maxOfOrNull { it.exponentOf(k) } ?: 0
        if (maxDeg > 1000) return null
        val c = MutableList(maxDeg + 1) { Rational.ZERO }
        for ((m, v) in terms) c[m.exponentOf(k)] = v
        return Poly(c)
    }

    /** Monomial gcd of all terms (common atom powers). */
    fun monomialContent(): Mono {
        if (terms.isEmpty()) return Mono.ONE
        val keys = terms.keys.toList()
        val common = keys.first().factors.mapNotNull { (k, _) -> val e = keys.minOf { it.exponentOf(k) }; if (e > 0) k to e else null }
        return Mono(common)
    }

    fun divideMono(m: Mono): MPoly = MPoly(terms.mapKeys { (k, _) -> Mono(k.factors.mapNotNull { (a, e) -> val r = e - m.exponentOf(a); if (r > 0) a to r else if (r == 0) null else throw MathError("not divisible") }) })

    fun sortedTerms(): List<Pair<Mono, Rational>> = terms.entries.sortedBy { it.key }.map { it.key to it.value }

    /** Rational content (gcd of numerators / lcm of denominators), sign of the leading term. */
    fun numericContent(): Rational {
        if (isZero) return Rational.ONE
        var g = java.math.BigInteger.ZERO; var l = java.math.BigInteger.ONE
        for (v in terms.values) { g = g.gcd(v.num); l = l / l.gcd(v.den) * v.den }
        val lead = sortedTerms().first().second
        return Rational.of(if (lead.signum < 0) g.negate() else g, l)
    }

    fun toExpr(table: AtomTable): Expr {
        if (isZero) return Expr.Frac(Rational.ZERO)
        var acc: Expr? = null
        for ((m, k) in sortedTerms()) {
            val monoExpr: Expr? = m.factors.fold(null as Expr?) { a, (key, e) ->
                val base = table.atoms[key] ?: throw MathError("internal: unknown atom $key")
                val f = if (e == 1) base else Expr.Pow(base, Expr.Frac(Rational.of(e.toLong())))
                if (a == null) f else Expr.Mul(a, f)
            }
            val absK = k.abs()
            val term: Expr = when {
                monoExpr == null -> Expr.Frac(absK)
                absK == Rational.ONE -> monoExpr
                absK.isInteger -> Expr.Mul(Expr.Frac(absK), monoExpr)
                absK.num == java.math.BigInteger.ONE -> Expr.Div(monoExpr, Expr.Frac(Rational.of(absK.den)))
                else -> Expr.Div(Expr.Mul(Expr.Frac(Rational.of(absK.num)), monoExpr), Expr.Frac(Rational.of(absK.den)))
            }
            acc = when {
                acc == null -> if (k.signum < 0) Expr.Neg(term) else term
                k.signum < 0 -> Expr.Sub(acc, term)
                else -> Expr.Add(acc, term)
            }
        }
        return acc!!
    }

    override fun equals(other: Any?) = other is MPoly && terms == other.terms
    override fun hashCode() = terms.hashCode()
}

/** num / den with den ≠ 0, kept in a normalised form. */
class RatForm(val num: MPoly, val den: MPoly) {
    companion object {
        fun of(p: MPoly) = RatForm(p, MPoly.ONE)
        fun constant(r: Rational) = of(MPoly.constant(r))
    }
    val isPolynomial get() = den.isConstant
    operator fun plus(o: RatForm) = if (den == o.den) RatForm(num + o.num, den).normalize() else RatForm(num * o.den + o.num * den, den * o.den).normalize()
    operator fun minus(o: RatForm) = this + (-o)
    operator fun unaryMinus() = RatForm(-num, den)
    operator fun times(o: RatForm) = RatForm(num * o.num, den * o.den).normalize()
    operator fun div(o: RatForm): RatForm {
        if (o.num.isZero) throw DivisionByZero()
        return RatForm(num * o.den, den * o.num).normalize()
    }
    fun pow(n: Int): RatForm = if (n >= 0) RatForm(num.pow(n), den.pow(n)).normalize() else RatForm(den.pow(-n), num.pow(-n)).also { if (num.isZero) throw DivisionByZero() }.normalize()

    /** Cancel common monomial factors, numeric content, and univariate polynomial gcds. */
    fun normalize(): RatForm {
        if (num.isZero) return RatForm(MPoly.ZERO, MPoly.ONE)
        var n = num; var d = den
        // monomial content
        val mc = commonMono(n.monomialContent(), d.monomialContent())
        if (mc.factors.isNotEmpty()) { n = n.divideMono(mc); d = d.divideMono(mc) }
        // univariate gcd cancellation in a single shared atom
        val atoms = n.atomKeys() + d.atomKeys()
        if (atoms.size == 1) {
            val k = atoms.first()
            val pn = n.asUnivariate(k); val pd = d.asUnivariate(k)
            if (pn != null && pd != null && pd.degree >= 1) {
                val g = pn.gcd(pd)
                if (g.degree >= 1) {
                    n = fromPoly(pn.divMod(g).first, k)
                    d = fromPoly(pd.divMod(g).first, k)
                }
            }
        }
        // make the denominator's leading coefficient 1
        val lead = d.sortedTerms().first().second
        if (lead != Rational.ONE) { val inv = lead.reciprocal(); n = n.scale(inv); d = d.scale(inv) }
        return RatForm(n, d)
    }

    private fun commonMono(a: Mono, b: Mono) = Mono(a.factors.mapNotNull { (k, e) -> val m = minOf(e, b.exponentOf(k)); if (m > 0) k to m else null })

    private fun fromPoly(p: Poly, k: String): MPoly {
        var r = MPoly.ZERO
        for (i in p.c.indices) if (!p.c[i].isZero) r += MPoly(mapOf((if (i == 0) Mono.ONE else Mono(listOf(k to i))) to p.c[i]))
        return r
    }

    fun toExpr(table: AtomTable): Expr {
        val ne = num.toExpr(table)
        if (den.isConstant) {
            val c = den.constantValue
            return if (c == Rational.ONE) ne else num.scale(c.reciprocal()).toExpr(table)
        }
        return Expr.Div(ne, den.toExpr(table))
    }
}
