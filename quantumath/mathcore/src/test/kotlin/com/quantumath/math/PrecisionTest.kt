package com.quantumath.math

import com.quantumath.math.core.DivisionByZero
import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.AngleMode
import com.quantumath.math.eval.BigEvaluator
import com.quantumath.math.eval.BigMath
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Parser
import com.quantumath.math.format.NumberFormatter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.math.MathContext

class PrecisionTest {
    private fun big(s: String, digits: Int = 40, angle: AngleMode = AngleMode.RADIANS) = BigEvaluator(digits, angle).eval(Parser.parse(s))
    private fun str(s: String, digits: Int = 40, angle: AngleMode = AngleMode.RADIANS) = big(s, digits, angle).stripTrailingZeros().toPlainString()

    // Reference digits from published constants (OEIS A000796, A001113, A002193, A002162).
    private val PI_50 = "3.1415926535897932384626433832795028841971693993751"
    private val E_50 = "2.7182818284590452353602874713526624977572470936999"
    private val SQRT2_50 = "1.4142135623730950488016887242096980785696718753769"
    private val LN2_50 = "0.69314718055994530941723212145817656807550013436025"

    private fun prefixMatches(expected: String, actual: BigDecimal, digits: Int) {
        val e = BigDecimal(expected).round(MathContext(digits))
        assertEquals(e, actual.round(MathContext(digits)))
    }

    @Test fun constantsToFortyDigits() {
        prefixMatches(PI_50, big("pi", 45), 40)
        prefixMatches(E_50, big("e", 45), 40)
        prefixMatches(SQRT2_50, big("sqrt(2)", 45), 40)
        prefixMatches(LN2_50, big("ln(2)", 45), 40)
    }

    @Test fun exactArithmetic() {
        assertEquals("0.3", str("0.1+0.2"))           // no binary floating point error
        assertEquals("1", str("(1/3)*3"))
        assertEquals("3628800", str("10!"))
        assertEquals("1267650600228229401496703205376", str("2^100"))
        assertEquals("0.5", str("sin(30)", angle = AngleMode.DEGREES))
        assertEquals("0", str("sin(pi)"))
        assertEquals("0", str("cos(90)", angle = AngleMode.DEGREES))
        assertEquals("-1", str("cos(pi)"))
        assertEquals("1", str("tan(45)", angle = AngleMode.DEGREES))
        assertEquals("4", str("(-8)^(2/3)"))
        assertEquals("-2", str("(-8)^(1/3)"))
        assertEquals("3", str("log(1000)"))
        assertEquals("10", str("log(1024, 2)"))
        assertEquals("12", str("sqrt(144)"))
        assertEquals("30", str("asin(0.5)", angle = AngleMode.DEGREES))
        assertEquals("0.25", str("25%"))
    }

    @Test fun identitiesHoldToHighPrecision() {
        // sin² + cos² = 1, e^(ln x) = x, ln(e^x) = x, atan(1)·4 = π
        val one = big("sin(0.7)^2 + cos(0.7)^2", 40)
        assertTrue((one - BigDecimal.ONE).abs() < BigDecimal("1e-38"))
        assertTrue((big("exp(ln(7.25))", 40) - BigDecimal("7.25")).abs() < BigDecimal("1e-37"))
        prefixMatches(PI_50, big("4*atan(1)", 45), 40)
        prefixMatches(PI_50, big("2*asin(1)", 45), 40)
        prefixMatches(PI_50, big("acos(-1)", 45), 40)
        assertTrue((big("sinh(1.3)^2 - cosh(1.3)^2 + 1", 40)).abs() < BigDecimal("1e-37"))
    }

    @Test fun errorsAreReported() {
        assertThrows(DivisionByZero::class.java) { big("1/0") }
        assertThrows(DomainError::class.java) { big("sqrt(-1)") }
        assertThrows(DomainError::class.java) { big("ln(0)") }
        assertThrows(DomainError::class.java) { big("asin(2)") }
        assertThrows(DomainError::class.java) { big("tan(90)", angle = AngleMode.DEGREES) }
        assertThrows(DomainError::class.java) { big("(-2)^0.5") }
        assertThrows(DomainError::class.java) { big("(-3)!") }
        assertThrows(MathError::class.java) { big("x+1") }
        assertThrows(MathError::class.java) { big("exp(10000000)") }
    }

    @Test fun rationalEvaluation() {
        assertEquals(Rational.of(1, 2), RationalEval.tryEval(Parser.parse("1/3 + 1/6")))
        assertEquals(Rational.of(7, 12), RationalEval.tryEval(Parser.parse("(1/2)^2 + 1/3")))
        assertEquals(null, RationalEval.tryEval(Parser.parse("sqrt(2)")))
        assertEquals(Rational.of(1, 8), Rational.fromDouble(0.125))
        assertEquals(Rational.of(1, 3), Rational.fromDouble(1.0 / 3))
    }

    @Test fun bigMathAgreesWithDouble() {
        val mc = MathContext(30)
        for (x in listOf(0.1, 0.5, 1.0, 2.5, 10.0, -3.3)) {
            assertEquals(Math.sin(x), BigMath.sin(BigDecimal(x), mc).toDouble(), 1e-15)
            assertEquals(Math.cos(x), BigMath.cos(BigDecimal(x), mc).toDouble(), 1e-15)
            assertEquals(Math.atan(x), BigMath.atan(BigDecimal(x), mc).toDouble(), 1e-15)
            assertEquals(Math.exp(x), BigMath.exp(BigDecimal(x), mc).toDouble(), 1e-15 * Math.exp(x))
            if (x > 0) assertEquals(Math.log(x), BigMath.ln(BigDecimal(x), mc).toDouble(), 1e-15)
        }
        assertEquals(Math.log(1e300), BigMath.ln(BigDecimal("1e300"), mc).toDouble(), 1e-12)
    }

    @Test fun formatting() {
        val f = NumberFormatter(significant = 10)
        assertEquals("3.141592654", f.format(big("pi")))
        assertEquals("1.267650600 × 10³⁰".replace("1.267650600", "1.2676506"), f.format(big("2^100")))
        assertEquals("0.001", f.format(BigDecimal("0.001")))
        assertEquals("1 × 10⁻⁷", f.format(BigDecimal("1e-7")))
        assertEquals("1,234,567", NumberFormatter(grouping = true).format(BigDecimal(1234567)))
    }
}
