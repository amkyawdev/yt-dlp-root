/**
 * Deploy the Worker to Cloudflare via the REST API (no wrangler needed).
 *
 * Usage:
 *   CF_API_TOKEN=... CF_ACCOUNT_ID=... node deploy.mjs [script-name]
 *
 * The token needs the "Workers Scripts: Edit" permission on the account.
 * The API token is read from the environment and never written to disk.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const NAME = process.argv[2] || process.env.CF_SCRIPT_NAME || 'yt-dlp';

if (!TOKEN || !ACCOUNT) {
  console.error('Missing CF_API_TOKEN and/or CF_ACCOUNT_ID environment variables.');
  process.exit(1);
}

const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const auth = { Authorization: `Bearer ${TOKEN}` };

async function check(label, res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  const ok = res.ok && body.success !== false;
  console.log(`${ok ? '✓' : '✗'} ${label} — HTTP ${res.status}`);
  if (!ok) console.log('   ', JSON.stringify(body.errors ?? body).slice(0, 400));
  return { ok, body };
}

/* 1. verify the token using the *account-scoped* endpoint. (Account API
 * tokens are rejected by the user-scoped /user/tokens/verify.) */
console.log('→ verifying token');
const verify = await check('token verify', await fetch(`${api}/tokens/verify`, { headers: auth }));
if (!verify.ok) process.exit(1);

/* 1b. confirm the token can see this account's Workers */
const probe = await check('workers access', await fetch(`${api}/workers/scripts`, { headers: auth }));
if (!probe.ok) {
  console.error('Token cannot access Workers for this account — aborting.');
  process.exit(1);
}

/* 2. upload the script */
console.log(`→ deploying script "${NAME}"`);
const source = await readFile(join(__dir, 'src/index.js'), 'utf8');
const metadata = { main_module: 'index.js', compatibility_date: '2024-11-01' };

const form = new FormData();
form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
// The third argument is the filename; Cloudflare matches `main_module` to it.
form.set('index.js', new Blob([source], { type: 'application/javascript+module' }), 'index.js');

const deploy = await check(
  'upload',
  await fetch(`${api}/workers/scripts/${NAME}`, { method: 'PUT', headers: auth, body: form })
);
if (!deploy.ok) process.exit(1);

/* 3. ensure the workers.dev subdomain is enabled */
console.log('→ enabling workers.dev route');
await check(
  'subdomain',
  await fetch(`${api}/workers/scripts/${NAME}/subdomain`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, previews_enabled: false }),
  })
);

/* 4. report the deployment URL */
const sub = await fetch(`${api}/workers/subdomain`, { headers: auth }).then((r) => r.json()).catch(() => null);
const subdomain = sub?.result?.subdomain;
if (subdomain) console.log(`\n✅ live at https://${NAME}.${subdomain}.workers.dev/health`);
