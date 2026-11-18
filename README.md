# AudioText Extractor (yt-dlp-root)

**YouTube link သို့မဟုတ် ကိုယ်ပိုင်ဖိုင်တစ်ခုကနေ အသံကို ထုတ်ယူပြီး၊ စာသားအဖြစ် အချိန်မှတ် (timestamp) နှင့်တကွ ပြောင်းလဲပေးတဲ့ web application တစ်ခုဖြစ်ပါတယ်။**

လုပ်ဆောင်မှု **အားလုံးနီးပါး** ဟာ browser ထဲမှာသာ လည်ပတ်ပါတယ်။ ဖိုင်တွေကို server ဆီ **မတင်ပို့ပါ**။ ဒါကြောင့် သင့်အသံ/ဗီဒီယိုဟာ သင့်စက်ကနေ ဘယ်တော့မှ မထွက်ခွာပါ။

---

## ၁။ ဒီ project က ဘာလုပ်ပေးလဲ

1. အသုံးပြုသူက **YouTube link** ထည့်တယ် — သို့မဟုတ် — **local video/audio file** တင်တယ်။
2. App က အသံကို ထုတ်ယူတယ် (extract)။
   - YouTube ဖြစ်လျှင် — `yt-dlp` (Pyodide browser Python) နဲ့ ထုတ်ယူတယ်။
   - Local file ဖြစ်လျှင် — `ffmpeg.wasm` နဲ့ ထုတ်ယူတယ်။
3. အသံကို **16 kHz mono WAV** အဖြစ် ပြောင်းတယ် (Whisper လိုအပ်ချက်)။
4. **Whisper** (WASM / WebGPU) နဲ့ စာသားပြောင်းတယ် — အချိန်မှတ်များနှင့်တကွ။
5. ရလဒ်ကို ပြတယ်။
   - Transcript (timestamp နှင့်)
   - **အသံဖိုင် download** (original / mp3 / wav)
   - **SRT / VTT / TXT subtitle download**
   - Transcript text copy

---

## ၂။ ဗိသုကာ (Architecture) — အရေးကြီးဆုံး

```
┌──────────────────────────── Browser (အလုပ်အားလုံးဒီမှာ) ────────────────────────────┐
│                                                                                     │
│   yt-dlp (Pyodide)   →   ffmpeg.wasm   →   Whisper (WASM / WebGPU)                   │
│      ↑ YouTube            ↑ အသံထုတ်/ပြောင်း       ↑ စာသားပြောင်း                        │
│      │                                                                              │
│   fetch / XHR shim  ──►  same-origin /proxy  ──►  Cloudflare Worker  ──►  YouTube   │
│                                                                                     │
│   Cache Storage + IndexedDB  ←  Whisper model (lazy download)                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
              Cloudflare Worker = CORS + YouTube proxy သာ
              (yt-dlp / ffmpeg / whisper ကို Worker ပေါ် လုံးဝ မလည်ပတ်ပါ)
```

### ဘယ်အလုပ်က ဘယ်နေရာမှာ လည်ပတ်လဲ

| အလုပ် | လည်ပတ်တဲ့နေရာ | မှတ်ချက် |
|---|---|---|
| yt-dlp (metadata + stream URL) | Browser — Pyodide Web Worker | `worker/` ပေါ်မှာ မလည်ပတ်ပါ |
| FFmpeg (အသံထုတ် + 16k ပြောင်း) | Browser — ffmpeg.wasm | Web Worker ထဲမှာ လည်ပတ်တယ် |
| Whisper (စာသားပြောင်း) | Browser — whisper.cpp WASM / ONNX WebGPU | server-side မရှိပါ |
| CORS + YouTube proxy | Cloudflare Worker | ဒါပဲ လုပ်တယ် |
| Model + manifest hosting | Cloudflare R2 / CDN | ဖိုင်တွေသာ သိုလှောင်တယ်၊ compute မရှိ |

**လုံးဝ မလုပ်ရမယ့်အရာ:** Cloudflare Worker ပေါ်မှာ yt-dlp / FFmpeg / Whisper လည်ပတ်ခြင်း၊ server-side database ထားခြင်း၊ user login လိုအပ်ခြင်း။

