package dev.divide.game.game

import kotlin.math.*
import kotlin.random.Random

class BossDef(val value: Long, val name: String, val lore: String)

val BOSSES = listOf(
    BossDef(360, "THE DIVISOR KING", "360 = 2³·3²·5 has 24 divisors — which is why a circle has 360 degrees."),
    BossDef(1024, "THE DOUBLER", "2¹⁰. Ten halvings and nothing is left. A kilobyte, to a programmer."),
    BossDef(1729, "TAXICAB", "7·13·19 — the smallest number that is a sum of two cubes in two ways: 1³+12³ = 9³+10³."),
    BossDef(2310, "THE PRIMORIAL", "2·3·5·7·11: the product of the first five primes."),
    BossDef(8128, "THE PERFECT", "2⁶·127. It equals the sum of its own divisors — only the fourth number known to the Greeks that does."),
    BossDef(65536, "TOWER OF TWOS", "2¹⁶ = 2^2^2^2. Sixteen halvings deep."),
    BossDef(720720, "THE HYDRA", "2⁴·3²·5·7·11·13 — a highly composite giant with 240 divisors."),
)

/**
 * The rules of the game. Deterministic for a given seed; knows nothing about Android.
 * World units: the playfield is [width] = 1000 wide and [height] tall (set from the screen's aspect ratio).
 */
class Engine(val mode: Mode, seed: Long, var height: Float = 2000f, private val events: GameEvents = object : GameEvents {}) {
    val width = 1000f
    private val rnd = Random(seed)
    val ents = ArrayList<Ent>()
    val particles = Array(900) { Particle() }
    private var pIdx = 0
    val banners = ArrayList<Banner>()
    val fx = Fx()

    var score = 0L
    var combo = 0; var bestCombo = 0
    private var comboTimer = 0f
    val maxShields = 5
    var shields = when (mode) { Mode.BossRush -> 5; Mode.Zen, Mode.Tutorial -> 3; else -> 3 }
    var wave = 0; var bossIndex = -1
    private var waveLeft = 0f; private var between = 1.6f; private var spawnTimer = 0.6f
    var overdrive = 0f; var overdriveT = 0f
    var slowT = 0f; var magnetT = 0f
    var over = false; var overT = 0f
    var time = 0f
    var boss: Ent? = null
    private var bossAttack = 2f
    private var nextId = 1
    private val swipeCuts = HashMap<Int, Int>()

    // statistics for the end screen and unlocks
    var sliced = 0; var caught = 0; var clangs = 0; var breaches = 0
    val bossesDefeated = ArrayList<Long>()
    var maxMulti = 0

    // tutorial
    var tutStep = 0; var tutText = ""; var tutDone = false
    private var tutWait = 0f

    val groundY: Float get() = height - 150f
    val multiplier: Float get() = 1f + min(combo, 50) / 10f
    val overdriveActive: Boolean get() = overdriveT > 0f
    val hints: Boolean get() = mode == Mode.Zen || mode == Mode.Tutorial

    companion object {
        const val CUT_SPEED = 700f
        val HUD_SCORE = floatArrayOf(110f, 110f)
        fun radiusFor(v: Long) = 44f + 10f * NT.digits(v)
        fun pts(v: Long, prime: Boolean) = if (prime) 10 + 5 * NT.digits(v) else 10 * NT.omega(v) + 5 * NT.digits(v)
    }

    // ------------------------------------------------------------------ spawning
    private fun spawn(kind: Kind, v: Long, x: Float, y: Float, vx: Float, vy: Float, r: Float = radiusFor(v), power: Power? = null): Ent {
        val e = Ent(nextId++, kind, v, x, y, vx, vy, r, power)
        e.vr = (rnd.nextFloat() - 0.5f) * 1.2f
        ents += e
        return e
    }

    private fun randomPrime(max: Long): Long { while (true) { val v = 2 + rnd.nextLong(max - 1); if (NT.isPrime(v)) return v } }
    private fun randomComposite(min: Long, max: Long): Long { while (true) { val v = min + rnd.nextLong(max - min + 1); if (!NT.isPrime(v) && v > 3) return v } }

