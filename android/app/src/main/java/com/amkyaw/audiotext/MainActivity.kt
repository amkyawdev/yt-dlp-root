package com.amkyaw.audiotext

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Thin WebView shell around the published AudioText Extractor web app.
 *
 * The web app does all the work (yt-dlp, FFmpeg and Whisper all run inside the
 * page). This activity only supplies the Android chrome: JavaScript, DOM
 * storage, a file chooser for the "Local file" input, and download handling for
 * the exported audio / subtitle files.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data?.data
        val uris = when {
            result.resultCode != RESULT_OK -> null
            data != null -> arrayOf(data)
            else -> result.data?.clipData?.let { clip ->
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
        }
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* result only gates the DownloadManager write; ignore */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString AudioTextExtractor/1.0"
        }

        // The page needs a real UA string for Pyodide/ffmpeg feature detection.
        web.settings.loadWithOverviewMode = true
        web.settings.useWideViewPort = true

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                // Keep same-origin navigation inside the WebView; open external
                // links (GitHub releases, etc.) in the system browser.
                return if (url.host == Uri.parse(BuildConfig.START_URL).host) {
                    false
                } else {
                    openExternal(url)
                    true
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: ActivityNotFoundException) {
                    filePathCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // The app may request clipboard / microphone access from the page.
                request.grant(request.resources)
            }

            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                return true
            }
        }

        web.setDownloadListener { url, _, _, mime, _ ->
            startDownload(url, mime)
        }

        requestStoragePermissionsIfNeeded()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        val startUrl = intent?.data?.toString()?.takeIf { it.startsWith("http") }
            ?: BuildConfig.START_URL
        web.loadUrl(startUrl)
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startDownload(url: String, mime: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mime)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Uri.parse(url).lastPathSegment ?: "audiotext-download")
                setTitle(Uri.parse(url).lastPathSegment ?: "download")
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, "Downloading…", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            // Fall back to a blob/data URL opened by the browser.
            openExternal(Uri.parse(url))
        }
    }

    private fun requestStoragePermissionsIfNeeded() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                perms += Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                perms += Manifest.permission.POST_NOTIFICATIONS
            }
        }
        if (perms.isNotEmpty()) permissionLauncher.launch(perms.toTypedArray())
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        web.restoreState(savedInstanceState)
    }
}
