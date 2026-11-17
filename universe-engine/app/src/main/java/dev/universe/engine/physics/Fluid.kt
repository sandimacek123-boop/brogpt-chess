package dev.universe.engine.physics

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlin.math.*

private val FluidInfo = LabInfo(
    equations = listOf(
        "\\rho_i = \\sum_j \\left(1 - \\frac{r_{ij}}{h}\\right)^2, \\qquad \\rho_i^{\\text{near}} = \\sum_j \\left(1 - \\frac{r_{ij}}{h}\\right)^3",
        "P_i = k(\\rho_i - \\rho_0), \\qquad P_i^{\\text{near}} = k^{\\text{near}}\\rho_i^{\\text{near}}",
        "\\Delta\\vec{x}_{ij} = \\Delta t^2 \\left[P_i\\left(1 - \\frac{r_{ij}}{h}\\right) + P_i^{\\text{near}}\\left(1 - \\frac{r_{ij}}{h}\\right)^2\\right]\\hat{r}_{ij}",
    ),
    about = "A liquid as a crowd of particles. Each one counts how crowded its neighbourhood is (the density); where it is too crowded, neighbours are pushed apart, and where it is sparse they are pulled together. That single rule gives incompressibility, surface tension, splashes and waves. Viscosity damps neighbours that are rushing toward each other. Drag with a finger to push the liquid, tilt the phone to pour it, and change the parameters to make honey, water or a bouncy gel.",
    notes = listOf(
        "This is the 'double density relaxation' method of Clavet, Beaudoin and Poulin (2005), a position-based relative of smoothed-particle hydrodynamics (SPH). It is designed to look right and be stable at large time steps, not to solve the Navier–Stokes equations precisely.",
        "The liquid is slightly compressible: its density varies by several percent, whereas real water changes by less than 0.01 %.",
        "There are only hundreds of particles, so each represents a sizeable blob. Fine spray and thin films cannot appear.",
        "Tilt control uses the accelerometer when one is present; otherwise gravity points down the screen.",
    ),
)

