package com.quantumath.math.expr

import com.quantumath.math.core.ParseError
import java.math.BigDecimal

/**
 * Deterministic recursive-descent parser. No string evaluation of any kind is used.
 *
 * Grammar (lowest to highest precedence):
 *   relation  := sum (relop sum)?                     relop ∈ = < > <= >= ≤ ≥
 *   sum       := product (('+' | '-') product)*      left-associative
 *   product   := unary (('*' | '/' | implicit) unary)*  left-associative; implicit = juxtaposition
 *   unary     := ('-' | '+') unary | power             so -2^2 = -(2^2)
 *   power     := postfix ('^' unary)?                  right-associative: 2^3^2 = 2^(3^2)
 *   postfix   := primary ('!' | '%' | '²' | '³')*
 *   primary   := number | constant | variable | function call | '(' sum ')' | '|' sum '|' | '√' power
 */
class Parser(private val src: String, private val complexMode: Boolean = false) {

    companion object {
        val FUNCTIONS = setOf(
            "sin", "cos", "tan", "sec", "csc", "cot",
            "asin", "acos", "atan", "acot", "asec", "acsc",
            "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
            "ln", "log", "log2", "log10", "exp", "sqrt", "cbrt", "root",
            "abs", "floor", "ceil", "round", "sign", "min", "max",
            "gcd", "lcm", "nCr", "nPr", "mod", "gamma",
            "re", "im", "arg", "conj",
        )
        private val ALIASES = mapOf(
            "arcsin" to "asin", "arccos" to "acos", "arctan" to "atan", "arccot" to "acot",
            "arsinh" to "asinh", "arcosh" to "acosh", "artanh" to "atanh", "arcsinh" to "asinh",
            "arccosh" to "acosh", "arctanh" to "atanh", "lg" to "log10", "sgn" to "sign",
            "ncr" to "nCr", "npr" to "nPr", "fact" to "gamma1",
        )
        val CONSTANTS = mapOf("pi" to "pi", "π" to "pi", "e" to "e", "phi" to "phi", "φ" to "phi", "tau" to "tau", "τ" to "tau")

        fun parse(text: String, complexMode: Boolean = false): Expr = Parser(text, complexMode).parseExpression()
        fun parseRelation(text: String): Relation = Parser(text).parseRelationTop()
    }

    private enum class T { NUM, IDENT_FN, IDENT_CONST, IDENT_VAR, OP, LPAREN, RPAREN, COMMA, BAR, END }
    private data class Tok(val type: T, val text: String, val pos: Int)

    private val tokens: List<Tok> = tokenize()
    private var p = 0
    private var absDepth = 0

