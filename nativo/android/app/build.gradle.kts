plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "co.fray.paramo"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "co.fray.paramo"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

// APK de release solo arm64: el paquete jni trae libdartjni.so también para x86_64 y armeabi-v7a, y con eso Android
// elige una ABI sin libflutter.so ni llama.cpp (pasa en el emulador x86_64 con traducción ARM). abiFilters no los quita
// porque llegan como native assets, así que se excluyen al empaquetar.
if (gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }) {
    android.packaging.jniLibs.excludes += setOf("lib/x86_64/**", "lib/armeabi-v7a/**", "lib/x86/**")
}
// Bibliotecas nativas comprimidas dentro del APK (se extraen al instalar): el APK pesa ~la mitad y se puede servir desde
// Vercel (límite de 95 MB que nos pusimos). A cambio ocupa un poco más en el teléfono una vez instalado.
android.packaging.jniLibs.useLegacyPackaging = true

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
