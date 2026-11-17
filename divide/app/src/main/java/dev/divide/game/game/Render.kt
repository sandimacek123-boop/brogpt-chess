package dev.divide.game.game

import android.content.Context
import android.graphics.*
import androidx.core.content.res.ResourcesCompat
import dev.divide.game.R
import kotlin.math.*

/** Impact-frame styles. NORMAL is the regular look; the others are the single-frame "smears" shown on big hits. */
object Style {
    const val NORMAL = 0
    const val MONO = 1      // black void, white silhouettes
    const val INK = 2       // manga paper, black ink
    const val NEG = 3       // photographic negative of the whole scene
    const val RED = 4       // blood-red frame, black silhouettes
    const val SOFT = 5      // reduced-flashing substitute: dimmed, desaturated
}

/** A blade trail in world coordinates. */
class Trail(val id: Int) {
    val xs = FloatArray(48); val ys = FloatArray(48); val ts = FloatArray(48)
    var n = 0
    var cutting = false
    var released = false
    var lastT = 0f
    fun add(x: Float, y: Float, t: Float) {
        if (n == xs.size) { System.arraycopy(xs, 1, xs, 0, n - 1); System.arraycopy(ys, 1, ys, 0, n - 1); System.arraycopy(ts, 1, ts, 0, n - 1); n-- }
        xs[n] = x; ys[n] = y; ts[n] = t; n++; lastT = t
    }
}

/** Per-frame view parameters supplied by the screen. */
class Look {
    var style = Style.NORMAL
    var reduceFlash = false
    var blade = "edge"
    var topInset = 0f
    var scale = 1f
    var time = 0f
    var dt = 0f
    var hud = true
    var hints = false
    var trails: List<Trail> = emptyList()
    /** Rendered behind the menu: no HUD, no ground strip. */
    var attract = false
}

private class Pal(val bg: Int, val ink: Int, val knock: Int)

