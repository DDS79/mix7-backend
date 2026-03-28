import * as runtime from './http_runtime';

import { GET } from './debug_session_context_route';

jest.mock('./http_runtime');

const mockResolveHttpRuntimeContext = runtime.resolveHttpRuntimeContext as jest.MockedFunction<
  typeof runtime.resolveHttpRuntimeContext
>;

describe('GET /debug/session-context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns resolved runtime session context for manual testing', async () => {
    mockResolveHttpRuntimeContext.mockResolvedValue({
      actor: {
        id: 'act_123',
        kind: 'customer',
        status: 'active',
        buyerRef: 'buyer-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      authAccount: {
        id: 'auth_123',
        actorId: 'act_123',
        authType: 'email',
        status: 'active',
        loginRef: 'user@example.com',
        verifiedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      session: {
        id: 'sess_123',
        actorId: 'act_123',
        authAccountId: 'auth_123',
        sessionType: 'authenticated',
        status: 'active',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        revokedAt: null,
        lastSeenAt: '2026-01-01T00:00:00.000Z',
        tokenId: 'tok_123',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      trust: {
        actorId: 'act_123',
        authAccountId: 'auth_123',
        level: 'active',
        source: 'registration',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      policy: {
        action: 'checkout_payment_intent',
        requiredSessionType: 'anonymous',
        requiredTrustLevel: 'anonymous',
      },
      allowed: true,
    });

    const request = new Request('http://localhost/debug/session-context', {
      method: 'GET',
      headers: {
        'x-session-id': 'sess_123',
      },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.actorId).toBe('act_123');
    expect(json.data.sessionType).toBe('authenticated');
    expect(json.data.trustLevel).toBe('active');
  });
});