    /** Special numbers sprinkled into play so the codex can be completed. */
    var specials: List<Long> = emptyList()

    private fun spawnNormal() {
        val w = max(1, wave)
        val maxN = if (mode == Mode.Zen) 90L else 24L + 22L * w
        val speed = if (mode == Mode.Zen) 110f else 140f + 14f * w
        val volley = w >= 2 && rnd.nextFloat() < 0.14f && mode != Mode.Zen
        val count = if (volley) 3 else 1
        for (k in 0 until count) {
            val roll = rnd.nextFloat()
            var kind = Kind.Composite
            var power: Power? = null
            val v: Long = when {
                roll < 0.035f && w >= 2 && mode != Mode.Zen -> { kind = Kind.Power; power = Power.entries[rnd.nextInt(Power.entries.size)]; 0 }
                roll < 0.33f -> { kind = Kind.Prime; randomPrime(maxN) }
                w >= 3 && rnd.nextFloat() < 0.18f -> NT.DECOYS.filter { it <= maxN * 2 }.randomOrNull(rnd) ?: randomComposite(4, maxN)
                rnd.nextFloat() < 0.08f && specials.isNotEmpty() -> specials.filter { it <= maxN * 4 }.randomOrNull(rnd)?.also { if (NT.isPrime(it)) kind = Kind.Prime } ?: randomComposite(4, maxN)
                else -> randomComposite(4, maxN)
            }
            val r = if (kind == Kind.Power) 58f else radiusFor(v)
            val x = if (volley) width * (0.22f + 0.28f * k) else r + 30 + rnd.nextFloat() * (width - 2 * r - 60)
            spawn(kind, v, x, -r - k * 30, (rnd.nextFloat() - 0.5f) * 80, speed * (0.85f + rnd.nextFloat() * 0.3f), r, power)
        }
    }

    private fun startWave(w: Int) {
        wave = w
        events.waveStart(w)
        if (mode == Mode.BossRush || (mode != Mode.Zen && w % 3 == 0)) {
            bossIndex = if (mode == Mode.BossRush) (w - 1) % BOSSES.size else (w / 3 - 1) % BOSSES.size
            val def = BOSSES[bossIndex]
            val b = spawn(Kind.Boss, def.value, width / 2, -260f, 0f, 0f, 150f)
            b.bossName = def.name; b.bossMax = NT.omega(def.value); b.spawnValue = def.value
            boss = b; bossAttack = 2.4f
            banner(def.name, "BOSS · ${def.value} = ${NT.factorString(def.value)}", 0xFFFF2E63.toInt(), 2.2f, true)
            impact(intArrayOf(1, 1, 2), stop = 0.12f, shake = 26f, shockX = width / 2, shockY = height * 0.25f)
            events.bossArrive()
        } else {
            waveLeft = if (mode == Mode.Zen) Float.MAX_VALUE else 20f + 2f * w
            banner("WAVE $w", if (w == 1) "slice composites · tap primes" else "", 0xFFFFFFFF.toInt(), 1.5f, true)
            impact(intArrayOf(1), stop = 0.04f, shake = 10f)
        }
    }

    // ------------------------------------------------------------------ input
    /** A swipe segment from (x0,y0) to (x1,y1) with pointer speed in world units per second. */
    fun swipe(x0: Float, y0: Float, x1: Float, y1: Float, swipeId: Int, speed: Float) {
        if (over || speed < CUT_SPEED) return
        val ang = atan2(y1 - y0, x1 - x0)
        for (e in ents.toList()) {
            if (!e.alive || e.dying > 0f || e.harvest || e.cutBy == swipeId) continue
            if (!segmentHits(x0, y0, x1, y1, e.x, e.y, e.r)) continue
            e.cutBy = swipeId
            when (e.kind) {
                Kind.Composite -> { if (overdriveActive) shatter(e, ang) else split(e, ang); countCut(swipeId, e) }
                Kind.Prime -> if (overdriveActive) absorb(e) else clang(e)
                Kind.Power -> activate(e)
                Kind.Boss -> { if (e.invuln <= 0f) { bossHit(e, ang); countCut(swipeId, e) } }
            }
        }
    }

