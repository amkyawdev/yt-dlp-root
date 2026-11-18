/**
 * Python source for the in-browser yt-dlp bridge.
 *
 * Runs inside Pyodide (see pyodide_worker.js). yt-dlp is invoked unmodified;
 * every YouTube request is transparently redirected to the Cloudflare Worker
 * proxy by the JS fetch/XHR shims installed in the worker, and by the urllib
 * patch below (belt and braces — some code paths bypass the JS shim).
 *
 * `resolve()` only *resolves* a URL: it returns metadata plus the direct media
 * URL as JSON. The bytes themselves are streamed by JS so we never buffer a
 * whole video inside Python.
 */
export const PY_BRIDGE = String.raw`
import json, urllib.parse, urllib.request

WORKER = __WORKER__
YOUTUBE_HOSTS = (
    "youtube.com", "youtu.be", "youtubei.googleapis.com",
    "googlevideo.com", "ytimg.com", "ggpht.com",
)

def _is_youtube(url):
    try:
        host = urllib.parse.urlsplit(url).hostname or ""
    except Exception:
        return False
    host = host.lower()
    return any(host == h or host.endswith("." + h) for h in YOUTUBE_HOSTS)

def _rewrite(url):
    if WORKER and _is_youtube(url):
        return WORKER.rstrip("/") + "/proxy?url=" + urllib.parse.quote(url, safe="")
    return url

_orig_open = urllib.request.OpenerDirector.open

def _patched_open(self, fullurl, data=None, timeout=None, *args, **kwargs):
    if isinstance(fullurl, str):
        fullurl = _rewrite(fullurl)
    elif hasattr(fullurl, "full_url"):
        fullurl.full_url = _rewrite(fullurl.full_url)
    return _orig_open(self, fullurl, data, timeout, *args, **kwargs)

urllib.request.OpenerDirector.open = _patched_open

import yt_dlp  # noqa: E402  (import only after the patch is installed)

def resolve(url, client="android"):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "format": "bestaudio/best",
        "nocheckcertificate": True,
        "cachedir": False,
        "extractor_args": {"youtube": {"player_client": [client]}},
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
        if not entries:
            raise ValueError("empty playlist")
        info = entries[0]

    def pick(formats):
        audio = [f for f in formats if f.get("acodec") not in (None, "none") and f.get("url")]
        if not audio:
            audio = [f for f in formats if f.get("url")]
        audio.sort(key=lambda f: (f.get("abr") or f.get("tbr") or 0), reverse=True)
        return audio[0] if audio else None

    best = pick(info.get("formats") or [])
    if best is None and info.get("url"):
        best = {"url": info["url"], "ext": info.get("ext", "m4a"),
                "abr": info.get("abr"), "acodec": info.get("acodec")}

    return json.dumps({
        "title": info.get("title"),
        "uploader": info.get("uploader"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "extractor": info.get("extractor_key"),
        "webpage_url": info.get("webpage_url"),
        "audio": None if best is None else {
            "url": best.get("url"),
            "ext": best.get("ext"),
            "abr": best.get("abr"),
            "acodec": best.get("acodec"),
            "filesize": best.get("filesize") or best.get("filesize_approx"),
        },
    })

def version():
    return yt_dlp.version.__version__
`;
