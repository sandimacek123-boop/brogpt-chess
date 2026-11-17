package dev.divide.game

import dev.divide.game.audio.Synth
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.sqrt

class SynthTest {
    private fun check(name: String, x: FloatArray, sr: Int = Synth.SR) {
        val peak = x.maxOf { abs(it) }; val rms = sqrt(x.map { it * it }.average())
        println("SYNTH $name len=${"%.2f".format(x.size.toFloat() / sr)}s peak=${"%.2f".format(peak)} rms=${"%.3f".format(rms)}")
        assertTrue("$name silent", rms > 0.01); assertTrue("$name clips", peak <= 1.0f); assertTrue("$name NaN", x.none { it.isNaN() })
        File("build/synth").mkdirs(); Synth.writeWav(File("build/synth/$name.wav"), x, sr)
    }

    @Test fun allSounds() {
        val t0 = System.currentTimeMillis()
        check("slice", Synth.slice()); check("impact", Synth.impact(1.4f)); check("clang", Synth.clang()); check("bell", Synth.bell(69f))
        check("boss_down", Synth.bossDown()); check("riser", Synth.riser(0.9)); check("gameover", Synth.gameOver()); check("tick", Synth.tick())
        check("menu", Synth.menuLoop(), 32000); check("battle", Synth.battleLoop(0), 32000); check("boss", Synth.battleLoop(1), 32000)
        println("SYNTH total ${System.currentTimeMillis() - t0} ms")
    }
}
