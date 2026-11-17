package dev.universe.engine.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.Glyph
import dev.universe.engine.Labs
import dev.universe.engine.LocalApp
import dev.universe.engine.LocalNav
import dev.universe.engine.Route
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Secrets
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private val TICKER = listOf(
    "e^{i\\pi} + 1 = 0" to "Euler's identity",
    "E = mc^2" to "Mass–energy equivalence",
    "F = G\\frac{m_1 m_2}{r^2}" to "Newton's law of gravitation",
    "i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi" to "Schrödinger equation",
    "\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}" to "Gauss's law",
    "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}" to "The Basel problem",
    "S = k_B \\ln W" to "Boltzmann's entropy",
    "\\varphi = \\frac{1 + \\sqrt{5}}{2}" to "The golden ratio",
    "r_s = \\frac{2GM}{c^2}" to "Schwarzschild radius",
    "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}" to "Gaussian integral",
    "G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}" to "Einstein field equations",
)

val DomainGlyphs: Map<Domain, Glyph> = mapOf(
    Domain.Math to { t, c ->
        val pts = ArrayList<Offset>(180)
        val k = 2.5f + 0.5f * sin(t * 0.2f)
        for (i in 0..360 step 2) {
            val a = i / 360f * 4 * PI.toFloat()
            val r = size.minDimension * 0.42f * cos(k * a + t * 0.4f)
            pts += center + Offset(cos(a) * r, sin(a) * r)
        }
        drawPoints(pts, PointMode.Polygon, c, 1.6.dp.toPx(), StrokeCap.Round)
        drawPoints(pts, PointMode.Polygon, c.copy(alpha = 0.18f), 5.dp.toPx(), StrokeCap.Round, blendMode = BlendMode.Plus)
    },
    Domain.Physics to { t, c ->
        val pivot = Offset(size.width / 2, size.height * 0.12f)
        val len = size.height * 0.62f
        for (k in 0 until 3) {
            val a = 0.7f * sin(t * (1.6f + k * 0.22f))
            val bob = pivot + Offset(sin(a) * len * (1 - k * 0.14f), cos(a) * len * (1 - k * 0.14f))
            drawLine(c.copy(alpha = 0.5f - k * 0.12f), pivot, bob, 1.2.dp.toPx())
            glowDot(bob, if (k == 0) c else c.copy(alpha = 0.7f), (5 - k).dp.toPx())
        }
    },
    Domain.Astro to { t, c ->
        val r = size.minDimension * 0.2f
        drawCircle(Brush.radialGradient(listOf(Color.White, c, c.copy(alpha = 0f)), center, r * 1.6f), r * 1.6f, center)
        for (k in 0 until 3) {
            val rr = size.minDimension * (0.3f + 0.08f * k)
            rotate(-22f, center) {
                drawOval(c.copy(alpha = 0.28f), Offset(center.x - rr, center.y - rr * 0.36f), Size(rr * 2, rr * 0.72f), style = Stroke(1.dp.toPx()))
                val a = t * (0.9f - k * 0.22f) + k * 2.1f
                glowDot(center + Offset(cos(a) * rr, sin(a) * rr * 0.36f), if (k == 1) UE.Amber else Color.White, (2.6f - k * 0.4f).dp.toPx())
            }
        }
    },
    Domain.Chem to { t, c ->
        drawCircle(c.copy(alpha = 0.25f), size.minDimension * 0.1f, center, blendMode = BlendMode.Plus)
        drawCircle(Color.White, size.minDimension * 0.05f, center)
        for (k in 0 until 3) {
            val rx = size.minDimension * 0.44f
            rotate(k * 60f + t * 6f, center) {
                drawOval(c.copy(alpha = 0.45f), Offset(center.x - rx, center.y - rx * 0.36f), Size(rx * 2, rx * 0.72f), style = Stroke(1.2.dp.toPx()))
                val a = t * 2.2f + k * 2f
                glowDot(center + Offset(cos(a) * rx, sin(a) * rx * 0.36f), c, 2.6.dp.toPx())
            }
        }
    },
)

