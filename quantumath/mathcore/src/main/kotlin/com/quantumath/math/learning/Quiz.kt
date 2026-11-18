package com.quantumath.math.learning

import com.quantumath.math.core.Rational
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.numbertheory.NumberTheory
import com.quantumath.math.symbolic.Derivative
import com.quantumath.math.symbolic.Solver
import java.math.BigInteger
import kotlin.math.abs
import kotlin.math.max
import kotlin.random.Random

enum class Difficulty(val label: String, val seconds: Int) { EASY("Easy", 60), MEDIUM("Medium", 90), HARD("Hard", 150) }

enum class QuizTopic(val label: String) {
    ARITHMETIC("Arithmetic"), FRACTIONS("Fractions"), EQUATIONS("Equations"), QUADRATICS("Quadratics"),
    DERIVATIVES("Derivatives"), INTEGRALS("Integrals"), TRIGONOMETRY("Trigonometry"), MATRICES("Matrices"),
    NUMBER_THEORY("Number theory"), PROBABILITY("Probability"), LOGARITHMS("Logarithms"), STATISTICS("Statistics"),
}

/**
 * One quiz question. [answers] are accepted values written as expressions ("3/2", "-4", "pi/3").
 * When several answers are listed, the user must give all of them (any order, comma-separated).
 */
data class Question(
    val id: String,
    val topic: QuizTopic,
    val difficulty: Difficulty,
    val prompt: String,
    val answers: List<String>,
    val hint: String,
    val explanation: String,
    val choices: List<String> = emptyList(),
)

object AnswerChecker {
    private val ev = Evaluator()

    fun value(text: String): Double? = try {
        val t = text.trim().removePrefix("x=").removePrefix("x =").trim()
        if (t.isEmpty()) null else ev.eval(Parser.parse(t)).takeIf { it.isFinite() }
    } catch (_: Exception) { null }

    private fun close(a: Double, b: Double) = abs(a - b) <= 5e-4 * max(1.0, abs(b))

    /** Accept exact or decimal input. A decimal rounded to at least 3 significant decimals is accepted too. */
    fun check(input: String, answers: List<String>): Boolean {
        val expected = answers.map { value(it) ?: return false }
        val parts = input.split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.size != expected.size) return false
        val got = parts.map { value(it) ?: return false }
        val remaining = expected.toMutableList()
        for (g in got) {
            val idx = remaining.indexOfFirst { close(g, it) }
            if (idx < 0) return false
            remaining.removeAt(idx)
        }
        return true
    }
}

/** Seeded question generators. Every answer is computed by the math core, not hard-coded. */
object QuizGenerator {
    private fun pr(s: String) = Printer.print(Parser.parse(s), unicode = true)
    private fun r(n: Long, d: Long = 1) = Rational.of(n, d)
    private fun Rational.s() = if (den == BigInteger.ONE) num.toString() else "$num/$den"

    fun generate(topic: QuizTopic, difficulty: Difficulty, seed: Long, count: Int = 10): List<Question> {
        val rnd = Random(seed * 1_000_003 + topic.ordinal * 97 + difficulty.ordinal)
        return List(count) { i -> one(topic, difficulty, rnd, "${topic.name}-${difficulty.name}-$seed-$i") }
    }

    fun mixed(difficulty: Difficulty, seed: Long, count: Int = 10): List<Question> {
        val rnd = Random(seed)
        return List(count) { i ->
            val t = QuizTopic.entries[rnd.nextInt(QuizTopic.entries.size)]
            one(t, difficulty, rnd, "MIX-${difficulty.name}-$seed-$i")
        }
    }

    private fun nz(rnd: Random, lo: Int, hi: Int): Int { var v: Int; do v = rnd.nextInt(lo, hi + 1) while (v == 0); return v }

