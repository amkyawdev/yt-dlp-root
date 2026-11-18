/**
 * Update dialog — mirrors
 * lib/features/update/presentation/widgets/update_dialog.dart.
 *
 * Renders the "update available" modal: version delta, changelog preview, the
 * Worker health readout, and a one-click download of the new release asset.
 */
import { updateProvider } from '../providers/update_provider.js';
import { formatBytes } from '../../../../core/utils/file_utils.js';

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/** Turn a GitHub release body (markdown) into a short, safe changelog list. */
function changelogItems(notes, limit = 5) {
  const lines = (notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^<!--/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'))
    .slice(0, limit);
  return lines.length ? lines : ['maintenance release — see the full notes on GitHub'];
}

export class UpdateDialog {
  /** @param {HTMLElement} root the #modal element (inside #overlay) */
  constructor(root, { onToast } = {}) {
    this.root = root;
    this.overlay = document.getElementById('overlay');
    this.onToast = onToast;

    this.title = root.querySelector('#modalTitle');
    this.sub = root.querySelector('#modalSub');
    this.from = root.querySelector('#relFrom');
    this.to = root.querySelector('#relTo');
    this.size = root.querySelector('#relSize');
    this.changelog = root.querySelector('#modalChangelog');
    this.primary = root.querySelector('#modalUpdate');
    this.later = root.querySelector('#modalLater');
    this.closeBtn = root.querySelector('#modalClose');

    this.closeBtn.addEventListener('click', () => this.close());
    this.later.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay.hidden) this.close();
    });
    this.primary.addEventListener('click', () => this.download());
  }

  open(state = updateProvider.state) {
    const rel = state.release;
    if (!rel) {
      this.onToast?.('you are on the latest build');
      return;
    }
    this.title.textContent = `Update available — ${rel.tag}`;
    if (this.sub) this.sub.textContent = `github.com/${updateProvider.repo}`;
    if (this.from) this.from.textContent = `v${updateProvider.currentVersion}`;
    if (this.to) this.to.textContent = rel.tag;
    if (this.size) {
      const asset = rel.assets[0];
      this.size.textContent = asset ? formatBytes(asset.size) : 'source';
    }
    if (this.changelog) {
      this.changelog.innerHTML = changelogItems(rel.notes)
        .map((t) => `<li><span class="kind kind--feat mono">note</span>${esc(t)}</li>`)
        .join('');
    }
    this.overlay.hidden = false;
    setTimeout(() => this.closeBtn.focus(), 60);
  }

  close() {
    this.overlay.hidden = true;
  }

  /** Open the newest release asset (or the release page) in a new tab. */
  download() {
    const rel = updateProvider.state.release;
    const asset = rel?.assets?.[0];
    const url = asset?.url || rel?.htmlUrl;
    if (url) window.open(url, '_blank', 'noopener');
    this.onToast?.('opening download…');
    this.close();
  }
}
