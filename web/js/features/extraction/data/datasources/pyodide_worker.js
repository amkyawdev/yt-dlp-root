/**
 * Pyodide worker entry — runs yt-dlp off the main thread.
 *
 * Why a worker: Pyodide's HTTP bridge performs *synchronous* XHR so blocking
 * Python code can do network I/O. Browsers only allow that off the main thread.
 * It also keeps the UI responsive during the ~12 MB runtime load.
 *
 * Why the JS fetch/XHR shims: Pyodide's urllib shim performs the real network
 * call straight through JS fetch/XHR, bypassing a Python-level OpenerDirector
 * patch. Patching the JS layer guarantees every YouTube request is rewritten to
 * the Worker proxy.
 */
import { PY_BRIDGE } from './py_bridge.py.js';

const YT = /(^|\.)(youtube\.com|youtu\.be|youtubei\.googleapis\.com|googlevideo\.com|ytimg\.com|ggpht\.com)$/i;

let workerUrl = '';
const post = (type, data = {}) => self.postMessage({ type, ...data });

function rewrite(url) {
  try {
    const u = new URL(url, self.location.href);
    if (workerUrl && YT.test(u.hostname)) {
      return `${workerUrl.replace(/\/$/, '')}/proxy?url=${encodeURIComponent(u.href)}`;
    }
  } catch {
    /* not a URL — leave untouched */
  }
  return url;
}

/* Patch the JS networking primitives before any Python runs. */
function installProxyShims() {
  const origFetch = self.fetch.bind(self);
  self.fetch = (input, init) => {
    if (typeof input === 'string') return origFetch(rewrite(input), init);
    if (input instanceof Request) return origFetch(new Request(rewrite(input.url), input), init);
    return origFetch(input, init);
  };
  const xhrOpen = self.XMLHttpRequest.prototype.open;
  self.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return xhrOpen.call(this, method, rewrite(url), ...rest);
  };
}

let pyodide = null;
let resolveFn = null;
let version = null;

async function init({ worker, pyodideUrl }) {
  workerUrl = worker || '';
  installProxyShims();

  post('status', { message: 'loading Pyodide runtime' });
  const { loadPyodide } = await import(`${pyodideUrl}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: pyodideUrl });

  post('status', { message: 'installing yt-dlp' });
  await pyodide.loadPackage('micropip');

  // Pyodide unvendors these from the stdlib; yt-dlp imports `ssl` directly.
  for (const pkg of ['ssl', 'certifi', 'sqlite3']) {
    try {
      await pyodide.loadPackage(pkg);
    } catch {
      /* optional */
    }
  }

  await pyodide.runPythonAsync(`
import micropip
try:
    await micropip.install("yt-dlp", deps=False)
except Exception:
    await micropip.install("yt-dlp")
# pyodide-http reroutes urllib / http.client through XMLHttpRequest. Without it
# urllib falls back to Emscripten sockets, which cannot reach the network and
# fail with OSError(23, 'Host is unreachable').
try:
    await micropip.install("pyodide-http")
    import pyodide_http
    pyodide_http.patch_all()
except Exception as _e:
    print("pyodide-http unavailable:", _e)
`);

  post('status', { message: 'patching urllib to the Worker proxy' });
  // Pass the raw URL — JSON.stringify would add quotes and break the rewrite.
  pyodide.globals.set('__WORKER__', workerUrl);
  await pyodide.runPythonAsync(PY_BRIDGE);

  resolveFn = pyodide.globals.get('resolve');
  version = pyodide.runPython('version()');
  post('ready', { version });
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      await init(msg);
    } else if (msg.type === 'resolve') {
      if (!resolveFn) throw new Error('Pyodide not initialised');
      const info = JSON.parse(resolveFn(msg.url, msg.client || 'android'));
      post('resolved', { id: msg.id, info });
    }
  } catch (err) {
    const message = String(err?.message ?? err).split('\n').slice(-5).join(' ').slice(0, 700);
    if (msg.type === 'resolve') post('resolve-error', { id: msg.id, message });
    else post('error', { message });
  }
};
