package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import dev.universe.engine.core.ui.*
import kotlin.math.*

internal class Body(var x: Double, var y: Double, var vx: Double, var vy: Double, var m: Double, val color: Color) {
    var ax = 0.0; var ay = 0.0
    val trail = FloatArray(2 * TRAIL); var head = 0; var count = 0
    val radius: Double get() = 1.6 * cbrt(m)
    fun mark() { trail[head * 2] = x.toFloat(); trail[head * 2 + 1] = y.toFloat(); head = (head + 1) % TRAIL; if (count < TRAIL) count++ }
    companion object { const val TRAIL = 420 }
}

/** Direct-summation N-body gravity with a symplectic kick–drift–kick leapfrog and adaptive sub-stepping. G = 1. */
internal class NBodySim {
    val bodies = ArrayList<Body>()
    var softening = 0.6
    var merge = true
    var time = 0.0

    fun accelerations() {
        for (b in bodies) { b.ax = 0.0; b.ay = 0.0 }
        for (i in bodies.indices) for (j in i + 1 until bodies.size) {
            val a = bodies[i]; val b = bodies[j]
            val dx = b.x - a.x; val dy = b.y - a.y
            val r2 = dx * dx + dy * dy + softening * softening
            val inv = 1 / (r2 * sqrt(r2))
            a.ax += b.m * dx * inv; a.ay += b.m * dy * inv
            b.ax -= a.m * dx * inv; b.ay -= a.m * dy * inv
        }
    }

    /** Time step small enough to resolve the tightest pair: a fraction of r / v_rel and of the local free-fall time. */
    private fun safeStep(): Double {
        var h = 0.08
        for (i in bodies.indices) for (j in i + 1 until bodies.size) {
            val a = bodies[i]; val b = bodies[j]
            val r = hypot(b.x - a.x, b.y - a.y) + softening
            val v = hypot(b.vx - a.vx, b.vy - a.vy)
            h = min(h, 0.03 * r / (v + 1e-9))
            h = min(h, 0.05 * sqrt(r * r * r / (a.m + b.m)))
        }
        return h.coerceAtLeast(2e-4)
    }

    fun advance(duration: Double, maxSteps: Int = 600) {
        var left = duration
        var steps = 0
        accelerations()
        while (left > 1e-12 && steps < maxSteps) {
            val h = min(left, safeStep())
            for (b in bodies) { b.vx += b.ax * h / 2; b.vy += b.ay * h / 2; b.x += b.vx * h; b.y += b.vy * h }
            accelerations()
            for (b in bodies) { b.vx += b.ax * h / 2; b.vy += b.ay * h / 2 }
            if (merge) collide()
            left -= h; time += h; steps++
        }
    }

    private fun collide() {
        var i = 0
        while (i < bodies.size) {
            var j = i + 1
            while (j < bodies.size) {
                val a = bodies[i]; val b = bodies[j]
                if (hypot(b.x - a.x, b.y - a.y) < (a.radius + b.radius) * 0.8) {
                    // perfectly inelastic merger: momentum and mass are conserved, kinetic energy is not
                    val m = a.m + b.m
                    val big = if (a.m >= b.m) a else b
                    val n = Body((a.x * a.m + b.x * b.m) / m, (a.y * a.m + b.y * b.m) / m, (a.vx * a.m + b.vx * b.m) / m, (a.vy * a.m + b.vy * b.m) / m, m, big.color)
                    System.arraycopy(big.trail, 0, n.trail, 0, big.trail.size); n.head = big.head; n.count = big.count
                    bodies[i] = n; bodies.removeAt(j)
                    accelerations()
                } else j++
            }
            i++
        }
    }

    fun energy(): Double {
        var e = 0.0
        for (b in bodies) e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy)
        for (i in bodies.indices) for (j in i + 1 until bodies.size) {
            val a = bodies[i]; val b = bodies[j]
            e -= a.m * b.m / sqrt((b.x - a.x).pow(2) + (b.y - a.y).pow(2) + softening * softening)
        }
        return e
    }

    fun angularMomentum(): Double = bodies.sumOf { it.m * (it.x * it.vy - it.y * it.vx) }
}

private val PALETTE = listOf(UE.Cyan, UE.Violet, UE.Green, UE.Magenta, UE.Blue, Color(0xFFFF8A5B), Color(0xFFB8F2FF))

