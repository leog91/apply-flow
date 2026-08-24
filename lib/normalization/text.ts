export function cleanDisplayText(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}
