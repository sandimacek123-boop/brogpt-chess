package com.quantumath.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.data.Kind
import com.quantumath.app.data.Note
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.nav.openTool
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.util.computation
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.Evaluator
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import com.quantumath.math.expr.Relation
import com.quantumath.math.linalg.Matrix
import com.quantumath.math.plot.Viewport
import com.quantumath.math.symbolic.*
import kotlin.math.abs
import kotlin.math.max

fun pu(e: Expr) = Printer.print(e, unicode = true)

/** Parses a bound such as "2", "pi/2", "-inf", "∞". */
fun parseBound(s: String): Double {
    val t = s.trim().lowercase().replace("∞", "inf").replace("−", "-")
    return when (t) {
        "inf", "+inf", "infinity", "oo" -> Double.POSITIVE_INFINITY
        "-inf", "-infinity", "-oo" -> Double.NEGATIVE_INFINITY
        "" -> throw MathError("Enter a value")
        else -> Evaluator().eval(Parser.parse(t))
    }
}

fun splitRelations(text: String): List<String> = text.split('\n', ';').map { it.trim() }.filter { it.isNotEmpty() }

// =============================== Solver ===============================

sealed interface SolverOut {
    data class Single(val input: String, val r: SolveResult) : SolverOut
    data class System(val input: String, val r: SystemSolver.Result) : SolverOut
}

class SolverViewModel(private val c: AppContainer) : ViewModel() {
    var input by mutableStateOf("")
    var variable by mutableStateOf("")
    val out = computation<SolverOut>()

    fun solve() {
        val text = input.trim()
        if (text.isEmpty()) return
        val v = variable.trim().ifEmpty { null }
        out.run(onOk = { o ->
            c.history.add(Kind.SOLVE, text, summary(o)); c.unlock("first-solve")
        }) {
            val parts = splitRelations(text)
            if (parts.size > 1) {
                val rels = parts.map { Parser.parseRelation(it) }
                SolverOut.System(text, SystemSolver.solve(rels))
            } else {
                val rel = if (parts[0].any { it in "=<>≤≥" }) Parser.parseRelation(parts[0]) else Parser.parseRelation(parts[0] + " = 0")
                SolverOut.Single(text, Solver.solve(rel, v))
            }
        }
    }

    fun summary(o: SolverOut): String = when (o) {
        is SolverOut.Single -> solutionText(o.r)
        is SolverOut.System -> systemText(o.r)
    }

    fun save() {
        val o = (out.state.value as? com.quantumath.app.util.Outcome.Ok)?.value ?: return
        val i = when (o) { is SolverOut.Single -> o.input; is SolverOut.System -> o.input }
        c.saveNote(Note(title = i.lines().first(), kind = Kind.SOLVE, input = i, result = summary(o)))
    }
}

fun solutionText(r: SolveResult): String = when {
    r.unsupported != null -> "Not solved: ${r.unsupported}"
    r.identity -> "True for every ${r.variable.ifEmpty { "value" }} in the domain"
    r.generalSolution.isNotEmpty() -> r.generalSolution.joinToString(";  ")
    r.solutions.isEmpty() && r.complexSolutions.isEmpty() -> "No real solution"
    r.solutions.isEmpty() -> "No real solution"
    r.method.startsWith("Sign chart") || r.solutions.any { it.display.contains("∈") || it.display.contains("<") || it.display.contains(">") } -> r.solutions.joinToString("  ∪  ") { it.display }
    else -> r.solutions.joinToString(",  ") { "${r.variable} = ${it.display}" }
}

fun systemText(r: SystemSolver.Result): String = when (val s = r.solution) {
    is Matrix.SystemSolution.Unique -> r.variables.zip(s.x).joinToString(",  ") { (v, x) -> "$v = $x" }
    is Matrix.SystemSolution.Infinite -> "Infinitely many solutions (${s.freeVariables.size} free variable${if (s.freeVariables.size > 1) "s" else ""})"
    Matrix.SystemSolution.None -> "No solution (inconsistent system)"
    null -> r.numeric?.let { n -> r.variables.zip(n).joinToString(",  ") { (v, x) -> "$v ≈ ${LimitSolver.fmt(x)}" } } ?: r.message
}

