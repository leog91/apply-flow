import { describe, expect, it } from 'vitest';
import { DEFAULT_CHATGPT_CAPTURE_SETTINGS } from './settings';

describe('ChatGPT capture settings', () => {
  it('defaults to opt-in capture', () => {
    expect(DEFAULT_CHATGPT_CAPTURE_SETTINGS).toEqual({ enabled: false });
  });
});