    fun endSwipe(swipeId: Int) { swipeCuts.remove(swipeId) }

    /** A tap at (x, y): catches the nearest prime under the finger. */
    fun tap(x: Float, y: Float): Boolean {
        if (over) return false
        val e = ents.filter { it.alive && it.kind == Kind.Prime && !it.harvest && it.dying == 0f }.minByOrNull { hypot(it.x - x, it.y - y) - it.r } ?: return false
        if (hypot(e.x - x, e.y - y) > e.r * 1.5f + 30f) return false
        absorb(e)
        return true
    }

    fun activateOverdrive(): Boolean {
        if (overdrive < 100f || overdriveActive || over) return false
        overdrive = 0f; overdriveT = 6f
        banner("ΣVERDRIVE", "every cut shatters to primes", 0xFFFFD23F.toInt(), 1.6f, true)
        impact(intArrayOf(2, 2, 1), stop = 0.14f, shake = 24f, shockX = width / 2, shockY = groundY, flash = 0.5f)
        events.overdrive()
        if (mode == Mode.Tutorial && tutStep == 5) tutWait = 0f
        return true
    }

    // ------------------------------------------------------------------ rules
    private fun countCut(swipeId: Int, e: Ent) {
        val n = (swipeCuts[swipeId] ?: 0) + 1
        swipeCuts[swipeId] = n
        maxMulti = max(maxMulti, n)
        if (n >= 2) events.multiCut(n)
        when {
            n == 2 -> particleText(e.x, e.y - e.r - 20, "DOUBLE", 0xFF08F7FE.toInt())
            n == 3 -> { banner("TRIPLE CUT", "", 0xFF08F7FE.toInt(), 0.9f, false); impact(intArrayOf(1, 1), stop = 0.05f, shake = 14f, speedX = e.x, speedY = e.y) }
            n == 4 -> { banner("QUAD CUT", "", 0xFFFFD23F.toInt(), 1f, false); impact(intArrayOf(1, 1, 1), stop = 0.08f, shake = 18f, shockX = e.x, shockY = e.y, speedX = e.x, speedY = e.y) }
            n >= 5 -> { banner("CHAIN ×$n", "", 0xFFFF2E63.toInt(), 1.2f, true); impact(intArrayOf(2, 2, 2, 1), stop = 0.12f, shake = 26f, shockX = e.x, shockY = e.y, speedX = e.x, speedY = e.y, flash = 0.25f) }
        }
        if (n >= 5) score += 50L * n
    }

    private fun bump() { combo++; bestCombo = max(bestCombo, combo); comboTimer = 2.2f }

    private fun split(e: Ent, ang: Float) {
        val (a, b) = NT.balancedSplit(e.value)
        e.alive = false
        sliced++
        bump()
        score += (pts(e.value, false) * multiplier).toLong()
        events.slice(e.value, swipeCuts.values.maxOrNull() ?: 1)
        events.encountered(e.value)
        val px = -sin(ang); val py = cos(ang)
        for ((v, s) in listOf(a to -1f, b to 1f)) {
            val prime = NT.isPrime(v)
            val c = spawn(if (prime) Kind.Prime else Kind.Composite, v, e.x + px * s * e.r * 0.45f, e.y + py * s * e.r * 0.45f,
                e.vx * 0.3f + px * s * 230f, min(e.vy * 0.3f, 60f) + py * s * 230f - 140f)
            c.age = 0f
            if (prime) { c.harvest = true; c.harvestT = 0f }
        }
        burst(e, ang, 0xFF08F7FE.toInt())
    }

    /** Overdrive and the sieve: break a composite straight into all of its primes. */
    private fun shatter(e: Ent, ang: Float) {
        val fs = NT.factorize(e.value)
        e.alive = false
        sliced++
        bump()
        score += (pts(e.value, false) * multiplier * 1.5f).toLong()
        events.slice(e.value, 1); events.encountered(e.value)
        fs.forEachIndexed { i, p ->
            val a = i * 2 * PI.toFloat() / fs.size + ang
            val c = spawn(Kind.Prime, p, e.x, e.y, cos(a) * 320f, sin(a) * 320f - 100f)
            c.harvest = true
        }
        burst(e, ang, 0xFFFFD23F.toInt())
        shock(e.x, e.y, 0.6f)
    }