@Composable
fun HomeScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val time by rememberTime(!app.prefs.reduceMotion)
    Box(Modifier.fillMaxSize()) {
        SpaceBackdrop(animate = !app.prefs.reduceMotion)
        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val wide = maxWidth > 700.dp
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        T("UNIVERSE", size = 26.sp, weight = FontWeight.Bold, spacing = 6.sp)
                        T("ENGINE", size = 26.sp, weight = FontWeight.Bold, spacing = 6.sp, color = UE.Cyan)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Chip("Journal  ${app.prefs.discovered.size}/${Secrets.all.size}", accent = UE.Violet, selected = app.prefs.discovered.isNotEmpty()) { nav.go(Route.Journal) }
                        Spacer(Modifier.height(8.dp))
                        Chip("Settings") { nav.go(Route.Settings) }
                    }
                }
                EngineCore(time, Modifier.size(if (wide) 230.dp else 210.dp))
                EquationTicker()
                Spacer(Modifier.height(18.dp))
                val domains = Domain.entries
                if (wide) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        domains.forEach { d -> DomainCard(d, time, Modifier.weight(1f)) }
                    }
                } else {
                    for (row in domains.chunked(2)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            row.forEach { d -> DomainCard(d, time, Modifier.weight(1f)) }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val last = Labs.byId[app.prefs.lastLab]
                    if (last != null) {
                        Column(Modifier.weight(1f).pressable { nav.go(Route.Lab(last.id)) }.glass(16.dp, last.domain.accent).padding(14.dp)) {
                            SectionLabel("Resume", color = last.domain.accent)
                            T(last.title, size = 14.sp, weight = FontWeight.Medium, maxLines = 1)
                        }
                    }
                    Column(Modifier.weight(1f).pressable { Labs.all.randomOrNull()?.let { nav.go(Route.Lab(it.id)) } }.glass(16.dp, UE.Magenta).padding(14.dp)) {
                        SectionLabel("Surprise me", color = UE.Magenta)
                        T("Random experiment", size = 14.sp, weight = FontWeight.Medium, maxLines = 1)
                    }
                }
                Spacer(Modifier.height(14.dp))
                T("${app.prefs.visited.count { it in Labs.byId }} of ${Labs.all.size} laboratories explored · works fully offline", size = 11.sp, color = UE.Faint, font = UE.Mono)
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun DomainCard(d: Domain, time: Float, modifier: Modifier = Modifier) {
    val nav = LocalNav.current
    val glyph = DomainGlyphs.getValue(d)
    Column(modifier.pressable { nav.go(Route.Field(d)) }.glass(22.dp, d.accent, fill = 0.07f).padding(14.dp)) {
        Canvas(Modifier.fillMaxWidth().height(92.dp)) { glyph(time, d.accent) }
        Spacer(Modifier.height(8.dp))
        T(d.title, size = 17.sp, weight = FontWeight.Medium, maxLines = 1)
        T("${Labs.all.count { it.domain == d }} laboratories", size = 11.sp, color = d.accent, font = UE.Mono, maxLines = 1)
    }
}

/** The rotating strip of famous equations, each written on in turn. */
@Composable
private fun EquationTicker() {
    var idx by remember { mutableIntStateOf(Random.nextInt(TICKER.size)) }
    val alpha = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(5200)
            alpha.animateTo(0f, tween(350))
            idx = (idx + 1) % TICKER.size
            alpha.snapTo(1f)
        }
    }
    val (tex, name) = TICKER[idx]
    Column(Modifier.fillMaxWidth().height(86.dp).graphicsLayer { this.alpha = alpha.value }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        WrittenMath(tex, size = 23.sp, key = idx, durationMs = 1100)
        Spacer(Modifier.height(6.dp))
        T(name.uppercase(), size = 9.5.sp, color = UE.Dim, spacing = 2.sp)
    }
}

