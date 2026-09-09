import {
  getJobInboxState,
  mergeParsedMessages,
  reconcileJobInboxState,
  saveJobInboxState,
} from '@/lib/job-inbox/state';
import type { DiscoveredJob, ObservedSourceMessage } from '@/lib/job-inbox/types';
import {
  APPLY_FLOW_SETTINGS_STORAGE_KEY,
  getApplyFlowSettings,
  isSidePanelAllowed,
  type ApplyFlowSettings,
} from '@/lib/settings';

interface MergeMessage {
  type: 'apply-flow:merge-chatgpt-messages';
  parsedMessages: Array<{ jobs: DiscoveredJob[]; message: ObservedSourceMessage }>;
}

interface ReconcileMessage {
  type: 'apply-flow:reconcile-job-inbox';
  updates: Array<[
    string,
    Pick<DiscoveredJob, 'status' | 'syncedAt' | 'applicationRef'>,
  ]>;
}

export default defineBackground(() => {
  let mutation = Promise.resolve();

  async function configureTab(
    tab: Browser.tabs.Tab,
    settings: ApplyFlowSettings,
  ): Promise<void> {
    if (!browser.sidePanel || tab.id === undefined) return;
    const panelAllowed = isSidePanelAllowed(settings, tab.url);
    await Promise.all([
      browser.sidePanel.setOptions({
        tabId: tab.id,
        path: 'sidepanel.html',
        enabled: panelAllowed,
      }),
      browser.action.setPopup({
        tabId: tab.id,
        popup: panelAllowed ? '' : 'popup.html',
      }),
    ]);
  }

  async function configureToolbar(): Promise<void> {
    const settings = await getApplyFlowSettings();
    if (!browser.sidePanel) return;

    await Promise.all([
      browser.action.setPopup({ popup: 'popup.html' }),
      browser.sidePanel.setOptions({ path: 'sidepanel.html', enabled: false }),
      browser.sidePanel.setPanelBehavior({
        openPanelOnActionClick: settings.enabled && settings.sidePanelEnabled,
      }),
    ]);
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.map((tab) => configureTab(tab, settings)));
  }

  void configureToolbar().catch(() => undefined);

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[APPLY_FLOW_SETTINGS_STORAGE_KEY]) return;
    void configureToolbar().catch(() => undefined);
  });

  if (browser.sidePanel) {
    const configureCurrentTab = async (tabId: number) => {
      const [settings, tab] = await Promise.all([
        getApplyFlowSettings(),
        browser.tabs.get(tabId),
      ]);
      await configureTab(tab, settings);
    };

    browser.tabs.onCreated.addListener((tab) => {
      void getApplyFlowSettings()
        .then((settings) => configureTab(tab, settings))
        .catch(() => undefined);
    });
    browser.tabs.onActivated.addListener(({ tabId }) => {
      void configureCurrentTab(tabId).catch(() => undefined);
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (!changeInfo.url && !changeInfo.status) return;
      void configureCurrentTab(tabId).catch(() => undefined);
    });
  }

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null) return undefined;
    const type = (message as { type?: string }).type;
    if (type === 'apply-flow:get-job-inbox-state') {
      return mutation.catch(() => undefined).then(getJobInboxState);
    }
    if (type !== 'apply-flow:merge-chatgpt-messages' && type !== 'apply-flow:reconcile-job-inbox') {
      return undefined;
    }

    mutation = mutation.catch(() => undefined).then(async () => {
      const settings = await getApplyFlowSettings();
      if (!settings.enabled) return;
      const current = await getJobInboxState();
      const next = type === 'apply-flow:merge-chatgpt-messages'
        ? mergeParsedMessages(current, (message as MergeMessage).parsedMessages)
        : reconcileJobInboxState(current, new Map((message as ReconcileMessage).updates));
      await saveJobInboxState(next);
    });
    return mutation.then(getJobInboxState);
  });
});
