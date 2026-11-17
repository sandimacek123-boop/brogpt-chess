package dev.universe.engine.chem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Elements
import kotlin.math.*

val CPK = mapOf("H" to Color(0xFFF2F4F8), "C" to Color(0xFF5B6273), "N" to Color(0xFF3E6BFF), "O" to Color(0xFFFF3D4F), "S" to Color(0xFFFFD23F), "P" to Color(0xFFFF8A2B), "F" to Color(0xFF7CF57C), "Cl" to Color(0xFF3EE05B), "Br" to Color(0xFFA0322B), "I" to Color(0xFF8A3BD1), "B" to Color(0xFFFFB5A0))
private val VDW = mapOf("H" to 1.2, "C" to 1.7, "N" to 1.55, "O" to 1.52, "S" to 1.8, "P" to 1.8, "F" to 1.47, "Cl" to 1.75, "Br" to 1.85, "I" to 1.98, "B" to 1.92)

private fun shapeName(bonds: Int, lone: Int): String = when (bonds to lone) {
    1 to 0, 1 to 1, 1 to 2, 1 to 3 -> "terminal"
    2 to 0 -> "linear"; 3 to 0 -> "trigonal planar"; 2 to 1 -> "bent (~120°)"; 4 to 0 -> "tetrahedral"; 3 to 1 -> "trigonal pyramidal"; 2 to 2 -> "bent (~104.5°)"
    else -> "—"
}

private val MoleculesInfo = LabInfo(
    equations = listOf(
        "\\text{steric number} = \\text{bonded atoms} + \\text{lone pairs}",
        "2 \\to 180\\degree, \\quad 3 \\to 120\\degree, \\quad 4 \\to 109.5\\degree",
        "\\vec{\\mu} \\approx \\sum_{\\text{bonds}} \\Delta\\chi \\, \\hat{d}",
    ),
    about = "A molecule's shape follows from one idea, Valence Shell Electron Pair Repulsion: electron pairs around an atom push each other as far apart as possible. Four pairs point to the corners of a tetrahedron; lone pairs push a little harder than bonds, which is why water bends to 104.5° rather than 109.5°. Shape decides polarity — the two polar bonds of carbon dioxide cancel because the molecule is straight, while water's do not — and polarity decides almost everything else: whether a substance dissolves, how high it boils, how it interacts with life.",
    notes = listOf(
        "Geometries are computed on the device from the bonding pattern alone, using ideal bond lengths (sums of covalent radii) and VSEPR angles, then relaxed. They are close to, but not identical with, measured or quantum-chemically optimised structures.",
        "Rotation about single bonds is not optimised, so flexible molecules show one reasonable conformation, not necessarily the lowest-energy one.",
        "The dipole arrow is a bond-dipole estimate from Pauling electronegativity differences; it ignores lone pairs and is only a qualitative guide.",
        "Benzene is drawn in one Kekulé form with alternating single and double bonds; in reality all six bonds are identical, a resonance hybrid.",
    ),
)