@Composable
fun SolverScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { SolverViewModel(it) }
    LaunchedEffect(initial) { if (initial.isNotBlank() && vm.input.isEmpty()) { vm.input = initial; vm.solve() } }
    val out by vm.out.state.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Equation solver", onBack = { nav.popBackStack() }, subtitle = "Equations · inequalities · systems")
        ScreenColumn {
            ExprInput(vm.input, { vm.input = it }, label = "Equation, inequality or system", placeholder = "x^2 - 5x + 6 = 0", singleLine = false, keys = EquationKeys,
                supporting = "One relation per line (or separated by ;) solves a system.")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumberField("Variable (optional)", vm.variable, { vm.variable = it.take(1) }, Modifier.weight(1f))
                PrimaryButton("Solve", vm::solve, Modifier.weight(1f).padding(top = 8.dp), icon = Icons.Outlined.Functions)
            }
            ExampleChips(listOf("x^2 - 5x + 6 = 0", "sqrt(x+7) = x - 5", "(x+1)/(x-2) = 3", "2sin(x) = 1", "x^3 - 6x^2 + 11x - 6 = 0", "x^2 - 4 > 0", "2^x = 32", "x + y = 5; x - y = 1", "x^4 - 5x^2 + 4 = 0", "e^x = 3x"), { vm.input = it.replace("; ", "\n"); vm.solve() })
            OutcomeView(out) { o ->
                when (o) {
                    is SolverOut.Single -> SingleResult(o, vm, nav)
                    is SolverOut.System -> {
                        ResultPanel("Solution", systemText(o.r), secondary = o.r.message, onSave = vm::save)
                        if (o.r.solution is Matrix.SystemSolution.Infinite) {
                            val s = o.r.solution as Matrix.SystemSolution.Infinite
                            Panel(title = "Parametric form") {
                                KeyValue("Particular", s.particular.joinToString(", ", "(", ")"))
                                s.basis.forEachIndexed { i, b -> KeyValue("Direction t${i + 1}", b.joinToString(", ", "(", ")")) }
                            }
                        }
                        StepsPanel(o.r.steps.map { it.rule to it.detail })
                    }
                }
            }
            InfoPanel("Exact methods: polynomials (rational roots, factoring, quadratic/cubic formulas), rational and radical equations with extraneous-root checks, isolation by inverse functions (including trig general solutions), substitution. Anything else falls back to a clearly labelled numerical search on [−100, 100].")
        }
    }
}

