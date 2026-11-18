package com.quantumath.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import com.quantumath.app.AppContainer
import com.quantumath.app.BuildConfig
import com.quantumath.app.ProgressRepository
import com.quantumath.app.container
import com.quantumath.app.data.*
import com.quantumath.app.ui.components.*
import com.quantumath.app.ui.nav.appViewModel
import com.quantumath.app.ui.nav.openTool
import com.quantumath.app.ui.theme.LocalLab
import com.quantumath.app.ui.theme.MonoFamily
import com.quantumath.app.util.Share
import com.quantumath.math.learning.Achievements
import com.quantumath.math.learning.Difficulty
import com.quantumath.math.learning.QuizTopic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date
import kotlin.math.roundToInt

// =============================== Notebook ===============================

class NotebookViewModel(private val c: AppContainer) : ViewModel() {
    val notes = c.db.notebook().notes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val folders = c.db.notebook().folders().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    var filter by mutableStateOf<Long>(-1L) // -1 all, -2 favorites, -3 unfiled, else folder id

    fun upsert(n: Note) = viewModelScope.launch { if (n.id == 0L) c.db.notebook().insert(n) else c.db.notebook().update(n.copy(updatedAt = System.currentTimeMillis())) }
    fun delete(n: Note) = viewModelScope.launch { c.db.notebook().delete(n) }
    fun toggleFav(n: Note) = viewModelScope.launch { c.db.notebook().update(n.copy(favorite = !n.favorite)) }
    fun addFolder(name: String) = viewModelScope.launch { if (name.isNotBlank()) c.db.notebook().insertFolder(Folder(name = name.trim())) }
    fun renameFolder(f: Folder, name: String) = viewModelScope.launch { if (name.isNotBlank()) c.db.notebook().updateFolder(f.copy(name = name.trim())) }
    fun deleteFolder(f: Folder) = viewModelScope.launch { c.db.notebook().deleteFolder(f.id); filter = -1 }

    fun export(ctx: android.content.Context, uri: Uri) = viewModelScope.launch {
        runCatching { val json = c.backup.exportNotebook(); withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(json.toByteArray()) } } }
            .onSuccess { c.messages.emit("Notebook exported") }.onFailure { c.messages.emit("Export failed: ${it.message}") }
    }
    fun share(ctx: android.content.Context) = viewModelScope.launch { runCatching { Share.file(ctx, c.backup.exportNotebook(), "quantumath-notebook.json") } }
    fun import(ctx: android.content.Context, uri: Uri) = viewModelScope.launch {
        runCatching { val text = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() } }; c.backup.importNotebook(text) }
            .onSuccess { c.messages.emit("Imported $it entries") }.onFailure { c.messages.emit("Import failed: ${it.message}") }
    }
}

