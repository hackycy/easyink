plugins {
    id("com.android.library") version "9.2.1"
    id("maven-publish")
}

group = "com.easyink"
version = "0.1.0"

base {
    archivesName.set("easyink-android-render")
}

android {
    namespace = "com.easyink.android"
    compileSdk = 35

    defaultConfig {
        minSdk = 23
        consumerProguardFiles("consumer-rules.pro")
        aarMetadata {
            minCompileSdk = 23
        }
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }
}

val viewerRuntimeSource = layout.projectDirectory.dir("../../internal-packages/viewer-runtime/dist/runtime/easyink-viewer")
val viewerRuntimeAssets = layout.projectDirectory.dir("src/main/assets/easyink-viewer")

val syncViewerRuntime by tasks.registering(Sync::class) {
    from(viewerRuntimeSource)
    into(viewerRuntimeAssets)
    include("index.html", "assets/viewer.css", "assets/viewer.js")
    doFirst {
        val required = listOf(
            viewerRuntimeSource.file("index.html").asFile,
            viewerRuntimeSource.file("assets/viewer.css").asFile,
            viewerRuntimeSource.file("assets/viewer.js").asFile,
        )
        val missing = required.filterNot { it.isFile }
        check(missing.isEmpty()) {
            "Missing viewer runtime files. Run `pnpm render:runtime` first. Missing: ${
                missing.joinToString { it.relativeTo(project.rootDir).path }
            }"
        }
    }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn(syncViewerRuntime)
}

tasks.register("verifyAarRuntimeAssets") {
    dependsOn("assembleRelease")
    doLast {
        val aar = layout.buildDirectory.file("outputs/aar/easyink-android-render-release.aar").get().asFile
        check(aar.isFile) { "Missing AAR: ${aar.path}" }
        zipTree(aar).matching {
            include(
                "assets/easyink-viewer/index.html",
                "assets/easyink-viewer/assets/viewer.css",
                "assets/easyink-viewer/assets/viewer.js",
            )
        }.files.let { files ->
            check(files.size == 3) { "AAR is missing EasyInk viewer runtime assets: ${files.map { it.path }}" }
        }
        zipTree(aar).matching {
            include("classes.jar")
        }.singleFile.let { classesJar ->
            val classFiles = zipTree(classesJar).matching {
                include(
                    "com/easyink/android/EasyInkRenderer.class",
                    "com/easyink/android/internal/PdfWriter.class",
                    "com/easyink/android/internal/ImageWriter.class",
                    "com/easyink/android/internal/RuntimeAssetServer.class",
                    "com/easyink/android/internal/WebViewSession.class",
                )
            }.files
            check(classFiles.size == 5) { "AAR classes.jar is missing Android SDK render classes: ${classFiles.map { it.path }}" }
        }
        println("Verified EasyInk viewer runtime assets in ${aar.path}")
    }
}

afterEvaluate {
    publishing {
        repositories {
            maven {
                name = "flutterSample"
                url = layout.buildDirectory.dir("repository").get().asFile.toURI()
            }
        }
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                artifactId = "easyink-android-render"
            }
        }
    }
}
