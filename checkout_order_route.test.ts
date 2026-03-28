import { NextResponse } from 'next/server';

import * as runtime from './http_runtime';

import { POST } from './checkout_order_route';

jest.mock('./http_runtime');

const mockResolveHttpRuntimeContext = runtime.resolveHttpRuntimeContext as jest.MockedFunction<
  typeof runtime.resolveHttpRuntimeContext
>;
const mockRuntimeErrorResponse = runtime.runtimeErrorResponse as jest.MockedFunction<
  typeof runtime.runtimeErrorResponse
>;

const VALID_BUYER_ID = '33333333-3333-4333-8333-333333333333';
const VALID_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const VALID_EVENT_ID = '11111111-1111-4111-8111-111111111111';

function buildRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return new Request('http://localhost/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /checkout/orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntimeErrorResponse.mockImplementation((error) =>
      NextResponse.json(
        {
          error: {
            code:
              error &&
              typeof error === 'object' &&
              'code' in error &&
              typeof error.code === 'string'
                ? error.code
                : 'SESSION_INVALID',
            message:
              error instanceof Error
                ? error.message
                : 'Runtime session validation failed.',
          },
        },
        {
          status:
            error &&
            typeof error === 'object' &&
            'status' in error &&
            typeof error.status === 'number'
              ? error.status
              : 401,
        },
      ),
    );
    mockResolveHttpRuntimeContext.mockResolvedValue({
      actor: {
        id: 'act_123',
        kind: 'customer',
        status: 'active',
        buyerRef: VALID_BUYER_ID,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      authAccount: null,
      session: {
        id: 'sess_123',
        actorId: 'act_123',
        authAccountId: null,
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
        authAccountId: null,
        level: 'provisional',
        source: 'anonymous_session',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      policy: {
        action: 'checkout_payment_intent',
        requiredSessionType: 'anonymous',
        requiredTrustLevel: 'anonymous',
      },
      allowed: true,
    });
  });

  it('creates an explicit payable order source for the resolved actor', async () => {
    const response = await POST(
      buildRequest(
        {
          orderId: VALID_ORDER_ID,
          eventId: VALID_EVENT_ID,
          totalMinor: 3000,
        },
        {
          'x-session-id': 'sess_123',
        },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data).toEqual({
      orderId: VALID_ORDER_ID,
      buyerId: VALID_BUYER_ID,
      eventId: VALID_EVENT_ID,
      totalMinor: 3000,
      status: 'pending_payment',
      paymentProvider: null,
    });
  });

  it('returns structured validation errors for invalid payloads', async () => {
    const response = await POST(
      buildRequest(
        {
          eventId: VALID_EVENT_ID,
          totalMinor: 0,
        },
        {
          'x-session-id': 'sess_123',
        },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'orderId' }),
        expect.objectContaining({ field: 'totalMinor' }),
      ]),
    );
  });

  it('returns deterministic conflict if the order already exists', async () => {
    await POST(
      buildRequest(
        {
          orderId: VALID_ORDER_ID,
          eventId: VALID_EVENT_ID,
          totalMinor: 3000,
        },
        {
          'x-session-id': 'sess_123',
        },
      ),
    );

    const response = await POST(
      buildRequest(
        {
          orderId: VALID_ORDER_ID,
          eventId: VALID_EVENT_ID,
          totalMinor: 3000,
        },
        {
          'x-session-id': 'sess_123',
        },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe('ORDER_ALREADY_EXISTS');
  });
});
