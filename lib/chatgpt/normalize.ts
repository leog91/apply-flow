export function cleanChatGptCompanyLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}
