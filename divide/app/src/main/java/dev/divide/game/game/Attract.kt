package dev.divide.game.game

import kotlin.math.*
import kotlin.random.Random

/** A ghost player for the menu backdrop: slices composites and catches primes on its own. */
class Bot(private val e: Engine, seed: Long = 7) {
    private val rnd = Random(seed)
    private var cooldown = 1.2f
    private var swipeId = 1_000_000
    private var active: FloatArray? = null   // x0, y0, x1, y1, progress
    private var trail: Trail? = null
    val trails = ArrayList<Trail>()
    private var lastX = 0f; private var lastY = 0f

    fun step(dt: Float, now: Float) {
        e.step(dt)
        // the backdrop never flashes
        e.fx.frames.clear(); e.fx.flash = 0f; e.fx.shake = min(e.fx.shake, 6f); e.fx.split[3] = -1f
        cooldown -= dt
        val a = active
        if (a != null) {
            a[4] = min(1f, a[4] + dt / 0.11f)
            val x = a[0] + (a[2] - a[0]) * a[4]; val y = a[1] + (a[3] - a[1]) * a[4]
            e.swipe(lastX, lastY, x, y, swipeId, 4000f)
            lastX = x; lastY = y
            trail?.add(x, y, now)
            if (a[4] >= 1f) { e.endSwipe(swipeId); trail?.released = true; active = null }
        } else if (cooldown <= 0f) {
            cooldown = 0.35f + rnd.nextFloat() * 0.8f
            val targets = e.ents.filter { it.alive && !it.harvest && it.dying == 0f && it.y > 120f && it.y < e.height * 0.72f }
            val prime = targets.firstOrNull { it.kind == Kind.Prime && it.y > e.height * 0.3f }
            val comp = targets.filter { it.kind == Kind.Composite }.maxByOrNull { it.y }
            if (prime != null && (comp == null || rnd.nextFloat() < 0.5f)) e.tap(prime.x, prime.y)
            else if (comp != null) {
                val ang = rnd.nextFloat() * PI.toFloat()
                val reach = comp.r + 170f
                val lead = comp.vy * 0.06f
                active = floatArrayOf(comp.x - cos(ang) * reach, comp.y + lead - sin(ang) * reach, comp.x + cos(ang) * reach, comp.y + lead + sin(ang) * reach, 0f)
                swipeId++
                lastX = active!![0]; lastY = active!![1]
                trail = Trail(swipeId).also { it.cutting = true; it.add(lastX, lastY, now); trails += it }
            }
        }
        trails.removeAll { it.released && now - it.lastT > 0.3f }
    }
}
