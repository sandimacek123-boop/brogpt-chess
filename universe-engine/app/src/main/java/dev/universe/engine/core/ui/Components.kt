package dev.universe.engine.core.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt

/** Glass panel: dark translucent base, a faint top-lit gradient and a hairline rim that catches the light. */
fun Modifier.glass(radius: Dp = 20.dp, tint: Color = Color.White, fill: Float = 0.055f, stroke: Float = 0.16f): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .clip(shape)
        .background(Color(0xB3070814))
        .background(Brush.verticalGradient(listOf(tint.copy(alpha = fill * 1.5f), tint.copy(alpha = fill * 0.4f))))
        .border(
            1.dp,
            Brush.linearGradient(listOf(Color.White.copy(alpha = stroke), tint.copy(alpha = stroke * 0.35f), Color.White.copy(alpha = stroke * 0.55f))),
            shape,
        )
}

/** Tap target with a springy press scale and a haptic tick; no ripples anywhere in this app. */
fun Modifier.pressable(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    var pressed by remember { mutableStateOf(false) }
    val s by animateFloatAsState(if (pressed) 0.955f else 1f, spring(dampingRatio = 0.55f, stiffness = 700f), label = "press")
    val cb by rememberUpdatedState(onClick)
    val haptics = LocalHaptics.current
    this
        .graphicsLayer { scaleX = s; scaleY = s }
        .pointerInput(enabled) {
            if (enabled) detectTapGestures(
                onPress = { pressed = true; tryAwaitRelease(); pressed = false },
                onTap = { haptics.tick(); cb() },
            )
        }
}

@Composable
fun GlowButton(text: String, modifier: Modifier = Modifier, accent: Color = UE.Cyan, filled: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier
            .pressable(onClick = onClick)
            .clip(shape)
            .background(if (filled) Brush.horizontalGradient(listOf(accent.copy(alpha = 0.9f), accent.copy(alpha = 0.55f))) else Brush.verticalGradient(listOf(accent.copy(alpha = 0.16f), accent.copy(alpha = 0.06f))))
            .border(1.dp, accent.copy(alpha = if (filled) 0.9f else 0.55f), shape)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        T(text, size = 13.sp, color = if (filled) UE.Void else accent, weight = FontWeight.Medium, spacing = 0.6.sp, maxLines = 1)
    }
}

@Composable
fun Chip(text: String, selected: Boolean = false, accent: Color = UE.Cyan, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Box(
        modifier
            .pressable(onClick = onClick)
            .clip(shape)
            .background(if (selected) accent.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.045f))
            .border(1.dp, if (selected) accent.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.12f), shape)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) { T(text, size = 12.sp, color = if (selected) accent else UE.Dim, weight = FontWeight.Medium, maxLines = 1) }
}

/** Horizontally scrolling row of chips. */
@Composable
fun ChipRow(options: List<String>, selected: Int, accent: Color = UE.Cyan, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEachIndexed { i, o -> Chip(o, i == selected, accent) { onSelect(i) } }
    }
}

