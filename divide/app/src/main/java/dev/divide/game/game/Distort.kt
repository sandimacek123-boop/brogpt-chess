package dev.divide.game.game

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.asComposeRenderEffect
import kotlin.math.pow

/**
 * Android 13+ only: an AGSL post-process that refracts the frame around the newest shockwave and splits the colour
 * channels on heavy hits. Older devices (and the JVM test renderer) simply get no effect.
 */
object Distort {
    val supported: Boolean = Build.VERSION.SDK_INT >= 33 && Build.FINGERPRINT != "robolectric"
    private var shader: Any? = null
    private var failed = false

    private const val SRC = """
        uniform shader content;
        uniform float2 center;
        uniform float radius;
        uniform float strength;
        uniform float chroma;
        half4 main(float2 p) {
            float2 d = p - center;
            float dist = length(d);
            float band = (dist - radius) / 70.0;
            float k = strength * exp(-band * band);
            float2 dir = dist > 0.5 ? d / dist : float2(0.0, 0.0);
            float2 q = p - dir * k * 34.0;
            half4 c = content.eval(q);
            if (chroma > 0.01) {
                float2 o = float2(chroma * 11.0, chroma * 3.0) + dir * k * 12.0;
                c.r = content.eval(q + o).r;
                c.b = content.eval(q - o).b;
            }
            return c;
        }
    """

    fun effect(e: Engine, look: Look): RenderEffect? {
        if (!supported || failed || look.reduceFlash) return null
        val sh = e.fx.shocks.lastOrNull()
        val chroma = e.fx.chroma
        if (sh == null && chroma < 0.03f) return null
        return try { make(e, look, sh, chroma) } catch (t: Throwable) { failed = true; null }
    }

    @RequiresApi(33)
    private fun make(e: Engine, look: Look, sh: FloatArray?, chroma: Float): RenderEffect {
        val s = (shader as? RuntimeShader) ?: RuntimeShader(SRC).also { shader = it }
        if (sh != null) {
            val k = sh[2] / 0.7f
            val r = 40f + (1f - (1f - k).pow(3)) * 900f * sh[3]
            s.setFloatUniform("center", sh[0] * look.scale, sh[1] * look.scale + look.topInset)
            s.setFloatUniform("radius", r * look.scale)
            s.setFloatUniform("strength", (1f - k) * sh[3])
        } else {
            s.setFloatUniform("center", 0f, 0f); s.setFloatUniform("radius", 0f); s.setFloatUniform("strength", 0f)
        }
        s.setFloatUniform("chroma", chroma)
        return android.graphics.RenderEffect.createRuntimeShaderEffect(s, "content").asComposeRenderEffect()
    }
}
