package dev.universe.engine.math

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*

private val PrimesInfo = LabInfo(
    equations = listOf(
        "\\pi(x) \\sim \\frac{x}{\\ln x} \\sim \\mathrm{Li}(x) = \\int_2^x \\frac{dt}{\\ln t}",
        "n^2 + n + 41 \\text{ is prime for } n = 0, 1, \\dots, 39",
        "(r, \\theta) = (p, p) \\quad \\text{for each prime } p",
    ),
    about = "Primes look random, yet they are full of structure. Write the integers in a square spiral and primes line up on diagonals — each diagonal is a quadratic polynomial, and some produce far more primes than chance. Plot each prime p at distance p and angle p radians and spiral arms appear, then rays: they come from good rational approximations of 2π (6/1, 44/7, 710/113) combined with the fact that primes avoid residues sharing a factor with the modulus. And although no formula gives the n-th prime, their overall density near x is 1/ln x — the Prime Number Theorem.",
    notes = listOf(
        "All primes shown come from a sieve of Eratosthenes run on the device up to 1,000,000.",
        "Li(x) is integrated numerically with the trapezoid rule on a fine logarithmic grid; it is accurate to a few units.",
        "In the polar plot, each prime is a single pixel on a reduced-resolution canvas, so at one million points neighbouring primes merge — the rays are real, the texture is sampling.",
    ),
)

private val SPF_COLORS = listOf(UE.Violet, UE.Blue, UE.Magenta, UE.Amber, UE.Green, UE.Red)

