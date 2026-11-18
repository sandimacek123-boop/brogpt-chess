package com.quantumath.math

import com.quantumath.math.core.ParseError
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.E

class ParserTest {
    private fun ev(s: String, x: Double? = null): Double = Evaluator().eval(Parser.parse(s), if (x != null) mapOf("x" to x) else emptyMap())
    private fun eq(expected: Double, s: String, x: Double? = null) = assertEquals(s, expected, ev(s, x), 1e-12 * maxOf(1.0, Math.abs(expected)))

    @Test fun precedence() {
        eq(14.0, "2+3*4")
        eq(20.0, "(2+3)*4")
        eq(-4.0, "-2^2")            // unary minus binds looser than ^
        eq(4.0, "(-2)^2")
        eq(512.0, "2^3^2")          // right-associative power
        eq(0.5, "2^-1")
        eq(2.0, "8/2/2")            // left-associative division
        eq(1.0, "5-3-1")            // left-associative subtraction
        eq(3.0, "1/2*6")            // same precedence, left to right
        eq(-8.0, "-2^3")
        eq(0.125, "2^-3")
        eq(5.0, "--5")
    }

    @Test fun implicitMultiplication() {
        eq(6.0, "2x", 3.0)
        eq(8.0, "2(x+1)", 3.0)
        eq(2 * PI, "2pi")
        eq(2 * PI, "2π")
        eq(12.0, "(2)(6)")
        eq(3.0 * Math.sin(3.0), "x sin(x)", 3.0)
        eq(18.0, "2x^2", 3.0)       // 2·(x²), not (2x)²
    }

    @Test fun functionsAndPostfix() {
        eq(120.0, "5!")
        eq(0.25, "25%")
        eq(3.0, "|-3|")
        eq(5.0, "|3-8|")
        eq(9.0, "3²")
        eq(4.0, "√16")
        eq(2.0, "log(100)")
        eq(3.0, "log(8, 2)")
        eq(1.0, "ln(e)")
        eq(Math.sin(2.0), "sin 2")
        eq(Math.sin(4.0), "sin x^2", 2.0)
        eq(10.0, "nCr(5,2)")
        eq(60.0, "nPr(5,3)")
        eq(-2.0, "cbrt(-8)")
        eq(E * E, "e^2")
        eq(2.0, "max(1, 2, -3)")
    }

    @Test fun scientificNotationVersusE() {
        eq(2000.0, "2e3")
        eq(0.002, "2e-3")
        eq(2 * E, "2e")              // 'e' followed by no digit is Euler's number
        eq(1.5e10, "1.5E10")
    }

    @Test fun unicodeOperators() {
        eq(6.0, "2×3")
        eq(2.0, "6÷3")
        eq(-1.0, "2−3")
    }

    @Test fun errors() {
        assertThrows(ParseError::class.java) { Parser.parse("2+") }
        assertThrows(ParseError::class.java) { Parser.parse("(2+3") }
        assertThrows(ParseError::class.java) { Parser.parse("2+3)") }
        assertThrows(ParseError::class.java) { Parser.parse("*3") }
        assertThrows(ParseError::class.java) { Parser.parse("") }
        assertThrows(ParseError::class.java) { Parser.parse("2 3") }
        assertThrows(ParseError::class.java) { Parser.parse("sin()") }
        assertThrows(ParseError::class.java) { Parser.parse("2 $ 3") }
    }

    @Test fun relationsParse() {
        val r = Parser.parseRelation("x^2 - 1 = 0")
        assertEquals("=", r.op)
        assertEquals("<=", Parser.parseRelation("x ≤ 3").op)
    }

    @Test fun printerRoundTrip() {
        for (s in listOf("2 + 3*4", "(2 + 3)*4", "-2^2", "(-2)^2", "2^3^2", "(2^3)^2", "x/(y*z)", "x - (y - z)", "sin(x)^2", "2x + 1")) {
            val e = Parser.parse(s)
            val printed = Printer.print(e)
            val vars = mapOf("x" to 1.3, "y" to 0.7, "z" to 2.1)
            assertEquals("$s → $printed", Evaluator().eval(e, vars), Evaluator().eval(Parser.parse(printed), vars), 1e-12)
        }
        assertTrue(Parser.parse("x") is Expr.Var)
    }
}