    private fun absorb(e: Ent) {
        e.dying = 0.001f
        caught++
        bump()
        score += (pts(e.value, true) * multiplier).toLong()
        overdrive = min(100f, overdrive + 7f + 2f * NT.digits(e.value))
        events.catchPrime(e.value); events.encountered(e.value)
        ring(e.x, e.y, e.r * 1.4f, 0xFFFFD23F.toInt())
        for (k in 0 until 10) spark(e.x, e.y, 0xFFFFD23F.toInt(), 260f)
    }

    private fun clang(e: Ent) {
        clangs++
        combo = 0
        if (mode != Mode.Zen && mode != Mode.Tutorial) shields--
        e.vy = -360f; e.vx = (rnd.nextFloat() - 0.5f) * 500f; e.invuln = 0.5f; e.hit = 1f
        banner("CLANG!", "${e.value} is prime — it can't be divided", 0xFFFF2E63.toInt(), 1.4f, true)
        impact(intArrayOf(4, 4), stop = 0.07f, shake = 26f, flash = 0.0f)
        fx.chroma = 1f
        for (k in 0 until 18) spark(e.x, e.y, 0xFFFFFFFF.toInt(), 520f)
        events.clang()
        if (mode == Mode.Tutorial && tutStep == 2) tutWait = 0f
        checkDeath()
    }

    private fun breach(e: Ent) {
        e.alive = false
        breaches++
        combo = 0
        if (mode != Mode.Zen && mode != Mode.Tutorial) shields--
        banner("BREACH", if (e.kind == Kind.Composite) "${e.value} = ${NT.productString(e.value)}" else "", 0xFFFF2E63.toInt(), 1.4f, true)
        impact(intArrayOf(4), stop = 0.05f, shake = 30f)
        fx.danger = 1f
        for (k in 0 until 26) spark(e.x, groundY, 0xFFFF2E63.toInt(), 600f)
        shock(e.x, groundY, 0.8f)
        events.shieldLost()
        checkDeath()
    }

    private fun checkDeath() {
        if (shields <= 0 && !over) {
            over = true; overT = 0f
            banners.clear()
            banner("DIVIDED", "", 0xFFFFFFFF.toInt(), 3f, true)
            impact(intArrayOf(3, 3), stop = 0.2f, shake = 34f, flash = 0.4f)
            events.gameOver()
        }
    }

    private fun activate(e: Ent) {
        val p = e.power ?: return
        e.alive = false
        events.power(p)
        banner(p.label, when (p) { Power.Sieve -> "every even number shatters"; Power.Root -> "every composite splits"; Power.Shield -> "one shield restored"; Power.Slow -> "time slows"; Power.Magnet -> "primes spiral home" }, 0xFFB14CFF.toInt(), 1.3f, false)
        impact(intArrayOf(1, 1), stop = 0.08f, shake = 16f, shockX = e.x, shockY = e.y)
        when (p) {
            Power.Sieve -> for (o in ents.toList()) if (o.alive && o.kind == Kind.Composite && o.value % 2 == 0L && !o.harvest) shatter(o, 0f)
            Power.Root -> for (o in ents.toList()) if (o.alive && o.kind == Kind.Composite && !o.harvest) split(o, rnd.nextFloat() * 6.28f)
            Power.Shield -> shields = min(maxShields, shields + 1)
            Power.Slow -> slowT = 5f
            Power.Magnet -> magnetT = 6f
        }
    }

