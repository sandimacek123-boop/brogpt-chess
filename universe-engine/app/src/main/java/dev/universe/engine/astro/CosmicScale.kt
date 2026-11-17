package dev.universe.engine.astro

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalApp
import dev.universe.engine.core.ui.*
import kotlin.math.*

private class Thing(val name: String, val size: Double, val color: Color, val note: String)

private val THINGS = listOf(
    Thing("Planck length", 1.616e-35, UE.Magenta, "Where our theories of gravity and quantum mechanics both claim jurisdiction and neither works."),
    Thing("Quark / electron", 1e-18, UE.Violet, "Upper limit on their size: no experiment has found any structure in them. They may be truly point-like."),
    Thing("Proton", 1.68e-15, UE.Red, "Three quarks bound by gluons. Almost all of the mass of the matter around you is the energy of that binding."),
    Thing("Uranium nucleus", 1.5e-14, UE.Amber, "92 protons and 146 neutrons. If an atom were a stadium, its nucleus would be a pea at the centre."),
    Thing("Hydrogen atom", 1.06e-10, UE.Cyan, "A proton and a cloud of probability where the electron might be found. The atom is 99.9999999999996 % empty space."),
    Thing("Water molecule", 2.8e-10, UE.Blue, "Two hydrogens bent at 104.5° to one oxygen: the shape that makes water such a strange and life-friendly liquid."),
    Thing("DNA double helix (width)", 2e-9, UE.Green, "Two nanometres wide — and about two metres long, if you unwound all the DNA in a single one of your cells."),
    Thing("Virus", 1e-7, UE.Magenta, "Influenza, about 100 nm: too small to see with visible light, whose wavelength is several times larger."),
    Thing("Wavelength of green light", 5.3e-7, UE.Green, "The ruler that sets what microscopes can see."),
    Thing("Bacterium (E. coli)", 2e-6, UE.Cyan, "A complete living cell, two micrometres long, that can copy itself in twenty minutes."),
    Thing("Red blood cell", 7.5e-6, UE.Red, "You have about 25 trillion of them."),
    Thing("Human hair (width)", 7e-5, UE.Amber, "Roughly the smallest thing you can see with the naked eye."),
    Thing("Grain of sand", 5e-4, Color(0xFFE8C98A), "There are about as many stars in the observable Universe as grains of sand on all of Earth's beaches — give or take a factor of a hundred."),
    Thing("Ant", 4e-3, UE.Amber, "Collectively, ants may outweigh all wild mammals on Earth."),
    Thing("Human", 1.7, UE.Text, "You are here: almost exactly halfway, on a logarithmic scale, between the Planck length and the observable Universe."),
    Thing("Blue whale", 25.0, UE.Blue, "The largest animal ever known to have lived."),
    Thing("Eiffel Tower", 330.0, Color(0xFFBFA27A), "Grows about 15 cm taller in summer, as the iron expands."),
    Thing("Mount Everest", 8849.0, Color(0xFFD7E6FF), "Its summit is the highest point above sea level; Earth's surface is still smoother than a billiard ball, in proportion."),
    Thing("The Moon", 3.4748e6, Color(0xFFCFCFCF), "Slowly drifting away from Earth by 3.8 cm a year."),
    Thing("Earth", 1.2742e7, Color(0xFF4F9BFF), "Light could circle it 7.5 times in one second."),
    Thing("Jupiter", 1.3982e8, Color(0xFFD9B38C), "Eleven Earths across."),
    Thing("The Sun", 1.3927e9, Color(0xFFFFD27A), "A hundred and nine Earths across, holding 99.86 % of the Solar System's mass."),
    Thing("Earth's orbit", 2.99e11, Color(0xFF4F9BFF), "Two astronomical units across. Sunlight takes 8 minutes 20 seconds to reach us."),
    Thing("Neptune's orbit", 9e12, Color(0xFF4A6FFF), "The planets' realm: light takes about four hours to cross it."),
    Thing("One light-year", 9.46e15, UE.Amber, "Nine and a half trillion kilometres."),
    Thing("Distance to Proxima Centauri", 4.0e16, Color(0xFFFF8A5B), "The nearest star after the Sun, 4.24 light-years away. Our fastest probe would take over 70,000 years."),
    Thing("Orion Nebula", 2.3e17, UE.Magenta, "A stellar nursery 24 light-years across, visible to the naked eye as the fuzzy middle 'star' of Orion's sword."),
    Thing("Milky Way", 9.5e20, Color(0xFFBFD4FF), "About 100,000 light-years across and a few hundred billion stars."),
    Thing("Distance to Andromeda", 2.4e22, Color(0xFFBFD4FF), "2.5 million light-years. It is heading toward us and will merge with the Milky Way in about 4.5 billion years."),
    Thing("Local Group", 1e23, UE.Violet, "About 80 galaxies bound together by gravity."),
    Thing("Laniakea Supercluster", 4.9e24, UE.Cyan, "Our 'immeasurable heaven': 100,000 galaxies flowing toward a common centre."),
    Thing("Observable Universe", 8.8e26, UE.Text, "93 billion light-years across: as far as light has been able to travel to us in 13.8 billion years, allowing for the expansion of space."),
)

