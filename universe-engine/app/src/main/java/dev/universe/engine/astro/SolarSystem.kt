package dev.universe.engine.astro

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.math.Num
import dev.universe.engine.core.ui.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.*

/** JPL "Approximate Positions of the Planets", Table 1 (valid 1800–2050): a, e, I, L, ϖ, Ω and their rates per Julian century. */
class Planet(
    val name: String, val color: Color, val radiusKm: Double, val massEarth: Double, val day: String, val year: String, val moons: String, val temp: String, val fact: String,
    val el: DoubleArray, val rate: DoubleArray, val rings: Boolean = false,
)

val PLANETS = listOf(
    Planet("Mercury", Color(0xFFB9B2AA), 2439.7, 0.0553, "58.6 days", "88.0 days", "0", "−173 to 427 °C", "The smallest planet. A day–night cycle on Mercury lasts two of its years.",
        doubleArrayOf(0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593), doubleArrayOf(0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081)),
    Planet("Venus", Color(0xFFE8C98A), 6051.8, 0.815, "243 days (backwards)", "224.7 days", "0", "464 °C", "A runaway greenhouse: hotter than Mercury, with surface pressure 92 times Earth's.",
        doubleArrayOf(0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255), doubleArrayOf(0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418)),
    Planet("Earth", Color(0xFF4F9BFF), 6371.0, 1.0, "23 h 56 min", "365.26 days", "1", "15 °C", "The only world known to host life, and the densest planet in the Solar System.",
        doubleArrayOf(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0), doubleArrayOf(0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    Planet("Mars", Color(0xFFE0663F), 3389.5, 0.107, "24 h 37 min", "687 days", "2", "−65 °C", "Home of Olympus Mons, a volcano 22 km high — two and a half Everests.",
        doubleArrayOf(1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891), doubleArrayOf(0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
    Planet("Jupiter", Color(0xFFD9B38C), 69911.0, 317.8, "9 h 56 min", "11.86 years", "95+", "−110 °C (cloud tops)", "More than twice as massive as all the other planets combined. The Great Red Spot is wider than Earth.",
        doubleArrayOf(5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909), doubleArrayOf(-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106)),
    Planet("Saturn", Color(0xFFE9D6A0), 58232.0, 95.2, "10 h 33 min", "29.46 years", "274", "−140 °C (cloud tops)", "Less dense than water. Its rings are hundreds of thousands of km wide but mostly only tens of metres thick.",
        doubleArrayOf(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448), doubleArrayOf(-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794), rings = true),
    Planet("Uranus", Color(0xFF8FE3E8), 25362.0, 14.54, "17 h 14 min (backwards)", "84.0 years", "28+", "−195 °C", "Rolls around the Sun on its side, tilted 98° — each pole gets 42 years of daylight, then 42 of night.",
        doubleArrayOf(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503), doubleArrayOf(-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589)),
    Planet("Neptune", Color(0xFF4A6FFF), 24622.0, 17.15, "16 h 6 min", "164.8 years", "16", "−200 °C", "Found by mathematics before telescopes: predicted in 1846 from wobbles in Uranus's orbit.",
        doubleArrayOf(30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574), doubleArrayOf(0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664)),
    Planet("Pluto", Color(0xFFD8B9A0), 1188.3, 0.0022, "6.4 days (backwards)", "248 years", "5", "−229 °C", "A dwarf planet since 2006. Its largest moon, Charon, is half its size; the two orbit a point in empty space between them.",
        doubleArrayOf(39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684), doubleArrayOf(-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482)),
)

/** Heliocentric ecliptic position (AU) of [p] at [T] Julian centuries from J2000. x, y in the ecliptic plane, z toward the north ecliptic pole. */
fun heliocentric(p: Planet, T: Double, out: DoubleArray, overrideMeanAnomaly: Double? = null) {
    val d = PI / 180
    val a = p.el[0] + p.rate[0] * T; val e = p.el[1] + p.rate[1] * T; val I = (p.el[2] + p.rate[2] * T) * d
    val L = p.el[3] + p.rate[3] * T; val wbar = p.el[4] + p.rate[4] * T; val node = (p.el[5] + p.rate[5] * T) * d
    val w = wbar * d - node
    val M = overrideMeanAnomaly ?: ((L - wbar) * d)
    val E = Num.kepler(M, e)
    val xp = a * (cos(E) - e); val yp = a * sqrt(1 - e * e) * sin(E)
    val cw = cos(w); val sw = sin(w); val cn = cos(node); val sn = sin(node); val ci = cos(I); val si = sin(I)
    out[0] = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp
    out[1] = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp
    out[2] = (sw * si) * xp + (cw * si) * yp
}

fun julianCenturiesNow(): Double = (System.currentTimeMillis() / 86400000.0 + 2440587.5 - 2451545.0) / 36525.0

private class Moon(val name: String, val parent: Int, val periodDays: Double, val dist: Float, val color: Color)
private val MOONS = listOf(Moon("Moon", 2, 27.3217, 0.9f, Color(0xFFCFCFCF)), Moon("Io", 4, 1.769, 1.25f, Color(0xFFF2D36B)), Moon("Europa", 4, 3.551, 1.6f, Color(0xFFE8DCC8)),
    Moon("Ganymede", 4, 7.155, 2.05f, Color(0xFFB8AA98)), Moon("Callisto", 4, 16.689, 2.7f, Color(0xFF8E8070)), Moon("Titan", 5, 15.945, 2.4f, Color(0xFFE6B565)), Moon("Charon", 8, 6.387, 1.4f, Color(0xFFBDB6AE)))

private val SolarInfo = LabInfo(
    equations = listOf(
        "M = L - \\varpi, \\qquad E - e\\sin E = M",
        "x' = a(\\cos E - e), \\qquad y' = a\\sqrt{1-e^2}\\,\\sin E",
        "\\frac{a^3}{T^2} = \\frac{G(M_\\odot + m)}{4\\pi^2} \\approx \\text{const}",
    ),
    about = "Every planet is placed where it really is for the date shown — computed live from the six numbers that define its orbit (size, shape, tilt, orientation and phase) and how they drift over the centuries. Kepler's equation is solved for each planet every frame. Speed time up and watch Mercury lap the Sun four times for each Earth year while Neptune barely moves. Tap any planet to fly to it.",
    notes = listOf(
        "Positions use NASA JPL's approximate Keplerian elements, valid from 1800 to 2050 to within a fraction of a degree for the planets (errors grow outside that range, and the elements for Pluto are rougher).",
        "Planets are drawn hundreds of times larger than their true size and distances are compressed (square-root scale) unless you choose 'true distances', otherwise almost everything would be invisible.",
        "Moons are placed on schematic circular orbits with their correct periods but not their true phases or distances.",
        "The orbits are Keplerian ellipses around the Sun; mutual tugs between planets (perturbations) are only included through the slow drift of the elements.",
    ),
)

@Composable
fun SolarSystemLab() {
    val app = LocalApp.current
    val cam = remember { Cam3(0.4f, 0.55f, 30f, 1.8f) }
    var T by remember { mutableDoubleStateOf(julianCenturiesNow()) }
    var daysPerSec by remember { mutableFloatStateOf(8f) }
    var running by remember { mutableStateOf(true) }
    var reverse by remember { mutableStateOf(false) }
    var trueScale by remember { mutableStateOf(false) }
    var labels by remember { mutableStateOf(true) }
    var focus by remember { mutableIntStateOf(-1) }       // −1 = Sun
    var plutoTaps by remember { mutableIntStateOf(0) }
    val fx = remember { Animatable(0f) }; val fy = remember { Animatable(0f) }; val fz = remember { Animatable(0f) }
    val zoomAnim = remember { Animatable(30f) }
    val scope = rememberCoroutineScope()
    val tm = rememberTextMeasurer(cacheSize = 64)
    val stars = remember { StarData(220, 21) }
    val out = remember { FloatArray(4) }
    val pos = remember { DoubleArray(3) }
    val path = remember { Path() }
    val screen = remember { Array(PLANETS.size) { FloatArray(4) } }
    var frameT by remember { mutableFloatStateOf(0f) }

    fun mapR(r: Double): Double = if (trueScale) r * 3.2 else sqrt(r) * 4.6
    fun world(p: Int, t: Double, o: DoubleArray) {
        heliocentric(PLANETS[p], t, o)
        val r = sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2])
        val k = if (r > 0) mapR(r) / r else 0.0
        o[0] *= k; o[1] *= k; o[2] *= k
    }
    fun bodyRadius(p: Int): Float = (0.18 + 0.11 * ln(PLANETS[p].radiusKm / 1000.0 + 1)).toFloat() * (if (trueScale) 0.7f else 1f)

    val frame = rememberTicker(running) { dt ->
        frameT += dt
        T += (if (reverse) -1 else 1) * dt * daysPerSec / 36525.0
        T = T.coerceIn(-2.0, 0.5)   // 1800 … 2050
        if (focus >= 0) {
            world(focus, T, pos)
            scope.launch { fx.snapTo(pos[0].toFloat()); fz.snapTo(-pos[1].toFloat()); fy.snapTo(pos[2].toFloat()) }
        }
    }
    fun flyTo(i: Int) {
        focus = -2
        if (i >= 0) world(i, T, pos) else { pos[0] = 0.0; pos[1] = 0.0; pos[2] = 0.0 }
        scope.launch { launch { fx.animateTo(pos[0].toFloat(), tween(1400, easing = FastOutSlowInEasing)) }; launch { fz.animateTo(-pos[1].toFloat(), tween(1400, easing = FastOutSlowInEasing)) }; fy.animateTo(pos[2].toFloat(), tween(1400, easing = FastOutSlowInEasing)); focus = i }
        scope.launch { val target = if (i < 0) 30f else (bodyRadius(i) * 14f).coerceIn(2.6f, 9f); zoomAnim.animateTo(cam.dist, tween(1)); zoomAnim.animateTo(target, tween(1500, easing = FastOutSlowInEasing)) { cam.dist = value } }
        if (i == 8) { plutoTaps++; if (plutoTaps >= 5) app.discover("pluto") } else plutoTaps = 0
    }
    val date = remember(T.times(36525).toLong()) { LocalDate.ofEpochDay(((T * 36525 + 2451545.0 - 2440587.5)).roundToLong()) }

    LabScaffold("Solar System", Domain.Astro, SolarInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().orbitGestures(cam, 1.6f, 140f).plotInteract(null, onTap = { o ->
                val hit = PLANETS.indices.filter { screen[it][2] > 0 }.minByOrNull { (Offset(screen[it][0], screen[it][1]) - o).getDistance() - screen[it][3] }
                if (hit != null && (Offset(screen[hit][0], screen[hit][1]) - o).getDistance() < screen[hit][3] + 40f) flyTo(hit)
            }),
        ) {
            frame.value
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            drawStars(stars, frameT * 0.02f, 0.0008f, 0.8f)
            cam.begin(w, h, 0.5f)
            val cx = fx.value; val cy = fy.value; val cz = fz.value
            fun proj(x: Float, y: Float, z: Float) = cam.project(x - cx, y - cy, z - cz, out)
            // orbits
            for (i in PLANETS.indices) {
                val p = PLANETS[i]
                path.rewind(); var pen = false
                val L0 = (p.el[3] + p.rate[3] * T) * PI / 180; val wb = (p.el[4] + p.rate[4] * T) * PI / 180
                for (k in 0..160) {
                    heliocentric(p, T, pos, overrideMeanAnomaly = k / 160.0 * 2 * PI)
                    val r = sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]); val m = mapR(r) / r
                    if (proj((pos[0] * m).toFloat(), (pos[2] * m).toFloat(), (-pos[1] * m).toFloat())) { if (pen) path.lineTo(out[0], out[1]) else path.moveTo(out[0], out[1]); pen = true } else pen = false
                }
                drawPath(path, p.color.copy(alpha = if (i == focus) 0.55f else 0.22f), style = Stroke((if (i == focus) 1.4f else 1f) * dp))
            }
            // the Sun
            if (proj(0f, 0f, 0f)) {
                val s = out[3]; val c = Offset(out[0], out[1]); val r = (0.9f * s).coerceAtLeast(5 * dp)
                drawCircle(Brush.radialGradient(listOf(Color(0xFFFFE9A8).copy(alpha = 0.55f), Color(0xFFFF9A3C).copy(alpha = 0.12f), Color.Transparent), c, r * 6), r * 6, c, blendMode = BlendMode.Plus)
                drawCircle(Brush.radialGradient(listOf(Color.White, Color(0xFFFFE08A), Color(0xFFFFA040)), c, r), r, c)
                if (labels) label(tm, "Sun", c.x, c.y + r + 4 * dp, UE.Amber, 10f, 0.5f, 0f, UE.Display)
            }
            // planets, back to front
            val order = PLANETS.indices.map { i -> world(i, T, pos); val ok = proj(pos[0].toFloat(), pos[2].toFloat(), (-pos[1]).toFloat()); screen[i][0] = out[0]; screen[i][1] = out[1]; screen[i][2] = if (ok) out[2] else -1f; screen[i][3] = if (ok) bodyRadius(i) * out[3] else 0f; i }.sortedByDescending { screen[it][2] }
            for (i in order) {
                if (screen[i][2] <= 0) continue
                val p = PLANETS[i]; val c = Offset(screen[i][0], screen[i][1]); val r = screen[i][3].coerceAtLeast(2.2f * dp)
                // light comes from the Sun: shift the highlight toward its projection
                proj(0f, 0f, 0f); val toSun = Offset(out[0], out[1]) - c; val d = toSun.getDistance().coerceAtLeast(1f); val lit = c + toSun / d * (r * 0.45f)
                if (p.rings) {
                    for (k in 0..1) drawOval(Color(0xFFE9D6A0).copy(alpha = 0.35f - k * 0.12f), Offset(c.x - r * (2.3f - k * 0.35f), c.y - r * (0.62f - k * 0.1f)), Size(r * (4.6f - k * 0.7f), r * (1.24f - k * 0.2f)), style = Stroke(r * 0.22f))
                }
                drawCircle(p.color.copy(alpha = 0.18f), r * 1.8f, c, blendMode = BlendMode.Plus)
                drawCircle(Brush.radialGradient(listOf(lerp(p.color, Color.White, 0.35f), p.color, lerp(p.color, Color.Black, 0.82f)), lit, r * 1.9f), r, c)
                if (i == 2 && r > 6 * dp) { drawCircle(Color.White.copy(alpha = 0.25f), r * 0.32f, c + Offset(r * 0.3f, -r * 0.25f)) }
                if (i == 4 && r > 6 * dp) for (b in -2..2) drawLine(lerp(p.color, Color(0xFF8A5A3A), 0.4f).copy(alpha = 0.5f), c + Offset(-r * sqrt(1 - (b * 0.3f).pow(2)), b * r * 0.3f), c + Offset(r * sqrt(1 - (b * 0.3f).pow(2)), b * r * 0.3f), r * 0.1f)
                if (labels) label(tm, p.name, c.x, c.y + r + 3 * dp, if (i == focus) UE.Text else UE.Dim, if (i == focus) 11f else 9.5f, 0.5f, 0f, UE.Display, if (i == focus) FontWeight.Medium else FontWeight.Normal)
                // moons of the focused planet
                if (i == focus) for (m in MOONS.filter { it.parent == i }) {
                    val ang = (T * 36525 / m.periodDays * 2 * PI).toFloat()
                    world(i, T, pos)
                    val md = bodyRadius(i) * m.dist * 2.2f
                    if (proj(pos[0].toFloat() + cos(ang) * md, pos[2].toFloat(), (-pos[1]).toFloat() + sin(ang) * md)) {
                        val mc = Offset(out[0], out[1])
                        drawCircle(m.color, (bodyRadius(i) * 0.16f * out[3]).coerceAtLeast(1.8f * dp), mc)
                        if (labels) label(tm, m.name, mc.x + 5 * dp, mc.y - 5 * dp, UE.Dim, 8.5f, 0f, 1f)
                    }
                }
            }
        }
    }) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                SectionLabel("Date", color = Domain.Astro.accent)
                T(date.toString(), size = 20.sp, font = UE.Mono, weight = FontWeight.Medium)
            }
            GlowButton("Today", accent = Domain.Astro.accent) { T = julianCenturiesNow() }
        }
        UESlider("Time speed", daysPerSec, 0.05f..3650f, log = true, accent = Domain.Astro.accent, format = { v -> if (v < 1) "${fix(v * 24, 1)} h / s" else if (v < 365) "${fix(v, 1)} days / s" else "${fix(v / 365.25f, 1)} years / s" }) { daysPerSec = it }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlowButton(if (running) "Pause" else "Play", accent = Domain.Astro.accent, filled = !running) { running = !running }
            GlowButton(if (reverse) "◀ Backward" else "Forward ▶", accent = UE.Dim) { reverse = !reverse }
            GlowButton("Overview", accent = UE.Dim) { flyTo(-1) }
        }
        ChipRow(listOf("Sun") + PLANETS.map { it.name }, focus + 1, Domain.Astro.accent) { flyTo(it - 1) }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Toggle("True distances", trueScale, accent = UE.Amber) { trueScale = it; if (focus >= 0) flyTo(focus) }
            Toggle("Labels", labels) { labels = it }
        }
        if (focus >= 0) {
            val p = PLANETS[focus]
            heliocentric(p, T, pos)
            val r = sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
            val e = DoubleArray(3); heliocentric(PLANETS[2], T, e)
            val fromEarth = sqrt((pos[0] - e[0]).pow(2) + (pos[1] - e[1]).pow(2) + (pos[2] - e[2]).pow(2))
            Column(Modifier.fillMaxWidth().glass(16.dp, p.color, fill = 0.06f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                T(p.name, size = 20.sp, weight = FontWeight.Medium, color = lerp(p.color, Color.White, 0.3f))
                T(p.fact, size = 13.sp, color = UE.Text.copy(alpha = 0.85f), lineHeight = 19.sp)
                ReadoutRow { Stat("radius", "${groupDigits(p.radiusKm.roundToLong())} km"); Stat("mass", "${fmt(p.massEarth, 3)} M⊕"); Stat("moons", p.moons) }
                ReadoutRow { Stat("day", p.day); Stat("year", p.year) }
                ReadoutRow { Stat("from the Sun", "${fix(r, 3)} AU", Domain.Astro.accent); Stat("from Earth", if (focus == 2) "—" else "${fix(fromEarth, 3)} AU", UE.Cyan); Stat("light delay", if (focus == 2) "—" else "${fix(fromEarth * 499.005 / 60, 1)} min", UE.Amber) }
                T("Surface / typical temperature: ${p.temp}", size = 12.sp, color = UE.Dim)
            }
        } else Note("Drag to orbit, pinch to zoom, tap a planet to fly to it. All positions are calculated for the date above.")
    }
}
