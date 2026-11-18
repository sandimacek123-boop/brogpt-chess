package com.quantumath.math.symbolic

import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.expr.Expr
import java.math.BigInteger

/** Univariate polynomial with exact rational coefficients; c[i] is the coefficient of x^i. */
class Poly(coeffs: List<Rational>) {
    val c: List<Rational> = coeffs.dropLastWhile { it.isZero }

    companion object {
        val ZERO = Poly(emptyList())
        val ONE = Poly(listOf(Rational.ONE))
        val X = Poly(listOf(Rational.ZERO, Rational.ONE))
        fun constant(r: Rational) = Poly(listOf(r))
        fun linear(a: Rational, b: Rational) = Poly(listOf(b, a)) // a·x + b
    }

    val degree get() = c.size - 1 // -1 for the zero polynomial
    val isZero get() = c.isEmpty()
    val lead get() = c.lastOrNull() ?: Rational.ZERO
    operator fun get(i: Int): Rational = c.getOrElse(i) { Rational.ZERO }

    operator fun plus(o: Poly) = Poly(List(maxOf(c.size, o.c.size)) { this[it] + o[it] })
    operator fun minus(o: Poly) = Poly(List(maxOf(c.size, o.c.size)) { this[it] - o[it] })
    operator fun unaryMinus() = Poly(c.map { -it })
    operator fun times(o: Poly): Poly {
        if (isZero || o.isZero) return ZERO
        val r = MutableList(c.size + o.c.size - 1) { Rational.ZERO }
        for (i in c.indices) for (j in o.c.indices) r[i + j] = r[i + j] + c[i] * o.c[j]
        return Poly(r)
    }
    fun scale(k: Rational) = Poly(c.map { it * k })
    fun pow(n: Int): Poly { var r = ONE; repeat(n) { r *= this }; return r }

    /** Polynomial long division: returns (quotient, remainder). */
    fun divMod(d: Poly): Pair<Poly, Poly> {
        if (d.isZero) throw MathError("Division by the zero polynomial")
        var rem = this
        val q = MutableList(maxOf(0, degree - d.degree + 1)) { Rational.ZERO }
        while (!rem.isZero && rem.degree >= d.degree) {
            val k = rem.degree - d.degree
            val f = rem.lead / d.lead
            q[k] = f
            rem -= Poly(List(k) { Rational.ZERO } + d.c.map { it * f })
        }
        return Poly(q) to rem
    }

    fun monic(): Poly = if (isZero) this else scale(lead.reciprocal())

    fun gcd(o: Poly): Poly {
        var a = this; var b = o
        while (!b.isZero) { val r = a.divMod(b).second; a = b; b = r }
        return a.monic()
    }

    fun derivative() = Poly(List(maxOf(0, c.size - 1)) { c[it + 1] * Rational.of((it + 1).toLong()) })

    fun eval(x: Rational): Rational { var r = Rational.ZERO; for (i in c.indices.reversed()) r = r * x + c[i]; return r }
    fun eval(x: Double): Double { var r = 0.0; for (i in c.indices.reversed()) r = r * x + c[i].toDouble(); return r }

    /** Integer-coefficient primitive form: content·P with P having coprime integer coefficients and positive lead. */
    fun primitive(): Pair<Rational, Poly> {
        if (isZero) return Rational.ZERO to this
        val lcmDen = c.fold(BigInteger.ONE) { acc, r -> acc / acc.gcd(r.den) * r.den }
        val ints = c.map { (it * Rational.of(lcmDen)).num }
        var g = ints.fold(BigInteger.ZERO) { acc, v -> acc.gcd(v) }
        if (lead.signum < 0) g = g.negate()
        val content = Rational.of(g, lcmDen)
        return content to Poly(ints.map { Rational.of(it / g) })
    }

    /** All rational roots (rational root theorem), each listed once. */
    fun rationalRoots(): List<Rational> {
        if (degree < 1) return emptyList()
        var p = primitive().second
        val roots = ArrayList<Rational>()
        if (p[0].isZero) {
            roots += Rational.ZERO
            while (p[0].isZero && !p.isZero) p = Poly(p.c.drop(1))
        }
        if (p.degree < 1) return roots
        val a0 = p[0].num.abs(); val an = p.lead.num.abs()
        if (a0.bitLength() > 62 || an.bitLength() > 62) return roots // keep divisor enumeration bounded
        val ps = divisors(a0.toLong()); val qs = divisors(an.toLong())
        if (ps.size * qs.size > 20000) return roots
        val cand = LinkedHashSet<Rational>()
        for (pp in ps) for (qq in qs) { cand += Rational.of(pp, qq); cand += Rational.of(-pp, qq) }
        for (r in cand.sorted()) if (p.eval(r).isZero) roots += r
        return roots.distinct().sorted()
    }

