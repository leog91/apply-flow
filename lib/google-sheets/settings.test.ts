import { describe, expect, it } from 'vitest';
import { extractSpreadsheetId } from './settings';

describe('extractSpreadsheetId', () => {
  it('accepts a spreadsheet ID or full Google Sheets URL', () => {
    expect(extractSpreadsheetId('spreadsheet-id_123')).toBe('spreadsheet-id_123');
    expect(
      extractSpreadsheetId(
        'https://docs.google.com/spreadsheets/d/spreadsheet-id_123/edit#gid=0',
      ),
    ).toBe('spreadsheet-id_123');
  });

  it('rejects invalid values', () => {
    expect(extractSpreadsheetId('not a valid id')).toBeUndefined();
  });
});
