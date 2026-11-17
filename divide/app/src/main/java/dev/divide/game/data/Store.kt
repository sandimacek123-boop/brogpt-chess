package dev.divide.game.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/** Settings and progress persisted across launches. */
data class Save(
    val sfx: Float = 0.9f, val music: Float = 0.6f, val haptics: Boolean = true, val reduceFlash: Boolean = false, val hints: Boolean = false,
    val blade: String = "edge", val flashAsked: Boolean = false, val tutorialDone: Boolean = false,
    val best: Map<String, Long> = emptyMap(), val dailyKey: String = "", val dailyBest: Long = 0,
    val codex: Set<String> = emptySet(), val blades: Set<String> = setOf("edge"), val bosses: Set<String> = emptySet(),
    val primesCaught: Long = 0, val totalSliced: Long = 0, val bestCombo: Int = 0, val bestWave: Int = 0, val games: Int = 0, val clangs: Long = 0,
)

private val Context.store: DataStore<Preferences> by preferencesDataStore(name = "divide")

class Store(private val context: Context) {
    private object K {
        val sfx = floatPreferencesKey("sfx"); val music = floatPreferencesKey("music"); val haptics = booleanPreferencesKey("haptics")
        val reduceFlash = booleanPreferencesKey("reduce_flash"); val hints = booleanPreferencesKey("hints"); val blade = stringPreferencesKey("blade")
        val flashAsked = booleanPreferencesKey("flash_asked"); val tutorialDone = booleanPreferencesKey("tutorial_done")
        val best = stringSetPreferencesKey("best"); val dailyKey = stringPreferencesKey("daily_key"); val dailyBest = longPreferencesKey("daily_best")
        val codex = stringSetPreferencesKey("codex"); val blades = stringSetPreferencesKey("blades"); val bosses = stringSetPreferencesKey("bosses")
        val primes = longPreferencesKey("primes"); val sliced = longPreferencesKey("sliced"); val bestCombo = intPreferencesKey("best_combo")
        val bestWave = intPreferencesKey("best_wave"); val games = intPreferencesKey("games"); val clangs = longPreferencesKey("clangs")
    }

    suspend fun load(): Save = runCatching {
        val p = context.store.data.first()
        Save(
            p[K.sfx] ?: 0.9f, p[K.music] ?: 0.6f, p[K.haptics] ?: true, p[K.reduceFlash] ?: false, p[K.hints] ?: false, p[K.blade] ?: "edge",
            p[K.flashAsked] ?: false, p[K.tutorialDone] ?: false,
            (p[K.best] ?: emptySet()).mapNotNull { s -> s.split('=').takeIf { it.size == 2 }?.let { it[0] to (it[1].toLongOrNull() ?: 0L) } }.toMap(),
            p[K.dailyKey] ?: "", p[K.dailyBest] ?: 0, p[K.codex] ?: emptySet(), (p[K.blades] ?: emptySet()) + "edge", p[K.bosses] ?: emptySet(),
            p[K.primes] ?: 0, p[K.sliced] ?: 0, p[K.bestCombo] ?: 0, p[K.bestWave] ?: 0, p[K.games] ?: 0, p[K.clangs] ?: 0,
        )
    }.getOrDefault(Save())

    suspend fun save(s: Save) {
        context.store.edit { p ->
            p[K.sfx] = s.sfx; p[K.music] = s.music; p[K.haptics] = s.haptics; p[K.reduceFlash] = s.reduceFlash; p[K.hints] = s.hints; p[K.blade] = s.blade
            p[K.flashAsked] = s.flashAsked; p[K.tutorialDone] = s.tutorialDone; p[K.best] = s.best.map { "${it.key}=${it.value}" }.toSet()
            p[K.dailyKey] = s.dailyKey; p[K.dailyBest] = s.dailyBest; p[K.codex] = s.codex; p[K.blades] = s.blades; p[K.bosses] = s.bosses
            p[K.primes] = s.primesCaught; p[K.sliced] = s.totalSliced; p[K.bestCombo] = s.bestCombo; p[K.bestWave] = s.bestWave; p[K.games] = s.games; p[K.clangs] = s.clangs
        }
    }
}
