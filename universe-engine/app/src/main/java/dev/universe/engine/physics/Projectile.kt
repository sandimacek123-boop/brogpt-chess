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
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*

/** Projectile with quadratic air drag, integrated with RK4. Returns the flight path as (x, y, vx, vy, t) samples. */
internal fun flight(v0: Double, angleDeg: Double, h0: Double, g: Double, drag: Double, dt: Double = 0.004): List<DoubleArray> {
    val a = angleDeg * PI / 180
    var x = 0.0; var y = h0; var vx = v0 * cos(a); var vy = v0 * sin(a); var t = 0.0
    val out = ArrayList<DoubleArray>()
    out += doubleArrayOf(x, y, vx, vy, t)
    fun ax(vx: Double, vy: Double) = -drag * hypot(vx, vy) * vx
    fun ay(vx: Double, vy: Double) = -g - drag * hypot(vx, vy) * vy
    var guard = 0
    while (guard++ < 200_000) {
        val k1x = vx; val k1y = vy; val k1vx = ax(vx, vy); val k1vy = ay(vx, vy)
        val k2x = vx + k1vx * dt / 2; val k2y = vy + k1vy * dt / 2; val k2vx = ax(k2x, k2y); val k2vy = ay(k2x, k2y)
        val k3x = vx + k2vx * dt / 2; val k3y = vy + k2vy * dt / 2; val k3vx = ax(k3x, k3y); val k3vy = ay(k3x, k3y)
        val k4x = vx + k3vx * dt; val k4y = vy + k3vy * dt; val k4vx = ax(k4x, k4y); val k4vy = ay(k4x, k4y)
        val nx = x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); val ny = y + dt / 6 * (k1y + 2 * k2y + 2 * k3y + k4y)
        val nvx = vx + dt / 6 * (k1vx + 2 * k2vx + 2 * k3vx + k4vx); val nvy = vy + dt / 6 * (k1vy + 2 * k2vy + 2 * k3vy + k4vy)
        if (ny < 0 && t > 0) {
            val f = y / (y - ny)
            out += doubleArrayOf(x + (nx - x) * f, 0.0, vx + (nvx - vx) * f, vy + (nvy - vy) * f, t + dt * f)
            break
        }
        x = nx; y = ny; vx = nvx; vy = nvy; t += dt
        if (out.size < 4000 && (guard % 4 == 0)) out += doubleArrayOf(x, y, vx, vy, t)
    }
    return out
}

private class Body2(val name: String, val g: Double, val rho: Double)
private val WORLDS = listOf(Body2("Earth", 9.81, 1.225), Body2("Moon", 1.62, 0.0), Body2("Mars", 3.72, 0.02), Body2("Jupiter", 24.79, 0.16), Body2("Titan", 1.35, 5.3))
private class Ball(val name: String, val mass: Double, val diameter: Double, val cd: Double)
private val BALLS = listOf(Ball("Cannonball", 6.0, 0.11, 0.47), Ball("Football", 0.43, 0.22, 0.25), Ball("Tennis ball", 0.058, 0.067, 0.55), Ball("Ping-pong", 0.0027, 0.04, 0.5))

private val ProjectileInfo = LabInfo(
    equations = listOf(
        "x(t) = v_0\\cos\\theta\\, t, \\qquad y(t) = h_0 + v_0\\sin\\theta\\, t - \\tfrac{1}{2} g t^2",
        "R = \\frac{v_0^2 \\sin 2\\theta}{g} \\quad (h_0 = 0,\\ \\text{no air})",
        "m\\dot{\\vec{v}} = m\\vec{g} - \\tfrac{1}{2}\\rho C_d A\\, |\\vec{v}|\\,\\vec{v}",
    ),
    about = "Without air, a projectile's horizontal and vertical motions are independent: constant speed sideways, constant acceleration downward, so the path is a parabola, and 45° gives the longest range on level ground. Air drag grows with the square of speed and always opposes the motion; it steals the most range from light, fast objects, skews the parabola into a steeper descent and lowers the best launch angle. Compare worlds — on the Moon there is no air at all; on Saturn's moon Titan the air is four times denser than ours while gravity is a seventh as strong.",
    notes = listOf(
        "Drag uses a constant drag coefficient C_d. In reality C_d changes with speed (the 'drag crisis' of a golf ball, for example), and spinning balls feel a Magnus force that is not modelled.",
        "Air density is taken as constant with height, and gravity as uniform: both fine for trajectories of a few hundred metres.",
        "The optimal angle with drag is found by scanning launch angles in 0.25° steps.",
    ),
)

