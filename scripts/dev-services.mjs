// Runs before the API dev server: starts Postgres and Redis from docker-compose.yml and waits
// until they accept connections, so the API never boots against a database that is not there.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const r = spawnSync('docker', ['compose', 'up', '-d', '--wait'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

if (r.status !== 0) {
  console.error('\nPostgres/Redis did not start. Open Docker Desktop, wait until it is running, then run the command again.\n');
  process.exit(1);
}
