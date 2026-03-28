import { NextResponse } from 'next/server';

import * as paymentIntent from './payment_http_api';
import * as runtime from './http_runtime';

import { POST } from './payment_intent_route';

jest.mock('./payment_http_api', () => {
  const actual = jest.requireActual('./payment_http_api');
  return {
    ...actual,
    initiatePaymentIntent: jest.fn(),
  };
});
jest.mock('./http_runtime');

const mockInitiatePaymentIntent = paymentIntent.initiatePaymentIntent as jest.MockedFunction<
  typeof paymentIntent.initiatePaymentIntent
>;
const mockResolveHttpRuntimeContext = runtime.resolveHttpRuntimeContext as jest.MockedFunction<
  typeof runtime.resolveHttpRuntimeContext
>;
const mockRuntimeErrorResponse = runtime.runtimeErrorResponse as jest.MockedFunction<
  typeof runtime.runtimeErrorResponse
>;

const VALID_BUYER_ID = '33333333-3333-4333-8333-333333333333';
const VALID_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const VALID_IDEMPOTENCY_KEY = 'pay-intent-12345678';

function buildRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return new Request('http://localhost/api/v1/checkout/orders/payment-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/checkout/orders/payment-intent', () => {
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

  it('returns success for a valid payment initiation request', async () => {
    mockInitiatePaymentIntent.mockResolvedValue({
      success: true,
      order_id: VALID_ORDER_ID,
      buyer_id: VALID_BUYER_ID,
      event_id: '11111111-1111-4111-8111-111111111111',
      total_minor: 3000,
      status: 'pending_payment',
      payment_intent: {
        provider: 'stub',
        status: 'requires_action',
        intent_id: 'pi_123',
        provider_payment_id: 'pp_123',
        next_step: 'payment_confirm',
        expires_at: '2026-01-01T00:15:00.000Z',
        handoff: {
          kind: 'redirect_token',
          token: 'ptok_123',
          redirect_path: '/checkout/pay/pi_123',
        },
      },
    });

    const request = buildRequest(
      {
        buyerId: VALID_BUYER_ID,
        orderId: VALID_ORDER_ID,
        amount: 3000,
        currency: 'usd',
        paymentMethod: 'card',
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.order_id).toBe(VALID_ORDER_ID);
    expect(mockInitiatePaymentIntent).toHaveBeenCalledWith({
      buyerId: VALID_BUYER_ID,
      orderId: VALID_ORDER_ID,
      amount: 3000,
      currency: 'USD',
      paymentMethod: 'card',
      provider: undefined,
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
    });
  });

  it('returns 400 for a missing required order field', async () => {
    const request = buildRequest({
      amount: 3000,
      currency: 'USD',
      paymentMethod: 'card',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'orderId' }),
      ]),
    );
    expect(mockInitiatePaymentIntent).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid amount', async () => {
    const request = buildRequest(
      {
        buyerId: VALID_BUYER_ID,
        orderId: VALID_ORDER_ID,
        amount: 0,
        currency: 'USD',
        paymentMethod: 'card',
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'amount' }),
      ]),
    );
  });

  it('returns 400 for invalid currency', async () => {
    const request = buildRequest(
      {
        buyerId: VALID_BUYER_ID,
        orderId: VALID_ORDER_ID,
        amount: 3000,
        currency: 'US',
        paymentMethod: 'card',
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'x-session-id': 'sess_123',
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'currency' }),
      ]),
    );
  });

  it('requires idempotency key after validation succeeds', async () => {
    const request = buildRequest({
      orderId: VALID_ORDER_ID,
      amount: 3000,
      currency: 'USD',
      paymentMethod: 'card',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key is required for payment initiation.',
      },
    });
    expect(mockInitiatePaymentIntent).not.toHaveBeenCalled();
  });

  it('uses runtime actor context as execution truth instead of raw buyerId', async () => {
    mockInitiatePaymentIntent.mockResolvedValue({
      success: true,
      order_id: VALID_ORDER_ID,
      buyer_id: VALID_BUYER_ID,
      event_id: '11111111-1111-4111-8111-111111111111',
      total_minor: 3000,
      status: 'pending_payment',
      payment_intent: {
        provider: 'stub',
        status: 'requires_action',
        intent_id: 'pi_123',
        provider_payment_id: 'pp_123',
        next_step: 'payment_confirm',
        expires_at: '2026-01-01T00:15:00.000Z',
        handoff: {
          kind: 'redirect_token',
          token: 'ptok_123',
          redirect_path: '/checkout/pay/pi_123',
        },
      },
    });

    const request = buildRequest(
      {
        buyerId: '55555555-5555-4555-8555-555555555555',
        orderId: VALID_ORDER_ID,
        amount: 3000,
        currency: 'USD',
        paymentMethod: 'card',
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
    expect(mockInitiatePaymentIntent).not.toHaveBeenCalled();
  });

  it('returns structured session error when session is missing', async () => {
    mockResolveHttpRuntimeContext.mockRejectedValue(
      Object.assign(new Error('Session header is required.'), {
        code: 'SESSION_REQUIRED',
        status: 401,
      }),
    );

    const request = buildRequest(
      {
        orderId: VALID_ORDER_ID,
        amount: 3000,
        currency: 'USD',
        paymentMethod: 'card',
      },
      {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
      },
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('SESSION_REQUIRED');
  });
});
