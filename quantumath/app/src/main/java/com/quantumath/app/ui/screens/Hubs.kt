package com.quantumath.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.ProgressRepository
import com.quantumath.app.data.*
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.Routes
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.nav.navigateTop
import com.quantumath.app.ui.nav.openTool
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.math.learning.Achievements
import com.quantumath.math.learning.FormulaLibrary
import com.quantumath.math.learning.Lessons
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date
import kotlin.math.sin
import com.quantumath.app.platform.LocalAppContainer

data class ToolInfo(val route: String, val title: String, val subtitle: String, val icon: ImageVector, val color: Long, val keywords: String)

val Tools = listOf(
    ToolInfo("calc", "Scientific calculator", "Arbitrary precision, memory, exact fractions", Icons.Outlined.Calculate, 0xFF9D7BFF, "arithmetic precision memory factorial percent"),
    ToolInfo("solver", "Equation solver", "Equations, inequalities, systems with steps", Icons.Outlined.Functions, 0xFF4FD8FF, "solve equation root inequality system quadratic polynomial"),
    ToolInfo("algebra", "Algebra studio", "Simplify, expand, factor, substitute", Icons.Outlined.DataObject, 0xFFE879F9, "simplify expand factor polynomial rational"),
    ToolInfo("calculus", "Calculus lab", "Derivatives, integrals, limits, analysis", Icons.Outlined.Insights, 0xFFFF6B8B, "derivative integral limit tangent critical"),
    ToolInfo("graph", "Graphing engine", "Functions, parametric & polar, analysis", Icons.Outlined.ShowChart, 0xFF3DDC97, "plot graph function parametric polar root intersection"),
    ToolInfo("geometry", "Geometry workshop", "Draggable shapes, areas and volumes", Icons.Outlined.Category, 0xFFFFB547, "triangle polygon circle area volume perimeter"),
    ToolInfo("trig", "Trigonometry explorer", "Unit circle and triangle solver", Icons.Outlined.Architecture, 0xFF60A5FA, "sine cosine tangent unit circle triangle law of sines"),
    ToolInfo("linalg", "Linear algebra", "Matrices, determinants, RREF, vectors", Icons.Outlined.GridOn, 0xFF9D7BFF, "matrix determinant inverse eigen vector rref rank"),
    ToolInfo("stats", "Statistics & probability", "Data, regression, distributions, simulations", Icons.Outlined.BarChart, 0xFF4FD8FF, "mean median variance regression normal binomial probability dice"),
    ToolInfo("numbertheory", "Number theory", "Primes, factorization, gcd, modular", Icons.Outlined.Tag, 0xFFF97316, "prime factor gcd lcm modular totient fibonacci"),
    ToolInfo("complex", "Complex numbers", "Argand plane, polar form, roots", Icons.Outlined.Adjust, 0xFFE879F9, "complex imaginary argand polar euler roots"),
    ToolInfo("viz", "Visualization studio", "Fractals, chaos and animations", Icons.Outlined.AutoAwesome, 0xFF3DDC97, "mandelbrot julia fractal chaos logistic lorenz fourier animation"),
    ToolInfo("notebook", "Notebook", "Saved results, folders, export", Icons.Outlined.Book, 0xFFFFB547, "notes saved folders export import"),
    ToolInfo("formulas", "Formula library", "${FormulaLibrary.all.size} formulas with examples", Icons.Outlined.MenuBook, 0xFF60A5FA, "formula reference identities"),
    ToolInfo("challenge", "Challenge mode", "Daily challenge, timed quizzes, trophies", Icons.Outlined.EmojiEvents, 0xFFFF6B8B, "challenge daily quiz achievements"),
)

