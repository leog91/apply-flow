import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Apply Flow',
    description: 'Capture job listing details for review.',
    permissions: ['activeTab', 'scripting'],
  },
});