@Composable
fun ProjectileLab() {
    var v0 by remember { mutableFloatStateOf(30f) }
    var angle by remember { mutableFloatStateOf(45f) }
    var h0 by remember { mutableFloatStateOf(0f) }
    var world by remember { mutableIntStateOf(0) }
    var ball by remember { mutableIntStateOf(2) }
    var air by remember { mutableStateOf(true) }
    var compare by remember { mutableStateOf(true) }
    var vectors by remember { mutableStateOf(true) }
    val history = remember { mutableStateListOf<List<DoubleArray>>() }
    var launchT by remember { mutableFloatStateOf(-1f) }
    val time by rememberTime(launchT >= 0f)
    val tm = rememberTextMeasurer(cacheSize = 48)
    val path = remember { Path() }
    val W = WORLDS[world]; val B = BALLS[ball]
    val k = if (air) 0.5 * W.rho * B.cd * PI * B.diameter * B.diameter / 4 / B.mass else 0.0
    val traj = remember(v0, angle, h0, world, ball, air) { flight(v0.toDouble(), angle.toDouble(), h0.toDouble(), W.g, k) }
    val vacuum = remember(v0, angle, h0, world) { flight(v0.toDouble(), angle.toDouble(), h0.toDouble(), W.g, 0.0) }
    val best = remember(v0, h0, world, ball, air) {
        var bestA = 45.0; var bestR = 0.0
        var a = 5.0
        while (a <= 85.0) { val f = flight(v0.toDouble(), a, h0.toDouble(), W.g, k, 0.01); val r = f.last()[0]; if (r > bestR) { bestR = r; bestA = a }; a += 0.25 }
        bestA to bestR
    }
    var cs by remember { mutableStateOf(Size(1f, 1f)) }

    LabScaffold("Projectile Motion", Domain.Physics, ProjectileInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(null, onSingle = { o, ph ->
                // drag from the cannon to aim: direction sets the angle, length sets the speed
                val origin = Offset(cs.width * 0.08f, cs.height * 0.86f)
                if (ph < 2) { val d = o - origin; if (d.x > 4) { angle = (atan2(-d.y, d.x) * 180 / PI.toFloat()).coerceIn(1f, 89f); v0 = (d.getDistance() / cs.width * 90f).coerceIn(2f, 80f) } }
                else { history.add(0, traj); if (history.size > 4) history.removeAt(history.lastIndex); launchT = time }
                true
            }),
        ) {
            cs = size
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            val all = traj + (if (compare && air) vacuum else emptyList())
            val maxX = max(all.maxOf { it[0] }, 1.0); val maxY = max(all.maxOf { it[1] }, h0.toDouble() + 1)
            val ground = h * 0.86f; val left = w * 0.08f
            val s = min((w * 0.86f) / maxX, (ground - h * 0.08f) / maxY).toFloat()
            fun P(x: Double, y: Double) = Offset(left + (x * s).toFloat(), ground - (y * s).toFloat())
            drawLine(Color.White.copy(alpha = 0.4f), Offset(0f, ground), Offset(w, ground), 1.5f * dp)
            val step = niceStep(maxX, 5); var gx = step
            while (gx <= maxX * 1.05) { val p = P(gx, 0.0); drawLine(Color.White.copy(alpha = 0.25f), p, p + Offset(0f, 5 * dp), 1f); label(tm, "${fmt(gx, 3)} m", p.x, p.y + 7 * dp, UE.Dim, 9f, 0.5f, 0f); gx += step }
            if (h0 > 0) { drawRect(UE.Violet.copy(alpha = 0.25f), Offset(left - 10 * dp, P(0.0, h0.toDouble()).y), Size(20 * dp, ground - P(0.0, h0.toDouble()).y)) }
            history.drop(1).forEachIndexed { i, tr -> path.rewind(); tr.forEachIndexed { j, p -> val q = P(p[0], p[1]); if (j == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }; drawPath(path, Color.White.copy(alpha = 0.18f - i * 0.04f), style = Stroke(dp)) }
            if (compare && air) { path.rewind(); vacuum.forEachIndexed { j, p -> val q = P(p[0], p[1]); if (j == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }; drawPath(path, UE.Text.copy(alpha = 0.45f), style = Stroke(1.3f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp)))) }
            path.rewind(); traj.forEachIndexed { j, p -> val q = P(p[0], p[1]); if (j == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
            glowPath(path, Domain.Physics.accent, 2f * dp)
            val apex = traj.maxBy { it[1] }
            glowDot(P(apex[0], apex[1]), UE.Amber, 3.5f * dp); label(tm, "max height ${fmt(apex[1], 3)} m", P(apex[0], apex[1]).x, P(apex[0], apex[1]).y - 8 * dp, UE.Amber, 9.5f, 0.5f, 1f)
            // cannon
            val o = P(0.0, h0.toDouble()); val a = angle * PI.toFloat() / 180
            drawLine(UE.Text, o, o + Offset(cos(a), -sin(a)) * (26 * dp), 6 * dp)
            drawCircle(UE.Text, 8 * dp, o)
            // flying ball
            if (launchT >= 0f) {
                val tf = (time - launchT).toDouble()
                val total = traj.last()[4]
                val i = traj.indexOfFirst { it[4] >= tf }.let { if (it < 0) traj.lastIndex else it }
                val p = traj[i]
                val q = P(p[0], p[1])
                glowDot(q, Color.White, 6 * dp)
                if (vectors) {
                    val vs = 1.4f * dp
                    arrow(q, q + Offset((p[2] * vs).toFloat(), 0f), UE.Cyan, 2 * dp, 8 * dp)
                    arrow(q, q + Offset(0f, -(p[3] * vs).toFloat()), UE.Violet, 2 * dp, 8 * dp)
                    arrow(q, q + Offset(0f, 22 * dp), UE.Amber, 2 * dp, 8 * dp)
                }
                if (tf > total + 1.2) launchT = -1f
            } else label(tm, "drag from the cannon to aim and fire", w / 2, 10 * dp, UE.Dim, 11f, 0.5f, 0f, UE.Display)
        }
    }) {
        UESlider("Launch speed v₀", v0, 2f..80f, accent = Domain.Physics.accent, format = { "${fix(it, 1)} m/s" }) { v0 = it }
        UESlider("Launch angle θ", angle, 1f..89f, accent = UE.Amber, format = { "${fix(it, 1)}°" }) { angle = it }
        UESlider("Launch height h₀", h0, 0f..100f, accent = UE.Violet, format = { "${fix(it, 0)} m" }) { h0 = it }
        ChipRow(WORLDS.map { "${it.name}  g=${fix(it.g, 2)}" }, world, Domain.Physics.accent) { world = it }
        ChipRow(BALLS.map { it.name }, ball, UE.Amber) { ball = it }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Toggle("Air resistance", air, accent = Domain.Physics.accent) { air = it }
            Toggle("Show vacuum path", compare) { compare = it }
            Toggle("Vectors", vectors, accent = UE.Violet) { vectors = it }
        }
        GlowButton("Fire", accent = Domain.Physics.accent, filled = true) { history.add(0, traj); if (history.size > 4) history.removeAt(history.lastIndex); launchT = time }
        val last = traj.last()
        ReadoutRow {
            Stat("range", fmt(last[0], 4) + " m", Domain.Physics.accent); Stat("flight time", fix(last[4], 2) + " s")
            Stat("impact speed", fix(hypot(last[2], last[3]), 1) + " m/s", UE.Amber); Stat("vacuum range", fmt(vacuum.last()[0], 4) + " m", UE.Dim)
        }
        ReadoutRow { Stat("best angle", fix(best.first, 2) + "°", UE.Green); Stat("best range", fmt(best.second, 4) + " m", UE.Green); Stat("drag k = ρC_dA/2m", if (air) fmt(k, 3) + " /m" else "0") }
        Note(if (air && W.rho > 0) "With air the best angle drops below 45° — a lower, faster shot spends less time fighting drag. Try the ping-pong ball: drag dominates almost at once." else "Without air the path is an exact parabola. Angles θ and 90° − θ land at the same spot.")
    }
}
