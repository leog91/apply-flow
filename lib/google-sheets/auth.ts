const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SESSION_TOKEN_KEY = 'googleWebAuthTokenV2';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface StoredToken {
  token: string;
  expiresAt: number;
}

export class GoogleAuthorizationRequiredError extends Error {
  constructor() {
    super('Google Sheets needs a connection. Reconnect to continue.');
    this.name = 'GoogleAuthorizationRequiredError';
  }
}

interface BraveNavigator extends Navigator {
  brave?: {
    isBrave?: () => Promise<boolean>;
  };
}

function createState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function isBraveBrowser(): Promise<boolean> {
  try {
    return Boolean(
      await (navigator as BraveNavigator).brave?.isBrave?.(),
    );
  } catch {
    return false;
  }
}

export function createGoogleWebAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  interactive = true,
): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SHEETS_SCOPE,
    state,
    include_granted_scopes: 'true',
    ...(interactive ? {} : { prompt: 'none' }),
  }).toString();
  return url.toString();
}

export function parseGoogleWebAuthResponse(
  responseUrl: string,
  redirectUri: string,
  expectedState: string,
  now = Date.now(),
): StoredToken {
  const response = new URL(responseUrl);
  const redirect = new URL(redirectUri);
  if (
    response.origin !== redirect.origin ||
    response.pathname !== redirect.pathname
  ) {
    throw new Error('Google returned an invalid OAuth redirect.');
  }

  const values = new URLSearchParams(response.hash.slice(1));
  if (values.get('state') !== expectedState) {
    throw new Error('Google OAuth state validation failed.');
  }
  const oauthError = values.get('error_description') ?? values.get('error');
  if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`);

  const token = values.get('access_token');
  const expiresIn = Number(values.get('expires_in'));
  const scopes = values.get('scope')?.split(' ') ?? [];
  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Google did not return a valid access token.');
  }
  if (!scopes.includes(SHEETS_SCOPE)) {
    throw new Error('Google did not grant Sheets read/write access.');
  }

  return { token, expiresAt: now + expiresIn * 1_000 };
}

async function getStoredWebToken(): Promise<string | undefined> {
  const stored = await browser.storage.session.get(SESSION_TOKEN_KEY);
  const value = stored[SESSION_TOKEN_KEY] as Partial<StoredToken> | undefined;
  if (
    typeof value?.token === 'string' &&
    typeof value.expiresAt === 'number' &&
    value.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS
  ) {
    return value.token;
  }
  await browser.storage.session.remove(SESSION_TOKEN_KEY);
  return undefined;
}

async function getGoogleWebAuthToken(interactive: boolean): Promise<string> {
  const cached = await getStoredWebToken();
  if (cached) return cached;
  const clientId = import.meta.env.WXT_GOOGLE_WEB_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      'Brave support requires WXT_GOOGLE_WEB_OAUTH_CLIENT_ID. See the README setup steps.',
    );
  }
  const redirectUri = browser.identity.getRedirectURL();

  async function authorize(showWindow: boolean): Promise<StoredToken> {
    const state = createState();
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: createGoogleWebAuthUrl(clientId!, redirectUri, state, showWindow),
      interactive: showWindow,
      ...(!showWindow ? {
        abortOnLoadForNonInteractive: false,
        timeoutMsForNonInteractive: 10_000,
      } : {}),
    });
    if (!responseUrl) throw new Error('Google authorization was cancelled.');
    return parseGoogleWebAuthResponse(responseUrl, redirectUri, state);
  }

  let token: StoredToken;
  try {
    token = await authorize(false);
  } catch {
    // Google may need account selection, consent, or a fresh login. Only a
    // user-triggered request may open an interactive authorization window.
    if (!interactive) throw new GoogleAuthorizationRequiredError();
    token = await authorize(true);
  }
  await browser.storage.session.set({ [SESSION_TOKEN_KEY]: token });
  return token.token;
}

export async function getGoogleAuthToken(interactive: boolean): Promise<string> {
  if (await isBraveBrowser()) return getGoogleWebAuthToken(interactive);

  const { token } = await browser.identity.getAuthToken({ interactive });
  if (!token) throw new Error('Google authorization was not granted.');
  return token;
}

export async function invalidateGoogleAuthToken(token: string): Promise<void> {
  await browser.storage.session.remove(SESSION_TOKEN_KEY);
  try {
    await browser.identity.removeCachedAuthToken({ token });
  } catch {
    // Web-flow tokens are not present in Chrome's native identity cache.
  }
}
