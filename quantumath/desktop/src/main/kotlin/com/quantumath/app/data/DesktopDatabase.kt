package com.quantumath.app.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Desktop implementation of the app's DAO interfaces: all tables live in memory and are written to a
 * single JSON file after every change (atomic replace). Query semantics mirror the Room SQL in Daos.kt.
 * [file] = null gives an in-memory database (tests).
 */
class DesktopDatabase(private val file: File?) : AppDatabase() {
    @Serializable
    private data class Snapshot(
        val version: Int = 1,
        val history: List<HistoryEntry> = emptyList(), val folders: List<Folder> = emptyList(), val notes: List<Note> = emptyList(),
        val favorites: List<Favorite> = emptyList(), val lessons: List<LessonProgress> = emptyList(), val quizzes: List<QuizResult> = emptyList(),
        val achievements: List<AchievementUnlock> = emptyList(), val graphs: List<GraphProject> = emptyList(),
    )

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val lock = Any()
    private val txMutex = Mutex()
    @Volatile private var inTransaction = false

    private val history = MutableStateFlow<List<HistoryEntry>>(emptyList())
    private val folders = MutableStateFlow<List<Folder>>(emptyList())
    private val notes = MutableStateFlow<List<Note>>(emptyList())
    private val favorites = MutableStateFlow<List<Favorite>>(emptyList())
    private val lessons = MutableStateFlow<List<LessonProgress>>(emptyList())
    private val quizzes = MutableStateFlow<List<QuizResult>>(emptyList())
    private val achievements = MutableStateFlow<List<AchievementUnlock>>(emptyList())
    private val graphs = MutableStateFlow<List<GraphProject>>(emptyList())

    init {
        val f = file
        if (f != null && f.exists()) {
            runCatching { json.decodeFromString(Snapshot.serializer(), f.readText()) }.onSuccess { s ->
                history.value = s.history; folders.value = s.folders; notes.value = s.notes; favorites.value = s.favorites
                lessons.value = s.lessons; quizzes.value = s.quizzes; achievements.value = s.achievements; graphs.value = s.graphs
            }.onFailure {
                // keep a copy of an unreadable file instead of silently overwriting it
                runCatching { f.copyTo(File(f.parentFile, f.name + ".corrupt-" + System.currentTimeMillis()), overwrite = false) }
            }
        }
    }