@Composable
fun FluidLab() {
    val app = LocalApp.current
    var px by remember { mutableStateOf(IntSize.Zero) }
    var preset by remember { mutableIntStateOf(0) }
    var gravity by remember { mutableFloatStateOf(1f) }
    var visc by remember { mutableFloatStateOf(0.03f) }
    var stiff by remember { mutableFloatStateOf(0.1f) }
    var tilt by remember { mutableStateOf(false) }
    var pull by remember { mutableStateOf(false) }
    var colorBy by remember { mutableIntStateOf(0) }
    var touch by remember { mutableStateOf<Offset?>(null) }
    val count = (420 * app.prefs.q).roundToInt().coerceIn(240, 700)
    val tm = rememberTextMeasurer(cacheSize = 8)
    val sim = remember(px, preset, count) {
        if (px.width < 8) null else {
            val worldW = 60f; val worldH = worldW * px.height / px.width
            FluidSim(count, worldW, worldH).also { s ->
                when (preset) {
                    1 -> { // dam break: column on the left
                        val cols = 14
                        for (i in 0 until s.n) { s.x[i] = 1.2f + (i % cols) * 1.3f; s.y[i] = s.h - 1.2f - (i / cols) * 1.3f }
                    }
                    2 -> { // drop into a pool
                        val pool = s.n * 2 / 3; val per = ((s.w - 2) / 1.3f).toInt()
                        for (i in 0 until pool) { s.x[i] = 1f + (i % per) * 1.3f; s.y[i] = s.h - 1f - (i / per) * 1.3f }
                        for (i in pool until s.n) { val k = i - pool; val a = k * 2.39996f; val r = 1.1f * sqrt(k.toFloat()); s.x[i] = s.w / 2 + cos(a) * r; s.y[i] = s.h * 0.25f + sin(a) * r }
                    }
                }
            }
        }
    }
    // accelerometer → gravity direction
    val ctx = LocalContext.current
    var sensorG by remember { mutableStateOf(Offset(0f, 1f)) }
    DisposableEffect(tilt) {
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val acc = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) { val gx = -e.values[0]; val gy = e.values[1]; val l = hypot(gx, gy).coerceAtLeast(0.5f); sensorG = Offset(gx / l, gy / l) }
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        if (tilt && acc != null) sm.registerListener(l, acc, SensorManager.SENSOR_DELAY_GAME)
        onDispose { sm?.unregisterListener(l) }
    }
    val frame = rememberTicker(sim != null) {
        val s = sim ?: return@rememberTicker
        val g = if (tilt) sensorG else Offset(0f, 1f)
        s.gx = g.x * 0.012f * gravity; s.gy = g.y * 0.012f * gravity
        s.viscosity = visc; s.stiffness = stiff
        val t = touch
        if (t != null) { s.fx = t.x / px.width * s.w; s.fy = t.y / px.height * s.h; s.fStrength = if (pull) -0.09f else 0.12f } else s.fStrength = 0f
        repeat(2) { s.step() }
    }
    val buckets = remember { Array(4) { ArrayList<Offset>(300) } }

    LabScaffold("Particle Fluid", Domain.Physics, FluidInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }.plotInteract(null, onSingle = { o, ph -> touch = if (ph < 2) o else null; true })) {
            frame.value
            val s = sim ?: return@Canvas
            val dp = 1.dp.toPx()
            val k = size.width / s.w
            for (b in buckets) b.clear()
            val vmax = 0.6f
            for (i in 0 until s.n) {
                val sp = hypot(s.vx[i], s.vy[i])
                val b = when (colorBy) {
                    0 -> (sp / vmax * 4).toInt().coerceIn(0, 3)
                    else -> ((1 - s.y[i] / s.h) * 4).toInt().coerceIn(0, 3)
                }
                buckets[b] += Offset(s.x[i] * k, s.y[i] * k)
            }
            val cols = listOf(UE.Blue, UE.Cyan, Color(0xFF9CF6FF), Color.White)
            val r = s.radius * k
            for (b in 0 until 4) drawPoints(buckets[b], PointMode.Points, cols[b].copy(alpha = 0.16f), r * 1.5f, StrokeCap.Round, blendMode = BlendMode.Plus)
            for (b in 0 until 4) drawPoints(buckets[b], PointMode.Points, cols[b].copy(alpha = 0.85f), r * 0.55f, StrokeCap.Round)
            touch?.let { t -> drawCircle((if (pull) UE.Violet else UE.Amber).copy(alpha = 0.5f), 9 / s.w * size.width, t, style = Stroke(1.4f * dp)) }
            if (tilt) { val c = Offset(size.width - 34 * dp, 34 * dp); val g = sensorG; drawCircle(Color.White.copy(alpha = 0.15f), 22 * dp, c, style = Stroke(dp)); arrow(c, c + g * (18 * dp), UE.Amber, 2 * dp, 8 * dp) }
        }
    }) {
        ChipRow(listOf("Settle", "Dam break", "Drop in a pool"), preset, Domain.Physics.accent) { preset = it }
        UESlider("Gravity", gravity, 0f..3f, accent = Domain.Physics.accent, format = { "×${fix(it, 2)}" }) { gravity = it }
        UESlider("Viscosity", visc, 0f..0.6f, accent = UE.Amber, format = { fix(it, 3) }) { visc = it }
        UESlider("Stiffness (incompressibility)", stiff, 0.02f..0.4f, log = true, accent = UE.Cyan, format = { fix(it, 3) }) { stiff = it }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Water", visc < 0.05f && stiff in 0.08f..0.15f, UE.Cyan) { visc = 0.03f; stiff = 0.1f }
            Chip("Honey", visc > 0.3f, UE.Amber) { visc = 0.5f; stiff = 0.12f }
            Chip("Gel", stiff > 0.3f, UE.Magenta) { visc = 0.12f; stiff = 0.38f }
            Chip("Gas-like", stiff < 0.03f, UE.Violet) { visc = 0f; stiff = 0.02f }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Toggle("Tilt to pour", tilt, accent = UE.Amber) { tilt = it }
            Toggle("Finger pulls", pull, accent = UE.Violet) { pull = it }
            Toggle("Colour by height", colorBy == 1) { colorBy = if (it) 1 else 0 }
        }
        frame.value
        val s = sim
        if (s != null) ReadoutRow { Stat("particles", s.n.toString()); Stat("mean speed", fix(s.meanSpeed() * 60, 2), UE.Cyan); Stat("max speed", fix(s.maxSpeed() * 60, 2), UE.Amber) }
        Note("Drag on the liquid to push it around (or pull, with the toggle). Brighter particles are moving faster.")
    }
}
