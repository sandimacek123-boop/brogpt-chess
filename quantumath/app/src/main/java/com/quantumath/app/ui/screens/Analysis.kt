package com.quantumath.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.data.Kind
import com.quantumath.app.data.Note
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.computation
import com.quantumath.math.complex.Complex
import com.quantumath.math.complex.ComplexEvaluator
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.AngleMode
import com.quantumath.math.expr.Parser
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.linalg.Vectors
import com.quantumath.math.numbertheory.NumberTheory
import com.quantumath.math.plot.Viewport
import com.quantumath.math.stats.*
import com.quantumath.math.symbolic.LimitSolver
import com.quantumath.math.symbolic.Solver
import java.math.BigInteger
import kotlin.math.*

private fun g(v: Double) = LimitSolver.fmt(if (v.isFinite()) java.math.BigDecimal(v).round(java.math.MathContext(10)).toDouble() else v)

// =============================== Linear algebra ===============================

sealed interface LinOut {
    data class M(val title: String, val m: Matrix, val steps: List<Matrix.Step> = emptyList(), val textSteps: List<String> = emptyList(), val note: String? = null) : LinOut
    data class Scalar(val title: String, val value: String, val textSteps: List<String> = emptyList(), val note: String? = null) : LinOut
    data class Sys(val sol: Matrix.SystemSolution, val rref: Matrix.Rref) : LinOut
    data class Eigen(val poly: String, val values: List<String>, val note: String) : LinOut
    data class Vec(val rows: List<Pair<String, String>>) : LinOut
}

class LinearAlgebraViewModel(private val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var a by mutableStateOf("2 1 -1\n-3 -1 2\n-2 1 2")
    var b by mutableStateOf("1 0 2\n0 1 0\n1 1 1")
    var rhs by mutableStateOf("8 -11 -3")
    var power by mutableStateOf("3")
    var u by mutableStateOf("1, 2, 3"); var v by mutableStateOf("4, -5, 6")
    val out = computation<LinOut>()

    fun setInitial(s: String) { if (s.isNotBlank()) a = s }

    fun op(name: String) {
        val at = a; val bt = b
        out.run(onOk = { r -> c.history.add(Kind.MATRIX, "$name\n$at", resultText(r)) }) {
            val A = Matrix.parse(at)
            fun B() = Matrix.parse(bt)
            when (name) {
                "det" -> A.determinant().let { LinOut.Scalar("det A", it.value.toString(), it.steps) }
                "inverse" -> A.inverse().let { LinOut.M("A⁻¹", it.matrix, it.steps) }
                "transpose" -> LinOut.M("Aᵀ", A.transpose())
                "rref" -> A.rref().let { LinOut.M("RREF(A) — rank ${it.rank}, pivots in columns ${it.pivots.joinToString { p -> (p + 1).toString() }}", it.matrix, it.steps) }
                "rank" -> A.rref().let { LinOut.Scalar("rank A", it.rank.toString(), note = "Number of pivots after Gauss–Jordan elimination") }
                "trace" -> LinOut.Scalar("tr A", A.trace().toString())
                "power" -> { val n = power.trim().toIntOrNull() ?: throw MathError("Exponent must be an integer"); if (abs(n) > 64) throw MathError("Exponent limited to |n| ≤ 64"); LinOut.M("A^$n", A.pow(n)) }
                "eigen" -> {
                    val cp = A.characteristicPolynomial()
                    val poly = (cp.indices.reversed()).filter { !cp[it].isZero }.joinToString(" + ") { i -> val k = cp[i]; val coef = if (i > 0 && k == Rational.ONE) "" else "($k)"; when (i) { 0 -> "($k)"; 1 -> "${coef}x"; else -> "${coef}x^$i" } }
                    val r = Solver.solve(Parser.parseRelation("$poly = 0"), "x")
                    val vals = r.solutions.map { it.display } + r.complexSolutions
                    LinOut.Eigen(poly.replace("x", "λ").replace("(1)", "1"), vals, if (r.exact) "Exact roots of the characteristic polynomial" else "Roots found numerically")
                }
                "A+B" -> LinOut.M("A + B", A + B()); "A−B" -> LinOut.M("A − B", A - B()); "A×B" -> LinOut.M("A × B", A * B()); "B×A" -> LinOut.M("B × A", B() * A)
                else -> throw MathError("Unknown operation")
            }
        }
    }

    fun solveSystem() {
        val at = a; val bt = rhs
        out.run(onOk = { r -> c.history.add(Kind.MATRIX, "solve Ax=b\n$at\nb = $bt", resultText(r)) }) {
            val A = Matrix.parse(at)
            val bv = Vectors.parse(bt)
            val (sol, rr) = A.solve(bv)
            LinOut.Sys(sol, rr)
        }
    }

    fun vectors() {
        out.run {
            val x = Vectors.parse(u); val y = Vectors.parse(v)
            val rows = ArrayList<Pair<String, String>>()
            rows += "u · v" to Vectors.dot(x, y).toString()
            rows += "|u|" to g(Vectors.norm(x)); rows += "|v|" to g(Vectors.norm(y))
            if (x.size == 3 && y.size == 3) rows += "u × v" to Vectors.cross(x, y).joinToString(", ", "(", ")")
            runCatching { rows += "angle(u, v)" to "${g(Math.toDegrees(Vectors.angleRadians(x, y)))}° (${g(Vectors.angleRadians(x, y))} rad)" }
            runCatching { rows += "proj_v u" to Vectors.projection(x, y).joinToString(", ", "(", ")") }
            rows += "u + v" to x.zip(y) { p, q -> p + q }.joinToString(", ", "(", ")")
            rows += "Orthogonal?" to if (Vectors.dot(x, y).isZero) "yes" else "no"
            LinOut.Vec(rows)
        }
    }

    fun resultText(r: LinOut): String = when (r) {
        is LinOut.M -> "${r.title}\n${r.m}"
        is LinOut.Scalar -> "${r.title} = ${r.value}"
        is LinOut.Sys -> sysText(r.sol)
        is LinOut.Eigen -> "λ = ${r.values.joinToString()}"
        is LinOut.Vec -> r.rows.joinToString("\n") { "${it.first} = ${it.second}" }
    }

    fun save() { val r = (out.state.value as? com.quantumath.app.util.Outcome.Ok)?.value ?: return; c.saveNote(Note(title = "Matrix", kind = Kind.MATRIX, input = a, result = resultText(r))) }
}