    private fun divisors(n: Long): List<Long> {
        if (n == 0L) return listOf(1)
        val out = ArrayList<Long>()
        var i = 1L
        while (i * i <= n) {
            if (n % i == 0L) { out += i; if (i != n / i) out += n / i }
            i++
            if (i > 2_000_000) break
        }
        return out
    }

    /** Multiplicity of root r. */
    fun multiplicity(r: Rational): Int {
        var p = this; var m = 0
        val lin = Poly(listOf(-r, Rational.ONE))
        while (!p.isZero && p.eval(r).isZero) { p = p.divMod(lin).first; m++ }
        return m
    }

    /** Square-free factorization (Yun). Returns list of (factor, multiplicity) with monic factors. */
    fun squareFree(): List<Pair<Poly, Int>> {
        if (degree < 1) return emptyList()
        val f = monic()
        val out = ArrayList<Pair<Poly, Int>>()
        var a = f.gcd(f.derivative())
        var b = f.divMod(a).first
        var cc = f.derivative().divMod(a).first
        var d = cc - b.derivative()
        var i = 1
        while (b.degree >= 1) {
            val g = b.gcd(d)
            if (g.degree >= 1) out += g to i
            b = b.divMod(g).first
            cc = d.divMod(g).first
            d = cc - b.derivative()
            i++
            if (i > 200) break
        }
        return out
    }

    fun toExpr(v: String = "x"): Expr {
        if (isZero) return Expr.Frac(Rational.ZERO)
        var acc: Expr? = null
        for (i in c.indices.reversed()) {
            val k = c[i]
            if (k.isZero) continue
            val mono: Expr? = when (i) { 0 -> null; 1 -> Expr.Var(v); else -> Expr.Pow(Expr.Var(v), Expr.Frac(Rational.of(i.toLong()))) }
            val absK = k.abs()
            val term: Expr = when {
                mono == null -> Expr.Frac(absK)
                absK == Rational.ONE -> mono
                else -> Expr.Mul(Expr.Frac(absK), mono)
            }
            acc = when {
                acc == null -> if (k.signum < 0) Expr.Neg(term) else term
                k.signum < 0 -> Expr.Sub(acc, term)
                else -> Expr.Add(acc, term)
            }
        }
        return acc!!
    }

    fun toDoubleArray() = DoubleArray(c.size) { c[it].toDouble() }
    override fun toString() = toExpr().toString()
    override fun equals(other: Any?) = other is Poly && c == other.c
    override fun hashCode() = c.hashCode()
}

/** Exact representation a + b·√d (d square-free, d > 1) divided by denominator — used for quadratic roots. */
data class Surd(val a: Rational, val b: Rational, val d: BigInteger) {
    fun toDouble() = a.toDouble() + b.toDouble() * Math.sqrt(d.toDouble())
    fun toExpr(): Expr {
        if (b.isZero || d == BigInteger.ONE) return Expr.Frac(a + b * if (d == BigInteger.ONE) Rational.ONE else Rational.ZERO)
        val root: Expr = Expr.Call("sqrt", listOf(Expr.Frac(Rational.of(d))))
        val bAbs = b.abs()
        val rootTerm: Expr = when {
            bAbs.isInteger && bAbs == Rational.ONE -> root
            bAbs.isInteger -> Expr.Mul(Expr.Frac(bAbs), root)
            bAbs.num == BigInteger.ONE -> Expr.Div(root, Expr.Frac(Rational.of(bAbs.den)))
            else -> Expr.Div(Expr.Mul(Expr.Frac(Rational.of(bAbs.num)), root), Expr.Frac(Rational.of(bAbs.den)))
        }
        return when {
            a.isZero -> if (b.signum < 0) Expr.Neg(rootTerm) else rootTerm
            b.signum < 0 -> Expr.Sub(Expr.Frac(a), rootTerm)
            else -> Expr.Add(Expr.Frac(a), rootTerm)
        }
    }

    companion object {
        /** √(r) for rational r ≥ 0 simplified to b·√d. Returns (b, d) with d square-free. */
        fun sqrtOf(r: Rational): Pair<Rational, BigInteger> {
            require(r.signum >= 0)
            if (r.isZero) return Rational.ZERO to BigInteger.ONE
            // √(p/q) = √(p·q)/q
            val n = r.num * r.den
            val (outside, inside) = squareFactor(n)
            return Rational.of(outside, r.den) to inside
        }

        /** n = s²·t with t square-free (trial division up to 10^6, remaining part assumed square-free). */
        fun squareFactor(n0: BigInteger): Pair<BigInteger, BigInteger> {
            var n = n0
            var s = BigInteger.ONE
            var p = BigInteger.TWO
            val limit = BigInteger.valueOf(1_000_000)
            while (p <= limit && p * p <= n) {
                val p2 = p * p
                while (n.mod(p2).signum() == 0) { n /= p2; s *= p }
                p += BigInteger.ONE
            }
            val r = n.sqrt()
            if (r * r == n) { s *= r; n = BigInteger.ONE }
            return s to n
        }
    }
}
