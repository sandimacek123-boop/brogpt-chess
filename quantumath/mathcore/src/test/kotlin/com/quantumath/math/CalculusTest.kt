package com.quantumath.math

import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import com.quantumath.math.numeric.Differentiate
import com.quantumath.math.numeric.Integrate
import com.quantumath.math.numeric.Roots
import com.quantumath.math.symbolic.Algebra
import com.quantumath.math.symbolic.Analysis
import com.quantumath.math.symbolic.Derivative
import com.quantumath.math.symbolic.Integrator
import com.quantumath.math.symbolic.LimitSolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.E
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sqrt

class CalculusTest {
    private fun d(s: String) = Derivative.differentiate(Parser.parse(s)).derivative
    private fun at(e: com.quantumath.math.expr.Expr, x: Double) = Evaluator().eval(e, mapOf("x" to x))

    /** Symbolic derivative must agree with an independent numerical derivative. */
    private fun checkDerivative(s: String, xs: List<Double> = listOf(0.3, 0.9, 1.7, 2.4)) {
        val f = Evaluator(strict = false).function(Parser.parse(s))
        val df = d(s)
        for (x in xs) {
            val num = Differentiate.ridders(f, x).value
            assertEquals("d/dx $s at $x (got ${Printer.print(df)})", num, at(df, x), 1e-6 * maxOf(1.0, abs(num)))
        }
    }

    @Test fun derivativeRules() {
        assertEquals("6x", Printer.print(d("3x^2")))
        assertEquals("cos(x)", Printer.print(d("sin(x)")))
        assertEquals("0", Printer.print(d("pi^2")))
        for (s in listOf("x^5 - 3x^2 + 7", "sin(x)*cos(x)", "x^2*e^x", "ln(x^2 + 1)", "sqrt(x)", "tan(3x)", "1/(1 + x^2)", "atan(x)", "asin(x/3)", "x^x", "e^(sin(x))", "cosh(x)^2", "log(x)", "2^x", "sec(x)", "abs(x - 0.5)", "(x^2 + 1)/(x - 4)", "cbrt(x)")) checkDerivative(s)
    }

    @Test fun derivativeHasSteps() {
        val r = Derivative.differentiate(Parser.parse("sin(x^2)"))
        assertTrue(r.steps.any { it.rule.contains("chain") })
        assertEquals("2x·cos(x²)".replace("·", "*").let { Printer.print(r.derivative) }, Printer.print(r.derivative))
    }

    /** Antiderivatives are verified: F' must equal f. */
    private fun checkIntegral(s: String) {
        val r = Integrator.integrate(Parser.parse(s))
        assertNotNull("∫ $s: ${r.message}", r.antiderivative)
        assertTrue(r.verified)
        assertTrue(Integrator.verify(r.antiderivative!!, Parser.parse(s), "x"))
    }

    @Test fun antiderivatives() {
        for (s in listOf("x^3", "3x^2 + 2x + 1", "1/x", "e^x", "e^(2x+1)", "sin(x)", "cos(3x)", "1/(1+x^2)", "x*e^x", "x*sin(x)", "x^2*cos(x)", "ln(x)", "x*ln(x)", "2x*cos(x^2)", "1/(x^2 - 1)", "(x^2 + 1)/x", "1/(2x + 3)", "sqrt(x)", "2^x", "tan(x)", "x/(x^2 + 1)", "1/sqrt(1 - x^2)", "1/(x^2 + 4)", "1/(x*(x+1)^2)")) checkIntegral(s)
    }

    @Test fun unsupportedIntegralIsHonest() {
        val r = Integrator.integrate(Parser.parse("e^(x^2)"))
        assertNull(r.antiderivative)
        assertTrue(r.message.isNotEmpty())
    }

    @Test fun definiteIntegrals() {
        assertEquals(1.0 / 3, Integrator.definite(Parser.parse("x^2"), "x", 0.0, 1.0).value, 1e-12)
        assertEquals(2.0, Integrator.definite(Parser.parse("sin(x)"), "x", 0.0, PI).value, 1e-12)
        assertEquals(sqrt(PI), Integrate.adaptive({ Math.exp(-it * it) }, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY).value, 1e-9)
        assertEquals(PI / 2, Integrator.definite(Parser.parse("1/(1+x^2)"), "x", 0.0, Double.POSITIVE_INFINITY).value, 1e-8)
        // 1/sqrt(x) on [0,1] has an integrable endpoint singularity: exactly 2
        assertEquals(2.0, Integrate.adaptive({ 1 / sqrt(it) }, 0.0, 1.0, 1e-10, 5000).value, 1e-6)
        // ∫ 1/x over [−1, 1] does not converge — must not report a confident answer
        val bad = Integrator.definite(Parser.parse("1/x^2"), "x", -1.0, 1.0)
        assertTrue(!bad.converged || bad.value > 1e6)
    }

