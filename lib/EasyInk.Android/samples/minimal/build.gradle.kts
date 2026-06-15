plugins {
    id("com.android.application")
}

android {
    namespace = "com.easyink.android.sample"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.easyink.android.sample"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
}

dependencies {
    implementation(project(":"))
}
