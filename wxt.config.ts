import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => {
    const googleOAuthClientId = process.env.WXT_GOOGLE_OAUTH_CLIENT_ID?.trim();
    return {
      name: 'Apply Flow',
      description: 'Capture job listing details for review.',
      permissions: ['activeTab', 'clipboardWrite', 'identity', 'scripting', 'storage'],
      host_permissions: ['https://sheets.googleapis.com/*'],
      ...(googleOAuthClientId
        ? {
            oauth2: {
              client_id: googleOAuthClientId,
              scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            },
          }
        : {}),
    };
  },
});
