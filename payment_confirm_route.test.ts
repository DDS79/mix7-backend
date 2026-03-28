import { NextResponse } from 'next/server';

import * as paymentConfirm from './payment_http_api';
import * as runtime from './http_runtime';

import { POST } from './payment_confirm_route';

jest.mock('./payment_http_api', () => {
  const actual = jest.requireActual('./payment_http_api');
  return {
    ...actual,
    confirmPayment: jest.fn(),
  };
});
jest.mock('./http_runtime');

const mockConfirmPayment = paymentConfirm.confirmPayment as jest.MockedFunction<
  typeof paymentConfirm.confirmPayment
>;
const mockResolveHttpRuntimeContext = runtime.resolveHttpRuntimeContext as jest.MockedFunction<
  typeof runtime.resolveHttpRuntimeContext
>;
const mockRuntimeErrorResponse = runtime.runtimeErrorResponse as jest.MockedFunction<
  typeof runtime.runtimeErrorResponse
>;

const VALID_BUYER_ID = '33333333-3333-4333-8333-333333333333';
const VALID_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const VALID_IDEMPOTENCY_KEY = 'pay-confirm-12345678';
const VALID_INTENT_ID = 'pi_123456789012345678901234';

function buildRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return new Request('http://localhost/api/v1/checkout/orders/payment-confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/checkout/orders/payment-confirm', () => {
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
        action: 'checkout_payment_confirm',
        requiredSessionType: 'anonymous',
        requiredTrustLevel: 'provisional',
      },
      allowed: true,
    });
  });

  it('returns success for a valid payment confirmation request', async () => {
    mockConfirmPayment.mockResolvedValue({
      success: true,
      order_id: VALID_ORDER_ID,
      buyer_id: VALID_BUYER_ID,
      event_id: '11111111-1111-4111-8111-111111111111',
      total_minor: 3000,
      status: 'pending_payment',
      payment_confirmation: {
        provider: 'stub',
        intent_id: VALID_INTENT_ID,
        provider_payment_id: 'pp_123',
        status: 'pending_provider_confirmation',
        requested_at: '2026-01-01T00:00:00.000Z',
        next_step: 'await_provider_confirmation',
      },
    });

    const request = buildRequest(
      {
        buyerId: VALID_BUYER_ID,
        orderId: VALID_ORDER_ID,
        paymentIntentId: VALID_INTENT_ID,
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.data.status).toBe('pending_payment');
    expect(mockConfirmPayment).toHaveBeenCalledWith({
      buyerId: VALID_BUYER_ID,
      orderId: VALID_ORDER_ID,
      paymentIntentId: VALID_INTENT_ID,
      provider: undefined,
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
    });
  });

  it('rejects a missing required field', async () => {
    const request = buildRequest({
      paymentIntentId: VALID_INTENT_ID,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('INVALID_REQUEST');
    expect(mockConfirmPayment).not.toHaveBeenCalled();
  });

  it('requires idempotency key after validation succeeds', async () => {
    const request = buildRequest({
      orderId: VALID_ORDER_ID,
      paymentIntentId: VALID_INTENT_ID,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key is required for payment confirmation.',
      },
    });
  });

  it('does not pass client outcome into business logic', async () => {
    mockConfirmPayment.mockResolvedValue({
      success: true,
      order_id: VALID_ORDER_ID,
      buyer_id: VALID_BUYER_ID,
      event_id: '11111111-1111-4111-8111-111111111111',
      total_minor: 3000,
      status: 'pending_payment',
      payment_confirmation: {
        provider: 'stub',
        intent_id: VALID_INTENT_ID,
        provider_payment_id: 'pp_123',
        status: 'pending_provider_confirmation',
        requested_at: '2026-01-01T00:00:00.000Z',
        next_step: 'await_provider_confirmation',
      },
    });

    const request = buildRequest(
      {
        buyerId: VALID_BUYER_ID,
        orderId: VALID_ORDER_ID,
        paymentIntentId: VALID_INTENT_ID,
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    await POST(request);

    expect(mockConfirmPayment).toHaveBeenCalledWith({
      buyerId: VALID_BUYER_ID,
      orderId: VALID_ORDER_ID,
      paymentIntentId: VALID_INTENT_ID,
      provider: undefined,
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
    });
  });

  it('does not use raw buyerId as final execution truth', async () => {
    const request = buildRequest(
      {
        buyerId: '55555555-5555-4555-8555-555555555555',
        orderId: VALID_ORDER_ID,
        paymentIntentId: VALID_INTENT_ID,
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error.code).toBe('ACTOR_BUYER_MISMATCH');
    expect(mockConfirmPayment).not.toHaveBeenCalled();
  });
});