private fun NBodySim.load(preset: Int) {
    bodies.clear(); time = 0.0; softening = 0.6
    val sun = Color(0xFFFFD27A)
    fun circ(r: Double, m: Double, c: Color, central: Double = 1000.0, phase: Double = 0.0, cx: Double = 0.0, cy: Double = 0.0, cvx: Double = 0.0, cvy: Double = 0.0): Body {
        val v = sqrt(central / r)
        return Body(cx + r * cos(phase), cy + r * sin(phase), cvx - v * sin(phase), cvy + v * cos(phase), m, c)
    }
    when (preset) {
        0 -> {
            bodies += Body(0.0, 0.0, 0.0, 0.0, 1000.0, sun)
            bodies += circ(55.0, 0.6, PALETTE[6], phase = 0.4); bodies += circ(95.0, 2.0, PALETTE[0], phase = 2.1); bodies += circ(140.0, 1.2, PALETTE[5], phase = 4.0)
            val giant = circ(215.0, 14.0, PALETTE[1], phase = 5.2); bodies += giant
            bodies += circ(9.0, 0.05, PALETTE[2], 14.0, 1.0, giant.x, giant.y, giant.vx, giant.vy)
        }
        1 -> {
            val v = sqrt(500.0 / 160.0)
            bodies += Body(-40.0, 0.0, 0.0, -v, 500.0, sun); bodies += Body(40.0, 0.0, 0.0, v, 500.0, PALETTE[5])
            bodies += circ(190.0, 1.0, PALETTE[0]); bodies += circ(260.0, 2.0, PALETTE[1], phase = 2.5)
        }
        2 -> {
            // Chenciner–Montgomery figure-eight choreography (2000), rescaled to M = 1000, L = 100.
            val L = 100.0; val vs = sqrt(1000.0 / L)
            val x = 0.97000436 * L; val y = 0.24308753 * L; val vx = 0.93240737 * vs; val vy = 0.86473146 * vs
            softening = 0.05
            bodies += Body(x, -y, vx / 2, vy / 2, 1000.0, PALETTE[0]); bodies += Body(-x, y, vx / 2, vy / 2, 1000.0, PALETTE[1]); bodies += Body(0.0, 0.0, -vx, -vy, 1000.0, PALETTE[3])
        }
        3 -> {
            bodies += Body(0.0, 0.0, 0.0, 0.0, 1000.0, sun)
            bodies += circ(150.0, 8.0, PALETTE[5])
            for (k in -2..2) { bodies += circ(150.0, 0.001, PALETTE[2], phase = PI / 3 + k * 0.05); bodies += circ(150.0, 0.001, PALETTE[0], phase = -PI / 3 + k * 0.05) }
        }
        4 -> {
            // Burrau's Pythagorean problem: masses 3, 4, 5 at rest on the corners of a 3-4-5 triangle.
            softening = 0.25
            bodies += Body(40.0, 120.0, 0.0, 0.0, 300.0, PALETTE[0]); bodies += Body(-80.0, -40.0, 0.0, 0.0, 400.0, PALETTE[1]); bodies += Body(40.0, -40.0, 0.0, 0.0, 500.0, PALETTE[3])
        }
        else -> {
            bodies += Body(0.0, 0.0, 0.0, 0.0, 1000.0, sun)
            val planet = circ(130.0, 12.0, PALETTE[1], phase = 0.9); bodies += planet
            bodies += Body(-260.0, -118.0, 2.35, 0.55, 0.001, PALETTE[2])
        }
    }
    // remove any net drift so the system stays on screen
    val mt = bodies.sumOf { it.m }
    val px = bodies.sumOf { it.m * it.vx } / mt; val py = bodies.sumOf { it.m * it.vy } / mt
    for (b in bodies) { b.vx -= px; b.vy -= py }
}

private val OrbitsInfo = LabInfo(
    equations = listOf(
        "\\vec{F}_{ij} = G\\frac{m_i m_j}{r_{ij}^2}\\,\\hat{r}_{ij}",
        "E = \\sum_i \\tfrac{1}{2} m_i v_i^2 - \\sum_{i<j} \\frac{G m_i m_j}{r_{ij}}, \\qquad \\vec{L} = \\sum_i m_i\\, \\vec{r}_i \\times \\vec{v}_i",
        "v^2 = GM\\left(\\frac{2}{r} - \\frac{1}{a}\\right), \\qquad T^2 = \\frac{4\\pi^2}{GM}a^3",
    ),
    about = "Every body pulls on every other with Newton's inverse-square law — nothing else is programmed. Ellipses, slingshots, the stable Trojan points 60° ahead of and behind a planet, the figure-eight three-body dance discovered in 1993 and the chaos of Burrau's Pythagorean problem all emerge from that one rule. Switch on Launch to fling in bodies of your own: the dashed line previews the path.",
    notes = listOf(
        "Units are scaled so that G = 1; masses, lengths and times are arbitrary but mutually consistent.",
        "The integrator is a kick–drift–kick leapfrog. It is symplectic: energy does not drift systematically but oscillates slightly. The drift readout shows how well it is doing.",
        "The force is softened at very short range (r² → r² + ε²) so close encounters do not produce infinite accelerations. Real point masses would whip around each other even harder.",
        "Touching bodies merge inelastically (mass and momentum conserved). Real collisions shatter, spin and radiate; that physics is not modelled. The motion is confined to a plane.",
        "The launch preview treats every other body as frozen where it is now, so it is only a guide.",
    ),
)

