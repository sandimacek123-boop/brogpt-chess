package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*

/** A smooth track through control points (Catmull–Rom), resampled by arc length. Units: metres, y up. */
internal class Track(ctrl: List<Offset>) {
    val xs: FloatArray; val ys: FloatArray; val len: Float; val step = 0.05f
    init {
        val pts = ArrayList<Offset>()
        val c = listOf(ctrl.first()) + ctrl + listOf(ctrl.last())
        for (i in 1 until c.size - 2) for (k in 0 until 24) {
            val t = k / 24f; val t2 = t * t; val t3 = t2 * t
            val p0 = c[i - 1]; val p1 = c[i]; val p2 = c[i + 1]; val p3 = c[i + 2]
            pts += Offset(0.5f * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                0.5f * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3))
        }
        pts += ctrl.last()
        var total = 0f
        for (i in 1 until pts.size) total += (pts[i] - pts[i - 1]).getDistance()
        len = total
        val n = (total / step).toInt() + 1
        xs = FloatArray(n); ys = FloatArray(n)
        var j = 0; var acc = 0f
        for (k in 0 until n) {
            val d = k * step
            while (j < pts.size - 2 && acc + (pts[j + 1] - pts[j]).getDistance() < d) { acc += (pts[j + 1] - pts[j]).getDistance(); j++ }
            val seg = (pts[j + 1] - pts[j]).getDistance().coerceAtLeast(1e-6f)
            val f = ((d - acc) / seg).coerceIn(0f, 1f)
            xs[k] = pts[j].x + (pts[j + 1].x - pts[j].x) * f; ys[k] = pts[j].y + (pts[j + 1].y - pts[j].y) * f
        }
    }
    fun at(s: Float): Offset { val f = (s / step).coerceIn(0f, xs.size - 1.001f); val i = f.toInt(); val t = f - i; return Offset(xs[i] + (xs[i + 1] - xs[i]) * t, ys[i] + (ys[i + 1] - ys[i]) * t) }
    /** sin of the slope angle: dy/ds. */
    fun slope(s: Float): Float { val a = at(s - 0.05f); val b = at(s + 0.05f); return ((b.y - a.y) / (b - a).getDistance().coerceAtLeast(1e-6f)) }
    fun curvature(s: Float): Float { val a = at(s - 0.1f); val b = at(s); val c = at(s + 0.1f); val d1 = b - a; val d2 = c - b; return (d1.x * d2.y - d1.y * d2.x) / (0.1f * 0.1f * 0.1f) }
    val minY: Float get() = ys.min()
}

private val TRACKS = listOf(
    "Half-pipe" to listOf(Offset(0f, 7f), Offset(2f, 2.4f), Offset(5f, 0.3f), Offset(8f, 0.3f), Offset(11f, 2.4f), Offset(13f, 7f)),
    "Hills" to listOf(Offset(0f, 7.5f), Offset(2.5f, 1f), Offset(5f, 4.5f), Offset(7.5f, 0.6f), Offset(10f, 3f), Offset(13f, 6f)),
    "Ramp" to listOf(Offset(0f, 8f), Offset(3f, 3.5f), Offset(6f, 0.5f), Offset(9f, 0.4f), Offset(11f, 1.5f), Offset(13f, 3.5f)),
    "Double well" to listOf(Offset(0f, 6.5f), Offset(2.5f, 0.6f), Offset(5f, 2.8f), Offset(6.5f, 3.2f), Offset(8f, 2.8f), Offset(10.5f, 0.6f), Offset(13f, 6.5f)),
)

private val EnergyInfo = LabInfo(
    equations = listOf(
        "E = \\tfrac{1}{2}mv^2 + mgh + Q = \\text{constant}",
        "m\\dot{v} = -mg\\sin\\alpha - \\mu N\\,\\mathrm{sgn}(v), \\qquad N = m\\left(g\\cos\\alpha + \\kappa v^2\\right)",
        "v = \\sqrt{2g(h_0 - h)} \\quad (\\mu = 0)",
    ),
    about = "Energy changes form but never disappears. Climbing, the skater trades speed (kinetic energy) for height (potential energy); descending, the trade reverses. Friction turns some of it into heat at every moment, so with friction the skater can never again reach the starting height — but the total, including that heat, stays exactly the same. Drag the white control points to reshape the track, and tap anywhere on it to drop the skater from there.",
    notes = listOf(
        "The skater is a point mass that stays on the track (a bead on a wire); real skaters can fly off crests where the required centripetal force exceeds gravity.",
        "Friction is Coulomb friction μN, where the normal force N includes the centripetal term from the track's curvature, so it is larger in dips than on crests.",
        "Motion is integrated with 20 sub-steps per frame. The 'total' bar tracks the integration error, which stays well under 1 %.",
    ),
)

