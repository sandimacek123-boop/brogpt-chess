package com.quantumath.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.container
import com.quantumath.app.data.Kind
import com.quantumath.app.data.Note
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.nav.openTool
import com.quantumath.app.ui.theme.LocalHaptics
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.Share
import com.quantumath.app.util.computeLimited
import com.quantumath.app.util.friendlyError
import com.quantumath.math.complex.ComplexEvaluator
import com.quantumath.math.core.DomainError
import com.quantumath.math.core.MathError
import com.quantumath.math.core.Rational
import com.quantumath.math.eval.AngleMode
import com.quantumath.math.eval.BigEvaluator
import com.quantumath.math.eval.RationalEval
import com.quantumath.math.expr.Expr
import com.quantumath.math.expr.Parser
import com.quantumath.math.expr.Printer
import com.quantumath.math.format.NumberFormatter
import com.quantumath.math.format.NumberStyle
import com.quantumath.math.symbolic.Algebra
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.math.BigDecimal

data class CalcResult(val input: String, val decimal: String, val exact: String?, val fraction: String?, val note: String?, val value: BigDecimal?)

data class CalcUi(
    val expr: String = "",
    val cursor: Int = 0,
    val preview: String = "",
    val result: CalcResult? = null,
    val error: String? = null,
    val busy: Boolean = false,
    val second: Boolean = false,
    val memory: BigDecimal = BigDecimal.ZERO,
    val ans: BigDecimal = BigDecimal.ZERO,
    val systemKeyboard: Boolean = false,
)

