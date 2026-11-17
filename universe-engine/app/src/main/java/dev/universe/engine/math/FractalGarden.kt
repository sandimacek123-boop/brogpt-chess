package dev.universe.engine.math

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

private val GardenInfo = LabInfo(
    equations = listOf(
        "D = \\frac{\\ln N}{\\ln s}",
        "D_{\\text{Koch}} = \\frac{\\ln 4}{\\ln 3} \\approx 1.2619, \\qquad D_{\\text{Sierpinski}} = \\frac{\\ln 3}{\\ln 2} \\approx 1.585",
        "P_n = 3\\left(\\tfrac{4}{3}\\right)^n \\to \\infty, \\qquad A_n \\to \\tfrac{8}{5}A_0",
    ),
    about = "A fractal is built by repeating one simple rule at ever smaller scales. If a shape is made of N copies of itself, each s times smaller, its dimension is ln N / ln s — and for these shapes that is not a whole number. The Koch snowflake encloses a finite area with an infinitely long edge. The Sierpinski triangle has zero area. The fern is four affine maps chosen at random, and the tree is one branching rule.",
    notes = listOf(
        "Only a finite number of iterations can be drawn; the true fractals are the limits. Beyond the depth offered, new detail would be smaller than a pixel.",
        "The chaos game and the fern are random processes: the picture emerges statistically, so early frames look like noise.",
        "The tree is a geometric rule, not a botanical growth model.",
    ),
)

private fun koch(depth: Int): FloatArray {
    var pts = floatArrayOf(0f, 0f, 1f, 0f, 0.5f, -0.8660254f, 0f, 0f)
    repeat(depth) {
        val n = pts.size / 2 - 1
        val out = FloatArray((n * 4 + 1) * 2)
        var o = 0
        for (i in 0 until n) {
            val ax = pts[i * 2]; val ay = pts[i * 2 + 1]; val bx = pts[i * 2 + 2]; val by = pts[i * 2 + 3]
            val dx = (bx - ax) / 3; val dy = (by - ay) / 3
            out[o++] = ax; out[o++] = ay
            out[o++] = ax + dx; out[o++] = ay + dy
            out[o++] = ax + dx + (dx * 0.5f - dy * 0.8660254f); out[o++] = ay + dy + (dy * 0.5f + dx * 0.8660254f)
            out[o++] = ax + 2 * dx; out[o++] = ay + 2 * dy
        }
        out[o++] = pts[pts.size - 2]; out[o] = pts[pts.size - 1]
        pts = out
    }
    return pts
}

private fun dragon(depth: Int): FloatArray {
    // Fold a strip of paper in half `depth` times: the turn sequence is the regular paper-folding sequence.
    val n = 1 shl depth
    val pts = FloatArray((n + 1) * 2)
    var x = 0f; var y = 0f; var dx = 1f; var dy = 0f
    for (i in 1..n) {
        x += dx; y += dy
        pts[i * 2] = x; pts[i * 2 + 1] = y
        val right = (((i and -i) shl 1) and i) != 0
        val t = dx
        if (right) { dx = -dy; dy = t } else { dx = dy; dy = -t }
    }
    return pts
}