private fun sizeStr(m: Double): String = when {
    m < 1e-12 -> "${fmt(m, 3)} m"
    m < 1e-9 -> "${fmt(m * 1e12, 3)} pm"
    m < 1e-6 -> "${fmt(m * 1e9, 3)} nm"
    m < 1e-3 -> "${fmt(m * 1e6, 3)} µm"
    m < 1 -> "${fmt(m * 1e3, 3)} mm"
    m < 1e4 -> "${fmt(m, 3)} m"
    m < 1e11 -> "${fmt(m / 1e3, 3)} km"
    m < 1e15 -> "${fmt(m / 1.496e11, 3)} AU"
    else -> "${fmt(m / 9.461e15, 3)} light-years"
}

private val ScaleInfo = LabInfo(
    equations = listOf("\\ell_P = \\sqrt{\\frac{\\hbar G}{c^3}} \\approx 1.6 \\times 10^{-35}\\ \\text{m}", "D_{\\text{obs}} \\approx 8.8 \\times 10^{26}\\ \\text{m}"),
    about = "Sixty-two powers of ten separate the smallest length physics can talk about from the largest we can see. Each step of the slider makes everything ten times larger or smaller. Pinch the view to travel continuously; the circles show each object at its true size relative to the others.",
    notes = listOf(
        "Sizes are representative diameters or lengths; many objects (viruses, cells, nebulae) vary considerably.",
        "Quarks and electrons have no measured size; the value shown is the experimental upper limit.",
        "The size of the Milky Way depends on where you say its edge is; 100,000 light-years is the traditional figure for the bright stellar disc.",
    ),
)

