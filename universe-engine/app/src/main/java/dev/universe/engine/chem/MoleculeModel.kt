package dev.universe.engine.chem

import kotlin.math.*
import kotlin.random.Random

/** A molecule: element symbols, 3D coordinates in ångström, and bonds (i, j, order). */
class Molecule(val name: String, val atoms: List<String>, val bonds: List<IntArray>, val x: DoubleArray, val y: DoubleArray, val z: DoubleArray) {
    fun neighbours(i: Int): List<Int> = bonds.filter { it[0] == i || it[1] == i }.map { if (it[0] == i) it[1] else it[0] }
    fun formula(): String {
        val c = atoms.groupingBy { it }.eachCount()
        val order = (listOfNotNull(if ("C" in c) "C" else null, if ("H" in c && "C" in c) "H" else null) + c.keys.filter { it != "C" && !(it == "H" && "C" in c) }.sorted())
        return order.joinToString("") { s -> s + (c.getValue(s).takeIf { it > 1 }?.let { dev.universe.engine.core.ui.subscript(it) } ?: "") }
    }
    fun distance(i: Int, j: Int) = sqrt((x[i] - x[j]).pow(2) + (y[i] - y[j]).pow(2) + (z[i] - z[j]).pow(2))
    fun angle(a: Int, c: Int, b: Int): Double {
        val ux = x[a] - x[c]; val uy = y[a] - y[c]; val uz = z[a] - z[c]; val vx = x[b] - x[c]; val vy = y[b] - y[c]; val vz = z[b] - z[c]
        return acos(((ux * vx + uy * vy + uz * vz) / (sqrt(ux * ux + uy * uy + uz * uz) * sqrt(vx * vx + vy * vy + vz * vz))).coerceIn(-1.0, 1.0)) * 180 / PI
    }
}

private val VALENCE = mapOf("C" to 4, "N" to 3, "O" to 2, "S" to 2, "P" to 3, "F" to 1, "Cl" to 1, "Br" to 1, "I" to 1, "B" to 3, "H" to 1)
private val VALENCE_E = mapOf("H" to 1, "B" to 3, "C" to 4, "N" to 5, "O" to 6, "F" to 7, "P" to 5, "S" to 6, "Cl" to 7, "Br" to 7, "I" to 7)
private val COV = mapOf("H" to 0.31, "C" to 0.76, "N" to 0.71, "O" to 0.66, "F" to 0.57, "S" to 1.05, "P" to 1.07, "Cl" to 1.02, "Br" to 1.20, "I" to 1.39, "B" to 0.84)
val PAULING = mapOf("H" to 2.20, "B" to 2.04, "C" to 2.55, "N" to 3.04, "O" to 3.44, "F" to 3.98, "P" to 2.19, "S" to 2.58, "Cl" to 3.16, "Br" to 2.96, "I" to 2.66)

/** Parses a Kekulé SMILES string (organic subset, explicit = and #, branches and ring closures) and adds implicit hydrogens. */
fun parseSmiles(smiles: String): Pair<List<String>, List<IntArray>> {
    val atoms = ArrayList<String>(); val bonds = ArrayList<IntArray>()
    val stack = ArrayDeque<Int>(); val rings = HashMap<Int, Pair<Int, Int>>()
    var prev = -1; var order = 1; var i = 0
    while (i < smiles.length) {
        val c = smiles[i]
        when {
            c == '(' -> { stack.addLast(prev); i++ }
            c == ')' -> { prev = stack.removeLast(); i++ }
            c == '=' -> { order = 2; i++ }
            c == '#' -> { order = 3; i++ }
            c == '-' -> { order = 1; i++ }
            c.isDigit() -> {
                val d = c - '0'
                val open = rings[d]
                if (open == null) rings[d] = prev to order else { bonds += intArrayOf(open.first, prev, max(order, open.second)); rings.remove(d) }
                order = 1; i++
            }
            c == '[' -> { val end = smiles.indexOf(']', i); val sym = smiles.substring(i + 1, end); atoms += sym; if (prev >= 0) bonds += intArrayOf(prev, atoms.lastIndex, order); prev = atoms.lastIndex; order = 1; i = end + 1 }
            c.isUpperCase() -> {
                val two = if (i + 1 < smiles.length && smiles[i + 1].isLowerCase() && (c.toString() + smiles[i + 1]) in VALENCE) c.toString() + smiles[i + 1] else c.toString()
                atoms += two
                if (prev >= 0) bonds += intArrayOf(prev, atoms.lastIndex, order)
                prev = atoms.lastIndex; order = 1; i += two.length
            }
            else -> i++
        }
    }
    val heavy = atoms.size
    for (a in 0 until heavy) {
        if (atoms[a] == "H") continue
        val used = bonds.filter { it[0] == a || it[1] == a }.sumOf { it[2] }
        repeat(max(0, (VALENCE[atoms[a]] ?: 0) - used)) { atoms += "H"; bonds += intArrayOf(a, atoms.lastIndex, 1) }
    }
    return atoms to bonds
}

