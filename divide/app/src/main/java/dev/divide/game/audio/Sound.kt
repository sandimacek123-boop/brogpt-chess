package dev.divide.game.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Loads the synthesised sounds into a SoundPool and plays the generated music loops with cross-fades. */
class Sound(private val context: Context) {
    enum class Music { None, Menu, Battle, Boss }

    var sfxVolume = 0.9f
    var musicVolume = 0.6f
        set(v) { field = v; players.forEach { (m, p) -> if (m == current) runCatching { p.setVolume(v, v) } } }
    var hapticsOn = true

    private val pool = SoundPool.Builder().setMaxStreams(14).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build()
    private val ids = HashMap<String, Int>()
    private val players = HashMap<Music, MediaPlayer>()
    private var current = Music.None
    @Volatile var ready = false
        private set
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= 31) (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)

    /** Pentatonic notes for prime chimes: consecutive primes climb the scale. */
    private val bellNotes = listOf(62f, 65f, 67f, 69f, 72f, 74f, 77f, 79f, 81f, 84f, 86f, 89f)

    fun prepare(scope: CoroutineScope) = scope.launch(Dispatchers.Default) {
        val dir = File(context.cacheDir, "synth_v3").apply { mkdirs() }
        fun file(name: String, sr: Int = Synth.SR, gen: () -> FloatArray): File { val f = File(dir, "$name.wav"); if (!f.exists() || f.length() < 100) { val tmp = File(dir, "$name.tmp"); Synth.writeWav(tmp, gen(), sr); tmp.renameTo(f) }; return f }
        val sfx = linkedMapOf<String, () -> FloatArray>(
            "slice" to { Synth.slice(1f) }, "slice_hi" to { Synth.slice(1.35f) }, "slice_lo" to { Synth.slice(0.75f) },
            "impact" to { Synth.impact(0.6f) }, "impact_big" to { Synth.impact(1.4f) }, "clang" to { Synth.clang() }, "tick" to { Synth.tick() },
            "boss_down" to { Synth.bossDown() }, "riser" to { Synth.riser(0.9) }, "power" to { Synth.arpeggio(listOf(74f, 77f, 81f, 86f, 89f), 0.06) },
            "gameover" to { Synth.gameOver() }, "breach" to { Synth.impact(1.0f) },
        )
        bellNotes.forEachIndexed { i, m -> sfx["bell$i"] = { Synth.bell(m) } }
        for ((name, gen) in sfx) { val f = file(name, gen = gen); ids[name] = pool.load(f.absolutePath, 1) }
        ready = true
        val menu = file("music_menu", 32000) { Synth.menuLoop() }
        val battle = file("music_battle", 32000) { Synth.battleLoop(0) }
        val boss = file("music_boss", 32000) { Synth.battleLoop(1) }
        withContext(Dispatchers.Main) {
            for ((m, f) in listOf(Music.Menu to menu, Music.Battle to battle, Music.Boss to boss)) runCatching {
                players[m] = MediaPlayer().apply { setDataSource(f.absolutePath); isLooping = true; setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()); prepare(); setVolume(0f, 0f) }
            }
            val want = current; current = Music.None; music(want)
        }
    }

    fun play(name: String, vol: Float = 1f, rate: Float = 1f) {
        val id = ids[name] ?: return
        val v = (vol * sfxVolume).coerceIn(0f, 1f)
        if (v > 0f) pool.play(id, v, v, 1, 0, rate.coerceIn(0.5f, 2f))
    }

    fun bell(index: Int) = play("bell${((index % 12) + 12) % 12}", 0.7f)

    fun music(m: Music) {
        if (m == current && (m == Music.None || players[m]?.isPlaying == true)) return
        players[current]?.let { runCatching { it.pause() } }
        current = m
        players[m]?.let { runCatching { it.seekTo(0); it.setVolume(musicVolume, musicVolume); it.start() } }
    }

    fun pause() { players[current]?.let { runCatching { if (it.isPlaying) it.pause() } } }
    fun resume() { players[current]?.let { runCatching { it.setVolume(musicVolume, musicVolume); it.start() } } }

    fun buzz(kind: Int) {
        if (!hapticsOn) return
        val v = vibrator ?: return
        runCatching {
            v.vibrate(when (kind) {
                0 -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                1 -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                2 -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                else -> VibrationEffect.createWaveform(longArrayOf(0, 60, 40, 120), intArrayOf(0, 255, 0, 200), -1)
            })
        }
    }

    fun release() { pool.release(); players.values.forEach { runCatching { it.release() } } }
}
