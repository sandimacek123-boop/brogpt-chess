package com.quantumath.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import com.quantumath.app.data.AppSettings
import com.quantumath.app.data.ThemeMode

/** Extra brand colours not covered by Material roles. */
data class LabColors(
    val accent: Color, val accent2: Color, val grid: Color, val axis: Color, val glow: Color,
    val success: Color, val warning: Color, val danger: Color, val panel: Color, val panelBorder: Color,
    val curves: List<Color>, val dark: Boolean,
)

val LocalLab = staticCompositionLocalOf {
    LabColors(Color(0xFF9D7BFF), Color(0xFF4FD8FF), Color(0x22FFFFFF), Color(0x66FFFFFF), Color(0x339D7BFF), Color(0xFF3DDC97), Color(0xFFFFB547), Color(0xFFFF5C7A), Color(0xFF15151E), Color(0xFF2A2A3A), emptyList(), true)
}
val LocalReduceMotion = staticCompositionLocalOf { false }
val LocalHaptics = staticCompositionLocalOf { true }

val MonoFamily = FontFamily.Monospace

val CurvePalette = listOf(0xFF9D7BFF, 0xFF4FD8FF, 0xFFFF6B8B, 0xFF3DDC97, 0xFFFFB547, 0xFFE879F9, 0xFF60A5FA, 0xFFF97316).map { Color(it) }

@Composable
fun QuantumathTheme(settings: AppSettings, content: @Composable () -> Unit) {
    val dark = when (settings.theme) { ThemeMode.DARK -> true; ThemeMode.LIGHT -> false; ThemeMode.SYSTEM -> isSystemInDarkTheme() }
    val accent = Color(settings.accent.argb); val accent2 = Color(settings.accent.argb2)
    val hc = settings.highContrast
    val scheme = if (dark) darkColorScheme(
        primary = accent, onPrimary = Color(0xFF120A26), primaryContainer = lerp(Color(0xFF16121F), accent, 0.28f), onPrimaryContainer = Color(0xFFF1ECFF),
        secondary = accent2, onSecondary = Color(0xFF00141C), secondaryContainer = lerp(Color(0xFF101A20), accent2, 0.22f), onSecondaryContainer = Color(0xFFE2F8FF),
        tertiary = Color(0xFFFF6B8B), background = Color(0xFF0B0B10), onBackground = if (hc) Color.White else Color(0xFFECEAF6),
        surface = Color(0xFF0F0F16), onSurface = if (hc) Color.White else Color(0xFFECEAF6), surfaceVariant = Color(0xFF1C1C27),
        onSurfaceVariant = if (hc) Color(0xFFE0E0EA) else Color(0xFFA9A7BC), surfaceContainerLowest = Color(0xFF09090D), surfaceContainerLow = Color(0xFF12121A),
        surfaceContainer = Color(0xFF16161F), surfaceContainerHigh = Color(0xFF1C1C27), surfaceContainerHighest = Color(0xFF242432),
        outline = if (hc) Color(0xFF9A9AB0) else Color(0xFF3A3A4E), outlineVariant = Color(0xFF2A2A3A), error = Color(0xFFFF5C7A), onError = Color(0xFF2A0008),
        errorContainer = Color(0xFF3A1320), onErrorContainer = Color(0xFFFFD9DF),
    ) else lightColorScheme(
        primary = lerp(accent, Color.Black, 0.35f), onPrimary = Color.White, primaryContainer = lerp(Color.White, accent, 0.22f), onPrimaryContainer = Color(0xFF1C1236),
        secondary = lerp(accent2, Color.Black, 0.4f), onSecondary = Color.White, secondaryContainer = lerp(Color.White, accent2, 0.2f), onSecondaryContainer = Color(0xFF00222E),
        tertiary = Color(0xFFC2185B), background = Color(0xFFF6F5FB), onBackground = Color(0xFF14131C), surface = Color(0xFFFBFAFF), onSurface = Color(0xFF14131C),
        surfaceVariant = Color(0xFFE9E7F2), onSurfaceVariant = if (hc) Color(0xFF22212C) else Color(0xFF55536A), surfaceContainerLowest = Color.White,
        surfaceContainerLow = Color(0xFFF4F2FA), surfaceContainer = Color(0xFFEFEDF6), surfaceContainerHigh = Color(0xFFE9E7F1), surfaceContainerHighest = Color(0xFFE3E1EC),
        outline = if (hc) Color(0xFF55536A) else Color(0xFFC6C3D6), outlineVariant = Color(0xFFDAD8E6),
    )
    val lab = LabColors(
        accent = scheme.primary, accent2 = scheme.secondary,
        grid = if (dark) Color(0x1AFFFFFF) else Color(0x14000000), axis = if (dark) Color(0x80FFFFFF) else Color(0x99000000),
        glow = accent.copy(alpha = 0.25f), success = if (dark) Color(0xFF3DDC97) else Color(0xFF138A5B), warning = if (dark) Color(0xFFFFB547) else Color(0xFFB26A00),
        danger = scheme.error, panel = if (dark) Color(0xFF14141D) else Color.White, panelBorder = if (dark) Color(0xFF262636) else Color(0xFFE1DEEC),
        curves = if (dark) CurvePalette else CurvePalette.map { lerp(it, Color.Black, 0.25f) }, dark = dark,
    )
    val base = Typography()
    val typography = base.copy(
        displaySmall = base.displaySmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.5).sp),
        headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
        headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = base.labelLarge.copy(fontWeight = FontWeight.Medium),
    )
    val density = LocalDensity.current
    CompositionLocalProvider(
        LocalLab provides lab,
        LocalReduceMotion provides settings.reduceMotion,
        LocalHaptics provides settings.haptics,
        LocalDensity provides Density(density.density, density.fontScale * settings.fontScale),
    ) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}

val MathStyle = TextStyle(fontFamily = MonoFamily)