    private fun persist() {
        val file = file
        if (file == null || inTransaction) return
        val text = json.encodeToString(Snapshot.serializer(), Snapshot(1, history.value, folders.value, notes.value, favorites.value, lessons.value, quizzes.value, achievements.value, graphs.value))
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(text)
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    private fun <T> mutate(flow: MutableStateFlow<List<T>>, f: (List<T>) -> List<T>) = synchronized(lock) { flow.value = f(flow.value); persist() }
    private fun <T> nextId(list: List<T>, id: (T) -> Long) = (list.maxOfOrNull(id) ?: 0L) + 1
    /** Insert-or-replace by key, preserving insertion order otherwise. */
    private fun <T, K> upsert(list: List<T>, item: T, key: (T) -> K): List<T> = list.filterNot { key(it) == key(item) } + item

    override fun clearAllTables() = synchronized(lock) {
        history.value = emptyList(); folders.value = emptyList(); notes.value = emptyList(); favorites.value = emptyList()
        lessons.value = emptyList(); quizzes.value = emptyList(); achievements.value = emptyList(); graphs.value = emptyList()
        persist()
    }

    override suspend fun <R> runInTransaction(block: suspend () -> R): R = txMutex.withLock {
        val backup = synchronized(lock) { listOf(history.value, folders.value, notes.value, favorites.value, lessons.value, quizzes.value, achievements.value, graphs.value) }
        inTransaction = true
        try {
            val r = block()
            inTransaction = false
            synchronized(lock) { persist() }
            r
        } catch (e: Throwable) {
            @Suppress("UNCHECKED_CAST")
            synchronized(lock) { // roll back
                history.value = backup[0] as List<HistoryEntry>; folders.value = backup[1] as List<Folder>; notes.value = backup[2] as List<Note>
                favorites.value = backup[3] as List<Favorite>; lessons.value = backup[4] as List<LessonProgress>; quizzes.value = backup[5] as List<QuizResult>
                achievements.value = backup[6] as List<AchievementUnlock>; graphs.value = backup[7] as List<GraphProject>
            }
            inTransaction = false
            throw e
        }
    }

    private fun String.like(q: String) = contains(q, ignoreCase = true)

    private val historyDao = object : HistoryDao {
        override fun recent(limit: Int): Flow<List<HistoryEntry>> = history.map { l -> l.sortedByDescending { it.timestamp }.take(limit) }
        override fun byKind(kind: String, limit: Int): Flow<List<HistoryEntry>> = history.map { l -> l.filter { it.kind == kind }.sortedByDescending { it.timestamp }.take(limit) }
        override fun favorites(): Flow<List<HistoryEntry>> = history.map { l -> l.filter { it.favorite }.sortedByDescending { it.timestamp } }
        override suspend fun search(q: String) = history.value.filter { it.input.like(q) || it.result.like(q) }.sortedByDescending { it.timestamp }.take(30)
        override suspend fun insert(e: HistoryEntry): Long = synchronized(lock) {
            val id = if (e.id == 0L) nextId(history.value) { it.id } else e.id
            mutate(history) { upsert(it, e.copy(id = id)) { x -> x.id } }; id
        }
        override suspend fun update(e: HistoryEntry) = mutate(history) { l -> l.map { if (it.id == e.id) e else it } }
        override suspend fun delete(e: HistoryEntry) = mutate(history) { l -> l.filterNot { it.id == e.id } }
        override suspend fun clear() = mutate(history) { emptyList() }
        override suspend fun trim(keep: Int) = mutate(history) { l ->
            val newest = l.sortedByDescending { it.timestamp }.take(keep).map { it.id }.toSet()
            l.filter { it.favorite || it.id in newest }
        }
        override suspend fun count() = history.value.size
        override suspend fun all() = history.value
        override suspend fun insertAll(e: List<HistoryEntry>) = mutate(history) { l -> e.fold(l) { acc, x -> upsert(acc, x) { it.id } } }
    }

    private val notebookDao = object : NotebookDao {
        override fun notes(): Flow<List<Note>> = notes.map { l -> l.sortedByDescending { it.updatedAt } }
        override fun folders(): Flow<List<Folder>> = folders.map { l -> l.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name }) }
        override suspend fun note(id: Long) = notes.value.firstOrNull { it.id == id }
        override suspend fun search(q: String) = notes.value.filter { it.title.like(q) || it.input.like(q) || it.body.like(q) }.sortedByDescending { it.updatedAt }.take(30)
        override suspend fun insert(n: Note): Long = synchronized(lock) {
            val id = if (n.id == 0L) nextId(notes.value) { it.id } else n.id
            mutate(notes) { upsert(it, n.copy(id = id)) { x -> x.id } }; id
        }
        override suspend fun update(n: Note) = mutate(notes) { l -> l.map { if (it.id == n.id) n else it } }
        override suspend fun delete(n: Note) = mutate(notes) { l -> l.filterNot { it.id == n.id } }
        override suspend fun insertFolder(f: Folder): Long = synchronized(lock) {
            val id = if (f.id == 0L) nextId(folders.value) { it.id } else f.id
            mutate(folders) { upsert(it, f.copy(id = id)) { x -> x.id } }; id
        }
        override suspend fun updateFolder(f: Folder) = mutate(folders) { l -> l.map { if (it.id == f.id) f else it } }
        override suspend fun unfileFolder(id: Long) = mutate(notes) { l -> l.map { if (it.folderId == id) it.copy(folderId = null) else it } }
        override suspend fun deleteFolderRow(id: Long) = mutate(folders) { l -> l.filterNot { it.id == id } }
        override suspend fun count() = notes.value.size
        override suspend fun allNotes() = notes.value
        override suspend fun allFolders() = folders.value
        override suspend fun insertNotes(n: List<Note>) = mutate(notes) { l -> n.fold(l) { acc, x -> upsert(acc, x) { it.id } } }
        override suspend fun insertFolders(f: List<Folder>) = mutate(folders) { l -> f.fold(l) { acc, x -> upsert(acc, x) { it.id } } }
        override suspend fun clearNotes() = mutate(notes) { emptyList() }
        override suspend fun clearFolders() = mutate(folders) { emptyList() }
    }

    private val favoriteDao = object : FavoriteDao {
        override fun all(): Flow<List<Favorite>> = favorites.map { l -> l.sortedByDescending { it.createdAt } }
        override fun keys(): Flow<List<String>> = favorites.map { l -> l.map { it.key } }
        override suspend fun insert(f: Favorite) = mutate(favorites) { upsert(it, f) { x -> x.key } }
        override suspend fun delete(key: String) = mutate(favorites) { l -> l.filterNot { it.key == key } }
        override suspend fun list() = favorites.value
        override suspend fun insertAll(f: List<Favorite>) = mutate(favorites) { l -> f.fold(l) { acc, x -> upsert(acc, x) { it.key } } }
        override suspend fun clear() = mutate(favorites) { emptyList() }
    }

    private val progressDao = object : ProgressDao {
        override fun lessons(): Flow<List<LessonProgress>> = lessons
        override suspend fun upsertLesson(p: LessonProgress) = mutate(lessons) { upsert(it, p) { x -> x.lessonId } }
        override suspend fun lesson(id: String) = lessons.value.firstOrNull { it.lessonId == id }
        override fun quizzes(): Flow<List<QuizResult>> = quizzes.map { l -> l.sortedByDescending { it.timestamp } }
        override suspend fun insertQuiz(r: QuizResult): Long = synchronized(lock) {
            val id = if (r.id == 0L) nextId(quizzes.value) { it.id } else r.id
            mutate(quizzes) { upsert(it, r.copy(id = id)) { x -> x.id } }; id
        }
        override suspend fun dailyResults() = quizzes.value.filter { it.daily }.sortedByDescending { it.dayKey }
        override suspend fun totalCorrect() = quizzes.value.sumOf { it.score }
        override fun achievements(): Flow<List<AchievementUnlock>> = achievements
        override suspend fun unlock(a: AchievementUnlock): Long = synchronized(lock) {
            if (achievements.value.any { it.id == a.id }) -1L else { mutate(achievements) { it + a }; achievements.value.size.toLong() }
        }
        override suspend fun allLessons() = lessons.value
        override suspend fun allQuizzes() = quizzes.value
        override suspend fun allAchievements() = achievements.value
        override suspend fun insertLessons(l: List<LessonProgress>) = mutate(lessons) { cur -> l.fold(cur) { acc, x -> upsert(acc, x) { it.lessonId } } }
        override suspend fun insertQuizzes(l: List<QuizResult>) = mutate(quizzes) { cur -> l.fold(cur) { acc, x -> upsert(acc, x) { it.id } } }
        override suspend fun insertAchievements(l: List<AchievementUnlock>) = mutate(achievements) { cur -> l.fold(cur) { acc, x -> upsert(acc, x) { it.id } } }
        override suspend fun clearLessons() = mutate(lessons) { emptyList() }
        override suspend fun clearQuizzes() = mutate(quizzes) { emptyList() }
        override suspend fun clearAchievements() = mutate(achievements) { emptyList() }
    }

    private val graphDao = object : GraphDao {
        override fun projects(): Flow<List<GraphProject>> = graphs.map { l -> l.sortedByDescending { it.updatedAt } }
        override suspend fun upsert(p: GraphProject): Long = synchronized(lock) {
            val id = if (p.id == 0L) nextId(graphs.value) { it.id } else p.id
            mutate(graphs) { upsert(it, p.copy(id = id)) { x -> x.id } }; id
        }
        override suspend fun delete(p: GraphProject) = mutate(graphs) { l -> l.filterNot { it.id == p.id } }
        override suspend fun all() = graphs.value
        override suspend fun insertAll(p: List<GraphProject>) = mutate(graphs) { l -> p.fold(l) { acc, x -> upsert(acc, x) { it.id } } }
        override suspend fun clear() = mutate(graphs) { emptyList() }
    }

    override fun history(): HistoryDao = historyDao
    override fun notebook(): NotebookDao = notebookDao
    override fun favorites(): FavoriteDao = favoriteDao
    override fun progress(): ProgressDao = progressDao
    override fun graphs(): GraphDao = graphDao
}
