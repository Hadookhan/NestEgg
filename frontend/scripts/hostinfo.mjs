// Works out which of this machine's addresses a phone can actually reach.
// Used by the dev server (for the QR code) and by `npm run doctor`.
import os from 'node:os';
import fs from 'node:fs';

export function inWsl() {
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

/** True if WSL is in mirrored mode (shares Windows' real addresses). */
export function wslMirrored() {
  try {
    for (const user of fs.readdirSync('/mnt/c/Users')) {
      const p = `/mnt/c/Users/${user}/.wslconfig`;
      if (!fs.existsSync(p)) continue;
      const m = fs.readFileSync(p, 'utf8').match(/^\s*networkingMode\s*=\s*(\w+)/im);
      if (m) return m[1].toLowerCase() === 'mirrored';
    }
  } catch { /* not readable */ }
  return false;
}

function describe(name, ip, wslNat) {
  const [a, b, c] = ip.split('.').map(Number);
  const n = name.toLowerCase();
  if (wslNat) return { kind: 'WSL internal address (phones can\'t reach it)', usable: false };
  if (ip === '10.255.255.254') return { kind: 'WSL DNS address (not the one)', usable: false };
  if (/(vethernet|wsl|docker|virtualbox|vmware|vbox|hyper-v|utun|tailscale|zerotier|vpn|bridge)/.test(n)) {
    return { kind: 'virtual or VPN adapter (not the one)', usable: false };
  }
  if (a === 172 && b === 20 && c === 10) return { kind: 'iPhone hotspot', usable: true, rank: 0 };
  if (a === 192 && b === 168 && c === 43) return { kind: 'Android hotspot', usable: true, rank: 0 };
  if (a === 192 && b === 168 && c === 56) return { kind: 'VirtualBox (not the one)', usable: false };
  if (/(wi-?fi|wlan|wireless|wlp)/.test(n) || n === 'en0') return { kind: 'Wi-Fi', usable: true, rank: 1 };
  if (a === 192 && b === 168) return { kind: 'Wi-Fi or hotspot', usable: true, rank: 1 };
  if (a === 10) return { kind: 'network', usable: true, rank: 2 };
  if (a === 172 && b >= 16 && b <= 31) return { kind: 'often a virtual adapter', usable: true, rank: 3 };
  return { kind: 'network', usable: true, rank: 2 };
}

export function hostInfo() {
  const wsl = inWsl();
  const wslNat = wsl && !wslMirrored();
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({ name, ip: a.address, ...describe(name, a.address, wslNat) });
    }
  }
  candidates.sort((x, y) => (y.usable - x.usable) || ((x.rank ?? 9) - (y.rank ?? 9)));
  return { wsl, wslNat, candidates, lan_ip: candidates.find((c) => c.usable)?.ip ?? null };
}

/** Vite plugin: serves hostInfo() at /__nestegg/host for the QR code. */
export function hostInfoPlugin() {
  return {
    name: 'nestegg-host-info',
    configureServer(server) {
      server.middlewares.use('/__nestegg/host', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(hostInfo()));
      });
    },
  };
}
