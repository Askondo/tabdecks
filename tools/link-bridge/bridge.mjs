#!/usr/bin/env node
// TabDecks ↔ Ableton Link native-messaging host.
//
// Chrome launches this with stdio wired to the extension. It spawns Carabiner
// (embeds the official Link SDK), holds a TCP connection to it on 127.0.0.1,
// polls status, and relays to/from the extension as length-prefixed JSON.
//
// Extension → host:  { type: 'enable' } | { type: 'disable' }
//                    | { type: 'setTempo', bpm } | { type: 'ping' }
// Host → extension:  { type: 'status', bpm, beat, peers, playing, hostTime }
//                    | { type: 'bridge', state: 'connecting'|'connected'|'error', message? }
//
// Stdout is the native-messaging channel — NEVER console.log there. Diagnostics
// go to stderr (visible in the host's console when launched manually).

import net from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Backoff,
  NativeMessageReader,
  encodeNativeMessage,
  parseCarabinerLine,
  splitLines,
} from './protocol.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARABINER_PORT = 17000;
const STATUS_POLL_MS = 50; // 20 Hz — matches the transport status cadence
const log = (...a) => process.stderr.write(`[link-bridge] ${a.join(' ')}\n`);

function send(obj) {
  process.stdout.write(encodeNativeMessage(obj));
}

// ── Carabiner process ───────────────────────────────────────────────────────

function carabinerPath() {
  const exe = process.platform === 'win32' ? 'Carabiner.exe' : 'Carabiner';
  for (const p of [join(HERE, 'bin', exe), join(HERE, exe)]) {
    if (existsSync(p)) return p;
  }
  return null;
}

let carabinerProc = null;

function ensureCarabiner() {
  if (carabinerProc) return;
  const path = carabinerPath();
  if (!path) {
    send({ type: 'bridge', state: 'error', message: 'Carabiner binary missing — run npm run link:install' });
    log('Carabiner binary not found; cannot start Link session');
    return;
  }
  carabinerProc = spawn(path, ['--port', String(CARABINER_PORT)], { stdio: 'ignore' });
  carabinerProc.on('exit', (code) => {
    log(`Carabiner exited (${code})`);
    carabinerProc = null;
  });
  carabinerProc.on('error', (e) => {
    log(`Carabiner spawn error: ${e.message}`);
    carabinerProc = null;
  });
}

// ── TCP link to Carabiner ────────────────────────────────────────────────────

let sock = null;
let connected = false;
let tcpBuf = '';
const backoff = new Backoff(250, 5000);
let pollTimer = null;

function connect() {
  ensureCarabiner();
  send({ type: 'bridge', state: 'connecting' });
  sock = net.connect(CARABINER_PORT, '127.0.0.1');

  sock.on('connect', () => {
    connected = true;
    backoff.reset();
    send({ type: 'bridge', state: 'connected' });
    log('connected to Carabiner');
    pollTimer = setInterval(() => connected && sock.write('status\n'), STATUS_POLL_MS);
  });

  sock.on('data', (chunk) => {
    tcpBuf += chunk.toString('utf8');
    const { lines, rest } = splitLines(tcpBuf);
    tcpBuf = rest;
    for (const line of lines) {
      const parsed = parseCarabinerLine(line);
      if (parsed?.type === 'status') {
        const d = parsed.data;
        send({
          type: 'status',
          bpm: d.bpm ?? 0,
          beat: d.beat ?? 0,
          peers: d.peers ?? 0,
          playing: d.playing ?? false,
          hostTime: d.start ?? 0,
        });
      }
    }
  });

  const drop = (why) => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    connected = false;
    sock?.destroy();
    sock = null;
    const delay = backoff.next();
    send({ type: 'bridge', state: 'error', message: `${why}; retrying in ${delay}ms` });
    setTimeout(connect, delay);
  };

  sock.on('error', (e) => drop(e.message));
  sock.on('close', () => connected && drop('connection closed'));
}

// ── Extension → host commands ─────────────────────────────────────────────────

const reader = new NativeMessageReader();
process.stdin.on('data', (chunk) => {
  for (const msg of reader.push(chunk)) handle(msg);
});
// Chrome closes stdin when the port disconnects → exit cleanly.
process.stdin.on('end', () => {
  carabinerProc?.kill();
  process.exit(0);
});

function handle(msg) {
  switch (msg.type) {
    case 'enable':
      if (!sock) connect();
      break;
    case 'disable':
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      connected = false;
      sock?.destroy();
      sock = null;
      carabinerProc?.kill();
      carabinerProc = null;
      send({ type: 'bridge', state: 'disabled' });
      break;
    case 'setTempo':
      if (connected && typeof msg.bpm === 'number') sock.write(`bpm ${msg.bpm.toFixed(6)}\n`);
      break;
    case 'ping':
      send({ type: 'pong' });
      break;
    default:
      log(`unknown command: ${msg.type}`);
  }
}

log('host started');
