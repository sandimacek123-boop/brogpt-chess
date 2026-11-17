package dev.universe.engine.chem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import dev.universe.engine.data.Element
import dev.universe.engine.data.Elements
import dev.universe.engine.data.Family
import dev.universe.engine.data.yearText
import kotlin.math.*

private val MODES = listOf("Families", "State at T", "Electronegativity", "Atomic radius", "Ionization energy", "Melting point", "Density", "Discovery")

/** Bohr-model electron shells, electrons orbiting at a gentle animated pace. */
fun DrawScope.drawShells(e: Element, t: Float, accent: Color, center: Offset, maxR: Float) {
    val n = e.shells.size
    val core = maxR * 0.13f
    drawCircle(accent.copy(alpha = 0.3f), core * 1.8f, center, blendMode = BlendMode.Plus)
    drawCircle(lerp(accent, Color.White, 0.5f), core, center)
    for (k in 0 until n) {
        val r = core * 1.6f + (maxR - core * 1.6f) * (k + 1) / n
        drawCircle(Color.White.copy(alpha = 0.18f), r, center, style = Stroke(1f))
        val cnt = e.shells[k]
        val speed = 0.9f / (k + 1)
        for (i in 0 until cnt) {
            val a = i * 2 * PI.toFloat() / cnt + t * speed + k * 0.7f
            val p = center + Offset(cos(a) * r, sin(a) * r)
            drawCircle(UE.Cyan.copy(alpha = 0.25f), 3.6f.coerceAtMost(maxR * 0.05f) * 1.8f, p, blendMode = BlendMode.Plus)
            drawCircle(Color.White, 2.2f.coerceAtMost(maxR * 0.03f).coerceAtLeast(1.4f), p)
        }
    }
}

private val PtInfo = LabInfo(
    equations = listOf(
        "E_n = -\\frac{13.6\\ \\text{eV}\\, Z_{\\text{eff}}^2}{n^2}",
        "1s\\quad 2s\\quad 2p\\quad 3s\\quad 3p\\quad 4s\\quad 3d\\quad 4p\\quad 5s\\quad 4d\\quad 5p\\quad 6s\\quad 4f\\quad 5d\\quad 6p\\quad 7s\\quad 5f\\quad 6d\\quad 7p",
    ),
    about = "Mendeleev arranged the elements by mass and chemical behaviour in 1869, leaving gaps for elements nobody had yet found — and predicting their properties correctly. Today the order is by atomic number, and the shape of the table is a map of how electrons fill their shells: two columns for s orbitals, six for p, ten for d and fourteen for f. Elements in the same column have the same arrangement of outer electrons, which is why they behave alike. Tap any element; choose a colouring to see trends sweep across the table, or drag the temperature to watch the elements melt and boil.",
    notes = listOf(
        "Data are standard reference values compiled from Wikipedia via the open 'periodic-table-data-complete' dataset (MIT licence). Values for the heaviest elements are often predictions or extrapolations.",
        "Melting and boiling points are at one atmosphere. A few elements (carbon, arsenic) sublime rather than melt at that pressure, and helium does not freeze at all without extra pressure; the state view follows the tabulated numbers.",
        "Electron shell diagrams use the simple Bohr picture of electrons on circles. Real electrons occupy orbitals — see the Atom and Orbitals laboratory.",
    ),
)