---

## ၃။ ဖိုင် Project ဖွဲ့စည်းပုံ

```
yt-dlp-root/
├── web/                                     # Frontend (browser)
│   ├── index.html                           # Single-page layout
│   ├── styles.css                           # Dark glassmorphism design system
│   └── js/
│       ├── main.js                          # ဝင်ပေါက် + pipeline orchestrator
│       ├── core/
│       │   ├── constants/app_constants.js   # Worker URL၊ R2 URL၊ manifest URL
│       │   ├── errors/failures.js           # Typed failures
│       │   ├── utils/file_utils.js          # ဖိုင် + download helpers
│       │   ├── utils/checksum_utils.js      # SHA-256 စစ်ဆေးခြင်း
│       │   └── services/
│       │       ├── cloudflare_service.js    # Worker API (health / proxy)
│       │       └── download_service.js      # ဖိုင် download + cache
│       ├── features/
│       │   ├── bootstrap/                   # ⭐ အက်ပ်စတင်ခြင်း လုပ်ငန်းစဉ်
│       │   │   ├── domain/entities/app_manifest.js
│       │   │   ├── data/datasources/manifest_datasource.js
│       │   │   ├── data/repositories/bootstrap_repository_impl.js
│       │   │   └── presentation/
│       │   │       ├── providers/bootstrap_provider.js
│       │   │       └── screens/splash_screen.js
│       │   ├── extraction/                  # အသံ ထုတ်ယူခြင်း
│       │   │   ├── domain/entities/audio_source.js
│       │   │   ├── domain/repositories/extraction_repository.js
│       │   │   ├── data/datasources/{ytdlp_datasource,ffmpeg_datasource}.js
│       │   │   ├── data/datasources/{pyodide_worker,py_bridge.py}.js
│       │   │   ├── data/repositories/extraction_repository_impl.js
│       │   │   └── presentation/
│       │   │       ├── providers/extraction_provider.js
│       │   │       ├── screens/extract_screen.js
│       │   │       └── widgets/{source_input_field,file_drop_zone}.js
│       │   ├── transcription/               # စာသားပြောင်းလဲခြင်း
│       │   │   ├── domain/entities/transcript_segment.js
│       │   │   ├── domain/repositories/transcription_repository.js
│       │   │   ├── data/datasources/whisper_datasource.js
│       │   │   ├── data/repositories/transcription_repository_impl.js
│       │   │   └── presentation/
│       │   │       ├── providers/transcription_provider.js
│       │   │       ├── screens/transcript_screen.js
│       │   │       └── widgets/segment_tile.js
│       │   └── update/                      # ⭐ update စစ်ဆေးခြင်း
│       │       └── presentation/
│       │           ├── providers/update_provider.js   # GitHub Releases API
│       │           └── widgets/update_dialog.js
│       └── shared/widgets/
│           ├── loading_indicator.js
│           ├── log_drawer.js                # Terminal-style logs
│           ├── waveform.js                  # Audio preview
│           ├── toast.js
│           └── atmosphere.js                # နောက်ခံ animation
│
├── worker/                                  # Cloudflare Worker (CORS + proxy သာ)
│   ├── src/index.js
│   ├── wrangler.toml
│   └── deploy.mjs                           # REST API မှ deploy (wrangler မလို)
│
├── serve.mjs                                # Local dev server + same-origin proxy
└── README.md
```

ဒီဖွဲ့စည်းပုံဟာ **feature-first (Clean Architecture)** ဖြစ်ပါတယ် — feature တစ်ခုချင်းစီမှာ
`domain` (entities + repository interface)၊ `data` (datasources + implementation) နှင့်
`presentation` (provider + screen + widget) လို့ သုံးလွှာ ခွဲထားပါတယ်။

---

## ၄။ လိုအပ်ချက်များ (Requirements)

- **Node.js 20+** (dev server + worker deploy အတွက်)
- **Browser:** Chrome / Edge / Safari နောက်ဆုံးဗားရှင်း
  - WebAssembly လိုအပ်တယ် (အားလုံးနီးပါး ရပြီးသား)
  - WebGPU (ရှိလျှင်) — ပိုမြန်တဲ့ Whisper engine
