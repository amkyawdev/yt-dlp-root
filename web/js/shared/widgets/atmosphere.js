/**
 * Atmosphere — the animated background: perspective grid, drifting glows, scan
 * lines, film grain and a matrix-rain canvas.
 */
export function initAtmosphere(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const GLYPHS = 'アカサタナハマヤラワｦｧｨｩ0123456789ABCDEF<>{}[]/\\|=+*#$%&';
  const FS = 15;
  let w = 0;
  let h = 0;
  let cols = 0;
  let drops = [];
  let glyphs = [];

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / FS);
    drops = Array.from({ length: cols }, () => -Math.random() * 40);
    glyphs = Array.from({ length: cols }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
  }
  size();
  addEventListener('resize', size, { passive: true });

  let last = 0;
  (function frame(t) {
    if (t - last > 62) {
      last = t;
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${FS}px "JetBrains Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        if (Math.random() < 0.04) glyphs[i] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const y = drops[i] * FS;
        ctx.fillStyle = Math.random() < 0.015 ? 'rgba(245,158,11,.5)' : 'rgba(168,85,247,.45)';
        ctx.fillText(glyphs[i], i * FS, y);
        if (y > h && Math.random() > 0.975) drops[i] = -Math.random() * 30;
        else drops[i] += 1;
      }
    }
    requestAnimationFrame(frame);
  })(0);
}