@Composable
fun FractalGardenLab() {
    var mode by remember { mutableIntStateOf(0) }
    var depth by remember { mutableIntStateOf(4) }
    var angle by remember { mutableFloatStateOf(26f) }
    var ratio by remember { mutableFloatStateOf(0.72f) }
    var chaos by remember { mutableStateOf(false) }
    var curl by remember { mutableFloatStateOf(0.04f) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    val time by rememberTime(mode == 2)
    val maxDepth = when (mode) { 0 -> 6; 1 -> 8; 2 -> 11; 3 -> 15; else -> 1 }
    val d = depth.coerceAtMost(maxDepth)
    val kochPts = remember(d, mode) { if (mode == 0) koch(d) else FloatArray(0) }
    val dragonPts = remember(d, mode) { if (mode == 3) dragon(d) else FloatArray(0) }
    val field = remember(px) { if (px.width > 8) PixelField(px.width / 2, px.height / 2) else null }
    val rng = remember { Random(42) }
    var cgx by remember { mutableFloatStateOf(0.3f) }
    var cgy by remember { mutableFloatStateOf(0.3f) }
    var plotted by remember { mutableIntStateOf(0) }
    val path = remember { Path() }
    val levels = remember { Array(12) { Path() } }

    LaunchedEffect(mode, chaos, curl, field) { field?.clear(); plotted = 0; cgx = 0f; cgy = 0f }
    val frame = rememberTicker((mode == 4 || (mode == 1 && chaos)) && field != null) {
        val f = field ?: return@rememberTicker
        if (plotted > 400_000) return@rememberTicker
        val w = f.w; val h = f.h
        if (mode == 4) {
            val s = min(w / 5.6f, h / 10.6f)
            repeat(3500) {
                val r = rng.nextFloat()
                val x = cgx; val y = cgy
                when {
                    r < 0.01f -> { cgx = 0f; cgy = 0.16f * y }
                    r < 0.86f -> { cgx = 0.85f * x + curl * y; cgy = -curl * x + 0.85f * y + 1.6f }
                    r < 0.93f -> { cgx = 0.2f * x - 0.26f * y; cgy = 0.23f * x + 0.22f * y + 1.6f }
                    else -> { cgx = -0.15f * x + 0.28f * y; cgy = 0.26f * x + 0.24f * y + 0.44f }
                }
                f.add((w / 2 + (cgx - 0.25f) * s).toInt(), (h * 0.97f - cgy * s).toInt(), 8, 46 + (cgy * 9).toInt(), 30)
            }
            plotted += 3500
        } else {
            val side = min(w * 0.9f, h * 0.9f / 0.866f)
            val ax = w / 2f; val ay = h / 2f - side * 0.433f
            val bx = w / 2f - side / 2; val by = h / 2f + side * 0.433f
            val cx = w / 2f + side / 2
            if (plotted == 0) { cgx = ax; cgy = ay }
            repeat(1200) {
                when (rng.nextInt(3)) { 0 -> { cgx = (cgx + ax) / 2; cgy = (cgy + ay) / 2 }; 1 -> { cgx = (cgx + bx) / 2; cgy = (cgy + by) / 2 }; else -> { cgx = (cgx + cx) / 2; cgy = (cgy + by) / 2 } }
                f.add(cgx.toInt(), cgy.toInt(), 30, 90, 110)
            }
            plotted += 1200
        }
        f.flush()
    }

    LabScaffold("Fractal Garden", Domain.Math, GardenInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val s = min(w, h * 0.9f) * 0.7f
                    val ox = (w - s) / 2; val oy = h / 2 + s * 0.1f
                    path.rewind()
                    for (i in 0 until kochPts.size / 2) { val x = ox + kochPts[i * 2] * s; val y = oy + kochPts[i * 2 + 1] * s; if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
                    path.close()
                    drawPath(path, UE.Cyan.copy(alpha = 0.08f))
                    glowPath(path, UE.Cyan, (if (d >= 5) 1f else 1.6f) * dp)
                }
                1 -> {
                    if (chaos && field != null) { frame.value; drawField(field) }
                    else {
                        val side = min(w * 0.9f, h * 0.9f / 0.866f)
                        path.rewind()
                        fun tri(ax: Float, ay: Float, s: Float, lvl: Int) {
                            if (lvl == 0) { path.moveTo(ax, ay); path.lineTo(ax - s / 2, ay + s * 0.866f); path.lineTo(ax + s / 2, ay + s * 0.866f); path.close() }
                            else { tri(ax, ay, s / 2, lvl - 1); tri(ax - s / 4, ay + s * 0.433f, s / 2, lvl - 1); tri(ax + s / 4, ay + s * 0.433f, s / 2, lvl - 1) }
                        }
                        tri(w / 2, h / 2 - side * 0.433f, side, d)
                        drawPath(path, UE.Violet.copy(alpha = 0.55f))
                        if (d <= 6) drawPath(path, UE.Cyan, style = Stroke(dp))
                    }
                }
                2 -> {
                    for (p in levels) p.rewind()
                    val base = h * 0.26f
                    val a0 = angle * PI.toFloat() / 180f
                    fun branch(x: Float, y: Float, dir: Float, len: Float, lvl: Int) {
                        val sway = 0.035f * sin(time * 1.3f + lvl * 0.9f + x * 0.01f) * (lvl + 1)
                        val nx = x + sin(dir + sway) * len; val ny = y - cos(dir + sway) * len
                        levels[lvl].moveTo(x, y); levels[lvl].lineTo(nx, ny)
                        if (lvl < d) { branch(nx, ny, dir + sway - a0, len * ratio, lvl + 1); branch(nx, ny, dir + sway + a0, len * ratio, lvl + 1) }
                    }
                    branch(w / 2, h * 0.96f, 0f, base, 0)
                    for (l in 0..d) drawPath(levels[l], lerp(UE.Violet, UE.Cyan, l / d.coerceAtLeast(1).toFloat()), style = Stroke(((d - l) * 0.9f + 1f) * dp, cap = StrokeCap.Round))
                }
                3 -> {
                    var minX = 0f; var maxX = 0f; var minY = 0f; var maxY = 0f
                    for (i in 0 until dragonPts.size / 2) { minX = min(minX, dragonPts[i * 2]); maxX = max(maxX, dragonPts[i * 2]); minY = min(minY, dragonPts[i * 2 + 1]); maxY = max(maxY, dragonPts[i * 2 + 1]) }
                    val s = min(w * 0.88f / (maxX - minX).coerceAtLeast(1f), h * 0.88f / (maxY - minY).coerceAtLeast(1f))
                    val ox = w / 2 - (minX + maxX) / 2 * s; val oy = h / 2 - (minY + maxY) / 2 * s
                    val n = dragonPts.size / 2
                    val chunks = 8
                    for (c in 0 until chunks) {
                        path.rewind()
                        val a = c * (n - 1) / chunks; val b = (c + 1) * (n - 1) / chunks
                        for (i in a..b) { val x = ox + dragonPts[i * 2] * s; val y = oy + dragonPts[i * 2 + 1] * s; if (i == a) path.moveTo(x, y) else path.lineTo(x, y) }
                        drawPath(path, lerp(UE.Cyan, UE.Magenta, c / (chunks - 1f)), style = Stroke((if (d > 11) 1f else 1.6f) * dp))
                    }
                }
                else -> if (field != null) { frame.value; drawField(field) }
            }
        }
    }) {
        ChipRow(listOf("Koch snowflake", "Sierpinski", "Tree", "Dragon curve", "Barnsley fern"), mode) { mode = it; depth = depth.coerceAtMost(when (it) { 0 -> 6; 1 -> 8; 2 -> 11; 3 -> 15; else -> 1 }) }
        if (mode < 4 && !(mode == 1 && chaos)) IntSlider("Iterations", d, (if (mode == 2) 1 else 0)..maxDepth) { depth = it }
        when (mode) {
            0 -> {
                ReadoutRow {
                    Stat("segments", groupDigits(3L * 4.0.pow(d).toLong())); Stat("perimeter", fix(3 * (4.0 / 3).pow(d), 3), UE.Cyan)
                    Stat("area / A₀", fix(1 + 0.6 * (1 - (4.0 / 9).pow(d)), 4), UE.Violet); Stat("dimension", "1.2619", UE.Amber)
                }
                Note("Every iteration multiplies the perimeter by 4/3 — it grows without limit — while the area creeps toward 8/5 of the starting triangle. A curve of infinite length around a finite island.")
            }
            1 -> {
                Toggle("Play the chaos game", chaos, accent = UE.Violet) { chaos = it }
                ReadoutRow { Stat("triangles", groupDigits(3.0.pow(d).toLong())); Stat("area left", fix((0.75).pow(d) * 100, 2) + " %", UE.Violet); Stat("dimension", "1.5850", UE.Amber) }
                Note(if (chaos) "Start anywhere. Repeatedly jump halfway toward a randomly chosen corner. Pure chance draws the same perfect triangle." else "Remove the middle quarter of every triangle, forever. Three copies at half the size: D = ln 3 / ln 2.")
            }
            2 -> {
                UESlider("Branch angle", angle, 8f..70f, format = { "${fix(it, 1)}°" }) { angle = it }
                UESlider("Length ratio", ratio, 0.5f..0.82f, format = { fix(it, 3) }) { ratio = it }
                ReadoutRow { Stat("branches", groupDigits((1L shl (d + 1)) - 1)); Stat("tips", groupDigits(1L shl d), UE.Cyan); Stat("ratio 1/φ", "0.618", UE.Amber) }
                Note("One rule — split in two, shrink, repeat. At ratio 1/φ ≈ 0.618 and 60° the branch tips just touch without overlapping.")
            }
            3 -> {
                ReadoutRow { Stat("segments", groupDigits(1L shl d)); Stat("folds", d.toString(), UE.Cyan); Stat("boundary D", "1.5236", UE.Amber) }
                Note("Fold a paper strip in half $d times, then open every crease to 90°. The curve never crosses itself and tiles the plane.")
            }
            else -> {
                UESlider("Leaf curl", curl, -0.12f..0.14f, format = { fix(it, 3) }) { curl = it }
                ReadoutRow { Stat("points", groupDigits(plotted.toLong())); Stat("affine maps", "4", UE.Cyan); Stat("numbers needed", "28", UE.Amber) }
                Note("Four linear maps — stem, main leaf, left and right leaflets — chosen with probabilities 1%, 85%, 7%, 7%. Twenty-eight numbers encode the whole fern.")
            }
        }
    }
}
