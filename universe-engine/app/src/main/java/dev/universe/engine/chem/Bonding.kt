package dev.universe.engine.chem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Element
import dev.universe.engine.data.Elements
import dev.universe.engine.data.Family
import kotlin.math.*

private val PICKS = listOf("H", "Li", "Be", "B", "C", "N", "O", "F", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "K", "Ca", "Br", "I", "Cs")

private fun isMetal(e: Element) = e.family in setOf(Family.Alkali, Family.Alkaline, Family.Transition, Family.PostTransition, Family.Lanthanide, Family.Actinide)

/** Common valence used to build the simplest neutral formula. */
private fun valence(e: Element): Int = when (e.symbol) {
    "H" -> 1; "B" -> 3; "C", "Si" -> 4; "N", "P" -> 3; "O", "S" -> 2; "F", "Cl", "Br", "I" -> 1
    else -> when (e.group) { 1 -> 1; 2 -> 2; 13 -> 3; else -> 2 }
}

private fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

private val BondingInfo = LabInfo(
    equations = listOf(
        "\\Delta\\chi = |\\chi_A - \\chi_B|",
        "\\text{ionic character} \\approx 1 - e^{-(\\Delta\\chi)^2/4}",
        "E_{AB} \\approx \\frac{E_{AA} + E_{BB}}{2} + 96.5\\,(\\Delta\\chi)^2 \\ \\text{kJ/mol}",
    ),
    about = "Every chemical bond is a tug-of-war for electrons. Electronegativity measures how hard an atom pulls. Between identical atoms the electrons are shared equally: a nonpolar covalent bond. A small difference makes a polar covalent bond, with the shared cloud leaning toward one side. A large difference — a reactive metal next to a halogen — and the electron is not shared at all but handed over, leaving two ions held together by electric attraction: an ionic bond. It is a continuum, not three boxes.",
    notes = listOf(
        "Electronegativities are Pauling values. The 0.4 and 1.7 boundaries are conventional teaching thresholds, not sharp physical limits.",
        "The cloud drawn is a schematic of where the bonding pair spends its time, shifted in proportion to Pauling's ionic-character estimate; it is not a computed electron density.",
        "The formula shown is the simplest neutral combination of common valences or ion charges. Many pairs form several compounds (sulfur and oxygen form both SO₂ and SO₃, for example); one plausible formula is shown.",
        "The bond-energy relation is Pauling's original estimate and only approximate.",
    ),
)

