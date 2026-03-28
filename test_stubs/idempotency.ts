import crypto from 'node:crypto';

export function hashRequest(value: unknown) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}