/** Equal-width segmented control with a sliding glow indicator. */
@Composable
fun Segmented(options: List<String>, selected: Int, modifier: Modifier = Modifier, accent: Color = UE.Cyan, onSelect: (Int) -> Unit) {
    val pos by animateFloatAsState(selected.toFloat(), spring(dampingRatio = 0.75f, stiffness = 500f), label = "seg")
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier.fillMaxWidth().height(36.dp).clip(shape).background(Color.White.copy(alpha = 0.045f)).border(1.dp, Color.White.copy(alpha = 0.1f), shape),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val w = size.width / options.size
            drawRoundRect(
                Brush.verticalGradient(listOf(accent.copy(alpha = 0.34f), accent.copy(alpha = 0.14f))),
                topLeft = Offset(pos * w + 3f, 3f), size = Size(w - 6f, size.height - 6f), cornerRadius = CornerRadius(9.dp.toPx()),
            )
            drawRoundRect(
                accent.copy(alpha = 0.8f), topLeft = Offset(pos * w + 3f, 3f), size = Size(w - 6f, size.height - 6f),
                cornerRadius = CornerRadius(9.dp.toPx()), style = Stroke(1.dp.toPx()),
            )
        }
        Row(Modifier.matchParentSize()) {
            options.forEachIndexed { i, o ->
                Box(Modifier.weight(1f).height(36.dp).pressable { onSelect(i) }, contentAlignment = Alignment.Center) {
                    T(o, size = 12.sp, color = if (i == selected) UE.Text else UE.Dim, weight = FontWeight.Medium, maxLines = 1, align = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
fun Toggle(label: String, on: Boolean, modifier: Modifier = Modifier, accent: Color = UE.Cyan, onChange: (Boolean) -> Unit) {
    val p by animateFloatAsState(if (on) 1f else 0f, tween(180), label = "toggle")
    Row(modifier.pressable { onChange(!on) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(38.dp, 22.dp)) {
            val r = size.height / 2
            drawRoundRect(androidx.compose.ui.graphics.lerp(Color.White.copy(alpha = 0.1f), accent.copy(alpha = 0.35f), p), cornerRadius = CornerRadius(r))
            drawRoundRect(androidx.compose.ui.graphics.lerp(Color.White.copy(alpha = 0.2f), accent, p), cornerRadius = CornerRadius(r), style = Stroke(1.dp.toPx()))
            val cx = r + (size.width - 2 * r) * p
            drawCircle(accent.copy(alpha = 0.35f * p), r * 1.25f, Offset(cx, r))
            drawCircle(androidx.compose.ui.graphics.lerp(UE.Dim, Color.White, p), r * 0.62f, Offset(cx, r))
        }
        Spacer(Modifier.width(8.dp))
        T(label, size = 12.5.sp, color = if (on) UE.Text else UE.Dim, maxLines = 1)
    }
}

/**
 * Instrument slider: thin luminous track, glowing thumb, live numeric readout.
 * [log] maps the track exponentially (range must be positive). [step] snaps to multiples.
 */
@Composable
fun UESlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    modifier: Modifier = Modifier,
    accent: Color = UE.Cyan,
    log: Boolean = false,
    step: Float = 0f,
    format: (Float) -> String = { fmt(it, 3) },
    onChange: (Float) -> Unit,
) {
    val lo = range.start
    val hi = range.endInclusive
    fun toT(v: Float): Float = if (log) (ln(v / lo) / ln(hi / lo)) else (v - lo) / (hi - lo)
    fun fromT(t: Float): Float {
        val c = t.coerceIn(0f, 1f)
        var v = if (log) lo * (hi / lo).pow(c) else lo + (hi - lo) * c
        if (step > 0f) v = ((v / step).roundToInt() * step)
        return v.coerceIn(lo, hi)
    }
    val cb by rememberUpdatedState(onChange)
    val haptics = LocalHaptics.current
    var lastStep by remember { mutableStateOf(0) }
    fun emit(x: Float, w: Float, pad: Float) {
        val v = fromT((x - pad) / (w - 2 * pad))
        if (step > 0f) { val s = (v / step).roundToInt(); if (s != lastStep) { lastStep = s; haptics.tick() } }
        cb(v)
    }
    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            T(label, size = 12.sp, color = UE.Dim, maxLines = 1, modifier = Modifier.weight(1f))
            T(format(value), size = 12.5.sp, color = accent, font = UE.Mono, weight = FontWeight.Medium, maxLines = 1)
        }
        Canvas(
            Modifier.fillMaxWidth().height(30.dp)
                .pointerInput(lo, hi, log, step) { detectTapGestures { o -> emit(o.x, size.width.toFloat(), 11.dp.toPx()) } }
                .pointerInput(lo, hi, log, step) {
                    detectHorizontalDragGestures(onDragStart = { o -> emit(o.x, size.width.toFloat(), 11.dp.toPx()) }) { change, _ ->
                        emit(change.position.x, size.width.toFloat(), 11.dp.toPx()); change.consume()
                    }
                },
        ) {
            val pad = 11.dp.toPx()
            val y = size.height / 2
            val t = toT(value.coerceIn(lo, hi)).coerceIn(0f, 1f)
            val x = pad + (size.width - 2 * pad) * t
            drawLine(Color.White.copy(alpha = 0.12f), Offset(pad, y), Offset(size.width - pad, y), 3.dp.toPx(), StrokeCap.Round)
            for (i in 0..10) {
                val tx = pad + (size.width - 2 * pad) * i / 10f
                drawLine(Color.White.copy(alpha = if (i % 5 == 0) 0.22f else 0.1f), Offset(tx, y + 7.dp.toPx()), Offset(tx, y + (if (i % 5 == 0) 11 else 9).dp.toPx()), 1f)
            }
            drawLine(Brush.horizontalGradient(listOf(accent.copy(alpha = 0.25f), accent), startX = pad, endX = x.coerceAtLeast(pad + 1f)), Offset(pad, y), Offset(x, y), 3.dp.toPx(), StrokeCap.Round)
            drawCircle(accent.copy(alpha = 0.22f), 11.dp.toPx(), Offset(x, y))
            drawCircle(accent, 6.dp.toPx(), Offset(x, y))
            drawCircle(Color.White, 2.5.dp.toPx(), Offset(x, y))
        }
    }
}

/** Convenience for integer-valued sliders. */
@Composable
fun IntSlider(label: String, value: Int, range: IntRange, modifier: Modifier = Modifier, accent: Color = UE.Cyan, format: (Int) -> String = { it.toString() }, onChange: (Int) -> Unit) {
    UESlider(label, value.toFloat(), range.first.toFloat()..range.last.toFloat(), modifier, accent, step = 1f, format = { format(it.roundToInt()) }) { onChange(it.roundToInt()) }
}

@Composable
fun Readout(label: String, value: String, modifier: Modifier = Modifier, color: Color = UE.Text) {
    Column(modifier) {
        T(label.uppercase(), size = 9.5.sp, color = UE.Faint.copy(alpha = 1f).let { UE.Dim.copy(alpha = 0.75f) }, spacing = 1.1.sp, maxLines = 1)
        T(value, size = 14.sp, color = color, font = UE.Mono, weight = FontWeight.Medium, maxLines = 1)
    }
}

/** A row of equal-width readouts on a faint glass strip. */
@Composable
fun ReadoutRow(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.035f)).padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), content = content,
    )
}

