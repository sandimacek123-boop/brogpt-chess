package com.quantumath.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.Outcome
import com.quantumath.app.util.Share

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabTopBar(title: String, onBack: (() -> Unit)? = null, subtitle: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = {
            Column {
                Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
                if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        },
        navigationIcon = { if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
    )
}

@Composable
fun Panel(modifier: Modifier = Modifier, title: String? = null, icon: ImageVector? = null, trailing: @Composable (RowScope.() -> Unit)? = null, contentPadding: PaddingValues = PaddingValues(16.dp), content: @Composable ColumnScope.() -> Unit) {
    val lab = LocalLab.current
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = lab.panel, border = BorderStroke(1.dp, lab.panelBorder)) {
        Column(Modifier.padding(contentPadding).animateContentSize()) {
            if (title != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                    if (icon != null) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
                    Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f).semantics { heading() })
                    trailing?.invoke(this)
                }
            }
            content()
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(top = 8.dp, bottom = 4.dp).semantics { heading() })
}

/** Expression input with quick-insert keys that insert at the cursor. */
@Composable
fun ExprInput(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Expression",
    placeholder: String = "",
    singleLine: Boolean = true,
    keys: List<String> = DefaultKeys,
    onDone: (() -> Unit)? = null,
    isError: Boolean = false,
    supporting: String? = null,
) {
    var tfv by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    LaunchedEffect(value) { if (value != tfv.text) tfv = TextFieldValue(value, TextRange(value.length)) }
    Column(modifier) {
        OutlinedTextField(
            value = tfv,
            onValueChange = { tfv = it; if (it.text != value) onValueChange(it.text) },
            label = { Text(label) },
            placeholder = { if (placeholder.isNotEmpty()) Text(placeholder, fontFamily = MonoFamily) },
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily),
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 2,
            isError = isError,
            supportingText = supporting?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false, capitalization = KeyboardCapitalization.None, imeAction = if (singleLine) ImeAction.Done else ImeAction.Default),
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
            trailingIcon = if (tfv.text.isNotEmpty()) ({ IconButton(onClick = { tfv = TextFieldValue(""); onValueChange("") }) { Icon(Icons.Filled.Clear, "Clear input") } }) else null,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        if (keys.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (k in keys) {
                    val ins = KeyInserts[k] ?: k
                    SuggestionChip(onClick = {
                        val s = tfv.selection
                        val t = tfv.text.replaceRange(s.min, s.max, ins)
                        val caret = s.min + (if (ins.endsWith("()")) ins.length - 1 else ins.length)
                        tfv = TextFieldValue(t, TextRange(caret)); onValueChange(t)
                    }, label = { Text(k, fontFamily = MonoFamily) }, modifier = Modifier.semantics { contentDescription = "Insert $k" })
                }
            }
        }
    }
}

val DefaultKeys = listOf("x", "^", "(", ")", "√", "π", "e", "sin", "cos", "tan", "ln", "log", "abs", "/", "*")
val EquationKeys = listOf("x", "=", "^", "(", ")", "√", "π", "<", ">", "≤", "≥", "sin", "cos", "ln", "abs", "y")
private val KeyInserts = mapOf("√" to "sqrt()", "sin" to "sin()", "cos" to "cos()", "tan" to "tan()", "ln" to "ln()", "log" to "log()", "abs" to "abs()", "π" to "pi", "exp" to "exp()", "asin" to "asin()", "acos" to "acos()", "atan" to "atan()")

@Composable
fun NumberField(label: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, supporting: String? = null, isError: Boolean = false, decimal: Boolean = true) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label, maxLines = 1) }, singleLine = true, isError = isError,
        supportingText = supporting?.let { { Text(it) } },
        textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily),
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Text else KeyboardType.Number, autoCorrectEnabled = false, imeAction = ImeAction.Next),
        shape = RoundedCornerShape(14.dp), modifier = modifier,
    )
}

@Composable
fun <T> ChipRow(options: List<T>, selected: T, onSelect: (T) -> Unit, label: (T) -> String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (o in options) FilterChip(selected = o == selected, onClick = { onSelect(o) }, label = { Text(label(o)) },
            leadingIcon = if (o == selected) ({ Icon(Icons.Filled.Check, null, Modifier.size(16.dp)) }) else null)
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = Icons.Filled.PlayArrow, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 48.dp), shape = RoundedCornerShape(14.dp)) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text)
    }
}

