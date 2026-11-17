package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

internal class Charge(var x: Float, var y: Float, var q: Float)

/** Electric field of point charges (Coulomb's law, k = 1); positions in pixels. Returns potential, fills [out] with (Ex, Ey). */
internal fun fieldAt(charges: List<Charge>, x: Float, y: Float, out: FloatArray): Float {
    var ex = 0f; var ey = 0f; var v = 0f
    for (c in charges) {
        val dx = x - c.x; val dy = y - c.y
        val r2 = dx * dx + dy * dy + 30f
        val r = sqrt(r2)
        ex += c.q * dx / (r2 * r); ey += c.q * dy / (r2 * r); v += c.q / r
    }
    out[0] = ex; out[1] = ey
    return v
}

private val FieldsInfo = LabInfo(
    equations = listOf(
        "\\vec{E}(\\vec{r}) = \\sum_i \\frac{1}{4\\pi\\varepsilon_0} \\frac{q_i}{|\\vec{r}-\\vec{r}_i|^2}\\,\\hat{r}_i, \\qquad V = \\sum_i \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_i}{|\\vec{r}-\\vec{r}_i|}",
        "\\vec{E} = -\\nabla V",
        "\\vec{F} = q\\left(\\vec{E} + \\vec{v} \\times \\vec{B}\\right)",
        "r_c = \\frac{m v_\\perp}{|q| B}, \\qquad \\vec{v}_d = \\frac{\\vec{E} \\times \\vec{B}}{B^2}",
    ),
    about = "An electric field is the force a small positive charge would feel at each point. Field lines follow that force from positive to negative charges; the coloured landscape is the potential, and the bands on it are equipotentials — always at right angles to the field lines. A magnetic field never speeds a charge up: it only turns it, so a charge circles. Add an electric field and the circles drift sideways, perpendicular to both fields — the E × B drift that confines plasma in fusion reactors and shapes the aurora.",
    notes = listOf(
        "The charges are points in a 2D slice of 3D space, with the true 1/r² field. Field-line density is only a rough guide to strength: a fixed number of lines leaves each unit of charge, which is exact in 3D but distorted when drawn in a plane.",
        "The force is softened within a few pixels of each charge so that test particles do not reach infinite speed.",
        "Magnetic motion uses the Boris algorithm, the standard particle pusher in plasma physics: it conserves kinetic energy exactly in a pure magnetic field. The speeds are non-relativistic and the charge does not radiate.",
        "Units are arbitrary: only ratios and shapes are meaningful.",
    ),
)