    @Test fun limits() {
        assertEquals(1.0, LimitSolver.limit(Parser.parse("sin(x)/x"), "x", 0.0).value!!, 1e-9)
        assertEquals(4.0, LimitSolver.limit(Parser.parse("(x^2 - 4)/(x - 2)"), "x", 2.0).value!!, 1e-9)
        assertEquals(0.5, LimitSolver.limit(Parser.parse("(1 - cos(x))/x^2"), "x", 0.0).value!!, 1e-6)
        assertEquals(E, LimitSolver.limit(Parser.parse("(1 + 1/x)^x"), "x", Double.POSITIVE_INFINITY).value!!, 1e-6)
        assertEquals(5.0, LimitSolver.limit(Parser.parse("x^2 + 1"), "x", 2.0).value!!, 1e-12)
        assertNull(LimitSolver.limit(Parser.parse("abs(x)/x"), "x", 0.0).value) // one-sided limits differ
    }

    @Test fun criticalPointsAndTangents() {
        val cps = Analysis.criticalPoints(Parser.parse("x^3 - 3x"), "x", -5.0, 5.0)
        assertEquals(2, cps.size)
        assertEquals(-1.0, cps[0].x, 1e-9); assertEquals("local maximum", cps[0].kind)
        assertEquals(1.0, cps[1].x, 1e-9); assertEquals("local minimum", cps[1].kind)
        val t = Analysis.tangent(Parser.parse("x^2"), "x", 3.0)
        assertEquals(6.0, t.slope, 1e-12); assertEquals(-9.0, t.intercept, 1e-12)
    }

    @Test fun rootsSkipPoles() {
        // tan has sign changes at its poles; only true zeros (multiples of π) may be reported
        val r = Roots.findAll({ Math.tan(it) }, -4.0, 4.0, 4000)
        assertEquals(listOf(-PI, 0.0, PI).size, r.size)
        r.forEach { assertTrue(abs(Math.tan(it)) < 1e-9) }
    }

    @Test fun algebra() {
        fun s(x: String) = Printer.print(Algebra.simplify(Parser.parse(x)).last().result)
        assertEquals("5x", s("2x + 3x"))
        assertEquals("x + 1", s("(x^2 - 1)/(x - 1)"))
        assertEquals("1", s("sin(x)^2 + cos(x)^2"))
        assertEquals("5sin(x)", s("2sin(x) + 3sin(x)"))
        assertEquals("x^2 + 2xy + y^2", Printer.print(Algebra.expand(Parser.parse("(x + y)^2"))))
        assertEquals("x^3 - 6x^2 + 11x - 6", Printer.print(Algebra.expand(Parser.parse("(x-1)(x-2)(x-3)"))))
        fun f(x: String) = Printer.print(Algebra.factor(Parser.parse(x)).last().result)
        assertEquals("(x - 2)(x - 3)", f("x^2 - 5x + 6"))
        assertEquals("2(x + 1)(x - 1)", f("2x^2 - 2"))
        assertEquals("(x - 1)^2", f("x^2 - 2x + 1"))
        assertEquals("(x - y)(x + y)", f("x^2 - y^2"))
        assertEquals("(x^2 - 2x + 2)(x^2 + 2x + 2)", f("x^4 + 4"))  // Sophie Germain identity
        assertEquals("(x + 3)(2x - 1)", f("2x^2 + 5x - 3"))
        // exact special values
        assertEquals("1/2", Printer.print(Algebra.normalForm(Parser.parse("sin(pi/6)"))))
        assertEquals("2sqrt(2)", Printer.print(Algebra.normalForm(Parser.parse("sqrt(8)"))))
        assertEquals("pi/4", Printer.print(Algebra.normalForm(Parser.parse("atan(1)"))))
    }
}
