// BUNNYFALL status panel: the pure half. Gathers a snapshot (relay + host) and draws it as one Discord embed.
import os from 'node:os';
import { readFileSync } from 'node:fs';

export const GREEN = 0x57c26b;
export const RED = 0xd9534f;
export const NAMES_MAX = 20;

/** The newest day heading of CHANGELOG.md ("2026-11-18"), or ''. @param {string} file */
export function changelogDay(file) {
  try { return /^## (\d{4}-\d{2}-\d{2})/m.exec(readFileSync(file, 'utf8'))?.[1] ?? ''; } catch { return ''; }
}

/** Busy and total ticks of every core, for a CPU % between two samples. */
const cpuTimes = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
let lastCpu = cpuTimes();
/** Host CPU use since the last call, 0-100. (In Docker this is the HOST's: /proc/stat is not namespaced.) */
export function cpuPercent() {
  const now = cpuTimes();
  const dt = now.total - lastCpu.total, di = now.idle - lastCpu.idle;
  lastCpu = now;
  return dt > 0 ? Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100))) : 0;
}

/** Host memory: used and total bytes. In Docker os.totalmem/freemem read /proc/meminfo, i.e. the HOST's, not a
 *  container limit - that is what we want for "how is the box". MemAvailable is used when readable (cache is not "used"). */
export function memory() {
  const total = os.totalmem();
  let free = os.freemem();
  try { const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8')); if (m) free = Number(m[1]) * 1024; } catch { /* not Linux */ }
  return { used: Math.max(0, total - free), total };
}

/** Ask the relay's /status. Never throws: { up: false } when it cannot be reached. @param {string} base @param {typeof fetch} [fetchFn] */
export async function probeRelay(base, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${base.replace(/\/$/, '')}/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { up: false };
    const j = await res.json();
    return { up: true, n: Number(j.n) || 0, names: Array.isArray(j.names) ? j.names.map(String) : [], version: String(j.version ?? '') };
  } catch { return { up: false }; }
}

const gb = (b) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const bar = (pct) => { const f = Math.round(pct / 10); return '▰'.repeat(f) + '▱'.repeat(10 - f); };
const span = (s) => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
/** Discord markdown out of a player's name. */
const esc = (s) => s.replace(/([\\`*_~|>#[\]()<@:])/g, '\\$1');

/**
 * The embed. @param {{ relay: any, cpu: number, mem: { used: number, total: number }, hostUptimeS: number, upSinceS: number|null, day: string, nowS: number, siteUrl?: string }} s
 */
export function buildEmbed({ relay, cpu, mem, hostUptimeS, upSinceS, day, nowS, siteUrl }) {
  const up = !!relay.up;
  const shown = up ? relay.names.slice(0, NAMES_MAX) : [];
  const players = !up ? '—' : relay.n ? `${shown.map(esc).join(', ')}${relay.n > shown.length ? ` +${relay.n - shown.length} more` : ''}` : '*the inn is quiet*';
  const memPct = mem.total ? Math.round(mem.used / mem.total * 100) : 0;
  const fields = [
    { name: 'Server', value: up ? '🟢 **Online**' : '🔴 **Offline**', inline: true },
    { name: 'Players', value: up ? `🐰 **${relay.n}** online` : '—', inline: true },
    { name: 'Up for', value: up && upSinceS ? span(nowS - upSinceS) : '—', inline: true },
    { name: "Who's here", value: players.slice(0, 1024), inline: false },
    { name: 'CPU', value: `${bar(cpu)} ${cpu}%`, inline: true },
    { name: 'RAM', value: `${bar(memPct)} ${gb(mem.used)} / ${gb(mem.total)}`, inline: true },
    { name: 'Host uptime', value: span(hostUptimeS), inline: true },
  ];
  const bits = [day && `Updated ${day}`, relay.version && `relay ${relay.version}`].filter(Boolean);
  return {
    embeds: [{
      title: 'Bunnyfall',
      ...(siteUrl ? { url: siteUrl } : {}),
      description: up ? 'The Dagger Isles are open for adventure.' : 'The server is not answering right now. It may be restarting.',
      color: up ? GREEN : RED,
      fields,
      footer: bits.length ? { text: bits.join(' · ') } : undefined,
      timestamp: new Date(nowS * 1000).toISOString(),
    }],
    allowed_mentions: { parse: [] },
  };
}
