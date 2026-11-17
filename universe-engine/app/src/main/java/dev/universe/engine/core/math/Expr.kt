package dev.universe.engine.core.math

import kotlin.math.*

/** Compiled node of an expression tree. Slots: 0 = x, 1 = y, 2 = a, 3 = b, 4 = c, 5 = t. */
fun interface Fn { fun ev(v: DoubleArray): Double }

class ParseError(message: String, val pos: Int) : Exception(message)

/**
 * A user-typed mathematical expression compiled to a tree of closures.
 * Supports + − × ÷ ^ !, implicit multiplication (2x, x sin(x), (x+1)(x−1)), |x|,
 * the usual elementary functions, constants π e φ τ, variables x y t and parameters a b c.
 */
class Expr private constructor(private val root: Fn, val source: String, private val used: Set<String>) {
    private val buf = DoubleArray(6)

    fun uses(name: String): Boolean = name in used
    val isConstant: Boolean get() = used.isEmpty()

    fun eval(x: Double, y: Double = 0.0, a: Double = 1.0, b: Double = 1.0, c: Double = 0.0, t: Double = 0.0): Double {
        buf[0] = x; buf[1] = y; buf[2] = a; buf[3] = b; buf[4] = c; buf[5] = t
        return root.ev(buf)
    }

    companion object {
        fun parse(src: String): Expr {
            val p = Parser(src)
            val root = p.parseAll()
            return Expr(root, src, p.used)
        }

        /** Returns the compiled expression, or null with a human-readable reason. */
        fun tryParse(src: String): Pair<Expr?, String?> = try {
            if (src.isBlank()) null to "Type a function of x" else parse(src) to null
        } catch (e: ParseError) {
            null to e.message
        }
    }
}

private val VARS = mapOf("x" to 0, "y" to 1, "a" to 2, "b" to 3, "c" to 4, "t" to 5)
private val CONSTS = mapOf("pi" to PI, "phi" to (1 + sqrt(5.0)) / 2, "tau" to 2 * PI, "e" to E)
private val FUNCS1: Map<String, (Double) -> Double> = mapOf(
    "arcsin" to ::asin, "arccos" to ::acos, "arctan" to ::atan, "asin" to ::asin, "acos" to ::acos, "atan" to ::atan,
    "sinh" to ::sinh, "cosh" to ::cosh, "tanh" to ::tanh, "sin" to ::sin, "cos" to ::cos, "tan" to ::tan,
    "sec" to { 1 / cos(it) }, "csc" to { 1 / sin(it) }, "cot" to { 1 / tan(it) },
    "exp" to ::exp, "ln" to ::ln, "log2" to ::log2, "log10" to ::log10, "log" to ::log10, "sqrt" to ::sqrt, "cbrt" to ::cbrt,
    "abs" to { abs(it) }, "floor" to ::floor, "ceil" to ::ceil, "round" to { round(it) }, "sign" to { sign(it) }, "sgn" to { sign(it) },
    "gamma" to { Num.gamma(it) }, "sinc" to { if (it == 0.0) 1.0 else sin(it) / it }, "step" to { if (it >= 0) 1.0 else 0.0 },
)
private val FUNCS2: Map<String, (Double, Double) -> Double> = mapOf(
    "atan2" to ::atan2, "min" to { p, q -> min(p, q) }, "max" to { p, q -> max(p, q) }, "mod" to { p, q -> p - q * floor(p / q) },
)
private val NAMES: List<String> = (VARS.keys + CONSTS.keys + FUNCS1.keys + FUNCS2.keys).sortedByDescending { it.length }

private class Parser(private val s: String) {
    private var i = 0
    val used = HashSet<String>()

    fun parseAll(): Fn {
        val e = expr()
        ws()
        if (i < s.length) throw ParseError(if (s[i] == ')') "Unmatched ')'" else "Unexpected '${s[i]}'", i)
        return e
    }

    private fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
    private fun peek(): Char = if (i < s.length) s[i] else '\u0000'

