package com.quantumath.math

import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.fractal.Fractal
import com.quantumath.math.fractal.FractalView
import com.quantumath.math.learning.*
import com.quantumath.math.plot.GraphAnalysis
import com.quantumath.math.plot.Plotter
import com.quantumath.math.plot.Viewport
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.tan

class PlotFractalLearningTest {
    private val vp = Viewport(-5.0, 5.0, -5.0, 5.0)
    private fun f(s: String) = Evaluator(strict = false).function(Parser.parse(s))

    @Test fun reciprocalIsSplitAtPole() {
        val lines = Plotter.function(f("1/x"), vp, 800)
        assertTrue(lines.size >= 2)
        // no segment crosses x = 0
        for (l in lines) assertTrue(l.xs.all { it < 0 } || l.xs.all { it > 0 } )
    }

    @Test fun tangentHasNoConnectingVerticals() {
        val lines = Plotter.function({ tan(it) }, vp, 800)
        assertTrue("expected ≥4 branches, got ${lines.size}", lines.size >= 4)
        for (l in lines) for (i in 1 until l.size) {
            // within a branch tan is increasing
            assertTrue(l.ys[i] >= l.ys[i - 1] - 1e-9)
        }
    }

    @Test fun sqrtStartsAtDomainBoundary() {
        val lines = Plotter.function(f("sqrt(x)"), vp, 800)
        assertEquals(1, lines.size)
        assertTrue(lines[0].xs.first() < 0.05)
    }

    @Test fun analysisFindsFeatures() {
        val g = f("x^2 - 4")
        val roots = GraphAnalysis.roots(g, vp).map { it.x }.sorted()
        assertEquals(2, roots.size); assertEquals(-2.0, roots[0], 1e-7); assertEquals(2.0, roots[1], 1e-7)
        val ext = GraphAnalysis.extrema(f("x^3 - 3x"), vp)
        assertEquals(2, ext.size)
        assertTrue(ext.any { it.label == "max" && abs(it.x + 1) < 1e-4 })
        assertTrue(ext.any { it.label == "min" && abs(it.x - 1) < 1e-4 })
        val inter = GraphAnalysis.intersections(f("x"), f("x^2"), vp).map { it.x }.sorted()
        assertEquals(listOf(0.0, 1.0).size, inter.size); assertEquals(1.0, inter[1], 1e-7)
        val va = GraphAnalysis.verticalAsymptotes(f("1/(x-1)"), vp)
        assertEquals(1, va.size); assertEquals(1.0, va[0], 1e-6)
        assertTrue(GraphAnalysis.verticalAsymptotes(f("(x^2-1)/(x-1)"), vp).isEmpty())
        val ha = GraphAnalysis.horizontalAsymptotes(f("(2x+1)/(x-3)"))
        assertTrue(ha.any { abs(it - 2) < 1e-4 })
    }

    @Test fun polarCircle() {
        val p = Plotter.polar({ 2.0 }, 0.0, 2 * Math.PI, 400)
        assertEquals(1, p.size)
        for (i in 0 until p[0].size) assertEquals(2.0, Math.hypot(p[0].xs[i], p[0].ys[i]), 1e-9)
    }

    @Test fun mandelbrotMembership() {
        assertEquals(-1f, Fractal.escape(0.0, 0.0, 0.0, 0.0, 500, true))
        assertEquals(-1f, Fractal.escape(0.0, 0.0, -1.0, 0.0, 500, false)) // period-2 point, via iteration
        assertEquals(-1f, Fractal.escape(0.0, 0.0, -0.123, 0.745, 5000, false))
        assertTrue(Fractal.escape(0.0, 0.0, 1.0, 1.0, 500, true) >= 0f)
        assertTrue(Fractal.escape(0.0, 0.0, 0.5, 0.0, 500, true) >= 0f)
        val w = 40; val h = 30; val out = FloatArray(w * h)
        Fractal.mandelbrotRows(out, w, h, FractalView(-0.5, 0.0, 3.0 / w), 200, 0, h)
        assertTrue(out.count { it < 0 } in 100..900)
        val logistic = Fractal.logisticBifurcation(2.8, 3.2, 3)
        assertEquals(1.0 - 1 / 2.8, logistic[0].second.last(), 1e-6) // stable fixed point
    }

