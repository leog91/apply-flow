import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readApplicationHistory } from './client';

vi.mock('./client', () => ({ readApplicationHistory: vi.fn() }));
const read = vi.mocked(readApplicationHistory);

beforeEach(() => { vi.resetModules(); read.mockReset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('history cache', () => {
  it('caches briefly, separates spreadsheets, and forces manual refreshes', async () => {
    read.mockResolvedValue([]);
    const { loadApplicationHistory } = await import('./history-cache');
    const first = await loadApplicationHistory('one');
    expect(await loadApplicationHistory('one')).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    await loadApplicationHistory('two');
    await loadApplicationHistory('one', true);
    expect(read).toHaveBeenLastCalledWith('one', true);
    expect(read).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_001);
    await loadApplicationHistory('one');
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('deduplicates automatic reads but starts a fresh read for a manual check after an in-flight read', async () => {
    let resolve!: (value: []) => void;
    read.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue([]);
    const { loadApplicationHistory } = await import('./history-cache');
    const automatic = loadApplicationHistory('one');
    expect(loadApplicationHistory('one')).toBe(automatic);
    const manual = loadApplicationHistory('one', true);
    resolve([]);
    await Promise.all([automatic, manual]);
    expect(read.mock.calls).toEqual([['one', false], ['one', true]]);
  });

  it('does not cache failed checks', async () => {
    read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const { loadApplicationHistory } = await import('./history-cache');
    await expect(loadApplicationHistory('one')).rejects.toThrow('offline');
    await loadApplicationHistory('one');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
