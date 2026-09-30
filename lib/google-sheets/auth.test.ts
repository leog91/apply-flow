import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleWebAuthUrl,
  parseGoogleWebAuthResponse,
  getGoogleAuthToken,
  GoogleAuthorizationRequiredError,
} from './auth';

const clientId = 'synthetic-web-client.apps.googleusercontent.com';
const redirectUri = 'https://abcdefghijklmnop.chromiumapp.org/';
const scope = 'https://www.googleapis.com/auth/spreadsheets';

describe('createGoogleWebAuthUrl', () => {
  it('creates a state-bound Google Sheets authorization request', () => {
    const url = new URL(createGoogleWebAuthUrl(clientId, redirectUri, 'state-123'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe(clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('scope')).toBe(scope);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.has('prompt')).toBe(false);
  });

  it('requests no account or consent UI for silent authorization', () => {
    const url = new URL(createGoogleWebAuthUrl(clientId, redirectUri, 'state', false));
    expect(url.searchParams.get('prompt')).toBe('none');
  });
});

describe('Brave authorization', () => {
  const get = vi.fn();
  const set = vi.fn();
  const remove = vi.fn();
  const launchWebAuthFlow = vi.fn();
  const getAuthToken = vi.fn();

  function successfulResponse({ url }: { url: string }) {
    const response = new URL(redirectUri);
    response.hash = new URLSearchParams({
      access_token: 'renewed-token',
      expires_in: '3600',
      scope,
      state: new URL(url).searchParams.get('state')!,
    }).toString();
    return Promise.resolve(response.toString());
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('WXT_GOOGLE_WEB_OAUTH_CLIENT_ID', clientId);
    vi.stubGlobal('navigator', { brave: { isBrave: async () => true } });
    vi.stubGlobal('browser', {
      storage: { session: { get, set, remove } },
      identity: { launchWebAuthFlow, getRedirectURL: () => redirectUri, getAuthToken },
    });
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reuses a valid session token without starting authorization', async () => {
    get.mockResolvedValue({ googleWebAuthTokenV2: {
      token: 'cached-token', expiresAt: Date.now() + 3_600_000,
    } });
    expect(await getGoogleAuthToken(false)).toBe('cached-token');
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it('renews an expired token silently and saves the replacement', async () => {
    get.mockResolvedValue({ googleWebAuthTokenV2: {
      token: 'expired-token', expiresAt: Date.now() - 1,
    } });
    launchWebAuthFlow.mockImplementation(successfulResponse);
    expect(await getGoogleAuthToken(false)).toBe('renewed-token');
    expect(launchWebAuthFlow).toHaveBeenCalledWith(expect.objectContaining({
      interactive: false,
      abortOnLoadForNonInteractive: false,
      timeoutMsForNonInteractive: 10_000,
    }));
    expect(set).toHaveBeenCalledWith({ googleWebAuthTokenV2: {
      token: 'renewed-token', expiresAt: expect.any(Number),
    } });
  });

  it('never opens a sign-in window for an automatic lookup', async () => {
    launchWebAuthFlow.mockRejectedValue(new Error('Interaction required'));
    await expect(getGoogleAuthToken(false)).rejects.toBeInstanceOf(GoogleAuthorizationRequiredError);
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(1);
    expect(launchWebAuthFlow).toHaveBeenCalledWith(expect.objectContaining({ interactive: false }));
    expect(set).not.toHaveBeenCalled();
  });

  it('falls back to interactive authorization only for a user-triggered request', async () => {
    launchWebAuthFlow.mockImplementationOnce(({ url }) => Promise.resolve(
      `${redirectUri}#${new URLSearchParams({
        state: new URL(url).searchParams.get('state')!, error: 'interaction_required',
      })}`,
    )).mockImplementationOnce(successfulResponse);
    expect(await getGoogleAuthToken(true)).toBe('renewed-token');
    expect(launchWebAuthFlow).toHaveBeenCalledTimes(2);
    const [silent, interactive] = launchWebAuthFlow.mock.calls.map(([options]) => options);
    expect(silent.interactive).toBe(false);
    expect(interactive.interactive).toBe(true);
    expect(new URL(interactive.url).searchParams.has('prompt')).toBe(false);
    expect(new URL(interactive.url).searchParams.get('state')).not.toBe(
      new URL(silent.url).searchParams.get('state'),
    );
  });

  it('does not accept an invalid silent response', async () => {
    launchWebAuthFlow.mockResolvedValue(`${redirectUri}#state=wrong&access_token=token`);
    await expect(getGoogleAuthToken(false)).rejects.toBeInstanceOf(GoogleAuthorizationRequiredError);
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves Chrome authorization in the native identity cache', async () => {
    vi.stubGlobal('navigator', {});
    getAuthToken.mockResolvedValue({ token: 'chrome-token' });
    expect(await getGoogleAuthToken(false)).toBe('chrome-token');
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false });
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});

describe('parseGoogleWebAuthResponse', () => {
  it('validates the redirect, state, scope, and token expiry', () => {
    const response = new URL(redirectUri);
    response.hash = new URLSearchParams({
      access_token: 'synthetic-access-token',
      expires_in: '3600',
      scope,
      state: 'state-123',
    }).toString();

    expect(
      parseGoogleWebAuthResponse(
        response.toString(),
        redirectUri,
        'state-123',
        1_000,
      ),
    ).toEqual({
      token: 'synthetic-access-token',
      expiresAt: 3_601_000,
    });
  });

  it('rejects a response with a mismatched state', () => {
    expect(() =>
      parseGoogleWebAuthResponse(
        `${redirectUri}#access_token=token&expires_in=3600&scope=${encodeURIComponent(scope)}&state=wrong`,
        redirectUri,
        'expected',
      ),
    ).toThrow('state validation failed');
  });

  it('rejects a token that lacks the Sheets scope', () => {
    expect(() =>
      parseGoogleWebAuthResponse(
        `${redirectUri}#access_token=token&expires_in=3600&scope=openid&state=expected`,
        redirectUri,
        'expected',
      ),
    ).toThrow('did not grant Sheets read/write access');
  });
});
