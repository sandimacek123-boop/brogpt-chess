package dev.universe.engine.core.ui

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin

// ---------------------------------------------------------------- frame clock

/**
 * Runs [onFrame] once per display frame with the elapsed time in seconds (clamped so a hiccup
 * never explodes a simulation). Returns a counter state; read it inside a draw block to repaint.
 */
@Composable
fun rememberTicker(running: Boolean = true, onFrame: (dt: Float) -> Unit): State<Long> {
    val frame = remember { mutableLongStateOf(0L) }
    val cb by rememberUpdatedState(onFrame)
    LaunchedEffect(running) {
        if (!running) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                val dt = if (last == 0L) 1f / 60f else ((now - last) / 1e9f).coerceIn(0f, 0.05f)
                last = now
                cb(dt)
                frame.longValue++
            }
        }
    }
    return frame
}

/** Seconds since this composable entered the composition, advancing every frame. */
@Composable
fun rememberTime(running: Boolean = true, speed: Float = 1f): State<Float> {
    val t = remember { mutableFloatStateOf(0f) }
    val sp by rememberUpdatedState(speed)
    rememberTicker(running) { dt -> t.floatValue += dt * sp }
    return t
}

// ---------------------------------------------------------------- canvas text

/** Draws [text] anchored at ([x], [y]); anchors are fractions of the text box (0 = left/top, 1 = right/bottom). */
fun DrawScope.label(
    tm: TextMeasurer, text: String, x: Float, y: Float, color: Color = UE.Dim, size: Float = 10f,
    ax: Float = 0f, ay: Float = 0f, font: FontFamily = UE.Mono, weight: FontWeight = FontWeight.Normal,
) {
    if (text.isEmpty()) return
    val res = tm.measure(text, TextStyle(fontFamily = font, fontSize = size.sp, fontWeight = weight, platformStyle = PlatformTextStyle(includeFontPadding = false)), softWrap = false, maxLines = 1)
    drawText(res, color = color, topLeft = Offset(x - res.size.width * ax, y - res.size.height * ay))
}

/** A line with a soft additive halo: the signature stroke of the instrument. */
fun DrawScope.glowLine(a: Offset, b: Offset, color: Color, width: Float = 2f, glow: Float = 3.2f) {
    drawLine(color.copy(alpha = color.alpha * 0.22f), a, b, width * glow, StrokeCap.Round, blendMode = BlendMode.Plus)
    drawLine(color, a, b, width, StrokeCap.Round)
}

