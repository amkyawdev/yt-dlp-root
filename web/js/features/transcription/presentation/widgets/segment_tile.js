/**
 * Segment tile — mirrors
 * lib/features/transcription/presentation/widgets/segment_tile.dart.
 *
 * One transcript row: timestamp range, text, and a copy button.
 */
import { fmtShort } from '../../domain/entities/transcript_segment.js';
import { copyText } from '../../../../core/utils/file_utils.js';

export function buildSegmentTile(segment, { onCopy } = {}) {
  const row = document.createElement('div');
  row.className = 'seg';
  row.innerHTML =
    `<span class="seg__t mono">${fmtShort(segment.start)} → ${fmtShort(segment.end)}</span>` +
    `<span class="seg__x"></span>` +
    `<button class="seg__c" title="Copy segment">` +
    `<svg viewBox="0 0 24 24" class="ico"><rect x="9" y="9" width="11" height="11" rx="2"/>` +
    `<path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg></button>`;

  row.querySelector('.seg__x').textContent = segment.text;
  row.querySelector('.seg__c').addEventListener('click', async () => {
    await copyText(segment.text);
    onCopy?.(segment);
  });
  return row;
}