fun sysText(s: Matrix.SystemSolution) = when (s) {
    is Matrix.SystemSolution.Unique -> s.x.mapIndexed { i, v -> "x${sub(i + 1)} = $v" }.joinToString(", ")
    is Matrix.SystemSolution.Infinite -> "Infinitely many: x = (${s.particular.joinToString()}) + " + s.basis.mapIndexed { i, b -> "t${sub(i + 1)}(${b.joinToString()})" }.joinToString(" + ")
    Matrix.SystemSolution.None -> "No solution — the system is inconsistent"
}
private fun sub(n: Int) = n.toString().map { "₀₁₂₃₄₅₆₇₈₉"[it - '0'] }.joinToString("")

@Composable
fun MatrixView(m: Matrix, modifier: Modifier = Modifier, highlightCols: Int = -1) {
    val rows = m.toList()
    Row(modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("[", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.outline)
        Column {
            for (r in rows) Row {
                r.forEachIndexed { j, v ->
                    Text(v.toString(), fontFamily = MonoFamily, textAlign = TextAlign.End, modifier = Modifier.widthIn(min = 52.dp).padding(horizontal = 6.dp, vertical = 2.dp),
                        color = if (highlightCols >= 0 && j >= highlightCols) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        Text("]", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
fun LinearAlgebraScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { LinearAlgebraViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial) }
    val out by vm.out.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Linear algebra", onBack = { nav.popBackStack() }, subtitle = "Exact rational arithmetic")
        PrimaryTabRow(selectedTabIndex = vm.tab, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Matrices", "Systems Ax = b", "Vectors").forEachIndexed { i, t -> Tab(vm.tab == i, { vm.tab = i; vm.out.clear() }, text = { Text(t, maxLines = 1) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            when (vm.tab) {
                0 -> {
                    MatrixInput("Matrix A", vm.a) { vm.a = it }
                    Text("Single-matrix operations", style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for ((k, l) in listOf("det" to "det A", "inverse" to "A⁻¹", "transpose" to "Aᵀ", "rref" to "RREF", "rank" to "rank", "trace" to "trace", "eigen" to "eigenvalues")) AssistChip(onClick = { vm.op(k) }, label = { Text(l) })
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AssistChip(onClick = { vm.op("power") }, label = { Text("Aⁿ") })
                            OutlinedTextField(vm.power, { vm.power = it }, Modifier.width(72.dp).padding(start = 4.dp), singleLine = true, label = { Text("n") })
                        }
                    }
                    MatrixInput("Matrix B", vm.b) { vm.b = it }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { for (k in listOf("A+B", "A−B", "A×B", "B×A")) AssistChip(onClick = { vm.op(k) }, label = { Text(k) }) }
                }
                1 -> {
                    MatrixInput("Coefficient matrix A", vm.a) { vm.a = it }
                    NumberField("Right-hand side b", vm.rhs, { vm.rhs = it }, Modifier.fillMaxWidth(), supporting = "One value per row of A")
                    PrimaryButton("Solve by Gauss–Jordan", vm::solveSystem, Modifier.fillMaxWidth())
                }
                else -> {
                    NumberField("u", vm.u, { vm.u = it }, Modifier.fillMaxWidth()); NumberField("v", vm.v, { vm.v = it }, Modifier.fillMaxWidth())
                    PrimaryButton("Compute", vm::vectors, Modifier.fillMaxWidth())
                }
            }
            OutcomeView(out) { r ->
                when (r) {
                    is LinOut.M -> { Panel(title = r.title, trailing = { IconButton(onClick = vm::save) { Icon(Icons.Outlined.BookmarkAdd, "Save to notebook") } }) { MatrixView(r.m) }; MatrixSteps(r.steps, r.textSteps) }
                    is LinOut.Scalar -> { ResultPanel(r.title, r.value, secondary = r.note, onSave = vm::save); MatrixSteps(emptyList(), r.textSteps) }
                    is LinOut.Eigen -> { ResultPanel("Eigenvalues", r.values.joinToString(",  ").ifEmpty { "none found" }, secondary = "det(λI − A) = ${r.poly}\n${r.note}", onSave = vm::save) }
                    is LinOut.Sys -> {
                        ResultPanel("Solution", sysText(r.sol), secondary = "rank ${r.rref.rank}", onSave = vm::save)
                        Panel(title = "Reduced augmented matrix [A | b]") { MatrixView(r.rref.matrix, highlightCols = r.rref.matrix.cols - 1) }
                        MatrixSteps(r.rref.steps, emptyList())
                    }
                    is LinOut.Vec -> Panel(title = "Results", trailing = { IconButton(onClick = vm::save) { Icon(Icons.Outlined.BookmarkAdd, "Save to notebook") } }) { r.rows.forEach { (k, v) -> KeyValue(k, v) } }
                }
            }
        }
    }
}

@Composable
private fun MatrixInput(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, minLines = 2, textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily),
        supportingText = { Text("One row per line; entries separated by spaces. Fractions like 3/4 are exact.") }, shape = RoundedCornerShape(14.dp))
}

