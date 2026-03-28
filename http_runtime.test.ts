import {
  expireHttpRuntimeSessionIfNeeded,
  issueRuntimeSession,
  resetHttpRuntimeState,
  resolveHttpRuntimeContext,
  revokeHttpRuntimeSession,
  SESSION_ID_HEADER,
} from './http_runtime';

function buildRequest(sessionId: string) {
  return new Request('http://localhost/runtime-test', {
    headers: {
      [SESSION_ID_HEADER]: sessionId,
    },
  });
}

describe('http runtime execution boundary', () => {
  beforeEach(() => {
    resetHttpRuntimeState();
  });

  it('resolves the same actor deterministically from a valid session', async () => {
    const issued = await issueRuntimeSession({
      buyerRef: 'buyer-http-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-http-1',
      trustLevel: 'provisional',
    });

    const first = await resolveHttpRuntimeContext({
      request: buildRequest(issued.session.id),
      action: 'checkout_payment_intent',
    });
    const second = await resolveHttpRuntimeContext({
      request: buildRequest(issued.session.id),
      action: 'checkout_payment_intent',
    });

    expect(first.actor.id).toBe(issued.actor.id);
    expect(second.actor.id).toBe(issued.actor.id);
    expect(first.actor.id).toBe(second.actor.id);
    expect(first.session.id).toBe(second.session.id);
  });

  it('rejects a revoked session deterministically', async () => {
    const issued = await issueRuntimeSession({
      buyerRef: 'buyer-http-2',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer-http-2@example.com',
      trustLevel: 'active',
      sessionType: 'authenticated',
    });

    await revokeHttpRuntimeSession(issued.session.id);

    await expect(
      resolveHttpRuntimeContext({
        request: buildRequest(issued.session.id),
        action: 'account_profile_update',
      }),
    ).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
      status: 401,
    });
  });

  it('rejects an expired session deterministically', async () => {
    const issued = await issueRuntimeSession({
      buyerRef: 'buyer-http-3',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-http-3',
      expiresInMs: 1,
      trustLevel: 'provisional',
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await expireHttpRuntimeSessionIfNeeded(issued.session.id);

    await expect(
      resolveHttpRuntimeContext({
        request: buildRequest(issued.session.id),
        action: 'checkout_payment_confirm',
      }),
    ).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    });
  });

  it('blocks anonymous sessions from stronger actions and allows verified ones', async () => {
    const guest = await issueRuntimeSession({
      buyerRef: 'buyer-http-4',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-http-4',
      trustLevel: 'provisional',
    });

    await expect(
      resolveHttpRuntimeContext({
        request: buildRequest(guest.session.id),
        action: 'guarded_access_use',
      }),
    ).rejects.toMatchObject({
      code: 'POLICY_FORBIDDEN',
      status: 403,
    });

    const verified = await issueRuntimeSession({
      buyerRef: 'buyer-http-4',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer-http-4@example.com',
      trustLevel: 'verified',
      trustSource: 'verification',
      sessionType: 'authenticated',
    });

    const resolved = await resolveHttpRuntimeContext({
      request: buildRequest(verified.session.id),
      action: 'guarded_access_use',
    });

    expect(resolved.allowed).toBe(true);
    expect(resolved.trust.level).toBe('verified');
    expect(resolved.actor.id).toBe(guest.actor.id);
  });

  it('maps inactive actors to deterministic policy errors', async () => {
    const issued = await issueRuntimeSession({
      buyerRef: 'buyer-http-5',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer-http-5@example.com',
      trustLevel: 'active',
      sessionType: 'authenticated',
    });

    const first = await resolveHttpRuntimeContext({
      request: buildRequest(issued.session.id),
      action: 'account_profile_update',
    });

    first.actor.status = 'suspended';

    await expect(
      resolveHttpRuntimeContext({
        request: buildRequest(issued.session.id),
        action: 'account_profile_update',
      }),
    ).rejects.toMatchObject({
      code: 'POLICY_FORBIDDEN',
      status: 403,
    });
  });
});