@Composable
fun EnergyLab() {
    var ti by remember { mutableIntStateOf(0) }
    var ctrl by remember { mutableStateOf(TRACKS[0].second) }
    val track = remember(ctrl) { Track(ctrl) }
    var mu by remember { mutableFloatStateOf(0f) }
    var mass by remember { mutableFloatStateOf(60f) }
    var g by remember { mutableFloatStateOf(9.81f) }
    var s by remember { mutableFloatStateOf(0.5f) }
    var v by remember { mutableFloatStateOf(0f) }
    var heat by remember { mutableFloatStateOf(0f) }
    var running by remember { mutableStateOf(true) }
    var grab by remember { mutableIntStateOf(-1) }
    val hist = remember { FloatArray(3 * 240) }
    var histN by remember { mutableIntStateOf(0) }
    var cs by remember { mutableStateOf(Size(1f, 1f)) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val grabPx = with(androidx.compose.ui.platform.LocalDensity.current) { 30.dp.toPx() }
    val y0 = track.minY

    fun reset(at: Float = s) { s = at.coerceIn(0.05f, track.len - 0.05f); v = 0f; heat = 0f; histN = 0 }
    LaunchedEffect(ti) { ctrl = TRACKS[ti].second; reset(0.3f) }

    val frame = rememberTicker(running) { dt ->
        val h = dt / 20
        repeat(20) {
            val sa = track.slope(s); val ca = sqrt(max(0f, 1 - sa * sa))
            val kappa = track.curvature(s)
            val n = max(0f, g * ca + kappa * v * v)
            var a = -g * sa
            if (mu > 0f && abs(v) > 1e-4f) { val fr = mu * n; a -= fr * sign(v); heat += mass * fr * abs(v) * h }
            else if (mu > 0f && abs(g * sa) < mu * n) { a = 0f; v = 0f }
            v += a * h; s += v * h
            if (s < 0.02f) { s = 0.02f; v = abs(v) * 0.98f } else if (s > track.len - 0.02f) { s = track.len - 0.02f; v = -abs(v) * 0.98f }
        }
        val i = histN % 240
        val hgt = track.at(s).y - y0
        hist[i * 3] = 0.5f * mass * v * v; hist[i * 3 + 1] = mass * g * hgt; hist[i * 3 + 2] = heat
        histN++
    }

    LabScaffold("Energy Skate Park", Domain.Physics, EnergyInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(null, key = ctrl,
                onTap = { o ->
                    val sc = cs.width / 13.4f; val base = cs.height * 0.62f
                    var best = 0f; var bd = Float.MAX_VALUE
                    var q = 0f
                    while (q < track.len) { val p = track.at(q); val d = (Offset(cs.width * 0.02f + p.x * sc, base - p.y * sc) - o).getDistance(); if (d < bd) { bd = d; best = q }; q += 0.05f }
                    if (bd < grabPx * 1.5f) reset(best)
                },
                onSingle = { o, ph ->
                    val sc = cs.width / 13.4f; val base = cs.height * 0.62f
                    fun scr(p: Offset) = Offset(cs.width * 0.02f + p.x * sc, base - p.y * sc)
                    if (ph == 0) { grab = ctrl.indices.minByOrNull { (scr(ctrl[it]) - o).getDistance() } ?: -1; if (grab >= 0 && (scr(ctrl[grab]) - o).getDistance() > grabPx) grab = -1 }
                    if (ph == 1 && grab >= 0) {
                        val nx = ((o.x - cs.width * 0.02f) / sc).let { x -> if (grab == 0) 0f else if (grab == ctrl.lastIndex) 13f else x.coerceIn(ctrl[grab - 1].x + 0.4f, ctrl[grab + 1].x - 0.4f) }
                        val ny = ((base - o.y) / sc).coerceIn(0f, 9f)
                        ctrl = ctrl.toMutableList().also { it[grab] = Offset(nx, ny) }
                        s = s.coerceAtMost(track.len - 0.05f)
                    }
                    if (ph == 2 && grab >= 0) { heat = 0f; histN = 0 }
                    grab >= 0
                }),
        ) {
            frame.value
            cs = size
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            val sc = w / 13.4f; val base = h * 0.62f
            fun scr(p: Offset) = Offset(w * 0.02f + p.x * sc, base - p.y * sc)
            for (m in 0..9) { val y = base - m * sc; drawLine(Color.White.copy(alpha = 0.05f), Offset(0f, y), Offset(w, y), 1f); if (m % 2 == 0) label(tm, "$m m", w - 4 * dp, y - 2 * dp, UE.Faint, 8.5f, 1f, 1f) }
            path.rewind()
            for (k in track.xs.indices) { val q = scr(Offset(track.xs[k], track.ys[k])); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
            val fill = Path().apply { addPath(path); lineTo(scr(Offset(track.xs.last(), -1f)).x, h * 0.66f); lineTo(scr(Offset(track.xs.first(), -1f)).x, h * 0.66f); close() }
            drawPath(fill, Domain.Physics.accent.copy(alpha = 0.08f))
            glowPath(path, Domain.Physics.accent, 3 * dp)
            for (c in ctrl) { val q = scr(c); drawCircle(Color.Black.copy(alpha = 0.5f), 7 * dp, q); drawCircle(UE.Text, 7 * dp, q, style = Stroke(1.5f * dp)) }
            // reference line: height the skater can still reach
            val eTot = 0.5f * mass * v * v + mass * g * (track.at(s).y - y0)
            val reach = eTot / (mass * g) + y0
            val ry = base - reach * sc
            drawLine(UE.Amber.copy(alpha = 0.5f), Offset(0f, ry), Offset(w, ry), dp, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6 * dp, 5 * dp)))
            label(tm, "highest reachable point", 6 * dp, ry - 2 * dp, UE.Amber, 9f, 0f, 1f)
            val p = scr(track.at(s))
            val sa = track.slope(s); val ca = sqrt(max(0f, 1 - sa * sa))
            val nrm = Offset(-sa, -ca).let { if (it.y > 0) -it else it }
            glowDot(p + Offset(-nrm.x * -9 * dp, nrm.y * 9 * dp), Color.White, 8 * dp)
            // bars
            val ke = 0.5f * mass * v * v; val pe = mass * g * (track.at(s).y - y0); val tot = ke + pe + heat
            val maxE = max(tot, 1f) * 1.1f
            val bTop = h * 0.7f; val bBot = h * 0.97f; val bw = w * 0.07f
            for ((i, triple) in listOf(Triple("KE", ke, UE.Cyan), Triple("PE", pe, UE.Violet), Triple("heat", heat, UE.Red), Triple("total", tot, UE.Text)).withIndex()) {
                val x = w * 0.04f + i * bw * 1.45f
                val bh = (triple.second / maxE) * (bBot - bTop)
                drawRoundRect(triple.third.copy(alpha = 0.85f), Offset(x, bBot - bh), Size(bw, bh), CornerRadius(3 * dp))
                label(tm, triple.first, x + bw / 2, bBot + 2 * dp, triple.third, 9f, 0.5f, 0f)
            }
            // energy history
            val gl = w * 0.46f; val gr = w - 8 * dp
            drawRect(Color.White.copy(alpha = 0.03f), Offset(gl, bTop), Size(gr - gl, bBot - bTop))
            val n = min(histN, 240)
            for ((c, col) in listOf(0 to UE.Cyan, 1 to UE.Violet, 2 to UE.Red)) {
                path.rewind()
                for (k in 0 until n) { val i = (histN - n + k) % 240; val q = Offset(gl + (gr - gl) * k / 239f, bBot - hist[i * 3 + c] / maxE * (bBot - bTop)); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                drawPath(path, col, style = Stroke(1.4f * dp))
            }
            label(tm, "energy over the last 4 s", gl + 4 * dp, bTop + 3 * dp, UE.Dim, 8.5f)
        }
    }) {
        ChipRow(TRACKS.map { it.first }, ti, Domain.Physics.accent) { ti = it }
        UESlider("Friction μ", mu, 0f..0.3f, accent = UE.Red, format = { fix(it, 3) }) { mu = it }
        UESlider("Skater mass", mass, 20f..120f, accent = Domain.Physics.accent, format = { "${fix(it, 0)} kg" }) { mass = it; heat = 0f }
        ChipRow(listOf("Earth 9.81", "Moon 1.62", "Jupiter 24.8"), when (g) { 1.62f -> 1; 24.8f -> 2; else -> 0 }, Domain.Physics.accent) { g = listOf(9.81f, 1.62f, 24.8f)[it]; heat = 0f }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlowButton(if (running) "Pause" else "Run", accent = Domain.Physics.accent) { running = !running }
            GlowButton("Restart at top", accent = UE.Dim) { reset(0.3f) }
        }
        frame.value
        val ke = 0.5f * mass * v * v; val pe = mass * g * (track.at(s).y - y0)
        ReadoutRow { Stat("speed", fix(abs(v), 2) + " m/s", UE.Cyan); Stat("height", fix(track.at(s).y - y0, 2) + " m", UE.Violet); Stat("heat", fmt(heat, 3) + " J", UE.Red); Stat("total", fmt(ke + pe + heat, 4) + " J") }
        Note("Tap the track to drop the skater there. With μ = 0 the amber line never moves: the skater always returns to the same height.")
    }
}
