// Runs before `npm run dev` so two servers never fight over a port.
// A leftover dev server from this project is stopped; anything else is reported and the start
// is aborted. Ports are not switched automatically: the web app, CORS (WEB_ORIGIN) and the
// socket URL all expect 3000 and 4000.
//   node scripts/free-port.mjs <port>      (PORT in the environment wins)
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  console.error('usage: node scripts/free-port.mjs <port>');
  process.exit(1);
}

const win = process.platform === 'win32';
const norm = (s) => s.replaceAll('\\', '/').toLowerCase();
const root = norm(resolve(import.meta.dirname, '..'));

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function listeners() {
  if (!win) return [...new Set(run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split(/\s+/).filter(Boolean).map(Number))];
  // "  TCP    [::]:3000    [::]:0    LISTENING    1234"
  const pids = run('netstat', ['-ano', '-p', 'TCP']).concat(run('netstat', ['-ano', '-p', 'TCPv6']))
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`))
    .map((cols) => Number(cols[4]));
  return [...new Set(pids)].filter((pid) => pid > 0);
}

/** { pid, ppid, command } or null when the process is gone. */
function info(pid) {
  if (!win) {
    const out = run('ps', ['-o', 'ppid=,command=', '-p', String(pid)]).trim();
    const m = out.match(/^(\d+)\s+(.*)$/);
    return m ? { pid, ppid: Number(m[1]), command: m[2] } : null;
  }
  const out = run('powershell', [
    '-NoProfile',
    '-Command',
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ParentProcessId,CommandLine | ConvertTo-Json -Compress`,
  ]).trim();
  if (!out) return null;
  const p = JSON.parse(out);
  return { pid, ppid: p.ParentProcessId, command: p.CommandLine ?? '' };
}

/** The outermost process of this project that leads to the listener, e.g. `next dev` or `nest start --watch`. */
function ownTop(pid) {
  let top = null;
  for (let cur = info(pid), depth = 0; cur && depth < 6; cur = info(cur.ppid), depth++) {
    if (!norm(cur.command).includes(root)) break;
    top = cur;
  }
  return top;
}

function kill(pid) {
  if (win) run('taskkill', ['/PID', String(pid), '/T', '/F']);
  else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

const waitFree = async () => {
  for (let i = 0; i < 25; i++) {
    if (listeners().length === 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

const pids = listeners();
if (pids.length === 0) process.exit(0);

for (const pid of pids) {
  const top = ownTop(pid);
  if (!top) {
    const p = info(pid);
    console.error(`\nPort ${port} is already used by another program (PID ${pid}):\n  ${p?.command || 'unknown'}\n`);
    console.error(win ? `Stop it first, e.g. taskkill /PID ${pid} /F\n` : `Stop it first, e.g. kill ${pid}\n`);
    process.exit(1);
  }
  console.log(`Port ${port}: stopping a previous dev server of this project (PID ${top.pid})`);
  kill(top.pid);
  if (!win && top.pid !== pid) kill(pid);
}

if (!(await waitFree())) {
  console.error(`Port ${port} is still busy after stopping the old server. Try again in a moment.`);
  process.exit(1);
}