- **Internet:** Pyodide၊ ffmpeg.wasm နှင့် Whisper model ကို ပထမဆုံးအကြိမ် download လုပ်ဖို့

---

## ၅။ အလွယ်တကူ စတင်အသုံးပြုခြင်း

### ၅.၁ Local မှာ လည်ပတ်ခြင်း

```bash
# 1. repo ကို clone
git clone https://github.com/amkyawdev/yt-dlp-root.git
cd yt-dlp-root

# 2. dev server စတင် (static files + same-origin proxy)
node serve.mjs

# 3. browser ဖွင့်
#    http://localhost:12000
```

`serve.mjs` က `/health` နှင့် `/proxy` ကို **same-origin** အနေနဲ့ ဆောင်ရွက်ပေးပါတယ်။
ဒါက အရေးကြီးပါတယ် — အောက်မှာ ရှင်းပြထားပါတယ်။

Port ပြောင်းလိုလျှင်:

```bash
PORT=8080 node serve.mjs
```

### ၅.၂ Cloudflare Worker ကို Deploy လုပ်ခြင်း

Worker က CORS + YouTube proxy ကိုသာ လုပ်ဆောင်ပါတယ်။

**နည်းလမ်း ၁ — wrangler နှင့်:**

```bash
cd worker
npx wrangler deploy
```

**နည်းလမ်း ၂ — REST API နှင့် (wrangler မလိုဘဲ):**

```bash
cd worker
CF_API_TOKEN=xxxx CF_ACCOUNT_ID=yyyy node deploy.mjs yt-dlp
```

Token က **Workers Scripts: Edit** permission ရှိရပါမယ်။
Token ကို environment variable ကနေသာ ဖတ်တယ်၊ ဖိုင်ထဲ ဘယ်တော့မှ မသိမ်းပါ။

Deploy ပြီးလျှင် `https://<name>.<subdomain>.workers.dev/health` မှာ စမ်းသပ်ပါ။

---

## ၆။ ⚠️ အရေးကြီးဆုံး အချက် — Same-Origin Proxy

**ဒါက ဒီ project မှာ အခက်ခဲဆုံး၊ အရေးကြီးဆုံး အချက်ပါ။**

yt-dlp ဟာ Pyodide (browser Python) ထဲမှာ လည်ပတ်တဲ့အခါ HTTP request တွေကို
**synchronous XHR** နဲ့ လုပ်ဆောင်ပါတယ်။ Browser တွေဟာ **cross-origin synchronous XHR**
ကို **လုံးဝ တားမြစ်ထားပါတယ်**။

ဒါကြောင့် —

- ❌ Worker က `yt-dlp.burme-vpn.workers.dev` လို **အခြား host** မှာ ရှိလျှင် —
  `OSError(23, 'Host is unreachable')` ဆိုတဲ့ error ဖြစ်ပါတယ်။
- ✅ Worker က page ရဲ့ **same origin** မှာ ရှိလျှင် — ကောင်းမွန်စွာ လည်ပတ်ပါတယ်။

### ဖြေရှင်းနည်း

**Local dev:** `node serve.mjs` က `/proxy` ကို same-origin အနေနဲ့ ပေးပါတယ်
(အတွင်းမှာ Worker ဆီ forward လုပ်တယ်)။

**Production:** Worker ကို သင့်ကိုယ်ပိုင် domain ပေါ်မှာ route တစ်ခုနဲ့ ချိတ်ပါ။

```
# Cloudflare Dashboard → Workers → Settings → Triggers → Routes
example.com/proxy*   →  yt-dlp worker
example.com/health   →  yt-dlp worker
```

ဒါဆိုရင် `web/js/core/constants/app_constants.js` ထဲက `workerUrl` ကို **ကွက်လပ်** ထားပါ —
request တွေဟာ `/proxy` (same-origin) ဆီသာ သွားပါလိမ့်မယ်။