    fun one(topic: QuizTopic, d: Difficulty, rnd: Random, id: String): Question {
        val lvl = d.ordinal
        return when (topic) {
            QuizTopic.ARITHMETIC -> {
                val a = rnd.nextInt(2, 10 + lvl * 15); val b = rnd.nextInt(2, 10 + lvl * 8); val c = rnd.nextInt(2, 9 + lvl * 4); val e = rnd.nextInt(2, 3 + lvl)
                val expr = when (rnd.nextInt(3)) { 0 -> "$a + $b*$c"; 1 -> "($a - $b)*$c"; else -> "$a + $c^$e - $b" }
                val v = Evaluator().eval(Parser.parse(expr)).toLong()
                Question(id, topic, d, "Evaluate ${pr(expr)}", listOf(v.toString()), "Remember the order of operations: powers, then × and ÷, then + and −.", "${pr(expr)} = $v")
            }
            QuizTopic.FRACTIONS -> {
                val x = r(nz(rnd, 1, 9).toLong(), rnd.nextLong(2, 10L + lvl * 6)); val y = r(nz(rnd, 1, 9).toLong(), rnd.nextLong(2, 10L + lvl * 6))
                val op = rnd.nextInt(if (lvl == 0) 2 else 4)
                val (sym, res) = when (op) { 0 -> "+" to x + y; 1 -> "−" to x - y; 2 -> "×" to x * y; else -> "÷" to x / y }
                Question(id, topic, d, "Compute ${x.s()} $sym ${y.s()} (simplified fraction)", listOf(res.s()),
                    if (op < 2) "Rewrite both fractions over a common denominator." else if (op == 2) "Multiply numerators and denominators." else "Multiply by the reciprocal of the second fraction.",
                    "${x.s()} $sym ${y.s()} = ${res.s()}")
            }
            QuizTopic.EQUATIONS -> {
                val sol = rnd.nextInt(-9 - lvl * 5, 10 + lvl * 5); val a = nz(rnd, -6 - lvl * 3, 6 + lvl * 3); val c = nz(rnd, -5, 5)
                val b = rnd.nextInt(-12, 13)
                val eq = if (lvl == 0) "$a*x + ($b) = ${a * sol + b}" else "$a*x + ($b) = $c*x + ${(a - c) * sol + b}"
                if (lvl > 0 && a == c) return one(topic, d, rnd, id)
                val res = Solver.solve(Parser.parseRelation(eq))
                val ans = res.solutions.single().value
                Question(id, topic, d, "Solve for x:  ${eqText(eq)}", listOf(fmt(ans)), "Collect the x-terms on one side and the constants on the other.", res.steps.joinToString("\n") { "${it.rule}: ${it.detail}" }.ifBlank { "x = ${fmt(ans)}" })
            }
            QuizTopic.QUADRATICS -> {
                val r1 = rnd.nextInt(-8, 9); var r2 = rnd.nextInt(-8, 9); if (r2 == r1) r2 = r1 + rnd.nextInt(1, 4)
                val a = if (lvl == 2) nz(rnd, 1, 3) else 1
                val bb = -a * (r1 + r2); val cc = a * r1 * r2
                val eq = "${a}x^2 + ($bb)x + ($cc) = 0"
                val res = Solver.solve(Parser.parseRelation(eq))
                val sols = res.solutions.map { fmt(it.value) }
                Question(id, topic, d, "Solve ${eqText(eq)} (both roots, comma-separated)", sols, "Factor, or use the quadratic formula x = (−b ± √(b² − 4ac))/2a.", "Roots: ${res.solutions.joinToString(", ") { it.display }}")
            }
            QuizTopic.DERIVATIVES -> {
                val f = when (rnd.nextInt(if (lvl == 0) 2 else 5)) {
                    0 -> "${nz(rnd, 1, 5)}x^${rnd.nextInt(2, 5)} + ${rnd.nextInt(-6, 7)}x"
                    1 -> "x^${rnd.nextInt(2, 4)} - ${rnd.nextInt(1, 9)}x^2"
                    2 -> "x^2*sin(x)"
                    3 -> "e^(${nz(rnd, 1, 3)}x)"
                    else -> "ln(x^2 + ${rnd.nextInt(1, 5)})"
                }
                val x0 = if (f.startsWith("x^2*sin")) 0 else rnd.nextInt(-2, 3).let { if (f.startsWith("ln")) it else it }
                val der = Derivative.differentiate(Parser.parse(f), "x").derivative
                val v = Evaluator().eval(der, mapOf("x" to x0.toDouble()))
                Question(id, topic, d, "f(x) = ${pr(f)}. Find f′($x0)", listOf(fmt(v)), "Differentiate term by term; use the chain and product rules where needed.", "f′(x) = ${Printer.print(der, unicode = true)}, so f′($x0) = ${fmt(v)}")
            }
            QuizTopic.INTEGRALS -> {
                val a = rnd.nextInt(0, 2); val b = a + rnd.nextInt(1, 3 + lvl)
                val n = rnd.nextInt(1, 3 + lvl); val k = nz(rnd, 1, 4); val m = rnd.nextInt(-3, 4)
                // ∫ k x^n + m = k x^(n+1)/(n+1) + m x
                val exact = r(k.toLong()) * (r(b.toLong()).pow(n + 1) - r(a.toLong()).pow(n + 1)) / r(n + 1L) + r(m.toLong()) * r((b - a).toLong())
                val f = "${k}x^$n + ($m)"
                Question(id, topic, d, "Compute ∫ from $a to $b of ${pr(f)} dx", listOf(exact.s()), "Antiderivative of xⁿ is xⁿ⁺¹/(n + 1). Then evaluate F(b) − F(a).", "F(x) = ${k}x^${n + 1}/${n + 1} + ${m}x, F($b) − F($a) = ${exact.s()}")
            }
            QuizTopic.TRIGONOMETRY -> {
                val angles = listOf(0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330)
                val deg = angles[rnd.nextInt(if (lvl == 0) 5 else angles.size)]
                val fn = listOf("sin", "cos", "tan")[rnd.nextInt(if (lvl == 0) 2 else 3)]
                if (fn == "tan" && (deg == 90 || deg == 270)) return one(topic, d, rnd, id)
                val ex = com.quantumath.math.symbolic.Algebra.simplify(Parser.parse("$fn($deg*pi/180)")).last().result
                val exactTxt = Printer.print(ex, unicode = false)
                Question(id, topic, d, "Give the exact value of $fn($deg°)", listOf(exactTxt), "Use the reference angle and the sign of $fn in that quadrant.", "$fn($deg°) = ${Printer.print(ex, unicode = true)}")
            }
            QuizTopic.MATRICES -> {
                val size = if (lvl == 2) 3 else 2
                val rows = List(size) { List(size) { rnd.nextInt(-5, 6).toString() } }
                val m = Matrix.parse(rows.joinToString(";") { it.joinToString(",") })
                val det = m.determinant().value
                Question(id, topic, d, "Find det ${rows.joinToString(", ", "[", "]") { it.joinToString(", ", "[", "]") }}", listOf(det.s()), if (size == 2) "det [[a, b], [c, d]] = ad − bc." else "Expand along a row, or use row reduction.", "det = ${det.s()}")
            }
            QuizTopic.NUMBER_THEORY -> when (rnd.nextInt(3)) {
                0 -> { val g = rnd.nextInt(2, 13); val a = g * rnd.nextInt(2, 15 + lvl * 10); val b = g * rnd.nextInt(2, 15 + lvl * 10)
                    val res = NumberTheory.gcd(a.toBigInteger(), b.toBigInteger())
                    Question(id, topic, d, "gcd($a, $b) = ?", listOf(res.toString()), "Euclidean algorithm: replace (a, b) with (b, a mod b).", NumberTheory.euclidSteps(a.toBigInteger(), b.toBigInteger()).joinToString("\n") { "${it.a} = ${it.q}·${it.b} + ${it.r}" } + "\ngcd = $res") }
                1 -> { val base = rnd.nextInt(2, 10); val e = rnd.nextInt(5, 40 + lvl * 100); val mod = rnd.nextInt(5, 20 + lvl * 20)
                    val res = NumberTheory.modPow(base.toBigInteger(), e.toBigInteger(), mod.toBigInteger())
                    Question(id, topic, d, "$base^$e mod $mod = ?", listOf(res.toString()), "Reduce step by step with repeated squaring.", "$base^$e ≡ $res (mod $mod)") }
                else -> { val n = rnd.nextInt(10, 60 + lvl * 200)
                    val phi = NumberTheory.eulerPhi(n.toBigInteger())
                    Question(id, topic, d, "Euler's totient φ($n) = ?", listOf(phi.toString()), "φ(n) = n·∏(1 − 1/p) over the prime factors p of n.", "Factorization: ${NumberTheory.factorize(n.toBigInteger()).joinToString(" · ") { (p, k) -> if (k == 1) "$p" else "$p^$k" }}; φ($n) = $phi") }
            }
            QuizTopic.PROBABILITY -> when (rnd.nextInt(3)) {
                0 -> { val n = rnd.nextInt(5, 12 + lvl * 4); val k = rnd.nextInt(2, minOf(n, 5)); val c = NumberTheory.binomial(n, k)
                    Question(id, topic, d, "How many ways to choose $k items from $n (order irrelevant)?", listOf(c.toString()), "nCr = n!/(r!(n − r)!).", "$n C $k = $c") }
                1 -> { val n = rnd.nextInt(3, 6 + lvl); val k = rnd.nextInt(0, n + 1)
                    val p = r(NumberTheory.binomial(n, k).toLong(), 1L shl n)
                    Question(id, topic, d, "A fair coin is tossed $n times. Probability of exactly $k heads (fraction)?", listOf(p.s()), "Count favourable outcomes C($n, $k) out of 2^$n.", "C($n,$k)/2^$n = ${NumberTheory.binomial(n, k)}/${1L shl n} = ${p.s()}") }
                else -> { val s = rnd.nextInt(2, 13); val ways = (1..6).sumOf { a -> (1..6).count { b -> a + b == s } }
                    val p = r(ways.toLong(), 36)
                    Question(id, topic, d, "Two fair dice are rolled. Probability that the sum is $s (fraction)?", listOf(p.s()), "Count ordered pairs (a, b) with a + b = $s among 36.", "$ways favourable pairs out of 36 = ${p.s()}") }
            }
            QuizTopic.LOGARITHMS -> {
                val b = listOf(2, 3, 5, 10)[rnd.nextInt(4)]; val e = rnd.nextInt(if (lvl == 0) 1 else -3, 6)
                val arg = r(b.toLong()).pow(e)
                Question(id, topic, d, "Evaluate log base $b of ${arg.s()}", listOf(e.toString()), "Write ${arg.s()} as a power of $b.", "${arg.s()} = $b^$e, so the logarithm is $e")
            }
            QuizTopic.STATISTICS -> {
                val n = 5 + lvl * 2; val data = List(n) { rnd.nextInt(1, 30) }
                if (rnd.nextBoolean()) {
                    val mean = r(data.sum().toLong(), n.toLong())
                    Question(id, topic, d, "Mean of ${data.joinToString(", ")}", listOf(mean.s()), "Add the values and divide by $n.", "${data.sum()}/$n = ${mean.s()}")
                } else {
                    val sorted = data.sorted()
                    Question(id, topic, d, "Median of ${data.joinToString(", ")}", listOf(sorted[n / 2].toString()), "Sort the data and take the middle value.", "Sorted: ${sorted.joinToString(", ")}; median ${sorted[n / 2]}")
                }
            }
        }
    }

