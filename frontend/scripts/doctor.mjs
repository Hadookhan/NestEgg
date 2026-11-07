// Connection check for using NestEgg from a phone.
// Run from the frontend folder, with `npm run dev` and the backend already running:
//   npm run doctor
import os from 'node:os';
import net from 'node:net';
import fs from 'node:fs';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { hostInfo } from './hostinfo.mjs';

const PORT = 5173;
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const info = (m) => console.log(`    ${m}`);
const problems = [];

const portOpen = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port, timeout: 1500 });
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('timeout', () => { s.destroy(); resolve(false); });
  s.on('error', () => resolve(false));
});

const getJson = (url) => new Promise((resolve) => {
  http.get(url, { timeout: 2000 }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
  }).on('error', () => resolve(null));
});

const run = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; } };

console.log('\nNestEgg connection check\n');

// 1. Addresses
console.log('1. This computer\'s network addresses');
const host = hostInfo();
const addrs = host.candidates;
if (!addrs.length) {
  bad('No network connection found. Connect to Wi-Fi or the hotspot first.');
  problems.push('Not connected to any network.');
}
for (const a of addrs) info(`${a.ip.padEnd(16)} ${a.name}  (${a.kind})`);
const likely = addrs.filter((a) => a.usable);

// 1b. WSL
if (host.wsl) {
  console.log('\n   WSL');
  if (host.wslNat) {
    bad('npm run dev is running inside WSL. WSL has its own private network (the addresses above), so phones can\'t reach it.');
    const winIps = run('ipconfig.exe').split(/\r?\n/)
      .map((l) => l.match(/IPv4[^:]*:\s*([\d.]+)/)?.[1]).filter(Boolean)
      .filter((ip) => !ip.startsWith('172.') || ip.startsWith('172.20.10.'));
    if (winIps.length) info(`Windows' own addresses (what the phone needs): ${winIps.join(', ')}`);
    const wslIp = addrs.find((a) => !a.ip.startsWith('10.255.'))?.ip || '<WSL address>';
    problems.push(
      'Make the planner reachable from outside WSL. Pick ONE:\n' +
      '     A) Easiest: run the frontend on Windows. Copy the frontend folder to e.g. C:\\nestegg\\frontend,\n' +
      '        then in PowerShell there: npm install, then npm run dev. Keep the backend running in WSL;\n' +
      '        Windows forwards localhost:8000 to it automatically.\n' +
      '     B) Windows 11: turn on WSL mirrored networking. Create C:\\Users\\<you>\\.wslconfig containing:\n' +
      '          [wsl2]\n          networkingMode=mirrored\n' +
      '        then in PowerShell as administrator:\n' +
      '          wsl --shutdown\n' +
      "          Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow\n" +
      '        Reopen WSL and run npm run dev again: the Network line will show your real Wi-Fi/hotspot address.\n' +
      '     C) Windows 10: forward the port. In PowerShell as administrator:\n' +
      `          netsh interface portproxy add v4tov4 listenport=${PORT} listenaddress=0.0.0.0 connectport=${PORT} connectaddress=${wslIp}\n` +
      `          New-NetFirewallRule -DisplayName "NestEgg dev server" -Direction Inbound -Protocol TCP -LocalPort ${PORT} -Action Allow\n` +
      '        The WSL address changes when WSL restarts, so redo the first command each time.',
    );
  } else {
    ok('WSL is in mirrored mode, so it shares Windows\' addresses.');
  }
}

// 2. Servers
console.log('\n2. Servers on this computer');
const viteLocal = await portOpen('127.0.0.1', PORT);
viteLocal ? ok(`Planner (npm run dev) is running on port ${PORT}`) : bad(`Nothing on port ${PORT}. Start it with: npm run dev`);
if (!viteLocal) problems.push('Start the planner with npm run dev.');
const health = await getJson('http://127.0.0.1:8000/api/health');
health ? ok('Backend is running on port 8000') : bad('Backend not running. Start it with: uvicorn main:app --reload --host 0.0.0.0 --port 8000');
if (!health) problems.push('Start the backend.');

if (viteLocal) {
  for (const a of likely) {
    (await portOpen(a.ip, PORT))
      ? ok(`Planner answers on ${a.ip}:${PORT}`)
      : (bad(`Planner does not answer on ${a.ip}:${PORT}. Check vite.config.js has host: true, then restart npm run dev.`),
        problems.push(`Planner not listening on ${a.ip}.`));
  }
}

