package dev.universe.engine.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Everything the app remembers between launches. */
data class Prefs(
    val haptics: Boolean = true,
    val reduceMotion: Boolean = false,
    val keepAwake: Boolean = true,
    /** 0 = eco, 1 = balanced, 2 = ultra. Scales particle counts and render resolution. */
    val quality: Int = 1,
    val discovered: Set<String> = emptySet(),
    val visited: Set<String> = emptySet(),
    val favorites: Set<String> = emptySet(),
    val lastLab: String = "",
    val grapherExpr: String = "",
) {
    /** Multiplier for particle counts / resolution derived from [quality]. */
    val q: Float get() = when (quality) { 0 -> 0.6f; 2 -> 1.5f; else -> 1f }
}

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "universe_engine")

class SettingsStore(private val context: Context) {
    private object K {
        val haptics = booleanPreferencesKey("haptics")
        val reduceMotion = booleanPreferencesKey("reduce_motion")
        val keepAwake = booleanPreferencesKey("keep_awake")
        val quality = intPreferencesKey("quality")
        val discovered = stringSetPreferencesKey("discovered")
        val visited = stringSetPreferencesKey("visited")
        val favorites = stringSetPreferencesKey("favorites")
        val lastLab = stringPreferencesKey("last_lab")
        val grapherExpr = stringPreferencesKey("grapher_expr")
    }

    val prefs: Flow<Prefs> = context.dataStore.data.map { p ->
        Prefs(
            haptics = p[K.haptics] ?: true,
            reduceMotion = p[K.reduceMotion] ?: false,
            keepAwake = p[K.keepAwake] ?: true,
            quality = p[K.quality] ?: 1,
            discovered = p[K.discovered] ?: emptySet(),
            visited = p[K.visited] ?: emptySet(),
            favorites = p[K.favorites] ?: emptySet(),
            lastLab = p[K.lastLab] ?: "",
            grapherExpr = p[K.grapherExpr] ?: "",
        )
    }

    suspend fun save(v: Prefs) {
        context.dataStore.edit { p ->
            p[K.haptics] = v.haptics
            p[K.reduceMotion] = v.reduceMotion
            p[K.keepAwake] = v.keepAwake
            p[K.quality] = v.quality
            p[K.discovered] = v.discovered
            p[K.visited] = v.visited
            p[K.favorites] = v.favorites
            p[K.lastLab] = v.lastLab
            p[K.grapherExpr] = v.grapherExpr
        }
    }
}
