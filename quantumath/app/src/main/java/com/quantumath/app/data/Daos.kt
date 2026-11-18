package com.quantumath.app.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface HistoryDao {
    @Query("SELECT * FROM history ORDER BY timestamp DESC LIMIT :limit") fun recent(limit: Int = 500): Flow<List<HistoryEntry>>
    @Query("SELECT * FROM history WHERE kind = :kind ORDER BY timestamp DESC LIMIT :limit") fun byKind(kind: String, limit: Int = 100): Flow<List<HistoryEntry>>
    @Query("SELECT * FROM history WHERE favorite = 1 ORDER BY timestamp DESC") fun favorites(): Flow<List<HistoryEntry>>
    @Query("SELECT * FROM history WHERE input LIKE '%' || :q || '%' OR result LIKE '%' || :q || '%' ORDER BY timestamp DESC LIMIT 30") suspend fun search(q: String): List<HistoryEntry>
    @Insert suspend fun insert(e: HistoryEntry): Long
    @Update suspend fun update(e: HistoryEntry)
    @Delete suspend fun delete(e: HistoryEntry)
    @Query("DELETE FROM history") suspend fun clear()
    @Query("DELETE FROM history WHERE favorite = 0 AND id NOT IN (SELECT id FROM history ORDER BY timestamp DESC LIMIT :keep)") suspend fun trim(keep: Int)
    @Query("SELECT COUNT(*) FROM history") suspend fun count(): Int
    @Query("SELECT * FROM history") suspend fun all(): List<HistoryEntry>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(e: List<HistoryEntry>)
}

@Dao
interface NotebookDao {
    @Query("SELECT * FROM notes ORDER BY updatedAt DESC") fun notes(): Flow<List<Note>>
    @Query("SELECT * FROM folders ORDER BY name COLLATE NOCASE") fun folders(): Flow<List<Folder>>
    @Query("SELECT * FROM notes WHERE id = :id") suspend fun note(id: Long): Note?
    @Query("SELECT * FROM notes WHERE title LIKE '%' || :q || '%' OR input LIKE '%' || :q || '%' OR body LIKE '%' || :q || '%' ORDER BY updatedAt DESC LIMIT 30") suspend fun search(q: String): List<Note>
    @Insert suspend fun insert(n: Note): Long
    @Update suspend fun update(n: Note)
    @Delete suspend fun delete(n: Note)
    @Insert suspend fun insertFolder(f: Folder): Long
    @Update suspend fun updateFolder(f: Folder)
    @Query("UPDATE notes SET folderId = NULL WHERE folderId = :id") suspend fun unfileFolder(id: Long)
    @Query("DELETE FROM folders WHERE id = :id") suspend fun deleteFolderRow(id: Long)
    @Transaction suspend fun deleteFolder(id: Long) { unfileFolder(id); deleteFolderRow(id) }
    @Query("SELECT COUNT(*) FROM notes") suspend fun count(): Int
    @Query("SELECT * FROM notes") suspend fun allNotes(): List<Note>
    @Query("SELECT * FROM folders") suspend fun allFolders(): List<Folder>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertNotes(n: List<Note>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertFolders(f: List<Folder>)
    @Query("DELETE FROM notes") suspend fun clearNotes()
    @Query("DELETE FROM folders") suspend fun clearFolders()
}

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorites ORDER BY createdAt DESC") fun all(): Flow<List<Favorite>>
    @Query("SELECT `key` FROM favorites") fun keys(): Flow<List<String>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(f: Favorite)
    @Query("DELETE FROM favorites WHERE `key` = :key") suspend fun delete(key: String)
    @Query("SELECT * FROM favorites") suspend fun list(): List<Favorite>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(f: List<Favorite>)
    @Query("DELETE FROM favorites") suspend fun clear()
}

@Dao
interface ProgressDao {
    @Query("SELECT * FROM lesson_progress") fun lessons(): Flow<List<LessonProgress>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertLesson(p: LessonProgress)
    @Query("SELECT * FROM lesson_progress WHERE lessonId = :id") suspend fun lesson(id: String): LessonProgress?
    @Query("SELECT * FROM quiz_results ORDER BY timestamp DESC") fun quizzes(): Flow<List<QuizResult>>
    @Insert suspend fun insertQuiz(r: QuizResult): Long
    @Query("SELECT * FROM quiz_results WHERE daily = 1 ORDER BY dayKey DESC") suspend fun dailyResults(): List<QuizResult>
    @Query("SELECT COALESCE(SUM(score), 0) FROM quiz_results") suspend fun totalCorrect(): Int
    @Query("SELECT * FROM achievements") fun achievements(): Flow<List<AchievementUnlock>>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun unlock(a: AchievementUnlock): Long
    @Query("SELECT * FROM lesson_progress") suspend fun allLessons(): List<LessonProgress>
    @Query("SELECT * FROM quiz_results") suspend fun allQuizzes(): List<QuizResult>
    @Query("SELECT * FROM achievements") suspend fun allAchievements(): List<AchievementUnlock>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertLessons(l: List<LessonProgress>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertQuizzes(l: List<QuizResult>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAchievements(l: List<AchievementUnlock>)
    @Query("DELETE FROM lesson_progress") suspend fun clearLessons()
    @Query("DELETE FROM quiz_results") suspend fun clearQuizzes()
    @Query("DELETE FROM achievements") suspend fun clearAchievements()
}

@Dao
interface GraphDao {
    @Query("SELECT * FROM graph_projects ORDER BY updatedAt DESC") fun projects(): Flow<List<GraphProject>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(p: GraphProject): Long
    @Delete suspend fun delete(p: GraphProject)
    @Query("SELECT * FROM graph_projects") suspend fun all(): List<GraphProject>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(p: List<GraphProject>)
    @Query("DELETE FROM graph_projects") suspend fun clear()
}

@Database(
    entities = [HistoryEntry::class, Folder::class, Note::class, Favorite::class, LessonProgress::class, QuizResult::class, AchievementUnlock::class, GraphProject::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun history(): HistoryDao
    abstract fun notebook(): NotebookDao
    abstract fun favorites(): FavoriteDao
    abstract fun progress(): ProgressDao
    abstract fun graphs(): GraphDao

    companion object {
        fun build(context: android.content.Context, inMemory: Boolean = false): AppDatabase =
            (if (inMemory) Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            else Room.databaseBuilder(context, AppDatabase::class.java, "quantumath.db")).build()
    }
}
