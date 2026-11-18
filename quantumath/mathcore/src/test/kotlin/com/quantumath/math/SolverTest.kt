package com.quantumath.math

import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import com.quantumath.math.symbolic.Solver
import com.quantumath.math.symbolic.SystemSolver
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.core.Rational
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sqrt

class SolverTest {
    private fun roots(eq: String) = Solver.solve(Parser.parseRelation(eq))
    private fun values(eq: String) = roots(eq).solutions.map { it.value }

    private fun assertRoots(eq: String, vararg expected: Double) {
        val got = values(eq)
        assertEquals("$eq → $got", expected.size, got.size)
        expected.sorted().zip(got.sorted()).forEach { (e, g) -> assertEquals(eq, e, g, 1e-9 * maxOf(1.0, abs(e))) }
    }

    @Test fun linear() {
        assertRoots("2x + 3 = 11", 4.0)
        assertRoots("3(x - 1) = 2x + 5", 8.0)
        assertEquals("4", roots("2x + 3 = 11").solutions[0].display)
    }

    @Test fun quadraticExact() {
        val r = roots("x^2 - 5x + 6 = 0")
        assertEquals(listOf("2", "3"), r.solutions.map { it.display })
        val s = roots("x^2 - 2 = 0")
        assertEquals(listOf("-√2", "√2"), s.solutions.map { it.display })
        val t = roots("x^2 + 2x - 1 = 0") // -1 ± √2
        assertEquals(2, t.solutions.size)
        assertEquals(-1 - sqrt(2.0), t.solutions[0].value, 1e-12)
        assertTrue(t.exact)
        val c = roots("x^2 + 1 = 0")
        assertEquals(0, c.solutions.size)
        assertEquals(2, c.complexSolutions.size)
        assertRoots("x^2 - 6x + 9 = 0", 3.0)
    }

    @Test fun higherDegree() {
        assertRoots("x^3 - 6x^2 + 11x - 6 = 0", 1.0, 2.0, 3.0)
        assertRoots("x^4 - 5x^2 + 4 = 0", -2.0, -1.0, 1.0, 2.0)
        // x^3 - 2 = 0: one real root 2^(1/3), two complex
        val r = roots("x^3 - 2 = 0")
        assertEquals(1, r.solutions.size)
        assertEquals(Math.cbrt(2.0), r.solutions[0].value, 1e-10)
        assertEquals(2, r.complexSolutions.size)
        assertRoots("x^5 - x = 0", -1.0, 0.0, 1.0)
    }

    @Test fun rationalWithExtraneous() {
        // (x^2 - 1)/(x - 1) = 0 → x = -1 only; x = 1 excluded
        val r = roots("(x^2 - 1)/(x - 1) = 0")
        assertEquals(listOf(-1.0), r.solutions.map { it.value })
        assertRoots("1/x + 1/(x+1) = 0", -0.5)
        assertRoots("x/(x-2) = 3", 3.0)
    }

    @Test fun radicalWithExtraneousRoot() {
        // √(x+2) = x has candidate roots 2 and -1; -1 is extraneous
        val r = roots("sqrt(x+2) = x")
        assertEquals(listOf(2.0), r.solutions.map { it.value })
        assertTrue(r.rejected.isNotEmpty())
    }

    @Test fun exponentialAndLog() {
        assertRoots("2^x = 8", 3.0)
        assertRoots("3*2^(x+1) - 5 = 7", 1.0)
        assertRoots("e^x = 5", Math.log(5.0))
        assertRoots("ln(x) = 2", Math.exp(2.0))
        assertRoots("log(x) = 3", 1000.0)
        assertRoots("e^(2x) - 3e^x + 2 = 0".replace("e^(2x)", "(e^x)^2"), 0.0, Math.log(2.0))
        // log domain: ln(x) + ln(x - 3) = ln(4) → x = 4 (x = -1 rejected)
        val r = roots("ln(x) + ln(x - 3) = ln(4)")
        assertEquals(listOf(4.0), r.solutions.map { Math.round(it.value * 1e9) / 1e9 })
    }

