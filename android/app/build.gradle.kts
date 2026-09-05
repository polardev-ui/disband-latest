plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.wsgpolar.disband"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.wsgpolar.disband"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.2.0"

        vectorDrawables { useSupportLibrary = true }

        // Optional Firebase overrides for push notifications. When unset at
        // build time, push registration degrades gracefully to "no FCM".
        buildConfigField("String", "FIREBASE_API_KEY", "\"${localProperty("FIREBASE_API_KEY") ?: ""}\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"${localProperty("FIREBASE_APP_ID") ?: ""}\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${localProperty("FIREBASE_PROJECT_ID") ?: ""}\"")
        buildConfigField("String", "FIREBASE_GCM_SENDER_ID", "\"${localProperty("FIREBASE_GCM_SENDER_ID") ?: ""}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.coil.compose)
    implementation(libs.coil.gif)
    implementation(libs.coil.video)

    implementation(libs.supabase.kt)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)

    implementation(libs.webrtc.sdk)

    implementation(libs.firebase.messaging)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

fun localProperty(name: String): String? {
    val f = rootProject.file("local.properties")
    if (!f.exists()) return null
    val prefix = "$name="
    return f.readLines().firstOrNull { it.trimStart().startsWith(prefix) }
        ?.substringAfter('=')
        ?.trim()
}