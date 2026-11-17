package dev.universe.engine.core.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.universe.engine.LocalNav

/** The science behind a lab: governing equations, a plain-language summary, and the honest fine print. */
data class LabInfo(val equations: List<String> = emptyList(), val about: String = "", val notes: List<String> = emptyList())

@Composable
fun BackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.size(38.dp).pressable(onClick = onClick).glass(19.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(14.dp)) {
            val w = size.width
            drawLine(UE.Text, Offset(w * 0.68f, w * 0.12f), Offset(w * 0.26f, w * 0.5f), 2.dp.toPx(), StrokeCap.Round)
            drawLine(UE.Text, Offset(w * 0.26f, w * 0.5f), Offset(w * 0.68f, w * 0.88f), 2.dp.toPx(), StrokeCap.Round)
        }
    }
}

@Composable
private fun LabTopBar(title: String, domain: Domain, onBack: () -> Unit, onInfo: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        BackButton(onBack)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            T(domain.title.uppercase(), size = 9.5.sp, color = domain.accent, spacing = 1.8.sp, weight = FontWeight.Medium, maxLines = 1)
            T(title, size = 17.sp, weight = FontWeight.Medium, maxLines = 1)
        }
        Box(Modifier.height(38.dp).pressable(onClick = onInfo).glass(19.dp, domain.accent, fill = 0.1f).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            MathText("f(x)", size = 15.sp, color = domain.accent)
        }
    }
}

@Composable
private fun ControlPanel(domain: Domain, expanded: Boolean, onToggle: () -> Unit, maxHeight: Dp, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color(0xE6070814))
            .background(Brush.verticalGradient(listOf(domain.accent.copy(alpha = 0.07f), Color.Transparent))),
    ) {
        Box(Modifier.fillMaxWidth().height(22.dp).pressable(onClick = onToggle), contentAlignment = Alignment.Center) {
            Box(Modifier.size(42.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = if (expanded) 0.22f else 0.4f)))
        }
        AnimatedVisibility(expanded, enter = expandVertically(tween(220)) + fadeIn(), exit = shrinkVertically(tween(200)) + fadeOut()) {
            Column(
                Modifier.fillMaxWidth().heightIn(max = maxHeight).verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp), content = content,
            )
        }
    }
}

/**
 * Standard laboratory frame: title bar, a live canvas, and an instrument panel that collapses out of the way.
 * In landscape or on tablets the panel docks to the side.
 */
@Composable
fun LabScaffold(
    title: String,
    domain: Domain,
    info: LabInfo,
    canvas: @Composable BoxScope.() -> Unit,
    controls: @Composable ColumnScope.() -> Unit,
) {
    val nav = LocalNav.current
    var showInfo by remember { mutableStateOf(false) }
    var expanded by rememberSaveable { mutableStateOf(true) }
    BoxWithConstraints(Modifier.fillMaxSize().background(UE.Void)) {
        val wide = maxWidth > maxHeight * 1.15f && maxWidth >= 560.dp
        val maxH = maxHeight
        if (wide) {
            Row(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                Column(Modifier.weight(1f).fillMaxHeight()) {
                    LabTopBar(title, domain, { nav.back() }) { showInfo = true }
                    Box(Modifier.weight(1f).fillMaxWidth().clipToBounds(), content = canvas)
                }
                Column(
                    Modifier.width(340.dp).fillMaxHeight().background(Color(0xE6070814))
                        .background(Brush.horizontalGradient(listOf(domain.accent.copy(alpha = 0.07f), Color.Transparent)))
                        .verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp), content = controls,
                )
            }
        } else {
            Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                LabTopBar(title, domain, { nav.back() }) { showInfo = true }
                Box(Modifier.weight(1f).fillMaxWidth().clipToBounds(), content = canvas)
                ControlPanel(domain, expanded, { expanded = !expanded }, maxH * 0.44f, content = controls)
            }
        }
        InfoSheet(showInfo, title, domain, info) { showInfo = false }
    }
}

@Composable
private fun BoxScope.InfoSheet(visible: Boolean, title: String, domain: Domain, info: LabInfo, onClose: () -> Unit) {
    AnimatedVisibility(visible, enter = fadeIn(tween(160)), exit = fadeOut(tween(160))) {
        Box(Modifier.fillMaxSize().background(Color(0xD9020206)).pressable(onClick = onClose))
    }
    AnimatedVisibility(
        visible, Modifier.align(Alignment.BottomCenter),
        enter = slideInVertically(tween(320)) { it / 3 } + fadeIn(tween(240)),
        exit = slideOutVertically(tween(220)) { it / 3 } + fadeOut(tween(160)),
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.86f).windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 10.dp)
                .glass(26.dp, domain.accent, fill = 0.07f).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    SectionLabel("The science", color = domain.accent)
                    T(title, size = 22.sp, weight = FontWeight.Medium)
                }
                GlowButton("Close", accent = domain.accent, onClick = onClose)
            }
            if (info.equations.isNotEmpty()) {
                SectionLabel("Governing equations")
                info.equations.forEachIndexed { i, eq ->
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.04f)).padding(horizontal = 14.dp, vertical = 12.dp)) {
                        WrittenMath(eq, size = 20.sp, delayMs = 120 + i * 160, key = visible to eq)
                    }
                }
            }
            if (info.about.isNotEmpty()) {
                SectionLabel("What you are seeing")
                T(info.about, size = 14.sp, color = UE.Text.copy(alpha = 0.9f), lineHeight = 21.sp)
            }
            if (info.notes.isNotEmpty()) {
                SectionLabel("Model and approximations", color = UE.Amber)
                info.notes.forEach { n ->
                    Row {
                        T("—", size = 13.sp, color = UE.Amber.copy(alpha = 0.8f))
                        Spacer(Modifier.width(8.dp))
                        T(n, size = 13.sp, color = UE.Dim, lineHeight = 19.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
