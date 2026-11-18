/**
 * Source input field — mirrors
 * lib/features/extraction/presentation/widgets/source_input_field.dart.
 *
 * Owns the YouTube URL field, the paste button, and the platform badge.
 */
import { detectPlatform, isYouTubeUrl } from '../../domain/entities/audio_source.js';
import { copyText } from '../../../../core/utils/file_utils.js';

export class SourceInputField {
  /** @param {HTMLElement} root the #modeYoutube container */
  constructor(root, { onChange } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.input = root.querySelector('#urlInput');
    this.badge = root.querySelector('#platformBadge');
    this.pasteBtn = root.querySelector('#pasteBtn');

    this.input.addEventListener('input', () => {
      this.renderBadge();
      this.onChange?.(this.input.value);
    });
    this.pasteBtn.addEventListener('click', () => this.paste());
  }

  get value() {
    return this.input.value.trim();
  }

  set value(v) {
    this.input.value = v;
    this.renderBadge();
    this.onChange?.(v);
  }

  renderBadge() {
    const v = this.input.value;
    if (!v.trim()) {
      this.badge.textContent = 'auto-detect';
      this.badge.className = 'tag mono';
      return;
    }
    if (isYouTubeUrl(v)) {
      this.badge.textContent = detectPlatform(v) || 'YouTube';
      this.badge.className = 'tag mono value--cyan';
    } else {
      this.badge.textContent = 'not youtube';
      this.badge.className = 'tag mono value--gold';
    }
  }

  async paste() {
    try {
      const t = (await navigator.clipboard.readText() || '').trim();
      if (t) {
        this.value = t;
        return true;
      }
    } catch {
      /* clipboard blocked */
    }
    return false;
  }

  async copy(text) {
    return copyText(text);
  }
}
