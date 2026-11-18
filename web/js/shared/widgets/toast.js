/**
 * Toast — transient status message pinned above the dock.
 */
let timer;

export function toast(message, root = document.getElementById('toast')) {
  if (!root) return;
  root.textContent = message;
  root.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(() => root.classList.remove('is-on'), 2600);
}