class CalculatorViewModel(private val c: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow(CalcUi())
    val ui: StateFlow<CalcUi> = _ui.asStateFlow()
    val history = c.db.history().byKind(Kind.CALC, 60).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private var previewJob: Job? = null
    private var evalJob: Job? = null
    private val names = setOf("ans", "M")

    fun setInitial(s: String) { if (s.isNotBlank() && _ui.value.expr.isEmpty()) setExpr(s, s.length) }

    fun setExpr(s: String, cursor: Int = s.length) {
        _ui.update { it.copy(expr = s, cursor = cursor.coerceIn(0, s.length), error = null) }
        schedulePreview()
    }

    fun insert(t: String) {
        val u = _ui.value
        var text = t
        // a leading operator after "=" continues from ans
        val base = if (u.result != null && u.expr == u.result.input && text.firstOrNull()?.let { it in "+-*/^!%" } == true) { "ans" } else null
        if (u.result != null && u.expr == u.result.input && base == null) { setExpr(text, text.length.let { if (text.endsWith("()")) it - 1 else it }); _ui.update { it.copy(result = null) }; return }
        if (base != null) { setExpr(base + text, base.length + text.length); _ui.update { it.copy(result = null) }; return }
        val e = u.expr.substring(0, u.cursor) + text + u.expr.substring(u.cursor)
        val cur = u.cursor + if (text.endsWith("()")) text.length - 1 else text.length
        setExpr(e, cur)
    }

    fun backspace() {
        val u = _ui.value
        if (u.cursor == 0) return
        // delete whole function names like "sin(" at once
        val before = u.expr.substring(0, u.cursor)
        val fn = Regex("(asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|ln|log|sqrt|cbrt|abs|exp|nCr|nPr|ans)\\($|ans$").find(before)
        val n = fn?.value?.length ?: 1
        setExpr(u.expr.removeRange(u.cursor - n, u.cursor), u.cursor - n)
    }
    fun clear() { _ui.update { it.copy(expr = "", cursor = 0, preview = "", result = null, error = null) } }
    fun move(d: Int) = _ui.update { it.copy(cursor = (it.cursor + d).coerceIn(0, it.expr.length)) }
    fun toggleSecond() = _ui.update { it.copy(second = !it.second) }
    fun toggleKeyboard() = _ui.update { it.copy(systemKeyboard = !it.systemKeyboard) }
    fun toggleAngle() = viewModelScope.launch { c.settingsRepo.update { it.copy(degrees = !it.degrees) }; schedulePreview() }

    fun memory(op: String) {
        val u = _ui.value
        val v = u.result?.value ?: u.ans
        _ui.update {
            when (op) {
                "MC" -> it.copy(memory = BigDecimal.ZERO)
                "M+" -> it.copy(memory = it.memory + v)
                "M−" -> it.copy(memory = it.memory - v)
                "MS" -> it.copy(memory = v)
                else -> it
            }
        }
        if (op == "MR") insert("M")
        else c.messages.tryEmit("Memory = ${fmt().format(_ui.value.memory)}")
    }

    private fun fmt(): NumberFormatter {
        val s = c.settings.value
        return NumberFormatter(significant = s.precision, style = runCatching { NumberStyle.valueOf(s.numberStyle) }.getOrDefault(NumberStyle.AUTO), grouping = s.grouping)
    }

    private fun schedulePreview() {
        previewJob?.cancel()
        val expr = _ui.value.expr
        if (expr.isBlank()) { _ui.update { it.copy(preview = "") }; return }
        previewJob = viewModelScope.launch {
            delay(220)
            val p = try { computeLimited(2500) { compute(expr, quick = true).decimal } } catch (e: CancellationException) { throw e } catch (_: Throwable) { "" }
            _ui.update { if (it.expr == expr) it.copy(preview = p) else it }
        }
    }

    fun evaluate() {
        val expr = _ui.value.expr
        if (expr.isBlank()) return
        evalJob?.cancel(); previewJob?.cancel()
        _ui.update { it.copy(busy = true, error = null) }
        evalJob = viewModelScope.launch {
            try {
                val r = computeLimited(20_000) { compute(expr, quick = false) }
                _ui.update { it.copy(result = r, busy = false, ans = r.value ?: it.ans, preview = "") }
                c.history.add(Kind.CALC, expr, listOfNotNull(r.exact, r.decimal).joinToString(" = "))
                c.unlock("first-calc")
            } catch (e: CancellationException) { throw e } catch (e: Throwable) {
                _ui.update { it.copy(error = friendlyError(e), busy = false) }
            }
        }
    }

    private fun compute(expr: String, quick: Boolean): CalcResult {
        val s = c.settings.value
        val u = _ui.value
        val angle = if (s.degrees) AngleMode.DEGREES else AngleMode.RADIANS
        val e = Parser.parse(expr, names)
        val env = mapOf("ans" to u.ans, "M" to u.memory)
        val f = fmt()
        return try {
            val v = BigEvaluator(if (quick) minOf(s.precision, 20) else s.precision, angle, env).eval(e)
            var fraction: String? = null; var exact: String? = null
            if (!quick && s.exactResults) {
                val rEnv = env.mapValues { Rational.of(it.value) }
                RationalEval.tryEval(e, rEnv)?.let { r -> if (!r.isInteger && r.den.bitLength() < 200) fraction = "${r.num}/${r.den}" }
                if (fraction == null && !e.containsVar("ans") && !e.containsVar("M") && angle == AngleMode.RADIANS) {
                    runCatching { Algebra.simplify(e).last().result }.getOrNull()?.let { ex ->
                        val p = Printer.print(ex, unicode = true)
                        if (!isPlainNumber(ex) && p.length < 60) exact = p
                    }
                }
            }
            CalcResult(expr, f.format(v), exact, fraction, null, v)
        } catch (err: MathError) {
            if (err is DomainError || err.message?.contains("Unknown variable 'i'") == true || err.message?.contains("complex", true) == true) {
                val z = ComplexEvaluator.eval(Parser.parse(expr.replace("ans", "(${u.ans.toPlainString()})").replace("M", "(${u.memory.toPlainString()})"), complexMode = true), angle).clean()
                if (z.im != 0.0 && z.re.isFinite() && z.im.isFinite()) return CalcResult(expr, z.format(minOf(s.precision, 15)), null, null, "Complex result (no real value)", null)
            }
            throw err
        }
    }

    private fun isPlainNumber(e: Expr): Boolean = when (e) {
        is Expr.Num, is Expr.Frac -> true
        is Expr.Neg -> isPlainNumber(e.arg)
        else -> false
    }

    fun saveToNotebook() {
        val r = _ui.value.result ?: return
        c.saveNote(Note(title = r.input, kind = Kind.CALC, input = r.input, result = listOfNotNull(r.exact, r.fraction, r.decimal).joinToString(" = ")))
    }
}

