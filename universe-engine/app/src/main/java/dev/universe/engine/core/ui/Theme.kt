package dev.universe.engine.core.ui

import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import dev.universe.engine.R
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.roundToLong

/** Universe Engine design tokens: a dark scientific instrument, lit by cyan, violet and electric blue. */
object UE {
    val Void = Color(0xFF020206)
    val Deep = Color(0xFF06060F)
    val Ink = Color(0xFF0B0D1C)
    val Cyan = Color(0xFF00E5FF)
    val Blue = Color(0xFF2E7BFF)
    val Violet = Color(0xFF8E5CFF)
    val Magenta = Color(0xFFFF4FD8)
    val Amber = Color(0xFFFFC14D)
    val Green = Color(0xFF3DFFB4)
    val Red = Color(0xFFFF5470)
    val Text = Color(0xFFE9F1FF)
    val Dim = Color(0xFF8D97BD)
    val Faint = Color(0xFF454C70)
    val Line = Color(0x1FFFFFFF)

    val Display = FontFamily(
        Font(R.font.space_grotesk_regular, FontWeight.Normal),
        Font(R.font.space_grotesk_medium, FontWeight.Medium),
        Font(R.font.space_grotesk_bold, FontWeight.Bold),
    )
    val Mono = FontFamily(
        Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
        Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
    )
    val Math = FontFamily(Font(R.font.stix_two_math, FontWeight.Normal))

    /** Cool-to-hot scientific ramp used for heat maps: deep violet, blue, cyan, white. */
    fun ramp(t: Float): Color {
        val x = t.coerceIn(0f, 1f)
        return when {
            x < 0.33f -> lerp(Color(0xFF1B0B4A), Violet, x / 0.33f)
            x < 0.66f -> lerp(Violet, Cyan, (x - 0.33f) / 0.33f)
            else -> lerp(Cyan, Color.White, (x - 0.66f) / 0.34f)
        }
    }
}

enum class Domain(val title: String, val tagline: String, val accent: Color) {
    Math("Mathematics", "The language the universe is written in", UE.Cyan),
    Physics("Physics", "Forces, fields and the motion of things", UE.Violet),
    Astro("Astronomy", "From our Sun to the edge of the observable", UE.Blue),
    Chem("Chemistry", "Atoms, bonds and the matter they build", UE.Green),
}

/** Text primitive. The app never uses Material typography. */
@Composable
fun T(
    text: String,
    modifier: Modifier = Modifier,
    size: TextUnit = 14.sp,
    color: Color = UE.Text,
    weight: FontWeight = FontWeight.Normal,
    font: FontFamily = UE.Display,
    spacing: TextUnit = 0.sp,
    align: TextAlign = TextAlign.Start,
    maxLines: Int = Int.MAX_VALUE,
    lineHeight: TextUnit = TextUnit.Unspecified,
) {
    BasicText(
        text = text,
        modifier = modifier,
        style = TextStyle(
            color = color, fontSize = size, fontWeight = weight, fontFamily = font, letterSpacing = spacing,
            textAlign = align, lineHeight = lineHeight, platformStyle = PlatformTextStyle(includeFontPadding = false),
        ),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Tiny haptic vocabulary, gated by the user's setting. */
class Haptics(private val view: View?, private val enabled: () -> Boolean) {
    fun tick() { if (enabled()) view?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
    fun thud() { if (enabled()) view?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS) }
}

val LocalHaptics = staticCompositionLocalOf { Haptics(null) { false } }

// ---------------------------------------------------------------- number formatting

private val SUP = charArrayOf('⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹')

fun superscript(n: Int): String {
    val s = StringBuilder()
    if (n < 0) s.append('⁻')
    for (c in abs(n).toString()) s.append(SUP[c - '0'])
    return s.toString()
}

private val SUB = charArrayOf('₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉')
fun subscript(n: Int): String = buildString { for (c in n.toString()) append(if (c == '-') '₋' else SUB[c - '0']) }

/** Formats with [sig] significant figures; switches to ×10ⁿ notation outside a readable range. */
fun fmt(v: Double, sig: Int = 4): String {
    if (v.isNaN()) return "—"
    if (v.isInfinite()) return if (v > 0) "∞" else "−∞"
    if (v == 0.0) return "0"
    val a = abs(v)
    val e = floor(log10(a)).toInt()
    if (e >= 7 || e < -4) {
        val m = v / 10.0.pow(e)
        val ms = trimZeros(String.format(java.util.Locale.US, "%.${(sig - 1).coerceAtLeast(0)}f", m))
        return "${ms.replace('-', '−')}×10${superscript(e)}"
    }
    val dec = (sig - 1 - e).coerceIn(0, 9)
    return trimZeros(String.format(java.util.Locale.US, "%.${dec}f", v)).replace('-', '−')
}

fun fmt(v: Float, sig: Int = 4): String = fmt(v.toDouble(), sig)

/** Fixed number of decimals, no trimming (for readouts that should not jitter in width). */
fun fix(v: Double, dec: Int = 2): String =
    if (v.isNaN() || v.isInfinite()) "—" else String.format(java.util.Locale.US, "%.${dec}f", v).replace('-', '−')

fun fix(v: Float, dec: Int = 2): String = fix(v.toDouble(), dec)

private fun trimZeros(s: String): String {
    if (!s.contains('.')) return s
    var end = s.length
    while (end > 0 && s[end - 1] == '0') end--
    if (end > 0 && s[end - 1] == '.') end--
    return s.substring(0, end)
}

fun groupDigits(n: Long): String {
    val s = abs(n).toString()
    val b = StringBuilder()
    for (i in s.indices) { if (i > 0 && (s.length - i) % 3 == 0) b.append(' '); b.append(s[i]) }
    return (if (n < 0) "−" else "") + b
}

fun Double.roundTo(dec: Int): Double { val k = 10.0.pow(dec); return (this * k).roundToLong() / k }