@Composable
fun PeriodicTableLab() {
    val app = LocalApp.current
    val ctx = LocalContext.current
    val els = remember { Elements.all(ctx) }
    var mode by remember { mutableIntStateOf(0) }
    var sel by remember { mutableIntStateOf(26) }
    var temp by remember { mutableFloatStateOf(298f) }
    var spelled by remember { mutableStateOf(listOf<String>()) }
    val view = remember { PlotView(9.5, -5.3, 19.0, minSpan = 4.0, maxSpan = 22.0) }
    val tm = rememberTextMeasurer(cacheSize = 400)
    val time by rememberTime()
    val e = els[sel - 1]

    fun value(x: Element): Double? = when (mode) {
        2 -> x.electronegativity; 3 -> x.radius; 4 -> x.ionization; 5 -> x.melt; 6 -> x.density?.takeIf { it > 0 }?.let { ln(it) }; 7 -> x.year?.toDouble()?.let { if (it < 0) 1600.0 else it }; else -> null
    }
    val range = remember(mode) { val v = els.mapNotNull { value(it) }; if (v.isEmpty()) 0.0 to 1.0 else v.min() to v.max() }
    fun cellColor(x: Element): Color = when (mode) {
        0 -> x.family.color
        1 -> when (x.stateAt(temp.toDouble())) { "solid" -> UE.Blue; "liquid" -> UE.Cyan; "gas" -> UE.Amber; else -> UE.Faint }
        else -> value(x)?.let { UE.ramp(((it - range.first) / (range.second - range.first)).toFloat().coerceIn(0f, 1f) * 0.94f + 0.03f) } ?: UE.Faint
    }

    LabScaffold("Periodic Table", Domain.Chem, PtInfo, canvas = {
        Canvas(
            Modifier.fillMaxSize().plotInteract(view, onTap = { o ->
                val cx = view.wx(o.x); val cy = -view.wy(o.y)
                val hit = els.firstOrNull { cx >= it.col - 0.5 && cx < it.col + 0.5 && cy >= it.row - 0.5 && cy < it.row + 0.5 + (if (it.isF) 0.0 else 0.0) }
                if (hit != null) {
                    sel = hit.z
                    spelled = (spelled + hit.symbol).takeLast(4)
                    if (spelled == listOf("Ge", "Ni", "U", "S")) app.discover("genius")
                }
            }),
        ) {
            view.bind(this)
            val dp = 1.dp.toPx()
            val cell = view.scale.toFloat()
            fun tl(col: Int, row: Double) = view.pt(col - 0.46, -(row - 0.46))
            for (x in els) {
                val row = x.row.toDouble() + (if (x.isF) 0.0 else 0.0)
                val p = tl(x.col, row)
                if (p.x > size.width || p.y > size.height || p.x + cell < 0 || p.y + cell < 0) continue
                val col = cellColor(x)
                val s = Size(cell * 0.92f, cell * 0.92f)
                val selected = x.z == sel
                drawRoundRect(col.copy(alpha = if (selected) 0.5f else 0.2f), p, s, CornerRadius(cell * 0.12f))
                drawRoundRect(col.copy(alpha = if (selected) 1f else 0.6f), p, s, CornerRadius(cell * 0.12f), style = Stroke((if (selected) 2f else 1f) * dp))
                if (cell > 16 * dp) {
                    label(tm, x.symbol, p.x + s.width / 2, p.y + s.height * 0.52f, UE.Text, (cell / dp * 0.36f).coerceAtMost(22f), 0.5f, 0.5f, UE.Display, FontWeight.Medium)
                    if (cell > 30 * dp) label(tm, x.z.toString(), p.x + cell * 0.08f, p.y + cell * 0.06f, UE.Text.copy(alpha = 0.7f), (cell / dp * 0.17f).coerceAtMost(11f))
                    if (cell > 52 * dp) label(tm, x.name, p.x + s.width / 2, p.y + s.height * 0.86f, UE.Text.copy(alpha = 0.7f), (cell / dp * 0.12f).coerceAtMost(10f), 0.5f, 0.5f, UE.Display)
                }
            }
            // f-block placeholders and connector
            for ((row, txt) in listOf(6 to "57–71", 7 to "89–103")) {
                val p = tl(3, row.toDouble())
                drawRoundRect(UE.Faint.copy(alpha = 0.5f), p, Size(cell * 0.92f, cell * 0.92f), CornerRadius(cell * 0.12f), style = Stroke(dp))
                if (cell > 22 * dp) label(tm, txt, p.x + cell * 0.46f, p.y + cell * 0.46f, UE.Dim, (cell / dp * 0.15f).coerceAtMost(10f), 0.5f, 0.5f)
            }
            // group numbers
            if (cell > 14 * dp) for (g in 1..18) { val p = view.pt(g.toDouble(), -0.25); label(tm, g.toString(), p.x, p.y, UE.Dim, (cell / dp * 0.2f).coerceIn(7f, 11f), 0.5f, 1f) }
            // mini detail of the selected element in an empty corner of the table
            val box = view.pt(3.6, -0.6); val boxEnd = view.pt(12.4, -3.4)
            val bw = boxEnd.x - box.x; val bh = boxEnd.y - box.y
            if (bw > 120 * dp) {
                drawShells(e, time, e.family.color, Offset(box.x + bh * 0.5f, box.y + bh * 0.5f), bh * 0.46f)
                label(tm, e.symbol, box.x + bh * 1.05f, box.y + bh * 0.05f, lerp(e.family.color, Color.White, 0.3f), (bh / dp * 0.34f).coerceAtMost(46f), 0f, 0f, UE.Display, FontWeight.Bold)
                label(tm, "${e.z} · ${e.name}", box.x + bh * 1.05f, box.y + bh * 0.52f, UE.Text, (bh / dp * 0.12f).coerceIn(9f, 16f), 0f, 0f, UE.Display)
                label(tm, e.config, box.x + bh * 1.05f, box.y + bh * 0.72f, UE.Dim, (bh / dp * 0.1f).coerceIn(8f, 13f), 0f, 0f)
            }
        }
    }) {
        ChipRow(MODES, mode, Domain.Chem.accent) { mode = it }
        if (mode == 1) {
            UESlider("Temperature", temp, 0f..6500f, accent = UE.Amber, format = { "${fix(it, 0)} K  (${fix(it - 273.15f, 0)} °C)" }) { temp = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { for ((n, k) in listOf("Absolute zero" to 0f, "Room" to 298f, "Venus" to 737f, "Sun's surface" to 5772f)) Chip(n, abs(temp - k) < 1f, UE.Amber) { temp = k } }
            val counts = els.groupingBy { it.stateAt(temp.toDouble()) ?: "unknown" }.eachCount()
            ReadoutRow { Stat("solid", "${counts["solid"] ?: 0}", UE.Blue); Stat("liquid", "${counts["liquid"] ?: 0}", UE.Cyan); Stat("gas", "${counts["gas"] ?: 0}", UE.Amber); Stat("unknown", "${counts["unknown"] ?: 0}", UE.Dim) }
        } else if (mode == 0) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Family.entries.chunked(5).forEach { col -> Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) { col.forEach { f -> Row(verticalAlignment = Alignment.CenterVertically) { Canvas(Modifier.size(9.dp)) { drawRoundRect(f.color, cornerRadius = CornerRadius(2.dp.toPx())) }; Spacer(Modifier.width(5.dp)); T(f.label, size = 10.5.sp, color = UE.Dim, maxLines = 1) } } } }
            }
        } else {
            val unit = when (mode) { 2 -> "Pauling"; 3 -> "pm"; 4 -> "kJ/mol"; 5 -> "K"; 6 -> "kg/m³ (log)"; else -> "year" }
            Note("Low ${fmt(if (mode == 6) exp(range.first) else range.first, 3)} → high ${fmt(if (mode == 6) exp(range.second) else range.second, 3)} $unit. Grey: no reliable value.")
        }
        Column(Modifier.fillMaxWidth().glass(16.dp, e.family.color, fill = 0.07f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(58.dp).glass(12.dp, e.family.color, fill = 0.18f), contentAlignment = Alignment.Center) { T(e.symbol, size = 24.sp, weight = FontWeight.Bold, color = lerp(e.family.color, Color.White, 0.35f)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    T(e.name, size = 19.sp, weight = FontWeight.Medium)
                    T("${e.z} · ${e.family.label.removeSuffix("s")} · ${e.block}", size = 12.sp, color = e.family.color)
                }
            }
            ReadoutRow { Stat("atomic mass", fmt(e.mass, 6)); Stat("configuration", e.config.ifBlank { "—" }, UE.Cyan) }
            ReadoutRow { Stat("electroneg.", e.electronegativity?.let { fix(it, 2) } ?: "—"); Stat("1st ionization", e.ionization?.let { "${fix(it, 0)} kJ/mol" } ?: "—"); Stat("radius", e.radius?.let { "${fix(it, 0)} pm" } ?: "—") }
            ReadoutRow { Stat("melts", e.melt?.let { "${fix(it, 1)} K" } ?: "—", UE.Blue); Stat("boils", e.boil?.let { "${fix(it, 1)} K" } ?: "—", UE.Amber); Stat("density", e.density?.let { "${fmt(it / 1000, 4)} g/cm³" } ?: "—") }
            ReadoutRow { Stat("shells", e.shells.joinToString(" · ")); Stat("discovered", yearText(e.year), UE.Violet) }
            if (e.summary.isNotBlank()) T(e.summary, size = 12.5.sp, color = UE.Text.copy(alpha = 0.85f), lineHeight = 18.sp)
            e.discoverer?.takeIf { (e.year ?: 0) > 0 }?.let { T("Discovered by $it", size = 11.5.sp, color = UE.Dim) }
        }
        Note("Pinch and drag the table to zoom in; names appear as cells grow.")
    }
}
