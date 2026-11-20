package com.quantumath.app.ui.nav

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.quantumath.app.AppContainer
import com.quantumath.app.data.Kind
import com.quantumath.app.ui.screens.*
import com.quantumath.app.ui.theme.LocalReduceMotion
import com.quantumath.app.platform.encodeNavArg
import com.quantumath.app.platform.LocalAppContainer

@Composable
inline fun <reified VM : ViewModel> appViewModel(crossinline create: (AppContainer) -> VM): VM {
    val c = LocalAppContainer.current
    return viewModel { create(c) }
}

data class TopDest(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

val TopDestinations = listOf(
    TopDest("home", "Home", Icons.Outlined.Home, Icons.Filled.Home),
    TopDest("calc", "Calculate", Icons.Outlined.Calculate, Icons.Filled.Calculate),
    TopDest("graph", "Graph", Icons.Outlined.ShowChart, Icons.Filled.ShowChart),
    TopDest("learn", "Learn", Icons.Outlined.School, Icons.Filled.School),
    TopDest("lab", "Laboratory", Icons.Outlined.Science, Icons.Filled.Science),
)

object Routes {
    fun enc(s: String) = encodeNavArg(s)
    fun tool(kind: String, input: String = ""): String = when (kind) {
        Kind.CALC -> "calc?input=${enc(input)}"
        Kind.SOLVE -> "solver?input=${enc(input)}"
        Kind.ALGEBRA -> "algebra?input=${enc(input)}"
        Kind.CALCULUS -> "calculus?input=${enc(input)}"
        Kind.GRAPH -> "graph?input=${enc(input)}"
        Kind.MATRIX -> "linalg?input=${enc(input)}"
        Kind.STATS -> "stats?input=${enc(input)}"
        Kind.NUMBER -> "numbertheory?input=${enc(input)}"
        Kind.COMPLEX -> "complex?input=${enc(input)}"
        Kind.GEOMETRY -> "geometry"
        Kind.TRIG -> "trig"
        Kind.LESSON -> "lesson/${enc(input)}"
        Kind.FORMULA -> "formulas?input=${enc(input)}"
        else -> "notebook"
    }
}

fun NavHostController.openTool(kind: String, input: String = "") = navigate(Routes.tool(kind, input))

fun NavHostController.navigateTop(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
fun AppRoot() {
    val nav = rememberNavController()
    val container = LocalAppContainer.current
    var message by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        container.messages.collect { m -> message = m; kotlinx.coroutines.delay(2600); message = null; kotlinx.coroutines.delay(250) }
    }
    val entry by nav.currentBackStackEntryAsState()
    val currentRoute = entry?.destination?.route?.substringBefore("?")?.substringBefore("/")
    val showBar = currentRoute in TopDestinations.map { it.route }
    val reduce = LocalReduceMotion.current

    BoxWithConstraints(Modifier.fillMaxSize()) {
    val rail = maxWidth > maxHeight && (maxHeight < 560.dp || maxWidth >= 900.dp)
    Row(Modifier.fillMaxSize()) {
    if (rail && showBar) {
        NavigationRail(containerColor = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Vertical))) {
            Spacer(Modifier.weight(1f))
            for (d in TopDestinations) {
                val sel = currentRoute == d.route
                NavigationRailItem(selected = sel, onClick = { if (!sel) nav.navigateTop(d.route) }, icon = { Icon(if (sel) d.selectedIcon else d.icon, contentDescription = null) }, label = { Text(d.label, maxLines = 1) })
            }
            Spacer(Modifier.weight(1f))
        }
    }
    Scaffold(
        modifier = Modifier.weight(1f),
        bottomBar = {
            AnimatedVisibility(showBar && !rail, enter = expandVertically(), exit = shrinkVertically()) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                    for (d in TopDestinations) {
                        val sel = currentRoute == d.route
                        NavigationBarItem(
                            selected = sel, onClick = { if (!sel) nav.navigateTop(d.route) },
                            icon = { Icon(if (sel) d.selectedIcon else d.icon, contentDescription = null) },
                            label = { Text(d.label, maxLines = 1) },
                        )
                    }
                }
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Top),
    ) { pad ->
        val enterT: EnterTransition = if (reduce) EnterTransition.None else fadeIn(tween(180)) + slideInHorizontally(tween(220)) { it / 12 }
        val exitT: ExitTransition = if (reduce) ExitTransition.None else fadeOut(tween(140))
        NavHost(
            nav, startDestination = "home",
            modifier = Modifier.padding(pad).consumeWindowInsets(pad).imePadding(),
            enterTransition = { enterT }, exitTransition = { exitT }, popEnterTransition = { if (reduce) EnterTransition.None else fadeIn(tween(180)) }, popExitTransition = { exitT },
        ) {
            val inputArg = listOf(navArgument("input") { type = NavType.StringType; defaultValue = "" })
            composable("home") { HomeScreen(nav) }
            composable("calc?input={input}", arguments = inputArg) { CalculatorScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("graph?input={input}", arguments = inputArg) { GraphScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("learn") { LearnScreen(nav) }
            composable("lab") { LabScreen(nav) }
            composable("solver?input={input}", arguments = inputArg) { SolverScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("algebra?input={input}", arguments = inputArg) { AlgebraScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("calculus?input={input}", arguments = inputArg) { CalculusScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("linalg?input={input}", arguments = inputArg) { LinearAlgebraScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("stats?input={input}", arguments = inputArg) { StatsScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("numbertheory?input={input}", arguments = inputArg) { NumberTheoryScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("complex?input={input}", arguments = inputArg) { ComplexScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("formulas?input={input}", arguments = inputArg) { FormulaScreen(nav, it.arguments?.getString("input").orEmpty()) }
            composable("geometry") { GeometryScreen(nav) }
            composable("trig") { TrigScreen(nav) }
            composable("viz") { VisualizationScreen(nav) }
            composable("notebook") { NotebookScreen(nav) }
            composable("challenge") { ChallengeScreen(nav) }
            composable("settings") { SettingsScreen(nav) }
            composable("search") { SearchScreen(nav) }
            composable("history") { HistoryScreen(nav) }
            composable("favorites") { FavoritesScreen(nav) }
            composable("achievements") { AchievementsScreen(nav) }
            composable("lesson/{id}") { LessonScreen(nav, it.arguments?.getString("id").orEmpty()) }
            composable("quiz/{topic}/{difficulty}/{mode}") {
                QuizScreen(nav, it.arguments?.getString("topic").orEmpty(), it.arguments?.getString("difficulty").orEmpty(), it.arguments?.getString("mode").orEmpty())
            }
        }
    }
    }
    MessageBanner(message, Modifier.align(Alignment.TopCenter))
    }
}

/**
 * Transient top banner for confirmations and achievements. Unlike a snackbar it never covers the
 * bottom of the screen (where the keypad and primary buttons live) and it does not intercept touches.
 */
@Composable
private fun MessageBanner(message: String?, modifier: Modifier = Modifier) {
    var last by remember { mutableStateOf("") }
    if (message != null) last = message
    AnimatedVisibility(message != null, modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top)).padding(top = 8.dp, start = 24.dp, end = 24.dp),
        enter = fadeIn() + slideInVertically { -it }, exit = fadeOut() + slideOutVertically { -it }) {
        Box(Modifier.shadow(8.dp, RoundedCornerShape(50)).background(MaterialTheme.colorScheme.inverseSurface, RoundedCornerShape(50)).padding(horizontal = 18.dp, vertical = 10.dp)
            .semantics { liveRegion = LiveRegionMode.Polite }) {
            Text(last, color = MaterialTheme.colorScheme.inverseOnSurface, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