@Composable
private fun MatrixSteps(steps: List<Matrix.Step>, text: List<String>) {
    if (steps.isEmpty() && text.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    Panel(title = "Steps (${steps.size + text.size})", icon = Icons.Outlined.FormatListNumbered, trailing = { TextButton(onClick = { open = !open }) { Text(if (open) "Hide" else "Show") } }) {
        if (open) {
            text.forEach { Text(it, fontFamily = MonoFamily, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp)) }
            steps.take(80).forEachIndexed { i, s -> Text("${i + 1}. ${s.description}", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 6.dp)); MatrixView(s.matrix) }
            if (steps.size > 80) Text("… ${steps.size - 80} more steps", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// =============================== Statistics ===============================

sealed interface StatOut {
    data class Desc(val d: Descriptive, val data: List<Double>, val hist: List<Statistics.Bin>) : StatOut
    data class Reg(val r: Regression, val x: List<Double>, val y: List<Double>) : StatOut
    data class Dist(val rows: List<Pair<String, String>>, val discrete: Boolean, val pdf: (Double) -> Double, val lo: Double, val hi: Double, val shadeA: Double, val shadeB: Double) : StatOut
    data class Sim(val title: String, val outcomes: List<Experiments.Outcome>, val total: Int, val piPoints: List<Pair<Double, Double>> = emptyList(), val estimate: Double? = null) : StatOut
}

class StatsViewModel(private val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var data by mutableStateOf("12, 15, 11, 18, 21, 15, 14, 19, 22, 15, 13, 40")
    var xs by mutableStateOf("1 2 3 4 5 6 7 8")
    var ys by mutableStateOf("2.1 3.9 6.2 8.1 9.8 12.2 13.8 16.1")
    var model by mutableStateOf("Linear")
    var dist by mutableStateOf("Normal")
    var p1 by mutableStateOf("0"); var p2 by mutableStateOf("1")
    var qa by mutableStateOf("-1"); var qb by mutableStateOf("1")
    var sim by mutableStateOf("Coins")
    var trials by mutableStateOf("1000"); var dice by mutableStateOf("2"); var seed by mutableStateOf("42")
    val out = computation<StatOut>()

    fun setInitial(s: String) { if (s.isNotBlank()) data = s }

    fun describe() {
        val t = data
        out.run(onOk = { c.history.add(Kind.STATS, t, (it as StatOut.Desc).d.let { d -> "n=${d.n}, mean=${g(d.mean)}, median=${g(d.median)}, s=${g(d.sampleSd)}" }) }) {
            val v = Statistics.parse(t); if (v.isEmpty()) throw MathError("Enter some numbers")
            StatOut.Desc(Statistics.describe(v), v, Statistics.histogram(v))
        }
    }

    fun regress() {
        out.run {
            val x = Statistics.parse(xs); val y = Statistics.parse(ys)
            val r = when (model) { "Linear" -> RegressionFit.linear(x, y); "Quadratic" -> RegressionFit.polynomial(x, y, 2); "Cubic" -> RegressionFit.polynomial(x, y, 3); else -> RegressionFit.exponential(x, y) }
            StatOut.Reg(r, x, y)
        }
    }

    fun distribution() {
        out.run {
            fun v(s: String) = parseBound(s)
            when (dist) {
                "Normal" -> {
                    val mu = v(p1); val s = v(p2); if (s <= 0) throw MathError("σ must be positive")
                    val a = v(qa); val b = v(qb)
                    StatOut.Dist(listOf(
                        "P(X ≤ $qa)" to g(Distributions.normalCdf(a, mu, s)), "P(X ≤ $qb)" to g(Distributions.normalCdf(b, mu, s)),
                        "P($qa ≤ X ≤ $qb)" to g(Distributions.normalCdf(b, mu, s) - Distributions.normalCdf(a, mu, s)),
                        "density f($qa)" to g(Distributions.normalPdf(a, mu, s)),
                        "z-scores" to "${g((a - mu) / s)}, ${g((b - mu) / s)}",
                        "95th percentile" to g(Distributions.normalInv(0.95, mu, s)),
                    ), false, { Distributions.normalPdf(it, mu, s) }, mu - 4 * s, mu + 4 * s, a, b)
                }
                "Binomial" -> {
                    val n = v(p1).roundToInt(); val p = v(p2); if (n < 1 || n > 5000) throw MathError("n must be between 1 and 5000"); if (p !in 0.0..1.0) throw MathError("p must be in [0, 1]")
                    val a = v(qa).roundToInt(); val b = v(qb).roundToInt()
                    StatOut.Dist(listOf(
                        "P(X = $a)" to g(Distributions.binomialPmf(a, n, p)), "P(X ≤ $b)" to g(Distributions.binomialCdf(b, n, p)),
                        "P($a ≤ X ≤ $b)" to g((a..b).sumOf { Distributions.binomialPmf(it, n, p) }),
                        "Mean np" to g(n * p), "Variance np(1−p)" to g(n * p * (1 - p)),
                    ), true, { k -> Distributions.binomialPmf(k.roundToInt(), n, p) }, -0.5, n + 0.5, a.toDouble(), b.toDouble())
                }
                "Poisson" -> {
                    val l = v(p1); if (l <= 0) throw MathError("λ must be positive")
                    val a = v(qa).roundToInt(); val b = v(qb).roundToInt()
                    StatOut.Dist(listOf("P(X = $a)" to g(Distributions.poissonPmf(a, l)), "P(X ≤ $b)" to g(Distributions.poissonCdf(b, l)), "P($a ≤ X ≤ $b)" to g((a..b).sumOf { Distributions.poissonPmf(it, l) }), "Mean = variance" to g(l)),
                        true, { k -> Distributions.poissonPmf(k.roundToInt(), l) }, -0.5, max(10.0, l + 4 * sqrt(l)) + 0.5, a.toDouble(), b.toDouble())
                }
                "Exponential" -> {
                    val r = v(p1); val a = v(qa); val b = v(qb)
                    StatOut.Dist(listOf("P(X ≤ $qb)" to g(Distributions.exponentialCdf(b, r)), "P($qa ≤ X ≤ $qb)" to g(Distributions.exponentialCdf(b, r) - Distributions.exponentialCdf(a, r)), "Mean 1/λ" to g(1 / r)),
                        false, { x -> if (x < 0) 0.0 else r * exp(-r * x) }, -0.2 / r, 5 / r, max(a, 0.0), b)
                }
                "Uniform" -> {
                    val lo = v(p1); val hi = v(p2); val a = v(qa); val b = v(qb)
                    StatOut.Dist(listOf("P($qa ≤ X ≤ $qb)" to g(Distributions.uniformCdf(b, lo, hi) - Distributions.uniformCdf(a, lo, hi)), "Mean" to g((lo + hi) / 2), "Variance" to g((hi - lo).pow(2) / 12)),
                        false, { x -> if (x in lo..hi) 1 / (hi - lo) else 0.0 }, lo - (hi - lo) * 0.2, hi + (hi - lo) * 0.2, a, b)
                }
                else -> {
                    val p = v(p1); val a = v(qa).roundToInt(); val b = v(qb).roundToInt()
                    StatOut.Dist(listOf("P(X = $a)" to g(Distributions.geometricPmf(a, p)), "P($a ≤ X ≤ $b)" to g((a..b).sumOf { Distributions.geometricPmf(it, p) }), "Mean 1/p" to g(1 / p)),
                        true, { k -> Distributions.geometricPmf(k.roundToInt(), p) }, 0.5, max(10.0, 4 / p) + 0.5, a.toDouble(), b.toDouble())
                }
            }
        }
    }

    fun simulate() {
        out.run {
            val n = trials.trim().toIntOrNull()?.coerceIn(1, 2_000_000) ?: throw MathError("Trials must be a whole number")
            val s = seed.trim().toLongOrNull() ?: 42L
            when (sim) {
                "Coins" -> StatOut.Sim("$n coin flips", Experiments.coins(n, s), n)
                "Dice" -> { val d = dice.trim().toIntOrNull()?.coerceIn(1, 10) ?: 2; StatOut.Sim("$n rolls of $d dice (sum)", Experiments.dice(n, d, s), n) }
                else -> { val (est, pts) = Experiments.monteCarloPi(n, s); StatOut.Sim("Monte Carlo π with $n points", emptyList(), n, pts, est) }
            }
        }
    }
}

@Composable
fun StatsScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { StatsViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial) }
    val out by vm.out.state.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Statistics & probability", onBack = { nav.popBackStack() })
        PrimaryScrollableTabRow(selectedTabIndex = vm.tab, edgePadding = 16.dp, containerColor = MaterialTheme.colorScheme.background) {
            listOf("Data", "Regression", "Distributions", "Simulate").forEachIndexed { i, t -> Tab(vm.tab == i, { vm.tab = i; vm.out.clear() }, text = { Text(t) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            when (vm.tab) {
                0 -> {
                    OutlinedTextField(vm.data, { vm.data = it }, Modifier.fillMaxWidth(), label = { Text("Data") }, minLines = 3, textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily), supportingText = { Text("Numbers separated by commas, spaces or new lines") })
                    PrimaryButton("Describe", vm::describe, Modifier.fillMaxWidth())
                }
                1 -> {
                    NumberField("x values", vm.xs, { vm.xs = it }, Modifier.fillMaxWidth()); NumberField("y values", vm.ys, { vm.ys = it }, Modifier.fillMaxWidth())
                    ChipRow(listOf("Linear", "Quadratic", "Cubic", "Exponential"), vm.model, { vm.model = it }, { it })
                    PrimaryButton("Fit model", vm::regress, Modifier.fillMaxWidth())
                }
                2 -> {
                    ChipRow(listOf("Normal", "Binomial", "Poisson", "Exponential", "Uniform", "Geometric"), vm.dist, {
                        vm.dist = it; vm.out.clear()
                        when (it) { "Normal" -> { vm.p1 = "0"; vm.p2 = "1"; vm.qa = "-1"; vm.qb = "1" }; "Binomial" -> { vm.p1 = "10"; vm.p2 = "0.5"; vm.qa = "3"; vm.qb = "6" }; "Poisson" -> { vm.p1 = "3"; vm.qa = "2"; vm.qb = "4" }
                            "Exponential" -> { vm.p1 = "0.5"; vm.qa = "1"; vm.qb = "3" }; "Uniform" -> { vm.p1 = "0"; vm.p2 = "10"; vm.qa = "2"; vm.qb = "5" }; else -> { vm.p1 = "0.2"; vm.qa = "1"; vm.qb = "3" } }
                    }, { it })
                    val (l1, l2) = when (vm.dist) { "Normal" -> "mean μ" to "std dev σ"; "Binomial" -> "trials n" to "success p"; "Poisson" -> "rate λ" to null; "Exponential" -> "rate λ" to null; "Uniform" -> "min a" to "max b"; else -> "success p" to null }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField(l1, vm.p1, { vm.p1 = it }, Modifier.weight(1f)); if (l2 != null) NumberField(l2, vm.p2, { vm.p2 = it }, Modifier.weight(1f)) }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField("from", vm.qa, { vm.qa = it }, Modifier.weight(1f)); NumberField("to", vm.qb, { vm.qb = it }, Modifier.weight(1f)) }
                    PrimaryButton("Compute probabilities", vm::distribution, Modifier.fillMaxWidth())
                }
                else -> {
                    ChipRow(listOf("Coins", "Dice", "Monte Carlo π"), vm.sim, { vm.sim = it; vm.out.clear() }, { it })
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        NumberField("Trials", vm.trials, { vm.trials = it }, Modifier.weight(1f))
                        if (vm.sim == "Dice") NumberField("Dice", vm.dice, { vm.dice = it }, Modifier.weight(0.6f))
                        NumberField("Seed", vm.seed, { vm.seed = it }, Modifier.weight(0.8f))
                    }
                    PrimaryButton("Run experiment", vm::simulate, Modifier.fillMaxWidth())
                    InfoPanel("Simulations use a seeded pseudo-random generator: the same seed reproduces the same experiment. Compare the observed frequencies with the exact theoretical probabilities.")
                }
            }
            OutcomeView(out) { r -> StatsResult(r, lab) }
        }
    }
}

