import { mount } from 'svelte';
import App from './App.svelte';
import { registerFx } from '@/audio/fx/registry';
import { echoFx } from '@/audio/fx/echo';

// FX registration happens before mount so slot dropdowns see the full list.
registerFx(echoFx);

mount(App, { target: document.getElementById('app')! });
