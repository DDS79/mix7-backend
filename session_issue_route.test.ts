import * as runtime from './http_runtime';

import { POST } from './session_issue_route';

jest.mock('./http_runtime');

const mockIssueRuntimeSession = runtime.issueRuntimeSession as jest.MockedFunction<
  typeof runtime.issueRuntimeSession
>;

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/session/issue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /session/issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a runtime session for manual or UI testing', async () => {
    mockIssueRuntimeSession.mockResolvedValue({
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
        authType: 'anonymous',
        status: 'provisional',
        loginRef: 'guest-1',
        verifiedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      profile: {
        id: 'prof_123',
        actorId: 'act_123',
        displayName: null,
        phone: null,
        email: null,
        metadata: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      session: {
        id: 'sess_123',
        actorId: 'act_123',
        authAccountId: 'auth_123',
        sessionType: 'anonymous',
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
        level: 'provisional',
        source: 'anonymous_session',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const response = await POST(
      buildRequest({
        buyerRef: 'buyer-1',
        authType: 'anonymous',
        authStatus: 'provisional',
        loginRef: 'guest-1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.sessionId).toBe('sess_123');
    expect(json.data.actorId).toBe('act_123');
  });
});