@Composable
private fun StatsResult(r: StatOut, lab: com.quantumath.app.ui.theme.LabColors) {
    val tm = rememberTextMeasurer()
    when (r) {
        is StatOut.Desc -> {
            val d = r.d
            ResultPanel("Summary", "mean ${g(d.mean)} · median ${g(d.median)}", secondary = "n = ${d.n}, sample sd = ${g(d.sampleSd)}")
            Panel(title = "Histogram & box plot", icon = Icons.Outlined.BarChart) {
                val maxC = r.hist.maxOf { it.count }.coerceAtLeast(1)
                Canvas(Modifier.fillMaxWidth().height(200.dp).semantics { contentDescription = "Histogram of the data with ${r.hist.size} bins" }) {
                    val w = size.width / r.hist.size; val h = size.height - 60
                    r.hist.forEachIndexed { i, b ->
                        val bh = b.count.toFloat() / maxC * h
                        drawRoundRect(lab.accent.copy(alpha = 0.75f), Offset(i * w + 2, h - bh), Size(w - 4, bh), androidx.compose.ui.geometry.CornerRadius(6f))
                        if (b.count > 0) drawTextSafe(tm, b.count.toString(), Offset(i * w + w / 2 - 6, h - bh - 16), TextStyle(fontSize = 10.sp, color = lab.axis))
                    }
                    // box plot
                    val lo = r.hist.first().from; val hi = r.hist.last().to
                    fun X(v: Double) = ((v - lo) / (hi - lo) * size.width).toFloat()
                    val y = size.height - 25
                    val wMin = r.data.filter { it >= d.q1 - 1.5 * d.iqr }.minOrNull() ?: d.min; val wMax = r.data.filter { it <= d.q3 + 1.5 * d.iqr }.maxOrNull() ?: d.max
                    drawLine(lab.axis, Offset(X(wMin), y), Offset(X(wMax), y), 2f)
                    drawRect(lab.accent2.copy(alpha = 0.3f), Offset(X(d.q1), y - 14), Size(X(d.q3) - X(d.q1), 28f))
                    drawRect(lab.accent2, Offset(X(d.q1), y - 14), Size(X(d.q3) - X(d.q1), 28f), style = Stroke(2f))
                    drawLine(lab.warning, Offset(X(d.median), y - 14), Offset(X(d.median), y + 14), 3f)
                    for (o in d.outliers) drawCircle(lab.danger, 5f, Offset(X(o), y))
                }
            }
            Panel(title = "Statistics") {
                listOf("Count n" to d.n.toString(), "Sum" to g(d.sum), "Mean" to g(d.mean), "Median" to g(d.median), "Mode(s)" to (if (d.modes.isEmpty()) "none" else d.modes.joinToString { g(it) }),
                    "Min / max" to "${g(d.min)} / ${g(d.max)}", "Range" to g(d.range), "Q1 / Q3" to "${g(d.q1)} / ${g(d.q3)}", "IQR" to g(d.iqr),
                    "Sample variance s²" to g(d.sampleVariance), "Sample sd s" to g(d.sampleSd), "Population variance σ²" to g(d.populationVariance), "Population sd σ" to g(d.populationSd),
                    "Skewness" to g(d.skewness), "Outliers (1.5·IQR)" to (if (d.outliers.isEmpty()) "none" else d.outliers.joinToString { g(it) })).forEach { (k, v) -> KeyValue(k, v) }
            }
        }
        is StatOut.Reg -> {
            ResultPanel(r.r.kind, r.r.equation, secondary = "R² = ${g(r.r.r2)}")
            val xmin = r.x.min(); val xmax = r.x.max(); val px = max(1e-9, xmax - xmin) * 0.15
            val ymin = r.y.min(); val ymax = r.y.max(); val py = max(1e-9, ymax - ymin) * 0.15
            Panel(title = "Fit", icon = Icons.Outlined.ScatterPlot) {
                MiniPlot(listOf(PlotCurve(r.r.predict, lab.accent2)), Viewport(xmin - px, xmax + px, ymin - py, ymax + py), points = r.x.indices.map { PlotPoint(r.x[it], r.y[it], lab.accent) }, description = "Scatter plot with the fitted curve")
                Text("Residuals: " + r.x.indices.joinToString { g(r.y[it] - r.r.predict(r.x[it])) }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = MonoFamily)
            }
        }
        is StatOut.Dist -> {
            Panel(title = "Probabilities") { r.rows.forEach { (k, v) -> KeyValue(k, v) } }
            val ymax = (0..200).maxOf { r.pdf(r.lo + (r.hi - r.lo) * it / 200).let { v -> if (v.isFinite()) v else 0.0 } }.coerceAtLeast(1e-9) * 1.15
            val vp = Viewport(r.lo, r.hi, -ymax * 0.05, ymax)
            Panel(title = if (r.discrete) "Probability mass function" else "Density", icon = Icons.Outlined.AreaChart) {
                if (r.discrete) MiniPlot(emptyList(), vp, description = "Bar chart of the probability mass function", extraDraw = { m ->
                    val k0 = ceil(r.lo).toInt(); val k1 = floor(r.hi).toInt()
                    val bw = (m.sx(1.0) - m.sx(0.0)) * 0.7f
                    for (k in k0..k1) { val p = r.pdf(k.toDouble()); val inside = k >= r.shadeA && k <= r.shadeB
                        drawRect(if (inside) lab.accent else lab.axis.copy(alpha = 0.4f), Offset(m.sx(k.toDouble()) - bw / 2, m.sy(p)), Size(bw, m.sy(0.0) - m.sy(p))) }
                })
                else MiniPlot(listOf(PlotCurve(r.pdf, lab.accent)), vp, shade = PlotShade(r.pdf, max(r.shadeA, r.lo), min(r.shadeB, r.hi), lab.accent2), description = "Density curve with the selected interval shaded")
            }
        }
        is StatOut.Sim -> {
            if (r.estimate != null) {
                ResultPanel("π estimate", g(r.estimate), secondary = "error ${g(r.estimate - PI)} · expected error ~ ${g(1.64 / sqrt(r.total.toDouble()))}")
                Canvas(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(16.dp)).semantics { contentDescription = "Random points in the unit square; points inside the quarter circle are highlighted" }) {
                    drawRect(if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFAFAFE))
                    for ((x, y) in r.piPoints) drawCircle(if (x * x + y * y <= 1) lab.accent else lab.axis.copy(alpha = 0.5f), 2.2f, Offset((x * size.width).toFloat(), ((1 - y) * size.height).toFloat()))
                    drawArc(lab.warning, 270f, 90f, false, topLeft = Offset(-size.width, 0f), size = Size(size.width * 2, size.height * 2), style = Stroke(3f))
                }
            } else Panel(title = r.title) {
                val maxP = r.outcomes.maxOf { max(it.count.toDouble() / r.total, it.theoretical) }.coerceAtLeast(1e-9)
                for (o in r.outcomes) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                        Text(o.label, Modifier.width(56.dp), fontFamily = MonoFamily)
                        Box(Modifier.weight(1f).height(18.dp)) {
                            Box(Modifier.fillMaxHeight().fillMaxWidth((o.count.toDouble() / r.total / maxP).toFloat().coerceIn(0f, 1f)).clip(RoundedCornerShape(6.dp)).background(lab.accent.copy(alpha = 0.8f)))
                            Box(Modifier.fillMaxHeight().fillMaxWidth((o.theoretical / maxP).toFloat().coerceIn(0f, 1f)).padding(end = 0.dp)) { Box(Modifier.align(Alignment.CenterEnd).width(3.dp).fillMaxHeight().background(lab.warning)) }
                        }
                        Text("${g(o.count.toDouble() / r.total)} (${g(o.theoretical)})", Modifier.width(130.dp).padding(start = 8.dp), style = MaterialTheme.typography.bodySmall, fontFamily = MonoFamily)
                    }
                }
                Text("Bars: observed frequency · amber tick: theoretical probability (in parentheses)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// =============================== Number theory ===============================

class NumberTheoryViewModel(private val c: AppContainer) : ViewModel() {
    var op by mutableStateOf("Analyze n")
    var n by mutableStateOf("360")
    var a by mutableStateOf("252"); var b by mutableStateOf("198"); var m by mutableStateOf("17")
    var residues by mutableStateOf("2, 3, 2"); var moduli by mutableStateOf("3, 5, 7")
    var seq by mutableStateOf("fibonacci"); var count by mutableStateOf("20")
    val out = computation<List<Pair<String, String>>>()

    fun setInitial(s: String) { if (s.isNotBlank()) n = s }
    private fun big(s: String, what: String = "number"): BigInteger = s.trim().replace("_", "").replace(" ", "").toBigIntegerOrNull() ?: throw MathError("Enter an integer for $what")

    fun run() {
        val o = op
        out.run(timeoutMs = 15_000, onOk = { rows -> c.history.add(Kind.NUMBER, if (o == "Analyze n") n else "$o: $a, $b", rows.take(3).joinToString("; ") { "${it.first}: ${it.second}" }) }) {
            when (o) {
                "Analyze n" -> {
                    val x = big(n, "n"); if (x.bitLength() > 400) throw MathError("Limited to numbers below 2⁴⁰⁰")
                    val rows = ArrayList<Pair<String, String>>()
                    val ax = x.abs()
                    rows += "Digits" to ax.toString().length.toString()
                    rows += "Prime?" to (if (ax < BigInteger.TWO) "no" else if (NumberTheory.isPrime(ax)) (if (NumberTheory.isPrimeDeterministic(ax)) "yes (proven, deterministic Miller–Rabin)" else "yes (probable prime: Miller–Rabin, error < 4⁻⁴⁰)") else "no")
                    if (ax > BigInteger.ONE) {
                        val f = NumberTheory.factorize(ax, 8000)
                        rows += "Factorization" to f.joinToString(" · ") { (p, k) -> if (k == 1) "$p" else "$p^$k" }
                        if (f.size == 1 && f[0].second == 1) {} else if (f.any { !NumberTheory.isPrime(it.first) }) rows += "Note" to "Some factors could not be split within the time limit"
                        if (ax.bitLength() < 64) {
                            val d = NumberTheory.divisors(ax)
                            rows += "Divisors (${d.size})" to (if (d.size <= 64) d.joinToString(", ") else d.take(64).joinToString(", ") + " …")
                            rows += "Sum of divisors σ(n)" to d.fold(BigInteger.ZERO) { s, v -> s + v }.toString()
                            val proper = d.fold(BigInteger.ZERO) { s, v -> s + v } - ax
                            rows += "Classification" to when (proper.compareTo(ax)) { 0 -> "perfect"; 1 -> "abundant"; else -> "deficient" }
                        }
                        rows += "Euler φ(n)" to NumberTheory.eulerPhi(ax).toString()
                    }
                    rows += "Next prime" to NumberTheory.nextPrime(ax).toString()
                    rows += "Binary" to ax.toString(2).let { if (it.length > 128) it.take(128) + "…" else it }
                    rows += "Hexadecimal" to ax.toString(16).uppercase()
                    rows += "Digit sum" to ax.toString().sumOf { it - '0' }.toString()
                    rows
                }
                "GCD & LCM" -> {
                    val x = big(a, "a"); val y = big(b, "b")
                    val (gg, s, t) = NumberTheory.extendedGcd(x, y)
                    listOf("gcd(a, b)" to NumberTheory.gcd(x, y).toString(), "lcm(a, b)" to NumberTheory.lcm(x, y).toString(), "Bézout" to "$s·($x) + $t·($y) = $gg") +
                        NumberTheory.euclidSteps(x.abs(), y.abs()).mapIndexed { i, st -> "Step ${i + 1}" to "${st.a} = ${st.q}·${st.b} + ${st.r}" }
                }
                "Modular" -> {
                    val x = big(a, "a"); val e = big(b, "b"); val mod = big(m, "m"); if (mod.signum() <= 0) throw MathError("Modulus must be positive")
                    val rows = arrayListOf("a mod m" to x.mod(mod).toString(), "a^b mod m" to (if (e.signum() >= 0) NumberTheory.modPow(x, e, mod).toString() else "negative exponent: uses the inverse"),
                        "(a + b) mod m" to (x + e).mod(mod).toString(), "(a · b) mod m" to (x * e).mod(mod).toString())
                    rows += "a⁻¹ mod m" to runCatching { NumberTheory.modInverse(x, mod).toString() }.getOrElse { "does not exist (gcd(a, m) ≠ 1)" }
                    rows
                }
                "CRT" -> {
                    val r = residues.split(',', ' ').filter { it.isNotBlank() }.map { big(it, "residue") }; val md = moduli.split(',', ' ').filter { it.isNotBlank() }.map { big(it, "modulus") }
                    if (r.size != md.size || r.isEmpty()) throw MathError("Give the same number of residues and moduli")
                    val res = NumberTheory.crt(r, md)
                    if (res == null) listOf("Result" to "No solution: the congruences are inconsistent")
                    else listOf("x ≡" to "${res.first} (mod ${res.second})") + r.indices.map { "check x mod ${md[it]}" to res.first.mod(md[it]).toString() }
                }
                "Sequences" -> { val k = count.trim().toIntOrNull()?.coerceIn(1, 300) ?: 20; listOf(seq to NumberTheory.sequence(seq, k).joinToString(", ")) }
                "Counting" -> {
                    val nn = big(a, "n").toInt(); val kk = big(b, "k").toInt()
                    if (nn < 0 || kk < 0 || nn > 5000) throw MathError("Use 0 ≤ n ≤ 5000 and k ≥ 0")
                    listOf("C(n, k)" to NumberTheory.binomial(nn, kk).toString(), "P(n, k)" to NumberTheory.permutations(nn, kk).toString(), "n!" to com.quantumath.math.eval.BigMath.factorial(nn).toString().let { if (it.length > 400) it.take(400) + "… (${it.length} digits)" else it })
                }
                else -> { val x = big(n, "n"); val d = big(m, "d").toInt(); listOf("Divisibility of $x by $d" to NumberTheory.divisibilityExplanation(x, d)) }
            }
        }
    }
}

@Composable
fun NumberTheoryScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { NumberTheoryViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial) }
    val out by vm.out.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Number theory", onBack = { nav.popBackStack() }, subtitle = "Arbitrary-size integers")
        ScreenColumn {
            ChipRow(listOf("Analyze n", "GCD & LCM", "Modular", "CRT", "Sequences", "Counting", "Divisibility"), vm.op, { vm.op = it; vm.out.clear() }, { it })
            when (vm.op) {
                "Analyze n" -> NumberField("n", vm.n, { vm.n = it }, Modifier.fillMaxWidth(), decimal = false)
                "GCD & LCM" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField("a", vm.a, { vm.a = it }, Modifier.weight(1f)); NumberField("b", vm.b, { vm.b = it }, Modifier.weight(1f)) }
                "Modular" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField("a", vm.a, { vm.a = it }, Modifier.weight(1f)); NumberField("b (exponent)", vm.b, { vm.b = it }, Modifier.weight(1f)); NumberField("m", vm.m, { vm.m = it }, Modifier.weight(1f)) }
                "CRT" -> { NumberField("Residues aᵢ", vm.residues, { vm.residues = it }, Modifier.fillMaxWidth()); NumberField("Moduli mᵢ", vm.moduli, { vm.moduli = it }, Modifier.fillMaxWidth(), supporting = "Solves x ≡ aᵢ (mod mᵢ); moduli need not be coprime") }
                "Sequences" -> {
                    ChipRow(listOf("fibonacci", "lucas", "primes", "squares", "cubes", "triangular", "factorials", "catalan", "powers2", "collatz", "perfect"), vm.seq, { vm.seq = it }, { it.replaceFirstChar { c -> c.uppercase() } })
                    NumberField("Terms", vm.count, { vm.count = it }, Modifier.fillMaxWidth(), decimal = false)
                }
                "Counting" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField("n", vm.a, { vm.a = it }, Modifier.weight(1f)); NumberField("k", vm.b, { vm.b = it }, Modifier.weight(1f)) }
                else -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { NumberField("n", vm.n, { vm.n = it }, Modifier.weight(1f)); NumberField("divisor d (2–13)", vm.m, { vm.m = it }, Modifier.weight(1f)) }
            }
            PrimaryButton("Compute", vm::run, Modifier.fillMaxWidth())
            OutcomeView(out) { rows -> Panel(title = vm.op) { rows.forEach { (k, v) -> KeyValue(k, v) } } }
        }
    }
}

