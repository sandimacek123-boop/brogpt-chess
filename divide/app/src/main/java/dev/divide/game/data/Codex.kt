package dev.divide.game.data

/** The Numberdex: special numbers you can discover in play. */
class Entry(val n: Long, val title: String, val fact: String)

val CODEX = listOf(
    Entry(2, "The odd one out", "The only even prime. Every other even number is divisible by 2, so it can't be prime."),
    Entry(6, "First perfect number", "1 + 2 + 3 = 6. A number equal to the sum of its proper divisors is called perfect."),
    Entry(7, "The lucky prime", "The most common answer when people are asked to pick a 'random' number from 1 to 10."),
    Entry(12, "The dozen", "Divisible by 1, 2, 3, 4 and 6 — more divisors than any smaller number. That's why we buy eggs in dozens."),
    Entry(13, "Unlucky, but prime", "Thirteen is prime, and so is its reversal 31: a pair called an emirp."),
    Entry(17, "Gauss's prime", "A Fermat prime, 2⁴ + 1. At 19, Gauss proved a regular 17-sided polygon can be drawn with ruler and compass."),
    Entry(28, "Second perfect number", "1 + 2 + 4 + 7 + 14 = 28. Also roughly the number of days in a lunar month."),
    Entry(31, "Mersenne prime", "2⁵ − 1. Primes of the form 2ⁿ − 1 are the largest primes we know."),
    Entry(42, "The Answer", "The Answer to the Ultimate Question of Life, the Universe and Everything — 2 · 3 · 7."),
    Entry(57, "Grothendieck's prime", "A great mathematician once offered 57 as an example of a prime. It is 3 × 19."),
    Entry(60, "The Babylonian base", "Divisible by 1–6, 10, 12, 15, 20 and 30. It's why an hour has 60 minutes."),
    Entry(64, "The chessboard", "2⁶: the squares on a chessboard. Doubling one grain of rice per square gives 2⁶⁴ − 1 grains."),
    Entry(73, "The best number", "The 21st prime. Its mirror, 37, is the 12th prime, and 21 is the mirror of 12. And 21 = 7 × 3."),
    Entry(89, "Fibonacci prime", "1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 — a Fibonacci number that is also prime."),
    Entry(91, "The great impostor", "Looks prime, isn't: 91 = 7 × 13. The most-failed number in primality quizzes."),
    Entry(97, "Last of its kind", "The largest two-digit prime."),
    Entry(100, "A perfect square", "10² — and the number of years in a century."),
    Entry(127, "Double Mersenne", "2⁷ − 1, and 7 is itself 2³ − 1."),
    Entry(128, "Seven doublings", "2⁷: the number of characters in ASCII."),
    Entry(137, "The physicists' prime", "The inverse fine-structure constant is about 137.036 — a number that haunted Pauli and Feynman."),
    Entry(144, "The gross", "12² = 144, and the only square in the Fibonacci sequence beyond 1."),
    Entry(169, "Thirteen squared", "13² = 169. Reversed, 961 = 31² — and 31 is 13 reversed."),
    Entry(196, "The Lychrel suspect", "Reverse and add, forever: no one has ever made 196 into a palindrome."),
    Entry(210, "A primorial", "2 · 3 · 5 · 7: the product of the first four primes."),
    Entry(256, "A byte", "2⁸: the number of values one byte can hold."),
    Entry(360, "The Divisor King", "24 divisors. Babylonian astronomers split the circle into 360 degrees."),
    Entry(496, "Third perfect number", "2⁴ · 31. Known to Euclid, who proved how to build perfect numbers from Mersenne primes."),
    Entry(561, "The Carmichael liar", "3 · 11 · 17. It passes Fermat's primality test for every coprime base — and is not prime."),
    Entry(720, "Six factorial", "6! = 720: the number of ways to arrange six things."),
    Entry(1024, "The Doubler", "2¹⁰. Computer memory is counted in its powers."),
    Entry(1729, "Taxicab", "Ramanujan, ill in hospital, told Hardy his taxi's number was very interesting: the smallest sum of two cubes in two ways."),
    Entry(2310, "The Primorial", "2·3·5·7·11. Primorials are used to show there are infinitely many primes."),
    Entry(8128, "The Perfect", "The fourth perfect number, 2⁶ · (2⁷ − 1). Nobody knows whether an odd perfect number exists."),
    Entry(65536, "Tower of Twos", "2¹⁶ = 2^2^2^2. One more step of the tower and the number has 19,729 digits."),
    Entry(720720, "The Hydra", "240 divisors: the smallest number with that many. Highly composite numbers are the ones easiest to share."),
)
val CODEX_BY_N = CODEX.associateBy { it.n }

/** Blades: cosmetic trails unlocked by milestones. */
class Blade(val id: String, val name: String, val color: Long, val unlock: String)

val BLADES = listOf(
    Blade("edge", "EDGE", 0xFF08F7FE, "Your first blade."),
    Blade("sieve", "SIEVE SABER", 0xFFFFD23F, "Catch 100 primes in total."),
    Blade("golden", "GOLDEN RATIO", 0xFFFFB347, "Reach wave 6 in Arcade."),
    Blade("fourier", "FOURIER", 0xFFB14CFF, "Build a ×40 combo."),
    Blade("lightning", "FRACTAL BOLT", 0xFF7DF9FF, "Defeat TAXICAB (1729)."),
    Blade("infinity", "INFINITY", 0xFFFF2E63, "Defeat the TOWER OF TWOS (65536)."),
)

fun bladeUnlocked(id: String, s: Save): Boolean = when (id) {
    "edge" -> true
    "sieve" -> s.primesCaught >= 100
    "golden" -> s.bestWave >= 6
    "fourier" -> s.bestCombo >= 40
    "lightning" -> "1729" in s.bosses
    "infinity" -> "65536" in s.bosses
    else -> false
}
