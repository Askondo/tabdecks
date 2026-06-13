import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'TabDecks',
    description:
      'DJ mixer for Chrome tab audio — capture two tabs as decks, mix with EQ, FX, and timeshift transport.',
    // Pinned key → stable extension ID (bmlmgpadbmhobggnapgppomagnhdlmel) so the
    // Ableton Link native-messaging host manifest's allowed_origins is fixed.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsdDXPrBk49U4dPqlOsQcge7azwKVXwWDZm93IKv3B6XIYJhW3R7TYLLZMyL45vUBvPFJXjaxyuVMTSPezWg1GuugXCW+z884styrVWuSIHleN253b82NBHq3UDgfJ26+vrEsFR/bqn999uNDvOPJ274DsfvkHHzKXs3XxhySWHlAWuklJVlrdwbCwJvuz4YUaQX1FGTUbrEcgqhqtF9f1ZCQ8vGB/915DutbW3Y1vrE4ghT//ZZBhoh/OM03EwNpJOBd2YCGLkRvgzKLaE9YQ+CCl1w7/JYUSiJAp6j1TDWHNI/eKw5+9Mxfb4a5fXVON7UvCW11JlbNamcOi8QzRQIDAQAB',
    // SECURITY: minimal by design. tabCapture+activeTab is the capture consent
    // model; storage for settings; nativeMessaging ONLY to reach the local
    // Ableton Link bridge (Carabiner) — Link is UDP multicast, impossible in-page.
    permissions: ['tabCapture', 'activeTab', 'storage', 'nativeMessaging'],
    host_permissions: [],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    action: {
      default_title: 'TabDecks — assign this tab to a deck',
    },
  },
});
