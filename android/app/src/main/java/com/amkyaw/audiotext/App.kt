package com.amkyaw.audiotext

import android.app.Application
import android.webkit.WebView

/** Minimal Application class; enables WebView debugging on debug builds. */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }
}
