// Starts wrangler and stops its whole process tree on Linux, macOS, and Windows.
// Off Windows it spawns detached and kills the process group, since the workerd grandchild holds the port.
// Windows has no process groups, so it kills the tree with taskkill /T /F. It runs npm's npx-cli.js or wrangler's
// bin/wrangler.js under node, because a .cmd or sh shim cannot be spawned without a shell.
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { win32 } from 'node:path';

const NPX_WRANGLER = ['--yes', 'wrangler@4'];
const WRANGLER_SHIM = /node_modules[\\/]\.bin[\\/]wrangler(?:\.cmd)?$/i;

export function wranglerCommand(args, { bin = '', platform = process.platform, execPath = process.execPath } = {}) {
  if (platform !== 'win32') {
    return bin ? [bin, args] : ['npx', [...NPX_WRANGLER, ...args]];
  }
  if (!bin) {
    const npxCli = win32.join(win32.dirname(execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    return [execPath, [npxCli, ...NPX_WRANGLER, ...args]];
  }
  if (WRANGLER_SHIM.test(bin)) {
    const wranglerJs = win32.join(win32.dirname(win32.dirname(bin)), 'wrangler', 'bin', 'wrangler.js');
    return [execPath, [wranglerJs, ...args]];
  }
  return [bin, args];
}

export function devSpawnOptions(options, platform = process.platform) {
  if (platform !== 'win32') return { ...options, detached: true };
  return { ...options, detached: false, windowsHide: true };
}

export function killTree(pid, signal, { platform = process.platform, kill = (id, sig) => process.kill(id, sig), spawnSync = nodeSpawnSync } = {}) {
  if (platform !== 'win32') {
    kill(-pid, signal);
    return;
  }
  const taskkill = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  if (taskkill.status !== 0) throw new Error(`taskkill ${pid}: ${String(taskkill.stderr ?? taskkill.error)}`);
}
