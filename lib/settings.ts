const STORAGE_KEY = 'applyFlowSettings';

export interface ApplyFlowSettings {
  enabled: boolean;
  sidePanelEnabled: boolean;
  sidePanelAllSites: boolean;
}

export const DEFAULT_APPLY_FLOW_SETTINGS: ApplyFlowSettings = {
  enabled: true,
  sidePanelEnabled: true,
  sidePanelAllSites: false,
};

export async function getApplyFlowSettings(): Promise<ApplyFlowSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<ApplyFlowSettings> | undefined;
  return {
    enabled: typeof value?.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_APPLY_FLOW_SETTINGS.enabled,
    sidePanelEnabled: typeof value?.sidePanelEnabled === 'boolean'
      ? value.sidePanelEnabled
      : DEFAULT_APPLY_FLOW_SETTINGS.sidePanelEnabled,
    sidePanelAllSites: typeof value?.sidePanelAllSites === 'boolean'
      ? value.sidePanelAllSites
      : DEFAULT_APPLY_FLOW_SETTINGS.sidePanelAllSites,
  };
}

export function isSidePanelAllowed(
  settings: ApplyFlowSettings,
  tabUrl?: string,
): boolean {
  if (!settings.enabled || !settings.sidePanelEnabled) return false;
  if (settings.sidePanelAllSites) return true;
  if (!tabUrl) return false;

  try {
    const hostname = new URL(tabUrl).hostname.toLocaleLowerCase();
    return hostname === 'chatgpt.com' ||
      hostname.endsWith('.chatgpt.com') ||
      hostname === 'linkedin.com' ||
      hostname.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

export async function saveApplyFlowSettings(settings: ApplyFlowSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

export const APPLY_FLOW_SETTINGS_STORAGE_KEY = STORAGE_KEY;
