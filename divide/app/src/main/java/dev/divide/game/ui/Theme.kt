package dev.divide.game.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.divide.game.R
import kotlin.math.roundToInt

object DV {
    val Ink = Color(0xFF05040A)
    val Panel = Color(0xFF0E0B16)
    val Red = Color(0xFFFF2E63)
    val Gold = Color(0xFFFFD23F)
    val Cyan = Color(0xFF08F7FE)
    val Violet = Color(0xFFB14CFF)
    val White = Color(0xFFF4F1FF)
    val Dim = Color(0xFF8B86A3)
    val Faint = Color(0xFF3A3550)
    val Paper = Color(0xFFF3F0E8)

    val Body = FontFamily(Font(R.font.chakra_regular, FontWeight.Normal), Font(R.font.chakra_bold, FontWeight.Bold))
    val Display = FontFamily(Font(R.font.bungee, FontWeight.Normal))
    val Math = FontFamily(Font(R.font.math, FontWeight.Normal))
}

@Composable
fun Txt(
    text: String, modifier: Modifier = Modifier, size: TextUnit = 14.sp, color: Color = DV.White, bold: Boolean = false,
    font: FontFamily = DV.Body, align: TextAlign = TextAlign.Start, spacing: TextUnit = 0.sp, maxLines: Int = Int.MAX_VALUE, lineHeight: TextUnit = TextUnit.Unspecified,
) {
    BasicText(text, modifier, TextStyle(color = color, fontSize = size, fontFamily = font, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, textAlign = align, letterSpacing = spacing, lineHeight = lineHeight, platformStyle = PlatformTextStyle(includeFontPadding = false)), maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

/** Angular panel with a clipped corner: the game's signature shape. */
fun cutShape(size: Size, cut: Float): Path = Path().apply {
    moveTo(cut, 0f); lineTo(size.width, 0f); lineTo(size.width, size.height - cut); lineTo(size.width - cut, size.height); lineTo(0f, size.height); lineTo(0f, cut); close()
}

fun Modifier.cutPanel(accent: Color = DV.Faint, fill: Color = DV.Panel.copy(alpha = 0.92f), cut: Float = 14f, glow: Boolean = false): Modifier = drawBehind {
    val p = cutShape(size, cut * density)
    drawPath(p, fill)
    if (glow) drawPath(p, accent.copy(alpha = 0.25f), style = Stroke(6.dp.toPx()), blendMode = BlendMode.Plus)
    drawPath(p, accent, style = Stroke(1.4.dp.toPx()))
}

fun Modifier.press(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    var down by remember { mutableStateOf(false) }
    val s by animateFloatAsState(if (down) 0.94f else 1f, spring(0.5f, 800f), label = "press")
    val cb by rememberUpdatedState(onClick)
    val fx = LocalUiFx.current
    graphicsLayer { scaleX = s; scaleY = s }.pointerInput(enabled) {
        if (enabled) detectTapGestures(onPress = { down = true; tryAwaitRelease(); down = false }, onTap = { fx(); cb() })
    }
}

/** Plays the UI tick + haptic for every press. */
val LocalUiFx = staticCompositionLocalOf<() -> Unit> { {} }

@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, accent: Color = DV.Red, sub: String = "", enabled: Boolean = true, onClick: () -> Unit) {
    Column(
        modifier.press(enabled, onClick).cutPanel(if (enabled) accent else DV.Faint, glow = enabled).padding(horizontal = 18.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Txt(text, size = 19.sp, font = DV.Display, color = if (enabled) DV.White else DV.Dim, maxLines = 1)
        if (sub.isNotEmpty()) Txt(sub, size = 11.sp, color = if (enabled) accent else DV.Faint, maxLines = 1)
    }
}

@Composable
fun SmallButton(text: String, modifier: Modifier = Modifier, accent: Color = DV.Cyan, onClick: () -> Unit) {
    Box(modifier.press(onClick = onClick).cutPanel(accent, cut = 9f).padding(horizontal = 14.dp, vertical = 9.dp), contentAlignment = Alignment.Center) {
        Txt(text, size = 13.sp, bold = true, color = accent, maxLines = 1, spacing = 1.sp)
    }
}

@Composable
fun BackChip(onClick: () -> Unit) = SmallButton("◀ BACK", accent = DV.Dim, onClick = onClick)

@Composable
fun Toggle(label: String, on: Boolean, accent: Color = DV.Cyan, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().press { onChange(!on) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Txt(label, Modifier.weight(1f), size = 14.sp, color = if (on) DV.White else DV.Dim)
        Canvas(Modifier.size(44.dp, 22.dp)) {
            val p = cutShape(size, 6.dp.toPx())
            drawPath(p, if (on) accent.copy(alpha = 0.25f) else DV.Faint.copy(alpha = 0.4f)); drawPath(p, if (on) accent else DV.Dim, style = Stroke(1.2.dp.toPx()))
            val x = if (on) size.width - size.height else 0f
            drawRect(if (on) accent else DV.Dim, Offset(x + 4.dp.toPx(), 4.dp.toPx()), Size(size.height - 8.dp.toPx(), size.height - 8.dp.toPx()))
        }
    }
}

@Composable
fun Slider(label: String, value: Float, accent: Color = DV.Cyan, onChange: (Float) -> Unit) {
    val cb by rememberUpdatedState(onChange)
    Column(Modifier.fillMaxWidth()) {
        Row { Txt(label, Modifier.weight(1f), size = 14.sp, color = DV.Dim); Txt("${(value * 100).roundToInt()}%", size = 14.sp, color = accent, bold = true) }
        Canvas(Modifier.fillMaxWidth().height(30.dp).pointerInput(Unit) {
            detectTapGestures { cb((it.x / size.width).coerceIn(0f, 1f)) }
        }.pointerInput(Unit) { detectHorizontalDragGestures { ch, _ -> cb((ch.position.x / size.width).coerceIn(0f, 1f)); ch.consume() } }) {
            val y = size.height / 2
            drawLine(DV.Faint, Offset(0f, y), Offset(size.width, y), 3.dp.toPx())
            drawLine(accent, Offset(0f, y), Offset(size.width * value, y), 3.dp.toPx())
            val p = Path().apply { val x = size.width * value; moveTo(x, y - 9.dp.toPx()); lineTo(x + 7.dp.toPx(), y); lineTo(x, y + 9.dp.toPx()); lineTo(x - 7.dp.toPx(), y); close() }
            drawPath(p, accent)
        }
    }
}

@Composable
fun Header(title: String, sub: String, accent: Color, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        BackChip(onBack)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Txt(title, size = 24.sp, font = DV.Display, maxLines = 1)
            if (sub.isNotEmpty()) Txt(sub, size = 12.sp, color = accent, maxLines = 2)
        }
    }
}

/** Manga focus lines radiating toward (cx, cy). [seed] changes the pattern; draws only outside [inner]. */
fun DrawScope.focusLines(cx: Float, cy: Float, color: Color, seed: Int, inner: Float, count: Int = 90, alpha: Float = 1f) {
    val far = (size.width + size.height)
    var h = seed * 7919 + 13
    for (i in 0 until count) {
        h = h * 1103515245 + 12345
        val r1 = ((h ushr 8) and 0xFFFF) / 65535f
        h = h * 1103515245 + 12345
        val r2 = ((h ushr 8) and 0xFFFF) / 65535f
        val a = (i + r1 * 0.8f) / count * 6.2832f
        val start = inner * (0.8f + r2 * 0.9f)
        val w = (1.5f + r1 * r1 * 14f) * density
        val c = kotlin.math.cos(a); val s = kotlin.math.sin(a)
        val p = Path().apply {
            moveTo(cx + c * start, cy + s * start)
            lineTo(cx + c * far - s * w, cy + s * far + c * w)
            lineTo(cx + c * far + s * w, cy + s * far - c * w)
            close()
        }
        drawPath(p, color.copy(alpha = alpha * (0.5f + 0.5f * r2)))
    }
}
