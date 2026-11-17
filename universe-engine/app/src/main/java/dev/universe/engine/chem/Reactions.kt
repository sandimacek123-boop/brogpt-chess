package dev.universe.engine.chem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import kotlin.math.*
import kotlin.random.Random

/**
 * A + B ⇌ AB in a 2D box. Collisions between A and B react when the kinetic energy of their relative motion
 * along the line of centres exceeds the activation energy. AB breaks apart when a collision delivers at least
 * Ea − ΔH. Energy released or absorbed by the reaction goes into (or comes out of) the particles' motion.
 */
internal class ReactionBox(val w: Float, val h: Float, nA: Int, nB: Int, seed: Int = 3) {
    val cap = nA + nB
    val x = FloatArray(cap); val y = FloatArray(cap); val vx = FloatArray(cap); val vy = FloatArray(cap)
    /** 0 = A, 1 = B, 2 = AB, −1 = empty slot. */
    val kind = IntArray(cap)
    val r = min(w, h) / 70f
    var ea = 2f; var dh = -1f; var forward = 0; var backward = 0
    private val rnd = Random(seed)

    init {
        for (i in 0 until cap) {
            kind[i] = if (i < nA) 0 else 1
            x[i] = r + rnd.nextFloat() * (w - 2 * r); y[i] = r + rnd.nextFloat() * (h - 2 * r)
            val a = rnd.nextFloat() * 6.2832f; vx[i] = cos(a); vy[i] = sin(a)
        }
    }
    fun mass(i: Int) = if (kind[i] == 2) 2f else 1f
    fun rad(i: Int) = if (kind[i] == 2) r * 1.45f else r
    fun count(k: Int) = kind.count { it == k }
    fun temperature(): Float { var e = 0f; var n = 0; for (i in 0 until cap) if (kind[i] >= 0) { e += 0.5f * mass(i) * (vx[i] * vx[i] + vy[i] * vy[i]); n++ }; return e / n.coerceAtLeast(1) }
    fun thermostat(t: Float, rate: Float) { val cur = temperature().coerceAtLeast(1e-6f); val s = sqrt(1 + rate * (t / cur - 1)); for (i in 0 until cap) { vx[i] *= s; vy[i] *= s } }

    fun step(dt: Float, unit: Float) {
        for (i in 0 until cap) {
            if (kind[i] < 0) continue
            x[i] += vx[i] * dt * unit; y[i] += vy[i] * dt * unit
            val ri = rad(i)
            if (x[i] < ri) { x[i] = ri; vx[i] = abs(vx[i]) } else if (x[i] > w - ri) { x[i] = w - ri; vx[i] = -abs(vx[i]) }
            if (y[i] < ri) { y[i] = ri; vy[i] = abs(vy[i]) } else if (y[i] > h - ri) { y[i] = h - ri; vy[i] = -abs(vy[i]) }
        }
        for (i in 0 until cap) {
            if (kind[i] < 0) continue
            for (j in i + 1 until cap) {
                if (kind[j] < 0 || kind[i] < 0) continue
                val dx = x[j] - x[i]; val dy = y[j] - y[i]; val rr = rad(i) + rad(j)
                val d2 = dx * dx + dy * dy
                if (d2 >= rr * rr || d2 < 1e-9f) continue
                val d = sqrt(d2); val nx = dx / d; val ny = dy / d
                val rel = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny
                if (rel >= 0) continue
                val mi = mass(i); val mj = mass(j); val mu = mi * mj / (mi + mj)
                val eLine = 0.5f * mu * rel * rel
                if ((kind[i] + kind[j] == 1) && eLine >= ea) {
                    // A + B → AB: merge at the centre of mass, momentum conserved; −ΔH of energy becomes motion
                    val px = mi * vx[i] + mj * vx[j]; val py = mi * vy[i] + mj * vy[j]
                    val keBefore = 0.5f * mi * (vx[i] * vx[i] + vy[i] * vy[i]) + 0.5f * mj * (vx[j] * vx[j] + vy[j] * vy[j])
                    kind[i] = 2; x[i] = (x[i] * mi + x[j] * mj) / (mi + mj); y[i] = (y[i] * mi + y[j] * mj) / (mi + mj)
                    vx[i] = px / 2; vy[i] = py / 2
                    val keAfter = 0.5f * 2 * (vx[i] * vx[i] + vy[i] * vy[i])
                    val target = (keBefore - dh).coerceAtLeast(0.01f)
                    if (keAfter > 1e-6f) { val s = sqrt(target / keAfter); vx[i] *= s; vy[i] *= s } else { vx[i] = sqrt(target); vy[i] = 0f }
                    kind[j] = -1; forward++
                    continue
                }
                if ((kind[i] == 2 || kind[j] == 2) && eLine >= ea - dh && rnd.nextFloat() < 0.5f) {
                    // a hard enough hit breaks AB → A + B; the bond energy (−ΔH) is taken back out of the collision
                    val ab = if (kind[i] == 2) i else j
                    val free = kind.indexOfFirst { it < 0 }
                    if (free >= 0) {
                        kind[ab] = 0; kind[free] = 1
                        val a = rnd.nextFloat() * 6.2832f
                        val spd = sqrt(max(0.02f, eLine + dh) / 1f)
                        x[free] = x[ab] + cos(a) * r * 2.2f; y[free] = y[ab] + sin(a) * r * 2.2f
                        vx[free] = vx[ab] + cos(a) * spd * 0.5f; vy[free] = vy[ab] + sin(a) * spd * 0.5f
                        vx[ab] -= cos(a) * spd * 0.5f; vy[ab] -= sin(a) * spd * 0.5f
                        backward++
                        continue
                    }
                }
                // elastic bounce
                val imp = 2 * rel / (1 / mi + 1 / mj)
                vx[i] += imp / mi * nx; vy[i] += imp / mi * ny; vx[j] -= imp / mj * nx; vy[j] -= imp / mj * ny
                val push = (rr - d) / 2; x[i] -= nx * push; y[i] -= ny * push; x[j] += nx * push; y[j] += ny * push
            }
        }
    }
}

