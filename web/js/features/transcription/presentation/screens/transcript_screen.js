/**
 * Transcript screen — mirrors
 * lib/features/transcription/presentation/screens/transcript_screen.dart.
 *
 * Renders the segment list and wires the export actions (copy, .txt, .vtt,
 * .srt, and the audio download).
 */
import { buildSegmentTile } from '../widgets/segment_tile.js';
import { fmtTime, toPlainText, toSRT, toVTT } from '../../domain/entities/transcript_segment.js';
import { copyText, downloadBlob, downloadText, safeStem } from '../../../../core/utils/file_utils.js';

export class TranscriptScreen {
  /** @param {HTMLElement} root the #view-result element */
  constructor(root, provider, { onAudioDownload, onToast } = {}) {
    this.root = root;
    this.provider = provider;
    this.onAudioDownload = onAudioDownload;
    this.onToast = onToast;

    this.list = root.querySelector('#seglist');
    this.empty = root.querySelector('#resultEmpty');
    this.engineTag = root.querySelector('#resEngine');
    this.segmentsTag = root.querySelector('#resSegments');
    this.durationTag = root.querySelector('#resDuration');
    this.audioBtn = root.querySelector('#downloadAudio');

    root.querySelector('#copyTranscript').addEventListener('click', () => this.copyAll());
    root.querySelector('#downloadTxt').addEventListener('click', () => this.exportTxt());
    root.querySelector('#downloadVtt').addEventListener('click', () => this.exportVtt());
    root.querySelector('#downloadSrt').addEventListener('click', () => this.exportSrt());
    this.audioBtn.addEventListener('click', () => this.onAudioDownload?.());
  }

  get segments() {
    return this.provider.state.segments;
  }

  render() {
    const segments = this.segments;
    this.list.innerHTML = '';

    this.engineTag.textContent = `engine · ${this.provider.state.engine || '—'}`;
    this.segmentsTag.textContent = `${segments.length} segments`;
    const dur = segments.length ? segments[segments.length - 1].end : 0;
    this.durationTag.textContent = fmtTime(dur).slice(0, 8);

    if (!segments.length) {
      this.empty.hidden = false;
      this.list.hidden = true;
      return;
    }
    this.empty.hidden = true;
    this.list.hidden = false;
    for (const s of segments) {
      this.list.appendChild(buildSegmentTile(s, { onCopy: () => this.onToast?.('segment copied') }));
    }
  }

  setAudioEnabled(enabled) {
    this.audioBtn.disabled = !enabled;
  }

  stem() {
    return safeStem(this.provider.state.title || 'transcript');
  }

  async copyAll() {
    if (!this.segments.length) return this.onToast?.('nothing to copy yet');
    const ok = await copyText(toPlainText(this.segments, false));
    this.onToast?.(ok ? 'transcript copied' : 'clipboard blocked');
  }

  exportTxt() {
    if (!this.segments.length) return this.onToast?.('nothing to export yet');
    downloadText(`${this.stem()}.txt`, toPlainText(this.segments, true));
    this.onToast?.('transcript saved');
  }

  exportVtt() {
    if (!this.segments.length) return this.onToast?.('nothing to export yet');
    downloadText(`${this.stem()}.vtt`, toVTT(this.segments), 'text/vtt');
    this.onToast?.('subtitles.vtt saved');
  }

  exportSrt() {
    if (!this.segments.length) return this.onToast?.('nothing to export yet');
    downloadText(`${this.stem()}.srt`, toSRT(this.segments), 'application/x-subrip');
    this.onToast?.('subtitles.srt saved');
  }

  /** Save arbitrary bytes (used by the audio export path). */
  static saveBytes(name, bytes, mime) {
    downloadBlob(name, new Blob([bytes], { type: mime }));
  }
}