@Composable
fun PrimesLab() {
    var mode by remember { mutableIntStateOf(0) }
    var sizeIdx by remember { mutableIntStateOf(2) }
    var euler by remember { mutableStateOf(false) }
    var picked by remember { mutableIntStateOf(41) }
    var polarN by remember { mutableFloatStateOf(6000f) }
    var allInts by remember { mutableStateOf(false) }
    var countX by remember { mutableFloatStateOf(1000f) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    var playing by remember { mutableStateOf(false) }
    var speed by remember { mutableFloatStateOf(14f) }
    var progress by remember { mutableFloatStateOf(0f) }
    val tm = rememberTextMeasurer(cacheSize = 256)
    val path = remember { Path() }
    val flags = remember { Num.sieve(1_000_000) }
    val counts = remember { IntArray(1_000_001).also { c -> for (i in 1..1_000_000) c[i] = c[i - 1] + (if (flags[i]) 1 else 0) } }

    val sizes = listOf(41, 81, 121, 201, 301, 401)
    val s = sizes[sizeIdx]
    val grid = remember(s) { IntArray(s * s) }
    val ulam = remember(s, euler) {
        val f = PixelField(s, s)
        val eulerSet = HashSet<Int>(); if (euler) for (k in 0..700) { val v = k * k + k + 41; if (v <= s * s) eulerSet += v }
        var x = s / 2; var y = s / 2; var dx = 1; var dy = 0; var segLen = 1; var passed = 0; var turns = 0
        for (n in 1..s * s) {
            grid[y * s + x] = n
            f.px[y * s + x] = when {
                euler && n in eulerSet -> if (flags[n]) 0xFFFF4FD8.toInt() else 0xFF5A2550.toInt()
                flags[n] -> if (euler) 0xFF3B6F86.toInt() else 0xFF7DEBFF.toInt()
                else -> 0xFF05060C.toInt()
            }
            x += dx; y += dy; passed++
            if (passed == segLen) { passed = 0; val t = dx; dx = dy; dy = -t; turns++; if (turns % 2 == 0) segLen++ }
        }
        f.flush(); f
    }
    val polar = remember(px, polarN.roundToInt(), allInts) {
        if (px.width < 8 || mode != 1) null else {
            val f = PixelField(px.width / 2, px.height / 2)
            val n = polarN.roundToInt().coerceAtMost(if (allInts) 300_000 else 1_000_000)
            val sc = min(f.w, f.h) * 0.48 / n
            val boost = if (n < 20_000) 255 else if (n < 200_000) 190 else 150
            for (p in 2..n) if (allInts || flags[p]) {
                val a = p.toDouble()
                val ix = (f.w / 2 + cos(a) * p * sc).toInt(); val iy = (f.h / 2 - sin(a) * p * sc).toInt()
                f.add(ix, iy, boost / 3, boost * 3 / 4, boost)
                if (n < 30_000) { f.add(ix + 1, iy, boost / 6, boost / 3, boost / 2); f.add(ix, iy + 1, boost / 6, boost / 3, boost / 2) }
            }
            f.flush(); f
        }
    }
    // sieve animation: precomputed crossing-out events (prime, multiple)
    val sieveN = 120
    val events = remember {
        val ev = ArrayList<IntArray>(); val marked = BooleanArray(sieveN + 1)
        var p = 2
        while (p * p <= sieveN) { if (!marked[p]) { var m = p * p; while (m <= sieveN) { if (!marked[m]) { marked[m] = true; ev += intArrayOf(p, m) }; m += p } }; p++ }
        ev
    }
    rememberTicker(playing && mode == 2) { dt -> progress = (progress + dt * speed).coerceAtMost(events.size.toFloat()); if (progress >= events.size) playing = false }

    LabScaffold("Prime Patterns", Domain.Math, PrimesInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().onSizeChanged { px = it }.plotInteract(null, key = mode to s, onTap = { o ->
                if (mode == 0) {
                    val side = min(px.width, px.height).toFloat()
                    val ox = (px.width - side) / 2; val oy = (px.height - side) / 2
                    val cx = ((o.x - ox) / side * s).toInt(); val cy = ((o.y - oy) / side * s).toInt()
                    if (cx in 0 until s && cy in 0 until s) picked = grid[cy * s + cx]
                }
            }),
        ) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val side = min(w, h)
                    val ox = (w - side) / 2; val oy = (h - side) / 2
                    drawImage(ulam.image, dstOffset = IntOffset(ox.toInt(), oy.toInt()), dstSize = IntSize(side.toInt(), side.toInt()), filterQuality = androidx.compose.ui.graphics.FilterQuality.None)
                    val idx = grid.indexOf(picked)
                    if (idx >= 0) {
                        val cell = side / s
                        val c = Offset(ox + (idx % s + 0.5f) * cell, oy + (idx / s + 0.5f) * cell)
                        drawCircle(UE.Amber, max(cell * 1.4f, 7 * dp), c, style = Stroke(1.6f * dp))
                    }
                }
                1 -> polar?.let { drawField(it) }
                2 -> {
                    val cols = 10; val rows = sieveN / cols
                    val cell = min(w / (cols + 0.4f), h / (rows + 0.4f))
                    val ox = (w - cell * cols) / 2; val oy = (h - cell * rows) / 2
                    val done = progress.toInt()
                    val crossedBy = IntArray(sieveN + 1)
                    for (i in 0 until done) crossedBy[events[i][1]] = events[i][0]
                    val cur = if (done < events.size) events[done] else null
                    val finished = done >= events.size
                    for (n in 1..sieveN) {
                        val r = (n - 1) / cols; val c = (n - 1) % cols
                        val tl = Offset(ox + c * cell + 2 * dp, oy + r * cell + 2 * dp); val sz = Size(cell - 4 * dp, cell - 4 * dp)
                        val by = crossedBy[n]
                        val isP = by == 0 && n >= 2 && (finished || (cur != null && n <= cur[0]) || n.toLong() * n > sieveN && false)
                        val col = when {
                            n == 1 -> UE.Faint
                            by != 0 -> SPF_COLORS[listOf(2, 3, 5, 7).indexOf(by).coerceAtLeast(0)]
                            isP -> UE.Cyan
                            else -> UE.Dim
                        }
                        drawRoundRect(col.copy(alpha = if (by != 0) 0.16f else if (isP) 0.28f else 0.06f), tl, sz, CornerRadius(6 * dp))
                        if (isP || (cur != null && cur[1] == n)) drawRoundRect(if (cur != null && cur[1] == n) UE.Text else UE.Cyan, tl, sz, CornerRadius(6 * dp), style = Stroke(1.4f * dp))
                        label(tm, n.toString(), tl.x + sz.width / 2, tl.y + sz.height / 2, if (by != 0) col.copy(alpha = 0.55f) else if (isP) UE.Text else UE.Dim, (cell / dp * 0.3f).coerceIn(8f, 15f), 0.5f, 0.5f)
                        if (by != 0) drawLine(col.copy(alpha = 0.6f), tl + Offset(sz.width * 0.2f, sz.height * 0.8f), tl + Offset(sz.width * 0.8f, sz.height * 0.2f), 1.2f * dp)
                    }
                }
                else -> {
                    val xMax = countX.toDouble()
                    val left = 52 * dp; val right = w - 16 * dp; val top = h * 0.08f; val bot = h * 0.88f
                    val li = DoubleArray(301)
                    val m = 300
                    var acc = 0.0
                    var prevT = 2.0
                    for (i in 1..m) { val t = 2 + (xMax - 2) * i / m; acc += (1 / ln(prevT) + 1 / ln(t)) / 2 * (t - prevT); li[i] = acc; prevT = t }
                    val yMax = max(li[m], counts[xMax.toInt()].toDouble()) * 1.08
                    fun X(v: Double) = (left + (right - left) * (v / xMax)).toFloat()
                    fun Y(v: Double) = (bot - (bot - top) * (v / yMax)).toFloat()
                    val stepY = niceStep(yMax, 5); var gy = 0.0
                    while (gy <= yMax) { drawLine(Color.White.copy(alpha = 0.07f), Offset(left, Y(gy)), Offset(right, Y(gy)), 1f); label(tm, fmt(gy, 3), left - 6 * dp, Y(gy), UE.Dim, 9f, 1f, 0.5f); gy += stepY }
                    val stepX = niceStep(xMax, 4); var gx = 0.0
                    while (gx <= xMax) { drawLine(Color.White.copy(alpha = 0.07f), Offset(X(gx), top), Offset(X(gx), bot), 1f); label(tm, fmt(gx, 3), X(gx), bot + 5 * dp, UE.Dim, 9f, 0.5f, 0f); gx += stepX }
                    path.rewind()
                    for (i in 1..m) { val t = 2 + (xMax - 2) * i / m; val v = t / ln(t); if (i == 1) path.moveTo(X(t), Y(v)) else path.lineTo(X(t), Y(v)) }
                    drawPath(path, UE.Violet, style = Stroke(1.6f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7 * dp, 5 * dp))))
                    path.rewind(); path.moveTo(X(2.0), Y(0.0))
                    for (i in 1..m) path.lineTo(X(2 + (xMax - 2) * i / m), Y(li[i]))
                    drawPath(path, UE.Amber, style = Stroke(1.6f * dp))
                    path.rewind(); path.moveTo(X(0.0), Y(0.0))
                    val stepsN = min(xMax.toInt(), 1400)
                    for (i in 1..stepsN) { val t = (xMax * i / stepsN).toInt(); path.lineTo(X(t.toDouble()), Y(counts[t].toDouble())) }
                    glowPath(path, UE.Cyan, 1.8f * dp)
                    label(tm, "π(x)  primes ≤ x", left + 8 * dp, top + 4 * dp, UE.Cyan, 10.5f)
                    label(tm, "Li(x)", left + 8 * dp, top + 20 * dp, UE.Amber, 10.5f)
                    label(tm, "x / ln x", left + 8 * dp, top + 36 * dp, UE.Violet, 10.5f)
                }
            }
        }
    }) {
        Segmented(listOf("Ulam spiral", "Polar", "Sieve", "Counting"), mode) { mode = it }
        when (mode) {
            0 -> {
                IntSlider("Spiral size", sizeIdx, 0..sizes.lastIndex, format = { "${sizes[it]} × ${sizes[it]}  (to ${groupDigits(sizes[it].toLong() * sizes[it])})" }) { sizeIdx = it }
                Toggle("Highlight Euler's polynomial n² + n + 41", euler, accent = UE.Magenta) { euler = it }
                val f = Num.factorize(picked.toLong())
                ReadoutRow {
                    Stat("selected n", groupDigits(picked.toLong()), UE.Amber)
                    Stat(if (flags[picked]) "status" else "factors", if (picked < 2) "unit" else if (flags[picked]) "prime" else f.joinToString("·"), if (flags[picked]) UE.Cyan else UE.Dim)
                    Stat("primes below", counts[picked].toString())
                }
                Note("Tap any cell. Bright diagonals are quadratics that are unusually rich in primes — no one has proved that any of them contains infinitely many.")
            }
            1 -> {
                UESlider("Plot primes up to", polarN, 300f..1_000_000f, log = true, format = { groupDigits(it.toLong()) }) { polarN = it }
                Toggle("Show every integer instead (to see why)", allInts, accent = UE.Violet) { allInts = it }
                val n = polarN.roundToInt()
                ReadoutRow { Stat("N", groupDigits(n.toLong())); Stat("primes π(N)", groupDigits(counts[n].toLong()), UE.Cyan); Stat("density", fix(counts[n] * 100.0 / n, 2) + " %", UE.Violet) }
                Note(when { n < 4000 -> "6 radians is just short of a full turn (2π ≈ 6.283), so numbers 6 apart nearly line up: six spiral arms. Primes above 3 only live on two of them (6k ± 1)."
                    n < 150_000 -> "44 radians is almost exactly 7 turns (44/7 ≈ 2π): 44 arms. Primes can only sit on arms whose residue mod 44 is odd and not a multiple of 11 — 20 survive."
                    else -> "710 radians is 113 turns to within 0.00006: the arms straighten into 710 rays. Only residues coprime to 710 = 2·5·71 can hold primes: 280 rays, in groups of four." })
            }
            2 -> {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlowButton(if (playing) "Pause" else "Play", filled = !playing) { if (progress >= events.size) progress = 0f; playing = !playing }
                    GlowButton("Step") { playing = false; progress = (floor(progress) + 1).coerceAtMost(events.size.toFloat()) }
                    GlowButton("Reset", accent = UE.Dim) { playing = false; progress = 0f }
                }
                UESlider("Speed", speed, 2f..80f, log = true, format = { "${it.roundToInt()} per second" }) { speed = it }
                val done = progress.toInt()
                val cur = if (done < events.size) events[done] else null
                ReadoutRow { Stat("sieving with", cur?.get(0)?.toString() ?: "done", UE.Amber); Stat("crossed out", "$done / ${events.size}"); Stat("primes ≤ 120", "30", UE.Cyan) }
                Note("Eratosthenes, c. 240 BC: cross out the multiples of each prime, starting at its square. To sieve up to N you only need primes up to √N — here 2, 3, 5 and 7.")
            }
            else -> {
                UESlider("x", countX, 50f..1_000_000f, log = true, format = { groupDigits(it.toLong()) }) { countX = it }
                val x = countX.toDouble(); val pi = counts[x.toInt()]
                var acc = 0.0; var prevT = 2.0
                for (i in 1..2000) { val t = 2 + (x - 2) * i / 2000; acc += (1 / ln(prevT) + 1 / ln(t)) / 2 * (t - prevT); prevT = t }
                MathText("\\pi(${x.toInt()}) = $pi", size = 18.sp)
                ReadoutRow {
                    Stat("π(x)", groupDigits(pi.toLong()), UE.Cyan); Stat("x / ln x", fmt(x / ln(x), 5), UE.Violet); Stat("Li(x)", fmt(acc, 5), UE.Amber)
                    Stat("Li error", fix((acc - pi) / pi * 100, 2) + " %", UE.Magenta)
                }
                Note("Gauss guessed at fifteen that primes near x have density 1/ln x. Proved in 1896. The Riemann hypothesis is, in essence, the claim that Li(x) is never off by much more than √x.")
            }
        }
    }
}
