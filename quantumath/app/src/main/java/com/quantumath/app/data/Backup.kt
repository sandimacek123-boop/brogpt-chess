package com.quantumath.app.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class BackupFile(
    val format: String = FORMAT,
    val version: Int = 1,
    val createdAt: Long = System.currentTimeMillis(),
    val settings: AppSettings? = null,
    val history: List<HistoryEntry> = emptyList(),
    val folders: List<Folder> = emptyList(),
    val notes: List<Note> = emptyList(),
    val favorites: List<Favorite> = emptyList(),
    val lessons: List<LessonProgress> = emptyList(),
    val quizzes: List<QuizResult> = emptyList(),
    val achievements: List<AchievementUnlock> = emptyList(),
    val graphs: List<GraphProject> = emptyList(),
) { companion object { const val FORMAT = "quantumath-backup" } }

@Serializable
data class NotebookExport(val format: String = FORMAT, val version: Int = 1, val folders: List<Folder>, val notes: List<Note>) {
    companion object { const val FORMAT = "quantumath-notebook" }
}

class BackupManager(private val db: AppDatabase, private val settings: SettingsRepository) {
    val json = Json { ignoreUnknownKeys = true; prettyPrint = true; encodeDefaults = true }

    suspend fun exportAll(): String = json.encodeToString(BackupFile.serializer(), BackupFile(
        settings = settings.settings.first(),
        history = db.history().all(), folders = db.notebook().allFolders(), notes = db.notebook().allNotes(),
        favorites = db.favorites().list(), lessons = db.progress().allLessons(), quizzes = db.progress().allQuizzes(),
        achievements = db.progress().allAchievements(), graphs = db.graphs().all(),
    ))

    data class ImportSummary(val notes: Int, val history: Int, val lessons: Int, val quizzes: Int)

    /** Replaces all local data with the backup. Throws IllegalArgumentException on an invalid file. */
    suspend fun restoreAll(text: String): ImportSummary {
        val b = try { json.decodeFromString(BackupFile.serializer(), text) } catch (e: Exception) { throw IllegalArgumentException("This file is not a Quantumath backup (${e.message?.take(80)})") }
        require(b.format == BackupFile.FORMAT) { "This file is not a Quantumath backup" }
        require(b.version <= 1) { "This backup was made by a newer version of Quantumath" }
        db.withTransaction {
            db.history().clear(); db.notebook().clearNotes(); db.notebook().clearFolders(); db.favorites().clear()
            db.progress().clearLessons(); db.progress().clearQuizzes(); db.progress().clearAchievements(); db.graphs().clear()
            db.history().insertAll(b.history); db.notebook().insertFolders(b.folders)
            val folderIds = b.folders.map { it.id }.toSet()
            db.notebook().insertNotes(b.notes.map { if (it.folderId != null && it.folderId !in folderIds) it.copy(folderId = null) else it })
            db.favorites().insertAll(b.favorites); db.progress().insertLessons(b.lessons); db.progress().insertQuizzes(b.quizzes)
            db.progress().insertAchievements(b.achievements); db.graphs().insertAll(b.graphs)
        }
        b.settings?.let { settings.replace(it) }
        return ImportSummary(b.notes.size, b.history.size, b.lessons.size, b.quizzes.size)
    }

    suspend fun exportNotebook(): String = json.encodeToString(NotebookExport.serializer(), NotebookExport(folders = db.notebook().allFolders(), notes = db.notebook().allNotes()))

    /** Merges notebook entries from a file (new ids are assigned; folders matched by name). */
    suspend fun importNotebook(text: String): Int {
        val ex = try { json.decodeFromString(NotebookExport.serializer(), text) } catch (e: Exception) {
            // also accept a full backup
            val b = try { json.decodeFromString(BackupFile.serializer(), text) } catch (_: Exception) { throw IllegalArgumentException("Not a Quantumath notebook file") }
            NotebookExport(folders = b.folders, notes = b.notes)
        }
        require(ex.format == NotebookExport.FORMAT || ex.format == BackupFile.FORMAT || ex.notes.isNotEmpty()) { "Not a Quantumath notebook file" }
        var count = 0
        db.withTransaction {
            val existing = db.notebook().allFolders().associateBy { it.name }
            val map = HashMap<Long, Long>()
            for (f in ex.folders) map[f.id] = existing[f.name]?.id ?: db.notebook().insertFolder(Folder(name = f.name))
            for (n in ex.notes) { db.notebook().insert(n.copy(id = 0, folderId = n.folderId?.let { map[it] })); count++ }
        }
        return count
    }
}
