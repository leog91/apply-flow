import { describe, expect, it } from 'vitest';
import {
  createGoogleWebAuthUrl,
  parseGoogleWebAuthResponse,
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