private val pretty = mapOf('*' to '×', '/' to '÷', '-' to '−')
private fun prettyExpr(s: String) = buildString { for (ch in s) append(pretty[ch] ?: ch) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorScreen(nav: NavHostController, initial: String) {
    val vm = appViewModel { CalculatorViewModel(it) }
    LaunchedEffect(initial) { vm.setInitial(initial) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val settings by ctx.container.settings.collectAsStateWithLifecycle()
    var showHistory by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        LabTopBar("Calculator", subtitle = "${settings.precision} significant digits · ${if (settings.degrees) "DEG" else "RAD"}", actions = {
            IconButton(onClick = { nav.navigate("solver") }) { Icon(Icons.Outlined.Functions, "Open equation solver") }
            IconButton(onClick = { showHistory = true }) { Icon(Icons.Outlined.History, "Calculation history") }
            IconButton(onClick = vm::toggleKeyboard) { Icon(if (ui.systemKeyboard) Icons.Outlined.Dialpad else Icons.Outlined.Keyboard, if (ui.systemKeyboard) "Use calculator keypad" else "Use system keyboard") }
        })
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val landscape = maxWidth > maxHeight * 1.15f
            if (landscape) Row(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Display(ui, vm, Modifier.weight(1f).fillMaxHeight(), settings.degrees, nav)
                Keypad(ui, vm, Modifier.weight(1.2f).fillMaxHeight(), settings.degrees)
            } else Column(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Display(ui, vm, Modifier.weight(0.8f).fillMaxWidth(), settings.degrees, nav)
                Keypad(ui, vm, Modifier.weight(1.45f).fillMaxWidth(), settings.degrees)
            }
        }
    }
    if (showHistory) ModalBottomSheet(onDismissRequest = { showHistory = false }) {
        Text("History", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 20.dp))
        if (history.isEmpty()) EmptyState(Icons.Outlined.History, "No calculations yet", "Results you evaluate appear here.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.heightIn(max = 520.dp)) {
            items(history, key = { it.id }) { h -> HistoryRow(h, onClick = { vm.setExpr(h.input); showHistory = false }) }
        }
    }
}