@Composable
private fun SingleResult(o: SolverOut.Single, vm: SolverViewModel, nav: NavHostController) {
    val r = o.r
    val lab = LocalLab.current
    val unsupported = r.unsupported
    if (unsupported != null) { ErrorPanel(unsupported); StepsPanel(r.steps.map { it.rule to it.detail }); return }
    ResultPanel(
        if (r.generalSolution.isNotEmpty()) "General solution" else "Solution${if (r.solutions.size > 1) "s" else ""}",
        solutionText(r),
        secondary = buildString {
            append(r.method.ifBlank { "" })
            if (!r.exact) append(if (isEmpty()) "Numerical approximation" else " · numerical approximation")
        }.ifBlank { null },
        onSave = vm::save,
    )
    if (r.generalSolution.isNotEmpty() && r.solutions.isNotEmpty()) Panel(title = "Solutions in [−2π, 2π]") { Text(r.solutions.joinToString(",  ") { it.display }, style = MaterialTheme.typography.bodyMedium) }
    if (r.complexSolutions.isNotEmpty()) Panel(title = "Complex solutions", icon = Icons.Outlined.Adjust) { r.complexSolutions.forEach { Text("${r.variable} = $it", style = MaterialTheme.typography.bodyLarge.copy(fontFamily = com.quantumath.app.ui.theme.MonoFamily)) } }
    if (r.domain.isNotEmpty() || r.rejected.isNotEmpty()) Panel(title = "Domain & checks", icon = Icons.Outlined.Rule) {
        r.domain.forEach { KeyValue("Requires", it) }
        r.rejected.forEach { Text("✗ Rejected: $it", color = lab.warning, style = MaterialTheme.typography.bodyMedium) }
    }
    val rel = runCatching { Parser.parseRelation(o.input.let { if (it.any { ch -> ch in "=<>≤≥" }) it else "$it = 0" }) }.getOrNull()
    if (rel != null && r.variable.isNotEmpty() && (rel.left.variables() + rel.right.variables()).size == 1) {
        val ev = Evaluator(strict = false)
        val fl = ev.function(rel.left, r.variable); val fr = ev.function(rel.right, r.variable)
        val xs = r.solutions.map { it.value }.filter { it.isFinite() }
        val lo = (xs.minOrNull() ?: -5.0); val hi = (xs.maxOrNull() ?: 5.0)
        val span = max(4.0, (hi - lo) * 1.6)
        val mid = (lo + hi) / 2
        val vp = autoViewport({ fl(it) - fr(it) }, mid - span / 2, mid + span / 2).let { v -> Viewport(v.xMin, v.xMax, minOf(v.yMin, -1.0), maxOf(v.yMax, 1.0)) }
        Panel(title = "Both sides", icon = Icons.Outlined.ShowChart, trailing = { TextButton(onClick = { nav.openTool(Kind.GRAPH, "${pu(rel.left)}\n${pu(rel.right)}".replace("−", "-").replace("·", "*")) }) { Text("Open in Graph") } }) {
            MiniPlot(listOf(PlotCurve(fl, lab.curves[0]), PlotCurve(fr, lab.curves[1])), vp, points = xs.map { PlotPoint(it, fl(it), lab.warning) }, description = "Graph of both sides; intersections are the solutions")
        }
    }
    StepsPanel(r.steps.map { it.rule to it.detail })
}

// =============================== Algebra ===============================

data class AlgebraOut(val input: String, val op: String, val transformations: List<Transformation>, val note: String? = null)

class AlgebraViewModel(private val c: AppContainer) : ViewModel() {
    var input by mutableStateOf("")
    var op by mutableStateOf("Simplify")
    var subVar by mutableStateOf("x")
    var subWith by mutableStateOf("2")
    val out = computation<AlgebraOut>()

    fun run() {
        val text = input.trim(); if (text.isEmpty()) return
        val o = op
        out.run(onOk = { r -> c.history.add(Kind.ALGEBRA, text, "${r.op}: ${pu(r.transformations.last().result)}") }) {
            val e = Parser.parse(text)
            when (o) {
                "Simplify" -> AlgebraOut(text, o, Algebra.simplify(e))
                "Expand" -> { val r = Algebra.expand(e); AlgebraOut(text, o, listOf(Transformation("Expanded form", r, "Products and integer powers multiplied out, like terms collected"))) }
                "Factor" -> AlgebraOut(text, o, Algebra.factor(e))
                "Substitute" -> {
                    val w = Parser.parse(subWith.ifBlank { "0" })
                    val r = Algebra.substitute(e, subVar.trim().ifEmpty { "x" }, w)
                    val s = Algebra.simplify(r)
                    AlgebraOut(text, o, listOf(Transformation("Substitute ${subVar} = ${pu(w)}", r, "Every occurrence replaced")) + s)
                }
                else -> { // Evaluate numerically with all variables
                    val vars = e.variables()
                    val vals = parseAssignments(subWith)
                    val missing = vars - vals.keys
                    if (missing.isNotEmpty()) throw MathError("Give values for ${missing.joinToString()} (e.g. x=2, y=3)")
                    val v = Evaluator().eval(e, vals)
                    AlgebraOut(text, o, listOf(Transformation("Value", Expr.Num(java.math.BigDecimal(v).round(java.math.MathContext(15)).stripTrailingZeros()), vals.entries.joinToString { "${it.key} = ${it.value}" })))
                }
            }
        }
    }

    fun save() {
        val r = (out.state.value as? com.quantumath.app.util.Outcome.Ok)?.value ?: return
        c.saveNote(Note(title = "${r.op}: ${r.input}", kind = Kind.ALGEBRA, input = r.input, result = pu(r.transformations.last().result)))
    }
}