> ဒီ error ကို ကျွန်တော်တို့ ရှာဖွေစဉ် ရလဒ်က —
> `pyfetch=200` (async fetch အလုပ်လုပ်တယ်) ဒါပေမဲ့
> `urlopen=fail: Host is unreachable` (sync XHR မလုပ်ဘူး)။
> ဒါက same-origin ပြဿနာဖြစ်ကြောင်း အတိအကျ ပြခဲ့ပါတယ်။

---

## ၇။ အသေးစိတ် လုပ်ငန်းစဉ် (Pipeline)

```
[1] resolve       yt-dlp → metadata + အကောင်းဆုံး audio stream URL
                  (local file ဖြစ်လျှင် duration စစ်ဆေးခြင်း)

[2] acquire       Worker proxy မှ audio bytes ကို stream (progress ပြ)

[3] extract       ffmpeg.wasm → -vn (ဗီဒီယို ဖြုတ်)

[4] convert       ffmpeg.wasm → -ac 1 -ar 16000 -c:a pcm_s16le
                  (Whisper လိုအပ်တဲ့ format)

[5] transcribe    Whisper → timestamp ပါတဲ့ segments

[6] export        SRT / VTT / TXT  +  အသံဖိုင် (original / mp3 / wav)
```

### Whisper engine နှစ်မျိုး

| Engine | ဘယ်အခါ သုံးလဲ | အားသာချက် |
|---|---|---|
| **whisper.cpp** (WASM) | `app_constants.js` ထဲ `whisperModuleUrl` ဖြည့်လျှင် | အပေါ့ပါး၊ ကိုယ်ပိုင် build |
| **transformers.js** (ONNX WASM/WebGPU) | default | ချက်ချင်း အလုပ်လုပ်တယ်၊ custom build မလို |

`navigator.gpu` ရှိလျှင် WebGPU ကို ဦးစားပေးသုံးတယ်။ GPU adapter မရလျှင်
အလိုအလျောက် WASM ကို ပြောင်းပါတယ်။

### Model size များ

| Model | Size | အရည်အသွေး |
|---|---|---|
| `tiny` | ~42 MB | အမြန်ဆုံး (default) |
| `base` | ~60 MB | ဟန်ချက်ညီ |
| `small` | ~190 MB | အတိကျဆုံး |

Model ကို ပထမဆုံးအကြိမ်သာ download လုပ်တယ်၊ ပြီးလျှင် **Cache Storage +
IndexedDB** ထဲ သိမ်းထားတယ်။ နောက်အကြိမ်တွေမှာ cache ကနေ ချက်ချင်း ရပါတယ်။

---

## ၈။ Cloudflare R2 / CDN ပြင်ဆင်ခြင်း

`manifest.json` နှင့် Whisper models ကို R2 (သို့မဟုတ် CDN မဆိုရ) ပေါ် တင်ပါ။

**manifest.json ပုံစံ:**

```json
{
  "version": "1.5.0",
  "models": {
    "tiny":  { "file": "ggml-tiny-q5_1.bin",  "bytes": 44040192,  "sha256": "…" },
    "base":  { "file": "ggml-base-q5_1.bin",  "bytes": 62914560,  "sha256": "…" },
    "small": { "file": "ggml-small-q5_1.bin", "bytes": 199229440, "sha256": "…" }
  },
  "runtime": { "ffmpeg": "6.1.1", "ytdlp": "2026.10.26" }
}
```

**ဖွဲ့စည်းပုံ:**

```
https://cdn.amkyaw.dev/audiotext/
├── manifest.json
└── whisper/
    ├── ggml-tiny-q5_1.bin
    ├── ggml-base-q5_1.bin
    ├── ggml-small-q5_1.bin
    └── whisper.js            # (optional) whisper.cpp WASM build
    └── whisper.wasm
```

> `manifest.json` မရှိလျှင် app က built-in model table ကို အသုံးပြုပါတယ် —
> app မပျက်ပါ။

---

## ၉။ UI အင်္ဂါရပ်များ

