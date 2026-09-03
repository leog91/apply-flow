const STORAGE_KEY = 'chatGptCaptureSettings';

export interface ChatGptCaptureSettings {
  enabled: boolean;
}

export const DEFAULT_CHATGPT_CAPTURE_SETTINGS: ChatGptCaptureSettings = {
  enabled: false,
};

export async function getChatGptCaptureSettings(): Promise<ChatGptCaptureSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<ChatGptCaptureSettings> | undefined;
  return {
    enabled: typeof value?.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_CHATGPT_CAPTURE_SETTINGS.enabled,
  };
}

export async function setChatGptCaptureEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: { enabled } });
}

export const CHATGPT_CAPTURE_SETTINGS_STORAGE_KEY = STORAGE_KEY;