fun parseAssignments(s: String): Map<String, Double> = s.split(',', ';').mapNotNull { part ->
    val kv = part.split('='); if (kv.size != 2) null else kv[0].trim() to Evaluator().eval(Parser.parse(kv[1].trim()))
}.toMap()

@Composable
fun AlgebraScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { AlgebraViewModel(it) }
    LaunchedEffect(initial) { if (initial.isNotBlank() && vm.input.isEmpty()) { vm.input = initial; vm.run() } }
    val out by vm.out.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Algebra studio", onBack = { nav.popBackStack() }, subtitle = "Exact symbolic manipulation")
        ScreenColumn {
            ExprInput(vm.input, { vm.input = it }, label = "Expression", placeholder = "(x^2 - 1)/(x - 1)", onDone = vm::run)
            ChipRow(listOf("Simplify", "Expand", "Factor", "Substitute", "Evaluate"), vm.op, { vm.op = it; if (vm.input.isNotBlank()) vm.run() }, { it })
            if (vm.op == "Substitute") Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumberField("Variable", vm.subVar, { vm.subVar = it.take(1) }, Modifier.weight(0.4f))
                NumberField("Replace with", vm.subWith, { vm.subWith = it }, Modifier.weight(1f))
            }
            if (vm.op == "Evaluate") NumberField("Values", vm.subWith, { vm.subWith = it }, Modifier.fillMaxWidth(), supporting = "e.g. x=2, y=-1")
            PrimaryButton(vm.op, vm::run, Modifier.fillMaxWidth())
            ExampleChips(listOf("(x^2-1)/(x-1)", "(x+2)^3", "x^4 - 16", "2x^2 + 7x + 3", "sin(x)^2 + cos(x)^2", "sqrt(72)", "x^3 - 8", "(a+b)^2 - (a-b)^2", "1/x + 1/(x+1)"), { vm.input = it; vm.run() })
            OutcomeView(out) { r ->
                ResultPanel(r.transformations.last().title.let { if (it == "Simplest form") "Result" else it }, pu(r.transformations.last().result), onSave = vm::save)
                StepsPanel(r.transformations.map { it.title to "${pu(it.result)}\n${it.justification}" }, title = "Transformations")
            }
            InfoPanel("Simplify combines like terms, cancels common polynomial factors (noting the excluded points), simplifies radicals and evaluates exact trig values. Factor works over the rationals (plus quadratic surds). Expressions outside these rules are returned unchanged rather than guessed.")
        }
    }
}

// =============================== Calculus ===============================

sealed interface CalcOut {
    data class Deriv(val f: Expr, val v: String, val d: Expr, val order: Int, val steps: List<Step>, val at: Double?, val valueAt: Double?) : CalcOut
    data class Integral(val f: Expr, val v: String, val anti: Integrator.Result?, val definite: Integrator.Definite?, val a: Double?, val b: Double?) : CalcOut
    data class Limit(val f: Expr, val v: String, val at: Double, val r: LimitSolver.Result) : CalcOut
    data class Study(val f: Expr, val v: String, val points: List<Analysis.CriticalPoint>, val tangent: Analysis.Tangent?, val x0: Double?, val lo: Double, val hi: Double) : CalcOut
}

class CalculusViewModel(private val c: AppContainer) : ViewModel() {
    var tab by mutableStateOf(0)
    var input by mutableStateOf("")
    var variable by mutableStateOf("x")
    var order by mutableStateOf(1)
    var point by mutableStateOf("")
    var lower by mutableStateOf("")
    var upper by mutableStateOf("")
    var limitAt by mutableStateOf("0")
    var rangeLo by mutableStateOf("-5")
    var rangeHi by mutableStateOf("5")
    val out = computation<CalcOut>()