@Composable
private fun Display(ui: CalcUi, vm: CalculatorViewModel, modifier: Modifier, degrees: Boolean, nav: NavHostController) {
    val lab = LocalLab.current
    val ctx = LocalContext.current
    Surface(modifier, shape = RoundedCornerShape(24.dp), color = lab.panel, border = BorderStroke(1.dp, lab.panelBorder)) {
        Column(Modifier.padding(16.dp).fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AssistChip(onClick = vm::toggleAngle, label = { Text(if (degrees) "DEG" else "RAD") }, modifier = Modifier.semantics { contentDescription = "Angle mode ${if (degrees) "degrees" else "radians"}, tap to switch" })
                Spacer(Modifier.width(8.dp))
                if (ui.memory.signum() != 0) Text("M", color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                ui.result?.let { r ->
                    IconButton(onClick = { Share.copy(ctx, "Result", r.decimal) }) { Icon(Icons.Outlined.ContentCopy, "Copy result") }
                    IconButton(onClick = { Share.text(ctx, "${r.input} = ${listOfNotNull(r.exact, r.fraction, r.decimal).joinToString(" = ")}") }) { Icon(Icons.Outlined.Share, "Share result") }
                    IconButton(onClick = vm::saveToNotebook) { Icon(Icons.Outlined.BookmarkAdd, "Save to notebook") }
                }
            }
            Column(Modifier.fillMaxWidth().weight(1f, fill = false), horizontalAlignment = Alignment.End) {
                if (ui.systemKeyboard) {
                    OutlinedTextField(ui.expr, { vm.setExpr(it) }, Modifier.fillMaxWidth(), textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = MonoFamily, textAlign = TextAlign.End),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { vm.evaluate() }), label = { Text("Expression") })
                } else {
                    val shown = prettyExpr(ui.expr)
                    val cursorColor = MaterialTheme.colorScheme.primary
                    Text(buildAnnotatedString {
                        append(shown.substring(0, ui.cursor.coerceAtMost(shown.length)))
                        withStyle(SpanStyle(color = cursorColor, fontWeight = FontWeight.Light)) { append("│") }
                        append(shown.substring(ui.cursor.coerceAtMost(shown.length)))
                    }, style = MaterialTheme.typography.headlineSmall.copy(fontFamily = MonoFamily, fontSize = if (ui.expr.length > 28) 20.sp else 26.sp), textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState(), reverseScrolling = true).semantics { contentDescription = "Expression: ${ui.expr.ifEmpty { "empty" }}" })
                }
                Spacer(Modifier.height(8.dp))
                when {
                    ui.busy -> LinearProgressIndicator(Modifier.fillMaxWidth())
                    ui.error != null -> Column(horizontalAlignment = Alignment.End) {
                        Text(ui.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.End, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        if (Regex("(?<![a-z])x(?![a-z])").containsMatchIn(ui.expr)) Row {
                            TextButton(onClick = { nav.openTool(Kind.GRAPH, ui.expr) }) { Text("Graph y = …") }
                            TextButton(onClick = { nav.openTool(Kind.SOLVE, if (ui.expr.contains('=')) ui.expr else ui.expr + " = 0") }) { Text("Solve = 0") }
                        }
                    }
                    ui.result != null -> {
                        val r = ui.result
                        Column(horizontalAlignment = Alignment.End, modifier = Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }) {
                            Text("= " + r.decimal, style = MaterialTheme.typography.headlineMedium.copy(fontFamily = MonoFamily, fontSize = if (r.decimal.length > 22) 22.sp else 32.sp), color = MaterialTheme.colorScheme.onSurface, textAlign = TextAlign.End,
                                modifier = Modifier.horizontalScroll(rememberScrollState()))
                            r.fraction?.let { Text("= $it", color = MaterialTheme.colorScheme.secondary, fontFamily = MonoFamily) }
                            r.exact?.let { Text("exact: $it", color = MaterialTheme.colorScheme.secondary, fontFamily = MonoFamily) }
                            r.note?.let { Text(it, color = lab.warning, style = MaterialTheme.typography.labelMedium) }
                        }
                    }
                    ui.preview.isNotEmpty() -> Text(ui.preview, style = MaterialTheme.typography.titleLarge.copy(fontFamily = MonoFamily), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.End)
                }
            }
        }
    }
}

private data class K(val label: String, val insert: String? = null, val action: (() -> Unit)? = null, val kind: Int = 0, val desc: String = label)

