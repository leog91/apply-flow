import { snapshotRenderedChatGptMessages } from '@/lib/chatgpt/dom';
import { parseChatGptMessage } from '@/lib/chatgpt/parser';
import {
  CHATGPT_CAPTURE_SETTINGS_STORAGE_KEY,
  getChatGptCaptureSettings,
} from '@/lib/chatgpt/settings';

const GET_SCAN_MESSAGE = 'apply-flow:get-chatgpt-scan';
const SET_CAPTURE_MESSAGE = 'apply-flow:set-chatgpt-capture';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    let enabled = false;
    let scanPromise: Promise<void> = Promise.resolve();
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let indicator: HTMLElement | undefined;

    function showIndicator() {
      if (indicator) return;
      indicator = document.createElement('div');
      indicator.setAttribute('data-apply-flow-capture-indicator', '');
      indicator.textContent = 'Apply Flow capture on';
      Object.assign(indicator.style, {
        position: 'fixed',
        right: '14px',
        bottom: '14px',
        zIndex: '2147483647',
        border: '1px solid #9fb19b',
        borderRadius: '999px',
        padding: '6px 10px',
        color: '#27462d',
        background: '#eef3ea',
        boxShadow: '0 2px 10px rgba(0, 0, 0, .12)',
        font: '600 11px ui-sans-serif, system-ui, sans-serif',
        pointerEvents: 'none',
      });
      document.body.append(indicator);
    }

    function stopCapture() {
      enabled = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = undefined;
      observer?.disconnect();
      observer = undefined;
      indicator?.remove();
      indicator = undefined;
    }

    function scanRenderedMessages(): Promise<void> {
      if (!enabled) return Promise.resolve();
      scanPromise = scanPromise.catch(() => undefined).then(async () => {
        if (!enabled) return;
        const snapshots = snapshotRenderedChatGptMessages(document);
        const parsedMessages = [];
        for (const snapshot of snapshots) {
          try {
            const parsed = await parseChatGptMessage(snapshot);
            parsedMessages.push(parsed);
          } catch {
            // Ignore one malformed message while continuing with other rendered turns.
          }
        }
        if (parsedMessages.length > 0) {
          await browser.runtime.sendMessage({
            type: 'apply-flow:merge-chatgpt-messages',
            parsedMessages,
          });
        }
      });
      return scanPromise;
    }

    function scheduleScan() {
      if (!enabled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void scanRenderedMessages(), 350);
    }

    function startCapture() {
      if (enabled) return;
      enabled = true;
      showIndicator();
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.body, { childList: true, subtree: true });
      void scanRenderedMessages();
    }

    void getChatGptCaptureSettings().then((settings) => {
      if (settings.enabled) startCapture();
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[CHATGPT_CAPTURE_SETTINGS_STORAGE_KEY]) return;
      const next = changes[CHATGPT_CAPTURE_SETTINGS_STORAGE_KEY].newValue as
        | { enabled?: boolean }
        | undefined;
      if (next?.enabled) startCapture();
      else stopCapture();
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      const type = typeof message === 'object' && message !== null
        ? (message as { type?: string }).type
        : undefined;
      if (type === SET_CAPTURE_MESSAGE) {
        if ((message as { enabled?: boolean }).enabled) startCapture();
        else stopCapture();
        return browser.runtime.sendMessage({
          type: 'apply-flow:get-job-inbox-state',
        }).then((state) => ({ enabled, state }));
      }
      if (
        type !== GET_SCAN_MESSAGE
      ) {
        return undefined;
      }
      return scanRenderedMessages().then(async () => ({
        enabled,
        state: await browser.runtime.sendMessage({
          type: 'apply-flow:get-job-inbox-state',
        }),
      }));
    });
  },
});
