package com.quantumath.math.complex

import com.quantumath.math.core.DivisionByZero
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Unsupported
import com.quantumath.math.eval.AngleMode
import com.quantumath.math.expr.Expr
import kotlin.math.*

data class Complex(val re: Double, val im: Double = 0.0) {
    companion object {
        val ZERO = Complex(0.0); val ONE = Complex(1.0); val I = Complex(0.0, 1.0)
        fun polar(r: Double, theta: Double) = Complex(r * cos(theta), r * sin(theta))
    }

    operator fun plus(o: Complex) = Complex(re + o.re, im + o.im)
    operator fun minus(o: Complex) = Complex(re - o.re, im - o.im)
    operator fun times(o: Complex) = Complex(re * o.re - im * o.im, re * o.im + im * o.re)
    operator fun div(o: Complex): Complex {
        // Smith's algorithm (avoids overflow)
        if (o.re == 0.0 && o.im == 0.0) throw DivisionByZero()
        return if (abs(o.re) >= abs(o.im)) {
            val r = o.im / o.re; val d = o.re + o.im * r
            Complex((re + im * r) / d, (im - re * r) / d)
        } else {
            val r = o.re / o.im; val d = o.re * r + o.im
            Complex((re * r + im) / d, (im * r - re) / d)
        }
    }
    operator fun unaryMinus() = Complex(-re, -im)

    val modulus get() = hypot(re, im)
    /** Principal argument in (−π, π]. */
    val argument get() = atan2(im, re)
    fun conj() = Complex(re, -im)
    val isReal get() = im == 0.0

    fun exp(): Complex = polar(kotlin.math.exp(re), im)
    fun ln(): Complex { if (re == 0.0 && im == 0.0) throw MathError("ln(0) is undefined"); return Complex(kotlin.math.ln(modulus), argument) }
    fun pow(o: Complex): Complex {
        if (re == 0.0 && im == 0.0) return if (o.re > 0) ZERO else throw DivisionByZero()
        if (o.im == 0.0 && o.re == Math.rint(o.re) && abs(o.re) <= 64) {
            var r = ONE; var b = this; var n = abs(o.re.toInt())
            while (n > 0) { if (n and 1 == 1) r *= b; b *= b; n = n shr 1 }
            return if (o.re < 0) ONE / r else r
        }
        return (ln() * o).exp()
    }
    fun sqrt(): Complex { val r = modulus; return Complex(kotlin.math.sqrt((r + re) / 2), sign(if (im == 0.0) 1.0 else im) * kotlin.math.sqrt(max(0.0, (r - re) / 2))) }
    fun sin() = Complex(kotlin.math.sin(re) * cosh(im), kotlin.math.cos(re) * sinh(im))
    fun cos() = Complex(kotlin.math.cos(re) * cosh(im), -kotlin.math.sin(re) * sinh(im))
    fun tan() = sin() / cos()

    /** All n distinct n-th roots (de Moivre). */
    fun roots(n: Int): List<Complex> {
        if (n < 1) throw MathError("n must be ≥ 1")
        val r = modulus.pow(1.0 / n); val t = argument
        return (0 until n).map { k -> polar(r, (t + 2 * PI * k) / n).clean() }
    }

    fun clean(eps: Double = 1e-12): Complex {
        val s = max(1.0, modulus)
        return Complex(if (abs(re) < eps * s) 0.0 else re, if (abs(im) < eps * s) 0.0 else im)
    }

    fun format(digits: Int = 10): String {
        val c = clean()
        fun f(v: Double): String {
            val bd = java.math.BigDecimal(v).round(java.math.MathContext(digits)).stripTrailingZeros()
            return if (bd.scale() < 0) bd.setScale(0).toPlainString() else bd.toPlainString()
        }
        return when {
            c.im == 0.0 -> f(c.re)
            c.re == 0.0 -> if (c.im == 1.0) "i" else if (c.im == -1.0) "-i" else "${f(c.im)}i"
            else -> "${f(c.re)} ${if (c.im < 0) "-" else "+"} ${if (abs(c.im) == 1.0) "" else f(abs(c.im))}i"
        }
    }

    fun formatPolar(digits: Int = 8, angle: AngleMode = AngleMode.RADIANS): String {
        val a = if (angle == AngleMode.DEGREES) Math.toDegrees(argument) else argument
        val unit = if (angle == AngleMode.DEGREES) "°" else ""
        return "${Complex(modulus).format(digits)} ∠ ${Complex(a).format(digits)}$unit"
    }
}

/** Evaluates expressions over ℂ (the constant `i` is the imaginary unit). Principal branches throughout. */
object ComplexEvaluator {
    fun eval(e: Expr, angle: AngleMode = AngleMode.RADIANS): Complex = when (e) {
        is Expr.Num -> Complex(e.value.toDouble())
        is Expr.Frac -> Complex(e.value.toDouble())
        is Expr.Const -> when (e.name) {
            "i" -> Complex.I; "pi" -> Complex(PI); "e" -> Complex(E); "tau" -> Complex(2 * PI); "phi" -> Complex((1 + kotlin.math.sqrt(5.0)) / 2)
            else -> throw Unsupported(e.name)
        }
        is Expr.Var -> throw MathError("Unknown variable '${e.name}'")
        is Expr.Neg -> -eval(e.arg, angle)
        is Expr.Add -> eval(e.left, angle) + eval(e.right, angle)
        is Expr.Sub -> eval(e.left, angle) - eval(e.right, angle)
        is Expr.Mul -> eval(e.left, angle) * eval(e.right, angle)
        is Expr.Div -> eval(e.left, angle) / eval(e.right, angle)
        is Expr.Pow -> eval(e.base, angle).pow(eval(e.exp, angle))
        is Expr.Percent -> eval(e.arg, angle) / Complex(100.0)
        is Expr.Fact -> { val v = eval(e.arg, angle); if (!v.isReal) throw Unsupported("Factorial of a non-real number"); Complex(com.quantumath.math.eval.Evaluator().factorial(v.re)) }
        is Expr.Call -> {
            val a = e.args.map { eval(it, angle) }
            val x = a[0]
            fun rad(z: Complex) = if (angle == AngleMode.DEGREES) z * Complex(PI / 180) else z
            when (e.fn) {
                "re" -> Complex(x.re); "im" -> Complex(x.im); "abs" -> Complex(x.modulus)
                "arg" -> Complex(if (angle == AngleMode.DEGREES) Math.toDegrees(x.argument) else x.argument)
                "conj" -> x.conj()
                "sqrt" -> x.sqrt(); "exp" -> x.exp(); "ln" -> x.ln()
                "log10" -> x.ln() / Complex(ln(10.0)); "log2" -> x.ln() / Complex(ln(2.0))
                "log" -> x.ln() / a[1].ln()
                "sin" -> rad(x).sin(); "cos" -> rad(x).cos(); "tan" -> rad(x).tan()
                "cbrt" -> x.pow(Complex(1.0 / 3))
                "root" -> x.pow(Complex(1.0) / a[1])
                else -> throw Unsupported("${e.fn} is not supported for complex numbers")
            }
        }
    }
}
