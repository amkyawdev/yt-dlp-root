plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.amkyaw.audiotext"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.amkyaw.audiotext"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        // The published web app. The Worker serves the frontend AND the
        // same-origin /proxy the app needs, so one URL is enough.
        buildConfigField("String", "START_URL", "\"https://yt-dlp.burme-vpn.workers.dev/\"")
    }

    buildFeatures {
        buildConfig = true
    }

    // Release signing is opt-in via environment variables. When they are absent
    // the release build still succeeds — it is simply left unsigned.
    val keystorePath = System.getenv("AMKYAW_KEYSTORE_FILE")
    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("AMKYAW_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("AMKYAW_KEY_ALIAS")
                keyPassword = System.getenv("AMKYAW_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
