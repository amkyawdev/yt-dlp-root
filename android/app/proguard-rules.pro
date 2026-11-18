# Keep the JS bridge members reachable from the WebView.
-keepclassmembers class com.amkyaw.audiotext.MainActivity$DownloadBridge {
    public *;
}