@Composable
fun BondingLab() {
    val ctx = LocalContext.current
    val els = remember { Elements.all(ctx).associateBy { it.symbol } }
    var a by remember { mutableStateOf("Na") }
    var b by remember { mutableStateOf("Cl") }
    var px by remember { mutableStateOf(IntSize.Zero) }
    val ea = els.getValue(a); val eb = els.getValue(b)
    val chiA = ea.electronegativity ?: 1.0; val chiB = eb.electronegativity ?: 1.0
    val d = abs(chiA - chiB)
    val ionic = 1 - exp(-d * d / 4)
    val bothMetal = isMetal(ea) && isMetal(eb)
    val kind = when { bothMetal -> "Metallic"; d < 0.4 -> "Nonpolar covalent"; d < 1.7 -> "Polar covalent"; else -> "Ionic" }
    val time by rememberTime()
    val tm = rememberTextMeasurer(cacheSize = 32)
    val field = remember(px) { if (px.width < 8) null else PixelField(px.width / 4, px.height / 4) }
    // the more electronegative atom attracts the pair
    val toward = if (chiA >= chiB) -1f else 1f
    val shift = (if (d < 1e-6) 0f else ionic.toFloat()) * toward

    LaunchedEffect(field, a, b) {
        val f = field ?: return@LaunchedEffect
        val w = f.w; val h = f.h
        val ax = w * 0.32f; val bx = w * 0.68f; val cy = h * 0.42f
        val sep = bx - ax
        val ra = ((ea.radius ?: 100.0) / 260.0 * sep).toFloat().coerceIn(sep * 0.18f, sep * 0.55f); val rb = ((eb.radius ?: 100.0) / 260.0 * sep).toFloat().coerceIn(sep * 0.18f, sep * 0.55f)
        val mid = (ax + bx) / 2 + shift * sep * 0.5f
        val pairX = if (bothMetal) Float.NaN else mid
        val sig = if (abs(shift) > 0.75f) sep * 0.22f else sep * (0.32f - abs(shift) * 0.1f)
        for (y in 0 until h) for (x in 0 until w) {
            val core = exp(-((x - ax).pow(2) + (y - cy).pow(2)) / (2 * (ra * 0.55f).pow(2))) * 0.6f + exp(-((x - bx).pow(2) + (y - cy).pow(2)) / (2 * (rb * 0.55f).pow(2))) * 0.6f
            val pair = if (pairX.isNaN()) 0.35f * (exp(-(y - cy).pow(2) / (2 * (sep * 0.5f).pow(2))) * 0.6f).toFloat() else exp(-((x - pairX).pow(2) / (2 * sig * sig) + (y - cy).pow(2) / (2 * (sig * 0.65f).pow(2))))
            val v = (core + pair * 1.1f).coerceIn(0f, 1.4f) / 1.4f
            val r = (v * v * 110).toInt(); val g = (v * 200).toInt(); val bb = (min(1f, v * 1.4f) * 255).toInt()
            f.px[y * w + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or bb
        }
        f.flush()
    }

    LabScaffold("Chemical Bonding", Domain.Chem, BondingInfo, canvas = {
        Canvas(Modifier.fillMaxSize().onSizeChanged { px = it }) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            field?.let { drawField(it, additive = false, alpha = 0.9f) }
            val ax = w * 0.32f; val bx = w * 0.68f; val cy = h * 0.42f
            for ((x, e, sign) in listOf(Triple(ax, ea, if (bothMetal) 0f else -shift), Triple(bx, eb, if (bothMetal) 0f else shift))) {
                drawCircle(lerp(e.family.color, Color.White, 0.25f), 16 * dp, Offset(x, cy))
                label(tm, e.symbol, x, cy, UE.Void, 15f, 0.5f, 0.5f, UE.Display, FontWeight.Bold)
                val chargeTxt = when { bothMetal -> ""; kind == "Ionic" -> if (sign < 0) "+" else "−"; abs(sign) > 0.03f -> if (sign < 0) "δ+" else "δ−"; else -> "" }
                if (chargeTxt.isNotEmpty()) label(tm, chargeTxt, x + 18 * dp, cy - 20 * dp, if (chargeTxt.contains("+")) UE.Magenta else UE.Cyan, 15f, 0f, 1f, UE.Math)
                label(tm, "χ = ${e.electronegativity?.let { fix(it, 2) } ?: "—"}", x, cy + 26 * dp, UE.Text, 11f, 0.5f, 0f)
            }
            // orbiting bonding electrons
            if (!bothMetal) {
                val mid = (ax + bx) / 2 + shift * (bx - ax) * 0.5f
                for (k in 0..1) { val ang = time * 3f + k * PI.toFloat(); val rr = (bx - ax) * (0.2f - abs(shift) * 0.08f); glowDot(Offset(mid + cos(ang) * rr, cy + sin(ang) * rr * 0.45f), Color.White, 3.2f * dp) }
            } else for (k in 0 until 8) { val x = ((time * 0.12f + k / 8f) % 1f) * w; glowDot(Offset(x, cy + sin(time * 2 + k) * 30 * dp), Color.White, 2.6f * dp) }
            // the continuum
            val l = 24 * dp; val r = w - 24 * dp; val y = h * 0.82f
            val zones = listOf(Triple(0f, 0.4f, UE.Green), Triple(0.4f, 1.7f, UE.Cyan), Triple(1.7f, 3.3f, UE.Magenta))
            for ((z0, z1, c) in zones) drawRoundRect(c.copy(alpha = 0.35f), Offset(l + (r - l) * z0 / 3.3f, y), Size((r - l) * (z1 - z0) / 3.3f - 2, 10 * dp), CornerRadius(3 * dp))
            label(tm, "nonpolar", l, y + 14 * dp, UE.Green, 9.5f); label(tm, "polar covalent", l + (r - l) * 1.05f / 3.3f, y + 14 * dp, UE.Cyan, 9.5f, 0.5f, 0f); label(tm, "ionic", r, y + 14 * dp, UE.Magenta, 9.5f, 1f, 0f)
            val mx = l + (r - l) * (d / 3.3).toFloat().coerceIn(0f, 1f)
            drawLine(Color.White, Offset(mx, y - 8 * dp), Offset(mx, y + 18 * dp), 2 * dp); glowDot(Offset(mx, y - 8 * dp), Color.White, 3.5f * dp)
            label(tm, "Δχ = ${fix(d, 2)}", mx, y - 12 * dp, UE.Text, 11f, 0.5f, 1f)
        }
    }) {
        SectionLabel("First atom")
        ChipRow(PICKS, PICKS.indexOf(a), Domain.Chem.accent) { a = PICKS[it] }
        SectionLabel("Second atom")
        ChipRow(PICKS, PICKS.indexOf(b), UE.Violet) { b = PICKS[it] }
        val formula = when {
            a == b && !isMetal(ea) -> "${a}₂"
            bothMetal -> "alloy / metallic solid"
            else -> {
                val (cat, an) = if (chiA <= chiB) ea to eb else eb to ea
                val vc = valence(cat); val va = valence(an)
                val g = gcd(vc, va)
                val nc = va / g; val na = vc / g
                fun part(s: String, n: Int) = s + (if (n > 1) subscript(n) else "")
                if (cat.symbol == "H" && an.symbol in setOf("N", "C", "P", "Si", "B")) part(an.symbol, na) + part("H", nc)
                else part(cat.symbol, nc) + part(an.symbol, na)
            }
        }
        ReadoutRow { Stat("bond type", kind, when (kind) { "Ionic" -> UE.Magenta; "Polar covalent" -> UE.Cyan; "Metallic" -> UE.Amber; else -> UE.Green }); Stat("ionic character", "${(ionic * 100).roundToInt()} %"); Stat("likely formula", formula, Domain.Chem.accent) }
        Note(when (kind) {
            "Ionic" -> "${ea.name} and ${eb.name}: the electron is effectively transferred. The ions arrange themselves in a crystal lattice rather than forming separate molecules."
            "Polar covalent" -> "The pair is shared unequally: the ${if (chiA > chiB) ea.name else eb.name} end carries a partial negative charge. Water's polar O–H bonds are why it dissolves salt and holds together as a liquid."
            "Metallic" -> "Two metals share their outer electrons in a delocalised 'sea' that flows freely between the ions — which is why metals conduct electricity and can be bent rather than shattered."
            else -> "Equal or nearly equal pull: the electrons sit symmetrically between the nuclei."
        })
    }
}
