package dev.universe.engine

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Prefs
import dev.universe.engine.data.Secret
import dev.universe.engine.data.Secrets
import dev.universe.engine.home.DomainScreen
import dev.universe.engine.home.HomeScreen
import dev.universe.engine.home.JournalScreen
import dev.universe.engine.home.SettingsScreen
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Animated miniature drawn on cards: time in seconds and an accent colour. */
typealias Glyph = DrawScope.(t: Float, c: Color) -> Unit

class LabDef(val id: String, val domain: Domain, val title: String, val tagline: String, val glyph: Glyph, val content: @Composable () -> Unit)

sealed interface Route {
    data object Home : Route
    data class Field(val domain: Domain) : Route
    data class Lab(val id: String) : Route
    data object Settings : Route
    data object Journal : Route
}

class Nav {
    val stack: SnapshotStateList<Route> = mutableStateListOf(Route.Home)
    var forward by mutableStateOf(true)
        private set
    val current: Route get() = stack.last()
    fun go(r: Route) { forward = true; stack.add(r) }
    fun back(): Boolean {
        if (stack.size <= 1) return false
        forward = false
        stack.removeAt(stack.lastIndex)
        return true
    }
}

/** App-wide state: persisted preferences and the discovery celebration. */
class AppState(initial: Prefs = Prefs(), private val persist: (Prefs) -> Unit = {}) {
    var prefs by mutableStateOf(initial)
        private set
    var discovery by mutableStateOf<Secret?>(null)

    fun load(p: Prefs) { prefs = p }
    fun update(f: (Prefs) -> Prefs) {
        val n = f(prefs)
        if (n != prefs) { prefs = n; persist(n) }
    }
    fun discover(id: String) {
        if (id in prefs.discovered) return
        val s = Secrets.byId[id] ?: return
        update { it.copy(discovered = it.discovered + id) }
        discovery = s
    }
}

val LocalApp = staticCompositionLocalOf { AppState() }
val LocalNav = staticCompositionLocalOf { Nav() }

@Composable
fun UniverseApp(app: AppState, nav: Nav) {
    val view = LocalView.current
    val haptics = remember(view) { Haptics(view) { app.prefs.haptics } }
    CompositionLocalProvider(LocalApp provides app, LocalNav provides nav, LocalHaptics provides haptics) {
        BackHandler(enabled = nav.stack.size > 1) { nav.back() }
        val route = nav.current
        LaunchedEffect(route, app.prefs.keepAwake) { view.keepScreenOn = app.prefs.keepAwake && route is Route.Lab }
        LaunchedEffect(route) {
            if (route is Route.Lab) app.update { it.copy(visited = it.visited + route.id, lastLab = route.id) }
        }
        Box(Modifier.fillMaxSize().background(UE.Void)) {
            val quick = app.prefs.reduceMotion
            AnimatedContent(
                targetState = route,
                transitionSpec = {
                    val d = if (quick) 120 else 420
                    val inScale = if (quick) 1f else if (nav.forward) 0.9f else 1.1f
                    val outScale = if (quick) 1f else if (nav.forward) 1.12f else 0.9f
                    (fadeIn(tween(d, easing = FastOutSlowInEasing)) + scaleIn(tween(d, easing = FastOutSlowInEasing), initialScale = inScale)) togetherWith
                        (fadeOut(tween(d * 2 / 3)) + scaleOut(tween(d, easing = FastOutSlowInEasing), targetScale = outScale))
                },
                label = "route",
            ) { r ->
                when (r) {
                    Route.Home -> HomeScreen()
                    is Route.Field -> DomainScreen(r.domain)
                    is Route.Lab -> Labs.byId[r.id]?.content?.invoke() ?: HomeScreen()
                    Route.Settings -> SettingsScreen()
                    Route.Journal -> JournalScreen()
                }
            }
            DiscoveryOverlay(app)
        }
    }
}

@Composable
private fun BoxScope.DiscoveryOverlay(app: AppState) {
    val s = app.discovery
    var shown by remember { mutableStateOf<Secret?>(null) }
    if (s != null) shown = s
    val haptics = LocalHaptics.current
    LaunchedEffect(s) { if (s != null) haptics.thud() }
    AnimatedVisibility(s != null, enter = fadeIn(tween(300)), exit = fadeOut(tween(250))) {
        val t by rememberTime()
        Box(Modifier.fillMaxSize().background(Color(0xF0020206)).pressable { }, contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val c = Offset(size.width / 2, size.height * 0.3f)
                for (i in 0 until 5) {
                    val p = ((t * 0.35f + i / 5f) % 1f)
                    drawCircle(androidx.compose.ui.graphics.lerp(UE.Cyan, UE.Violet, i / 4f).copy(alpha = (1 - p) * 0.55f), size.minDimension * (0.08f + p * 0.75f), c, style = Stroke(2.dp.toPx()), blendMode = BlendMode.Plus)
                }
                for (i in 0 until 36) {
                    val a = i / 36f * 2 * PI.toFloat() + t * 0.2f
                    val r0 = size.minDimension * (0.1f + 0.03f * sin(t * 2 + i))
                    val r1 = r0 + size.minDimension * (0.05f + 0.04f * sin(t * 1.3f + i * 1.7f))
                    drawLine(UE.Cyan.copy(alpha = 0.35f), c + Offset(cos(a) * r0, sin(a) * r0), c + Offset(cos(a) * r1, sin(a) * r1), 1.5.dp.toPx(), blendMode = BlendMode.Plus)
                }
                glowDot(c, Color.White, 7.dp.toPx())
            }
            Column(
                Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 28.dp).verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(220.dp))
                T("DISCOVERY UNLOCKED", size = 11.sp, color = UE.Cyan, spacing = 3.sp, weight = FontWeight.Medium)
                Spacer(Modifier.height(10.dp))
                T(shown?.title ?: "", size = 28.sp, weight = FontWeight.Bold, align = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                T(shown?.reveal ?: "", size = 15.sp, color = UE.Text.copy(alpha = 0.88f), align = TextAlign.Center, lineHeight = 23.sp)
                Spacer(Modifier.height(10.dp))
                T("${app.prefs.discovered.size} of ${Secrets.all.size} found", size = 12.sp, color = UE.Dim, font = UE.Mono)
                Spacer(Modifier.height(22.dp))
                GlowButton("Add to journal", filled = true) { app.discovery = null }
                Spacer(Modifier.height(30.dp))
            }
        }
    }
}