private val ReactionsInfo = LabInfo(
    equations = listOf(
        "\\mathrm{A} + \\mathrm{B} \\rightleftharpoons \\mathrm{AB}",
        "k = A\\, e^{-E_a / k_B T}",
        "K = \\frac{[\\mathrm{AB}]}{[\\mathrm{A}][\\mathrm{B}]} \\propto e^{-\\Delta H / k_B T}",
    ),
    about = "Molecules only react when they collide hard enough: the kinetic energy of the impact must climb the activation-energy hill before the products can form. Raise the temperature and the fastest molecules become far more numerous — the shaded tail of the speed distribution — so the rate climbs steeply, as Arrhenius found. A catalyst offers a lower pass over the same hill without being used up. Make the reaction reversible and it never 'finishes': forward and backward rates become equal and the mixture settles into dynamic equilibrium, which shifts when you change the temperature, as Le Chatelier predicted.",
    notes = listOf(
        "This is an idealised model of collision theory in two dimensions with generic particles A, B and AB; it does not represent any specific real chemical system and is not a guide to performing reactions.",
        "Reaction requires only enough energy along the line of centres; real reactions also need the right orientation (the steric factor), which is not modelled.",
        "Energies are in units of the thermal energy k_B T at a temperature setting of 1. With the thermostat on, heat released by the reaction is carried away; switch it off to see an exothermic reaction warm the box.",
    ),
)