/** Builds 3D coordinates from connectivity: ideal bond lengths, VSEPR angles, planar double bonds, then relaxes. */
fun buildMolecule(name: String, smiles: String, seed: Int = 7): Molecule {
    val (atoms, bonds) = parseSmiles(smiles)
    val n = atoms.size
    val nb = List(n) { i -> bonds.filter { it[0] == i || it[1] == i }.map { b -> (if (b[0] == i) b[1] else b[0]) to b[2] } }
    fun maxOrder(i: Int) = nb[i].maxOfOrNull { it.second } ?: 0
    fun doubles(i: Int) = nb[i].count { it.second == 2 }
    fun lonePairs(i: Int): Int { val bondE = nb[i].sumOf { it.second }; return max(0, ((VALENCE_E[atoms[i]] ?: 4) - bondE) / 2) }
    // hybridisation → ideal angle
    val sp2 = BooleanArray(n) { i -> maxOrder(i) == 2 && doubles(i) == 1 }
    val angle = DoubleArray(n) { i ->
        val lp = lonePairs(i)
        when {
            maxOrder(i) == 3 || doubles(i) >= 2 -> 180.0
            sp2[i] -> 120.0
            lp > 0 && atoms[i] in setOf("N", "O") && nb[i].any { sp2[it.first] } && atoms[i] == "N" -> 120.0   // amide / aromatic nitrogen is planar
            nb[i].size + lp == 3 -> 120.0
            else -> 109.5 - 2.5 * lp
        }
    }
    fun bondLen(a: Int, b: Int, o: Int): Double {
        var l = (COV[atoms[a]] ?: 0.77) + (COV[atoms[b]] ?: 0.77)
        l *= when (o) { 2 -> 0.87; 3 -> 0.78; else -> if (angle[a] < 125 && angle[b] < 125 && angle[a] > 115 && angle[b] > 115) 0.94 else 1.0 }
        return l
    }
    // distance targets: (i, j, d, weight)
    val tgt = ArrayList<DoubleArray>()
    for (b in bonds) tgt += doubleArrayOf(b[0].toDouble(), b[1].toDouble(), bondLen(b[0], b[1], b[2]), 1.0)
    for (c in 0 until n) for (p in nb[c].indices) for (q in p + 1 until nb[c].size) {
        val (a, oa) = nb[c][p]; val (b, ob) = nb[c][q]
        val la = bondLen(c, a, oa); val lb = bondLen(c, b, ob)
        val th = angle[c] * PI / 180
        tgt += doubleArrayOf(a.toDouble(), b.toDouble(), sqrt(la * la + lb * lb - 2 * la * lb * cos(th)), if (angle[c] > 179) 4.0 else 0.6)
    }
    // keep double bonds planar with cis/trans 1-4 distances; ring partners are cis
    fun sameRing(x: Int, y: Int, a: Int, b: Int): Boolean {
        val seen = HashSet<Int>(); var frontier = listOf(x); seen += x
        repeat(5) { val next = ArrayList<Int>(); for (u in frontier) for ((v, _) in nb[u]) if (v != a && v != b && seen.add(v)) { if (v == y) return true; next += v }; frontier = next }
        return false
    }
    for (bd in bonds.filter { it[2] == 2 }) {
        val a = bd[0]; val b = bd[1]
        val xs = nb[a].map { it.first }.filter { it != b }; val ys = nb[b].map { it.first }.filter { it != a }
        if (xs.isEmpty() || ys.isEmpty()) continue
        val side = HashMap<Int, Int>()
        val ringPair = xs.flatMap { x -> ys.map { y -> x to y } }.firstOrNull { (x, y) -> sameRing(x, y, a, b) }
        if (ringPair != null) { side[ringPair.first] = 1; side[ringPair.second] = 1 } else { side[xs[0]] = 1; side[ys[0]] = 1 }
        for (x in xs) side.putIfAbsent(x, -1); for (y in ys) side.putIfAbsent(y, -1)
        val L = bondLen(a, b, 2)
        for (x in xs) for (y in ys) {
            val lx = bondLen(a, x, 1); val ly = bondLen(b, y, 1)
            val ta = angle[a] * PI / 180; val tb = angle[b] * PI / 180
            val px = lx * cos(ta); val py = lx * sin(ta) * side.getValue(x)
            val qx = L - ly * cos(tb); val qy = ly * sin(tb) * side.getValue(y)
            tgt += doubleArrayOf(x.toDouble(), y.toDouble(), hypot(qx - px, qy - py), 0.4)
        }
    }
    val bonded = HashSet<Long>().apply { for (t in tgt) add(t[0].toLong() * 1000 + t[1].toLong()); for (t in tgt) add(t[1].toLong() * 1000 + t[0].toLong()) }
    var best: Triple<DoubleArray, DoubleArray, DoubleArray>? = null; var bestE = Double.MAX_VALUE
    for (attempt in 0 until 4) {
        val rnd = Random(seed + attempt * 31)
        val x = DoubleArray(n); val y = DoubleArray(n); val z = DoubleArray(n)
        // grow from atom 0 so the start is untangled
        val placed = BooleanArray(n); placed[0] = true
        val queue = ArrayDeque(listOf(0))
        while (queue.isNotEmpty()) { val u = queue.removeFirst(); for ((v, o) in nb[u]) if (!placed[v]) { placed[v] = true; val l = bondLen(u, v, o); val th = rnd.nextDouble() * PI * 2; val ph = acos(rnd.nextDouble() * 2 - 1); x[v] = x[u] + l * sin(ph) * cos(th); y[v] = y[u] + l * sin(ph) * sin(th); z[v] = z[u] + l * cos(ph); queue += v } }
        var e = 0.0
        val gx = DoubleArray(n); val gy = DoubleArray(n); val gz = DoubleArray(n)
        for (it in 0 until 2500) {
            gx.fill(0.0); gy.fill(0.0); gz.fill(0.0); e = 0.0
            for (t in tgt) {
                val i = t[0].toInt(); val j = t[1].toInt()
                val dx = x[j] - x[i]; val dy = y[j] - y[i]; val dz = z[j] - z[i]
                val d = sqrt(dx * dx + dy * dy + dz * dz).coerceAtLeast(1e-6)
                val diff = d - t[2]; e += t[3] * diff * diff
                val f = 2 * t[3] * diff / d
                gx[i] -= f * dx; gy[i] -= f * dy; gz[i] -= f * dz; gx[j] += f * dx; gy[j] += f * dy; gz[j] += f * dz
            }
            for (i in 0 until n) for (j in i + 1 until n) {
                if (i.toLong() * 1000 + j in bonded) continue
                val dx = x[j] - x[i]; val dy = y[j] - y[i]; val dz = z[j] - z[i]
                val d = sqrt(dx * dx + dy * dy + dz * dz).coerceAtLeast(1e-6)
                val min = if (atoms[i] == "H" || atoms[j] == "H") 2.2 else 2.8
                if (d < min) { val diff = d - min; e += 0.15 * diff * diff; val f = 0.3 * diff / d; gx[i] -= f * dx; gy[i] -= f * dy; gz[i] -= f * dz; gx[j] += f * dx; gy[j] += f * dy; gz[j] += f * dz }
            }
            val step = if (it < 300) 0.05 else 0.02
            for (i in 0 until n) { x[i] -= step * gx[i]; y[i] -= step * gy[i]; z[i] -= step * gz[i] }
        }
        if (e < bestE) { bestE = e; best = Triple(x.copyOf(), y.copyOf(), z.copyOf()) }
    }
    val (x, y, z) = best!!
    val cx = x.average(); val cy = y.average(); val cz = z.average()
    for (i in 0 until n) { x[i] -= cx; y[i] -= cy; z[i] -= cz }
    return Molecule(name, atoms, bonds, x, y, z)
}

val MOLECULES = listOf(
    "Water" to "O", "Ammonia" to "N", "Methane" to "C", "Carbon dioxide" to "O=C=O", "Oxygen" to "O=O", "Nitrogen" to "N#N",
    "Ethene" to "C=C", "Ethyne" to "C#C", "Formaldehyde" to "C=O", "Hydrogen cyanide" to "C#N", "Ethanol" to "CCO", "Acetic acid" to "CC(=O)O",
    "Glycine" to "NCC(=O)O", "Benzene" to "C1=CC=CC=C1", "Aspirin" to "CC(=O)OC1=CC=CC=C1C(=O)O", "Caffeine" to "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
)
