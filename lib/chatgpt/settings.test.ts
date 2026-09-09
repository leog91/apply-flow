import { describe, expect, it } from 'vitest';
import { DEFAULT_CHATGPT_CAPTURE_SETTINGS } from './settings';

describe('ChatGPT capture settings', () => {
  it('enables capture by default', () => {
    expect(DEFAULT_CHATGPT_CAPTURE_SETTINGS).toEqual({ enabled: true });
  });
});
