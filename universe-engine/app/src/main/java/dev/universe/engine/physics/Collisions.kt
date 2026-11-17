package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

/** Hard discs in a box: exact momentum exchange along the line of centres, grid broad-phase. */
internal class DiscGas(val n: Int, val w: Float, val h: Float, val r: Float, heavyFraction: Float, seed: Int = 5) {
    val x = FloatArray(n); val y = FloatArray(n); val vx = FloatArray(n); val vy = FloatArray(n); val m = FloatArray(n)
    var restitution = 1f
    /** Momentum delivered to the walls since the last call to [takeWallImpulse]. */
    private var wallImpulse = 0.0
    private val cell = r * 2.6f
    private val cols = max(1, (w / cell).toInt() + 1); private val rows = max(1, (h / cell).toInt() + 1)
    private val head = IntArray(cols * rows); private val next = IntArray(n)

    init {
        val rnd = Random(seed)
        val perRow = max(1, ((w - 2 * r) / (r * 2.4f)).toInt())
        for (i in 0 until n) {
            x[i] = r * 1.3f + (i % perRow) * r * 2.4f; y[i] = r * 1.3f + (i / perRow) * r * 2.4f
            val a = rnd.nextFloat() * 6.2832f
            vx[i] = cos(a); vy[i] = sin(a)
            m[i] = if (i < n * heavyFraction) 6f else 1f
        }
    }
    fun radius(i: Int) = if (m[i] > 1f) r * 1.5f else r
    fun meanKinetic(): Double { var e = 0.0; for (i in 0 until n) e += 0.5 * m[i] * (vx[i] * vx[i] + vy[i] * vy[i]); return e / n }
    fun setTemperature(kT: Float) { val s = sqrt(kT / meanKinetic().toFloat().coerceAtLeast(1e-9f)); for (i in 0 until n) { vx[i] *= s; vy[i] *= s } }
    fun takeWallImpulse(): Double { val v = wallImpulse; wallImpulse = 0.0; return v }

    fun step(dt: Float) {
        for (i in 0 until n) {
            x[i] += vx[i] * dt; y[i] += vy[i] * dt
            val ri = radius(i)
            if (x[i] < ri) { x[i] = ri; if (vx[i] < 0) { wallImpulse += 2.0 * m[i] * -vx[i]; vx[i] = -vx[i] } }
            if (x[i] > w - ri) { x[i] = w - ri; if (vx[i] > 0) { wallImpulse += 2.0 * m[i] * vx[i]; vx[i] = -vx[i] } }
            if (y[i] < ri) { y[i] = ri; if (vy[i] < 0) { wallImpulse += 2.0 * m[i] * -vy[i]; vy[i] = -vy[i] } }
            if (y[i] > h - ri) { y[i] = h - ri; if (vy[i] > 0) { wallImpulse += 2.0 * m[i] * vy[i]; vy[i] = -vy[i] } }
        }
        head.fill(-1)
        for (i in 0 until n) { val c = (y[i] / cell).toInt().coerceIn(0, rows - 1) * cols + (x[i] / cell).toInt().coerceIn(0, cols - 1); next[i] = head[c]; head[c] = i }
        for (cy in 0 until rows) for (cx in 0 until cols) {
            var i = head[cy * cols + cx]
            while (i >= 0) {
                for (oy in 0..1) for (ox in -1..1) {
                    if (oy == 0 && ox < 0) continue
                    val nx = cx + ox; val ny = cy + oy
                    if (nx < 0 || nx >= cols || ny >= rows) continue
                    var j = if (ox == 0 && oy == 0) next[i] else head[ny * cols + nx]
                    while (j >= 0) { collide(i, j); j = next[j] }
                }
                i = next[i]
            }
        }
    }

