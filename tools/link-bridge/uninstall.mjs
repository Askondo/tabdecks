#!/usr/bin/env node
// Removes the TabDecks Ableton Link native-messaging host registration.
//   node tools/link-bridge/uninstall.mjs
// Leaves the downloaded Carabiner binary in tools/link-bridge/bin/ (delete by
// hand if you want it gone).

import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST_NAME = 'com.tabdecks.link';

if (process.platform === 'win32') {
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  const r = spawnSync('reg', ['delete', key, '/f'], { stdio: 'inherit' });
  console.log(r.status === 0 ? `Removed ${key}` : 'Registry key was already absent.');
} else {
  const dir =
    process.platform === 'darwin'
      ? `${process.env.HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts`
      : `${process.env.HOME}/.config/google-chrome/NativeMessagingHosts`;
  const f = join(dir, `${HOST_NAME}.json`);
  if (existsSync(f)) {
    rmSync(f);
    console.log(`Removed ${f}`);
  } else {
    console.log('Host manifest was already absent.');
  }
}
console.log('✓ Link bridge unregistered.');
