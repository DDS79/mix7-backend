import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { resetPaymentRuntimeStore } from './payment_runtime_store';
import { registrationTicketCoreStore } from './registration_ticket_core_store';
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

describe('registrations route', () => {
  beforeEach(() => {
    delete process.env.ADMIN_ACTOR_IDS;
    delete process.env.ADMIN_TELEGRAM_IDS;
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

    const persistedRegistration = await registrationTicketCoreStore.loadRegistrationByOrderId(
      json.data.checkout.orderId,
    );
    expect(persistedRegistration).not.toBeNull();
    expect(persistedRegistration?.status).toBe('requested');
    expect(persistedRegistration?.eventId).toBe(json.data.eventId);
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

  it('blocks new registrations when event capacity is exhausted', async () => {
    const admin = await issueAdminSession();

    await handleApiRequest(
      new Request('http://render.local/admin/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': admin.data.sessionId,
        },
        body: JSON.stringify({
          slug: 'limited-free-event',
          venueId: null,
          title: 'Limited Free Event',
          summary: 'One seat only',
          description: 'One seat only',
          status: 'published',
          startsAt: '2026-06-10T18:00:00.000Z',
          endsAt: '2026-06-10T20:00:00.000Z',
          categoryRef: null,
          characteristicRefs: [],
          visibility: 'public',
          metadata: {},
          capacity: 1,
          priceMinor: 0,
          currency: 'RUB',
        }),
      }),
    );

    const first = await issueSession('44444444-4444-4444-8444-444444444444');
    const second = await issueSession('55555555-5555-4555-8555-555555555555');

    const firstRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': first.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'limited-free-event',
        }),
      }),
    );
    expect(firstRegistration.status).toBe(201);

    const secondRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': second.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'limited-free-event',
        }),
      }),
    );
    const secondJson = await secondRegistration.json();

    expect(secondRegistration.status).toBe(409);
    expect(secondJson.error.code).toBe('EVENT_SOLD_OUT');
  });

  it('treats null capacity as unlimited for repeated free registrations', async () => {
    const first = await issueSession('66666666-6666-4666-8666-666666666666');
    const second = await issueSession('77777777-7777-4777-8777-777777777777');

    const firstRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': first.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'open-studio-day',
        }),
      }),
    );
    const secondRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': second.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'open-studio-day',
        }),
      }),
    );

    expect(firstRegistration.status).toBe(201);
    expect(secondRegistration.status).toBe(201);
  });
});