    fun run() {
        val text = input.trim(); if (text.isEmpty()) return
        val v = variable.trim().ifEmpty { "x" }
        val t = tab
        out.run(onOk = { r -> c.history.add(Kind.CALCULUS, text, describe(r)) }) {
            val f = Parser.parse(text)
            when (t) {
                0 -> {
                    var d = f; var steps: List<Step> = emptyList()
                    for (i in 1..order) { val r = Derivative.differentiate(d, v); d = r.derivative; if (i == 1) steps = r.steps }
                    val at = point.trim().takeIf { it.isNotEmpty() }?.let { parseBound(it) }
                    CalcOut.Deriv(f, v, d, order, steps, at, at?.let { Evaluator().eval(d, mapOf(v to it)) })
                }
                1 -> {
                    val hasBounds = lower.isNotBlank() && upper.isNotBlank()
                    val anti = runCatching { Integrator.integrate(f, v) }.getOrNull()
                    if (hasBounds) { val a = parseBound(lower); val b = parseBound(upper); CalcOut.Integral(f, v, anti, Integrator.definite(f, v, a, b), a, b) }
                    else CalcOut.Integral(f, v, anti, null, null, null)
                }
                2 -> { val at = parseBound(limitAt); CalcOut.Limit(f, v, at, LimitSolver.limit(f, v, at)) }
                else -> {
                    val lo = parseBound(rangeLo); val hi = parseBound(rangeHi)
                    if (!(hi > lo) || !lo.isFinite() || !hi.isFinite()) throw MathError("Use a finite range with lower < upper")
                    val x0 = point.trim().takeIf { it.isNotEmpty() }?.let { parseBound(it) }
                    CalcOut.Study(f, v, Analysis.criticalPoints(f, v, lo, hi), x0?.let { Analysis.tangent(f, v, it) }, x0, lo, hi)
                }
            }
        }
    }

    fun describe(r: CalcOut): String = when (r) {
        is CalcOut.Deriv -> "d${if (r.order > 1) "^${r.order}" else ""}/d${r.v}: ${pu(r.d)}"
        is CalcOut.Integral -> r.definite?.let { d -> "∫ = ${d.exact?.let { pu(it) + " ≈ " } ?: ""}${LimitSolver.fmt(d.value)}" } ?: r.anti?.antiderivative?.let { "∫ = ${pu(it)} + C" } ?: "No elementary antiderivative found"
        is CalcOut.Limit -> "lim = ${r.r.display}"
        is CalcOut.Study -> "${r.points.size} critical points" + (r.tangent?.let { "; tangent ${it.equation}" } ?: "")
    }

    fun save() {
        val r = (out.state.value as? com.quantumath.app.util.Outcome.Ok)?.value ?: return
        c.saveNote(Note(title = listOf("Derivative", "Integral", "Limit", "Analysis")[tab] + ": " + input, kind = Kind.CALCULUS, input = input, result = describe(r)))
    }
}

