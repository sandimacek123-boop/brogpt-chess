package com.quantumath.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

/** Kinds of tool results that can be saved / reopened. The value maps to a navigation route. */
object Kind {
    const val CALC = "calc"; const val SOLVE = "solve"; const val ALGEBRA = "algebra"; const val CALCULUS = "calculus"
    const val GRAPH = "graph"; const val MATRIX = "matrix"; const val STATS = "stats"; const val NUMBER = "number"
    const val COMPLEX = "complex"; const val GEOMETRY = "geometry"; const val TRIG = "trig"; const val NOTE = "note"
    const val FORMULA = "formula"; const val LESSON = "lesson"; const val TOOL = "tool"
}

@Serializable
@Entity(tableName = "history", indices = [Index("timestamp")])
data class HistoryEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val kind: String,
    val input: String,
    val result: String,
    val timestamp: Long = System.currentTimeMillis(),
    val favorite: Boolean = false,
)

@Serializable
@Entity(tableName = "folders")
data class Folder(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val createdAt: Long = System.currentTimeMillis(),
)

@Serializable
@Entity(tableName = "notes", indices = [Index("folderId"), Index("updatedAt")])
data class Note(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val folderId: Long? = null,
    val title: String,
    val kind: String,
    val input: String,
    val result: String,
    val body: String = "",
    val favorite: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
)

@Serializable
@Entity(tableName = "favorites")
data class Favorite(
    /** e.g. "formula:Quadratic formula", "lesson:limits", "tool:matrix" */
    @PrimaryKey val key: String,
    val kind: String,
    val title: String,
    val payload: String = "",
    val createdAt: Long = System.currentTimeMillis(),
)

@Serializable
@Entity(tableName = "lesson_progress")
data class LessonProgress(
    @PrimaryKey val lessonId: String,
    val completed: Boolean = false,
    val solvedExercises: Int = 0,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Serializable
@Entity(tableName = "quiz_results", indices = [Index("dayKey")])
data class QuizResult(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val topic: String,
    val difficulty: String,
    val score: Int,
    val total: Int,
    val seconds: Int,
    val timed: Boolean,
    val daily: Boolean,
    /** yyyymmdd for daily challenges, 0 otherwise */
    val dayKey: Long = 0,
    val timestamp: Long = System.currentTimeMillis(),
)

@Serializable
@Entity(tableName = "achievements")
data class AchievementUnlock(
    @PrimaryKey val id: String,
    val unlockedAt: Long = System.currentTimeMillis(),
)

@Serializable
data class GraphFunction(
    val text: String,
    /** "y" (y = f(x)), "param" ("x(t); y(t)"), "polar" (r(θ)) */
    val type: String = "y",
    val color: Int,
    val visible: Boolean = true,
    val tMin: Double = 0.0,
    val tMax: Double = 6.283185307179586,
)

@Serializable
@Entity(tableName = "graph_projects")
data class GraphProject(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val functionsJson: String,
    val xMin: Double, val xMax: Double, val yMin: Double, val yMax: Double,
    val updatedAt: Long = System.currentTimeMillis(),
)
