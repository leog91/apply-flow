import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPLY_FLOW_SETTINGS,
  isSidePanelAllowed,
  type ApplyFlowSettings,
} from './settings';

describe('Apply Flow settings', () => {
  it('enables the extension and side panel by default', () => {
    expect(DEFAULT_APPLY_FLOW_SETTINGS).toEqual({
      enabled: true,
      sidePanelEnabled: true,
      sidePanelAllSites: false,
    });
  });

  it('allows the side panel on LinkedIn and ChatGPT by default', () => {
    expect(isSidePanelAllowed(DEFAULT_APPLY_FLOW_SETTINGS, 'https://www.linkedin.com/jobs/view/1')).toBe(true);
    expect(isSidePanelAllowed(DEFAULT_APPLY_FLOW_SETTINGS, 'https://chatgpt.com/c/example')).toBe(true);
    expect(isSidePanelAllowed(DEFAULT_APPLY_FLOW_SETTINGS, 'https://example.com/jobs/1')).toBe(false);
  });

  it('allows all tabs only when the override is enabled', () => {
    const settings: ApplyFlowSettings = {
      ...DEFAULT_APPLY_FLOW_SETTINGS,
      sidePanelAllSites: true,
    };
    expect(isSidePanelAllowed(settings, 'https://example.com/jobs/1')).toBe(true);
    expect(isSidePanelAllowed(settings, 'chrome://extensions')).toBe(true);
  });

  it('never allows the panel while Apply Flow or the panel is disabled', () => {
    expect(isSidePanelAllowed({
      ...DEFAULT_APPLY_FLOW_SETTINGS,
      enabled: false,
    }, 'https://www.linkedin.com/jobs/view/1')).toBe(false);
    expect(isSidePanelAllowed({
      ...DEFAULT_APPLY_FLOW_SETTINGS,
      sidePanelEnabled: false,
      sidePanelAllSites: true,
    }, 'https://www.linkedin.com/jobs/view/1')).toBe(false);
  });
});
