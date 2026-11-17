package dev.universe.engine.core.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import kotlin.math.sin
import kotlin.random.Random

/** Deterministic star positions in unit space, in three brightness tiers. */
class StarData(count: Int, seed: Int = 7) {
    val x = FloatArray(count); val y = FloatArray(count); val phase = FloatArray(count); val tier = IntArray(count)
    init {
        val r = Random(seed)
        for (i in 0 until count) { x[i] = r.nextFloat(); y[i] = r.nextFloat(); phase[i] = r.nextFloat() * 6.28f; tier[i] = if (r.nextFloat() < 0.08f) 2 else if (r.nextFloat() < 0.3f) 1 else 0 }
    }
}

fun DrawScope.drawStars(stars: StarData, t: Float, drift: Float = 0.004f, alpha: Float = 1f) {
    val buckets = Array(3) { ArrayList<Offset>() }
    for (i in stars.x.indices) {
        val tw = 0.5f + 0.5f * sin(t * (0.6f + stars.tier[i] * 0.5f) + stars.phase[i])
        if (stars.tier[i] == 0 && tw < 0.25f) continue
        var px = (stars.x[i] + t * drift * (1 + stars.tier[i])) % 1f
        if (px < 0) px += 1f
        buckets[stars.tier[i]] += Offset(px * size.width, stars.y[i] * size.height)
    }
    drawPoints(buckets[0], PointMode.Points, Color(0xFF9FB4FF).copy(alpha = 0.45f * alpha), 1.6f, StrokeCap.Round)
    drawPoints(buckets[1], PointMode.Points, Color(0xFFCFE0FF).copy(alpha = 0.7f * alpha), 2.4f, StrokeCap.Round)
    drawPoints(buckets[2], PointMode.Points, Color.White.copy(alpha = 0.95f * alpha), 3.4f, StrokeCap.Round)
    drawPoints(buckets[2], PointMode.Points, UE.Cyan.copy(alpha = 0.16f * alpha), 11f, StrokeCap.Round, blendMode = BlendMode.Plus)
}

/** Deep-space backdrop: slow-drifting nebula light and a twinkling star field. */
@Composable
fun SpaceBackdrop(modifier: Modifier = Modifier, accent: Color = UE.Violet, animate: Boolean = true) {
    val stars = remember { StarData(150) }
    val time by rememberTime(animate)
    Canvas(modifier.fillMaxSize()) {
        val t = time
        drawRect(UE.Void)
        val w = size.width; val h = size.height
        drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = 0.16f), Color.Transparent), Offset(w * (0.2f + 0.05f * sin(t * 0.07f)), h * 0.18f), w * 0.9f), w * 0.9f, Offset(w * (0.2f + 0.05f * sin(t * 0.07f)), h * 0.18f))
        drawCircle(Brush.radialGradient(listOf(UE.Blue.copy(alpha = 0.13f), Color.Transparent), Offset(w * 0.9f, h * (0.62f + 0.04f * sin(t * 0.05f + 1f))), w * 0.85f), w * 0.85f, Offset(w * 0.9f, h * (0.62f + 0.04f * sin(t * 0.05f + 1f))))
        drawCircle(Brush.radialGradient(listOf(UE.Cyan.copy(alpha = 0.06f), Color.Transparent), Offset(w * 0.35f, h * 0.95f), w * 0.7f), w * 0.7f, Offset(w * 0.35f, h * 0.95f))
        drawStars(stars, t)
    }
}