// =============================== Complex ===============================

data class ComplexOut(val input: String, val z: Complex, val roots: List<Complex>, val n: Int)

class ComplexViewModel(private val c: AppContainer) : ViewModel() {
    var input by mutableStateOf("(3 + 4i)(1 - 2i)")
    var n by mutableStateOf("3")
    val out = computation<ComplexOut>()
    fun setInitial(s: String) { if (s.isNotBlank()) input = s }
    fun run() {
        val t = input; val k = n.trim().toIntOrNull()?.coerceIn(1, 24) ?: 3
        val deg = c.settings.value.degrees
        out.run(onOk = { r -> c.history.add(Kind.COMPLEX, t, r.z.format(12)) }) {
            val z = ComplexEvaluator.eval(Parser.parse(t, complexMode = true), if (deg) AngleMode.DEGREES else AngleMode.RADIANS).clean()
            if (!z.re.isFinite() || !z.im.isFinite()) throw MathError("The result is not a finite complex number")
            ComplexOut(t, z, if (z.modulus == 0.0) emptyList() else z.roots(k).map { it.clean() }, k)
        }
    }
    fun setPoint(re: Double, im: Double) { input = "${g(re)} ${if (im < 0) "-" else "+"} ${g(abs(im))}i"; run() }
    fun save() { val r = (out.state.value as? com.quantumath.app.util.Outcome.Ok)?.value ?: return; c.saveNote(Note(title = r.input, kind = Kind.COMPLEX, input = r.input, result = "${r.z.format(12)} = ${r.z.formatPolar()}")) }
}

