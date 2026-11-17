package dev.divide.game.game

enum class Kind { Composite, Prime, Boss, Power }
enum class Power(val glyph: String, val label: String) { Sieve("#", "SIEVE"), Root("√", "ROOT"), Shield("∞", "+SHIELD"), Slow("π", "SLOW TIME"), Magnet("φ", "GOLDEN PULL") }
enum class Mode(val label: String) { Arcade("ARCADE"), BossRush("BOSS RUSH"), Daily("DAILY"), Zen("ZEN"), Tutorial("TRAINING") }

/** A falling number, a boss, or a power-up. World units: the playfield is 1000 wide. */
class Ent(
    val id: Int, var kind: Kind, var value: Long,
    var x: Float, var y: Float, var vx: Float, var vy: Float, var r: Float,
    var power: Power? = null,
) {
    var alive = true
    var age = 0f
    var rot = 0f
    var vr = 0f
    /** Swipe that already cut this entity (each swipe cuts an entity once). */
    var cutBy = -1
    var invuln = 0f
    /** Harvested prime factor flying home to the score counter. */
    var harvest = false
    var harvestT = 0f
    /** Caught or absorbed: animating out. */
    var dying = 0f
    var hit = 0f        // flash after being struck (bosses)
    var bossName = ""
    var bossMax = 0
    var spawnValue = value
}

/** Short-lived visual debris. */
class Particle {
    var x = 0f; var y = 0f; var vx = 0f; var vy = 0f
    var life = 0f; var max = 1f
    var size = 4f; var rot = 0f; var vr = 0f
    var type = 0          // 0 spark, 1 shard, 2 ring, 3 half shell, 4 digit, 5 glow
    var color = 0xFFFFFFFF.toInt()
    var text = ""
    var angle = 0f        // cut direction for half shells
    var alive = false
}

class Banner(val text: String, val sub: String, val color: Int, val life: Float, val big: Boolean) { var t = 0f }

/** Everything the screen needs to stage an impact frame. */
class Fx {
    var hitStop = 0f
    var shake = 0f
    var shakeX = 0f; var shakeY = 0f
    /** Queue of impact styles to show, one entry per displayed frame: 1 mono, 2 ink, 3 negative, 4 red negative. */
    val frames = ArrayDeque<Int>()
    var flash = 0f
    var flashColor = 0xFFFFFFFF.toInt()
    var chroma = 0f
    var speedLines = 0f
    var speedX = 500f; var speedY = 500f
    val shocks = ArrayList<FloatArray>()     // x, y, age, strength
    /** Finisher: a screen-wide cut. x, y, angle, age (−1 = inactive). */
    var split = floatArrayOf(0f, 0f, 0f, -1f)
    var danger = 0f
    var zoom = 0f
}

/** Sound/haptic hooks raised by the engine. */
interface GameEvents {
    fun slice(value: Long, multi: Int) {}
    fun clang() {}
    fun catchPrime(p: Long) {}
    fun harvest(p: Long) {}
    fun multiCut(count: Int) {}
    fun shieldLost() {}
    fun overdrive() {}
    fun power(p: Power) {}
    fun bossHit(remaining: Int) {}
    fun bossDown() {}
    fun bossArrive() {}
    fun waveStart(wave: Int) {}
    fun gameOver() {}
    fun encountered(value: Long) {}
}