@Composable
fun MoleculesLab() {
    val ctx = LocalContext.current
    var mi by remember { mutableIntStateOf(0) }
    val mol = remember(mi) { buildMolecule(MOLECULES[mi].first, MOLECULES[mi].second) }
    var spaceFill by remember { mutableStateOf(false) }
    var showDipole by remember { mutableStateOf(true) }
    var labels by remember { mutableStateOf(true) }
    var spin by remember { mutableStateOf(true) }
    var sel by remember(mi) { mutableIntStateOf(0) }
    val cam = remember { Cam3(0.5f, 0.3f, 6f, 1.8f) }
    LaunchedEffect(mi) { val r = mol.atoms.indices.maxOf { sqrt(mol.x[it].pow(2) + mol.y[it].pow(2) + mol.z[it].pow(2)) }; cam.dist = (r * 2.3 + 2.6).toFloat() }
    rememberTicker(spin) { dt -> cam.yaw += dt * 0.4f }
    val tm = rememberTextMeasurer(cacheSize = 64)
    val proj = remember(mi) { Array(mol.atoms.size) { FloatArray(4) } }
    val masses = remember { Elements.all(ctx).associate { it.symbol to it.mass } }
    // dipole estimate
    var dx = 0.0; var dy = 0.0; var dz = 0.0
    for (b in mol.bonds) {
        val a = b[0]; val c = b[1]
        val d = (PAULING[mol.atoms[c]] ?: 2.5) - (PAULING[mol.atoms[a]] ?: 2.5)
        val l = mol.distance(a, c)
        dx += d * (mol.x[c] - mol.x[a]) / l; dy += d * (mol.y[c] - mol.y[a]) / l; dz += d * (mol.z[c] - mol.z[a]) / l
    }
    val dip = sqrt(dx * dx + dy * dy + dz * dz)

    LabScaffold("Molecules in 3D", Domain.Chem, MoleculesInfo, canvas = {
        Canvas(Modifier.fillMaxSize().orbitGestures(cam, 2f, 40f) { spin = false }.plotInteract(null, key = mi, onTap = { o ->
            val hit = mol.atoms.indices.filter { proj[it][2] > 0 }.minByOrNull { (Offset(proj[it][0], proj[it][1]) - o).getDistance() }
            if (hit != null && (Offset(proj[hit][0], proj[hit][1]) - o).getDistance() < proj[hit][3] * 0.9f + 30f) sel = hit
        })) {
            val dp = 1.dp.toPx()
            cam.begin(size.width, size.height, 0.48f)
            for (i in mol.atoms.indices) { val ok = cam.project(mol.x[i].toFloat(), mol.y[i].toFloat(), mol.z[i].toFloat(), proj[i]); if (!ok) proj[i][2] = -1f }
            fun rad(i: Int) = (if (spaceFill) (VDW[mol.atoms[i]] ?: 1.7) * 0.95 else if (mol.atoms[i] == "H") 0.26 else 0.38).toFloat() * proj[i][3]
            val order = mol.atoms.indices.sortedByDescending { proj[it][2] }
            val rank = IntArray(mol.atoms.size).also { r -> order.forEachIndexed { k, i -> r[i] = k } }
            for ((k, i) in order.withIndex()) {
                if (!spaceFill) for (b in mol.bonds) {
                    val j = if (b[0] == i) b[1] else if (b[1] == i) b[0] else continue
                    if (rank[j] < k) continue   // each bond is drawn once, just before its farther atom, so nearer atoms cover it
                    val p = Offset(proj[i][0], proj[i][1]); val q = Offset(proj[j][0], proj[j][1])
                    val d = q - p; val len = d.getDistance().coerceAtLeast(1f); val nrm = Offset(-d.y, d.x) / len
                    val w = 0.1f * (proj[i][3] + proj[j][3]) / 2
                    val offs = when (b[2]) { 2 -> listOf(-0.75f, 0.75f); 3 -> listOf(-1.4f, 0f, 1.4f); else -> listOf(0f) }
                    for (o in offs) {
                        val sh = nrm * (o * w * (if (b[2] == 1) 1f else 1.1f))
                        val mid = (p + q) / 2f
                        drawLine(lerp(CPK[mol.atoms[i]] ?: Color.Gray, Color.Black, 0.25f), p + sh, mid + sh, w * (if (b[2] == 1) 1f else 0.62f), StrokeCap.Round)
                        drawLine(lerp(CPK[mol.atoms[j]] ?: Color.Gray, Color.Black, 0.25f), mid + sh, q + sh, w * (if (b[2] == 1) 1f else 0.62f), StrokeCap.Round)
                    }
                }
                val c = Offset(proj[i][0], proj[i][1]); val r = rad(i); val col = CPK[mol.atoms[i]] ?: Color.Gray
                drawCircle(Brush.radialGradient(listOf(lerp(col, Color.White, 0.55f), col, lerp(col, Color.Black, 0.7f)), c - Offset(r * 0.35f, r * 0.35f), r * 1.5f), r, c)
                if (i == sel) drawCircle(UE.Amber, r + 4 * dp, c, style = Stroke(1.6f * dp))
                if (labels && (mol.atoms[i] != "H" || mol.atoms.size < 8) && r > 7 * dp) label(tm, mol.atoms[i], c.x, c.y, if (mol.atoms[i] in setOf("H", "S", "F", "Cl")) Color.Black else Color.White, (r / dp * 0.7f).coerceIn(9f, 15f), 0.5f, 0.5f, UE.Display, FontWeight.Bold)
            }
            if (showDipole && dip > 0.15) {
                val s = 1.3f / dip.toFloat()
                val o = FloatArray(4); val e = FloatArray(4)
                if (cam.project((-dx * s).toFloat(), (-dy * s).toFloat(), (-dz * s).toFloat(), o) && cam.project((dx * s).toFloat(), (dy * s).toFloat(), (dz * s).toFloat(), e)) {
                    val a = Offset(o[0], o[1]); val b = Offset(e[0], e[1])
                    drawLine(UE.Amber.copy(alpha = 0.2f), a, b, 9 * dp, blendMode = BlendMode.Plus)
                    arrow(a, b, UE.Amber, 2.4f * dp, 13 * dp)
                    val nrm = (b - a).let { Offset(-it.y, it.x) / it.getDistance().coerceAtLeast(1f) }
                    drawLine(UE.Amber, a + nrm * (7 * dp) + (b - a) * 0.12f, a - nrm * (7 * dp) + (b - a) * 0.12f, 2.4f * dp)
                    label(tm, "δ+", a.x, a.y - 12 * dp, UE.Amber, 11f, 0.5f, 1f, UE.Math); label(tm, "δ−", b.x, b.y - 12 * dp, UE.Amber, 11f, 0.5f, 1f, UE.Math)
                }
            }
        }
    }) {
        ChipRow(MOLECULES.map { it.first }, mi, Domain.Chem.accent) { mi = it }
        val mass = mol.atoms.sumOf { masses[it] ?: 0.0 }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            T(mol.formula(), size = 24.sp, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
            T("${fix(mass, 2)} g/mol", size = 14.sp, font = UE.Mono, color = Domain.Chem.accent)
        }
        val nbs = mol.neighbours(sel)
        val bondE = mol.bonds.filter { it[0] == sel || it[1] == sel }.sumOf { it[2] }
        val ve = mapOf("H" to 1, "C" to 4, "N" to 5, "O" to 6, "S" to 6, "F" to 7, "Cl" to 7)[mol.atoms[sel]] ?: 4
        val lp = max(0, (ve - bondE) / 2)
        val angles = if (nbs.size >= 2) nbs.indices.flatMap { p -> (p + 1 until nbs.size).map { q -> mol.angle(nbs[p], sel, nbs[q]) } } else emptyList()
        ReadoutRow {
            Stat("selected atom", mol.atoms[sel], CPK[mol.atoms[sel]] ?: UE.Text); Stat("bonded / lone pairs", "${nbs.size} / $lp")
            Stat("shape", shapeName(nbs.size, lp), UE.Amber)
        }
        if (angles.isNotEmpty()) ReadoutRow { Stat("bond angles", angles.map { fix(it, 1) + "°" }.distinct().take(4).joinToString("  ")) }
        ReadoutRow { Stat("atoms", mol.atoms.size.toString()); Stat("bonds", mol.bonds.size.toString()); Stat("net dipole", if (dip < 0.15) "≈ 0  (nonpolar)" else "${fix(dip, 2)}  (polar)", UE.Amber) }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Toggle("Space-filling", spaceFill, accent = Domain.Chem.accent) { spaceFill = it }
            Toggle("Dipole", showDipole, accent = UE.Amber) { showDipole = it }
            Toggle("Labels", labels) { labels = it }
        }
        Note("Drag to rotate, pinch to zoom, tap an atom to see its geometry.")
    }
}