    private fun bossHit(b: Ent, ang: Float) {
        val p = NT.factorize(b.value).first()
        b.value /= p
        b.invuln = 0.32f; b.hit = 1f
        bump()
        score += (40 * multiplier).toLong()
        val c = spawn(Kind.Prime, p, b.x + cos(ang + 1.57f) * 120f, b.y + sin(ang + 1.57f) * 120f, cos(ang + 1.57f) * 300f, -200f)
        c.harvest = true
        particleText(b.x, b.y - b.r - 30, "÷$p", 0xFFFFD23F.toInt())
        events.encountered(p)
        if (b.value == 1L) {
            b.alive = false
            boss = null
            bossesDefeated += b.spawnValue
            score += 1000L * (bossIndex + 1)
            events.bossDown(); events.encountered(b.spawnValue)
            banner("${b.bossName} FALLS", "${b.spawnValue} = ${NT.factorString(b.spawnValue)}", 0xFFFFD23F.toInt(), 2.6f, true)
            impact(intArrayOf(2, 2, 2, 1, 1, 3), stop = 0.3f, shake = 40f, shockX = b.x, shockY = b.y, speedX = b.x, speedY = b.y, flash = 0.6f)
            fx.split[0] = b.x; fx.split[1] = b.y; fx.split[2] = ang; fx.split[3] = 0f
            for (k in 0 until 60) spark(b.x, b.y, if (k % 2 == 0) 0xFFFFD23F.toInt() else 0xFFFFFFFF.toInt(), 900f)
            for (k in 0 until 4) ring(b.x, b.y, 120f + k * 80f, 0xFFFFD23F.toInt())
            between = 3.2f
        } else {
            events.bossHit(NT.omega(b.value))
            impact(intArrayOf(1, 1), stop = 0.09f, shake = 20f, shockX = b.x, shockY = b.y)
            fx.chroma = 1f
            burst(b, ang, 0xFFFF2E63.toInt())
        }
    }

    // ------------------------------------------------------------------ effects helpers
    fun impact(frames: IntArray, stop: Float = 0f, shake: Float = 0f, shockX: Float = Float.NaN, shockY: Float = Float.NaN, speedX: Float = Float.NaN, speedY: Float = Float.NaN, flash: Float = 0f) {
        for (f in frames) fx.frames.addLast(f)
        fx.hitStop = max(fx.hitStop, stop)
        fx.shake = max(fx.shake, shake)
        if (!shockX.isNaN()) shock(shockX, shockY, 1f)
        if (!speedX.isNaN()) { fx.speedLines = 1f; fx.speedX = speedX; fx.speedY = speedY }
        if (flash > 0f) fx.flash = max(fx.flash, flash)
    }
    private fun shock(x: Float, y: Float, s: Float) { if (fx.shocks.size < 6) fx.shocks += floatArrayOf(x, y, 0f, s) }
    private fun banner(t: String, sub: String, c: Int, life: Float, big: Boolean) { banners += Banner(t, sub, c, life, big); if (banners.size > 4) banners.removeAt(0) }