    private fun collide(i: Int, j: Int) {
        val dx = x[j] - x[i]; val dy = y[j] - y[i]
        val rr = radius(i) + radius(j)
        val d2 = dx * dx + dy * dy
        if (d2 >= rr * rr || d2 < 1e-9f) return
        val d = sqrt(d2); val nx = dx / d; val ny = dy / d
        val rel = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny
        val inv = 1 / m[i] + 1 / m[j]
        if (rel < 0) {
            val imp = -(1 + restitution) * rel / inv
            vx[i] -= imp / m[i] * nx; vy[i] -= imp / m[i] * ny; vx[j] += imp / m[j] * nx; vy[j] += imp / m[j] * ny
        }
        val push = (rr - d) / inv
        x[i] -= nx * push / m[i]; y[i] -= ny * push / m[i]; x[j] += nx * push / m[j]; y[j] += ny * push / m[j]
    }
}

/** Two blocks and a wall in one dimension, advanced exactly from collision to collision. */
internal class BlockTrack(var m1: Double, var m2: Double, var restitution: Double = 1.0) {
    var x1 = 2.0; var x2 = 5.0; var v1 = 0.0; var v2 = -1.0
    var count = 0
    var done = false
    val w1 = 0.6
    fun reset(v: Double = -1.0) { x1 = 2.0; x2 = 5.0; v1 = 0.0; v2 = v; count = 0; done = false }
    fun advance(duration: Double, maxEvents: Int = 200_000) {
        var left = duration
        var events = 0
        while (left > 0 && events < maxEvents) {
            val tBlock = if (v1 > v2) (x2 - x1 - w1) / (v1 - v2) else Double.POSITIVE_INFINITY
            val tWall = if (v1 < 0) x1 / -v1 else Double.POSITIVE_INFINITY
            val t = min(tBlock, tWall)
            if (t > left) { x1 += v1 * left; x2 += v2 * left; break }
            x1 += v1 * t; x2 += v2 * t; left -= t
            if (tWall <= tBlock) { v1 = -v1 * restitution; x1 = 0.0 }
            else {
                val a = ((m1 - restitution * m2) * v1 + (1 + restitution) * m2 * v2) / (m1 + m2)
                val b = ((m2 - restitution * m1) * v2 + (1 + restitution) * m1 * v1) / (m1 + m2)
                v1 = a; v2 = b
            }
            count++; events++
        }
        done = v1 >= 0 && v2 >= v1
    }
}

private val CollisionsInfo = LabInfo(
    equations = listOf(
        "m_1 \\vec{v}_1 + m_2 \\vec{v}_2 = m_1 \\vec{v}_1' + m_2 \\vec{v}_2'",
        "e = \\frac{v_2' - v_1'}{v_1 - v_2}, \\qquad \\tfrac{1}{2}m_1 v_1^2 + \\tfrac{1}{2}m_2 v_2^2 \\ge \\tfrac{1}{2}m_1 v_1'^2 + \\tfrac{1}{2}m_2 v_2'^2",
        "f(v) = \\frac{m v}{k_B T}\\, e^{-m v^2 / 2 k_B T} \\qquad (2\\text{D})",
        "P A = N k_B T",
    ),
    about = "Momentum is conserved in every collision; kinetic energy only when the collision is perfectly elastic (e = 1). In the gas, hundreds of discs trade momentum at random and their speeds settle — whatever you start with — into the Maxwell–Boltzmann distribution, the statistical fingerprint of temperature. The hammering on the walls is pressure, and it obeys the ideal gas law. In the two-block experiment, count the collisions when one block is 100ⁿ times heavier than the other.",
    notes = listOf(
        "The gas is two-dimensional, so the speed distribution is the 2D Maxwell–Boltzmann (Rayleigh) form and ⟨kinetic energy⟩ = k_B T rather than 3/2 k_B T.",
        "Discs have finite size, which leaves a little less free area than the box: measured pressure runs a few percent above N k_B T / A. That is the first van der Waals correction, appearing by itself.",
        "Collisions are detected once per time step, so at very high speed a pair can interpenetrate slightly before being separated.",
        "The block track is event-driven and exact: positions jump analytically from one collision to the next, so no collision can be missed however fast the small block rattles.",
    ),
)