/** Draws the game with an android.graphics.Canvas. Allocation-free in the steady state. */
class Renderer(context: Context) {
    private val display: Typeface = ResourcesCompat.getFont(context, R.font.bungee) ?: Typeface.DEFAULT_BOLD
    private val body: Typeface = ResourcesCompat.getFont(context, R.font.chakra_bold) ?: Typeface.DEFAULT_BOLD
    private val mathFont: Typeface = ResourcesCompat.getFont(context, R.font.math) ?: Typeface.DEFAULT

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val add = Paint(Paint.ANTI_ALIAS_FLAG).apply { blendMode = BlendMode.PLUS }
    private val addStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; blendMode = BlendMode.PLUS }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = display }
    private val textStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = display; style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
    private val glowPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { blendMode = BlendMode.PLUS }
    private val layerPaint = Paint()
    private val path = Path()
    private val path2 = Path()
    private val rect = RectF()
    private val glowFilters = HashMap<Int, ColorFilter>()
    private val glow: Bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888).also { b ->
        val c = Canvas(b)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = RadialGradient(48f, 48f, 48f, intArrayOf(0xFFFFFFFF.toInt(), 0x66FFFFFF, 0x18FFFFFF, 0x00FFFFFF), floatArrayOf(0f, 0.25f, 0.6f, 1f), Shader.TileMode.CLAMP)
        c.drawCircle(48f, 48f, 48f, p)
    }
    private val invert = ColorMatrixColorFilter(ColorMatrix(floatArrayOf(-1f, 0f, 0f, 0f, 255f, 0f, -1f, 0f, 0f, 255f, 0f, 0f, -1f, 0f, 255f, 0f, 0f, 0f, 1f, 0f)))
    private val soften = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0.15f); postConcat(ColorMatrix(floatArrayOf(0.7f, 0f, 0f, 0f, 0f, 0f, 0.7f, 0f, 0f, 0f, 0f, 0f, 0.75f, 0f, 8f, 0f, 0f, 0f, 1f, 0f))) })

    // prime (Sacks) spiral backdrop
    private val spiral: FloatArray = run {
        val pts = ArrayList<Float>()
        for (n in 2..6000) if (NT.isPrime(n.toLong())) { val r = sqrt(n.toFloat()); val a = 2f * PI.toFloat() * r; pts += cos(a) * r * 9.5f; pts += sin(a) * r * 9.5f }
        pts.toFloatArray()
    }
    private var bgShader: Shader? = null
    private var bgH = -1
    private var shownScore = 0.0
    private var lastScore = 0L
    private var scorePop = 0f
    private var factorCache = HashMap<Long, List<Long>>()

    private val NORMAL = Pal(0xFF05040A.toInt(), 0, 0)
    private val pals = arrayOf(
        NORMAL,
        Pal(0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt()),
        Pal(0xFFF3F0E8.toInt(), 0xFF0A0A0C.toInt(), 0xFFF3F0E8.toInt()),
        NORMAL,
        Pal(0xFFE8123F.toInt(), 0xFF0A0005.toInt(), 0xFFE8123F.toInt()),
        NORMAL,
    )

    companion object {
        const val CYAN = 0xFF08F7FE.toInt(); const val GOLD = 0xFFFFD23F.toInt(); const val RED = 0xFFFF2E63.toInt()
        const val VIOLET = 0xFFB14CFF.toInt(); const val WHITE = 0xFFF4F1FF.toInt(); const val DIM = 0xFF8B86A3.toInt()
        fun bladeColor(id: String): Int = when (id) {
            "sieve" -> 0xFFFFD23F.toInt(); "golden" -> 0xFFFFB347.toInt(); "fourier" -> 0xFFB14CFF.toInt()
            "lightning" -> 0xFF7DF9FF.toInt(); "infinity" -> 0xFFFF2E63.toInt(); else -> 0xFF08F7FE.toInt()
        }
        fun alpha(c: Int, a: Float): Int = (c and 0x00FFFFFF) or ((((c ushr 24) and 0xFF) * a.coerceIn(0f, 1f)).toInt() shl 24)
        fun mix(a: Int, b: Int, t: Float): Int {
            val u = t.coerceIn(0f, 1f)
            fun ch(s: Int) = (((a shr s) and 0xFF) * (1 - u) + ((b shr s) and 0xFF) * u).toInt() shl s
            return ch(24) or ch(16) or ch(8) or ch(0)
        }
        private fun hash(i: Int): Float { var h = i * 374761393 + 668265263; h = (h xor (h ushr 13)) * 1274126177; return ((h xor (h ushr 16)) and 0xFFFFFF) / 16777215f }
    }

    private fun factors(v: Long): List<Long> = factorCache.getOrPut(v) { if (factorCache.size > 400) factorCache.clear(); NT.factorize(v) }

    // ====================================================================== entry point
    fun draw(c: Canvas, e: Engine, wPx: Float, hPx: Float, look: Look) {
        val style = if (look.reduceFlash && look.style != Style.NORMAL) Style.SOFT else look.style
        val pal = pals[style]
        val silhouette = style == Style.MONO || style == Style.INK || style == Style.RED
        val s = look.scale
        val fx = e.fx

        // focus point for this frame's lines and zoom punch
        val shock = fx.shocks.lastOrNull()
        val fxX = if (fx.speedLines > 0f) fx.speedX else shock?.get(0) ?: 500f
        val fxY = if (fx.speedLines > 0f) fx.speedY else shock?.get(1) ?: e.height * 0.45f

        if (style == Style.NEG || style == Style.SOFT) c.saveLayer(null, layerPaint.apply { colorFilter = if (style == Style.NEG) invert else soften }) else c.save()

        background(c, e, wPx, hPx, look, pal, silhouette, fxX, fxY)

        c.save()
        c.translate(0f, look.topInset)
        c.scale(s, s)
        val shakeK = if (look.reduceFlash) 0.4f else 1f
        c.translate(fx.shakeX * shakeK, fx.shakeY * shakeK)
        if (style != Style.NORMAL && style != Style.SOFT) { val z = 1.035f; c.scale(z, z, fxX, fxY) }

        val split = fx.split
        if (split[3] >= 0f && !silhouette) {
            // the finisher: the whole frame is cut in two along the killing stroke and the halves slide apart
            val t = split[3]
            val off = (if (t < 0.12f) t / 0.12f else max(0f, 1f - (t - 0.12f) / 0.7f)) * 26f
            val ang = split[2]
            val nx = -sin(ang); val ny = cos(ang)
            for (side in intArrayOf(-1, 1)) {
                c.save()
                halfPlane(split[0], split[1], ang, side, e.height)
                c.clipPath(path)
                c.translate(nx * side * off, ny * side * off)
                world(c, e, look, pal, silhouette)
                c.restore()
            }
            val L = 2600f
            addStroke.color = alpha(0xFFFFFFFF.toInt(), 1f - t / 0.9f); addStroke.strokeWidth = 7f * (1f - t / 0.9f) + 1f
            c.drawLine(split[0] - cos(ang) * L, split[1] - sin(ang) * L, split[0] + cos(ang) * L, split[1] + sin(ang) * L, addStroke)
        } else world(c, e, look, pal, silhouette)

        c.restore()

        overlays(c, e, wPx, hPx, look, style, silhouette)
        if (look.hud) {
            c.save(); c.translate(0f, look.topInset); c.scale(s, s)
            hud(c, e, look, pal, silhouette)
            c.restore()
        }
        c.restore()
    }

    private fun halfPlane(x: Float, y: Float, ang: Float, side: Int, h: Float) {
        val L = 4000f
        val dx = cos(ang) * L; val dy = sin(ang) * L
        val nx = -sin(ang) * L * side; val ny = cos(ang) * L * side
        path.reset()
        path.moveTo(x - dx, y - dy); path.lineTo(x + dx, y + dy); path.lineTo(x + dx + nx, y + dy + ny); path.lineTo(x - dx + nx, y - dy + ny); path.close()
    }

    // ====================================================================== background
    private fun background(c: Canvas, e: Engine, wPx: Float, hPx: Float, look: Look, pal: Pal, silhouette: Boolean, fxX: Float, fxY: Float) {
        val s = look.scale
        val sx = fxX * s; val sy = fxY * s + look.topInset
        if (silhouette) {
            c.drawColor(pal.bg)
            focus(c, sx, sy, wPx, hPx, pal.ink, (e.time * 60).toInt() + look.style * 31, 150f * s, 110, 1f)
            return
        }
        if (bgH != hPx.toInt()) {
            bgH = hPx.toInt()
            bgShader = LinearGradient(0f, 0f, 0f, hPx, intArrayOf(0xFF07050F.toInt(), 0xFF05040A.toInt(), 0xFF0D0716.toInt()), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
        }
        fill.shader = bgShader; c.drawRect(0f, 0f, wPx, hPx, fill); fill.shader = null

        // slowly turning Sacks spiral of primes: the curves are prime-rich quadratics
        c.save()
        c.translate(wPx / 2, look.topInset + e.height * 0.42f * s)
        c.scale(s, s)
        c.rotate(look.time * 1.6f)
        stroke.color = alpha(VIOLET, if (e.overdriveActive) 0.34f else 0.16f); stroke.strokeWidth = 4.2f
        c.drawPoints(spiral, stroke)
        c.restore()

        // drifting giant digits
        text.typeface = display; text.clearShadowLayer()
        for (i in 0 until 14) {
            val size = (130f + hash(i) * 220f) * s
            val speed = (14f + hash(i + 50) * 26f) * s
            val span = hPx + size * 2
            val y = ((hash(i + 100) * span - look.time * speed) % span + span) % span - size * 0.5f
            val x = hash(i + 200) * wPx
            text.textSize = size; text.color = alpha(WHITE, 0.028f + 0.02f * hash(i + 7))
            val d = ((i * 7 + (look.time / 6f + hash(i + 9) * 10).toInt()) % 10)
            c.drawText(d.toString(), x, y, text)
        }

        if (e.fx.speedLines > 0f && look.style == Style.NORMAL)
            focus(c, sx, sy, wPx, hPx, 0xFFFFFFFF.toInt(), (e.time * 30).toInt(), 220f * s, 60, 0.18f * e.fx.speedLines)
    }

    /** Manga focus lines: thin wedges radiating out of (cx, cy), starting at a jittered inner radius. */
    private fun focus(c: Canvas, cx: Float, cy: Float, w: Float, h: Float, color: Int, seed: Int, inner: Float, count: Int, a: Float) {
        val far = w + h
        fill.color = color
        var hs = seed * 7919 + 13
        for (i in 0 until count) {
            hs = hs * 1103515245 + 12345; val r1 = ((hs ushr 8) and 0xFFFF) / 65535f
            hs = hs * 1103515245 + 12345; val r2 = ((hs ushr 8) and 0xFFFF) / 65535f
            val ang = (i + r1 * 0.8f) / count * 6.2832f
            val st = inner * (0.75f + r2 * 1.1f)
            val wd = (0.004f + r1 * r1 * 0.022f) * far
            val co = cos(ang); val si = sin(ang)
            path.reset()
            path.moveTo(cx + co * st, cy + si * st)
            path.lineTo(cx + co * far - si * wd, cy + si * far + co * wd)
            path.lineTo(cx + co * far + si * wd, cy + si * far - co * wd)
            path.close()
            fill.alpha = (255 * a * (0.55f + 0.45f * r2)).toInt()
            c.drawPath(path, fill)
        }
        fill.alpha = 255
    }

    // ====================================================================== the world
    private fun world(c: Canvas, e: Engine, look: Look, pal: Pal, silhouette: Boolean) {
        val t = look.time
        if (!look.attract) ground(c, e, t, pal, silhouette)
        if (!silhouette) auras(c, e, t)
        shocks(c, e, pal, silhouette)

        // harvested primes stream home behind everything else
        for (en in e.ents) if (en.alive && en.harvest) harvested(c, en, pal, silhouette)
        for (en in e.ents) {
            if (!en.alive || en.harvest) continue
            when (en.kind) {
                Kind.Composite -> composite(c, e, en, look, pal, silhouette)
                Kind.Prime -> prime(c, e, en, look, pal, silhouette)
                Kind.Power -> power(c, en, t, pal, silhouette)
                Kind.Boss -> boss(c, e, en, t, pal, silhouette)
            }
        }
        particles(c, e, pal, silhouette)
        for (tr in look.trails) trail(c, tr, look, e.overdriveActive, pal, silhouette)
        banners(c, e, pal, silhouette)
    }

    private fun ground(c: Canvas, e: Engine, t: Float, pal: Pal, silhouette: Boolean) {
        val gy = e.groundY
        if (silhouette) {
            stroke.color = pal.ink; stroke.strokeWidth = 6f; stroke.pathEffect = null
            c.drawLine(0f, gy, 1000f, gy, stroke)
            return
        }
        val d = e.fx.danger
        fill.shader = null
        fill.color = alpha(0xFF000000.toInt(), 0.55f); c.drawRect(0f, gy, 1000f, e.height + 400f, fill)
        // the breach line: marching dashes that heat up as composites approach
        val col = mix(0xFF5A1830.toInt(), RED, 0.35f + 0.65f * d)
        val dash = 34f
        val off = (t * 60f) % (dash * 2)
        stroke.color = col; stroke.strokeWidth = 4f + 3f * d
        var x = -dash * 2 + off
        while (x < 1000f) { c.drawLine(x, gy, x + dash, gy, stroke); x += dash * 2 }
        if (d > 0.05f) glow(c, 500f, gy, 900f, 120f, RED, 0.35f * d)
    }

    private fun auras(c: Canvas, e: Engine, t: Float) {
        if (e.magnetT > 0f) {
            // golden spiral drawn at the collector
            val cx = 500f; val cy = e.groundY - 60f
            val a = min(1f, e.magnetT)
            path.reset()
            val phi = 1.618034f
            var first = true
            var th = 0f
            while (th < 4.5f * PI.toFloat()) {
                val r = 6f * phi.pow(th / (PI.toFloat() / 2))
                val x = cx + cos(th - t * 3f) * r; val y = cy + sin(th - t * 3f) * r * 0.55f
                if (first) path.moveTo(x, y) else path.lineTo(x, y); first = false
                th += 0.08f
            }
            addStroke.color = alpha(GOLD, 0.7f * a); addStroke.strokeWidth = 4f
            c.drawPath(path, addStroke)
            glow(c, cx, cy, 160f, 90f, GOLD, 0.5f * a)
        }
        if (e.slowT > 0f) {
            text.typeface = mathFont; text.textSize = 700f; text.color = alpha(0xFF6B8CFF.toInt(), 0.07f * min(1f, e.slowT)); text.clearShadowLayer()
            c.drawText("π", 500f, e.height * 0.6f, text)
            text.typeface = display
        }
    }

    private fun shocks(c: Canvas, e: Engine, pal: Pal, silhouette: Boolean) {
        for (sh in e.fx.shocks) {
            val k = sh[2] / 0.7f
            val r = 40f + (1f - (1f - k).pow(3)) * 900f * sh[3]
            if (silhouette) { stroke.color = pal.ink; stroke.strokeWidth = 26f * (1f - k) + 2f; c.drawCircle(sh[0], sh[1], r, stroke) }
            else {
                addStroke.color = alpha(0xFFFFFFFF.toInt(), 0.55f * (1f - k)); addStroke.strokeWidth = 30f * (1f - k) + 2f
                c.drawCircle(sh[0], sh[1], r, addStroke)
                addStroke.color = alpha(CYAN, 0.35f * (1f - k)); addStroke.strokeWidth = 6f
                c.drawCircle(sh[0], sh[1], r * 0.92f, addStroke)
            }
        }
    }

    // ---------------------------------------------------------------------- numbers
    private fun numberText(c: Canvas, v: String, x: Float, y: Float, r: Float, color: Int, glowColor: Int, outline: Int, font: Typeface = display) {
        text.typeface = font
        var size = r * 0.92f
        text.textSize = size
        val w = text.measureText(v)
        val maxW = r * 1.58f
        if (w > maxW) { size *= maxW / w; text.textSize = size }
        val base = y - (text.ascent() + text.descent()) / 2
        if (outline != 0) { textStroke.typeface = font; textStroke.textSize = size; textStroke.color = outline; textStroke.strokeWidth = size * 0.16f; c.drawText(v, x, base, textStroke) }
        if (glowColor != 0) text.setShadowLayer(size * 0.35f, 0f, 0f, glowColor) else text.clearShadowLayer()
        text.color = color
        c.drawText(v, x, base, text)
        text.clearShadowLayer()
    }

    private fun composite(c: Canvas, e: Engine, en: Ent, look: Look, pal: Pal, silhouette: Boolean) {
        val r = en.r * popIn(en.age)
        val label = en.value.toString()
        if (silhouette) {
            fill.color = pal.ink; c.drawCircle(en.x, en.y, r, fill)
            numberText(c, label, en.x, en.y, r, pal.knock, 0, 0)
            return
        }
        val heat = ((en.y / e.groundY - 0.55f) / 0.4f).coerceIn(0f, 1f)
        val od = e.overdriveActive
        val ring = when { od -> GOLD; heat > 0f -> mix(CYAN, RED, heat); else -> CYAN }
        glow(c, en.x, en.y, r * 2.3f, r * 2.3f, ring, 0.22f + 0.2f * heat)
        fill.color = 0xF00B0A16.toInt(); c.drawCircle(en.x, en.y, r, fill)
        // the ring is broken into Ω(n) arcs: one per prime factor waiting inside
        val k = factors(en.value).size
        val gap = if (k > 1) 14f else 0f
        rect.set(en.x - r, en.y - r, en.x + r, en.y + r)
        stroke.color = ring; stroke.strokeWidth = 7f; stroke.pathEffect = null
        val sweep = 360f / k
        val rot = Math.toDegrees(en.rot.toDouble()).toFloat()
        for (i in 0 until k) c.drawArc(rect, rot + i * sweep + gap / 2, sweep - gap, false, stroke)
        stroke.color = alpha(ring, 0.35f); stroke.strokeWidth = 2f
        c.drawCircle(en.x, en.y, r - 11f, stroke)
        numberText(c, label, en.x, en.y, r, WHITE, alpha(ring, 0.9f), 0)
        if (e.fx.chroma > 0f) {
            val o = 7f * e.fx.chroma
            text.color = alpha(RED, 0.5f * e.fx.chroma); c.drawText(label, en.x - o, en.y - (text.ascent() + text.descent()) / 2, text)
            text.color = alpha(CYAN, 0.5f * e.fx.chroma); c.drawText(label, en.x + o, en.y - (text.ascent() + text.descent()) / 2, text)
        }
        if (look.hints || e.hints) {
            val (a, b) = NT.balancedSplit(en.value)
            text.typeface = body; text.textSize = 26f; text.color = alpha(ring, 0.85f)
            c.drawText("$a × $b", en.x, en.y + r + 30f, text)
            text.typeface = display
        }
    }

    private fun prime(c: Canvas, e: Engine, en: Ent, look: Look, pal: Pal, silhouette: Boolean) {
        val die = if (en.dying > 0f) en.dying / 0.3f else 0f
        val r = en.r * popIn(en.age) * (1f + die * 0.5f)
        val a = 1f - die
        val label = en.value.toString()
        if (silhouette) {
            fill.color = pal.ink; c.drawCircle(en.x, en.y, r, fill)
            stroke.color = pal.ink; stroke.strokeWidth = 5f; c.drawCircle(en.x, en.y, r + 12f, stroke)
            numberText(c, label, en.x, en.y, r, pal.knock, 0, 0)
            return
        }
        val pulse = 0.5f + 0.5f * sin(look.time * 5f + en.id)
        glow(c, en.x, en.y, r * 2.6f, r * 2.6f, GOLD, (0.28f + 0.12f * pulse) * a)
        fill.color = alpha(0xF0181000.toInt(), a); c.drawCircle(en.x, en.y, r, fill)
        stroke.color = alpha(GOLD, a); stroke.strokeWidth = 7f; c.drawCircle(en.x, en.y, r, stroke)
        stroke.strokeWidth = 2.5f; stroke.color = alpha(GOLD, 0.5f * a); c.drawCircle(en.x, en.y, r + 9f + 3f * pulse, stroke)
        // a slow four-point glint: primes are whole, so their ring has no breaks
        val gx = en.x + cos(en.rot) * r * 0.62f; val gy = en.y + sin(en.rot) * r * 0.62f
        star(c, gx, gy, 9f + 5f * pulse, alpha(0xFFFFFFFF.toInt(), 0.75f * a))
        numberText(c, label, en.x, en.y, r, alpha(0xFFFFF3C4.toInt(), a), alpha(GOLD, a), 0)
        if (en.hit > 0f) { fill.color = alpha(0xFFFFFFFF.toInt(), en.hit * 0.8f); c.drawCircle(en.x, en.y, r, fill) }
    }

    private fun harvested(c: Canvas, en: Ent, pal: Pal, silhouette: Boolean) {
        val r = 30f + 4f * NT.digits(en.value)
        val sp = hypot(en.vx, en.vy).coerceAtLeast(1f)
        val tx = -en.vx / sp; val ty = -en.vy / sp
        val len = min(220f, sp * 0.07f)
        if (silhouette) {
            stroke.color = pal.ink; stroke.strokeWidth = r * 0.8f; c.drawLine(en.x, en.y, en.x + tx * len, en.y + ty * len, stroke)
            fill.color = pal.ink; c.drawCircle(en.x, en.y, r, fill)
            numberText(c, en.value.toString(), en.x, en.y, r, pal.knock, 0, 0)
            return
        }
        addStroke.color = alpha(GOLD, 0.45f); addStroke.strokeWidth = r * 0.7f
        c.drawLine(en.x, en.y, en.x + tx * len, en.y + ty * len, addStroke)
        glow(c, en.x, en.y, r * 2.4f, r * 2.4f, GOLD, 0.45f)
        fill.color = 0xFFFFD23F.toInt(); c.drawCircle(en.x, en.y, r, fill)
        numberText(c, en.value.toString(), en.x, en.y, r, 0xFF1A1000.toInt(), 0, 0)
    }

    private fun power(c: Canvas, en: Ent, t: Float, pal: Pal, silhouette: Boolean) {
        val r = en.r * popIn(en.age)
        val col = if (silhouette) pal.ink else VIOLET
        path.reset()
        for (i in 0 until 6) { val a = i * PI.toFloat() / 3 + en.rot; val x = en.x + cos(a) * r; val y = en.y + sin(a) * r; if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
        path.close()
        if (!silhouette) { glow(c, en.x, en.y, r * 2.8f, r * 2.8f, VIOLET, 0.45f + 0.15f * sin(t * 8f)); fill.color = 0xEE140A22.toInt(); c.drawPath(path, fill) }
        else { fill.color = col; c.drawPath(path, fill) }
        stroke.color = col; stroke.strokeWidth = 6f; c.drawPath(path, stroke)
        numberText(c, en.power?.glyph ?: "?", en.x, en.y + 4f, r * 1.05f, if (silhouette) pal.knock else 0xFFF1DDFF.toInt(), if (silhouette) 0 else VIOLET, 0, mathFont)
    }

    private fun boss(c: Canvas, e: Engine, b: Ent, t: Float, pal: Pal, silhouette: Boolean) {
        val r = b.r
        val ink = if (silhouette) pal.ink else RED
        // spiked crown: one spike pair per prime factor at full strength
        val spikes = max(6, b.bossMax * 2)
        path.reset()
        for (i in 0 until spikes * 2) {
            val a = i * PI.toFloat() / spikes + t * 0.35f
            val rr = if (i % 2 == 0) r * 1.42f else r * 1.08f
            val x = b.x + cos(a) * rr; val y = b.y + sin(a) * rr
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        path.close()
        if (!silhouette) {
            glow(c, b.x, b.y, r * 3.6f, r * 3.6f, RED, 0.5f + 0.25f * b.hit)
            fill.color = 0xFF1A0610.toInt(); c.drawPath(path, fill)
            stroke.color = alpha(RED, 0.8f); stroke.strokeWidth = 4f; c.drawPath(path, stroke)
            fill.color = 0xFF0C0308.toInt(); c.drawCircle(b.x, b.y, r, fill)
            stroke.color = RED; stroke.strokeWidth = 9f; c.drawCircle(b.x, b.y, r, stroke)
            stroke.color = alpha(RED, 0.4f); stroke.strokeWidth = 2f; c.drawCircle(b.x, b.y, r * 0.82f, stroke)
        } else { fill.color = ink; c.drawPath(path, fill); c.drawCircle(b.x, b.y, r, fill) }

        numberText(c, b.value.toString(), b.x, b.y, r * 0.95f, if (silhouette) pal.knock else WHITE, if (silhouette) 0 else RED, 0)

        // remaining prime factors orbit as beads: each cut pops one
        val fs = factors(b.value)
        val n = fs.size
        val orbit = r * 1.75f
        for ((i, p) in fs.withIndex()) {
            val a = i * 2 * PI.toFloat() / n - t * 0.9f
            val x = b.x + cos(a) * orbit; val y = b.y + sin(a) * orbit * 0.9f
            val br = if (p > 99) 34f else 28f
            if (silhouette) { fill.color = pal.ink; c.drawCircle(x, y, br, fill); numberText(c, p.toString(), x, y, br, pal.knock, 0, 0) }
            else {
                glow(c, x, y, br * 2.4f, br * 2.4f, GOLD, 0.35f)
                fill.color = 0xFF181000.toInt(); c.drawCircle(x, y, br, fill)
                stroke.color = GOLD; stroke.strokeWidth = 4f; c.drawCircle(x, y, br, stroke)
                numberText(c, p.toString(), x, y, br, 0xFFFFF3C4.toInt(), 0, 0)
            }
        }
        if (!silhouette && b.hit > 0f) { fill.color = alpha(0xFFFFFFFF.toInt(), b.hit * 0.85f); c.drawCircle(b.x, b.y, r, fill) }
        if (!silhouette && b.invuln > 0f) { stroke.color = alpha(0xFFFFFFFF.toInt(), b.invuln * 2f); stroke.strokeWidth = 3f; c.drawCircle(b.x, b.y, r * 1.2f, stroke) }
    }

    private fun popIn(age: Float): Float = if (age >= 0.18f) 1f else { val k = age / 0.18f; 0.6f + 0.4f * (1f - (1f - k).pow(3)) + sin(k * PI.toFloat()) * 0.12f }

    private fun star(c: Canvas, x: Float, y: Float, r: Float, color: Int) {
        path2.reset()
        path2.moveTo(x, y - r); path2.lineTo(x + r * 0.22f, y - r * 0.22f); path2.lineTo(x + r, y); path2.lineTo(x + r * 0.22f, y + r * 0.22f)
        path2.lineTo(x, y + r); path2.lineTo(x - r * 0.22f, y + r * 0.22f); path2.lineTo(x - r, y); path2.lineTo(x - r * 0.22f, y - r * 0.22f); path2.close()
        add.color = color; c.drawPath(path2, add)
    }

    private fun glow(c: Canvas, x: Float, y: Float, w: Float, h: Float, color: Int, a: Float) {
        if (a <= 0.01f) return
        glowPaint.colorFilter = glowFilters.getOrPut(color or 0xFF000000.toInt()) { PorterDuffColorFilter(color or 0xFF000000.toInt(), PorterDuff.Mode.SRC_IN) }
        glowPaint.alpha = (255 * a.coerceIn(0f, 1f)).toInt()
        rect.set(x - w / 2, y - h / 2, x + w / 2, y + h / 2)
        c.drawBitmap(glow, null, rect, glowPaint)
    }

    // ---------------------------------------------------------------------- particles
    private fun particles(c: Canvas, e: Engine, pal: Pal, silhouette: Boolean) {
        for (p in e.particles) {
            if (!p.alive) continue
            val k = p.life / p.max
            val a = 1f - k
            val col = if (silhouette) pal.ink else p.color
            when (p.type) {
                0 -> {
                    val sx = p.x - p.vx * 0.035f; val sy = p.y - p.vy * 0.035f
                    if (silhouette) { stroke.color = col; stroke.strokeWidth = p.size; c.drawLine(p.x, p.y, sx, sy, stroke) }
                    else { addStroke.color = alpha(col, a); addStroke.strokeWidth = p.size * (0.4f + 0.6f * a); c.drawLine(p.x, p.y, sx, sy, addStroke) }
                }
                1 -> {
                    path.reset()
                    val s = p.size * (0.5f + 0.5f * a)
                    for (i in 0 until 3) { val ang = p.rot + i * 2.1f + (if (i == 1) 0.5f else 0f); val rr = if (i == 0) s * 1.4f else s; val x = p.x + cos(ang) * rr; val y = p.y + sin(ang) * rr; if (i == 0) path.moveTo(x, y) else path.lineTo(x, y) }
                    path.close()
                    fill.color = if (silhouette) col else alpha(col, a); c.drawPath(path, fill)
                }
                2 -> {
                    val rr = p.size * (0.5f + 0.9f * (1f - (1f - k).pow(2)))
                    if (silhouette) { stroke.color = col; stroke.strokeWidth = 10f * a + 2f; c.drawCircle(p.x, p.y, rr, stroke) }
                    else { addStroke.color = alpha(col, a); addStroke.strokeWidth = 10f * a + 1f; c.drawCircle(p.x, p.y, rr, addStroke) }
                }
                3 -> halfShell(c, p, a, pal, silhouette)
                4 -> {
                    text.typeface = display
                    val pop = if (k < 0.15f) 1.5f - k / 0.15f * 0.5f else 1f
                    text.textSize = p.size * pop
                    if (!silhouette) { textStroke.typeface = display; textStroke.textSize = text.textSize; textStroke.strokeWidth = text.textSize * 0.18f; textStroke.color = alpha(0xFF05040A.toInt(), a); c.drawText(p.text, p.x, p.y, textStroke) }
                    text.color = if (silhouette) col else alpha(col, a)
                    c.drawText(p.text, p.x, p.y, text)
                }
                5 -> {
                    // the cut: a long tapered sliver of light along the stroke
                    val L = p.size * (0.7f + 0.6f * k)
                    val w = 16f * a
                    val dx = cos(p.angle); val dy = sin(p.angle)
                    path.reset()
                    path.moveTo(p.x - dx * L, p.y - dy * L); path.lineTo(p.x - dy * w, p.y + dx * w); path.lineTo(p.x + dx * L, p.y + dy * L); path.lineTo(p.x + dy * w, p.y - dx * w); path.close()
                    if (silhouette) { fill.color = col; c.drawPath(path, fill) } else { add.color = alpha(0xFFFFFFFF.toInt(), a); c.drawPath(path, add); glow(c, p.x, p.y, L * 1.6f, L * 0.5f, CYAN, 0.6f * a) }
                }
            }
        }
    }

    /** One half of a sliced number: the circle and its digits clipped along the cut, drifting apart. */
    private fun halfShell(c: Canvas, p: Particle, a: Float, pal: Pal, silhouette: Boolean) {
        val r = p.size
        val deg = Math.toDegrees(p.angle.toDouble()).toFloat()
        c.save()
        c.translate(p.x, p.y)
        c.rotate(deg)
        c.clipRect(-r * 1.3f, 0f, r * 1.3f, r * 1.3f)
        c.rotate(-deg + Math.toDegrees(p.rot.toDouble()).toFloat())
        if (silhouette) {
            fill.color = pal.ink; c.drawCircle(0f, 0f, r, fill)
            numberText(c, p.text, 0f, 0f, r, pal.knock, 0, 0)
        } else {
            fill.color = alpha(0xFF0B0A16.toInt(), a); c.drawCircle(0f, 0f, r, fill)
            stroke.color = alpha(p.color, a); stroke.strokeWidth = 7f; c.drawCircle(0f, 0f, r, stroke)
            numberText(c, p.text, 0f, 0f, r, alpha(WHITE, a), 0, 0)
        }
        c.rotate(deg - Math.toDegrees(p.rot.toDouble()).toFloat())
        // the hot cut face
        if (!silhouette) { addStroke.color = alpha(0xFFFFFFFF.toInt(), a); addStroke.strokeWidth = 5f; c.drawLine(-r, 1f, r, 1f, addStroke) }
        c.restore()
    }

    // ---------------------------------------------------------------------- blades
    private fun trail(c: Canvas, tr: Trail, look: Look, od: Boolean, pal: Pal, silhouette: Boolean) {
        val now = look.time
        val life = 0.13f
        // collect points within the trail's lifetime
        var start = 0
        while (start < tr.n && now - tr.ts[start] > life) start++
        val m = tr.n - start
        if (m < 2) return
        val col = when { silhouette -> pal.ink; od -> GOLD; else -> bladeColor(look.blade) }
        val power = if (tr.cutting) 1f else 0.35f
        val maxW = (if (od) 30f else 22f) * (if (look.blade == "golden" || look.blade == "infinity") 1.15f else 1f)

        fun width(i: Int): Float { val age = (now - tr.ts[i]) / life; val pos = (i - start).toFloat() / (m - 1); return maxW * pos * (1f - age).coerceIn(0f, 1f) }
        fun buildRibbon(scale: Float) {
            path.reset()
            for (i in start until tr.n) {
                val j0 = max(start, i - 1); val j1 = min(tr.n - 1, i + 1)
                var dx = tr.xs[j1] - tr.xs[j0]; var dy = tr.ys[j1] - tr.ys[j0]
                val l = hypot(dx, dy).coerceAtLeast(0.001f); dx /= l; dy /= l
                val w = width(i) * scale
                val x = tr.xs[i] - dy * w; val y = tr.ys[i] + dx * w
                if (i == start) path.moveTo(x, y) else path.lineTo(x, y)
            }
            for (i in tr.n - 1 downTo start) {
                val j0 = max(start, i - 1); val j1 = min(tr.n - 1, i + 1)
                var dx = tr.xs[j1] - tr.xs[j0]; var dy = tr.ys[j1] - tr.ys[j0]
                val l = hypot(dx, dy).coerceAtLeast(0.001f); dx /= l; dy /= l
                val w = width(i) * scale
                path.lineTo(tr.xs[i] + dy * w, tr.ys[i] - dx * w)
            }
            path.close()
        }

        if (silhouette) { buildRibbon(1.2f); fill.color = col; c.drawPath(path, fill); return }

        if (look.blade == "lightning" && !od) {
            // jagged bolts re-rolled every frame
            var seed = (now * 997).toInt()
            for (bolt in 0 until 2) {
                path2.reset()
                for (i in start until tr.n) {
                    seed = seed * 1103515245 + 12345
                    val j = (((seed ushr 9) and 0xFF) / 255f - 0.5f) * 34f * (if (i == tr.n - 1) 0f else 1f)
                    val x = tr.xs[i] + j; val y = tr.ys[i] - j
                    if (i == start) path2.moveTo(x, y) else path2.lineTo(x, y)
                }
                addStroke.color = alpha(col, 0.85f * power); addStroke.strokeWidth = if (bolt == 0) 6f else 3f
                c.drawPath(path2, addStroke)
            }
        }
        buildRibbon(1.9f)
        if (look.blade == "infinity" && !od) {
            fill.shader = LinearGradient(tr.xs[start], tr.ys[start], tr.xs[tr.n - 1], tr.ys[tr.n - 1], VIOLET, RED, Shader.TileMode.CLAMP)
            fill.alpha = (110 * power).toInt(); c.drawPath(path, fill); fill.shader = null; fill.alpha = 255
        } else { add.color = alpha(col, 0.42f * power); c.drawPath(path, add) }
        buildRibbon(1f); add.color = alpha(col, 0.95f * power); c.drawPath(path, add)
        buildRibbon(0.38f); add.color = alpha(0xFFFFFFFF.toInt(), power); c.drawPath(path, add)

        // skin flourishes
        when (if (od) "" else look.blade) {
            "sieve" -> for (i in start until tr.n step 2) { add.color = alpha(GOLD, 0.8f * power); c.drawCircle(tr.xs[i] + 14f * sin(i * 2.3f), tr.ys[i] + 14f * cos(i * 1.7f), 3.5f, add) }
            "golden" -> for (i in start until tr.n step 3) star(c, tr.xs[i], tr.ys[i], 10f * (i - start + 1f) / m, alpha(0xFFFFE6A0.toInt(), power))
            "fourier" -> for (h in 1..2) {
                path2.reset()
                for (i in start until tr.n) {
                    val j0 = max(start, i - 1); val j1 = min(tr.n - 1, i + 1)
                    var dx = tr.xs[j1] - tr.xs[j0]; var dy = tr.ys[j1] - tr.ys[j0]
                    val l = hypot(dx, dy).coerceAtLeast(0.001f); dx /= l; dy /= l
                    val wv = sin(i * 0.9f * h + now * 30f) * 16f / h
                    val x = tr.xs[i] - dy * wv; val y = tr.ys[i] + dx * wv
                    if (i == start) path2.moveTo(x, y) else path2.lineTo(x, y)
                }
                addStroke.color = alpha(if (h == 1) 0xFFE0B3FF.toInt() else CYAN, 0.8f * power); addStroke.strokeWidth = 3f
                c.drawPath(path2, addStroke)
            }
            "infinity" -> { text.typeface = mathFont; text.textSize = 44f; text.color = alpha(0xFFFFFFFF.toInt(), power); c.drawText("∞", tr.xs[tr.n - 1], tr.ys[tr.n - 1] - 30f, text); text.typeface = display }
        }
        if (tr.cutting && !tr.released) glow(c, tr.xs[tr.n - 1], tr.ys[tr.n - 1], 90f, 90f, col, 0.7f)
    }

    /** Blade showcase: draws [tr] on a dark card, in world units scaled by [look].scale. */
    fun preview(c: Canvas, tr: Trail, look: Look) {
        c.save(); c.scale(look.scale, look.scale)
        trail(c, tr, look, false, NORMAL, false)
        c.restore()
    }

    // ---------------------------------------------------------------------- banners
    private fun banners(c: Canvas, e: Engine, pal: Pal, silhouette: Boolean) {
        var bigIdx = 0; var smallIdx = 0
        for (i in e.banners.indices.reversed()) {
            val b = e.banners[i]
            val k = b.t / b.life
            val inT = (b.t / 0.14f).coerceIn(0f, 1f)
            val a = if (k > 0.8f) (1f - k) / 0.2f else 1f
            val slam = 1f + (1f - inT).pow(2) * 0.9f
            val y = if (b.big) e.height * 0.36f - bigIdx++ * 150f else e.height * 0.52f + smallIdx++ * 70f
            text.typeface = display
            var size = if (b.big) 104f else 60f
            text.textSize = size
            val w = text.measureText(b.text)
            if (w > 900f) size *= 900f / w
            size *= slam
            text.textSize = size; text.textSkewX = -0.18f
            textStroke.textSize = size; textStroke.typeface = display; textStroke.textSkewX = -0.18f; textStroke.strokeWidth = size * 0.2f
            if (silhouette) { text.color = pal.ink; c.drawText(b.text, 500f, y, text) }
            else {
                // slab behind the title, cut at an angle
                if (b.big) {
                    path.reset(); val hw = min(520f, w / 2 + 70f) * (if (inT < 1f) inT else 1f)
                    path.moveTo(500f - hw - 30f, y - size * 0.95f); path.lineTo(500f + hw + 30f, y - size * 1.05f); path.lineTo(500f + hw, y + size * 0.3f); path.lineTo(500f - hw, y + size * 0.4f); path.close()
                    fill.color = alpha(0xE005040A.toInt(), a); c.drawPath(path, fill)
                    stroke.color = alpha(b.color, 0.9f * a); stroke.strokeWidth = 4f; c.drawPath(path, stroke)
                }
                textStroke.color = alpha(0xFF05040A.toInt(), a); c.drawText(b.text, 500f, y, textStroke)
                text.setShadowLayer(size * 0.3f, 0f, 0f, alpha(b.color, 0.8f * a))
                text.color = alpha(b.color, a); c.drawText(b.text, 500f, y, text)
                text.clearShadowLayer()
            }
            text.textSkewX = 0f; textStroke.textSkewX = 0f
            if (b.sub.isNotEmpty()) {
                text.typeface = body; text.textSize = 34f
                val sw = text.measureText(b.sub); if (sw > 920f) text.textSize = 34f * 920f / sw
                text.color = if (silhouette) pal.ink else alpha(WHITE, a * 0.92f)
                c.drawText(b.sub, 500f, y + (if (b.big) 64f else 44f), text)
                text.typeface = display
            }
        }
    }

    // ====================================================================== screen-space overlays
    private fun overlays(c: Canvas, e: Engine, wPx: Float, hPx: Float, look: Look, style: Int, silhouette: Boolean) {
        val fx = e.fx
        if (silhouette) return
        val reduce = look.reduceFlash
        if (fx.danger > 0.02f && !look.attract) {
            fill.shader = LinearGradient(0f, hPx * 0.55f, 0f, hPx, 0x00FF2E63, alpha(RED, 0.45f * fx.danger), Shader.TileMode.CLAMP)
            c.drawRect(0f, hPx * 0.55f, wPx, hPx, fill); fill.shader = null
        }
        if (e.overdriveActive) {
            val a = 0.35f + 0.15f * sin(look.time * 14f)
            stroke.color = alpha(GOLD, a); stroke.strokeWidth = 14f * look.scale
            c.drawRect(0f, 0f, wPx, hPx, stroke)
        }
        if (e.slowT > 0f) { fill.color = alpha(0xFF3040A0.toInt(), 0.12f * min(1f, e.slowT)); c.drawRect(0f, 0f, wPx, hPx, fill) }
        if (fx.flash > 0f) { fill.color = alpha(fx.flashColor, fx.flash * (if (reduce) 0.12f else 0.75f)); c.drawRect(0f, 0f, wPx, hPx, fill) }
        if (e.over && !look.attract) { fill.color = alpha(0xFF000000.toInt(), min(0.55f, e.overT * 0.4f)); c.drawRect(0f, 0f, wPx, hPx, fill) }
    }

    // ====================================================================== HUD
    private fun hud(c: Canvas, e: Engine, look: Look, pal: Pal, silhouette: Boolean) {
        val inkOr = { col: Int -> if (silhouette) pal.ink else col }
        if (e.score != lastScore) { if (e.score > lastScore) scorePop = 1f; lastScore = e.score }
        shownScore += (e.score - shownScore) * min(1.0, look.dt * 10.0)
        if (abs(e.score - shownScore) < 1) shownScore = e.score.toDouble()
        scorePop = max(0f, scorePop - look.dt * 5f)

        // score
        text.textAlign = Paint.Align.LEFT; textStroke.textAlign = Paint.Align.LEFT
        text.typeface = display; text.textSize = 74f * (1f + 0.12f * scorePop)
        val sc = "%,d".format(shownScore.roundToLong())
        if (!silhouette) { textStroke.typeface = display; textStroke.textSize = text.textSize; textStroke.strokeWidth = 12f; textStroke.color = 0xFF05040A.toInt(); c.drawText(sc, 46f, 138f, textStroke); text.setShadowLayer(20f, 0f, 0f, alpha(CYAN, 0.5f + 0.5f * scorePop)) }
        text.color = inkOr(WHITE); c.drawText(sc, 46f, 138f, text); text.clearShadowLayer()

        // multiplier and combo
        if (e.combo > 0) {
            text.typeface = body; text.textSize = 32f
            val m = "×" + "%.1f".format(e.multiplier)
            text.color = inkOr(GOLD); c.drawText(m, 50f, 186f, text)
            val mw = text.measureText(m)
            text.color = inkOr(alpha(WHITE, 0.8f)); c.drawText("  COMBO ${e.combo}", 50f + mw, 186f, text)
        }

        // wave / boss
        text.textAlign = Paint.Align.CENTER; textStroke.textAlign = Paint.Align.CENTER
        val b = e.boss
        if (b != null) {
            text.typeface = display; text.textSize = 30f; text.color = inkOr(RED)
            c.drawText(b.bossName, 500f, 238f, text)
            val segs = b.bossMax; val left = factors(b.value).size
            val w = 520f; val gap = 6f; val sw = (w - gap * (segs - 1)) / segs
            for (i in 0 until segs) {
                val x = 500f - w / 2 + i * (sw + gap)
                fill.color = if (i < left) inkOr(RED) else inkOr(alpha(RED, 0.18f))
                path.reset(); path.moveTo(x + 6f, 254f); path.lineTo(x + sw, 254f); path.lineTo(x + sw - 6f, 270f); path.lineTo(x, 270f); path.close()
                c.drawPath(path, fill)
            }
        } else if (e.mode != Mode.Tutorial) {
            text.typeface = body; text.textSize = 28f; text.color = inkOr(alpha(WHITE, 0.55f))
            val label = when (e.mode) { Mode.Zen -> "ZEN"; Mode.Daily -> "DAILY · WAVE ${e.wave}"; else -> if (e.wave > 0) "WAVE ${e.wave}" else "" }
            c.drawText(label, 500f, 238f, text)
        }

        // shields
        text.textAlign = Paint.Align.RIGHT
        if (e.mode == Mode.Zen || e.mode == Mode.Tutorial) {
            text.typeface = mathFont; text.textSize = 48f; text.color = inkOr(alpha(CYAN, 0.8f)); c.drawText("∞", 950f, 214f, text)
        } else {
            val slots = max(3, e.shields).coerceAtMost(e.maxShields)
            for (i in 0 until slots) {
                val x = 935f - i * 46f; val y = 200f
                path.reset(); path.moveTo(x, y - 18f); path.lineTo(x + 15f, y); path.lineTo(x, y + 18f); path.lineTo(x - 15f, y); path.close()
                val on = (slots - 1 - i) < e.shields
                if (on) { fill.color = inkOr(CYAN); c.drawPath(path, fill); if (!silhouette) glow(c, x, y, 60f, 60f, CYAN, 0.4f) }
                else { stroke.color = inkOr(alpha(RED, 0.6f)); stroke.strokeWidth = 3f; c.drawPath(path, stroke) }
            }
        }
        text.textAlign = Paint.Align.CENTER

        // overdrive meter below the breach line
        if (!look.attract) {
            val gy = e.groundY
            val full = e.overdrive >= 100f
            val v = if (e.overdriveActive) e.overdriveT / 6f else e.overdrive / 100f
            val y0 = gy + 58f; val x0 = 60f; val x1 = 940f
            path.reset(); path.moveTo(x0 + 12f, y0); path.lineTo(x1, y0); path.lineTo(x1 - 12f, y0 + 26f); path.lineTo(x0, y0 + 26f); path.close()
            fill.color = if (silhouette) pal.knock else 0xFF15121F.toInt(); c.drawPath(path, fill)
            c.save(); c.clipRect(x0, y0 - 2f, x0 + (x1 - x0) * v, y0 + 30f)
            fill.color = inkOr(if (full || e.overdriveActive) GOLD else 0xFFB08A10.toInt()); c.drawPath(path, fill)
            c.restore()
            stroke.color = inkOr(alpha(GOLD, 0.7f)); stroke.strokeWidth = 2.5f; c.drawPath(path, stroke)
            text.typeface = body; text.textSize = 26f; text.textAlign = Paint.Align.LEFT
            text.color = inkOr(alpha(GOLD, 0.9f)); c.drawText("Σ OVERDRIVE", x0, y0 - 12f, text)
            text.textAlign = Paint.Align.RIGHT
            val pulse = 0.5f + 0.5f * sin(look.time * 9f)
            val msg = when { e.overdriveActive -> "ACTIVE"; full -> "TAP ▸ UNLEASH"; else -> "${e.overdrive.toInt()}%" }
            text.color = inkOr(if (full && !e.overdriveActive) alpha(0xFFFFFFFF.toInt(), 0.6f + 0.4f * pulse) else alpha(GOLD, 0.9f))
            c.drawText(msg, x1, y0 - 12f, text)
            if (full && !e.overdriveActive && !silhouette) glow(c, 500f, y0 + 13f, 1000f, 120f, GOLD, 0.25f + 0.25f * pulse)
            text.textAlign = Paint.Align.CENTER
        }
        textStroke.textAlign = Paint.Align.CENTER
    }
}
