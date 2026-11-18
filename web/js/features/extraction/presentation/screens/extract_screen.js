/**
 * Extract screen — mirrors
 * lib/features/extraction/presentation/screens/extract_screen.dart.
 *
 * The workbench view: source input (YouTube / local file), options, the
 * pipeline checklist, the audio preview waveform and the runtime readout.
 */
import { SourceInputField } from '../widgets/source_input_field.js';
import { FileDropZone } from '../widgets/file_drop_zone.js';
import { formatBytes, probeDuration } from '../../../../core/utils/file_utils.js';

export class ExtractScreen {
  /** @param {HTMLElement} root the #view-workbench element */
  constructor(root, provider, { onRun, onCancel } = {}) {
    this.root = root;
    this.provider = provider;

    this.tabs = [...root.querySelectorAll('.tab')];
    this.modeYoutube = root.querySelector('#modeYoutube');
    this.modeFile = root.querySelector('#modeFile');
    this.runBtn = root.querySelector('#runBtn');
    this.cancelBtn = root.querySelector('#cancelBtn');
    this.pipelineState = root.querySelector('#pipelineState');
    this.steps = [...root.querySelectorAll('#pipeline .pstep')];

    this.sourceInput = new SourceInputField(this.modeYoutube, { onChange: (v) => provider.setUrl(v) });
    this.dropZone = new FileDropZone(this.modeFile, { onChange: (f) => provider.setFile(f) });

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode));
    }
    for (const row of root.querySelectorAll('.pillrow')) {
      row.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        for (const o of row.querySelectorAll('.pill')) {
          o.classList.toggle('is-on', o === pill);
          o.setAttribute('aria-checked', String(o === pill));
        }
        if (pill.dataset.model) provider.setOption('model', pill.dataset.model);
        if (pill.dataset.lang) provider.setOption('language', pill.dataset.lang);
        if (pill.dataset.format) provider.setOption('format', pill.dataset.format);
      });
    }

    this.runBtn.addEventListener('click', () => onRun?.());
    this.cancelBtn.addEventListener('click', () => onCancel?.());

    // YouTube metadata preview (title / uploader / duration)
    this.meta = root.querySelector('#ytMeta');
    this.metaTitle = root.querySelector('#ytTitle');
    this.metaUploader = root.querySelector('#ytUploader');
    this.metaDuration = root.querySelector('#ytDuration');
    this.metaThumb = root.querySelector('#ytThumb');
  }

  setMode(mode) {
    this.provider.setMode(mode);
    for (const tab of this.tabs) {
      tab.classList.toggle('is-on', tab.dataset.mode === mode);
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    }
    this.modeYoutube.classList.toggle('is-on', mode === 'youtube');
    this.modeFile.classList.toggle('is-on', mode === 'file');
  }

  setBusy(busy) {
    this.runBtn.disabled = busy;
    this.cancelBtn.hidden = !busy;
  }

  /* ── pipeline checklist ── */
  resetPipeline() {
    for (const s of this.steps) {
      s.dataset.state = 'idle';
      s.querySelector('.pstep__pct').textContent = '—';
    }
    this.pipelineState.textContent = 'idle';
    this.pipelineState.className = 'tag tag--violet mono';
  }

  stage(stage, status, pct) {
    const el = this.steps.find((s) => s.dataset.step === stage);
    if (!el) return;
    el.dataset.state = status;
    if (pct != null) el.querySelector('.pstep__pct').textContent = `${Math.round(pct)}%`;
    if (status === 'active') {
      this.pipelineState.textContent = stage;
      this.pipelineState.className = 'tag tag--violet mono';
    }
  }

  pipelineDone() {
    this.pipelineState.textContent = 'complete';
    this.pipelineState.className = 'tag mono value--cyan';
  }

  pipelineError() {
    this.pipelineState.textContent = 'error';
    this.pipelineState.className = 'tag mono value--gold';
  }

  /** Show the resolved YouTube metadata card. */
  showYouTubeInfo(info) {
    if (!info) return;
    this.meta.hidden = false;
    this.metaTitle.textContent = info.title || '—';
    this.metaUploader.textContent = info.uploader || '—';
    this.metaDuration.textContent = info.duration
      ? `${String(Math.floor(info.duration / 60)).padStart(2, '0')}:${String(info.duration % 60).padStart(2, '0')}`
      : '—:—';
    const id = (info.webpage_url || '').match(/[-\w]{11}/)?.[0];
    if (id) {
      this.metaThumb.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      this.metaThumb.style.display = '';
    } else {
      this.metaThumb.style.display = 'none';
    }
  }

  static describeFile(file) {
    return `${formatBytes(file.size)}`;
  }

  static probe = probeDuration;
}