@Composable
fun ResultPanel(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    secondary: String? = null,
    shareText: String = if (secondary != null) "$value\n$secondary" else value,
    onSave: (() -> Unit)? = null,
    extra: @Composable ColumnScope.() -> Unit = {},
) {
    val ctx = LocalContext.current
    val lab = LocalLab.current
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = lab.panel, border = BorderStroke(1.dp, lab.accent.copy(alpha = 0.45f))) {
        Column(Modifier.background(Brush.verticalGradient(listOf(lab.glow.copy(alpha = 0.18f), Color.Transparent))).padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            SelectionContainer { Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontFamily = MonoFamily, fontWeight = FontWeight.Medium), modifier = Modifier.semantics { contentDescription = "$title: $value" }) }
            if (secondary != null) { Spacer(Modifier.height(4.dp)); SelectionContainer { Text(secondary, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily), color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            extra()
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
                IconButton(onClick = { Share.copy(ctx, title, shareText) }) { Icon(Icons.Outlined.ContentCopy, "Copy result") }
                IconButton(onClick = { Share.text(ctx, shareText) }) { Icon(Icons.Outlined.Share, "Share result") }
                if (onSave != null) IconButton(onClick = onSave) { Icon(Icons.Outlined.BookmarkAdd, "Save to notebook") }
            }
        }
    }
}

@Composable
fun StepsPanel(steps: List<Pair<String, String>>, modifier: Modifier = Modifier, initiallyExpanded: Boolean = true, title: String = "Steps") {
    if (steps.isEmpty()) return
    var open by rememberSaveable { mutableStateOf(initiallyExpanded) }
    Panel(modifier, title = "$title (${steps.size})", icon = Icons.Outlined.FormatListNumbered, trailing = {
        IconButton(onClick = { open = !open }) { Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, if (open) "Collapse steps" else "Expand steps") }
    }) {
        AnimatedVisibility(open) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                steps.forEachIndexed { i, (rule, detail) ->
                    Row {
                        Box(Modifier.size(24.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                            Text("${i + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(rule, style = MaterialTheme.typography.labelLarge)
                            SelectionContainer { Text(detail, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ErrorPanel(message: String, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.errorContainer) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(10.dp))
            Text(message, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun InfoPanel(message: String, modifier: Modifier = Modifier, icon: ImageVector = Icons.Outlined.Info) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
        Row(Modifier.padding(14.dp)) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun <T> OutcomeView(outcome: Outcome<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
    when (outcome) {
        Outcome.Idle -> {}
        Outcome.Loading -> Row(modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp); Spacer(Modifier.width(12.dp)); Text("Computing…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        is Outcome.Err -> ErrorPanel(outcome.message, modifier)
        is Outcome.Ok -> content(outcome.value)
    }
}

@Composable
fun KeyValue(key: String, value: String, modifier: Modifier = Modifier, mono: Boolean = true) {
    val style = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (mono) MonoFamily else null)
    if (value.length > 34 || key.length > 26) {
        // long values: stack label above value so neither column gets squeezed
        Column(modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Text(key, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SelectionContainer { Text(value, style = style) }
        }
    } else Row(modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Text(key, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.45f))
        Box(Modifier.weight(0.55f), contentAlignment = Alignment.TopEnd) { SelectionContainer { Text(value, style = style) } }
    }
}

@Composable
fun ToolTile(icon: ImageVector, title: String, subtitle: String, color: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val lab = LocalLab.current
    Surface(onClick = onClick, modifier = modifier.semantics { contentDescription = "$title. $subtitle" }, shape = RoundedCornerShape(20.dp), color = lab.panel, border = BorderStroke(1.dp, lab.panelBorder)) {
        Column(Modifier.background(Brush.linearGradient(listOf(color.copy(alpha = 0.16f), Color.Transparent))).padding(14.dp)) {
            Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = color) }
            Spacer(Modifier.height(10.dp))
            Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, minLines = 2)
        }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, text: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.outline)
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun ExampleChips(examples: List<String>, onPick: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Try:", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterVertically))
        for (e in examples) AssistChip(onClick = { onPick(e) }, label = { Text(e, fontFamily = MonoFamily, maxLines = 1) })
    }
}

@Composable
fun SwitchRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, subtitle: String? = null) {
    Row(Modifier.fillMaxWidth().clickable(role = Role.Switch) { onChange(!checked) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** Standard scrolling screen body with consistent padding. */
@Composable
fun ScreenColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp), content = content,
    )
}
