/**
 * Loading indicator — mirrors lib/shared/widgets/loading_indicator.dart.
 *
 * A tiny wrapper for the neon progress bar + percentage readout used by the
 * splash banner and any inline progress.
 */
export class LoadingIndicator {
  /**
   * @param {HTMLElement} barEl   the <i> fill element
   * @param {HTMLElement} [labelEl] optional text readout
   */
  constructor(barEl, labelEl = null) {
    this.bar = barEl;
    this.label = labelEl;
  }

  /** @param {number} ratio 0..1 */
  set(ratio, text) {
    const pct = Math.max(0, Math.min(100, (ratio || 0) * 100));
    if (this.bar) this.bar.style.width = `${pct}%`;
    if (this.label) this.label.textContent = text ?? `${Math.round(pct)}%`;
  }

  reset() {
    this.set(0);
  }
}

/** Indeterminate variant: cycles the fill to show activity without a ratio. */
export function startIndeterminate(indicator, ms = 400) {
  let v = 0;
  const id = setInterval(() => {
    v = (v + 7) % 100;
    indicator.set(v / 100, 'working…');
  }, ms);
  return () => clearInterval(id);
}
