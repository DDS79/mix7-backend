import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { paymentCoreStore } from './payment_core_store';
import {
  projectRuntimePaymentSuccess,
  resetPaymentRuntimeStore,
  runtimeInitiatePaymentIntent,
} from './payment_runtime_store';
import { handleApiRequest } from './server';
import { resetEventRegistrationTicketStore } from './event_registration_ticket_store';

const ADMIN_TELEGRAM_ID = '700700700';

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

async function issueAdminSession() {
  process.env.ADMIN_TELEGRAM_IDS = ADMIN_TELEGRAM_ID;

  const response = await handleApiRequest(
    new Request('http://render.local/session/issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        buyerRef: `tg:${ADMIN_TELEGRAM_ID}`,
        authType: 'external_provider',
        authStatus: 'active',
        loginRef: `tg:${ADMIN_TELEGRAM_ID}`,
        sessionType: 'authenticated',
        trustLevel: 'active',
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

describe('paid ticket issuance boundary', () => {
  beforeEach(() => {
    delete process.env.ADMIN_ACTOR_IDS;
    delete process.env.ADMIN_TELEGRAM_IDS;
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
  });

  it('keeps free-event immediate ticket issuance unchanged', async () => {
    const session = await issueSession('13131313-1313-4313-8313-131313131313');
    const registration = await createRegistration(session.data.sessionId, 'open-studio-day');

    expect(registration.response.status).toBe(201);
    expect(registration.json.data.nextAction).toBe('ticket_ready');
    expect(registration.json.data.ticket.ticketId).toMatch(/^tkt_/);
  });

  it('does not issue a paid ticket before payment success and issues it exactly once after success', async () => {
    const buyerRef = '24242424-2424-4242-8242-242424242424';
    const session = await issueSession(buyerRef);
    const registration = await createRegistration(
      session.data.sessionId,
      'night-listening-session',
    );

    expect(registration.response.status).toBe(201);
    expect(registration.json.data.nextAction).toBe('checkout');
    expect(registration.json.data.ticket).toBeUndefined();

    const beforeTickets = await listOwnedTickets(session.data.sessionId);
    expect(beforeTickets.response.status).toBe(200);
    expect(beforeTickets.json.data.tickets).toHaveLength(0);

    await runtimeInitiatePaymentIntent({
      buyerId: buyerRef,
      orderId: registration.json.data.checkout.orderId,
      amount: 2500,
      currency: 'RUB',
      paymentMethod: 'card',
      idempotencyKey: 'paid-ticket-intent-0001',
    });

    const payment = await paymentCoreStore.loadPaymentByOrder(
      registration.json.data.checkout.orderId,
      buyerRef,
    );
    expect(payment).not.toBeNull();

    const firstSuccess = await projectRuntimePaymentSuccess({
      paymentId: payment!.id,
    });
    expect(firstSuccess).not.toBeNull();
    expect(firstSuccess?.payment.status).toBe('succeeded');
    expect(firstSuccess?.order.status).toBe('paid');
    expect(firstSuccess?.registration.status).toBe('approved');
    expect(firstSuccess?.ticket.id).toMatch(/^tkt_/);
    expect(firstSuccess?.ticket.orderId).toBe(registration.json.data.checkout.orderId);
    expect(firstSuccess?.replayed).toBe(false);

    const afterFirstSuccess = await listOwnedTickets(session.data.sessionId);
    expect(afterFirstSuccess.json.data.tickets).toHaveLength(1);
    expect(afterFirstSuccess.json.data.tickets[0].id).toBe(firstSuccess?.ticket.id);

    const secondSuccess = await projectRuntimePaymentSuccess({
      paymentId: payment!.id,
    });
    expect(secondSuccess).not.toBeNull();
    expect(secondSuccess?.replayed).toBe(true);
    expect(secondSuccess?.ticket.id).toBe(firstSuccess?.ticket.id);

    const afterSecondSuccess = await listOwnedTickets(session.data.sessionId);
    expect(afterSecondSuccess.json.data.tickets).toHaveLength(1);
    expect(afterSecondSuccess.json.data.tickets[0].id).toBe(firstSuccess?.ticket.id);
  });

  it('blocks payment start for a pending order once the event becomes sold out', async () => {
    const admin = await issueAdminSession();

    const createEvent = await handleApiRequest(
      new Request('http://render.local/admin/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': admin.data.sessionId,
        },
        body: JSON.stringify({
          slug: 'limited-paid-event',
          venueId: null,
          title: 'Limited Paid Event',
          summary: 'One paid seat',
          description: 'One paid seat',
          status: 'published',
          startsAt: '2026-06-12T18:00:00.000Z',
          endsAt: '2026-06-12T20:00:00.000Z',
          categoryRef: null,
          characteristicRefs: [],
          visibility: 'public',
          metadata: {},
          capacity: 1,
          priceMinor: 2500,
          currency: 'RUB',
        }),
      }),
    );
    expect(createEvent.status).toBe(201);

    const firstBuyerRef = '34343434-3434-4343-8343-343434343434';
    const secondBuyerRef = '45454545-4545-4545-8545-454545454545';
    const firstSession = await issueSession(firstBuyerRef);
    const secondSession = await issueSession(secondBuyerRef);

    const firstRegistration = await createRegistration(
      firstSession.data.sessionId,
      'limited-paid-event',
    );
    const secondRegistration = await createRegistration(
      secondSession.data.sessionId,
      'limited-paid-event',
    );

    expect(firstRegistration.response.status).toBe(201);
    expect(secondRegistration.response.status).toBe(201);

    await runtimeInitiatePaymentIntent({
      buyerId: firstBuyerRef,
      orderId: firstRegistration.json.data.checkout.orderId,
      amount: 2500,
      currency: 'RUB',
      paymentMethod: 'card',
      idempotencyKey: 'limited-paid-event-intent-1',
    });

    const firstPayment = await paymentCoreStore.loadPaymentByOrder(
      firstRegistration.json.data.checkout.orderId,
      firstBuyerRef,
    );
    expect(firstPayment).not.toBeNull();

    await projectRuntimePaymentSuccess({
      paymentId: firstPayment!.id,
    });

    await expect(
      runtimeInitiatePaymentIntent({
        buyerId: secondBuyerRef,
        orderId: secondRegistration.json.data.checkout.orderId,
        amount: 2500,
        currency: 'RUB',
        paymentMethod: 'card',
        idempotencyKey: 'limited-paid-event-intent-2',
      }),
    ).rejects.toMatchObject({
      code: 'EVENT_SOLD_OUT',
    });
  });
});
