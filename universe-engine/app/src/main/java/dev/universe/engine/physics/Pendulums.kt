package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlin.math.*

/** Planar double pendulum, unit masses and lengths, integrated with classical RK4. State: θ₁, θ₂, ω₁, ω₂. */
internal class DoublePendulum(th1: Double, th2: Double, var g: Double = 9.81) {
    val s = doubleArrayOf(th1, th2, 0.0, 0.0)
    private val k1 = DoubleArray(4); private val k2 = DoubleArray(4); private val k3 = DoubleArray(4); private val k4 = DoubleArray(4); private val tmp = DoubleArray(4)

    private fun deriv(q: DoubleArray, out: DoubleArray) {
        val d = q[0] - q[1]
        val den = 3 - cos(2 * d)
        out[0] = q[2]; out[1] = q[3]
        out[2] = (-3 * g * sin(q[0]) - g * sin(q[0] - 2 * q[1]) - 2 * sin(d) * (q[3] * q[3] + q[2] * q[2] * cos(d))) / den
        out[3] = (2 * sin(d) * (2 * q[2] * q[2] + 2 * g * cos(q[0]) + q[3] * q[3] * cos(d))) / den
    }

    fun step(h: Double) {
        deriv(s, k1)
        for (i in 0 until 4) tmp[i] = s[i] + k1[i] * h / 2; deriv(tmp, k2)
        for (i in 0 until 4) tmp[i] = s[i] + k2[i] * h / 2; deriv(tmp, k3)
        for (i in 0 until 4) tmp[i] = s[i] + k3[i] * h; deriv(tmp, k4)
        for (i in 0 until 4) s[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    }

    fun energy(): Double = 0.5 * (2 * s[2] * s[2] + s[3] * s[3] + 2 * s[2] * s[3] * cos(s[0] - s[1])) - g * (2 * cos(s[0]) + cos(s[1]))
}

private val GRAVITY = listOf("Moon" to 1.62f, "Mars" to 3.72f, "Earth" to 9.81f, "Jupiter" to 24.79f)

private val PendulumInfo = LabInfo(
    equations = listOf(
        "\\ddot{\\theta} = -\\frac{g}{L}\\sin\\theta - b\\,\\dot{\\theta}",
        "T = 4\\sqrt{\\frac{L}{g}}\\,K\\!\\left(\\sin\\frac{\\theta_0}{2}\\right) \\approx 2\\pi\\sqrt{\\frac{L}{g}}\\left(1 + \\frac{\\theta_0^2}{16} + \\cdots\\right)",
        "|\\delta(t)| \\approx |\\delta_0|\\, e^{\\lambda t}",
        "A(\\omega) = \\frac{F_0/m}{\\sqrt{(\\omega_0^2 - \\omega^2)^2 + \\gamma^2\\omega^2}}",
    ),
    about = "A pendulum is the simplest clock, but only for small swings: the textbook period 2π√(L/g) quietly assumes sin θ ≈ θ. Pull the bob high and the true motion (solid) falls behind the idealised one (dashed). Hang a second pendulum from the first and the motion becomes chaotic — two copies released one thousandth of a radian apart soon have nothing in common. Fifteen pendulums of carefully chosen lengths drift in and out of step, making waves. And any oscillator pushed at its own natural frequency responds enormously: resonance.",
    notes = listOf(
        "All motion is integrated with fourth-order Runge–Kutta at 480 steps per second. For the double pendulum the energy readout shows how well the integration holds; chaos amplifies even that tiny error, so the long-term path is one valid trajectory, not 'the' trajectory.",
        "Rods are massless and rigid, bobs are points, and damping is a simple term proportional to angular velocity. Real air drag grows roughly with the square of speed.",
        "The pendulum wave uses the small-angle solution for each pendulum, which is how the demonstration is designed: pendulum k makes exactly 24 + k swings every 30 seconds.",
        "The resonance curve drawn is the exact steady-state amplitude of the linear driven oscillator; the simulated mass also shows the transient before it settles onto it.",
    ),
)

@Composable
fun PendulumLab() {
    var mode by remember { mutableIntStateOf(0) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    var cs by remember { mutableStateOf(Size(1f, 1f)) }
    // simple
    var len by remember { mutableFloatStateOf(1.2f) }
    var gi by remember { mutableIntStateOf(2) }
    var damp by remember { mutableFloatStateOf(0f) }
    var theta by remember { mutableDoubleStateOf(1.2) }
    var omega by remember { mutableDoubleStateOf(0.0) }
    var theta0 by remember { mutableDoubleStateOf(1.2) }
    var tSince by remember { mutableDoubleStateOf(0.0) }
    var held by remember { mutableStateOf(false) }
    val phase = remember { FloatArray(2 * 600) }
    var phaseN by remember { mutableIntStateOf(0) }
    // double
    var a1 by remember { mutableFloatStateOf(2.2f) }
    var a2 by remember { mutableFloatStateOf(2.6f) }
    var pend by remember { mutableStateOf(DoublePendulum(2.2, 2.6) to DoublePendulum(2.2, 2.601)) }
    val trailA = remember { FloatArray(2 * 500) }; val trailB = remember { FloatArray(2 * 500) }
    var trailN by remember { mutableIntStateOf(0) }
    val sep = remember { FloatArray(600) }
    var sepN by remember { mutableIntStateOf(0) }
    var e0 by remember { mutableDoubleStateOf(pend.first.energy()) }
    // wave + resonance
    var waveT by remember { mutableDoubleStateOf(0.0) }
    var waveSpeed by remember { mutableFloatStateOf(1f) }
    var drive by remember { mutableFloatStateOf(0.8f) }
    var gamma by remember { mutableFloatStateOf(0.25f) }
    var rx by remember { mutableDoubleStateOf(0.0) }
    var rv by remember { mutableDoubleStateOf(0.0) }
    var rt by remember { mutableDoubleStateOf(0.0) }
    var peak by remember { mutableFloatStateOf(0f) }
    var running by remember { mutableStateOf(true) }
    val g = GRAVITY[gi].second.toDouble()

    val frame = rememberTicker(running) { dt ->
        when (mode) {
            0 -> if (!held) {
                val h = dt / 8.0
                repeat(8) {
                    fun acc(th: Double, om: Double) = -g / len * sin(th) - damp * om
                    val k1t = omega; val k1o = acc(theta, omega)
                    val k2t = omega + k1o * h / 2; val k2o = acc(theta + k1t * h / 2, omega + k1o * h / 2)
                    val k3t = omega + k2o * h / 2; val k3o = acc(theta + k2t * h / 2, omega + k2o * h / 2)
                    val k4t = omega + k3o * h; val k4o = acc(theta + k3t * h, omega + k3o * h)
                    theta += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t); omega += h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o)
                }
                tSince += dt
                val i = phaseN % 600; phase[i * 2] = theta.toFloat(); phase[i * 2 + 1] = omega.toFloat(); phaseN++
            }
            1 -> {
                val (p, q) = pend
                repeat(8) { p.step(dt / 8.0); q.step(dt / 8.0) }
                val i = trailN % 500
                trailA[i * 2] = (sin(p.s[0]) + sin(p.s[1])).toFloat(); trailA[i * 2 + 1] = (cos(p.s[0]) + cos(p.s[1])).toFloat()
                trailB[i * 2] = (sin(q.s[0]) + sin(q.s[1])).toFloat(); trailB[i * 2 + 1] = (cos(q.s[0]) + cos(q.s[1])).toFloat()
                trailN++
                if (trailN % 3 == 0 && sepN < 600) { sep[sepN] = ln(hypot(p.s[0] - q.s[0], p.s[1] - q.s[1]).coerceAtLeast(1e-9)).toFloat(); sepN++ }
            }
            2 -> waveT += dt * waveSpeed
            else -> {
                val w0 = 2 * PI * 1.0; val w = 2 * PI * drive
                val h = dt / 8.0
                repeat(8) {
                    fun acc(x: Double, v: Double, t: Double) = -w0 * w0 * x - gamma * w0 * v + 30 * cos(w * t)
                    val k1x = rv; val k1v = acc(rx, rv, rt)
                    val k2x = rv + k1v * h / 2; val k2v = acc(rx + k1x * h / 2, rv + k1v * h / 2, rt + h / 2)
                    val k3x = rv + k2v * h / 2; val k3v = acc(rx + k2x * h / 2, rv + k2v * h / 2, rt + h / 2)
                    val k4x = rv + k3v * h; val k4v = acc(rx + k3x * h, rv + k3v * h, rt + h)
                    rx += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); rv += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); rt += h
                }
                peak = max(peak * 0.997f, abs(rx).toFloat())
            }
        }
    }
    fun releaseDouble() { pend = DoublePendulum(a1.toDouble(), a2.toDouble(), g) to DoublePendulum(a1.toDouble(), a2 + 0.001, g); trailN = 0; sepN = 0; e0 = pend.first.energy() }
    fun pivot(sz: Size) = Offset(sz.width / 2, sz.height * 0.14f)

    LabScaffold("Pendulums and Oscillations", Domain.Physics, PendulumInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(null, key = mode, onSingle = { o, ph ->
                if (mode != 0) false else {
                    val p = pivot(cs)
                    if (ph < 2) { held = true; theta = atan2((o.x - p.x).toDouble(), (o.y - p.y).toDouble()); omega = 0.0 }
                    else { held = false; theta0 = theta; tSince = 0.0; phaseN = 0 }
                    true
                }
            }),
        ) {
            frame.value
            cs = size
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            when (mode) {
                0 -> {
                    val p = pivot(size)
                    val L = min(h * 0.5f, w * 0.44f) * (0.45f + 0.55f * len / 3f)
                    drawLine(Color.White.copy(alpha = 0.3f), Offset(p.x - 40 * dp, p.y), Offset(p.x + 40 * dp, p.y), 2 * dp)
                    drawArc(Color.White.copy(alpha = 0.1f), 30f, 120f, false, Offset(p.x - L, p.y - L), Size(2 * L, 2 * L), style = Stroke(dp))
                    // small-angle idealisation
                    val ths = theta0 * cos(sqrt(g / len) * tSince) * exp(-damp * tSince / 2)
                    val ghost = p + Offset((sin(ths) * L).toFloat(), (cos(ths) * L).toFloat())
                    if (!held) { drawLine(UE.Text.copy(alpha = 0.3f), p, ghost, dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 5 * dp))); drawCircle(UE.Text.copy(alpha = 0.35f), 9 * dp, ghost, style = Stroke(1.2f * dp)) }
                    val bob = p + Offset((sin(theta) * L).toFloat(), (cos(theta) * L).toFloat())
                    drawLine(UE.Text, p, bob, 1.6f * dp); glowDot(bob, Domain.Physics.accent, 11 * dp); drawCircle(UE.Text, 3 * dp, p)
                    // phase portrait
                    val c = Offset(w * 0.78f, h * 0.84f); val bw = w * 0.18f; val bh = h * 0.12f
                    drawRect(Color.White.copy(alpha = 0.04f), Offset(c.x - bw, c.y - bh), Size(2 * bw, 2 * bh)); drawRect(Color.White.copy(alpha = 0.15f), Offset(c.x - bw, c.y - bh), Size(2 * bw, 2 * bh), style = Stroke(1f))
                    val oScale = 2.2 * sqrt(g / len) * 1.1
                    path.rewind()
                    val n = min(phaseN, 600)
                    for (k in 0 until n) { val i = (phaseN - n + k) % 600; val q = Offset(c.x + (phase[i * 2] / PI.toFloat()) * bw, c.y - (phase[i * 2 + 1] / oScale.toFloat()) * bh); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    drawPath(path, UE.Cyan, style = Stroke(1.3f * dp))
                    label(tm, "phase space  (θ, ω)", c.x - bw, c.y - bh - 3 * dp, UE.Dim, 9f, 0f, 1f)
                    // energy bars
                    val ke = 0.5 * len * len * omega * omega; val pe = g * len * (1 - cos(theta)); val tot = (g * len * (1 - cos(theta0))).coerceAtLeast(1e-6)
                    val bx = 16 * dp; val bwid = w * 0.3f; val by = h * 0.8f
                    drawRect(Color.White.copy(alpha = 0.06f), Offset(bx, by), Size(bwid, 8 * dp)); drawRect(UE.Cyan, Offset(bx, by), Size((bwid * ke / tot).toFloat().coerceIn(0f, bwid), 8 * dp))
                    drawRect(Color.White.copy(alpha = 0.06f), Offset(bx, by + 22 * dp), Size(bwid, 8 * dp)); drawRect(UE.Violet, Offset(bx, by + 22 * dp), Size((bwid * pe / tot).toFloat().coerceIn(0f, bwid), 8 * dp))
                    label(tm, "kinetic", bx, by - 2 * dp, UE.Cyan, 9f, 0f, 1f); label(tm, "potential", bx, by + 20 * dp, UE.Violet, 9f, 0f, 1f)
                }
                1 -> {
                    val p = Offset(w / 2, h * 0.38f); val L = min(w, h) * 0.2f
                    for ((idx, tr) in listOf(trailB, trailA).withIndex()) {
                        path.rewind()
                        val n = min(trailN, 500)
                        for (k in 0 until n) { val i = (trailN - n + k) % 500; val q = p + Offset(tr[i * 2] * L, tr[i * 2 + 1] * L); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                        drawPath(path, (if (idx == 0) UE.Magenta else UE.Cyan).copy(alpha = 0.6f), style = Stroke(1.3f * dp))
                    }
                    for ((idx, dpn) in listOf(pend.second, pend.first).withIndex()) {
                        val col = if (idx == 0) UE.Magenta else UE.Cyan
                        val b1 = p + Offset((sin(dpn.s[0]) * L).toFloat(), (cos(dpn.s[0]) * L).toFloat()); val b2 = b1 + Offset((sin(dpn.s[1]) * L).toFloat(), (cos(dpn.s[1]) * L).toFloat())
                        drawLine(col.copy(alpha = 0.9f), p, b1, 1.6f * dp); drawLine(col.copy(alpha = 0.9f), b1, b2, 1.6f * dp)
                        drawCircle(col, 5 * dp, b1); glowDot(b2, col, 6.5f * dp)
                    }
                    drawCircle(UE.Text, 3 * dp, p)
                    // divergence of the twins on a log scale
                    val left = 16 * dp; val right = w - 16 * dp; val top = h * 0.84f; val bot = h - 12 * dp
                    drawRect(Color.White.copy(alpha = 0.04f), Offset(left, top), Size(right - left, bot - top))
                    label(tm, "ln |separation| of the twins — a straight rise is exponential divergence", left, top - 3 * dp, UE.Dim, 9f, 0f, 1f)
                    if (sepN > 1) { path.rewind(); for (k in 0 until sepN) { val q = Offset(left + (right - left) * k / 599f, bot - (bot - top) * ((sep[k] + 8f) / 10.5f).coerceIn(0f, 1f)); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }; drawPath(path, UE.Amber, style = Stroke(1.5f * dp)) }
                }
                2 -> {
                    val n = 15
                    val barY = h * 0.1f; val midY = h * 0.56f; val amp = h * 0.26f
                    drawLine(Color.White.copy(alpha = 0.3f), Offset(w * 0.05f, barY), Offset(w * 0.95f, barY), 2 * dp)
                    path.rewind()
                    for (k in 0 until n) {
                        val period = 30.0 / (24 + k)
                        val x = w * (0.09f + 0.82f * k / (n - 1))
                        val y = midY + (amp * cos(2 * PI * waveT / period)).toFloat()
                        val col = lerp(UE.Cyan, UE.Violet, k / (n - 1f))
                        drawLine(col.copy(alpha = 0.3f), Offset(x, barY), Offset(x, y), dp)
                        glowDot(Offset(x, y), col, 6.5f * dp)
                        if (k == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(path, Color.White.copy(alpha = 0.2f), style = Stroke(dp))
                    label(tm, "viewed along the swing: each bob moves toward and away from you", w / 2, h - 14 * dp, UE.Dim, 9.5f, 0.5f, 1f)
                }
                else -> {
                    val wallX = w * 0.1f; val y = h * 0.26f; val rest = w * 0.5f; val unit = w * 0.07f
                    val dx = (rx * unit).toFloat().coerceIn(-w * 0.34f, w * 0.34f)
                    val driveX = wallX + (0.25f * unit * cos(2 * PI * drive * rt)).toFloat()
                    drawLine(UE.Violet, Offset(driveX, y - 26 * dp), Offset(driveX, y + 26 * dp), 3 * dp)
                    path.rewind(); path.moveTo(driveX, y)
                    val coils = 14; val end = rest + dx - 22 * dp
                    for (k in 1..coils * 2) { val t = k / (coils * 2f); path.lineTo(driveX + (end - driveX) * t, y + (if (k % 2 == 0) -1 else 1) * 9 * dp) }
                    path.lineTo(end, y)
                    drawPath(path, UE.Text.copy(alpha = 0.8f), style = Stroke(1.4f * dp))
                    drawRect(Domain.Physics.accent.copy(alpha = 0.3f), Offset(end, y - 22 * dp), Size(44 * dp, 44 * dp)); drawRect(Domain.Physics.accent, Offset(end, y - 22 * dp), Size(44 * dp, 44 * dp), style = Stroke(1.6f * dp))
                    drawLine(Color.White.copy(alpha = 0.15f), Offset(rest, y + 30 * dp), Offset(rest, y + 40 * dp), 1f)
                    // response curve
                    val left = 40 * dp; val right = w - 16 * dp; val top = h * 0.5f; val bot = h * 0.92f
                    val w0 = 2 * PI
                    fun amp(f: Double): Double { val ww = 2 * PI * f; return 30 / sqrt((w0 * w0 - ww * ww).pow(2) + (gamma * w0 * ww).pow(2)) }
                    val aMax = amp(sqrt(max(0.0, 1 - gamma * gamma / 2.0))).coerceAtLeast(amp(1.0)) * 1.1
                    drawLine(Color.White.copy(alpha = 0.3f), Offset(left, bot), Offset(right, bot), 1f)
                    path.rewind(); for (k in 0..160) { val f = 0.2 + 1.8 * k / 160; val q = Offset(left + (right - left) * k / 160f, (bot - (bot - top) * amp(f) / aMax).toFloat()); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    glowPath(path, UE.Cyan, 1.8f * dp)
                    val mx = left + (right - left) * ((drive - 0.2f) / 1.8f)
                    drawLine(UE.Amber.copy(alpha = 0.6f), Offset(mx, top), Offset(mx, bot), dp)
                    glowDot(Offset(mx, (bot - (bot - top) * amp(drive.toDouble()) / aMax).toFloat()), UE.Amber, 4.5f * dp)
                    drawCircle(UE.Text, 3.5f * dp, Offset(mx, (bot - (bot - top) * peak / aMax).toFloat().coerceIn(top, bot)), style = Stroke(1.4f * dp))
                    for (f in listOf(0.5f, 1f, 1.5f, 2f)) label(tm, "${fix(f, 1)} Hz", left + (right - left) * ((f - 0.2f) / 1.8f), bot + 3 * dp, UE.Dim, 9f, 0.5f, 0f)
                    label(tm, "steady-state amplitude vs driving frequency", left, top - 4 * dp, UE.Dim, 9.5f, 0f, 1f)
                }
            }
        }
    }) {
        ChipRow(listOf("Simple", "Double (chaos)", "Pendulum wave", "Resonance"), mode, Domain.Physics.accent) { mode = it }
        when (mode) {
            0 -> {
                UESlider("Length L", len, 0.2f..3f, accent = Domain.Physics.accent, format = { "${fix(it, 2)} m" }) { len = it; theta0 = theta; tSince = 0.0 }
                ChipRow(GRAVITY.map { "${it.first} ${fix(it.second, 2)}" }, gi, Domain.Physics.accent) { gi = it; theta0 = theta; tSince = 0.0 }
                UESlider("Damping b", damp, 0f..1.2f, accent = UE.Amber, format = { fix(it, 2) }) { damp = it }
                val small = 2 * PI * sqrt(len / g)
                val exact = if (abs(theta0) < PI - 0.01) 4 * sqrt(len / g) * Num.ellipticK(sin(abs(theta0) / 2)) else Double.POSITIVE_INFINITY
                ReadoutRow {
                    Stat("release angle", fix(theta0 * 180 / PI, 1) + "°", UE.Text); Stat("true period", fix(exact, 4) + " s", Domain.Physics.accent)
                    Stat("2π√(L/g)", fix(small, 4) + " s", UE.Dim); Stat("difference", fix((exact / small - 1) * 100, 2) + " %", UE.Magenta)
                }
                Note("Drag the bob and let go. The dashed ghost is the small-angle formula — fine below about 15°, hopeless near the top.")
            }
            1 -> {
                UESlider("Upper arm angle", a1, 0.2f..3.1f, accent = UE.Cyan, format = { "${fix(it * 180 / PI.toFloat(), 0)}°" }) { a1 = it }
                UESlider("Lower arm angle", a2, 0.2f..3.1f, accent = UE.Cyan, format = { "${fix(it * 180 / PI.toFloat(), 0)}°" }) { a2 = it }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlowButton("Release both", accent = Domain.Physics.accent, filled = true) { releaseDouble(); running = true }
                    GlowButton(if (running) "Pause" else "Run", accent = UE.Dim) { running = !running }
                }
                frame.value
                val (p, q) = pend
                ReadoutRow {
                    Stat("separation now", fmt(hypot(p.s[0] - q.s[0], p.s[1] - q.s[1]), 3) + " rad", UE.Amber); Stat("started at", "0.001 rad", UE.Dim)
                    Stat("energy drift", fmt(abs((p.energy() - e0) / (abs(e0) + 1e-9)) * 100, 2) + " %", UE.Magenta)
                }
                Note("Cyan and magenta start one thousandth of a radian apart. At low energy they stay together; released from high up, the gap grows exponentially until prediction is impossible.")
            }
            2 -> {
                UESlider("Playback speed", waveSpeed, 0.2f..4f, log = true, accent = Domain.Physics.accent, format = { "×${fix(it, 1)}" }) { waveSpeed = it }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { GlowButton("Restart in step", accent = Domain.Physics.accent) { waveT = 0.0 } }
                frame.value
                ReadoutRow { Stat("time", fix(waveT % 30, 1) + " s of 30"); Stat("longest", "24 swings", UE.Cyan); Stat("shortest", "38 swings", UE.Violet) }
                Note("Each pendulum is tuned to fit one more swing into 30 seconds than its neighbour. They slide out of phase into travelling waves, split into two and three interleaved groups, and at exactly 30 s all realign.")
            }
            else -> {
                UESlider("Driving frequency", drive, 0.2f..2f, accent = UE.Amber, format = { "${fix(it, 2)} Hz" }) { drive = it; peak = 0f }
                UESlider("Damping γ", gamma, 0.03f..1.2f, log = true, accent = Domain.Physics.accent, format = { fix(it, 2) }) { gamma = it; peak = 0f }
                frame.value
                val w0 = 2 * PI; val ww = 2 * PI * drive
                ReadoutRow {
                    Stat("natural f₀", "1.00 Hz"); Stat("quality Q", fix(1.0 / gamma, 1), UE.Cyan)
                    Stat("phase lag", fix(atan2(gamma * w0 * ww, w0 * w0 - ww * ww) * 180 / PI, 0) + "°", UE.Amber); Stat("amplitude", fix(peak, 2), UE.Text)
                }
                Note("Sweep the drive through 1 Hz. Far below, the mass follows the hand; far above, it barely moves and lags by 180°; at resonance each push arrives exactly in time and the amplitude is limited only by damping.")
            }
        }
    }
}
