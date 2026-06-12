/**
 * Launch Chrome with the built extension loaded and test pages open.
 *
 *   npm run build && npm run chrome
 *
 * Reads tools/dev.local.cfg (copy from dev.local.cfg.example). The extension
 * must be built first (.output/chrome-mv3). Uses a dedicated profile so the
 * unpacked extension never touches your main Chrome profile.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolsDir, '..');

const DEFAULTS: Record<string, string> = {
  CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  PROFILE_DIR: join(repoRoot, '.output', 'chrome-profile'),
  START_PAGES: 'tone,tone',
};

function loadCfg(): Record<string, string> {
  const cfg = { ...DEFAULTS };
  const cfgPath = join(toolsDir, 'dev.local.cfg');
  if (existsSync(cfgPath)) {
    for (const line of readFileSync(cfgPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) cfg[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } else {
    console.log('tools/dev.local.cfg not found — using defaults (see dev.local.cfg.example)');
  }
  return cfg;
}

const cfg = loadCfg();
const extDir = join(repoRoot, '.output', 'chrome-mv3');

if (!existsSync(extDir)) {
  console.error(`Extension not built: ${extDir}\nRun: npm run build`);
  process.exit(1);
}
if (!existsSync(cfg.CHROME_PATH!)) {
  console.error(`Chrome not found at ${cfg.CHROME_PATH}\nSet CHROME_PATH in tools/dev.local.cfg`);
  process.exit(1);
}

let toneCount = 0;
const pages = (cfg.START_PAGES ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    if (p !== 'tone') return p;
    // Distinct frequencies per tone page so decks are distinguishable by ear.
    const freq = [440, 660, 880][toneCount++ % 3];
    return `${pathToFileURL(join(toolsDir, 'testpage', 'tone.html')).href}?f=${freq}`;
  });

const args = [
  `--user-data-dir=${cfg.PROFILE_DIR}`,
  `--load-extension=${extDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  ...pages,
];

console.log(`Launching Chrome\n  profile:   ${cfg.PROFILE_DIR}\n  extension: ${extDir}`);
spawn(cfg.CHROME_PATH!, args, { detached: true, stdio: 'ignore' }).unref();