@Composable
fun RowScope.Stat(label: String, value: String, color: Color = UE.Text) = Readout(label, value, Modifier.weight(1f), color)

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, color: Color = UE.Dim) {
    T(text.uppercase(), modifier, size = 10.sp, color = color, spacing = 1.6.sp, weight = FontWeight.Medium)
}

/** Explanatory caption used under controls. */
@Composable
fun Note(text: String, modifier: Modifier = Modifier, color: Color = UE.Dim) {
    T(text, modifier, size = 12.sp, color = color, lineHeight = 17.sp)
}

@Composable
fun ColumnScope.Gap(h: Dp = 10.dp) = Spacer(Modifier.height(h))

/** Single-line text input styled as an instrument field. */
@Composable
fun UEField(
    value: androidx.compose.ui.text.input.TextFieldValue,
    onChange: (androidx.compose.ui.text.input.TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = UE.Cyan,
    prefix: String = "",
    error: Boolean = false,
    numeric: Boolean = false,
    onFocus: () -> Unit = {},
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier.clip(shape).background(Color.White.copy(alpha = 0.05f)).border(1.dp, if (error) UE.Red.copy(alpha = 0.8f) else accent.copy(alpha = 0.45f), shape).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (prefix.isNotEmpty()) { T(prefix, size = 14.sp, color = accent, font = UE.Mono, maxLines = 1); Spacer(Modifier.width(6.dp)) }
        androidx.compose.foundation.text.BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            modifier = Modifier.weight(1f).onFocusChanged { if (it.isFocused) onFocus() },
            textStyle = androidx.compose.ui.text.TextStyle(color = UE.Text, fontSize = 15.sp, fontFamily = UE.Mono),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(accent),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = if (numeric) androidx.compose.ui.text.input.KeyboardType.Number else androidx.compose.ui.text.input.KeyboardType.Ascii,
                imeAction = androidx.compose.ui.text.input.ImeAction.Done,
            ),
        )
    }
}
