package dev.universe.engine

import android.graphics.Bitmap
import dev.universe.engine.physics.renderBlackHole
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Off-device renders of the heavier background computations, written to app/build/shots for inspection. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class RenderProbeTest {
    private fun save(b: Bitmap, name: String) {
        File("build/shots").mkdirs()
        File("build/shots/$name.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test
    fun blackHole() = runBlocking {
        val t0 = System.currentTimeMillis()
        val b = renderBlackHole(320, 80.0)
        println("black hole 320² in ${System.currentTimeMillis() - t0} ms")
        save(b, "probe_blackhole_80")
        save(renderBlackHole(320, 60.0), "probe_blackhole_60")
        // the shadow must be black at the centre and the disc must be lit somewhere
        check(b.getPixel(160, 160) and 0xFFFFFF == 0) { "centre of the shadow should be black" }
        var lit = 0
        for (y in 0 until 320 step 4) for (x in 0 until 320 step 4) if ((b.getPixel(x, y) shr 16) and 255 > 120) lit++
        check(lit > 150) { "accretion disc is not visible ($lit bright samples)" }
    }
}
