#!/usr/bin/env node
// Installs the TabDecks Ableton Link bridge as a Chrome native-messaging host.
//   node tools/link-bridge/install.mjs
//
// Steps (Windows-first; macOS/Linux paths noted):
//  1. Download + verify the pinned Carabiner release → tools/link-bridge/bin/.
//  2. Write the native-messaging host manifest (com.tabdecks.link).
//  3. Register it: Windows → HKCU registry key; macOS/Linux → NativeMessagingHosts dir.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, 'bin');
const HOST_NAME = 'com.tabdecks.link';
const EXTENSION_ID = 'bmlmgpadbmhobggnapgppomagnhdlmel';

// Pinned Carabiner release. Update both fields together; checksum is the
// SHA-256 of the downloaded archive (printed on mismatch so it can be re-pinned
// deliberately, never silently trusted).
const CARABINER = {
  version: 'v1.2.0',
  win: {
    url: 'https://github.com/Deep-Symmetry/carabiner/releases/download/v1.2.0/Carabiner_Win_x64.zip',
    sha256: '', // filled on first run; see verify note below
    exe: 'Carabiner.exe',
  },
};

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function installCarabiner() {
  if (process.platform !== 'win32') {
    console.log('NOTE: non-Windows — fetch the matching Carabiner build for your OS into tools/link-bridge/bin/.');
  }
  mkdirSync(BIN, { recursive: true });
  const exePath = join(BIN, CARABINER.win.exe);
  if (existsSync(exePath)) {
    console.log('Carabiner already present, skipping download.');
    return;
  }
  const zip = join(BIN, 'carabiner.zip');
  await download(CARABINER.win.url, zip);

  const digest = sha256(zip);
  if (CARABINER.win.sha256 && digest !== CARABINER.win.sha256) {
    throw new Error(`Checksum mismatch!\n  expected ${CARABINER.win.sha256}\n  got      ${digest}`);
  }
  if (!CARABINER.win.sha256) {
    console.log(`\n⚠ No pinned checksum yet. Downloaded archive SHA-256:\n  ${digest}`);
    console.log('  Verify against the release, then paste it into CARABINER.win.sha256 and re-run.\n');
  }

  // Unzip with PowerShell Expand-Archive (always present on Win10+).
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${BIN}' -Force`],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error('Expand-Archive failed');
  if (!existsSync(exePath)) {
    console.log(`NOTE: expected ${CARABINER.win.exe} in ${BIN}; the archive layout may nest it — move it up if so.`);
  }
}

function writeHostManifest() {
  // bridge.mjs is launched by node; the manifest "path" must point at an
  // executable, so we generate a tiny .cmd shim that runs node on the bridge.
  const bridge = join(HERE, 'bridge.mjs');
  const shim = join(HERE, process.platform === 'win32' ? 'run-bridge.cmd' : 'run-bridge.sh');
  if (process.platform === 'win32') {
    writeFileSync(shim, `@echo off\r\nnode "${bridge}" %*\r\n`);
  } else {
    writeFileSync(shim, `#!/usr/bin/env bash\nexec node "${bridge}" "$@"\n`, { mode: 0o755 });
  }

  const manifest = {
    name: HOST_NAME,
    description: 'TabDecks Ableton Link bridge',
    path: shim,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  };
  const manifestPath = join(HERE, `${HOST_NAME}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function register(manifestPath) {
  if (process.platform === 'win32') {
    const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
    const r = spawnSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], {
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('Registry registration failed');
    console.log(`Registered ${key}`);
  } else {
    const dir =
      process.platform === 'darwin'
        ? `${process.env.HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts`
        : `${process.env.HOME}/.config/google-chrome/NativeMessagingHosts`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${HOST_NAME}.json`), readFileSync(manifestPath));
    console.log(`Installed host manifest to ${dir}`);
  }
}

try {
  await installCarabiner();
  const manifestPath = writeHostManifest();
  register(manifestPath);
  console.log('\n✓ Ableton Link bridge installed. Reload TabDecks and enable Link in the mixer.');
} catch (e) {
  console.error(`\n✖ Install failed: ${e.message}`);
  process.exit(1);
}