@Composable
fun CosmicScaleLab() {
    val app = LocalApp.current
    var logView by remember { mutableFloatStateOf(0.6f) }   // log10 of the width of the view in metres
    var bumps by remember { mutableIntStateOf(0) }
    val tm = rememberTextMeasurer(cacheSize = 96)
    val stars = remember { StarData(160, 61) }
    val time by rememberTime()
    val minL = -35.3f; val maxL = 27.4f
    fun setLog(v: Float) {
        if ((v < minL && logView <= minL + 0.01f) || (v > maxL && logView >= maxL - 0.01f)) { bumps++; if (bumps >= 4) app.discover("edge") }
        logView = v.coerceIn(minL, maxL)
    }
    val focus = THINGS.minByOrNull { abs(log10(it.size) - (logView - 0.25)) }!!

    LabScaffold("Cosmic Scale", Domain.Astro, ScaleInfo, canvas = {
        Canvas(Modifier.fillMaxSize().pointerInput(Unit) { detectTransformGestures { _, pan, zoom, _ -> setLog(logView - log10(zoom) * 1.6f + pan.y * 0.004f) } }) {
            val w = size.width; val h = size.height; val dp = 1.dp.toPx()
            val bg = when { logView < -12 -> UE.Magenta; logView < -5 -> UE.Green; logView < 5 -> UE.Blue; logView < 14 -> UE.Amber; else -> UE.Violet }
            drawRect(Brush.radialGradient(listOf(bg.copy(alpha = 0.12f), Color.Transparent), Offset(w / 2, h / 2), max(w, h)))
            if (logView > 8) drawStars(stars, time, 0.001f, ((logView - 8) / 4).coerceIn(0f, 1f))
            val c = Offset(w / 2, h * 0.55f)
            val viewW = 10.0.pow(logView.toDouble())
            val px = min(w, h) * 0.9f / viewW
            for (t in THINGS) {
                val r = (t.size * px / 2).toFloat()
                if (r < 1.2f || r > max(w, h) * 6) continue
                val emphasis = if (t === focus) 1f else 0.5f
                val a = (if (r < 8 * dp) r / (8 * dp) else 1f) * (if (r > max(w, h)) (1 - (r - max(w, h)) / (5 * max(w, h))).coerceIn(0f, 1f) else 1f)
                drawCircle(t.color.copy(alpha = 0.07f * a * emphasis * 2), r, c)
                drawCircle(t.color.copy(alpha = 0.7f * a * emphasis + 0.1f), r, c, style = Stroke((if (t === focus) 1.8f else 1f) * dp))
                if (r in 14 * dp..max(w, h) * 0.9f) label(tm, t.name, c.x, c.y - r - 3 * dp, t.color.copy(alpha = 0.9f * a), if (t === focus) 11f else 9f, 0.5f, 1f, UE.Display, if (t === focus) FontWeight.Medium else FontWeight.Normal)
            }
            // scale bar
            val barM = 10.0.pow(floor(logView.toDouble() - 0.6))
            val barPx = (barM * px).toFloat()
            val y = h - 28 * dp
            drawLine(UE.Text, Offset(20 * dp, y), Offset(20 * dp + barPx, y), 2 * dp); drawLine(UE.Text, Offset(20 * dp, y - 5 * dp), Offset(20 * dp, y + 5 * dp), 2 * dp); drawLine(UE.Text, Offset(20 * dp + barPx, y - 5 * dp), Offset(20 * dp + barPx, y + 5 * dp), 2 * dp)
            label(tm, "10${superscript(floor(logView.toDouble() - 0.6).toInt())} m  =  ${sizeStr(barM)}", 20 * dp, y - 8 * dp, UE.Text, 10.5f, 0f, 1f)
            label(tm, "10${superscript(floor(logView.toDouble()).toInt())} m", w - 14 * dp, 14 * dp, bg, 26f, 1f, 0f, UE.Display, FontWeight.Bold)
            if (logView <= minL + 0.01f || logView >= maxL - 0.01f) label(tm, if (logView < 0) "below this, length may stop meaning anything" else "beyond this, light has not had time to reach us", w / 2, 44 * dp, UE.Amber, 11f, 0.5f, 0f, UE.Display)
        }
    }) {
        UESlider("Width of view", logView, minL..maxL, accent = Domain.Astro.accent, format = { "10^${fix(it, 1)} m" }) { setLog(it) }
        ChipRow(THINGS.map { it.name }, THINGS.indexOf(focus), Domain.Astro.accent) { logView = (log10(THINGS[it].size) + 0.25).toFloat() }
        Column(Modifier.fillMaxWidth().glass(16.dp, focus.color, fill = 0.06f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row { T(focus.name, size = 17.sp, weight = FontWeight.Medium, color = lerp(focus.color, Color.White, 0.3f), modifier = Modifier.weight(1f)); T(sizeStr(focus.size), size = 14.sp, font = UE.Mono, color = focus.color) }
            T(focus.note, size = 13.sp, color = UE.Text.copy(alpha = 0.85f), lineHeight = 19.sp)
        }
        Note("Pinch the canvas to zoom through the powers of ten.")
    }
}