    private fun nextParticle(): Particle { val p = particles[pIdx]; pIdx = (pIdx + 1) % particles.size; p.alive = true; return p }
    private fun spark(x: Float, y: Float, c: Int, sp: Float) {
        val p = nextParticle(); val a = rnd.nextFloat() * 6.283f; val s = sp * (0.3f + rnd.nextFloat())
        p.x = x; p.y = y; p.vx = cos(a) * s; p.vy = sin(a) * s; p.life = 0f; p.max = 0.35f + rnd.nextFloat() * 0.35f; p.size = 3f + rnd.nextFloat() * 4f; p.type = 0; p.color = c
    }
    private fun ring(x: Float, y: Float, r: Float, c: Int) { val p = nextParticle(); p.x = x; p.y = y; p.vx = 0f; p.vy = 0f; p.life = 0f; p.max = 0.45f; p.size = r; p.type = 2; p.color = c }
    private fun particleText(x: Float, y: Float, t: String, c: Int) { val p = nextParticle(); p.x = x; p.y = y; p.vx = 0f; p.vy = -90f; p.life = 0f; p.max = 0.9f; p.size = 46f; p.type = 4; p.color = c; p.text = t }
    private fun burst(e: Ent, ang: Float, c: Int) {
        val px = -sin(ang); val py = cos(ang)
        for (s in listOf(-1f, 1f)) {
            val p = nextParticle()
            p.x = e.x; p.y = e.y; p.vx = e.vx * 0.3f + px * s * 340f; p.vy = e.vy * 0.3f + py * s * 340f; p.life = 0f; p.max = 0.32f; p.size = e.r; p.type = 3; p.color = c; p.angle = ang + (if (s < 0) PI.toFloat() else 0f); p.vr = s * 4f; p.rot = 0f
            p.text = e.value.toString()
        }
        for (k in 0 until 9) { val p = nextParticle(); val a = rnd.nextFloat() * 6.283f; val sp = 200f + rnd.nextFloat() * 380f
            p.x = e.x; p.y = e.y; p.vx = cos(a) * sp; p.vy = sin(a) * sp; p.life = 0f; p.max = 0.5f + rnd.nextFloat() * 0.3f; p.size = 8f + rnd.nextFloat() * 10f; p.type = 1; p.color = c; p.rot = a; p.vr = (rnd.nextFloat() - 0.5f) * 14f }
        for (k in 0 until 10) spark(e.x, e.y, 0xFFFFFFFF.toInt(), 700f)
        // the cut itself: a bright line along the swipe
        val p = nextParticle(); p.x = e.x; p.y = e.y; p.vx = 0f; p.vy = 0f; p.life = 0f; p.max = 0.18f; p.size = e.r * 2.6f; p.type = 5; p.color = 0xFFFFFFFF.toInt(); p.angle = ang
    }

    private fun segmentHits(x0: Float, y0: Float, x1: Float, y1: Float, cx: Float, cy: Float, r: Float): Boolean {
        val dx = x1 - x0; val dy = y1 - y0
        val l2 = dx * dx + dy * dy
        val t = if (l2 < 1e-6f) 0f else (((cx - x0) * dx + (cy - y0) * dy) / l2).coerceIn(0f, 1f)
        val qx = x0 + dx * t - cx; val qy = y0 + dy * t - cy
        return qx * qx + qy * qy <= r * r
    }

    // ------------------------------------------------------------------ tutorial
    private fun tutorial(dt: Float) {
        tutWait += dt
        val active = ents.filter { it.alive && !it.harvest && it.dying == 0f }
        fun slowSpawn(v: Long, x: Float, kind: Kind = if (NT.isPrime(v)) Kind.Prime else Kind.Composite) = spawn(kind, v, x, -radiusFor(v), 0f, 75f)
        when (tutStep) {
            0 -> { tutText = "Swipe fast through 12 to divide it. It splits into factors; prime pieces fly home as points."
                if (active.none { it.kind == Kind.Composite } && tutWait > 0.5f) { if (sliced >= 2) { tutStep = 1; tutWait = 0f } else if (active.isEmpty()) slowSpawn(12, 500f) } }
            1 -> { tutText = "Gold numbers are PRIME — they can't be divided. Tap the 7 to catch it."
                if (caught >= 1) { tutStep = 2; tutWait = 0f } else if (active.isEmpty()) slowSpawn(7, 500f) }
            2 -> { tutText = "Never slice a prime. Go on — slice the 13 once, to see what happens."
                if (clangs >= 1 && tutWait > 1.2f) { tutStep = 3; tutWait = 0f; ents.clear() } else if (caught >= 2 && clangs == 0 && tutWait > 1f) { tutStep = 3; tutWait = 0f } else if (active.isEmpty() && clangs == 0) slowSpawn(13, 500f) }
            3 -> { tutText = "Don't let composites reach the red line. Watch out for 91 — it only looks prime (7 × 13)."
                if (active.isEmpty() && tutWait > 0.3f) { if (sliced >= 6) { tutStep = 4; tutWait = 0f } else { slowSpawn(15, 300f); slowSpawn(91, 700f) } } }
            4 -> { tutText = "One swipe, many cuts: slice all four in a single stroke for an impact."
                if (active.isEmpty() && tutWait > 0.3f) { if (maxMulti >= 3) { tutStep = 5; tutWait = 0f; overdrive = 100f } else for ((i, v) in listOf(4L, 6L, 8L, 9L).withIndex()) spawn(Kind.Composite, v, 200f + i * 200f, -radiusFor(v), 0f, 75f) } }
            5 -> { tutText = "Catching primes fills OVERDRIVE. It's full — tap the meter at the bottom, then slice."
                if (overdriveActive && active.isEmpty()) for (v in listOf(60L, 84L, 96L)) spawn(Kind.Composite, v, 200f + rnd.nextFloat() * 600f, -radiusFor(v), 0f, 120f)
                if (!overdriveActive && tutWait > 1f && sliced >= 9 && overdrive < 100f) { tutStep = 6; tutWait = 0f } }
            else -> { tutText = "That's the whole game. Survive the waves, break the bosses, fill the codex."; if (tutWait > 0.8f) tutDone = true }
        }
    }

