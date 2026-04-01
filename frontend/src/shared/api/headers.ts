export function buildApiHeaders(args?: {
  sessionId?: string | null;
  idempotencyKey?: string | null;
  contentType?: 'application/json';
}) {
  const headers = new Headers();

  if (args?.contentType) {
    headers.set('content-type', args.contentType);
  }
  if (args?.sessionId) {
    headers.set('x-session-id', args.sessionId);
  }
  if (args?.idempotencyKey) {
    headers.set('Idempotency-Key', args.idempotencyKey);
  }

  return headers;
}
