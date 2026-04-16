import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { paymentCoreStore } from './payment_core_store';
import { resetPaymentRuntimeStore } from './payment_runtime_store';
import { handleApiRequest } from './server';
import { resetEventRegistrationTicketStore } from './event_registration_ticket_store';

async function issueSession(buyerRef: string) {
  const response = await handleApiRequest(
    new Request('http://render.local/session/issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        buyerRef,
        authType: 'anonymous',
        authStatus: 'provisional',
        loginRef: `guest-${buyerRef}`,
        trustLevel: 'provisional',
      }),
    }),
  );

  return response.json();
}

async function createRegistration(sessionId: string, eventSlug: string) {
  const response = await handleApiRequest(
    new Request('http://render.local/registrations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionId,
      },
      body: JSON.stringify({ eventSlug }),
    }),
  );

  return {
    response,
    json: await response.json(),
  };
}

async function listOwnedTickets(sessionId: string) {
  const response = await handleApiRequest(
    new Request('http://render.local/tickets', {
      headers: {
        'x-session-id': sessionId,
      },
    }),
  );

  return {
    response,
    json: await response.json(),
  };
}

describe('yookassa minimal provider integration', () => {
  const originalEnv = {
    shopId: process.env.YOOKASSA_SHOP_ID,
    secretKey: process.env.YOOKASSA_SECRET_KEY,
    returnUrl: process.env.YOOKASSA_RETURN_URL,
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
    process.env.YOOKASSA_SHOP_ID = 'shop_123';
    process.env.YOOKASSA_SECRET_KEY = 'secret_123';
    process.env.YOOKASSA_RETURN_URL = 'https://mix7-frontend.vercel.app/checkout/return';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.YOOKASSA_SHOP_ID = originalEnv.shopId;
    process.env.YOOKASSA_SECRET_KEY = originalEnv.secretKey;
    process.env.YOOKASSA_RETURN_URL = originalEnv.returnUrl;
  });

  it('creates a yookassa payment, persists provider linkage, and issues a paid ticket once on webhook success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '29db2b44-000f-5000-9000-1c07116f86d7',
        status: 'pending',
        confirmation: {
          confirmation_url: 'https://yookassa.ru/checkout/payments/v2/contract?order=123',
        },
      }),
    }) as unknown as typeof fetch;

    const buyerRef = '46464646-4646-4464-8464-464646464646';
    const session = await issueSession(buyerRef);
    const registration = await createRegistration(
      session.data.sessionId,
      'night-listening-session',
    );

    expect(registration.response.status).toBe(201);
    expect(registration.json.data.nextAction).toBe('checkout');

    const intentResponse = await handleApiRequest(
      new Request('http://render.local/checkout/payment-intent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.data.sessionId,
          'Idempotency-Key': 'yookassa-intent-12345678',
        },
        body: JSON.stringify({
          orderId: registration.json.data.checkout.orderId,
          amount: 2500,
          currency: 'RUB',
          paymentMethod: 'card',
        }),
      }),
    );
    const intentJson = await intentResponse.json();

    expect(intentResponse.status).toBe(201);
    expect(intentJson.data.payment_intent.provider).toBe('yookassa');
    expect(intentJson.data.payment_intent.confirmation_url).toBe(
      'https://yookassa.ru/checkout/payments/v2/contract?order=123',
    );
    expect(intentJson.data.payment_intent.next_step).toBe('redirect_confirmation');

    const payment = await paymentCoreStore.loadPaymentByOrder(
      registration.json.data.checkout.orderId,
      buyerRef,
    );
    expect(payment).not.toBeNull();
    expect(payment?.provider).toBe('yookassa');
    expect(payment?.providerPaymentId).toBe('29db2b44-000f-5000-9000-1c07116f86d7');
    expect(payment?.confirmationUrl).toBe(
      'https://yookassa.ru/checkout/payments/v2/contract?order=123',
    );

    const firstWebhookResponse = await handleApiRequest(
      new Request('http://render.local/webhooks/yookassa', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: {
            id: '29db2b44-000f-5000-9000-1c07116f86d7',
            status: 'succeeded',
            metadata: {
              order_id: registration.json.data.checkout.orderId,
            },
          },
        }),
      }),
    );
    const firstWebhookJson = await firstWebhookResponse.json();

    expect(firstWebhookResponse.status).toBe(200);
    expect(firstWebhookJson.data.ticketId).toMatch(/^tkt_/);
    expect(firstWebhookJson.data.replayed).toBe(false);

    const afterFirstWebhook = await listOwnedTickets(session.data.sessionId);
    expect(afterFirstWebhook.json.data.tickets).toHaveLength(1);

    const secondWebhookResponse = await handleApiRequest(
      new Request('http://render.local/webhooks/yookassa', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: {
            id: '29db2b44-000f-5000-9000-1c07116f86d7',
            status: 'succeeded',
          },
        }),
      }),
    );
    const secondWebhookJson = await secondWebhookResponse.json();

    expect(secondWebhookResponse.status).toBe(200);
    expect(secondWebhookJson.data.replayed).toBe(true);

    const afterSecondWebhook = await listOwnedTickets(session.data.sessionId);
    expect(afterSecondWebhook.json.data.tickets).toHaveLength(1);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
