package com.quantumath.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quantumath.app.ui.theme.LabColors
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.math.plot.Plotter
import com.quantumath.math.plot.Polyline
import com.quantumath.math.plot.Viewport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.*

/** World ↔ screen mapping for a viewport drawn into a canvas of the given size. */
class Mapper(val vp: Viewport, val w: Float, val h: Float) {
    fun sx(x: Double) = ((x - vp.xMin) / vp.width * w).toFloat()
    fun sy(y: Double) = (h - (y - vp.yMin) / vp.height * h).toFloat()
    fun wx(px: Float) = vp.xMin + px / w * vp.width
    fun wy(py: Float) = vp.yMin + (h - py) / h * vp.height
}

/** drawText that never crashes when a label lands at or beyond the canvas edge (Compose throws on negative width). */
fun DrawScope.drawTextSafe(tm: TextMeasurer, text: String, topLeft: Offset, style: TextStyle) {
    if (!topLeft.x.isFinite() || !topLeft.y.isFinite() || topLeft.x > size.width - 8f || topLeft.y > size.height - 4f || text.isEmpty()) return
    drawText(tm, text, topLeft, style)
}

fun niceStep(range: Double, target: Int): Double {
    val raw = range / target
    val mag = 10.0.pow(floor(log10(raw)))
    val n = raw / mag
    return mag * when { n < 1.5 -> 1.0; n < 3.5 -> 2.0; n < 7.5 -> 5.0; else -> 10.0 }
}

fun fmtTick(v: Double, step: Double): String {
    if (abs(v) < step * 1e-6) return "0"
    val decimals = max(0, -floor(log10(step)).toInt())
    return if (abs(v) >= 1e6 || abs(v) < 1e-4) "%.1e".format(v) else "%.${decimals}f".format(v)
}

fun DrawScope.drawGrid(m: Mapper, lab: LabColors, tm: TextMeasurer, labels: Boolean = true, labelColor: Color = lab.axis) {
    val vp = m.vp
    val sxStep = niceStep(vp.width, max(3, (size.width / 110).toInt()))
    val syStep = niceStep(vp.height, max(3, (size.height / 90).toInt()))
    val minor = lab.grid.copy(alpha = lab.grid.alpha * 0.5f)
    // minor grid
    run {
        var x = ceil(vp.xMin / (sxStep / 5)) * (sxStep / 5)
        while (x <= vp.xMax) { val px = m.sx(x); drawLine(minor, Offset(px, 0f), Offset(px, size.height), 1f); x += sxStep / 5 }
        var y = ceil(vp.yMin / (syStep / 5)) * (syStep / 5)
        while (y <= vp.yMax) { val py = m.sy(y); drawLine(minor, Offset(0f, py), Offset(size.width, py), 1f); y += syStep / 5 }
    }
    val style = TextStyle(fontSize = 10.sp, color = labelColor)
    val axisY = m.sy(0.0).coerceIn(0f, size.height - 14f)
    val axisX = m.sx(0.0).coerceIn(0f, size.width - 30f)
    var x = ceil(vp.xMin / sxStep) * sxStep
    while (x <= vp.xMax) {
        val px = m.sx(x)
        drawLine(lab.grid, Offset(px, 0f), Offset(px, size.height), 1f)
        if (labels && abs(x) > sxStep * 1e-6) drawTextSafe(tm, fmtTick(x, sxStep), Offset(px + 3f, axisY + 2f), style)
        x += sxStep
    }
    var y = ceil(vp.yMin / syStep) * syStep
    while (y <= vp.yMax) {
        val py = m.sy(y)
        drawLine(lab.grid, Offset(0f, py), Offset(size.width, py), 1f)
        if (labels && abs(y) > syStep * 1e-6) drawTextSafe(tm, fmtTick(y, syStep), Offset(axisX + 4f, py - 14f), style)
        y += syStep
    }
    if (vp.yMin <= 0 && vp.yMax >= 0) drawLine(lab.axis, Offset(0f, m.sy(0.0)), Offset(size.width, m.sy(0.0)), 1.6f)
    if (vp.xMin <= 0 && vp.xMax >= 0) drawLine(lab.axis, Offset(m.sx(0.0), 0f), Offset(m.sx(0.0), size.height), 1.6f)
}

