/**
 * AudioText Extractor — application entry point.
 *
 * Mirrors lib/main.dart + lib/app.dart: it composes the feature modules
 * (bootstrap, extraction, transcription, update), the shared widgets, and the
 * navigation, and owns the top-level pipeline that runs on "extract & transcribe".
 *
 * Everything heavy (yt-dlp, FFmpeg, Whisper) runs in this browser tab.
 */
import { AppConstants } from './core/constants/app_constants.js';
import { formatBytes, safeStem } from './core/utils/file_utils.js';
import { ping as pingWorker } from './core/services/cloudflare_service.js';
import { cacheStats, clearCache } from './core/services/download_service.js';
import { initAtmosphere } from './shared/widgets/atmosphere.js';
import { LogDrawer } from './shared/widgets/log_drawer.js';
import { Waveform } from './shared/widgets/waveform.js';
import { toast } from './shared/widgets/toast.js';
import { bootstrapProvider } from './features/bootstrap/presentation/providers/bootstrap_provider.js';
import { SplashScreen } from './features/bootstrap/presentation/screens/splash_screen.js';
import { extractionProvider } from './features/extraction/presentation/providers/extraction_provider.js';
import { ExtractScreen } from './features/extraction/presentation/screens/extract_screen.js';
import { transcriptionProvider } from './features/transcription/presentation/providers/transcription_provider.js';
import { TranscriptScreen } from './features/transcription/presentation/screens/transcript_screen.js';
import { updateProvider } from './features/update/presentation/providers/update_provider.js';
import { UpdateDialog } from './features/update/presentation/widgets/update_dialog.js';
import { CancelledFailure } from './core/errors/failures.js';

const $ = (s) => document.querySelector(s);

/* ═══════════════ shared widgets ═══════════════ */
initAtmosphere($('#matrix'));
const logs = new LogDrawer();
const waveform = new Waveform($('#wave'));

/* ═══════════════ navigation ═══════════════ */
const Nav = (() => {
  const ind = $('#dockInd');
  const items = [...document.querySelectorAll('.dock__item')];
  const place = (i) => {
    if (!i) return;
    ind.style.width = `${i.offsetWidth}px`;
    ind.style.transform = `translateX(${i.offsetLeft - 6}px)`;
  };
  function go(view) {
    if (view === 'logs') return logs.open();
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('is-active', v.dataset.view === view);
    for (const i of items) i.classList.toggle('is-active', i.dataset.view === view);
    place(items.find((i) => i.dataset.view === view));
    $('#stage').scrollTo({ top: 0, behavior: 'smooth' });
  }
  for (const i of items) i.addEventListener('click', () => go(i.dataset.view));
  addEventListener('resize', () => place(items.find((i) => i.classList.contains('is-active'))));
  setTimeout(() => place(items.find((i) => i.classList.contains('is-active'))), 140);
  return { go };
})();

/* ═══════════════ screens ═══════════════ */
const splash = new SplashScreen($('#boot'), bootstrapProvider);

const extractScreen = new ExtractScreen($('#view-workbench'), extractionProvider, {
  onRun: runPipeline,
  onCancel: () => {
    cancelRequested = true;
    toast('cancelling after current stage…');
    logs.push('warn', 'cancel requested');
  },
});

const transcriptScreen = new TranscriptScreen($('#view-result'), transcriptionProvider, {
  onToast: toast,
  onAudioDownload: exportAudio,
});

const updateDialog = new UpdateDialog($('#modal'), { onToast: toast });

/* ═══════════════ worker health ═══════════════ */
(async function workerHealth() {
  const dot = $('#workerDot');
  const label = $('#workerLabel');
  async function check() {
    label.textContent = 'worker · pinging';
    const r = await pingWorker();
    dot.className = `pulse-dot ${r.ok ? (r.ms < 400 ? 'is-ok' : 'is-warn') : 'is-bad'}`;
    label.textContent = r.ok ? `worker · ${r.ms} ms` : 'worker · offline';
    $('#modalDot').className = `pulse-dot pulse-dot--sm ${r.ok ? 'is-ok' : 'is-bad'}`;
    $('#modalPing').textContent = r.ok ? `pong · ${r.ms} ms` : 'unreachable';
    $('#modalPingBar').style.width = `${Math.max(12, Math.min(96, 100 - (r.ms / 200) * 100))}%`;
    return r;
  }
  await check();
  $('#workerChip').addEventListener('click', check);
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30_000);
})();

/* ═══════════════ cache chip ═══════════════ */
(async function cacheChip() {
  const label = $('#cacheLabel');
  async function refresh() {
    const { bytes, count } = await cacheStats();
    label.textContent = `cache · ${count ? formatBytes(bytes) : 'empty'}`;
  }
  await refresh();
  $('#cacheChip').addEventListener('click', async () => {
    await clearCache();
    await refresh();
    toast('model cache cleared');
    logs.push('warn', 'cache cleared — models re-download on next run');
  });
  window.__refreshCache = refresh;
})();

/* ═══════════════ update chip ═══════════════ */
$('#updateChip').addEventListener('click', async () => {
  const label = $('#updateLabel');
  label.textContent = 'checking…';
  const state = await updateProvider.check();
  label.textContent = state.error ? 'updates · err' : state.available ? `update ${state.release.tag}` : 'up to date';
  if (state.available) {
    logs.push('ok', `update available — <em>${state.release.tag}</em> (current v${updateProvider.currentVersion})`);
    updateDialog.open(state);
  } else {
    toast(state.error ? 'update check failed' : 'you are on the latest build');
  }
});