- **Dark glassmorphism** — မှန်ကဲ့သို့ အကန့်များ၊ neon violet/cyan အရောင်များ
- **Animated background** — perspective grid၊ matrix rain၊ scan lines
- **Progress ring + neon bar** — bootstrap (model download) အတွက်
- **Pipeline checklist** — အဆင့် ၅ ဆင့် တိုးတက်မှု
- **Audio waveform** — တကယ့် peak envelope + playback
- **Terminal log drawer** — typewriter effect နဲ့ streaming logs
- **Update dialog** — GitHub Releases စစ်ဆေးခြင်း
- **Responsive** — mobile-first၊ desktop dashboard အထိ

### Keyboard shortcuts

| Key | လုပ်ဆောင်ချက် |
|---|---|
| `` ` `` သို့မဟုတ် `Ctrl+L` | Log drawer ဖွင့်/ပိတ် |
| `Esc` | Drawer / modal ပိတ် |
| `Enter` (URL field) | Pipeline စတင် |

---

## ၁၀။ ပြဿနာဖြေရှင်းခြင်း (Troubleshooting)

| ပြဿနာ | အကြောင်းရင်း | ဖြေရှင်းနည်း |
|---|---|---|
| `Host is unreachable` | Cross-origin sync XHR | Worker ကို same-origin မှာ ထား (§၆ ကြည့်) |
| `No module named 'ssl'` | Pyodide က ssl ကို unvendor လုပ်ထား | Worker ထဲ `loadPackage('ssl')` ခေါ်ပြီးသား (ရှိပြီး) |
| `Failed to get GPU adapter` | WebGPU မရ | အလိုအလျောက် WASM ကို ပြောင်း (ရှိပြီး) |
| Model download မရ | CDN URL မှား | `app_constants.js` ထဲ `cdnUrl` စစ်ပါ |
| Memory ပြည့် | ဖိုင်ကြီးလွန်း | 1.5 GB / 90 min ကန့်သတ်ချက် ရှိပြီး |
| Transcription နှေး | `tiny` model | `base`/`small` က ပိုတိကျပေမဲ့ ပိုနှေး |

---

## ၁၁။ လုံခြုံရေး (Security)

- ✅ **ဖိုင်များ server ဆီ မတင်ပို့ပါ** — browser ထဲမှာသာ လည်ပတ်တယ်
- ✅ **Server-side database မရှိ** — user data အားလုံး browser ထဲမှာသာ
- ✅ **Login မလိုပါ**
- ✅ Worker proxy က **host စစ်ဆေးတယ်** — YouTube domain တွေကိုသာ ခွင့်ပြုတယ်
  (open relay အဖြစ် အလွဲသုံးလို့ မရ)
- ✅ Worker က ဖိုင် ဘယ်တော့မှ **သိမ်းမထားပါ** — stream သာ ပေးတယ်
- ✅ CDN ဖိုင်များကို **SHA-256** နဲ့ စစ်ဆေးတယ် (manifest မှာ ရှိလျှင်)

---

## ၁၂။ နည်းပညာ Stack

| အလွှာ | နည်းပညာ |
|---|---|
| Frontend | Vanilla JS (ES modules) — framework မလို |
| yt-dlp | Pyodide (CPython → WASM) + `pyodide-http` |
| FFmpeg | `@ffmpeg/ffmpeg` 0.12 (WASM) |
| Whisper | `whisper.cpp` WASM / `@huggingface/transformers` (ONNX + WebGPU) |
| Proxy | Cloudflare Worker |
| Storage | Cache Storage + IndexedDB |
| Hosting | Cloudflare Pages + R2 (CDN) |

---

## ၁၃။ လိုင်စင်

Apache License 2.0 — `LICENSE` ဖိုင်ကို ကြည့်ပါ။

---

## ၁၄။ ပံ့ပိုးကူညီခြင်း (Contributing)

1. Feature branch တစ်ခု ဖန်တီးပါ: `git checkout -b feature/my-feature`
2. ပြင်ဆင်ချက်များ commit လုပ်ပါ
3. Push လုပ်ပြီး Pull Request ဖွင့်ပါ

Code style — feature-first ဖွဲ့စည်းပုံကို လိုက်နာပါ။ Feature အသစ်တစ်ခုလျှင်
`domain/` → `data/` → `presentation/` လို့ သုံးလွှာ ခွဲပါ။
