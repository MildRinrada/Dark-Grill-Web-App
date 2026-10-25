// Runs the OpenNext Cloudflare CLI with the env a Cloudflare build needs.
// Variables set here win over .env.local, which still points at localhost for `next dev`.
//   node scripts/cloudflare.mjs build | preview | deploy
import { spawnSync } from 'node:child_process';

const command = process.argv[2];
if (!['build', 'preview', 'deploy'].includes(command)) {
  console.error('usage: node scripts/cloudflare.mjs <build|preview|deploy>');
  process.exit(1);
}

const env = {
  ...process.env,
  // "/" = open Socket.IO on the page's own origin; the edge worker forwards /socket.io to the API
  NEXT_PUBLIC_SOCKET_URL: process.env.CF_SOCKET_URL ?? '/',
};

const run = (args) => {
  const r = spawnSync('npx', ['opennextjs-cloudflare', ...args], { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['build']);
if (command !== 'build') run([command]);