/** The heart of the home screen: a slowly precessing atom-orrery. It reacts to touch. */
@Composable
private fun EngineCore(time: Float, modifier: Modifier = Modifier) {
    val app = LocalApp.current
    val haptics = LocalHaptics.current
    var taps by remember { mutableIntStateOf(0) }
    val pulse = remember { Animatable(0f) }
    val bang = remember { Animatable(0f) }
    val sparks = remember { List(140) { Triple(Random.nextFloat() * 2 * PI.toFloat(), 0.25f + Random.nextFloat() * 0.9f, Random.nextInt(3)) } }
    LaunchedEffect(taps) {
        if (taps == 0) return@LaunchedEffect
        if (taps % 7 == 0) {
            haptics.thud()
            bang.snapTo(0f); bang.animateTo(1f, tween(1700, easing = FastOutSlowInEasing))
            app.discover("bigbang")
            bang.snapTo(0f)
        } else { pulse.snapTo(1f); pulse.animateTo(0f, tween(450)) }
    }
    Canvas(modifier.pointerInput(Unit) { detectTapGestures { o -> if ((o - Offset(size.width / 2f, size.height / 2f)).getDistance() < size.width * 0.2f) { haptics.tick(); taps++ } } }) {
        val c = center
        val R = size.minDimension * 0.42f
        val colors = listOf(UE.Cyan, UE.Violet, UE.Blue)
        val b = bang.value
        val coreR = R * (0.13f + 0.03f * sin(time * 2f) + 0.05f * pulse.value) * (1f + 3f * b * (1 - b))
        drawCircle(Brush.radialGradient(listOf(UE.Cyan.copy(alpha = 0.5f), UE.Blue.copy(alpha = 0.14f), Color.Transparent), c, coreR * 4.2f), coreR * 4.2f, c, blendMode = BlendMode.Plus)
        for (k in 0 until 3) {
            rotate(k * 60f - 30f + time * 5f, c) {
                drawOval(colors[k].copy(alpha = 0.55f * (1 - b)), Offset(c.x - R, c.y - R * 0.36f), Size(R * 2, R * 0.72f), style = Stroke(1.4.dp.toPx()))
                drawOval(colors[k].copy(alpha = 0.1f * (1 - b)), Offset(c.x - R, c.y - R * 0.36f), Size(R * 2, R * 0.72f), style = Stroke(5.dp.toPx()), blendMode = BlendMode.Plus)
                for (e in 0 until 2) {
                    val a = time * (1.3f + k * 0.35f) + e * PI.toFloat() + k
                    glowDot(c + Offset(cos(a) * R, sin(a) * R * 0.36f), colors[k], 3.2.dp.toPx())
                }
            }
        }
        drawCircle(Color.White, coreR, c)
        if (b > 0f) {
            val pts = Array(3) { ArrayList<Offset>() }
            for ((a, sp, tier) in sparks) {
                val d = size.minDimension * 1.1f * sp * (1 - (1 - b) * (1 - b))
                pts[tier] += c + Offset(cos(a) * d, sin(a) * d)
            }
            for (k in 0 until 3) drawPoints(pts[k], PointMode.Points, colors[k].copy(alpha = (1 - b)), (3 + k * 2).dp.toPx(), StrokeCap.Round, blendMode = BlendMode.Plus)
            drawCircle(Color.White.copy(alpha = (1 - b) * 0.8f), size.minDimension * b * 0.9f, c, style = Stroke(2.dp.toPx()))
        }
    }
}

