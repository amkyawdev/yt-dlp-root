/**
 * File drop widget — the local-file half of the source input.
 * Pairs with SourceInputField for the two input modes.
 */
import { formatBytes } from '../../../../core/utils/file_utils.js';

export class FileDropZone {
  /** @param {HTMLElement} root the #modeFile container */
  constructor(root, { onChange } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.drop = root.querySelector('#dropzone');
    this.input = root.querySelector('#fileInput');
    this.meta = root.querySelector('#fileMeta');
    this.nameEl = root.querySelector('#fileName');
    this.sizeEl = root.querySelector('#fileSize');
    this.clearBtn = root.querySelector('#fileClear');
    this.file = null;

    this.drop.addEventListener('click', () => this.input.click());
    this.drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.input.click();
      }
    });
    this.input.addEventListener('change', () => this.input.files[0] && this.set(this.input.files[0]));

    for (const ev of ['dragenter', 'dragover']) {
      this.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        this.drop.classList.add('is-over');
      });
    }
    for (const ev of ['dragleave', 'drop']) {
      this.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        this.drop.classList.remove('is-over');
      });
    }
    this.drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) this.set(f);
    });

    this.clearBtn.addEventListener('click', () => this.clear());
  }

  set(file) {
    this.file = file;
    this.nameEl.textContent = file.name;
    this.sizeEl.textContent = `${formatBytes(file.size)} · ${file.type || 'unknown type'}`;
    this.meta.hidden = false;
    this.onChange?.(file);
  }

  clear() {
    this.file = null;
    this.input.value = '';
    this.meta.hidden = true;
    this.onChange?.(null);
  }
}