// 3. Stale address in .env
console.log('\n3. Saved address');
let envUrl = '';
try {
  const m = fs.readFileSync('.env', 'utf8').match(/^\s*VITE_PUBLIC_URL\s*=\s*(\S*)/m);
  envUrl = m ? m[1] : '';
} catch { /* no .env */ }
if (!envUrl) {
  ok('VITE_PUBLIC_URL is blank, so the QR code uses the address you pick on the setup screen');
} else {
  let host = '';
  try { host = new URL(envUrl).hostname; } catch { /* invalid */ }
  if (envUrl.startsWith('https://')) ok(`VITE_PUBLIC_URL is a tunnel (${envUrl})`);
  else if (addrs.some((a) => a.ip === host)) ok(`VITE_PUBLIC_URL matches this computer (${envUrl})`);
  else {
    bad(`VITE_PUBLIC_URL is ${envUrl}, but this computer no longer has that address (it changes when you switch Wi-Fi or hotspot).`);
    problems.push('Clear VITE_PUBLIC_URL in frontend/.env (leave it blank), then restart npm run dev.');
  }
}

// 4. Firewall
console.log('\n4. Firewall');
const PS = process.platform === 'win32' ? 'powershell' : 'powershell.exe';
if (process.platform === 'win32' || host.wsl) {
  if (host.wsl) info('Checking the Windows firewall from WSL...');
  const profiles = run(PS + ' -NoProfile -Command "Get-NetConnectionProfile | ForEach-Object { $_.InterfaceAlias + \'|\' + $_.NetworkCategory }"')
    .trim().split(/\r?\n/).filter(Boolean);
  for (const line of profiles) {
    const [alias, cat] = line.split('|');
    if (cat === 'Public') {
      bad(`"${alias}" is set to Public, which blocks phones from connecting.`);
      problems.push(`Set "${alias}" to Private: Settings > Network & internet > (your connection) > Network profile type > Private.`);
    } else ok(`"${alias}" is ${cat}`);
  }
  const blocks = run(PS + ' -NoProfile -Command "Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True | Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -like \'*node*\' } | Select-Object -ExpandProperty DisplayName"')
    .trim();
  if (blocks) {
    bad('Windows has a rule BLOCKING Node.js. This happens if "Cancel" was clicked on the firewall pop-up, and it overrides any allow rule.');
    info(blocks.split(/\r?\n/).join(', '));
    problems.push('Remove the Node.js block rule. In PowerShell as administrator: Get-NetFirewallRule -Direction Inbound -Action Block | Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -like \'*node*\' } | Remove-NetFirewallRule');
  } else ok('No firewall rule is blocking Node.js');
  const allow = run(`${PS} -NoProfile -Command "Get-NetFirewallPortFilter -Protocol TCP | Where-Object { $_.LocalPort -eq '${PORT}' } | Get-NetFirewallRule | Where-Object { $_.Action -eq 'Allow' -and $_.Enabled -eq 'True' } | Select-Object -ExpandProperty DisplayName"`).trim();
  if (allow) ok(`Port ${PORT} is allowed (${allow.split(/\r?\n/)[0]})`);
  else {
    bad(`No rule allowing port ${PORT}.`);
    problems.push(`Allow the port. In PowerShell as administrator: New-NetFirewallRule -DisplayName "NestEgg dev server" -Direction Inbound -Protocol TCP -LocalPort ${PORT} -Action Allow -Profile Private,Public`);
  }
  info('If you have antivirus with its own firewall (Norton, McAfee, Avast, Bitdefender...), allow Node.js there too.');
} else if (process.platform === 'darwin') {
  const fw = '/usr/libexec/ApplicationFirewall/socketfilterfw';
  const state = run(`${fw} --getglobalstate`);
  const blockAll = run(`${fw} --getblockall`);
  if (/enabled/i.test(state)) {
    info('macOS firewall is on.');
    if (/enabled|on/i.test(blockAll) && !/disabled|off/i.test(blockAll)) {
      bad('"Block all incoming connections" is on.');
      problems.push('Turn off "Block all incoming connections": System Settings > Network > Firewall > Options.');
    } else {
      info('Make sure "node" is set to "Allow incoming connections": System Settings > Network > Firewall > Options.');
    }
  } else ok('macOS firewall is off');
} else {
  info('Linux: if you use ufw, run: sudo ufw allow 5173/tcp');
}

// Summary
console.log('\nResult');
if (problems.length) {
  console.log('  Fix these, then run npm run doctor again:');
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
} else {
  console.log('  Everything on this computer looks right.');
}
const best = likely[0];
if (best && !host.wslNat) {
  console.log(`\n  Now type this into the PHONE's browser: http://${best.ip}:${PORT}`);
  console.log('  If it still won\'t load but everything above passed, the network is blocking it:');
  console.log('  turn off any VPN app on the phone, or use the cloudflared tunnel (README).');
}
console.log('');