@Composable
fun CalculusScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { CalculusViewModel(it) }
    LaunchedEffect(initial) { if (initial.isNotBlank() && vm.input.isEmpty()) { vm.input = initial; vm.run() } }
    val out by vm.out.state.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    val tabs = listOf("Derivative", "Integral", "Limit", "Analysis")
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Calculus lab", onBack = { nav.popBackStack() })
        PrimaryScrollableTabRow(selectedTabIndex = vm.tab, edgePadding = 16.dp, containerColor = MaterialTheme.colorScheme.background) {
            tabs.forEachIndexed { i, t -> Tab(selected = vm.tab == i, onClick = { vm.tab = i; vm.out.clear() }, text = { Text(t) }) }
        }
        ScreenColumn(Modifier.padding(top = 12.dp)) {
            ExprInput(vm.input, { vm.input = it }, label = "f(${vm.variable})", placeholder = listOf("x^2 sin(x)", "x e^x", "sin(x)/x", "x^3 - 3x")[vm.tab], onDone = vm::run)
            when (vm.tab) {
                0 -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NumberField("Variable", vm.variable, { vm.variable = it.take(1) }, Modifier.weight(0.6f))
                    NumberField("Evaluate at (optional)", vm.point, { vm.point = it }, Modifier.weight(1f))
                }
                1 -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NumberField("Variable", vm.variable, { vm.variable = it.take(1) }, Modifier.weight(0.6f))
                    NumberField("Lower", vm.lower, { vm.lower = it }, Modifier.weight(1f), supporting = "blank = indefinite")
                    NumberField("Upper", vm.upper, { vm.upper = it }, Modifier.weight(1f), supporting = "inf allowed")
                }
                2 -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NumberField("Variable", vm.variable, { vm.variable = it.take(1) }, Modifier.weight(0.6f))
                    NumberField("${vm.variable} →", vm.limitAt, { vm.limitAt = it }, Modifier.weight(1f), supporting = "number, pi, inf or -inf")
                }
                else -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NumberField("From", vm.rangeLo, { vm.rangeLo = it }, Modifier.weight(1f))
                    NumberField("To", vm.rangeHi, { vm.rangeHi = it }, Modifier.weight(1f))
                    NumberField("Tangent at", vm.point, { vm.point = it }, Modifier.weight(1f))
                }
            }
            if (vm.tab == 0) ChipRow((1..4).toList(), vm.order, { vm.order = it }, { if (it == 1) "f′" else if (it == 2) "f″" else "f⁽$it⁾" })
            PrimaryButton(tabs[vm.tab].let { if (it == "Analysis") "Analyse" else "Compute $it".lowercase().replaceFirstChar { c -> c.uppercase() } }, vm::run, Modifier.fillMaxWidth())
            ExampleChips(when (vm.tab) {
                0 -> listOf("x^3 - 4x", "x^2 sin(x)", "e^(2x) cos(x)", "ln(x^2+1)", "sqrt(1 + x^2)", "tan(x)/x", "x^x")
                1 -> listOf("x e^x", "1/(x^2 - 1)", "sin(x)^2", "x/(x^2+1)", "ln(x)", "e^(-x^2)", "1/(1+x^2)")
                2 -> listOf("sin(x)/x", "(x^2-4)/(x-2)", "(1+1/x)^x", "(e^x - 1)/x", "1/x", "(1 - cos(x))/x^2")
                else -> listOf("x^3 - 3x", "x^4 - 2x^2", "sin(x)", "x e^(-x)", "(x^2+1)/(x-1)")
            }, { vm.input = it; if (vm.tab == 2 && it == "(1+1/x)^x") vm.limitAt = "inf"; vm.run() })
            OutcomeView(out) { r -> CalcResultView(r, vm, lab) }
        }
    }
}