    // ------------------------------------------------------------------ main step
    fun step(realDt0: Float) {
        val realDt = realDt0.coerceIn(0f, 0.05f)
        // effects advance in real time, even during hit-stop
        fx.shake *= exp(-realDt * 9f)
        fx.shakeX = (rnd.nextFloat() - 0.5f) * 2 * fx.shake; fx.shakeY = (rnd.nextFloat() - 0.5f) * 2 * fx.shake
        fx.flash = max(0f, fx.flash - realDt * 2.5f)
        fx.chroma = max(0f, fx.chroma - realDt * 3f)
        fx.speedLines = max(0f, fx.speedLines - realDt * 3.5f)
        fx.danger = max(0f, fx.danger - realDt * 1.2f)
        val it = fx.shocks.iterator(); while (it.hasNext()) { val s = it.next(); s[2] += realDt; if (s[2] > 0.7f) it.remove() }
        if (fx.split[3] >= 0f) { fx.split[3] += realDt; if (fx.split[3] > 0.9f) fx.split[3] = -1f }
        for (b in banners) b.t += realDt
        banners.removeAll { it.t > it.life }
        overdriveT = max(0f, overdriveT - realDt); slowT = max(0f, slowT - realDt); magnetT = max(0f, magnetT - realDt)

        if (fx.hitStop > 0f) { fx.hitStop -= realDt; return }
        val scale = when { over -> max(0.12f, 1f - overT * 1.4f); overdriveActive -> 0.55f; slowT > 0f -> 0.5f; else -> 1f }
        val dt = realDt * scale
        time += dt
        if (over) overT += realDt
        comboTimer -= dt
        if (comboTimer <= 0f) combo = 0

        // waves
        if (!over) when (mode) {
            Mode.Tutorial -> tutorial(dt)
            else -> {
                if (boss == null && waveLeft <= 0f && ents.none { it.alive && (it.kind == Kind.Composite || it.kind == Kind.Prime) && !it.harvest }) {
                    between -= dt
                    if (between <= 0f) { between = 2.4f; startWave(wave + 1) }
                } else if (boss == null && mode != Mode.BossRush) {
                    waveLeft -= dt
                    spawnTimer -= dt
                    if (spawnTimer <= 0f && waveLeft > 0f) {
                        spawnNormal()
                        spawnTimer = (if (mode == Mode.Zen) 1.7f else max(0.36f, 1.25f - 0.06f * wave)) * (0.7f + rnd.nextFloat() * 0.6f)
                    }
                }
            }
        }
        boss?.let { b -> bossAI(b, dt) }

        val g = 30f
        for (e in ents) {
            if (!e.alive) continue
            e.age += dt
            e.invuln = max(0f, e.invuln - dt); e.hit = max(0f, e.hit - dt * 4f)
            if (e.dying > 0f) { e.dying += dt; if (e.dying > 0.3f) e.alive = false; continue }
            if (e.kind == Kind.Boss) continue
            if (e.harvest) {
                e.harvestT += dt
                if (e.harvestT < 0.35f) { e.vx *= 0.94f; e.vy *= 0.94f } else {
                    val dx = HUD_SCORE[0] - e.x; val dy = HUD_SCORE[1] - e.y; val d = hypot(dx, dy).coerceAtLeast(1f)
                    val sp = 600f + e.harvestT * 2400f
                    e.vx = dx / d * sp; e.vy = dy / d * sp
                    if (d < 40f) { e.alive = false; score += (pts(e.value, true) * multiplier).toLong(); events.harvest(e.value); events.encountered(e.value) }
                }
            } else {
                e.vy += g * dt
                if (magnetT > 0f && e.kind == Kind.Prime) {
                    val tx = width / 2; val ty = groundY - 60f; val dx = tx - e.x; val dy = ty - e.y; val d = hypot(dx, dy).coerceAtLeast(1f)
                    // pull along a golden-angle spiral toward the core
                    e.vx += (dx / d * 900f - dy / d * 500f) * dt; e.vy += (dy / d * 900f + dx / d * 500f) * dt
                    if (d < 60f) { absorb(e); continue }
                }
            }
            e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vr * dt
            if (!e.harvest) {
                if (e.x < e.r) { e.x = e.r; e.vx = abs(e.vx) } else if (e.x > width - e.r) { e.x = width - e.r; e.vx = -abs(e.vx) }
                if (e.y > groundY - e.r * 0.3f) when (e.kind) {
                    Kind.Composite -> if (mode == Mode.Tutorial) { e.alive = false; breaches++; banner("BREACH", "${e.value} = ${NT.productString(e.value)}", 0xFFFF2E63.toInt(), 1.4f, true); impact(intArrayOf(4), 0.04f, 20f) } else breach(e)
                    Kind.Prime -> { e.alive = false; ring(e.x, groundY, 50f, 0x88FFD23F.toInt()) }
                    else -> e.alive = false
                }
                if (e.y < -900f) e.alive = false
            }
            if (e.kind == Kind.Composite && !e.harvest) fx.danger = max(fx.danger, ((e.y / groundY).coerceIn(0f, 1f)).pow(6))
        }
        ents.removeAll { !it.alive }

        for (p in particles) {
            if (!p.alive) continue
            p.life += dt
            if (p.life >= p.max) { p.alive = false; continue }
            p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
            if (p.type == 0 || p.type == 1) { p.vx *= 0.96f; p.vy = p.vy * 0.96f + 500f * dt }
        }
    }