    private fun tokenize(): List<Tok> {
        val out = ArrayList<Tok>()
        var i = 0
        val s = src
        val names = (FUNCTIONS + ALIASES.keys + CONSTANTS.keys).sortedByDescending { it.length }
        while (i < s.length) {
            val c = s[i]
            when {
                c.isWhitespace() -> i++
                c.isDigit() || (c == '.' && i + 1 < s.length && s[i + 1].isDigit()) -> {
                    val start = i
                    while (i < s.length && s[i].isDigit()) i++
                    if (i < s.length && s[i] == '.') {
                        i++
                        while (i < s.length && s[i].isDigit()) i++
                    }
                    // scientific notation only when 'e' is followed by a digit or a signed digit
                    if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                        val j = i + 1
                        val hasSign = j < s.length && (s[j] == '+' || s[j] == '-')
                        val k = if (hasSign) j + 1 else j
                        if (k < s.length && s[k].isDigit()) {
                            i = k
                            while (i < s.length && s[i].isDigit()) i++
                        }
                    }
                    out += Tok(T.NUM, s.substring(start, i), start)
                }
                c.isLetter() -> {
                    // longest known function/constant name at this position, else a single-letter variable
                    val matched: String? = names.firstOrNull { s.startsWith(it, i) }
                    if (complexMode && c == 'i' && (matched == null || matched.length == 1)) {
                        out += Tok(T.IDENT_CONST, "i", i); i++
                    } else if (matched != null) {
                        val canonical = ALIASES[matched] ?: matched
                        val type = if (CONSTANTS.containsKey(matched)) T.IDENT_CONST else T.IDENT_FN
                        out += Tok(type, if (type == T.IDENT_CONST) CONSTANTS[matched]!! else canonical, i)
                        i += matched.length
                    } else {
                        out += Tok(T.IDENT_VAR, c.toString(), i); i++
                    }
                }
                c == '(' || c == '[' || c == '{' -> { out += Tok(T.LPAREN, "(", i); i++ }
                c == ')' || c == ']' || c == '}' -> { out += Tok(T.RPAREN, ")", i); i++ }
                c == ',' || c == ';' -> { out += Tok(T.COMMA, ",", i); i++ }
                c == '|' -> { out += Tok(T.BAR, "|", i); i++ }
                c == '<' || c == '>' -> {
                    if (i + 1 < s.length && s[i + 1] == '=') { out += Tok(T.OP, "$c=", i); i += 2 } else { out += Tok(T.OP, c.toString(), i); i++ }
                }
                c == '≤' -> { out += Tok(T.OP, "<=", i); i++ }
                c == '≥' -> { out += Tok(T.OP, ">=", i); i++ }
                c == '*' && i + 1 < s.length && s[i + 1] == '*' -> { out += Tok(T.OP, "^", i); i += 2 }
                c in "+-*/^!%=²³√" -> { out += Tok(T.OP, c.toString(), i); i++ }
                c == '×' || c == '·' || c == '⋅' -> { out += Tok(T.OP, "*", i); i++ }
                c == '÷' -> { out += Tok(T.OP, "/", i); i++ }
                c == '−' || c == '–' -> { out += Tok(T.OP, "-", i); i++ }
                c == 'θ' || c == 'α' || c == 'β' || c == 'λ' || c == 'μ' -> { out += Tok(T.IDENT_VAR, c.toString(), i); i++ }
                else -> throw ParseError("Unexpected character '$c'", i)
            }
        }
        out += Tok(T.END, "", s.length)
        return out
    }

    private val cur get() = tokens[p]
    private fun isOp(t: String) = cur.type == T.OP && cur.text == t
    private fun advance(): Tok = tokens[p++]
    private fun expect(type: T, what: String): Tok {
        if (cur.type != type) throw ParseError(if (cur.type == T.END) "Unexpected end of expression: expected $what" else "Expected $what at position ${cur.pos + 1}", cur.pos)
        return advance()
    }

    fun parseExpression(): Expr {
        if (tokens.size == 1) throw ParseError("Empty expression")
        val e = parseSum()
        if (cur.type != T.END) {
            if (cur.type == T.OP && cur.text in setOf("=", "<", ">", "<=", ">=")) throw ParseError("Unexpected '${cur.text}': this field expects an expression, not an equation", cur.pos)
            throw ParseError(if (cur.type == T.RPAREN) "Unmatched ')' at position ${cur.pos + 1}" else "Unexpected '${cur.text}' at position ${cur.pos + 1}", cur.pos)
        }
        return e
    }

    fun parseRelationTop(): Relation {
        if (tokens.size == 1) throw ParseError("Empty equation")
        val left = parseSum()
        if (cur.type == T.END) return Relation(left, "=", Expr.Frac(com.quantumath.math.core.Rational.ZERO))
        if (cur.type != T.OP || cur.text !in setOf("=", "<", ">", "<=", ">=")) throw ParseError("Unexpected '${cur.text}' at position ${cur.pos + 1}", cur.pos)
        val op = advance().text
        val right = parseSum()
        if (cur.type != T.END) throw ParseError("Unexpected '${cur.text}' at position ${cur.pos + 1}", cur.pos)
        return Relation(left, op, right)
    }

    private fun parseSum(): Expr {
        var left = parseProduct()
        while (cur.type == T.OP && (cur.text == "+" || cur.text == "-")) {
            val op = advance().text
            val right = parseProduct()
            left = if (op == "+") Expr.Add(left, right) else Expr.Sub(left, right)
        }
        return left
    }

    private fun startsPrimary(): Boolean = when (cur.type) {
        T.NUM, T.IDENT_FN, T.IDENT_CONST, T.IDENT_VAR, T.LPAREN -> true
        T.BAR -> absDepth == 0 // inside |...| a bar closes the group
        T.OP -> cur.text == "√"
        else -> false
    }

    private fun parseProduct(): Expr {
        var left = parseUnary()
        while (true) {
            if (cur.type == T.OP && (cur.text == "*" || cur.text == "/")) {
                val op = advance().text
                val right = parseUnary()
                left = if (op == "*") Expr.Mul(left, right) else Expr.Div(left, right)
            } else if (startsPrimary()) {
                if (cur.type == T.NUM && endsWithNumber(left)) throw ParseError("Missing operator between numbers at position ${cur.pos + 1}", cur.pos)
                val right = parsePower()
                left = Expr.Mul(left, right)
            } else break
        }
        return left
    }

    private fun endsWithNumber(e: Expr): Boolean = e is Expr.Num || (e is Expr.Mul && endsWithNumber(e.right))

    private fun parseUnary(): Expr {
        if (isOp("-")) { advance(); return Expr.Neg(parseUnary()) }
        if (isOp("+")) { advance(); return parseUnary() }
        return parsePower()
    }

    private fun parsePower(): Expr {
        val base = parsePostfix()
        if (isOp("^")) {
            advance()
            val exp = parseUnary() // right-assoc and allows 2^-1
            return Expr.Pow(base, exp)
        }
        return base
    }

    private fun parsePostfix(): Expr {
        var e = parsePrimary()
        while (cur.type == T.OP) {
            e = when (cur.text) {
                "!" -> { advance(); Expr.Fact(e) }
                "%" -> { advance(); Expr.Percent(e) }
                "²" -> { advance(); Expr.Pow(e, Expr.Num(BigDecimal(2))) }
                "³" -> { advance(); Expr.Pow(e, Expr.Num(BigDecimal(3))) }
                else -> return e
            }
        }
        return e
    }

    private fun parsePrimary(): Expr {
        val t = cur
        return when (t.type) {
            T.NUM -> {
                advance()
                try { Expr.Num(BigDecimal(t.text)) } catch (_: NumberFormatException) { throw ParseError("Invalid number '${t.text}'", t.pos) }
            }
            T.IDENT_CONST -> { advance(); Expr.Const(t.text) }
            T.IDENT_VAR -> { advance(); Expr.Var(t.text) }
            T.LPAREN -> {
                advance()
                val saved = absDepth
                absDepth = 0
                val e = parseSum()
                absDepth = saved
                if (cur.type != T.RPAREN) throw ParseError(if (cur.type == T.END) "Missing ')'" else "Expected ')' at position ${cur.pos + 1}", cur.pos)
                advance()
                e
            }
            T.BAR -> {
                advance()
                absDepth++
                val e = parseSum()
                absDepth--
                if (cur.type != T.BAR) throw ParseError("Missing closing '|'", cur.pos)
                advance()
                Expr.Call("abs", listOf(e))
            }
            T.OP -> {
                if (t.text == "√") {
                    advance()
                    Expr.Call("sqrt", listOf(parsePower()))
                } else if (t.text == "-") {
                    advance(); Expr.Neg(parsePower())
                } else throw ParseError(if (t.text in setOf("*", "/", "^", "!", "%")) "Operator '${t.text}' is missing a left operand" else "Unexpected '${t.text}' at position ${t.pos + 1}", t.pos)
            }
            T.IDENT_FN -> parseCall()
            T.END -> throw ParseError("Unexpected end of expression")
            T.RPAREN -> throw ParseError("Unexpected ')' at position ${t.pos + 1}", t.pos)
            T.COMMA -> throw ParseError("Unexpected ',' at position ${t.pos + 1}", t.pos)
        }
    }

    private fun parseCall(): Expr {
        val nameTok = advance()
        var name = nameTok.text
        // f^2(x) style powers are not supported to avoid ambiguity with inverse notation
        val args = ArrayList<Expr>()
        if (cur.type == T.LPAREN) {
            advance()
            val saved = absDepth
            absDepth = 0
            if (cur.type != T.RPAREN) {
                args += parseSum()
                while (cur.type == T.COMMA) { advance(); args += parseSum() }
            }
            absDepth = saved
            if (cur.type != T.RPAREN) throw ParseError("Missing ')' after arguments of $name", cur.pos)
            advance()
        } else {
            // juxtaposition: sin x, ln 2 — the argument is a power-level term (sin x^2 = sin(x^2))
            if (!startsPrimary() && !isOp("-")) throw ParseError("Function '$name' needs an argument", cur.pos)
            args += if (isOp("-")) { advance(); Expr.Neg(parsePower()) } else parsePower()
        }
        if (name == "gamma1") return Expr.Fact(args.single())
        val arity = when (name) {
            "root", "nCr", "nPr", "mod", "gcd", "lcm" -> 2..2
            "log" -> 1..2
            "min", "max" -> 1..64
            "round" -> 1..2
            else -> 1..1
        }
        if (args.size !in arity) throw ParseError("$name expects ${if (arity.first == arity.last) "${arity.first}" else "${arity.first}–${arity.last}"} argument(s), got ${args.size}", nameTok.pos)
        if (name == "log" && args.size == 1) name = "log10"
        return Expr.Call(name, args)
    }
}