@Composable
fun ComplexScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { ComplexViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial); vm.run() }
    val out by vm.out.state.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Complex numbers", onBack = { nav.popBackStack() })
        ScreenColumn {
            ExprInput(vm.input, { vm.input = it }, label = "Complex expression", placeholder = "e^(i pi/3) * 2", keys = listOf("i", "^", "(", ")", "√", "π", "e", "abs", "arg", "conj", "re", "im", "ln", "sin"), onDone = vm::run)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NumberField("n for n-th roots", vm.n, { vm.n = it }, Modifier.weight(1f), decimal = false)
                PrimaryButton("Evaluate", vm::run, Modifier.weight(1f).padding(top = 8.dp))
            }
            ExampleChips(listOf("(3+4i)(1-2i)", "(1+i)^8", "e^(i*pi)", "sqrt(-16)", "i^i", "(2+3i)/(1-i)", "ln(-1)", "conj(5-2i)"), { vm.input = it; vm.run() })
            OutcomeView(out) { r ->
                ResultPanel("z", r.z.format(12), secondary = "polar: ${r.z.formatPolar()}", onSave = vm::save)
                Panel(title = "Properties") {
                    KeyValue("Re z / Im z", "${g(r.z.re)} / ${g(r.z.im)}"); KeyValue("|z|", g(r.z.modulus))
                    KeyValue("arg z", "${g(r.z.argument)} rad = ${g(Math.toDegrees(r.z.argument))}°"); KeyValue("conjugate z̄", r.z.conj().format(10))
                    KeyValue("1/z", runCatching { (Complex(1.0) / r.z).clean().format(10) }.getOrElse { "undefined" }); KeyValue("z²", (r.z * r.z).clean().format(10))
                    KeyValue("e^z", r.z.exp().clean().format(10))
                }
                Panel(title = "Argand plane — tap to place z", icon = Icons.Outlined.Adjust) {
                    val all = listOf(r.z, r.z.conj()) + r.roots
                    val ext = max(1.5, all.maxOf { max(abs(it.re), abs(it.im)) } * 1.3)
                    val vp = Viewport(-ext, ext, -ext, ext)
                    Canvas(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(16.dp))
                        .pointerInput(ext) { detectTapGestures { o -> val m = Mapper(vp, size.width.toFloat(), size.height.toFloat()); vm.setPoint(m.wx(o.x), m.wy(o.y)) } }
                        .semantics { contentDescription = "Argand diagram showing z, its conjugate and its ${r.n}-th roots" }) {
                        drawRect(if (lab.dark) Color(0xFF0A0A10) else Color(0xFFFCFCFF))
                        val m = Mapper(vp, size.width, size.height)
                        drawGrid(m, lab, tm)
                        val o = Offset(m.sx(0.0), m.sy(0.0))
                        if (r.roots.isNotEmpty()) {
                            val rr = r.roots[0].modulus
                            drawCircle(lab.accent2.copy(alpha = 0.5f), (rr / vp.width * size.width).toFloat(), o, style = Stroke(1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))))
                            for ((i, w) in r.roots.withIndex()) { val p = Offset(m.sx(w.re), m.sy(w.im)); drawCircle(lab.accent2, 7f, p); drawTextSafe(tm, "w${sub(i)}", p + Offset(8f, -20f), TextStyle(fontSize = 10.sp, color = lab.accent2)) }
                        }
                        val zc = r.z.conj()
                        drawLine(lab.axis.copy(alpha = 0.5f), o, Offset(m.sx(zc.re), m.sy(zc.im)), 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f)))
                        drawCircle(lab.axis, 6f, Offset(m.sx(zc.re), m.sy(zc.im)))
                        val p = Offset(m.sx(r.z.re), m.sy(r.z.im))
                        drawLine(lab.accent, o, p, 3.5f); drawCircle(lab.accent.copy(alpha = 0.3f), 18f, p); drawCircle(lab.accent, 9f, p)
                        drawTextSafe(tm, "z", p + Offset(10f, -26f), TextStyle(fontSize = 13.sp, color = lab.accent)); drawTextSafe(tm, "z̄", Offset(m.sx(zc.re), m.sy(zc.im)) + Offset(10f, 4f), TextStyle(fontSize = 12.sp, color = lab.axis))
                    }
                    if (r.roots.isNotEmpty()) Text("${r.n}-th roots: " + r.roots.joinToString("; ") { it.format(6) }, style = MaterialTheme.typography.bodySmall, fontFamily = MonoFamily, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                }
            }
            InfoPanel("Uses the principal branch: arg z ∈ (−π, π], ln and powers are principal values. Results within 10⁻¹² of zero are cleaned to 0.")
        }
    }
}