fun DrawScope.glowPath(path: Path, color: Color, width: Float = 2f, glow: Float = 3.2f) {
    drawPath(path, color.copy(alpha = color.alpha * 0.2f), style = Stroke(width * glow, cap = StrokeCap.Round, join = StrokeJoin.Round), blendMode = BlendMode.Plus)
    drawPath(path, color, style = Stroke(width, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

fun DrawScope.glowDot(c: Offset, color: Color, r: Float = 5f) {
    drawCircle(color.copy(alpha = 0.2f), r * 2.6f, c, blendMode = BlendMode.Plus)
    drawCircle(color, r, c)
    drawCircle(Color.White.copy(alpha = 0.9f), r * 0.42f, c)
}

fun DrawScope.arrow(a: Offset, b: Offset, color: Color, width: Float = 2f, head: Float = 9f) {
    val d = b - a
    val len = d.getDistance()
    if (len < 0.5f) return
    val u = d / len
    val n = Offset(-u.y, u.x)
    val h = head.coerceAtMost(len * 0.6f)
    drawLine(color, a, b - u * (h * 0.6f), width, StrokeCap.Round)
    val p = Path()
    p.moveTo(b.x, b.y)
    val l = b - u * h + n * (h * 0.48f)
    val r = b - u * h - n * (h * 0.48f)
    p.lineTo(l.x, l.y); p.lineTo(r.x, r.y); p.close()
    drawPath(p, color)
}

// ---------------------------------------------------------------- 2D plot viewport

/** World <-> screen mapping for 2D plots, with pan and pinch-zoom. */
@Stable
class PlotView(cx: Double = 0.0, cy: Double = 0.0, span: Double = 10.0, val minSpan: Double = 1e-6, val maxSpan: Double = 1e6) {
    var cx by mutableDoubleStateOf(cx)
    var cy by mutableDoubleStateOf(cy)
    /** World units visible across the canvas width. */
    var span by mutableDoubleStateOf(span)
    var w = 1f
    var h = 1f
    /** Vertical exaggeration: world y units are drawn this many times taller than x units. */
    var yStretch = 1.0

    val scale: Double get() = w / span
    fun sx(x: Double): Float = ((x - cx) * scale + w / 2).toFloat()
    fun sy(y: Double): Float = (h / 2 - (y - cy) * scale * yStretch).toFloat()
    fun wx(px: Float): Double = cx + (px - w / 2) / scale
    fun wy(py: Float): Double = cy + (h / 2 - py) / (scale * yStretch)
    fun pt(x: Double, y: Double) = Offset(sx(x), sy(y))
    val left: Double get() = wx(0f)
    val right: Double get() = wx(w)
    val bottom: Double get() = wy(h)
    val top: Double get() = wy(0f)

    fun bind(scope: DrawScope) { w = scope.size.width; h = scope.size.height }

    fun zoomAt(px: Float, py: Float, factor: Float) {
        val wx0 = wx(px); val wy0 = wy(py)
        span = (span / factor).coerceIn(minSpan, maxSpan)
        cx = wx0 - (px - w / 2) / scale
        cy = wy0 - (h / 2 - py) / (scale * yStretch)
    }

    fun panBy(dx: Float, dy: Float) { cx -= dx / scale; cy += dy / (scale * yStretch) }
}

fun Modifier.plotGestures(v: PlotView, enabled: Boolean = true): Modifier = pointerInput(v, enabled) {
    if (enabled) detectTransformGestures { centroid, pan, zoom, _ ->
        v.panBy(pan.x, pan.y)
        if (zoom != 1f) v.zoomAt(centroid.x, centroid.y, zoom)
    }
}

/**
 * Unified canvas interaction: two fingers always pan and zoom the viewport; one finger pans unless
 * [onSingle] claims the gesture on touch-down (phase 0 = down, 1 = move, 2 = up) by returning true —
 * that is how draggable handles and trace cursors coexist with panning. [onTap] fires for a tap that did neither.
 */
fun Modifier.plotInteract(
    v: PlotView?, key: Any? = Unit, zoomable: Boolean = true,
    onTap: ((Offset) -> Unit)? = null,
    onSingle: ((Offset, Int) -> Boolean)? = null,
): Modifier = pointerInput(v, key) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        var captured = onSingle?.invoke(down.position, 0) ?: false
        var travelled = 0f
        var last = down.position
        var multi = false
        while (true) {
            val event = awaitPointerEvent()
            val pressed = event.changes.filter { it.pressed }
            if (pressed.isEmpty()) break
            if (pressed.size > 1) multi = true
            if (captured && pressed.size == 1 && !multi) {
                last = pressed[0].position
                onSingle?.invoke(last, 1)
                pressed[0].consume()
            } else {
                if (captured) { onSingle?.invoke(last, 2); captured = false }
                val pan = event.calculatePan()
                val zoom = event.calculateZoom()
                travelled += pan.getDistance()
                if (v != null && zoomable && (travelled > viewConfiguration.touchSlop || zoom != 1f)) {
                    v.panBy(pan.x, pan.y)
                    if (zoom != 1f) { val c = event.calculateCentroid(useCurrent = false); if (c != Offset.Unspecified) v.zoomAt(c.x, c.y, zoom) }
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            }
        }
        if (captured) onSingle?.invoke(last, 2)
        else if (!multi && travelled <= viewConfiguration.touchSlop) onTap?.invoke(down.position)
    }
}

fun niceStep(span: Double, target: Int = 6): Double {
    val raw = span / target
    val p = 10.0.pow(floor(log10(raw)))
    val m = raw / p
    return p * when { m < 1.5 -> 1.0; m < 3.5 -> 2.0; m < 7.5 -> 5.0; else -> 10.0 }
}

fun tickLabel(v: Double, step: Double): String {
    if (abs(v) < step * 1e-6) return "0"
    val dec = (-floor(log10(step))).toInt().coerceIn(0, 8)
    return if (abs(v) >= 1e6 || abs(v) < 1e-4) fmt(v, 3) else fix(v, dec)
}

/** Grid, axes and tick labels for a [PlotView]. Call [PlotView.bind] first. */
fun DrawScope.drawPlotGrid(v: PlotView, tm: TextMeasurer, labels: Boolean = true, accent: Color = UE.Cyan, xUnit: String = "", minor: Boolean = true) {
    val stepX = niceStep(v.span)
    val stepY = niceStep(v.span / v.yStretch * (v.h / v.w), (6 * v.h / v.w).toInt().coerceIn(3, 10))
    val gridC = Color.White.copy(alpha = 0.07f)
    val minorC = Color.White.copy(alpha = 0.03f)
    if (minor) {
        var mx = floor(v.left / (stepX / 5)) * (stepX / 5)
        while (mx <= v.right) { val px = v.sx(mx); drawLine(minorC, Offset(px, 0f), Offset(px, v.h), 1f); mx += stepX / 5 }
        var my = floor(v.bottom / (stepY / 5)) * (stepY / 5)
        while (my <= v.top) { val py = v.sy(my); drawLine(minorC, Offset(0f, py), Offset(v.w, py), 1f); my += stepY / 5 }
    }
    val axisY = v.sy(0.0).coerceIn(0f, v.h)
    val axisX = v.sx(0.0).coerceIn(0f, v.w)
    var x = floor(v.left / stepX) * stepX
    while (x <= v.right) {
        val px = v.sx(x)
        drawLine(gridC, Offset(px, 0f), Offset(px, v.h), 1f)
        if (labels && abs(x) > stepX * 1e-6) label(tm, tickLabel(x, stepX) + xUnit, px, (axisY + 4f).coerceAtMost(v.h - 16.sp.toPx()), UE.Dim.copy(alpha = 0.8f), 9f, ax = 0.5f)
        x += stepX
    }
    var y = floor(v.bottom / stepY) * stepY
    while (y <= v.top) {
        val py = v.sy(y)
        drawLine(gridC, Offset(0f, py), Offset(v.w, py), 1f)
        if (labels && abs(y) > stepY * 1e-6) label(tm, tickLabel(y, stepY), (axisX + 5f).coerceAtMost(v.w - 34.sp.toPx()), py, UE.Dim.copy(alpha = 0.8f), 9f, ay = 0.5f)
        y += stepY
    }
    val axisC = accent.copy(alpha = 0.45f)
    if (v.sy(0.0) in 0f..v.h) drawLine(axisC, Offset(0f, v.sy(0.0)), Offset(v.w, v.sy(0.0)), 1.4f)
    if (v.sx(0.0) in 0f..v.w) drawLine(axisC, Offset(v.sx(0.0), 0f), Offset(v.sx(0.0), v.h), 1.4f)
}

/**
 * Builds the screen-space path of y = f(x) across the viewport, lifting the pen at
 * non-finite values and at jumps (asymptotes) so tan x and 1/x draw honestly.
 */
inline fun PlotView.curve(path: Path, x0: Double = left, x1: Double = right, stepPx: Float = 1.5f, f: (Double) -> Double): Path {
    path.rewind()
    val a = maxOf(x0, left)
    val b = minOf(x1, right)
    if (b <= a) return path
    val n = ((sx(b) - sx(a)) / stepPx).toInt().coerceIn(2, 4000)
    var pen = false
    var lastY = 0f
    for (i in 0..n) {
        val x = a + (b - a) * i / n
        val y = f(x)
        if (y.isNaN() || y.isInfinite()) { pen = false; continue }
        val py = sy(y)
        val px = sx(x)
        if (py < -h * 4 || py > h * 5) { pen = false; lastY = py; continue }
        if (pen && abs(py - lastY) > h * 0.9f) pen = false
        if (pen) path.lineTo(px, py) else { path.moveTo(px, py); pen = true }
        lastY = py
    }
    return path
}

// ---------------------------------------------------------------- 3D camera

/** Orbit camera for hand-rolled 3D on a 2D canvas (painter's algorithm, perspective divide). */
@Stable
class Cam3(yaw: Float = 0.6f, pitch: Float = 0.45f, dist: Float = 6f, var focal: Float = 1.6f) {
    var yaw by mutableFloatStateOf(yaw)
    var pitch by mutableFloatStateOf(pitch)
    var dist by mutableFloatStateOf(dist)
    private var cy = 1f; private var sy = 0f; private var cp = 1f; private var sp = 0f
    private var cxp = 0f; private var cyp = 0f; private var k = 1f

    /** Cache trig and viewport; call once per frame before [project]. */
    fun begin(w: Float, h: Float, centerY: Float = 0.5f) {
        cy = cos(yaw); sy = sin(yaw); cp = cos(pitch); sp = sin(pitch)
        cxp = w / 2; cyp = h * centerY; k = minOf(w, h) * 0.5f * focal
    }

    /** Projects world (x, y up, z) to out = [screenX, screenY, depth, pixelsPerUnit]. Returns false when behind the camera. */
    fun project(x: Float, y: Float, z: Float, out: FloatArray): Boolean {
        val x1 = x * cy + z * sy
        val z1 = -x * sy + z * cy
        val y2 = y * cp - z1 * sp
        val z2 = y * sp + z1 * cp
        val d = dist - z2
        if (d < 0.05f) return false
        val s = k / d
        out[0] = cxp + x1 * s
        out[1] = cyp - y2 * s
        out[2] = d
        out[3] = s
        return true
    }
}

fun Modifier.orbitGestures(cam: Cam3, minDist: Float = 1.5f, maxDist: Float = 60f, onMoved: () -> Unit = {}): Modifier = pointerInput(cam) {
    detectTransformGestures { _, pan, zoom, _ ->
        cam.yaw += pan.x * 0.008f
        cam.pitch = (cam.pitch + pan.y * 0.008f).coerceIn(-1.55f, 1.55f)
        if (zoom != 1f) cam.dist = (cam.dist / zoom).coerceIn(minDist, maxDist)
        onMoved()
    }
}

/** Single-finger drag that reports canvas positions; used for draggable handles. */
fun Modifier.dragPoints(key: Any? = Unit, onStart: (Offset) -> Unit = {}, onEnd: () -> Unit = {}, onDrag: (Offset) -> Unit): Modifier = pointerInput(key) {
    detectDragGestures(onDragStart = { onStart(it); onDrag(it) }, onDragEnd = onEnd, onDragCancel = onEnd) { change, _ -> onDrag(change.position); change.consume() }
}

// ---------------------------------------------------------------- pixel fields

/**
 * A CPU-side pixel buffer shown as a texture: used for heat maps, wave tanks and dense point clouds
 * where issuing one draw call per sample would be far too slow.
 */
class PixelField(val w: Int, val h: Int) {
    val px = IntArray(w * h) { 0xFF000000.toInt() }
    private val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
    val image: androidx.compose.ui.graphics.ImageBitmap = bmp.asImageBitmap()

    fun clear() { px.fill(0xFF000000.toInt()) }

    /** Saturating additive plot of an RGB colour. */
    fun add(x: Int, y: Int, r: Int, g: Int, b: Int) {
        if (x < 0 || y < 0 || x >= w || y >= h) return
        val i = y * w + x
        val c = px[i]
        val nr = minOf(255, ((c shr 16) and 255) + r); val ng = minOf(255, ((c shr 8) and 255) + g); val nb = minOf(255, (c and 255) + b)
        px[i] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
    }

    fun flush() { bmp.setPixels(px, 0, w, 0, 0, w, h) }
}

/** Stretches a [PixelField] over the canvas. Black is transparent when [additive]. */
fun DrawScope.drawField(f: PixelField, additive: Boolean = true, smooth: Boolean = true, alpha: Float = 1f) {
    drawImage(
        f.image, dstSize = androidx.compose.ui.unit.IntSize(size.width.toInt().coerceAtLeast(1), size.height.toInt().coerceAtLeast(1)),
        alpha = alpha, filterQuality = if (smooth) androidx.compose.ui.graphics.FilterQuality.Low else androidx.compose.ui.graphics.FilterQuality.None,
        blendMode = if (additive) BlendMode.Plus else BlendMode.SrcOver,
    )
}