    @Test fun trigonometric() {
        val r = roots("sin(x) = 1/2")
        assertEquals(PI / 6, r.solutions[0].value, 1e-12)
        assertEquals(5 * PI / 6, r.solutions[1].value, 1e-12)
        assertEquals(listOf("π/6", "5π/6"), r.solutions.map { it.display })
        assertTrue(r.generalSolution.isNotEmpty())
        val c = roots("2cos(x) - 1 = 0")
        assertEquals(2, c.solutions.size)
        assertEquals(PI / 3, c.solutions[0].value, 1e-12)
        assertEquals(5 * PI / 3, c.solutions[1].value, 1e-12)
        assertRoots("tan(x) = 1", PI / 4, 5 * PI / 4)
        assertEquals(0, roots("sin(x) = 2").solutions.size)
        // quadratic in sin: 2sin²x − sin x − 1 = 0 → sin x = 1 or −1/2
        assertRoots("2sin(x)^2 - sin(x) - 1 = 0", PI / 2, 7 * PI / 6, 11 * PI / 6)
    }

    @Test fun numericFallback() {
        // cos(x) = x has the single root 0.7390851332151607 (Dottie number)
        val r = roots("cos(x) = x")
        assertEquals(1, r.solutions.size)
        assertEquals(0.7390851332151607, r.solutions[0].value, 1e-12)
        assertTrue(!r.exact)
    }

    @Test fun noSolutionAndIdentity() {
        assertEquals(0, roots("x + 1 = x + 2").solutions.size)
        assertTrue(roots("2(x + 1) = 2x + 2").identity)
    }

    @Test fun parametric() {
        val r = Solver.solve(Parser.parseRelation("a*x + b = c"), "x")
        val sol = r.solutions.single().exact!!
        val env = mapOf("a" to 2.0, "b" to 3.0, "c" to 11.0)
        assertEquals(4.0, Evaluator().eval(sol, env), 1e-12)
    }

    @Test fun inequalities() {
        assertEquals(listOf("x ∈ (-∞, -2) ∪ (2, ∞)"), roots("x^2 > 4").generalSolution)
        assertEquals(listOf("x ∈ [-2, 2]"), roots("x^2 <= 4").generalSolution)
        assertEquals(listOf("x ∈ (1, 3)"), roots("(x-1)(x-3) < 0").generalSolution)
        assertEquals(listOf("x ∈ (-∞, 1) ∪ [2, ∞)"), roots("(x-2)/(x-1) >= 0").generalSolution)
        assertEquals(listOf("x ∈ (0, ∞)"), roots("ln(x) > -1000").generalSolution)
    }

    @Test fun linearSystems() {
        val r = SystemSolver.solve(listOf(Parser.parseRelation("x + y = 3"), Parser.parseRelation("x - y = 1")))
        val u = r.solution as Matrix.SystemSolution.Unique
        assertEquals(listOf(Rational.of(2), Rational.ONE), u.x)
        val three = SystemSolver.solve(listOf("2x + y - z = 8", "-3x - y + 2z = -11", "-2x + y + 2z = -3").map { Parser.parseRelation(it) })
        assertEquals(listOf(Rational.of(2), Rational.of(3), Rational.of(-1)), (three.solution as Matrix.SystemSolution.Unique).x)
        val none = SystemSolver.solve(listOf(Parser.parseRelation("x + y = 1"), Parser.parseRelation("x + y = 2")))
        assertTrue(none.solution === Matrix.SystemSolution.None)
        val inf = SystemSolver.solve(listOf(Parser.parseRelation("x + y = 1"), Parser.parseRelation("2x + 2y = 2")))
        assertTrue(inf.solution is Matrix.SystemSolution.Infinite)
        // nonlinear: circle x²+y²=25 and line y = x+1 → (3,4) and (−4,−3)
        val nl = SystemSolver.solve(listOf(Parser.parseRelation("x^2 + y^2 = 25"), Parser.parseRelation("y = x + 1")))
        val pts = nl.numeric!!.chunked(2).map { (a, b) -> Math.round(a) to Math.round(b) }.toSet()
        assertEquals(setOf(3L to 4L, -4L to -3L), pts)
    }

    @Test fun everyReportedSolutionSatisfiesItsEquation() {
        val eqs = listOf("x^3 - 7x + 6 = 0", "2^(x-1) = 16", "sqrt(2x + 3) = x", "x/(x+1) = 2", "e^x + e^(-x) = 4", "x^4 = 16", "|x - 2| = 5", "ln(x^2) = 2")
        for (eq in eqs) {
            val rel = Parser.parseRelation(eq)
            val res = Solver.solve(rel)
            assertNotNull(res)
            for (s in res.solutions) {
                val l = Evaluator().eval(rel.left, mapOf("x" to s.value)); val r = Evaluator().eval(rel.right, mapOf("x" to s.value))
                assertEquals("$eq at ${s.display}", l, r, 1e-8 * maxOf(1.0, abs(l)))
            }
            assertTrue("$eq printed", res.solutions.all { Printer.print(Parser.parse("1")) == "1" })
        }
    }
}
