import { mount } from 'svelte';
import App from './App.svelte';
import { AudioEngine } from '@/audio/engine';
import { registerFx } from '@/audio/fx/registry';
import { echoFx } from '@/audio/fx/echo';

// FX registration happens before mount so slot dropdowns see the full list.
registerFx(echoFx);

// The engine must finish loading the transport worklet before the UI (and the
// message handlers that trigger captures) exist. The SW ping-polls until our
// listener is registered, so capture requests simply wait for this.
const engine = new AudioEngine();
await engine.init();

mount(App, { target: document.getElementById('app')!, props: { engine } });