@Composable
private fun Keypad(ui: CalcUi, vm: CalculatorViewModel, modifier: Modifier, degrees: Boolean) {
    val s = ui.second
    val memRow = listOf(
        K("2nd", action = vm::toggleSecond, kind = if (s) 3 else 1, desc = "Second function layer"),
        K("MC", action = { vm.memory("MC") }, kind = 1, desc = "Memory clear"), K("MR", action = { vm.memory("MR") }, kind = 1, desc = "Memory recall"),
        K("M+", action = { vm.memory("M+") }, kind = 1, desc = "Add to memory"), K("M−", action = { vm.memory("M−") }, kind = 1, desc = "Subtract from memory"),
        K("MS", action = { vm.memory("MS") }, kind = 1, desc = "Store in memory"), K("◀", action = { vm.move(-1) }, kind = 1, desc = "Cursor left"), K("▶", action = { vm.move(1) }, kind = 1, desc = "Cursor right"),
    )
    val fn1 = if (!s) listOf(K("sin", "sin()"), K("cos", "cos()"), K("tan", "tan()"), K("ln", "ln()"), K("log", "log()"))
    else listOf(K("sin⁻¹", "asin()", desc = "arcsine"), K("cos⁻¹", "acos()", desc = "arccosine"), K("tan⁻¹", "atan()", desc = "arctangent"), K("eˣ", "e^()", desc = "e to the power"), K("10ˣ", "10^()", desc = "ten to the power"))
    val fn2 = if (!s) listOf(K("√", "sqrt()", desc = "square root"), K("x²", "^2", desc = "squared"), K("xʸ", "^", desc = "power"), K("(", "("), K(")", ")"))
    else listOf(K("∛", "cbrt()", desc = "cube root"), K("x³", "^3", desc = "cubed"), K("1/x", "^(-1)", desc = "reciprocal"), K("n!", "!", desc = "factorial"), K("|x|", "abs()", desc = "absolute value"))
    val fn3 = if (!s) listOf(K("π", "pi", desc = "pi"), K("e", "e"), K("%", "%", desc = "percent"), K("ans", "ans", desc = "previous answer"), K(",", ","))
    else listOf(K("nCr", "nCr()", desc = "combinations"), K("nPr", "nPr()", desc = "permutations"), K("mod", "mod()", desc = "modulo"), K("sinh", "sinh()"), K("φ", "phi", desc = "golden ratio"))
    val rows = listOf(
        fn1, fn2, fn3,
        listOf(K("7", "7", kind = 2), K("8", "8", kind = 2), K("9", "9", kind = 2), K("⌫", action = vm::backspace, kind = 1, desc = "Backspace"), K("AC", action = vm::clear, kind = 4, desc = "All clear")),
        listOf(K("4", "4", kind = 2), K("5", "5", kind = 2), K("6", "6", kind = 2), K("×", "*", kind = 1, desc = "times"), K("÷", "/", kind = 1, desc = "divided by")),
        listOf(K("1", "1", kind = 2), K("2", "2", kind = 2), K("3", "3", kind = 2), K("+", "+", kind = 1, desc = "plus"), K("−", "-", kind = 1, desc = "minus")),
        listOf(K("0", "0", kind = 2), K(".", ".", kind = 2, desc = "decimal point"), K("EXP", "E", kind = 1, desc = "times ten to the power"), K("x", "x", kind = 1, desc = "variable x"), K("=", action = vm::evaluate, kind = 3, desc = "equals")),
    )
    val haptic = LocalHapticFeedback.current
    val useHaptics = LocalHaptics.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth().weight(0.7f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (k in memRow) KeyButton(k, Modifier.weight(1f).fillMaxHeight(), small = true) { if (useHaptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); k.action?.invoke() }
        }
        for (row in rows) Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (k in row) KeyButton(k, Modifier.weight(1f).fillMaxHeight()) {
                if (useHaptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                if (k.action != null) k.action.invoke() else k.insert?.let { vm.insert(it) }
                if (s && k.insert != null) vm.toggleSecond()
            }
        }
    }
}

@Composable
private fun KeyButton(k: K, modifier: Modifier, small: Boolean = false, onClick: () -> Unit) {
    val lab = LocalLab.current
    val cs = MaterialTheme.colorScheme
    val (bg, fg) = when (k.kind) {
        2 -> cs.surfaceContainerHigh to cs.onSurface
        1 -> cs.surfaceContainer to cs.secondary
        3 -> cs.primary to cs.onPrimary
        4 -> cs.errorContainer to cs.onErrorContainer
        else -> cs.surfaceContainerLow to cs.onSurface
    }
    Surface(onClick = onClick, modifier = modifier.semantics { contentDescription = k.desc }, shape = RoundedCornerShape(if (small) 10.dp else 16.dp), color = bg,
        border = if (k.kind == 3) null else BorderStroke(1.dp, lab.panelBorder.copy(alpha = 0.6f))) {
        Box(contentAlignment = Alignment.Center) {
            Text(k.label, color = fg, style = if (small) MaterialTheme.typography.labelMedium else if (k.kind == 2) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium, maxLines = 1)
        }
    }
}
