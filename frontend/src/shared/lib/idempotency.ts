export function createIdempotencyKey(prefix: string) {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${randomPart}`.slice(0, 64);
}
