import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
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

describe('registrations route', () => {
  beforeEach(() => {
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
  });

  it('creates free-event registration and returns ticket_ready', async () => {
    const session = await issueSession('11111111-1111-4111-8111-111111111111');
    const response = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'open-studio-day',
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.nextAction).toBe('ticket_ready');
    expect(json.data.ticket.ticketId).toMatch(/^tkt_/);
  });

  it('creates paid-event registration and returns checkout handoff', async () => {
    const session = await issueSession('22222222-2222-4222-8222-222222222222');
    const response = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'night-listening-session',
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.nextAction).toBe('checkout');
    expect(json.data.checkout.orderId).toMatch(/^ord_/);
    expect(json.data.checkout.totalMinor).toBe(2500);
  });

  it('replays deterministic registration state for duplicate actor-event request', async () => {
    const session = await issueSession('33333333-3333-4333-8333-333333333333');
    const payload = JSON.stringify({
      eventSlug: 'night-listening-session',
    });

    const first = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.data.sessionId,
        },
        body: payload,
      }),
    );
    const second = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.data.sessionId,
        },
        body: payload,
      }),
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondJson.data.replayed).toBe(true);
    expect(secondJson.data.checkout.orderId).toBe(firstJson.data.checkout.orderId);
    expect(secondJson.data.registrationId).toBe(firstJson.data.registrationId);
  });
});