@Composable
fun NotebookScreen(nav: NavHostController) {
    val vm = appViewModel { NotebookViewModel(it) }
    val notes by vm.notes.collectAsStateWithLifecycle()
    val folders by vm.folders.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    var editing by remember { mutableStateOf<Note?>(null) }
    var folderDialog by remember { mutableStateOf<Folder?>(null) }
    var newFolder by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { it?.let { u -> vm.export(ctx, u) } }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { u -> vm.import(ctx, u) } }
    val shown = notes.filter { when (vm.filter) { -1L -> true; -2L -> it.favorite; -3L -> it.folderId == null; else -> it.folderId == vm.filter } }

    Column(Modifier.fillMaxSize()) {
        LabTopBar("Notebook", onBack = { nav.popBackStack() }, subtitle = "${notes.size} entries", actions = {
            IconButton(onClick = { editing = Note(title = "", kind = Kind.NOTE, input = "", result = "", folderId = vm.filter.takeIf { it > 0 }) }) { Icon(Icons.Outlined.NoteAdd, "New note") }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More options") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Text("Export to file…") }, onClick = { menu = false; exportLauncher.launch("quantumath-notebook.json") }, leadingIcon = { Icon(Icons.Outlined.FileDownload, null) })
                    DropdownMenuItem(text = { Text("Import from file…") }, onClick = { menu = false; importLauncher.launch(arrayOf("application/json", "text/plain", "*/*")) }, leadingIcon = { Icon(Icons.Outlined.FileUpload, null) })
                    DropdownMenuItem(text = { Text("Share export") }, onClick = { menu = false; vm.share(ctx) }, leadingIcon = { Icon(Icons.Outlined.Share, null) })
                }
            }
        })
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(vm.filter == -1L, { vm.filter = -1 }, { Text("All") })
            FilterChip(vm.filter == -2L, { vm.filter = -2 }, { Text("★ Favorites") })
            FilterChip(vm.filter == -3L, { vm.filter = -3 }, { Text("Unfiled") })
            for (f in folders) FilterChip(vm.filter == f.id, { if (vm.filter == f.id) folderDialog = f else vm.filter = f.id }, { Text(f.name) }, leadingIcon = { Icon(Icons.Outlined.Folder, null, Modifier.size(16.dp)) },
                trailingIcon = if (vm.filter == f.id) ({ Icon(Icons.Outlined.Edit, "Edit folder", Modifier.size(16.dp)) }) else null)
            AssistChip(onClick = { newFolder = true }, label = { Text("Folder") }, leadingIcon = { Icon(Icons.Outlined.CreateNewFolder, null, Modifier.size(16.dp)) })
        }
        if (shown.isEmpty()) EmptyState(Icons.Outlined.Book, "Nothing here yet", "Use the bookmark button on any result to save it, or create a note with the + button.")
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(shown, key = { it.id }) { n -> NoteCard(n, folders, vm, nav, onEdit = { editing = n }) }
        }
    }
    editing?.let { n -> NoteEditor(n, folders, onDismiss = { editing = null }, onSave = { vm.upsert(it); editing = null }) }
    if (newFolder) TextInputDialog("New folder", "", { newFolder = false }) { vm.addFolder(it); newFolder = false }
    folderDialog?.let { f ->
        AlertDialog(onDismissRequest = { folderDialog = null }, title = { Text("Folder “${f.name}”") }, text = {
            var name by remember { mutableStateOf(f.name) }
            Column { OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true); Spacer(Modifier.height(8.dp))
                Row { TextButton(onClick = { vm.renameFolder(f, name); folderDialog = null }) { Text("Rename") }; TextButton(onClick = { vm.deleteFolder(f); folderDialog = null }) { Text("Delete folder", color = MaterialTheme.colorScheme.error) } }
                Text("Deleting a folder keeps its notes (they become unfiled).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }, confirmButton = { TextButton(onClick = { folderDialog = null }) { Text("Close") } })
    }
}

@Composable
private fun NoteCard(n: Note, folders: List<Folder>, vm: NotebookViewModel, nav: NavHostController, onEdit: () -> Unit) {
    val lab = LocalLab.current
    val ctx = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    Surface(onClick = { if (n.kind == Kind.NOTE || n.kind == Kind.FORMULA) onEdit() else nav.openTool(n.kind, n.input) }, shape = RoundedCornerShape(16.dp), color = lab.panel, border = BorderStroke(1.dp, lab.panelBorder)) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.Top) {
            Icon(kindIcon(n.kind), null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(n.title.ifBlank { "Untitled" }, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (n.result.isNotBlank()) Text(n.result, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily), maxLines = 3, overflow = TextOverflow.Ellipsis)
                if (n.body.isNotBlank()) Text(n.body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(folders.firstOrNull { it.id == n.folderId }?.name, DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(n.updatedAt))).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            }
            IconButton(onClick = { vm.toggleFav(n) }) { Icon(if (n.favorite) Icons.Filled.Star else Icons.Outlined.StarOutline, if (n.favorite) "Unfavorite" else "Favorite", tint = if (n.favorite) lab.warning else MaterialTheme.colorScheme.onSurfaceVariant) }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Entry options") }
                DropdownMenu(menu, { menu = false }) {
                    if (n.kind != Kind.NOTE) DropdownMenuItem(text = { Text("Open in tool") }, onClick = { menu = false; nav.openTool(n.kind, n.input) })
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { menu = false; onEdit() })
                    DropdownMenuItem(text = { Text("Share") }, onClick = { menu = false; Share.text(ctx, listOf(n.title, n.input, n.result, n.body).filter { it.isNotBlank() }.distinct().joinToString("\n")) })
                    DropdownMenuItem(text = { Text("Delete", color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; confirmDelete = true })
                }
            }
        }
    }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("Delete entry?") }, text = { Text(n.title) },
        confirmButton = { TextButton(onClick = { vm.delete(n); confirmDelete = false }) { Text("Delete") } }, dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } })
}