    private fun expr(): Fn {
        var l = term()
        while (true) {
            ws()
            val c = peek()
            if (c == '+') { i++; val r = term(); val p = l; l = Fn { p.ev(it) + r.ev(it) } }
            else if (c == '-' || c == '−') { i++; val r = term(); val p = l; l = Fn { p.ev(it) - r.ev(it) } }
            else break
        }
        return l
    }

    private fun startsPrimary(c: Char) = c.isLetterOrDigit() || c == '(' || c == '.' || c == '√' || c == 'π' || c == 'φ' || c == 'τ'

    private fun term(): Fn {
        var l = unary()
        while (true) {
            ws()
            val c = peek()
            if (c == '*' && i + 1 < s.length && s[i + 1] == '*') break
            if (c == '*' || c == '·' || c == '×') { i++; val r = unary(); val p = l; l = Fn { p.ev(it) * r.ev(it) } }
            else if (c == '/' || c == '÷') { i++; val r = unary(); val p = l; l = Fn { p.ev(it) / r.ev(it) } }
            else if (startsPrimary(c)) { val r = power(); val p = l; l = Fn { p.ev(it) * r.ev(it) } }
            else break
        }
        return l
    }

    private fun unary(): Fn {
        ws()
        val c = peek()
        if (c == '-' || c == '−') { i++; val u = unary(); return Fn { -u.ev(it) } }
        if (c == '+') { i++; return unary() }
        return power()
    }

    private fun power(): Fn {
        val base = postfix()
        ws()
        val isPow = peek() == '^' || (peek() == '*' && i + 1 < s.length && s[i + 1] == '*')
        if (isPow) {
            i += if (peek() == '^') 1 else 2
            val ex = unary()
            return Fn { base.ev(it).pow(ex.ev(it)) }
        }
        return base
    }

    private fun postfix(): Fn {
        var p = primary()
        ws()
        while (peek() == '!') { i++; val q = p; p = Fn { Num.gamma(q.ev(it) + 1) }; ws() }
        return p
    }

    private fun expect(c: Char) {
        ws()
        if (peek() != c) throw ParseError("Missing '$c'", i)
        i++
    }

    private fun primary(): Fn {
        ws()
        if (i >= s.length) throw ParseError("The expression is incomplete", i)
        val c = s[i]
        return when {
            c.isDigit() || c == '.' -> number()
            c == '(' -> { i++; val e = expr(); expect(')'); e }
            c == '|' -> { i++; val e = expr(); expect('|'); Fn { abs(e.ev(it)) } }
            c == '√' -> { i++; val e = power(); Fn { sqrt(e.ev(it)) } }
            c == 'π' -> { i++; Fn { PI } }
            c == 'φ' -> { i++; val v = CONSTS.getValue("phi"); Fn { v } }
            c == 'τ' -> { i++; Fn { 2 * PI } }
            c.isLetter() -> ident()
            else -> throw ParseError("Unexpected '$c'", i)
        }
    }

    private fun number(): Fn {
        val st = i
        while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
        if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
            var j = i + 1
            if (j < s.length && (s[j] == '+' || s[j] == '-')) j++
            if (j < s.length && s[j].isDigit()) { while (j < s.length && s[j].isDigit()) j++; i = j }
        }
        val v = s.substring(st, i).toDoubleOrNull() ?: throw ParseError("Malformed number", st)
        return Fn { v }
    }

    private fun ident(): Fn {
        val name = NAMES.firstOrNull { s.regionMatches(i, it, 0, it.length, ignoreCase = true) } ?: throw ParseError("Unknown symbol '${s[i]}'", i)
        i += name.length
        VARS[name]?.let { idx -> used += name; return Fn { it[idx] } }
        CONSTS[name]?.let { v -> return Fn { v } }
        FUNCS2[name]?.let { f ->
            expect('(')
            val p = expr(); expect(','); val q = expr(); expect(')')
            return Fn { f(p.ev(it), q.ev(it)) }
        }
        val f = FUNCS1.getValue(name)
        ws()
        val arg = if (peek() == '(') { i++; val e = expr(); expect(')'); e } else power()
        return Fn { f(arg.ev(it)) }
    }
}
