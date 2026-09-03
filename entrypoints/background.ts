import {
  getJobInboxState,
  mergeParsedMessages,
  reconcileJobInboxState,
  saveJobInboxState,
} from '@/lib/job-inbox/state';
import type { DiscoveredJob, ObservedSourceMessage } from '@/lib/job-inbox/types';

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
      const current = await getJobInboxState();
      const next = type === 'apply-flow:merge-chatgpt-messages'
        ? mergeParsedMessages(current, (message as MergeMessage).parsedMessages)
        : reconcileJobInboxState(current, new Map((message as ReconcileMessage).updates));
      await saveJobInboxState(next);
    });
    return mutation.then(getJobInboxState);
  });
});
