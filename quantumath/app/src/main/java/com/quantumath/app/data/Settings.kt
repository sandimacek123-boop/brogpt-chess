package com.quantumath.app.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable

enum class ThemeMode(val label: String) { DARK("Dark"), LIGHT("Light"), SYSTEM("System") }
enum class Accent(val label: String, val argb: Long, val argb2: Long) {
    VIOLET("Violet", 0xFF9D7BFF, 0xFF4FD8FF), CYAN("Cyan", 0xFF4FD8FF, 0xFF9D7BFF), EMERALD("Emerald", 0xFF3DDC97, 0xFF4FD8FF),
    AMBER("Amber", 0xFFFFB547, 0xFFFF6B8B), ROSE("Rose", 0xFFFF6B8B, 0xFF9D7BFF),
}
enum class GraphQuality(val label: String, val factor: Double) { LOW("Fast", 0.5), NORMAL("Balanced", 1.0), HIGH("Precise", 2.0) }

@Serializable
data class AppSettings(
    val theme: ThemeMode = ThemeMode.DARK,
    val accent: Accent = Accent.VIOLET,
    val degrees: Boolean = false,
    val precision: Int = 16,
    val numberStyle: String = "AUTO",
    val grouping: Boolean = false,
    val fontScale: Float = 1f,
    val graphQuality: GraphQuality = GraphQuality.NORMAL,
    val showSteps: Boolean = true,
    val haptics: Boolean = true,
    val keepHistory: Boolean = true,
    val historyLimit: Int = 500,
    val reduceMotion: Boolean = false,
    val highContrast: Boolean = false,
    val exactResults: Boolean = true,
)

class SettingsRepository(private val store: DataStore<Preferences>) {
    private object K {
        val theme = stringPreferencesKey("theme"); val accent = stringPreferencesKey("accent"); val degrees = booleanPreferencesKey("degrees")
        val precision = intPreferencesKey("precision"); val style = stringPreferencesKey("style"); val grouping = booleanPreferencesKey("grouping")
        val fontScale = floatPreferencesKey("fontScale"); val quality = stringPreferencesKey("quality"); val steps = booleanPreferencesKey("steps")
        val haptics = booleanPreferencesKey("haptics"); val keep = booleanPreferencesKey("keepHistory"); val limit = intPreferencesKey("historyLimit")
        val reduce = booleanPreferencesKey("reduceMotion"); val contrast = booleanPreferencesKey("highContrast"); val exact = booleanPreferencesKey("exact")
    }

    private inline fun <reified E : Enum<E>> en(v: String?, d: E): E = v?.let { s -> enumValues<E>().firstOrNull { it.name == s } } ?: d

    val settings: Flow<AppSettings> = store.data.catch { emit(emptyPreferences()) }.map { p ->
        val d = AppSettings()
        AppSettings(
            theme = en(p[K.theme], d.theme), accent = en(p[K.accent], d.accent), degrees = p[K.degrees] ?: d.degrees,
            precision = (p[K.precision] ?: d.precision).coerceIn(8, 100), numberStyle = p[K.style] ?: d.numberStyle,
            grouping = p[K.grouping] ?: d.grouping, fontScale = (p[K.fontScale] ?: d.fontScale).coerceIn(0.8f, 1.4f),
            graphQuality = en(p[K.quality], d.graphQuality), showSteps = p[K.steps] ?: d.showSteps, haptics = p[K.haptics] ?: d.haptics,
            keepHistory = p[K.keep] ?: d.keepHistory, historyLimit = p[K.limit] ?: d.historyLimit, reduceMotion = p[K.reduce] ?: d.reduceMotion,
            highContrast = p[K.contrast] ?: d.highContrast, exactResults = p[K.exact] ?: d.exactResults,
        )
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        store.edit { p ->
            val cur = AppSettings(
                theme = en(p[K.theme], ThemeMode.DARK), accent = en(p[K.accent], Accent.VIOLET), degrees = p[K.degrees] ?: false,
                precision = p[K.precision] ?: 16, numberStyle = p[K.style] ?: "AUTO", grouping = p[K.grouping] ?: false,
                fontScale = p[K.fontScale] ?: 1f, graphQuality = en(p[K.quality], GraphQuality.NORMAL), showSteps = p[K.steps] ?: true,
                haptics = p[K.haptics] ?: true, keepHistory = p[K.keep] ?: true, historyLimit = p[K.limit] ?: 500,
                reduceMotion = p[K.reduce] ?: false, highContrast = p[K.contrast] ?: false, exactResults = p[K.exact] ?: true,
            )
            write(p, transform(cur))
        }
    }

    private fun write(p: MutablePreferences, s: AppSettings) {
        p[K.theme] = s.theme.name; p[K.accent] = s.accent.name; p[K.degrees] = s.degrees; p[K.precision] = s.precision.coerceIn(8, 100)
        p[K.style] = s.numberStyle; p[K.grouping] = s.grouping; p[K.fontScale] = s.fontScale; p[K.quality] = s.graphQuality.name
        p[K.steps] = s.showSteps; p[K.haptics] = s.haptics; p[K.keep] = s.keepHistory; p[K.limit] = s.historyLimit
        p[K.reduce] = s.reduceMotion; p[K.contrast] = s.highContrast; p[K.exact] = s.exactResults
    }

    suspend fun replace(s: AppSettings) = store.edit { write(it, s) }
}