fun DrawScope.drawPolylines(m: Mapper, lines: List<Polyline>, color: Color, width: Float = 3f, glow: Boolean = true) {
    for (l in lines) {
        if (l.size < 2) continue
        val path = Path()
        path.moveTo(m.sx(l.xs[0]), m.sy(l.ys[0]))
        for (i in 1 until l.size) path.lineTo(m.sx(l.xs[i]), m.sy(l.ys[i]))
        if (glow) drawPath(path, color.copy(alpha = 0.22f), style = Stroke(width * 3.2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawPath(path, color, style = Stroke(width, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

data class PlotCurve(val f: (Double) -> Double, val color: Color, val label: String = "", val dashed: Boolean = false)
data class PlotPoint(val x: Double, val y: Double, val color: Color, val label: String = "")
data class PlotShade(val f: (Double) -> Double, val a: Double, val b: Double, val color: Color)
data class PlotSegment(val x0: Double, val y0: Double, val x1: Double, val y1: Double, val color: Color)

/** A compact, non-interactive plot used by the calculus, statistics and trig tools. */
@Composable
fun MiniPlot(
    curves: List<PlotCurve>,
    viewport: Viewport,
    modifier: Modifier = Modifier,
    height: Dp = 220.dp,
    points: List<PlotPoint> = emptyList(),
    shade: PlotShade? = null,
    segments: List<PlotSegment> = emptyList(),
    description: String = "Plot",
    extraDraw: (DrawScope.(Mapper) -> Unit)? = null,
) {
    val lab = LocalLab.current
    val tm = rememberTextMeasurer()
    val lines by produceState<List<List<Polyline>>>(emptyList(), curves, viewport) {
        value = withContext(Dispatchers.Default) { curves.map { c -> runCatching { Plotter.function(c.f, viewport, 700) }.getOrDefault(emptyList()) } }
    }
    val shadeLines by produceState<Polyline?>(null, shade, viewport) {
        value = shade?.let { s -> withContext(Dispatchers.Default) {
            val n = 300; val xs = DoubleArray(n + 1) { s.a + (s.b - s.a) * it / n }
            Polyline(xs, DoubleArray(n + 1) { i -> s.f(xs[i]).let { v -> if (v.isFinite()) v.coerceIn(viewport.yMin - viewport.height, viewport.yMax + viewport.height) else 0.0 } })
        } }
    }
    Canvas(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(16.dp)).semantics { contentDescription = description }) {
        drawRect(if (lab.dark) Color(0xFF0D0D14) else Color(0xFFFAFAFE))
        val m = Mapper(viewport, size.width, size.height)
        drawGrid(m, lab, tm)
        val sl = shadeLines
        if (shade != null && sl != null && sl.size > 1) {
            val p = Path()
            p.moveTo(m.sx(sl.xs[0]), m.sy(0.0))
            for (i in 0 until sl.size) p.lineTo(m.sx(sl.xs[i]), m.sy(sl.ys[i]))
            p.lineTo(m.sx(sl.xs.last()), m.sy(0.0)); p.close()
            drawPath(p, shade.color.copy(alpha = 0.28f))
        }
        extraDraw?.invoke(this, m)
        for (s in segments) drawLine(s.color, Offset(m.sx(s.x0), m.sy(s.y0)), Offset(m.sx(s.x1), m.sy(s.y1)), 2.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f)))
        curves.forEachIndexed { i, c -> lines.getOrNull(i)?.let { drawPolylines(m, it, c.color, 3f, glow = !c.dashed) } }
        for (p in points) {
            if (!p.x.isFinite() || !p.y.isFinite()) continue
            val o = Offset(m.sx(p.x), m.sy(p.y))
            drawCircle(p.color.copy(alpha = 0.3f), 11f, o); drawCircle(p.color, 6f, o); drawCircle(Color.White, 2.5f, o)
            if (p.label.isNotEmpty()) drawTextSafe(tm, p.label, o + Offset(8f, -22f), TextStyle(fontSize = 10.sp, color = p.color))
        }
    }
}

/** Fit a viewport around a function on [a, b] (robust to spikes). */
fun autoViewport(f: (Double) -> Double, a: Double, b: Double, pad: Double = 0.15): Viewport {
    val ys = (0..200).map { f(a + (b - a) * it / 200) }.filter { it.isFinite() }.sorted()
    if (ys.isEmpty()) return Viewport(a, b, -5.0, 5.0)
    var lo = ys[(ys.size * 0.03).toInt()]; var hi = ys[((ys.size - 1) * 0.97).toInt()]
    lo = min(lo, 0.0).let { if (it < lo - (hi - lo) * 2) lo else it }; hi = max(hi, 0.0).let { if (it > hi + (hi - lo) * 2) hi else it }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
    val p = (hi - lo) * pad
    return Viewport(a, b, lo - p, hi + p)
}