@Composable
private fun NoteEditor(n: Note, folders: List<Folder>, onDismiss: () -> Unit, onSave: (Note) -> Unit) {
    var title by remember { mutableStateOf(n.title) }
    var body by remember { mutableStateOf(n.body) }
    var result by remember { mutableStateOf(n.result) }
    var folder by remember { mutableStateOf(n.folderId) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (n.id == 0L) "New note" else "Edit entry") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (n.kind != Kind.NOTE) OutlinedTextField(result, { result = it }, label = { Text("Result") }, modifier = Modifier.fillMaxWidth(), textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily))
            OutlinedTextField(body, { body = it }, label = { Text("Notes") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Text("Folder", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(folder == null, { folder = null }, { Text("None") })
                for (f in folders) FilterChip(folder == f.id, { folder = f.id }, { Text(f.name) })
            }
        }
    }, confirmButton = { TextButton(onClick = { onSave(n.copy(title = title.ifBlank { "Note" }, body = body, result = result, folderId = folder)) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
fun TextInputDialog(title: String, initial: String, onDismiss: () -> Unit, onOk: (String) -> Unit) {
    var t by remember { mutableStateOf(initial) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { OutlinedTextField(t, { t = it }, singleLine = true) },
        confirmButton = { TextButton(onClick = { onOk(t) }) { Text("OK") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

// =============================== Challenge ===============================

class ChallengeViewModel(c: AppContainer) : ViewModel() {
    val quizzes = c.progress.quizzes.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val achievements = c.progress.achievements.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    var topic by mutableStateOf("MIXED")
    var difficulty by mutableStateOf(Difficulty.MEDIUM)
}

@Composable
fun ChallengeScreen(nav: NavHostController) {
    val vm = appViewModel { ChallengeViewModel(it) }
    val quizzes by vm.quizzes.collectAsStateWithLifecycle()
    val ach by vm.achievements.collectAsStateWithLifecycle()
    val lab = LocalLab.current
    val today = ProgressRepository.dayKey(ProgressRepository.today())
    val todays = quizzes.firstOrNull { it.daily && it.dayKey == today }
    val streak = ProgressRepository.streak(quizzes.filter { it.daily }.map { it.dayKey }.toSet(), ProgressRepository.today())
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Challenge mode", onBack = { nav.popBackStack() })
        ScreenColumn {
            Panel(title = "Daily challenge", icon = Icons.Outlined.Today) {
                Text(if (todays != null) "Today: ${todays.score}/${todays.total} ✓" else "5 problems · 5 minutes · same for everyone today", style = MaterialTheme.typography.titleMedium)
                Text("Current streak: $streak day${if (streak == 1) "" else "s"} 🔥", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                PrimaryButton(if (todays != null) "Replay (not scored)" else "Start today's challenge", { nav.navigate("quiz/daily/MEDIUM/daily") }, Modifier.fillMaxWidth())
            }
            Panel(title = "Timed quiz", icon = Icons.Outlined.Timer) {
                ChipRow(listOf("MIXED") + QuizTopic.entries.map { it.name }, vm.topic, { vm.topic = it }, { if (it == "MIXED") "Mixed" else QuizTopic.valueOf(it).label })
                Spacer(Modifier.height(6.dp))
                ChipRow(Difficulty.entries, vm.difficulty, { vm.difficulty = it }, { "${it.label} (${it.seconds / 2}s/question)" })
                Spacer(Modifier.height(10.dp))
                PrimaryButton("Start 10-question sprint", { nav.navigate("quiz/${vm.topic}/${vm.difficulty.name}/timed") }, Modifier.fillMaxWidth(), icon = Icons.Outlined.Bolt)
            }
            Panel(title = "Your stats", icon = Icons.Outlined.Insights, trailing = { TextButton(onClick = { nav.navigate("achievements") }) { Text("Trophies ${ach.size}/${Achievements.all.size}") } }) {
                val total = quizzes.sumOf { it.total }; val right = quizzes.sumOf { it.score }
                KeyValue("Quizzes taken", quizzes.size.toString()); KeyValue("Questions answered", total.toString())
                KeyValue("Accuracy", if (total == 0) "—" else "${(100.0 * right / total).roundToInt()}%"); KeyValue("Daily challenges", quizzes.count { it.daily }.toString())
                KeyValue("Perfect scores", quizzes.count { it.score == it.total }.toString())
            }
            if (quizzes.isNotEmpty()) {
                SectionTitle("Recent")
                quizzes.take(15).forEach { q ->
                    ListItem(headlineContent = { Text(if (q.daily) "Daily challenge" else if (q.topic == "MIXED") "Mixed" else runCatching { QuizTopic.valueOf(q.topic).label }.getOrDefault(q.topic)) },
                        supportingContent = { Text("${q.difficulty.lowercase().replaceFirstChar { it.uppercase() }} · ${q.seconds}s · ${DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(q.timestamp))}") },
                        trailingContent = { Text("${q.score}/${q.total}", style = MaterialTheme.typography.titleMedium.copy(fontFamily = MonoFamily), color = if (q.score == q.total) lab.success else MaterialTheme.colorScheme.onSurface) })
                }
            }
        }
    }
}

// =============================== Settings ===============================

class SettingsViewModel(val c: AppContainer) : ViewModel() {
    fun update(t: (AppSettings) -> AppSettings) = viewModelScope.launch { c.settingsRepo.update(t) }
    fun backup(ctx: android.content.Context, uri: Uri) = viewModelScope.launch {
        runCatching { val json = c.backup.exportAll(); withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(json.toByteArray()) } } }
            .onSuccess { c.messages.emit("Backup saved") }.onFailure { c.messages.emit("Backup failed: ${it.message}") }
    }
    fun restore(ctx: android.content.Context, uri: Uri) = viewModelScope.launch {
        runCatching { val text = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() } }; c.backup.restoreAll(text) }
            .onSuccess { c.messages.emit("Restored: ${it.notes} notes, ${it.history} history entries, ${it.lessons} lessons, ${it.quizzes} quizzes") }
            .onFailure { c.messages.emit("Restore failed: ${it.message}") }
    }
    fun clearHistory() = viewModelScope.launch { c.db.history().clear(); c.messages.emit("History cleared") }
    fun resetProgress() = viewModelScope.launch { c.db.progress().clearLessons(); c.db.progress().clearQuizzes(); c.db.progress().clearAchievements(); c.messages.emit("Learning progress reset") }
}

@Composable
fun SettingsScreen(nav: NavHostController) {
    val vm = appViewModel { SettingsViewModel(it) }
    val s by vm.c.settings.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    var confirm by remember { mutableStateOf<String?>(null) }
    val backupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { it?.let { u -> vm.backup(ctx, u) } }
    val restoreLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { u -> vm.restore(ctx, u) } }
    Column(Modifier.fillMaxSize()) {
        LabTopBar("Settings", onBack = { nav.popBackStack() })
        ScreenColumn {
            Panel(title = "Appearance", icon = Icons.Outlined.Palette) {
                Text("Theme", style = MaterialTheme.typography.labelLarge)
                ChipRow(ThemeMode.entries, s.theme, { t -> vm.update { it.copy(theme = t) } }, { it.label })
                Spacer(Modifier.height(8.dp))
                Text("Accent", style = MaterialTheme.typography.labelLarge)
                ChipRow(Accent.entries, s.accent, { a -> vm.update { it.copy(accent = a) } }, { it.label })
                Spacer(Modifier.height(8.dp))
                Text("Text size ${(s.fontScale * 100).roundToInt()}%", style = MaterialTheme.typography.labelLarge)
                Slider(s.fontScale, { v -> vm.update { it.copy(fontScale = (v * 20).roundToInt() / 20f) } }, valueRange = 0.8f..1.4f, steps = 11)
                SwitchRow("High contrast", s.highContrast, { v -> vm.update { it.copy(highContrast = v) } })
                SwitchRow("Reduce motion", s.reduceMotion, { v -> vm.update { it.copy(reduceMotion = v) } }, "Disables screen transitions and auto-playing animations")
            }
            Panel(title = "Calculation", icon = Icons.Outlined.Calculate) {
                SwitchRow("Degrees", s.degrees, { v -> vm.update { it.copy(degrees = v) } }, "Angle unit for trig functions (calculator, graph, complex)")
                Text("Precision: ${s.precision} significant digits", style = MaterialTheme.typography.labelLarge)
                Slider(s.precision.toFloat(), { v -> vm.update { it.copy(precision = v.roundToInt()) } }, valueRange = 8f..100f)
                Text("Number format", style = MaterialTheme.typography.labelLarge)
                ChipRow(listOf("AUTO", "PLAIN", "SCIENTIFIC", "ENGINEERING"), s.numberStyle, { v -> vm.update { it.copy(numberStyle = v) } }, { it.lowercase().replaceFirstChar { c -> c.uppercase() } })
                SwitchRow("Digit grouping", s.grouping, { v -> vm.update { it.copy(grouping = v) } }, "1 234 567.89")
                SwitchRow("Show exact results", s.exactResults, { v -> vm.update { it.copy(exactResults = v) } }, "Fractions and radicals alongside decimals")
                SwitchRow("Show solution steps", s.showSteps, { v -> vm.update { it.copy(showSteps = v) } })
                Text("Graph quality", style = MaterialTheme.typography.labelLarge)
                ChipRow(GraphQuality.entries, s.graphQuality, { q -> vm.update { it.copy(graphQuality = q) } }, { it.label })
            }
            Panel(title = "Behaviour", icon = Icons.Outlined.Tune) {
                SwitchRow("Haptic feedback", s.haptics, { v -> vm.update { it.copy(haptics = v) } })
                SwitchRow("Keep history", s.keepHistory, { v -> vm.update { it.copy(keepHistory = v) } }, "Stored only on this device")
                Text("History limit: ${s.historyLimit} entries", style = MaterialTheme.typography.labelLarge)
                Slider(s.historyLimit.toFloat(), { v -> vm.update { it.copy(historyLimit = (v / 50).roundToInt() * 50) } }, valueRange = 50f..2000f)
                OutlinedButton(onClick = { confirm = "history" }) { Text("Clear history") }
            }
            Panel(title = "Backup & restore", icon = Icons.Outlined.Backup) {
                Text("Everything stays on your device. A backup is a JSON file with settings, history, notebook, graph projects and learning progress.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = { backupLauncher.launch("quantumath-backup-${ProgressRepository.dayKey(ProgressRepository.today())}.json") }, Modifier.weight(1f)) { Text("Back up…") }
                    OutlinedButton(onClick = { confirm = "restore" }, Modifier.weight(1f)) { Text("Restore…") }
                }
                TextButton(onClick = { confirm = "progress" }) { Text("Reset learning progress", color = MaterialTheme.colorScheme.error) }
            }
            Panel(title = "About", icon = Icons.Outlined.Info) {
                KeyValue("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                KeyValue("Works offline", "Yes — no account, no network permission", mono = false)
                Text("Quantumath evaluates expressions with its own parser (no code execution). Exact arithmetic uses arbitrary-size rationals; the calculator uses BigDecimal at the selected precision; graphs and numerical methods use double precision. Where a result is numerical rather than exact, it is labelled.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    confirm?.let { what ->
        AlertDialog(onDismissRequest = { confirm = null }, title = { Text(when (what) { "history" -> "Clear history?"; "restore" -> "Restore a backup?"; else -> "Reset progress?" }) },
            text = { Text(when (what) { "history" -> "All history entries will be deleted."; "restore" -> "Restoring replaces ALL current data (notebook, history, progress, settings) with the backup's contents."; else -> "Lesson completion, quiz results and achievements will be deleted." }) },
            confirmButton = { TextButton(onClick = { when (what) { "history" -> vm.clearHistory(); "restore" -> restoreLauncher.launch(arrayOf("application/json", "text/plain", "*/*")); else -> vm.resetProgress() }; confirm = null }) { Text("Continue") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } })
    }
}
