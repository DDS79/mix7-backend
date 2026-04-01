import { resetHttpRuntimeState } from './http_runtime';
import { resetPaymentRuntimeStore, seedRuntimeOrder } from './payment_runtime_store';
import { handleApiRequest } from './server';

describe('HTTP web service packaging', () => {
  beforeEach(async () => {
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
  });

  it('boots as an HTTP service and serves health with CORS', async () => {
    const response = await handleApiRequest(new Request('http://render.local/health', {
      headers: {
        origin: 'https://mix7.ru',
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.status).toBe('healthy');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mix7.ru');
  });

  it('answers CORS preflight for allowed Tilda origins', async () => {
    const response = await handleApiRequest(new Request('http://render.local/session/issue', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://mix7.ru',
      },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mix7.ru');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('answers CORS preflight for the exact Vercel frontend origin', async () => {
    const response = await handleApiRequest(new Request('http://render.local/session/issue', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://mix7-frontend.vercel.app',
      },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://mix7-frontend.vercel.app',
    );
  });

  it('issues session and resolves debug context publicly', async () => {
    const sessionResponse = await handleApiRequest(new Request('http://render.local/session/issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        buyerRef: '33333333-3333-4333-8333-333333333333',
        authType: 'anonymous',
        authStatus: 'provisional',
        loginRef: 'guest-render-1',
        trustLevel: 'provisional',
      }),
    }));
    const sessionJson = await sessionResponse.json();

    const debugResponse = await handleApiRequest(new Request('http://render.local/debug/session-context', {
      headers: {
        'x-session-id': sessionJson.data.sessionId,
      },
    }));
    const debugJson = await debugResponse.json();

    expect(sessionResponse.status).toBe(201);
    expect(debugResponse.status).toBe(200);
    expect(debugJson.data.actorId).toBe(sessionJson.data.actorId);
  });

  it('exposes checkout routes and keeps actor as execution truth', async () => {
    const buyerId = '33333333-3333-4333-8333-333333333333';
    const orderId = '44444444-4444-4444-8444-444444444444';

    const sessionResponse = await handleApiRequest(new Request('http://render.local/session/issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        buyerRef: buyerId,
        authType: 'anonymous',
        authStatus: 'provisional',
        loginRef: 'guest-render-2',
        trustLevel: 'provisional',
      }),
    }));
    const sessionJson = await sessionResponse.json();

    const orderResponse = await handleApiRequest(new Request('http://render.local/checkout/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionJson.data.sessionId,
      },
      body: JSON.stringify({
        orderId,
        eventId: '11111111-1111-4111-8111-111111111111',
        totalMinor: 3000,
      }),
    }));
    const orderJson = await orderResponse.json();

    const intentResponse = await handleApiRequest(new Request('http://render.local/checkout/payment-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionJson.data.sessionId,
        'Idempotency-Key': 'pay-intent-12345678',
      },
      body: JSON.stringify({
        buyerId,
        orderId,
        amount: 3000,
        currency: 'USD',
        paymentMethod: 'card',
      }),
    }));
    const intentJson = await intentResponse.json();

    const confirmResponse = await handleApiRequest(new Request('http://render.local/checkout/payment-confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionJson.data.sessionId,
        'Idempotency-Key': 'pay-confirm-12345678',
      },
      body: JSON.stringify({
        buyerId,
        orderId,
        paymentIntentId: intentJson.data.payment_intent.intent_id,
      }),
    }));
    const confirmJson = await confirmResponse.json();

    expect(orderResponse.status).toBe(201);
    expect(orderJson.data.buyerId).toBe(buyerId);
    expect(intentResponse.status).toBe(201);
    expect(confirmResponse.status).toBe(202);
    expect(intentJson.data.buyer_id).toBe(buyerId);
    expect(confirmJson.data.buyer_id).toBe(buyerId);
  });
});