    private fun eqText(eq: String) = Parser.parseRelation(eq).let { "${Printer.print(it.left, true)} ${it.op} ${Printer.print(it.right, true)}" }

    fun fmt(v: Double): String {
        val rr = Rational.fromDouble(v, 1000, 1e-9)
        return rr?.s() ?: "%.6f".format(java.util.Locale.ROOT, v).trimEnd('0').trimEnd('.')
    }
}

data class Achievement(val id: String, val title: String, val description: String, val icon: String)

object Achievements {
    val all = listOf(
        Achievement("first-calc", "First steps", "Run your first calculation", "calculate"),
        Achievement("first-solve", "Equation tamer", "Solve an equation", "function"),
        Achievement("first-graph", "Cartographer", "Plot a graph", "show_chart"),
        Achievement("first-lesson", "Student", "Complete a lesson", "school"),
        Achievement("five-lessons", "Scholar", "Complete 5 lessons", "menu_book"),
        Achievement("all-lessons", "Professor", "Complete every lesson", "workspace_premium"),
        Achievement("quiz-perfect", "Flawless", "Score 100% on a quiz", "star"),
        Achievement("daily-1", "Daily thinker", "Finish a daily challenge", "today"),
        Achievement("streak-3", "On a roll", "3-day daily challenge streak", "local_fire_department"),
        Achievement("streak-7", "Unstoppable", "7-day daily challenge streak", "whatshot"),
        Achievement("speed", "Lightning", "Finish a timed quiz with half the time left", "bolt"),
        Achievement("fractal", "Into the abyss", "Render a fractal", "blur_on"),
        Achievement("notebook", "Archivist", "Save 5 notebook entries", "bookmarks"),
        Achievement("hundred", "Centurion", "Answer 100 questions correctly", "military_tech"),
    )
    fun byId(id: String) = all.firstOrNull { it.id == id }
}

object DailyChallenge {
    /** Same date → same questions on every device; seed is yyyymmdd. */
    fun seedFor(year: Int, month: Int, day: Int): Long = year * 10000L + month * 100 + day

    fun questions(seed: Long): List<Question> {
        val rnd = Random(seed)
        val topics = QuizTopic.entries.shuffled(rnd).take(5)
        val diffs = listOf(Difficulty.EASY, Difficulty.EASY, Difficulty.MEDIUM, Difficulty.MEDIUM, Difficulty.HARD)
        return topics.mapIndexed { i, t -> QuizGenerator.one(t, diffs[i], rnd, "DAILY-$seed-$i") }
    }
}
