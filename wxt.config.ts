import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'TabDecks',
    description:
      'DJ mixer for Chrome tab audio — capture two tabs as decks, mix with EQ, FX, and timeshift transport.',
    // SECURITY: keep this list minimal. Never add tabs/scripting/host_permissions —
    // activeTab + the popup click is the entire consent model.
    permissions: ['tabCapture', 'activeTab', 'storage'],
    host_permissions: [],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    action: {
      default_title: 'TabDecks — assign this tab to a deck',
    },
  },
});