@Composable
fun OrbitsLab() {
    val sim = remember { NBodySim().also { it.load(0) } }
    val view = remember { PlotView(span = 620.0, minSpan = 60.0, maxSpan = 4000.0) }
    var preset by remember { mutableIntStateOf(0) }
    var speed by remember { mutableFloatStateOf(30f) }
    var running by remember { mutableStateOf(true) }
    var launch by remember { mutableStateOf(false) }
    var newMass by remember { mutableFloatStateOf(1f) }
    var follow by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Body?>(null) }
    var dragFrom by remember { mutableStateOf<Offset?>(null) }
    var dragTo by remember { mutableStateOf<Offset?>(null) }
    var e0 by remember { mutableDoubleStateOf(sim.energy()) }
    var colorIdx by remember { mutableIntStateOf(0) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val stars = remember { StarData(90, 11) }
    val pickPx = with(androidx.compose.ui.platform.LocalDensity.current) { 34.dp.toPx() }

    val frame = rememberTicker(running) { dt ->
        sim.advance(dt * speed.toDouble())
        for (b in sim.bodies) b.mark()
        if (selected != null && selected !in sim.bodies) selected = null
        if (follow) { val f = selected ?: sim.bodies.maxByOrNull { it.m }; if (f != null) { view.cx = f.x; view.cy = -f.y } }
    }
    fun reset(p: Int) { preset = p; sim.load(p); e0 = sim.energy(); selected = null; view.cx = 0.0; view.cy = 0.0; view.span = if (p == 2) 420.0 else 620.0 }
    val velScale = 0.02 * (view.span / 620.0)

    LabScaffold("Gravity Sandbox", Domain.Physics, OrbitsInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(view, key = launch,
                onTap = { o -> selected = sim.bodies.minByOrNull { (view.pt(it.x, -it.y) - o).getDistance() }?.takeIf { (view.pt(it.x, -it.y) - o).getDistance() < pickPx } },
                onSingle = { o, ph ->
                    if (!launch) false else {
                        when (ph) {
                            0 -> { dragFrom = o; dragTo = o }
                            1 -> dragTo = o
                            else -> {
                                val a = dragFrom; val b = dragTo
                                if (a != null && b != null) {
                                    sim.bodies += Body(view.wx(a.x), -view.wy(a.y), (b.x - a.x) * velScale, (b.y - a.y) * velScale, newMass.toDouble(), PALETTE[colorIdx % PALETTE.size])
                                    colorIdx++; e0 = sim.energy()
                                }
                                dragFrom = null; dragTo = null
                            }
                        }
                        true
                    }
                }),
        ) {
            frame.value
            view.bind(this)
            val dp = 1.dp.toPx()
            drawStars(stars, 0f, 0f, 0.6f)
            val sc = view.scale.toFloat()
            for (b in sim.bodies) {
                if (b.count > 1) {
                    path.rewind()
                    val start = (b.head - b.count + Body.TRAIL) % Body.TRAIL
                    for (k in 0 until b.count) {
                        val i = (start + k) % Body.TRAIL
                        val px = view.sx(b.trail[i * 2].toDouble()); val py = view.sy(-b.trail[i * 2 + 1].toDouble())
                        if (k == 0) path.moveTo(px, py) else path.lineTo(px, py)
                    }
                    drawPath(path, b.color.copy(alpha = 0.55f), style = Stroke(1.3f * dp))
                }
            }
            for (b in sim.bodies) {
                val p = view.pt(b.x, -b.y)
                val r = (b.radius.toFloat() * sc).coerceAtLeast(2.2f * dp)
                if (b.m >= 100) drawCircle(Brush.radialGradient(listOf(b.color.copy(alpha = 0.55f), Color.Transparent), p, r * 4f), r * 4f, p, blendMode = BlendMode.Plus)
                drawCircle(b.color.copy(alpha = 0.3f), r * 1.8f, p, blendMode = BlendMode.Plus)
                drawCircle(b.color, r, p); drawCircle(Color.White.copy(alpha = 0.75f), r * 0.45f, p - Offset(r * 0.2f, r * 0.2f))
                if (b === selected) drawCircle(UE.Text, r + 6 * dp, p, style = Stroke(1.2f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * dp, 3 * dp))))
            }
            // osculating Kepler ellipse of the selected body about the heaviest one
            val sel = selected; val primary = sim.bodies.maxByOrNull { it.m }
            if (sel != null && primary != null && sel !== primary) {
                val mu = primary.m + sel.m
                val rx = sel.x - primary.x; val ry = sel.y - primary.y; val vx = sel.vx - primary.vx; val vy = sel.vy - primary.vy
                val r = hypot(rx, ry); val h = rx * vy - ry * vx
                val ex = (vy * h) / mu - rx / r; val ey = (-vx * h) / mu - ry / r
                val e = hypot(ex, ey); val a = 1 / (2 / r - (vx * vx + vy * vy) / mu)
                if (e < 0.98 && a > 0) {
                    val w = atan2(ey, ex); val pp = a * (1 - e * e)
                    path.rewind()
                    for (k in 0..120) { val th = k / 120.0 * 2 * PI; val rr = pp / (1 + e * cos(th)); val q = view.pt(primary.x + rr * cos(th + w), -(primary.y + rr * sin(th + w))); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                    drawPath(path, UE.Text.copy(alpha = 0.5f), style = Stroke(dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp))))
                }
            }
            val a = dragFrom; val b = dragTo
            if (a != null && b != null) {
                arrow(a, b, UE.Amber, 2f * dp, 10 * dp)
                var x = view.wx(a.x); var y = -view.wy(a.y); var vx = (b.x - a.x) * velScale; var vy = (b.y - a.y) * velScale
                path.rewind(); path.moveTo(a.x, a.y)
                val h = 0.4 * view.span / 620.0
                for (k in 0 until 500) {
                    var ax = 0.0; var ay = 0.0
                    for (o in sim.bodies) { val dx = o.x - x; val dy = o.y - y; val r2 = dx * dx + dy * dy + 4.0; val inv = o.m / (r2 * sqrt(r2)); ax += dx * inv; ay += dy * inv }
                    vx += ax * h; vy += ay * h; x += vx * h; y += vy * h
                    path.lineTo(view.sx(x), view.sy(-y))
                }
                drawPath(path, UE.Amber.copy(alpha = 0.7f), style = Stroke(1.2f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * dp, 5 * dp))))
            }
            if (launch && a == null) label(tm, "drag to launch a body", size.width / 2, 10 * dp, UE.Amber, 11f, 0.5f, 0f, UE.Display)
        }
    }) {
        ChipRow(listOf("Star system", "Binary star", "Figure-eight", "Trojan points", "Pythagorean chaos", "Gravity assist"), preset, Domain.Physics.accent) { reset(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlowButton(if (running) "Pause" else "Run", accent = Domain.Physics.accent, filled = !running) { running = !running }
            GlowButton("Restart", accent = UE.Dim) { reset(preset) }
            GlowButton("Clear trails", accent = UE.Dim) { for (b in sim.bodies) b.count = 0 }
        }
        UESlider("Simulation speed", speed, 2f..200f, log = true, accent = Domain.Physics.accent, format = { "×${fix(it, 0)}" }) { speed = it }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Toggle("Launch bodies", launch, accent = UE.Amber) { launch = it }
            Toggle("Follow", follow) { follow = it }
            Toggle("Mergers", sim.merge) { sim.merge = it; e0 = sim.energy() }
        }
        if (launch) UESlider("Mass of new body", newMass, 0.01f..600f, log = true, accent = UE.Amber, format = { fmt(it, 2) }) { newMass = it }
        frame.value
        val e = sim.energy()
        ReadoutRow {
            Stat("bodies", sim.bodies.size.toString()); Stat("energy E", fmt(e, 4), UE.Cyan)
            Stat("drift", fmt(abs((e - e0) / (abs(e0) + 1e-9)) * 100, 2) + " %", UE.Magenta); Stat("ang. mom. L", fmt(sim.angularMomentum(), 4), UE.Violet)
        }
        val sel = selected; val primary = sim.bodies.maxByOrNull { it.m }
        if (sel != null && primary != null && sel !== primary) {
            val mu = primary.m + sel.m
            val r = hypot(sel.x - primary.x, sel.y - primary.y); val v2 = (sel.vx - primary.vx).pow(2) + (sel.vy - primary.vy).pow(2)
            val a = 1 / (2 / r - v2 / mu)
            val h = (sel.x - primary.x) * (sel.vy - primary.vy) - (sel.y - primary.y) * (sel.vx - primary.vx)
            val ecc = sqrt(max(0.0, 1 + (v2 / 2 - mu / r) * 2 * h * h / (mu * mu)))
            ReadoutRow {
                Stat("semi-major a", if (a > 0) fmt(a, 4) else "unbound", UE.Text); Stat("eccentricity", fix(ecc, 3), UE.Amber)
                Stat("period", if (a > 0) fmt(2 * PI * sqrt(a * a * a / mu), 4) else "—"); Stat("speed", fmt(sqrt(v2), 3))
            }
        } else Note("Tap a body to see its orbit about the heaviest mass: the dashed curve is the Kepler ellipse it would follow if nothing else pulled on it.")
    }
}
