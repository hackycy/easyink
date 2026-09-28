allprojects {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri(rootProject.projectDir.resolve("../../../build/repository"))
        }
    }
}

val newBuildDir = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.set(newBuildDir)

subprojects {
    layout.buildDirectory.set(newBuildDir.dir(name))
    evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
