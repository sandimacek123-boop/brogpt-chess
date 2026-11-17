package dev.universe.engine.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import dev.universe.engine.core.ui.UE
import dev.universe.engine.core.ui.label
import dev.universe.engine.core.ui.pressable
import kotlin.math.*
import kotlin.random.Random

/** Boot sequence: scattered light condenses into the engine core while the name resolves. Tap to skip. */
@Composable
fun Intro(onDone: () -> Unit) {
    val p = remember { Animatable(0f) }
    val fade = remember { Animatable(1f) }
    val tm = rememberTextMeasurer(cacheSize = 8)
    val parts = remember { val r = Random(5); List(260) { floatArrayOf(r.nextFloat() * 6.283f, 0.35f + r.nextFloat() * 0.9f, r.nextFloat(), r.nextInt(3).toFloat()) } }
    var skip by remember { mutableStateOf(false) }
    LaunchedEffect(skip) {
        if (!skip) p.animateTo(1f, tween(2100, easing = LinearEasing))
        fade.animateTo(0f, tween(380, easing = FastOutSlowInEasing))
        onDone()
    }
    Box(Modifier.fillMaxSize().background(UE.Void.copy(alpha = fade.value)).pressable { skip = true }) {
        Canvas(Modifier.fillMaxSize()) {
            val a = fade.value
            val t = p.value
            val c = Offset(size.width / 2, size.height * 0.42f)
            val R = size.minDimension * 0.6f
            val cols = listOf(UE.Cyan, UE.Violet, UE.Blue)
            val pts = Array(3) { ArrayList<Offset>() }
            for (q in parts) {
                val k = ((t - q[2] * 0.35f) / 0.6f).coerceIn(0f, 1f)
                val e = 1 - (1 - k).pow(3)
                val r = R * q[1] * (1 - e) + size.minDimension * 0.04f * e
                val ang = q[0] + e * 2.4f
                pts[q[3].toInt()] += c + Offset(cos(ang) * r, sin(ang) * r)
            }
            for (k in 0 until 3) {
                drawPoints(pts[k], PointMode.Points, cols[k].copy(alpha = 0.22f * a), 7.dp.toPx(), StrokeCap.Round, blendMode = BlendMode.Plus)
                drawPoints(pts[k], PointMode.Points, cols[k].copy(alpha = 0.9f * a), 2.4.dp.toPx(), StrokeCap.Round)
            }
            val core = ((t - 0.55f) / 0.25f).coerceIn(0f, 1f)
            if (core > 0f) {
                val cr = size.minDimension * 0.05f * core * (1 + 0.15f * sin(t * 40))
                drawCircle(Brush.radialGradient(listOf(UE.Cyan.copy(alpha = 0.6f * a), Color.Transparent), c, cr * 6), cr * 6, c, blendMode = BlendMode.Plus)
                drawCircle(Color.White.copy(alpha = a), cr, c)
            }
            val txt = ((t - 0.62f) / 0.3f).coerceIn(0f, 1f)
            if (txt > 0f) {
                label(tm, "UNIVERSE ENGINE", c.x, c.y + size.minDimension * 0.2f, lerp(UE.Cyan, UE.Text, txt).copy(alpha = txt * a), 22f, 0.5f, 0.5f, UE.Display, FontWeight.Bold)
                label(tm, "a laboratory for everything", c.x, c.y + size.minDimension * 0.2f + 28.dp.toPx(), UE.Dim.copy(alpha = txt * a), 11f, 0.5f, 0.5f, UE.Mono)
            }
        }
    }
}