    @Test fun lessonExercisesAreCorrect() {
        for (l in Lessons.all) for (b in l.blocks.filterIsInstance<Block.Exercise>()) {
            assertTrue("${l.id}: ${b.prompt}", AnswerChecker.check(b.answers.joinToString(", "), b.answers))
        }
        // spot-check that stated answers really are the math
        val ev = Evaluator()
        assertEquals(37.0, ev.eval(Parser.parse("5 + 2*(7 - 3)^2")), 0.0)
        assertEquals(512.0, ev.eval(Parser.parse("2^3^2")), 0.0)
        assertTrue(Lessons.all.size >= 20)
        assertEquals(Lessons.all.size, Lessons.all.map { it.id }.toSet().size)
    }

    @Test fun answerChecker() {
        assertTrue(AnswerChecker.check("0.5", listOf("1/2")))
        assertTrue(AnswerChecker.check("3, -2", listOf("-2", "3")))
        assertFalse(AnswerChecker.check("3", listOf("-2", "3")))
        assertTrue(AnswerChecker.check("sqrt(3)/2", listOf("sqrt(3)/2")))
        assertTrue(AnswerChecker.check("0.866", listOf("sqrt(3)/2")))
        assertFalse(AnswerChecker.check("0.8", listOf("sqrt(3)/2")))
        assertFalse(AnswerChecker.check("banana(", listOf("1")))
        assertTrue(AnswerChecker.check("x = 5", listOf("5")))
    }

    @Test fun generatedQuizzesAreSelfConsistent() {
        for (t in QuizTopic.entries) for (d in Difficulty.entries) for (seed in 1L..15L) {
            val qs = QuizGenerator.generate(t, d, seed, 6)
            for (q in qs) {
                assertTrue("${q.id}: ${q.prompt} -> ${q.answers}", q.answers.isNotEmpty())
                assertTrue("${q.id}: ${q.prompt} -> ${q.answers}", AnswerChecker.check(q.answers.joinToString(", "), q.answers))
            }
        }
    }

    @Test fun quizAnswersMatchIndependentComputation() {
        val qs = QuizGenerator.generate(QuizTopic.QUADRATICS, Difficulty.HARD, 7, 20)
        for (q in qs) {
            // plug each root into the equation in the prompt
            val eq = q.prompt.substringAfter("Solve ").substringBefore(" (both")
            val rel = Parser.parseRelation(eq.replace("−", "-").replace("²", "^2"))
            for (a in q.answers) {
                val x = AnswerChecker.value(a)!!
                val ev = Evaluator()
                assertEquals(0.0, ev.eval(rel.left, mapOf("x" to x)) - ev.eval(rel.right, mapOf("x" to x)), 1e-6)
            }
        }
        val dets = QuizGenerator.generate(QuizTopic.MATRICES, Difficulty.EASY, 3, 10)
        for (q in dets) {
            val nums = Regex("-?\\d+").findAll(q.prompt).map { it.value.toLong() }.toList()
            assertEquals(nums[0] * nums[3] - nums[1] * nums[2], q.answers[0].toLong())
        }
    }

    @Test fun dailyChallengeIsDeterministic() {
        val s = DailyChallenge.seedFor(2026, 11, 18)
        assertEquals(20261118L, s)
        assertEquals(DailyChallenge.questions(s).map { it.prompt }, DailyChallenge.questions(s).map { it.prompt })
        assertNotEquals(DailyChallenge.questions(s).map { it.prompt }, DailyChallenge.questions(s + 1).map { it.prompt })
        assertEquals(5, DailyChallenge.questions(s).size)
    }

    @Test fun formulaLibrary() {
        assertTrue(FormulaLibrary.all.size >= 75)
        assertTrue(FormulaLibrary.search("pythag").isNotEmpty())
        assertTrue(FormulaLibrary.categories.size >= 9)
    }
}
