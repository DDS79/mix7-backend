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

describe('paid ticket issuance boundary', () => {
  beforeEach(() => {
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
    expect(registration.json.data.ticket).toBeNull();

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
});
