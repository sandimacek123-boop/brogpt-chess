package com.quantumath.math

import com.quantumath.math.expr.Parser
import com.quantumath.math.symbolic.*
import org.junit.Assert.assertFalse
import org.junit.Test

/** User-facing step text must never contain raw AST dumps such as "Add(left=Var(name=x)…". */
class ExplanationTextTest {
    private val leak = Regex("""(left=|right=|name=|value=|Var\(|Frac\(|Num\(|Call\(|Pow\(base)""")
    private fun check(where: String, text: String) = assertFalse("$where leaked AST text: $text", leak.containsMatchIn(text))

    @Test fun noRawExpressionsInSteps() {
        val exprs = listOf("x^4 - 16", "2x^2 + 7x + 3", "x^3 - 8", "(x^2-1)/(x-1)", "6x^3 + 3x", "x^2 y + x y^2", "sin(x)^2 + cos(x)^2", "sqrt(72)", "(x+2)^3", "x^4 + 4", "1/x + 1/(x+1)")
        for (s in exprs) {
            val e = Parser.parse(s)
            Algebra.simplify(e).forEach { check("simplify $s", it.justification + it.title) }
            Algebra.factor(e).forEach { check("factor $s", it.justification + it.title) }
        }
        for (s in listOf("x^2 sin(x)", "e^(2x) cos(x)", "ln(x^2+1)", "x^x", "tan(x)/x")) Derivative.differentiate(Parser.parse(s), "x").steps.forEach { check("d/dx $s", it.rule + it.detail) }
        for (s in listOf("x e^x", "1/(x^2 - 1)", "x/(x^2+1)", "sin(x)^2", "ln(x)", "2x cos(x^2)")) Integrator.integrate(Parser.parse(s), "x").steps.forEach { check("∫ $s", it.rule + it.detail) }
        for (s in listOf("sin(x)/x", "(x^2-4)/(x-2)", "(e^x - 1)/x")) LimitSolver.limit(Parser.parse(s), "x", 0.0).steps.forEach { check("lim $s", it.rule + it.detail) }
        for (s in listOf("x^2 - 5x + 6 = 0", "sqrt(x+7) = x - 5", "(x+1)/(x-2) = 3", "2sin(x) = 1", "x^4 - 5x^2 + 4 = 0", "2^x = 32", "x^2 - 4 > 0", "e^x = 3x", "x^3 - 6x^2 + 11x - 6 = 0")) {
            val r = Solver.solve(Parser.parseRelation(s))
            (r.steps.map { it.rule + it.detail } + r.domain + r.rejected + r.generalSolution + listOf(r.method)).forEach { check("solve $s", it) }
        }
    }
}