@Composable
fun DomainScreen(domain: Domain) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val time by rememberTime(!app.prefs.reduceMotion)
    val labs = remember(domain) { Labs.all.filter { it.domain == domain } }
    Box(Modifier.fillMaxSize()) {
        SpaceBackdrop(accent = domain.accent, animate = !app.prefs.reduceMotion)
        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val cols = if (maxWidth > 700.dp) 2 else 1
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BackButton({ nav.back() })
                    Spacer(Modifier.width(14.dp))
                    Column {
                        T(domain.title, size = 28.sp, weight = FontWeight.Bold)
                        T(domain.tagline, size = 12.5.sp, color = domain.accent)
                    }
                }
                Spacer(Modifier.height(18.dp))
                for (row in labs.chunked(cols)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        for (lab in row) {
                            Row(
                                Modifier.weight(1f).pressable { nav.go(Route.Lab(lab.id)) }.glass(20.dp, domain.accent).padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(Modifier.size(64.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))) {
                                    Canvas(Modifier.fillMaxSize().padding(6.dp)) { lab.glyph(this, time, domain.accent) }
                                }
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    T(lab.title, size = 16.sp, weight = FontWeight.Medium, maxLines = 1)
                                    Spacer(Modifier.height(2.dp))
                                    T(lab.tagline, size = 12.sp, color = UE.Dim, lineHeight = 16.sp, maxLines = 2)
                                }
                                if (lab.id in app.prefs.visited) Box(Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(domain.accent))
                            }
                        }
                        if (row.size < cols) Spacer(Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
fun SettingsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val p = app.prefs
    Box(Modifier.fillMaxSize()) {
        SpaceBackdrop(animate = false)
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BackButton({ nav.back() }); Spacer(Modifier.width(14.dp)); T("Settings", size = 28.sp, weight = FontWeight.Bold)
            }
            Column(Modifier.fillMaxWidth().glass(20.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionLabel("Rendering quality")
                Segmented(listOf("Eco", "Balanced", "Ultra"), p.quality) { q -> app.update { it.copy(quality = q) } }
                Note("Scales particle counts and fractal resolution. Balanced is tuned for mid-range phones; Eco saves battery.")
            }
            Column(Modifier.fillMaxWidth().glass(20.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel("Experience")
                Toggle("Haptic feedback", p.haptics) { v -> app.update { it.copy(haptics = v) } }
                Toggle("Reduce motion (calmer transitions and backgrounds)", p.reduceMotion) { v -> app.update { it.copy(reduceMotion = v) } }
                Toggle("Keep screen awake inside laboratories", p.keepAwake) { v -> app.update { it.copy(keepAwake = v) } }
            }
            Column(Modifier.fillMaxWidth().glass(20.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionLabel("Progress")
                Note("${p.visited.count { it in Labs.byId }} of ${Labs.all.size} laboratories explored · ${p.discovered.size} of ${Secrets.all.size} discoveries in the journal.")
                var armed by remember { mutableStateOf(false) }
                GlowButton(if (armed) "Tap again to erase progress" else "Reset progress", accent = UE.Red) {
                    if (armed) { app.update { it.copy(discovered = emptySet(), visited = emptySet(), lastLab = "") }; armed = false } else armed = true
                }
            }
            Column(Modifier.fillMaxWidth().glass(20.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel("About")
                Note("Universe Engine 1.0 — every simulation is computed live on this device from the equations shown under the f(x) button. Nothing is pre-rendered and nothing needs a connection.")
                Note("Typefaces: Space Grotesk, JetBrains Mono and STIX Two Math (SIL Open Font License). Planetary positions use JPL's approximate Keplerian elements. Constants follow CODATA 2018.")
            }
        }
    }
}

@Composable
fun JournalScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    Box(Modifier.fillMaxSize()) {
        SpaceBackdrop(accent = UE.Violet, animate = !app.prefs.reduceMotion)
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BackButton({ nav.back() }); Spacer(Modifier.width(14.dp))
                Column {
                    T("Discovery journal", size = 26.sp, weight = FontWeight.Bold)
                    T("${app.prefs.discovered.size} of ${Secrets.all.size} found — the engine rewards curiosity", size = 12.5.sp, color = UE.Violet)
                }
            }
            Spacer(Modifier.height(4.dp))
            Secrets.all.forEachIndexed { i, s ->
                val found = s.id in app.prefs.discovered
                Column(Modifier.fillMaxWidth().glass(18.dp, if (found) UE.Cyan else Color.White, fill = if (found) 0.08f else 0.035f).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        T(String.format("%02d", i + 1), size = 12.sp, color = if (found) UE.Cyan else UE.Faint, font = UE.Mono)
                        Spacer(Modifier.width(10.dp))
                        T(if (found) s.title else "Undiscovered", size = 16.sp, weight = FontWeight.Medium, color = if (found) UE.Text else UE.Dim)
                    }
                    T(if (found) s.reveal else s.riddle, size = 13.sp, color = if (found) UE.Text.copy(alpha = 0.85f) else UE.Dim, lineHeight = 19.sp)
                }
            }
        }
    }
}
