/**
 * Log drawer — the collapsible terminal that streams pipeline output with a
 * typewriter effect.
 */
const LEVELS = { dbg: 'DBG', info: 'INF', ok: ' OK', warn: 'WRN', err: 'ERR' };
const pad = (n) => String(n).padStart(2, '0');

export class LogDrawer {
  constructor(root = document.getElementById('drawer')) {
    this.root = root;
    this.body = root.querySelector('#logBody');
    this.count = root.querySelector('#logCount');
    this.hint = root.querySelector('#logHint');
    this.toggleBtn = document.getElementById('logToggle');

    this.n = 0;
    this.paused = false;
    this.typing = false;
    this.queue = [];

    root.querySelector('#logClose').addEventListener('click', () => this.close());
    root.querySelector('#logClear').addEventListener('click', () => this.clear());
    root.querySelector('#logPause').addEventListener('click', (e) => this.togglePause(e.target));
    this.toggleBtn.addEventListener('click', () => this.toggle());

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      else if (e.key === '`' || (e.key.toLowerCase() === 'l' && e.ctrlKey)) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  get isOpen() {
    return this.root.classList.contains('is-open');
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
    this.toggleBtn.setAttribute('aria-expanded', 'true');
    this.n = 0;
    this.count.textContent = '0';
    this.body.scrollTop = this.body.scrollHeight;
  }

  close() {
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    this.toggleBtn.setAttribute('aria-expanded', 'false');
  }

  clear() {
    this.body.innerHTML = '';
    this.n = 0;
    this.count.textContent = '0';
  }

  togglePause(btn) {
    this.paused = !this.paused;
    btn.textContent = this.paused ? 'resume' : 'pause';
    this.hint.textContent = this.paused ? 'stream paused' : 'streaming…';
  }

  _stamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  _nearBottom() {
    return this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 90;
  }

  _write(level, msg, instant) {
    const line = document.createElement('div');
    line.className = `logline logline--${level}`;
    line.innerHTML =
      `<span class="logline__t">${this._stamp()}</span>` +
      `<span class="logline__lv">${LEVELS[level]}</span>` +
      `<span class="logline__m"></span>`;
    const target = line.querySelector('.logline__m');
    this.body.appendChild(line);
    this.n++;
    this.count.textContent = this.n > 99 ? '99+' : this.n;
    while (this.body.children.length > 240) this.body.firstChild.remove();

    if (instant) {
      target.innerHTML = msg;
      if (this._nearBottom()) this.body.scrollTop = this.body.scrollHeight;
      return Promise.resolve();
    }
    return new Promise((res) => {
      let i = 0;
      let out = '';
      const step = () => {
        for (let k = 0; k < 3 && i < msg.length; k++, i++) {
          if (msg[i] === '<') {
            const e = msg.indexOf('>', i);
            if (e > -1) {
              out += msg.slice(i, e + 1);
              i = e;
              continue;
            }
          }
          out += msg[i];
        }
        target.innerHTML = out;
        if (this._nearBottom()) this.body.scrollTop = this.body.scrollHeight;
        i < msg.length ? setTimeout(step, 9) : res();
      };
      step();
    });
  }

  async _drain() {
    if (this.typing) return;
    this.typing = true;
    while (this.queue.length) {
      if (this.paused) {
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const [level, msg, instant] = this.queue.shift();
      await this._write(level, msg, instant);
      await new Promise((r) => setTimeout(r, 55));
    }
    this.typing = false;
  }

  push(level, msg, instant = false) {
    this.queue.push([level, msg, instant]);
    this._drain();
  }
}