    private fun bossAI(b: Ent, dt: Float) {
        val ty = height * 0.31f
        if (b.y < ty - 4f && b.age < 2f) b.y += (ty - b.y) * min(1f, dt * 2.2f)
        else { b.x = width / 2 + sin(time * 0.7f) * 240f; b.y = ty + sin(time * 1.1f) * 50f }
        b.rot = sin(time * 0.5f) * 0.15f
        val hpRatio = NT.omega(b.value).toFloat() / b.bossMax
        bossAttack -= dt
        if (bossAttack <= 0f && b.age > 1.5f && !over) {
            bossAttack = (1.0f + 1.6f * hpRatio) * (0.8f + rnd.nextFloat() * 0.4f) * (if (mode == Mode.BossRush) 0.9f else 1f)
            val divisors = (4L..min(b.spawnValue, 400L)).filter { b.spawnValue % it == 0L && !NT.isPrime(it) }
            val v = if (divisors.isNotEmpty() && rnd.nextFloat() < 0.6f) divisors.random(rnd) else randomComposite(4, 40L + 20L * bossIndex)
            val tx = 120f + rnd.nextFloat() * (width - 240f)
            val sp = 230f + 25f * bossIndex
            val dy = groundY - b.y; val t = dy / sp
            spawn(Kind.Composite, v, b.x, b.y + b.r * 0.6f, (tx - b.x) / t, sp)
            ring(b.x, b.y, b.r * 1.1f, 0xFFFF2E63.toInt())
            if (rnd.nextFloat() < 0.25f) { val p = randomPrime(60); spawn(Kind.Prime, p, b.x, b.y + b.r * 0.6f, (rnd.nextFloat() - 0.5f) * 300f, sp * 0.8f) }
        }
    }

    /** Called once the playfield size is known. */
    fun begin() {
        if (mode == Mode.Tutorial) { tutStep = 0; return }
        between = 1.2f
        waveLeft = 0f
    }
}