@Composable
fun ReactionsLab() {
    var px by remember { mutableStateOf(IntSize.Zero) }
    var temp by remember { mutableFloatStateOf(1f) }
    var ea by remember { mutableFloatStateOf(2.2f) }
    var dh by remember { mutableFloatStateOf(-1.2f) }
    var catalyst by remember { mutableStateOf(false) }
    var thermostat by remember { mutableStateOf(true) }
    var reversible by remember { mutableStateOf(true) }
    var reset by remember { mutableIntStateOf(0) }
    val box = remember(px, reset) { if (px.width < 8) null else ReactionBox(px.width.toFloat(), px.height * 0.5f, 90, 90) }
    val hist = remember(box) { FloatArray(3 * 300) }
    var histN by remember(box) { mutableIntStateOf(0) }
    var rate by remember { mutableFloatStateOf(0f) }
    var lastF by remember { mutableIntStateOf(0) }
    var acc by remember { mutableFloatStateOf(0f) }
    val tm = rememberTextMeasurer(cacheSize = 32)
    val path = remember { Path() }
    val effEa = if (catalyst) ea * 0.55f else ea

    val frame = rememberTicker(box != null) { dt ->
        val b = box ?: return@rememberTicker
        b.ea = effEa; b.dh = if (reversible) dh else -50f
        repeat(3) { b.step(dt / 3, b.r * 9f) }
        if (thermostat) b.thermostat(temp, 0.08f)
        acc += dt
        if (acc > 0.25f) { rate = (b.forward - lastF) / acc; lastF = b.forward; acc = 0f; val i = histN % 300; hist[i * 3] = b.count(0).toFloat(); hist[i * 3 + 1] = b.count(1).toFloat(); hist[i * 3 + 2] = b.count(2).toFloat(); histN++ }
    }

    LabScaffold("Reaction Kinetics", Domain.Chem, ReactionsInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }) {
            frame.value
            val b = box ?: return@Canvas
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            drawRect(Color.White.copy(alpha = 0.03f), Offset.Zero, Size(b.w, b.h)); drawRect(Domain.Chem.accent.copy(alpha = 0.4f), Offset.Zero, Size(b.w, b.h), style = Stroke(dp))
            for (i in 0 until b.cap) {
                val k = b.kind[i]; if (k < 0) continue
                val p = Offset(b.x[i], b.y[i])
                when (k) {
                    0 -> drawCircle(UE.Cyan, b.r, p)
                    1 -> drawCircle(UE.Violet, b.r, p)
                    else -> { drawCircle(UE.Amber.copy(alpha = 0.25f), b.r * 2.2f, p, blendMode = BlendMode.Plus); drawCircle(UE.Cyan, b.r * 0.85f, p - Offset(b.r * 0.6f, 0f)); drawCircle(UE.Violet, b.r * 0.85f, p + Offset(b.r * 0.6f, 0f)) }
                }
            }
            // energy profile
            val top = b.h + 16 * dp; val bot = h - 14 * dp; val half = w / 2 - 10 * dp
            val e0 = top + (bot - top) * 0.55f
            val scaleE = (bot - top) * 0.16f
            fun ey(e: Float) = e0 - e * scaleE
            path.rewind()
            for (q in 0..60) { val s = q / 60f; val base = dh * smoothStep(s); val bump = (ea - dh * 0.5f) * exp(-((s - 0.5f) / 0.16f).pow(2)); val xx = 10 * dp + half * s; if (q == 0) path.moveTo(xx, ey(base + bump)) else path.lineTo(xx, ey(base + bump)) }
            drawPath(path, UE.Text, style = Stroke(1.6f * dp))
            if (catalyst) { path.rewind(); for (q in 0..60) { val s = q / 60f; val base = dh * smoothStep(s); val bump = (effEa - dh * 0.5f) * exp(-((s - 0.5f) / 0.16f).pow(2)); val xx = 10 * dp + half * s; if (q == 0) path.moveTo(xx, ey(base + bump)) else path.lineTo(xx, ey(base + bump)) }; drawPath(path, UE.Green, style = Stroke(1.6f * dp, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * dp, 4 * dp)))) }
            label(tm, "A + B", 12 * dp, ey(0f) + 4 * dp, UE.Text, 9.5f); label(tm, "AB", 10 * dp + half, ey(dh) + 4 * dp, UE.Amber, 9.5f, 1f, 0f)
            label(tm, "Eₐ", 10 * dp + half * 0.5f, ey(ea + dh * 0f) - 4 * dp, UE.Text, 10f, 0.5f, 1f)
            label(tm, "energy profile", 12 * dp, top, UE.Dim, 9f)
            // concentrations over time
            val gl = w / 2 + 10 * dp; val gr = w - 10 * dp
            drawRect(Color.White.copy(alpha = 0.03f), Offset(gl, top), Size(gr - gl, bot - top))
            val n = min(histN, 300)
            for ((c, col) in listOf(0 to UE.Cyan, 1 to UE.Violet, 2 to UE.Amber)) {
                path.rewind()
                for (k in 0 until n) { val i = (histN - n + k) % 300; val q = Offset(gl + (gr - gl) * k / 299f, bot - (bot - top) * hist[i * 3 + c] / 95f); if (k == 0) path.moveTo(q.x, q.y) else path.lineTo(q.x, q.y) }
                drawPath(path, col, style = Stroke(1.5f * dp))
            }
            label(tm, "amounts over time", gl + 4 * dp, top + 2 * dp, UE.Dim, 9f)
        }
    }) {
        UESlider("Temperature", temp, 0.3f..3f, accent = UE.Amber, format = { fix(it, 2) }) { temp = it }
        UESlider("Activation energy Eₐ", ea, 0.3f..5f, accent = Domain.Chem.accent, format = { fix(it, 2) }) { ea = it }
        UESlider("Reaction enthalpy ΔH", dh, -3f..2f, accent = UE.Violet, format = { (if (it < 0) "exothermic " else "endothermic ") + fix(it, 2) }) { dh = it }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Toggle("Catalyst", catalyst, accent = UE.Green) { catalyst = it }
            Toggle("Reversible", reversible) { reversible = it }
            Toggle("Thermostat", thermostat, accent = UE.Amber) { thermostat = it }
        }
        GlowButton("Fresh mixture", accent = Domain.Chem.accent) { reset++; lastF = 0 }
        frame.value
        val b = box
        if (b != null) {
            val a = b.count(0); val bb = b.count(1); val ab = b.count(2)
            ReadoutRow { Stat("A", a.toString(), UE.Cyan); Stat("B", bb.toString(), UE.Violet); Stat("AB", ab.toString(), UE.Amber); Stat("rate", "${fix(rate, 1)}/s", Domain.Chem.accent) }
            ReadoutRow { Stat("temperature now", fix(b.temperature(), 2), UE.Amber); Stat("Boltzmann factor e^(−Eₐ/T)", fmt(exp(-effEa / temp.toDouble()), 2)); Stat("K = AB/(A·B)", if (a > 0 && bb > 0) fmt(ab * 180.0 / (a * bb), 3) else "—") }
        }
        Note("Cyan A and violet B pair up into amber AB. Watch the right-hand graph level off: that plateau is equilibrium, where AB forms and breaks at the same rate.")
    }
}

private fun smoothStep(s: Float): Float { val t = ((s - 0.3f) / 0.4f).coerceIn(0f, 1f); return t * t * (3 - 2 * t) }
