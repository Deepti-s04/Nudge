import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { generateAllIcons } from './scripts/generate-icons.js';

// Automatically ensure crisp, subtle, production icons are generated for all targets
try {
  generateAllIcons();
} catch (e) {
  console.warn('Icon generation notice:', e);
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Nudge - Focus & Habit Tracker',
    description: 'A subtle distraction blocker and focus timer that gently nudges you back to productive work.',
    version: '1.0.0',
    permissions: ['storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Nudge - Focus',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
  },
});