@Composable
private fun CalcResultView(r: CalcOut, vm: CalculusViewModel, lab: com.quantumath.app.ui.theme.LabColors) {
    val ev = Evaluator(strict = false)
    when (r) {
        is CalcOut.Deriv -> {
            val mark = if (r.order == 1) "′" else if (r.order == 2) "″" else "⁽${r.order}⁾"
            ResultPanel("f$mark(${r.v})", pu(r.d), secondary = r.at?.let { "f$mark(${LimitSolver.fmt(it)}) = ${LimitSolver.fmt(r.valueAt ?: Double.NaN)}" }, onSave = vm::save)
            val f = ev.function(r.f, r.v); val d = ev.function(r.d, r.v)
            val vp = autoViewport({ f(it) }, -5.0, 5.0)
            Panel(title = "f and f$mark", icon = Icons.Outlined.ShowChart) {
                MiniPlot(listOf(PlotCurve(f, lab.curves[0]), PlotCurve(d, lab.curves[1], dashed = true)), vp, points = listOfNotNull(r.at?.let { PlotPoint(it, f(it), lab.warning) }), description = "Graph of the function and its derivative")
                Text("— f   - - f$mark", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            StepsPanel(r.steps.map { it.rule to it.detail })
        }
        is CalcOut.Integral -> {
            if (r.definite != null) {
                val d = r.definite
                ResultPanel("∫ from ${LimitSolver.fmt(r.a!!)} to ${LimitSolver.fmt(r.b!!)}", d.exact?.let { "${pu(it)} ≈ ${LimitSolver.fmt(d.value)}" } ?: LimitSolver.fmt(d.value),
                    secondary = "${d.method}${if (d.exact == null) " · estimated error ${"%.1e".format(d.error)}" else ""}${if (!d.converged) " · ⚠ did not fully converge" else ""}", onSave = vm::save)
            }
            val a = r.anti
            val anti = a?.antiderivative
            if (a != null && anti != null) {
                if (r.definite == null) ResultPanel("Antiderivative", "${pu(anti)} + C", secondary = if (a.verified) "✓ Verified by differentiation" else a.message, onSave = vm::save)
                else Panel(title = "Antiderivative") { Text("${pu(anti)} + C", style = MaterialTheme.typography.bodyLarge.copy(fontFamily = com.quantumath.app.ui.theme.MonoFamily)); if (a.verified) Text("✓ Verified by differentiation", color = lab.success, style = MaterialTheme.typography.labelMedium) }
            } else if (r.definite == null) ErrorPanel(a?.message ?: "No antiderivative found with the supported rules. Give bounds to compute a definite integral numerically.")
            val f = ev.function(r.f, r.v)
            val lo = r.a?.takeIf { it.isFinite() }; val hi = r.b?.takeIf { it.isFinite() }
            val x0 = lo ?: (hi?.minus(5) ?: -5.0); val x1 = hi ?: (lo?.plus(5) ?: 5.0)
            val pad = (x1 - x0) * 0.25
            val vp = autoViewport(f, x0 - pad, x1 + pad)
            Panel(title = "Graph", icon = Icons.Outlined.AreaChart) {
                MiniPlot(listOf(PlotCurve(f, lab.curves[0])), vp, shade = if (r.definite != null) PlotShade(f, r.a!!.coerceAtLeast(vp.xMin), r.b!!.coerceAtMost(vp.xMax), lab.accent2) else null, description = "Graph of the integrand with the area shaded")
            }
            StepsPanel((a?.steps ?: emptyList()).map { it.rule to it.detail })
        }
        is CalcOut.Limit -> {
            ResultPanel("lim ${r.v}→${LimitSolver.fmt(r.at)}", r.r.display, secondary = if (r.r.exact) "Analytic" else "Numerical estimate", onSave = vm::save)
            val f = ev.function(r.f, r.v)
            val c = if (r.at.isFinite()) r.at else 0.0
            val w = if (r.at.isFinite()) 3.0 else 40.0
            val x0 = if (r.at == Double.NEGATIVE_INFINITY) -w else c - w
            val x1 = if (r.at == Double.POSITIVE_INFINITY) w else c + w
            Panel(title = "Behaviour near the point", icon = Icons.Outlined.ShowChart) {
                MiniPlot(listOf(PlotCurve(f, lab.curves[0])), autoViewport(f, x0, x1), points = listOfNotNull(r.r.value?.takeIf { r.at.isFinite() && it.isFinite() }?.let { PlotPoint(r.at, it, lab.warning, "limit") }), description = "Graph near the limit point")
            }
            StepsPanel(r.r.steps.map { it.rule to it.detail })
        }
        is CalcOut.Study -> {
            val f = ev.function(r.f, r.v)
            ResultPanel("Critical points", if (r.points.isEmpty()) "None in [${LimitSolver.fmt(r.lo)}, ${LimitSolver.fmt(r.hi)}]" else r.points.joinToString("\n") { "${it.kind} at (${LimitSolver.fmt(it.x)}, ${LimitSolver.fmt(it.y)})" },
                secondary = r.tangent?.let { "Tangent at ${r.v} = ${LimitSolver.fmt(r.x0!!)}: ${it.equation}" }, onSave = vm::save)
            val vp = autoViewport(f, r.lo, r.hi)
            val segs = r.tangent?.let { t -> listOf(PlotSegment(vp.xMin, t.slope * vp.xMin + t.intercept, vp.xMax, t.slope * vp.xMax + t.intercept, lab.warning)) } ?: emptyList()
            Panel(title = "Graph", icon = Icons.Outlined.ShowChart) {
                MiniPlot(listOf(PlotCurve(f, lab.curves[0])), vp, points = r.points.map { PlotPoint(it.x, it.y, lab.accent2, it.kind) } + listOfNotNull(r.x0?.let { PlotPoint(it, f(it), lab.warning) }), segments = segs, description = "Graph with critical points and tangent line")
            }
            r.tangent?.let { t -> Panel(title = "Tangent line") { KeyValue("Slope f′(x₀)", LimitSolver.fmt(t.slope)); KeyValue("f(x₀)", LimitSolver.fmt(t.y0)); KeyValue("Equation", t.equation) } }
        }
    }
}