@Composable
fun CollisionsLab() {
    val app = LocalApp.current
    var mode by remember { mutableIntStateOf(0) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    // gas
    var kT by remember { mutableFloatStateOf(1f) }
    var mixed by remember { mutableStateOf(false) }
    var rest by remember { mutableFloatStateOf(1f) }
    val count = (150 * app.prefs.q).roundToInt()
    val gas = remember(px, mixed, count) {
        if (px.width < 8) null else {
            val boxH = px.height * 0.66f
            val r = sqrt(px.width * boxH * 0.11f / (count * PI.toFloat()))
            DiscGas(count, px.width.toFloat(), boxH, r, if (mixed) 0.15f else 0f).also { it.setTemperature(1f) }
        }
    }
    val hist = remember { FloatArray(36) }
    var pressure by remember { mutableDoubleStateOf(0.0) }
    var impAcc by remember { mutableDoubleStateOf(0.0) }
    var tAcc by remember { mutableFloatStateOf(0f) }
    // blocks
    var ratioExp by remember { mutableIntStateOf(2) }
    var eBlock by remember { mutableFloatStateOf(1f) }
    val track = remember { BlockTrack(1.0, 100.0) }
    var blockRunning by remember { mutableStateOf(false) }

    val frame = rememberTicker(true) { dt ->
        if (mode == 0) {
            val g = gas ?: return@rememberTicker
            g.restitution = rest
            val unit = g.r * 9f   // speed scale: thermal speed ≈ 9 radii per second at kT = 1
            val sub = 3
            repeat(sub) { g.step(dt / sub * unit) }
            if (rest >= 0.999f) g.setTemperature(kT)
            impAcc += g.takeWallImpulse(); tAcc += dt * unit
            if (tAcc > unit * 0.5f) { pressure = impAcc / tAcc / (2 * (g.w + g.h)); impAcc = 0.0; tAcc = 0f }
            val vmax = 3.2f * sqrt(2 * kT)
            val now = FloatArray(36)
            for (i in 0 until g.n) if (g.m[i] == 1f) { val b = (hypot(g.vx[i], g.vy[i]) / vmax * 36).toInt(); if (b in 0 until 36) now[b] += 1f }
            for (b in 0 until 36) hist[b] += (now[b] - hist[b]) * 0.06f
        } else if (blockRunning) {
            track.advance(dt * 1.6)
            if (track.done && track.x2 > 9) {
                blockRunning = false
                if (eBlock >= 0.999f && ratioExp >= 2) app.discover("pibilliards")
            }
        }
    }

    LabScaffold("Collisions and Gases", Domain.Physics, CollisionsInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }) {
            frame.value
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            if (mode == 0) {
                val g = gas ?: return@Canvas
                drawRect(Color.White.copy(alpha = 0.03f), Offset.Zero, Size(g.w, g.h)); drawRect(UE.Violet.copy(alpha = 0.6f), Offset.Zero, Size(g.w, g.h), style = Stroke(1.5f * dp))
                val vth = sqrt(2 * kT)
                for (i in 0 until g.n) {
                    val sp = hypot(g.vx[i], g.vy[i]) / (2.2f * vth)
                    val c = if (g.m[i] > 1f) UE.Amber else UE.ramp(0.25f + 0.75f * sp)
                    val p = Offset(g.x[i], g.y[i])
                    drawCircle(c.copy(alpha = 0.25f), g.radius(i) * 1.7f, p, blendMode = BlendMode.Plus)
                    drawCircle(c, g.radius(i), p)
                }
                // speed histogram against the Maxwell–Boltzmann curve
                val top = g.h + 22 * dp; val bot = h - 16 * dp; val left = 14 * dp; val right = w - 14 * dp
                val light = (0 until g.n).count { g.m[it] == 1f }
                val vmax = 3.2f * vth
                val peak = (1 / sqrt(kT) * exp(-0.5f)) * 1.15f
                val bw = (right - left) / 36
                for (b in 0 until 36) {
                    val dens = hist[b] / light / (vmax / 36)
                    val bh = (dens / peak).coerceAtMost(1.2f) * (bot - top)
                    drawRoundRect(UE.Cyan.copy(alpha = 0.55f), Offset(left + b * bw + 1, bot - bh), Size(bw - 2, bh), CornerRadius(2 * dp))
                }
                path.rewind()
                for (k in 0..80) { val v = vmax * k / 80f; val f = v / kT * exp(-v * v / (2 * kT)); val q = Offset(left + (right - left) * k / 80f, bot - f / peak * (bot - top)); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                glowPath(path, UE.Amber, 1.8f * dp)
                drawLine(Color.White.copy(alpha = 0.3f), Offset(left, bot), Offset(right, bot), 1f)
                label(tm, "speed distribution — bars: measured, curve: Maxwell–Boltzmann", left, top - 16 * dp, UE.Dim, 9.5f)
                label(tm, "speed →", right, bot + 2 * dp, UE.Dim, 9f, 1f, 0f)
            } else {
                val floor = h * 0.62f
                val u = w / 11f
                drawLine(UE.Text.copy(alpha = 0.6f), Offset(u * 0.5f, floor), Offset(w, floor), 1.5f * dp)
                drawRect(UE.Violet.copy(alpha = 0.35f), Offset(0f, floor - u * 3.4f), Size(u * 0.5f, u * 3.4f)); drawLine(UE.Violet, Offset(u * 0.5f, floor - u * 3.4f), Offset(u * 0.5f, floor), 2f * dp)
                val s1 = u * track.w1.toFloat(); val s2 = u * (0.9f + 0.28f * ratioExp)
                val a = Offset(u * 0.5f + (track.x1 * u).toFloat(), floor - s1); val b = Offset(u * 0.5f + ((track.x1 + track.w1 + max(0.0, track.x2 - track.x1 - track.w1)) * u).toFloat(), floor - s2)
                drawRoundRect(UE.Cyan.copy(alpha = 0.25f), a, Size(s1, s1), CornerRadius(4 * dp)); drawRoundRect(UE.Cyan, a, Size(s1, s1), CornerRadius(4 * dp), style = Stroke(1.6f * dp))
                drawRoundRect(UE.Amber.copy(alpha = 0.25f), b, Size(s2, s2), CornerRadius(5 * dp)); drawRoundRect(UE.Amber, b, Size(s2, s2), CornerRadius(5 * dp), style = Stroke(1.6f * dp))
                label(tm, "1", a.x + s1 / 2, a.y + s1 / 2, UE.Cyan, 11f, 0.5f, 0.5f)
                label(tm, if (ratioExp == 0) "1" else "100${if (ratioExp > 1) superscript(ratioExp) else ""}", b.x + s2 / 2, b.y + s2 / 2, UE.Amber, 12f, 0.5f, 0.5f)
                label(tm, track.count.toString(), w / 2, h * 0.08f, UE.Text, 44f, 0.5f, 0f, UE.Display)
                label(tm, "collisions", w / 2, h * 0.08f + 54 * dp, UE.Dim, 11f, 0.5f, 0f, UE.Display)
                // configuration-space picture: (√m₁ v₁, √m₂ v₂) moves on a circle of constant energy
                val c = Offset(w * 0.5f, h * 0.83f); val rad = min(w * 0.2f, h * 0.13f)
                drawCircle(Color.White.copy(alpha = 0.25f), rad, c, style = Stroke(dp))
                drawLine(Color.White.copy(alpha = 0.15f), c - Offset(rad * 1.3f, 0f), c + Offset(rad * 1.3f, 0f), 1f); drawLine(Color.White.copy(alpha = 0.15f), c - Offset(0f, rad * 1.3f), c + Offset(0f, rad * 1.3f), 1f)
                val e0 = sqrt(track.m2)
                val q = c + Offset((sqrt(track.m2) * track.v2 / e0 * rad).toFloat(), -(sqrt(track.m1) * track.v1 / e0 * rad).toFloat())
                glowDot(q, UE.Text, 4 * dp)
                label(tm, "√m₂·v₂", c.x + rad * 1.3f + 3 * dp, c.y, UE.Amber, 9f, 0f, 0.5f); label(tm, "√m₁·v₁", c.x, c.y - rad * 1.3f - 2 * dp, UE.Cyan, 9f, 0.5f, 1f)
            }
        }
    }) {
        Segmented(listOf("Gas in a box", "Two blocks and a wall"), mode, accent = Domain.Physics.accent) { mode = it }
        if (mode == 0) {
            UESlider("Temperature  k_B T", kT, 0.1f..4f, log = true, accent = UE.Amber, format = { fix(it, 2) }) { kT = it; gas?.setTemperature(it) }
            UESlider("Restitution e", rest, 0.8f..1f, accent = Domain.Physics.accent, format = { fix(it, 3) }) { rest = it }
            Toggle("Mix in heavy particles (6× mass)", mixed, accent = UE.Amber) { mixed = it }
            frame.value
            val g = gas
            if (g != null) {
                val measured = g.meanKinetic()
                ReadoutRow {
                    Stat("N", g.n.toString()); Stat("⟨KE⟩ = k_B T", fix(measured, 3), UE.Amber)
                    Stat("P·A", fmt(pressure * g.w * g.h, 4), UE.Cyan); Stat("N·k_B·T", fmt(g.n * measured, 4), UE.Violet)
                }
            }
            Note(if (rest < 0.999f) "Inelastic collisions drain kinetic energy into heat inside the discs: the gas cools and clumps, like a granular material." else if (mixed) "Heavy particles drift slowly, light ones dart — yet on average each carries the same kinetic energy. That is equipartition." else "Bars are the measured speeds, the amber curve is the prediction of statistical mechanics. Change the temperature and watch them stay together.")
        } else {
            IntSlider("Mass of the heavy block", ratioExp, 0..3, accent = UE.Amber, format = { if (it == 0) "1 × the small one" else "${groupDigits(100.0.pow(it).toLong())} × the small one" }) { ratioExp = it; track.m2 = 100.0.pow(it); track.reset(); blockRunning = false }
            UESlider("Restitution e", eBlock, 0f..1f, accent = Domain.Physics.accent, format = { fix(it, 2) }) { eBlock = it; track.restitution = it.toDouble(); track.reset(); blockRunning = false }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlowButton(if (blockRunning) "Pause" else "Launch", accent = Domain.Physics.accent, filled = !blockRunning) { if (track.done || track.count > 0 && !blockRunning && track.x2 > 9) track.reset(); blockRunning = !blockRunning }
                GlowButton("Reset", accent = UE.Dim) { track.reset(); blockRunning = false }
            }
            frame.value
            val p = track.m1 * track.v1 + track.m2 * track.v2; val ke = 0.5 * track.m1 * track.v1 * track.v1 + 0.5 * track.m2 * track.v2 * track.v2
            ReadoutRow { Stat("collisions", groupDigits(track.count.toLong()), UE.Text); Stat("v₁", fmt(track.v1, 3), UE.Cyan); Stat("v₂", fmt(track.v2, 3), UE.Amber); Stat("kinetic energy", fmt(ke / (0.5 * track.m2) * 100, 3) + " %") }
            Note("Momentum of the pair p = ${fmt(p, 3)} changes only when the wall pushes back. With e = 1 the point (√m₁v₁, √m₂v₂) can only hop around a circle — which is where a certain famous number sneaks in.")
        }
    }
}