class HomeViewModel(c: AppContainer) : ViewModel() {
    val recent = c.history.recent.map { it.take(5) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val lessons = c.progress.lessons.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val quizzes = c.progress.quizzes.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val achievements = c.progress.achievements.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}

@Composable
fun BrandMark(size: Int = 40) {
    val lab = LocalLab.current
    Canvas(Modifier.size(size.dp)) {
        val r = this.size.minDimension / 2
        drawCircle(Brush.sweepGradient(listOf(lab.accent, lab.accent2, lab.accent)), r * 0.82f, style = Stroke(r * 0.16f))
        val p = Path()
        for (i in 0..40) { val t = i / 40f; val x = center.x - r * 0.62f + t * r * 1.24f; val y = center.y - sin(t * 6.283f) * r * 0.32f; if (i == 0) p.moveTo(x, y) else p.lineTo(x, y) }
        drawPath(p, lab.accent2, style = Stroke(r * 0.12f))
        drawLine(lab.accent, Offset(center.x + r * 0.45f, center.y + r * 0.45f), Offset(center.x + r * 0.95f, center.y + r * 0.95f), r * 0.16f)
    }
}

@Composable
fun HomeScreen(nav: NavHostController) {
    val vm = appViewModel { HomeViewModel(it) }
    val recent by vm.recent.collectAsStateWithLifecycle()
    val lessons by vm.lessons.collectAsStateWithLifecycle()
    val quizzes by vm.quizzes.collectAsStateWithLifecycle()
    val ach by vm.achievements.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    val todayKey = ProgressRepository.dayKey(ProgressRepository.today())
    val dailyDone = quizzes.any { it.daily && it.dayKey == todayKey }
    val streak = ProgressRepository.streak(quizzes.filter { it.daily }.map { it.dayKey }.toSet(), ProgressRepository.today())
    val completed = lessons.filter { it.completed }.map { it.lessonId }.toSet()
    val next = Lessons.all.firstOrNull { it.id !in completed }

    LazyVerticalGrid(GridCells.Adaptive(160.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BrandMark(44)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Quantumath", style = MaterialTheme.typography.headlineMedium)
                    Text("Advanced Mathematics Laboratory", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { nav.navigate("favorites") }) { Icon(Icons.Outlined.StarOutline, "Favorites") }
                IconButton(onClick = { nav.navigate("history") }) { Icon(Icons.Outlined.History, "History") }
                IconButton(onClick = { nav.navigate("settings") }) { Icon(Icons.Outlined.Settings, "Settings") }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Surface(onClick = { nav.navigate("search") }, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(10.dp))
                    Text("Search tools, lessons, formulas, notes…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Surface(onClick = { nav.navigate("quiz/daily/MEDIUM/daily") }, shape = RoundedCornerShape(24.dp), color = lab.panel, border = BorderStroke(1.dp, lab.accent.copy(alpha = 0.5f))) {
                Row(Modifier.background(Brush.linearGradient(listOf(lab.accent.copy(alpha = 0.28f), lab.accent2.copy(alpha = 0.12f)))).padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("DAILY CHALLENGE", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Text(if (dailyDone) "Completed today ✓" else "5 fresh problems are waiting", style = MaterialTheme.typography.titleLarge)
                        Text(if (streak > 0) "🔥 $streak-day streak" else "Start a streak today", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(if (dailyDone) Icons.Filled.CheckCircle else Icons.Filled.PlayCircle, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
        if (next != null) item(span = { GridItemSpan(maxLineSpan) }) {
            Panel(Modifier.clickable { nav.navigate("lesson/${next.id}") }, title = "Continue learning", icon = Icons.Outlined.School) {
                Text(next.title, style = MaterialTheme.typography.titleMedium)
                Text("${next.topic} · ${next.level.label} · ${next.minutes} min", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(progress = { completed.size / Lessons.all.size.toFloat() }, Modifier.fillMaxWidth().clip(CircleShape))
                Text("${completed.size} of ${Lessons.all.size} lessons · ${ach.size}/${Achievements.all.size} achievements", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Quick tools") }
        items(Tools.take(8), key = { it.route }) { t ->
            ToolTile(t.icon, t.title, t.subtitle, Color(t.color), onClick = { if (t.route == "calc" || t.route == "graph") nav.navigateTop(t.route) else nav.navigate(t.route) })
        }
        if (recent.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Recent") }
            items(recent, key = { "h${it.id}" }, span = { GridItemSpan(maxLineSpan) }) { h -> HistoryRow(h, onClick = { nav.openTool(h.kind, h.input) }) }
        }
    }
}

@Composable
fun HistoryRow(h: HistoryEntry, onClick: () -> Unit, trailing: @Composable (() -> Unit)? = null) {
    Surface(onClick = onClick, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(kindIcon(h.kind), null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(h.input, fontFamily = MonoFamily, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(h.result, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = MonoFamily)
            }
            trailing?.invoke()
        }
    }
}

fun kindIcon(kind: String): ImageVector = when (kind) {
    Kind.CALC -> Icons.Outlined.Calculate; Kind.SOLVE -> Icons.Outlined.Functions; Kind.ALGEBRA -> Icons.Outlined.DataObject
    Kind.CALCULUS -> Icons.Outlined.Insights; Kind.GRAPH -> Icons.Outlined.ShowChart; Kind.MATRIX -> Icons.Outlined.GridOn
    Kind.STATS -> Icons.Outlined.BarChart; Kind.NUMBER -> Icons.Outlined.Tag; Kind.COMPLEX -> Icons.Outlined.Adjust
    Kind.GEOMETRY -> Icons.Outlined.Category; Kind.TRIG -> Icons.Outlined.Architecture; Kind.FORMULA -> Icons.Outlined.MenuBook
    Kind.LESSON -> Icons.Outlined.School; Kind.TOOL -> Icons.Outlined.Build; else -> Icons.Outlined.StickyNote2
}

@Composable
fun LabScreen(nav: NavHostController) {
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Laboratory", subtitle = "All instruments", actions = { IconButton(onClick = { nav.navigate("search") }) { Icon(Icons.Outlined.Search, "Search") } })
        LazyVerticalGrid(GridCells.Adaptive(160.dp), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(Tools, key = { it.route }) { t ->
                ToolTile(t.icon, t.title, t.subtitle, Color(t.color), onClick = { if (t.route == "calc" || t.route == "graph") nav.navigateTop(t.route) else nav.navigate(t.route) })
            }
        }
    }
}

// ---------- Search ----------

data class SearchHit(val title: String, val subtitle: String, val icon: ImageVector, val go: (NavHostController) -> Unit)

class SearchViewModel(private val c: AppContainer) : ViewModel() {
    val query = MutableStateFlow("")
    @OptIn(kotlinx.coroutines.FlowPreview::class)
    val results: StateFlow<List<SearchHit>> = query.debounce(150).mapLatest { q -> search(q.trim()) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private suspend fun search(q: String): List<SearchHit> {
        if (q.isEmpty()) return emptyList()
        val t = q.lowercase()
        val out = ArrayList<SearchHit>()
        Tools.filter { it.title.lowercase().contains(t) || it.keywords.contains(t) || it.subtitle.lowercase().contains(t) }
            .forEach { tool -> out += SearchHit(tool.title, "Tool · ${tool.subtitle}", tool.icon) { it.navigate(tool.route) } }
        Lessons.all.filter { it.title.lowercase().contains(t) || it.topic.lowercase().contains(t) || it.summary.lowercase().contains(t) }
            .forEach { l -> out += SearchHit(l.title, "Lesson · ${l.topic}", Icons.Outlined.School) { it.navigate("lesson/${l.id}") } }
        FormulaLibrary.search(q).take(15).forEach { f -> out += SearchHit(f.name, "Formula · ${f.formula}", Icons.Outlined.MenuBook) { it.navigate(Routes.tool(Kind.FORMULA, f.name)) } }
        c.db.notebook().search(q).forEach { n -> out += SearchHit(n.title, "Notebook · ${n.input}", Icons.Outlined.Book) { it.openTool(n.kind, n.input) } }
        c.db.history().search(q).forEach { h -> out += SearchHit(h.input, "History · ${h.result}", Icons.Outlined.History) { it.openTool(h.kind, h.input) } }
        return out
    }
}

@Composable
fun SearchScreen(nav: NavHostController) {
    val vm = appViewModel { SearchViewModel(it) }
    val q by vm.query.collectAsStateWithLifecycle()
    val results by vm.results.collectAsStateWithLifecycle()
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Search", onBack = { nav.popBackStack() })
        OutlinedTextField(q, { vm.query.value = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus), placeholder = { Text("Tools, lessons, formulas, notes, history") },
            leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        if (q.isNotBlank() && results.isEmpty()) EmptyState(Icons.Outlined.SearchOff, "No matches", "Try a broader word such as “integral” or “prime”.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(results) { h ->
                ListItem(headlineContent = { Text(h.title, maxLines = 1, overflow = TextOverflow.Ellipsis) }, supportingContent = { Text(h.subtitle, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    leadingContent = { Icon(h.icon, null, tint = MaterialTheme.colorScheme.primary) },
                    modifier = Modifier.clip(RoundedCornerShape(14.dp)).clickable { h.go(nav) }, colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow))
            }
        }
    }
}



// ---------- History ----------

class HistoryViewModel(private val c: AppContainer) : ViewModel() {
    val items = c.history.recent.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    fun toggleFav(h: HistoryEntry) = viewModelScope.launch { c.db.history().update(h.copy(favorite = !h.favorite)) }
    fun delete(h: HistoryEntry) = viewModelScope.launch { c.db.history().delete(h) }
    fun clear() = viewModelScope.launch { c.db.history().clear() }
}

@Composable
fun HistoryScreen(nav: NavHostController) {
    val vm = appViewModel { HistoryViewModel(it) }
    val items by vm.items.collectAsStateWithLifecycle()
    var confirm by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("History", onBack = { nav.popBackStack() }, subtitle = "${items.size} entries", actions = {
            if (items.isNotEmpty()) IconButton(onClick = { confirm = true }) { Icon(Icons.Outlined.DeleteSweep, "Clear history") }
        })
        if (items.isEmpty()) EmptyState(Icons.Outlined.History, "No history yet", "Calculations and solutions appear here automatically. You can turn this off in Settings.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { h ->
                HistoryRow(h, onClick = { nav.openTool(h.kind, h.input) }) {
                    Text(DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(h.timestamp)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = { vm.toggleFav(h) }) { Icon(if (h.favorite) Icons.Filled.Star else Icons.Outlined.StarOutline, if (h.favorite) "Remove from favorites" else "Add to favorites", tint = if (h.favorite) LocalLab.current.warning else MaterialTheme.colorScheme.onSurfaceVariant) }
                    IconButton(onClick = { vm.delete(h) }) { Icon(Icons.Outlined.Delete, "Delete entry") }
                }
            }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("Clear history?") }, text = { Text("This removes all ${items.size} entries, including favorites.") },
        confirmButton = { TextButton(onClick = { vm.clear(); confirm = false }) { Text("Clear") } }, dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } })
}

// ---------- Favorites ----------

class FavoritesViewModel(private val c: AppContainer) : ViewModel() {
    val favorites = c.db.favorites().all().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val history = c.db.history().favorites().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val notes = c.db.notebook().notes().map { l -> l.filter { it.favorite } }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    fun remove(f: Favorite) = viewModelScope.launch { c.db.favorites().delete(f.key) }
}

@Composable
fun FavoritesScreen(nav: NavHostController) {
    val vm = appViewModel { FavoritesViewModel(it) }
    val favs by vm.favorites.collectAsStateWithLifecycle()
    val hist by vm.history.collectAsStateWithLifecycle()
    val notes by vm.notes.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Favorites", onBack = { nav.popBackStack() })
        if (favs.isEmpty() && hist.isEmpty() && notes.isEmpty()) EmptyState(Icons.Outlined.StarOutline, "Nothing starred yet", "Star formulas, lessons, history entries and notes to collect them here.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(favs, key = { it.key }) { f ->
                ListItem(headlineContent = { Text(f.title) }, supportingContent = { Text(f.payload.ifBlank { f.kind }, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    leadingContent = { Icon(kindIcon(f.kind), null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { IconButton(onClick = { vm.remove(f) }) { Icon(Icons.Filled.Star, "Remove from favorites", tint = LocalLab.current.warning) } },
                    modifier = Modifier.clip(RoundedCornerShape(14.dp)).clickable {
                        when (f.kind) { Kind.LESSON -> nav.navigate("lesson/${f.key.substringAfter(':')}"); Kind.FORMULA -> nav.navigate(Routes.tool(Kind.FORMULA, f.title)); Kind.TOOL -> nav.navigate(f.key.substringAfter(':')); else -> nav.openTool(f.kind, f.payload) }
                    }, colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow))
            }
            items(notes, key = { "n${it.id}" }) { n -> HistoryRow(HistoryEntry(kind = n.kind, input = n.title, result = n.input), onClick = { nav.openTool(n.kind, n.input) }) }
            items(hist, key = { "h${it.id}" }) { h -> HistoryRow(h, onClick = { nav.openTool(h.kind, h.input) }) }
        }
    }
}

// ---------- Achievements ----------

@Composable
fun AchievementsScreen(nav: NavHostController) {
    val c = LocalAppContainer.current
    val unlocked by c.progress.achievements.collectAsStateWithLifecycle(emptyList())
    val map = unlocked.associateBy { it.id }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Achievements", onBack = { nav.popBackStack() }, subtitle = "${unlocked.size} of ${Achievements.all.size} unlocked")
        LazyVerticalGrid(GridCells.Adaptive(150.dp), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(Achievements.all, key = { it.id }) { a ->
                val u = map[a.id]
                val lab = LocalLab.current
                Panel {
                    Icon(if (u != null) Icons.Filled.EmojiEvents else Icons.Outlined.Lock, null, tint = if (u != null) lab.warning else MaterialTheme.colorScheme.outline, modifier = Modifier.size(32.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(a.title, style = MaterialTheme.typography.titleSmall, color = if (u != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(a.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, minLines = 2)
                    if (u != null) Text(DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(u.unlockedAt)), style = MaterialTheme.typography.labelSmall, color = lab.success)
                }
            }
        }
    }
}