@Composable
fun FieldsLab() {
    var mode by remember { mutableIntStateOf(0) }
    var px by remember { mutableStateOf(IntSize.Zero) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val charges = remember { mutableStateListOf<Charge>() }
    var version by remember { mutableIntStateOf(0) }
    var selected by remember { mutableIntStateOf(-1) }
    var grab by remember { mutableIntStateOf(-1) }
    var probe by remember { mutableStateOf<Offset?>(null) }
    var showV by remember { mutableStateOf(true) }
    val testers = remember { ArrayList<FloatArray>() }   // x, y, vx, vy
    val out = remember { FloatArray(2) }
    val rnd = remember { Random(9) }
    // lorentz
    var bz by remember { mutableFloatStateOf(1f) }
    var ex by remember { mutableFloatStateOf(0f) }
    var ey by remember { mutableFloatStateOf(0f) }
    var qSign by remember { mutableIntStateOf(1) }
    var speed0 by remember { mutableFloatStateOf(2f) }
    val part = remember { floatArrayOf(0f, 0f, 2f, 0f) }
    val trail = remember { FloatArray(2 * 900) }
    var trailN by remember { mutableIntStateOf(0) }
    val pickPx = with(androidx.compose.ui.platform.LocalDensity.current) { 36.dp.toPx() }

    fun preset(k: Int) {
        if (px.width < 8) return
        val w = px.width.toFloat(); val h = px.height.toFloat()
        charges.clear(); testers.clear(); selected = -1; probe = null
        when (k) {
            0 -> { charges += Charge(w * 0.3f, h * 0.5f, 1f); charges += Charge(w * 0.7f, h * 0.5f, -1f) }
            1 -> { charges += Charge(w * 0.3f, h * 0.5f, 1f); charges += Charge(w * 0.7f, h * 0.5f, 1f) }
            2 -> { charges += Charge(w * 0.3f, h * 0.3f, 1f); charges += Charge(w * 0.7f, h * 0.3f, -1f); charges += Charge(w * 0.3f, h * 0.7f, -1f); charges += Charge(w * 0.7f, h * 0.7f, 1f) }
            3 -> for (i in 0 until 7) { charges += Charge(w * (0.2f + 0.1f * i), h * 0.32f, 0.5f); charges += Charge(w * (0.2f + 0.1f * i), h * 0.68f, -0.5f) }
            else -> { charges += Charge(w * 0.5f, h * 0.5f, 2f); for (i in 0 until 6) charges += Charge(w * 0.5f + cos(i * 1.047f) * w * 0.3f, h * 0.5f + sin(i * 1.047f) * w * 0.3f, -0.34f) }
        }
        version++
    }
    LaunchedEffect(px) { if (charges.isEmpty()) preset(0) }

    val potential = remember(px, version, showV) {
        if (px.width < 8 || !showV) null else {
            val fw = 72; val fh = (72f * px.height / px.width).roundToInt().coerceIn(20, 300)
            val f = PixelField(fw, fh)
            val list = charges.toList()
            for (j in 0 until fh) for (i in 0 until fw) {
                val v = fieldAt(list, (i + 0.5f) / fw * px.width, (j + 0.5f) / fh * px.height, out) * px.width * 0.11f
                val s = (ln(1 + abs(v)) / 3.2f).coerceIn(0f, 1f)
                val band = 0.72f + 0.28f * cos(ln(1 + abs(v)) * 9f)
                val a = s * band
                f.px[j * fw + i] = if (v >= 0) (0xFF shl 24) or ((a * 235).toInt() shl 16) or ((a * 60).toInt() shl 8) or (a * 150).toInt()
                else (0xFF shl 24) or ((a * 10).toInt() shl 16) or ((a * 150).toInt() shl 8) or (a * 235).toInt()
            }
            f.flush(); f
        }
    }
    // field lines: integrate along E from every positive charge (or backwards into negative ones)
    val lines = remember(px, version) {
        val list = charges.toList()
        val result = ArrayList<FloatArray>()
        if (px.width >= 8 && list.isNotEmpty()) {
            val anyPos = list.any { it.q > 0 }
            val w = px.width.toFloat(); val h = px.height.toFloat()
            val step = w / 130f
            for (c in list) {
                if (anyPos && c.q < 0) continue
                val n = (12 * abs(c.q)).roundToInt().coerceIn(3, 28)
                val dir = if (c.q > 0) 1f else -1f
                for (k in 0 until n) {
                    val a = (k + 0.5f) / n * 2 * PI.toFloat()
                    var x = c.x + cos(a) * step * 2.2f; var y = c.y + sin(a) * step * 2.2f
                    val pts = FloatArray(2 * 420); var m = 0
                    for (s in 0 until 420) {
                        pts[m * 2] = x; pts[m * 2 + 1] = y; m++
                        fieldAt(list, x, y, out)
                        var l = hypot(out[0], out[1]); if (l < 1e-12f) break
                        val mx = x + dir * out[0] / l * step / 2; val my = y + dir * out[1] / l * step / 2
                        fieldAt(list, mx, my, out); l = hypot(out[0], out[1]); if (l < 1e-12f) break
                        x += dir * out[0] / l * step; y += dir * out[1] / l * step
                        if (x < -w * 0.2f || x > w * 1.2f || y < -h * 0.2f || y > h * 1.2f) break
                        if (list.any { it !== c && it.q * dir < 0 && hypot(x - it.x, y - it.y) < step * 1.6f }) { pts[m * 2] = x; pts[m * 2 + 1] = y; m++; break }
                    }
                    result += pts.copyOf(m * 2)
                }
            }
        }
        result
    }

    val frame = rememberTicker(true) { dt ->
        if (mode == 0) {
            val list = charges
            val it = testers.iterator()
            while (it.hasNext()) {
                val t = it.next()
                repeat(2) {
                    fieldAt(list, t[0], t[1], out)
                    val k = px.width * px.width * 0.9f
                    t[2] += out[0] * k * dt / 2; t[3] += out[1] * k * dt / 2
                    t[2] *= 0.995f; t[3] *= 0.995f
                    t[0] += t[2] * dt / 2; t[1] += t[3] * dt / 2
                }
                if (t[0] < -20 || t[0] > px.width + 20 || t[1] < -20 || t[1] > px.height + 20 || list.any { c -> c.q < 0 && hypot(t[0] - c.x, t[1] - c.y) < px.width / 55f }) it.remove()
            }
        } else {
            // Boris push: half electric kick, magnetic rotation, half electric kick
            val h = dt * 1.4f / 6
            repeat(6) {
                val qm = qSign.toFloat()
                var vx = part[2] + qm * ex * h / 2; var vy = part[3] + qm * ey * h / 2
                val t = qm * bz * h / 2
                val s = 2 * t / (1 + t * t)
                val vpx = vx + vy * t; val vpy = vy - vx * t
                vx += vpy * s; vy -= vpx * s
                part[2] = vx + qm * ex * h / 2; part[3] = vy + qm * ey * h / 2
                part[0] += part[2] * h; part[1] += part[3] * h
            }
            val i = trailN % 900; trail[i * 2] = part[0]; trail[i * 2 + 1] = part[1]; trailN++
        }
    }
    fun launch() { part[0] = 0f; part[1] = 0f; part[2] = speed0; part[3] = 0f; trailN = 0 }

    LabScaffold("Electromagnetic Fields", Domain.Physics, FieldsInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().onSizeChanged { px = it }.plotInteract(null, key = mode,
                onTap = { o -> if (mode == 0) { val i = charges.indices.minByOrNull { hypot(charges[it].x - o.x, charges[it].y - o.y) } ?: -1; if (i >= 0 && hypot(charges[i].x - o.x, charges[i].y - o.y) < pickPx) { selected = i; probe = null } else { selected = -1; probe = o } } },
                onSingle = { o, ph ->
                    if (mode != 0) false else {
                        if (ph == 0) { grab = charges.indices.minByOrNull { hypot(charges[it].x - o.x, charges[it].y - o.y) } ?: -1; if (grab >= 0 && hypot(charges[grab].x - o.x, charges[grab].y - o.y) > pickPx) grab = -1; if (grab >= 0) selected = grab }
                        if (ph == 1 && grab >= 0) { charges[grab].x = o.x.coerceIn(10f, px.width - 10f); charges[grab].y = o.y.coerceIn(10f, px.height - 10f); version++ }
                        grab >= 0
                    }
                }),
        ) {
            frame.value
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            if (mode == 0) {
                potential?.let { drawField(it, additive = false, alpha = 0.55f) }
                for (pts in lines) {
                    val n = pts.size / 2
                    if (n < 2) continue
                    path.rewind(); path.moveTo(pts[0], pts[1])
                    for (k in 1 until n) path.lineTo(pts[k * 2], pts[k * 2 + 1])
                    drawPath(path, UE.Text.copy(alpha = 0.6f), style = Stroke(1.1f * dp))
                    val mid = n / 2
                    if (mid + 2 < n) arrow(Offset(pts[mid * 2], pts[mid * 2 + 1]), Offset(pts[mid * 2 + 4], pts[mid * 2 + 5]), UE.Text.copy(alpha = 0.85f), 1.1f * dp, 7 * dp)
                }
                for (t in testers) glowDot(Offset(t[0], t[1]), UE.Green, 3 * dp)
                charges.forEachIndexed { i, c ->
                    val p = Offset(c.x, c.y); val col = if (c.q > 0) UE.Magenta else UE.Cyan
                    val r = (8 + 5 * sqrt(abs(c.q))) * dp
                    drawCircle(col.copy(alpha = 0.3f), r * 1.7f, p); drawCircle(col, r, p); drawCircle(Color.Black.copy(alpha = 0.25f), r * 0.75f, p)
                    drawLine(Color.White, p - Offset(r * 0.42f, 0f), p + Offset(r * 0.42f, 0f), 2 * dp)
                    if (c.q > 0) drawLine(Color.White, p - Offset(0f, r * 0.42f), p + Offset(0f, r * 0.42f), 2 * dp)
                    if (i == selected) drawCircle(UE.Text, r + 5 * dp, p, style = Stroke(1.2f * dp))
                }
                probe?.let { p ->
                    fieldAt(charges, p.x, p.y, out)
                    val l = hypot(out[0], out[1])
                    if (l > 0) arrow(p, p + Offset(out[0] / l, out[1] / l) * ((18f + 16f * ln(1 + l * w * w * 0.02f)).coerceAtMost(90f) * dp), UE.Amber, 2.2f * dp, 10 * dp)
                    glowDot(p, UE.Amber, 4 * dp)
                }
            } else {
                val u = min(w, h) / 13f; val c = Offset(w / 2, h / 2)
                // field symbols: B out of the page (dots) or into it (crosses)
                var gy = u * 0.8f
                while (gy < h) { var gx = u * 0.8f; while (gx < w) {
                    val p = Offset(gx, gy); val a = (0.12f + 0.2f * abs(bz) / 3f)
                    if (bz > 0.02f) { drawCircle(UE.Violet.copy(alpha = a), 4 * dp, p, style = Stroke(dp)); drawCircle(UE.Violet.copy(alpha = a), 1.2f * dp, p) }
                    else if (bz < -0.02f) { drawLine(UE.Violet.copy(alpha = a), p - Offset(3 * dp, 3 * dp), p + Offset(3 * dp, 3 * dp), dp); drawLine(UE.Violet.copy(alpha = a), p - Offset(3 * dp, -3 * dp), p + Offset(3 * dp, -3 * dp), dp) }
                    gx += u * 1.6f }; gy += u * 1.6f }
                if (hypot(ex, ey) > 0.01f) arrow(Offset(24 * dp, 30 * dp), Offset(24 * dp, 30 * dp) + Offset(ex, -ey) / hypot(ex, ey) * (34 * dp), UE.Amber, 2 * dp, 9 * dp).also { label(tm, "E", 24 * dp, 12 * dp, UE.Amber, 12f, 0.5f, 0.5f, UE.Math) }
                fun P(x: Float, y: Float): Offset { var sx = (c.x + x * u) % w; var sy = (c.y - y * u) % h; if (sx < 0) sx += w; if (sy < 0) sy += h; return Offset(sx, sy) }
                val n = min(trailN, 900)
                path.rewind()
                var last = Offset.Unspecified
                for (k in 0 until n) { val i = (trailN - n + k) % 900; val q = P(trail[i * 2], trail[i * 2 + 1]); if (last == Offset.Unspecified || (q - last).getDistance() > u * 3) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y); last = q }
                drawPath(path, (if (qSign > 0) UE.Magenta else UE.Cyan).copy(alpha = 0.85f), style = Stroke(1.6f * dp))
                val pp = P(part[0], part[1])
                arrow(pp, pp + Offset(part[2], -part[3]) * u * 0.5f, UE.Text, 1.6f * dp, 8 * dp)
                glowDot(pp, if (qSign > 0) UE.Magenta else UE.Cyan, 6 * dp)
            }
        }
    }) {
        Segmented(listOf("Charges and field lines", "Charge in a magnetic field"), mode, accent = Domain.Physics.accent) { mode = it }
        if (mode == 0) {
            ChipRow(listOf("Dipole", "Like charges", "Quadrupole", "Capacitor", "Atom-like"), -1, Domain.Physics.accent) { preset(it) }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlowButton("Add +", accent = UE.Magenta) { if (charges.size < 20) { charges += Charge(px.width * (0.3f + rnd.nextFloat() * 0.4f), px.height * (0.3f + rnd.nextFloat() * 0.4f), 1f); selected = charges.lastIndex; version++ } }
                GlowButton("Add −", accent = UE.Cyan) { if (charges.size < 20) { charges += Charge(px.width * (0.3f + rnd.nextFloat() * 0.4f), px.height * (0.3f + rnd.nextFloat() * 0.4f), -1f); selected = charges.lastIndex; version++ } }
                if (selected in charges.indices) GlowButton("Remove", accent = UE.Red) { charges.removeAt(selected); selected = -1; version++ }
            }
            if (selected in charges.indices) UESlider("Selected charge q", charges[selected].q, -3f..3f, accent = if (charges[selected].q > 0) UE.Magenta else UE.Cyan, format = { fix(it, 1) }) { v -> charges[selected].q = ((v * 2).roundToInt() / 2f).let { if (it == 0f) 0.5f else it }; version++ }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Toggle("Potential map", showV, accent = Domain.Physics.accent) { showV = it }
                GlowButton("Release test charges", accent = UE.Green) { repeat(36) { testers += floatArrayOf(rnd.nextFloat() * px.width, rnd.nextFloat() * px.height, 0f, 0f) } }
            }
            val p = probe
            if (p != null) {
                val v = fieldAt(charges, p.x, p.y, out)
                ReadoutRow { Stat("|E| at probe", fmt(hypot(out[0], out[1]) * px.width * px.width / 100, 3), UE.Amber); Stat("V at probe", fmt(v * px.width / 10, 3), if (v > 0) UE.Magenta else UE.Cyan); Stat("direction", fix(atan2(-out[1], out[0]) * 180 / PI.toFloat(), 0) + "°") }
            } else Note("Drag charges around. Tap empty space to probe the field there. Green test charges are positive: they slide 'downhill' on the potential, along the field lines.")
        } else {
            UESlider("Magnetic field B (out of the screen +)", bz, -3f..3f, accent = UE.Violet, format = { fix(it, 2) }) { bz = it }
            UESlider("Electric field Eₓ", ex, -1.5f..1.5f, accent = UE.Amber, format = { fix(it, 2) }) { ex = (it * 20).roundToInt() / 20f }
            UESlider("Electric field E_y", ey, -1.5f..1.5f, accent = UE.Amber, format = { fix(it, 2) }) { ey = (it * 20).roundToInt() / 20f }
            UESlider("Launch speed", speed0, 0.2f..5f, accent = Domain.Physics.accent, format = { fix(it, 2) }) { speed0 = it }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlowButton("Launch", accent = Domain.Physics.accent, filled = true) { launch() }
                GlowButton(if (qSign > 0) "Charge: +" else "Charge: −", accent = if (qSign > 0) UE.Magenta else UE.Cyan) { qSign = -qSign; launch() }
                GlowButton("Velocity selector", accent = UE.Amber) { bz = 1f; ex = 0f; ey = speed0 * 1f; launch() }
            }
            frame.value
            val v = hypot(part[2], part[3])
            ReadoutRow {
                Stat("speed", fix(v, 3)); Stat("gyroradius", if (abs(bz) > 0.02f) fix(v / abs(bz), 3) else "∞", UE.Violet)
                Stat("period", if (abs(bz) > 0.02f) fix(2 * PI / abs(bz), 2) else "∞"); Stat("drift E×B/B²", if (abs(bz) > 0.02f) fix(hypot(ex, ey) / abs(bz), 3) else "—", UE.Amber)
            }
            Note("With only B, the speed never changes — the force is always sideways. Add E and the circles drift at right angles to it. In the velocity selector E = vB, so the two forces cancel for exactly one speed and the charge flies straight.")
        }
    }
}
