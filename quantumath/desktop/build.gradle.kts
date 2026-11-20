import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.jetbrains.compose)
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        freeCompilerArgs.addAll("-opt-in=androidx.compose.material3.ExperimentalMaterial3Api", "-opt-in=androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi", "-opt-in=kotlinx.coroutines.FlowPreview")
    }
}

// The UI, ViewModels and data model are shared with the Android app (platform-neutral code in app/src/main/java).
sourceSets["main"].kotlin.srcDir("../app/src/main/java")

val windowsRuntime: Configuration by configurations.creating {
    isCanBeConsumed = false
    attributes {
        attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage.JAVA_RUNTIME))
        attribute(Category.CATEGORY_ATTRIBUTE, objects.named(Category.LIBRARY))
        attribute(LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE, objects.named(LibraryElements.JAR))
        attribute(org.jetbrains.kotlin.gradle.plugin.KotlinPlatformType.attribute, org.jetbrains.kotlin.gradle.plugin.KotlinPlatformType.jvm)
    }
}

dependencies {
    implementation(project(":mathcore"))
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)
    implementation(libs.jb.lifecycle.viewmodel.compose)
    implementation(libs.jb.lifecycle.runtime.compose)
    implementation(libs.jb.navigation.compose)
    implementation(libs.androidx.datastore.preferences.core)
    implementation(libs.kotlinx.coroutines.swing)
    implementation(libs.kotlinx.serialization.json)
    windowsRuntime(compose.desktop.windows_x64)

    testImplementation(compose.desktop.uiTestJUnit4)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

tasks.test {
    maxHeapSize = "2g"
    systemProperty("java.awt.headless", "true")
    systemProperty("skiko.renderApi", "SOFTWARE")
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

compose.desktop {
    application {
        mainClass = "com.quantumath.desktop.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Msi, TargetFormat.Deb)
            packageName = "Quantumath"
            packageVersion = "1.0.0"
        }
    }
}

/** Self-contained jar for Windows x64 (Windows Skia natives; Linux natives left out). */
val windowsJar by tasks.registering(Jar::class) {
    group = "distribution"
    archiveFileName.set("quantumath.jar")
    destinationDirectory.set(layout.buildDirectory.dir("windows"))
    manifest { attributes("Main-Class" to "com.quantumath.desktop.MainKt", "Implementation-Title" to "Quantumath", "Implementation-Version" to "1.0.0") }
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    from(sourceSets["main"].output)
    val deps = configurations.runtimeClasspath.get()
    dependsOn(deps, windowsRuntime)
    from({ (deps.files.filterNot { it.name.startsWith("skiko-awt-runtime-") } + windowsRuntime.files).filter { it.name.endsWith(".jar") }.map { zipTree(it) } })
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/*.EC", "META-INF/INDEX.LIST", "module-info.class", "META-INF/versions/*/module-info.class")
}
