import { describe, expect, it } from 'vitest';
import { parseChatGptMessage } from '@/lib/chatgpt/parser';
import { EMPTY_JOB_INBOX_STATE } from './types';
import { mergeJobInboxState, mergeParsedMessages, reconcileJobInboxState } from './state';

async function parsedMessage(messageId = 'message-1') {
  return parseChatGptMessage(
    {
      conversationUrl: 'https://chatgpt.com/c/conversation-1',
      conversationId: 'conversation-1',
      messageId,
      timestampCandidates: [],
      blocks: [{
        text: 'Platform Engineer at Synthetic Labs — Amsterdam — Apply',
        links: [{ text: 'Apply', url: 'https://jobs.synthetic.test/roles/42' }],
      }],
    },
    '2026-09-03T09:00:00.000Z',
  );
}

describe('job inbox local state', () => {
  it('does not duplicate jobs or messages when the same DOM is parsed repeatedly', async () => {
    const parsed = await parsedMessage();
    const once = mergeJobInboxState(
      EMPTY_JOB_INBOX_STATE,
      parsed.jobs,
      parsed.message,
    );
    const twice = mergeJobInboxState(once, parsed.jobs, parsed.message);

    expect(twice.jobs).toHaveLength(1);
    expect(twice.messages).toHaveLength(1);
    expect(twice.messages[0]?.jobIds).toHaveLength(1);
  });

  it('deduplicates one job found in different messages', async () => {
    const first = await parsedMessage('message-1');
    const second = await parsedMessage('message-2');
    const state = mergeJobInboxState(
      mergeJobInboxState(EMPTY_JOB_INBOX_STATE, first.jobs, first.message),
      second.jobs,
      second.message,
    );

    expect(state.jobs).toHaveLength(1);
    expect(state.messages).toHaveLength(2);
  });

  it('reconciles only jobs acknowledged by a batch sync', async () => {
    const first = await parsedMessage('message-1');
    const second = await parseChatGptMessage({
      conversationUrl: 'https://chatgpt.com/c/conversation-1',
      messageId: 'message-2',
      timestampCandidates: [],
      blocks: [{
        text: 'Frontend Developer at Demo Works — Remote — Apply',
        links: [{ text: 'Apply', url: 'https://careers.demo.test/jobs/7' }],
      }],
    }, '2026-09-03T09:00:00.000Z');
    const queued = mergeJobInboxState(
      mergeJobInboxState(EMPTY_JOB_INBOX_STATE, first.jobs, first.message),
      second.jobs,
      second.message,
    );
    const firstJob = queued.jobs[0]!;
    const reconciled = reconcileJobInboxState(queued, new Map([[
      firstJob.id,
      { status: 'applied', syncedAt: '2026-09-03T10:00:00.000Z', applicationRef: 'Applications!2' },
    ]]));

    expect(reconciled.jobs[0]).toMatchObject({ status: 'applied', applicationRef: 'Applications!2' });
    expect(reconciled.jobs[1]?.syncedAt).toBeUndefined();
  });

  it('enriches a partially streamed job without changing first seen time', async () => {
    const partial = await parsedMessage();
    partial.jobs[0] = {
      ...partial.jobs[0]!,
      company: '',
      location: undefined,
      sourceMessage: {
        ...partial.jobs[0]!.sourceMessage,
        timestampPrecision: 'unknown',
      },
    };
    const complete = await parsedMessage();
    complete.jobs[0] = {
      ...complete.jobs[0]!,
      sourceMessage: {
        ...complete.jobs[0]!.sourceMessage,
        sentDate: '2026-09-01',
        timestampPrecision: 'day',
      },
      firstSeenAt: '2026-09-03T09:05:00.000Z',
    };
    const state = mergeJobInboxState(
      mergeJobInboxState(EMPTY_JOB_INBOX_STATE, partial.jobs, partial.message),
      complete.jobs,
      complete.message,
    );

    expect(state.jobs[0]).toMatchObject({
      company: 'Synthetic Labs',
      location: 'Amsterdam',
      firstSeenAt: '2026-09-03T09:00:00.000Z',
      sourceMessage: {
        sentDate: '2026-09-01',
        timestampPrecision: 'day',
      },
    });
  });

  it('does not attribute a duplicate message timestamp to the first discovery', async () => {
    const first = await parsedMessage('message-1');
    const duplicate = await parsedMessage('message-2');
    duplicate.jobs[0] = {
      ...duplicate.jobs[0]!,
      sourceMessage: {
        ...duplicate.jobs[0]!.sourceMessage,
        sentAt: '2026-09-02T08:00:00.000Z',
        timestampPrecision: 'exact',
      },
    };
    const state = mergeJobInboxState(
      mergeJobInboxState(EMPTY_JOB_INBOX_STATE, first.jobs, first.message),
      duplicate.jobs,
      duplicate.message,
    );

    expect(state.jobs[0]?.sourceMessage).toMatchObject({
      messageId: 'message-1',
      timestampPrecision: 'unknown',
    });
  });

  it('removes citation-only jobs when a rendered message is reparsed', async () => {
    const previous = await parsedMessage();
    const state = mergeJobInboxState(
      EMPTY_JOB_INBOX_STATE,
      previous.jobs,
      previous.message,
    );
    const cleaned = mergeParsedMessages(state, [{
      jobs: [],
      message: { ...previous.message, jobIds: [] },
    }]);

    expect(cleaned.jobs).toEqual([]);
    expect(cleaned.messages[0]?.jobIds).toEqual([]);
  });

  it('replaces a decorated company label after a cleaner reparse', async () => {
    const first = await parsedMessage();
    first.jobs[0] = { ...first.jobs[0]!, company: '🟢 1. Synthetic Labs' };
    const clean = await parsedMessage();
    const state = mergeJobInboxState(
      mergeJobInboxState(EMPTY_JOB_INBOX_STATE, first.jobs, first.message),
      clean.jobs,
      clean.message,
    );

    expect(state.jobs[0]?.company).toBe('Synthetic Labs');
  });
});