/* ═══════════════ bootstrap ═══════════════ */
$('#bootSkip').addEventListener('click', () => {
  bootstrapProvider.skip();
  splash.hide();
  logs.push('warn', 'model preload skipped — it downloads during the first transcription');
});
$('#bootRetry').addEventListener('click', () => {
  splash.show();
  bootstrapProvider.boot(extractionProvider.state.model);
});

(async function boot() {
  logs.push('dbg', 'AudioText Extractor — <b>100% client-side</b> pipeline (yt-dlp · ffmpeg · whisper)', true);
  logs.push('info', `worker proxy → <u>${AppConstants.workerUrl || location.origin}</u>`, true);
  if (!('WebAssembly' in window)) logs.push('err', 'WebAssembly is unavailable in this browser', true);

  const ok = await bootstrapProvider.boot(extractionProvider.state.model);
  if (ok) {
    logs.push('ok', `whisper <b>${extractionProvider.state.model}</b> cached — engine ready`);
    toast('engine ready · console unlocked');
  }
  window.__refreshCache?.();
})();

/* ═══════════════ pipeline ═══════════════ */
let cancelRequested = false;
let lastAudioStem = 'audio';

async function runPipeline() {
  if (extractionProvider.state.running) return;
  if (!extractionProvider.canRun) {
    toast(extractionProvider.state.mode === 'youtube' ? 'enter a YouTube URL' : 'choose a file first');
    return;
  }

  cancelRequested = false;
  extractScreen.setBusy(true);
  extractScreen.resetPipeline();
  transcriptScreen.setAudioEnabled(false);
  logs.open();

  const t0 = performance.now();
  try {
    /* resolve → download → extract → convert */
    const { audio, wav } = await extractionProvider.run({
      isCancelled: () => cancelRequested,
      onStatus: (m) => logs.push('dbg', m),
      onStage: (stage, pct) => {
        extractScreen.stage(stage, pct >= 100 ? 'done' : 'active', pct);
        if (stage === 'resolve') extractScreen.showYouTubeInfo(audio?.info);
      },
    });

    extractScreen.showYouTubeInfo(audio.info);
    lastAudioStem = safeStem(audio.title || 'audio');
    waveform.load(audio.blob, {
      label: `${(audio.ext || 'audio').toUpperCase()} · 16 kHz mono`,
      bitrate: audio.info?.audio?.abr || null,
    });
    logs.push('ok', `audio ready — ${formatBytes(audio.blob.size)} → 16 kHz mono wav ${formatBytes(wav.length)}`);

    if (cancelRequested) throw new CancelledFailure();

    /* transcribe */
    extractScreen.stage('transcribe', 'active');
    transcriptionProvider.state.model = extractionProvider.state.model;
    transcriptionProvider.state.language = extractionProvider.state.language;
    logs.push('info', `whisper ${extractionProvider.state.model} · language ${extractionProvider.state.language}`);

    await transcriptionProvider.run(wav, {
      onProgress: (p) => {
        if (p.phase === 'model') extractScreen.stage('transcribe', 'active', (p.ratio || 0) * 100);
        if (p.phase === 'note') logs.push('warn', p.message);
        if (p.phase === 'transcribe' && p.ratio != null) extractScreen.stage('transcribe', 'active', p.ratio * 100);
      },
      onSegment: (c) => logs.push('dbg', `[${(c.start / 1000).toFixed(1)}s] ${c.text.slice(0, 90)}`, true),
    });

    extractScreen.stage('transcribe', 'done', 100);
    extractScreen.pipelineDone();
    transcriptScreen.render();
    transcriptScreen.setAudioEnabled(true);
    window.__refreshCache?.();

    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    logs.push('ok', `pipeline finished in <b>${secs}s</b> — ${transcriptionProvider.state.segments.length} segments`);
    toast(`transcript ready · ${transcriptionProvider.state.segments.length} segments`);
    Nav.go('result');
  } catch (err) {
    if (err instanceof CancelledFailure) {
      extractScreen.pipelineError();
      logs.push('warn', 'pipeline cancelled by operator');
      toast('cancelled');
    } else {
      extractScreen.pipelineError();
      logs.push('err', `pipeline failed: ${String(err?.message ?? err)}`);
      toast('pipeline failed — see logs');
      console.error(err);
    }
  } finally {
    extractScreen.setBusy(false);
  }
}

/* ═══════════════ audio export ═══════════════ */
async function exportAudio() {
  const audio = extractionProvider.state.audio;
  if (!audio) return toast('no audio yet');
  const format = extractionProvider.state.format;
  try {
    if (format === 'mp3') {
      toast('encoding mp3…');
      const { bytes } = await extractionProvider.exportAudio('mp3');
      TranscriptScreen.saveBytes(`${lastAudioStem}.mp3`, bytes, 'audio/mpeg');
    } else if (format === 'wav') {
      TranscriptScreen.saveBytes(`${lastAudioStem}.16k.wav`, extractionProvider.state.wav, 'audio/wav');
    } else {
      TranscriptScreen.saveBytes(`${lastAudioStem}.${audio.ext || 'm4a'}`, new Uint8Array(await audio.blob.arrayBuffer()), audio.blob.type);
    }
    logs.push('ok', `downloaded audio (${format})`);
    toast('audio saved');
  } catch (err) {
    logs.push('err', `audio export failed: ${err.message}`);
    toast('audio export failed');
  }
}

/* ═══════════════ boot logs ═══════════════ */
$('#goResult').addEventListener('click', () => Nav.go('result'));

window.__app = { Nav, logs, waveform, bootstrapProvider, extractionProvider, transcriptionProvider, updateProvider, AppConstants };
