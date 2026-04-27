import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { resetPaymentRuntimeStore } from './payment_runtime_store';
import { handleApiRequest } from './server';
import { resetEventRegistrationTicketStore } from './event_registration_ticket_store';

const ADMIN_TELEGRAM_ID = '700700700';

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

async function issueCustomerSession(buyerRef: string) {
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

async function issueAuthenticatedNonAdminSession() {
  const telegramId = '800800800';
  const response = await handleApiRequest(
    new Request('http://render.local/session/issue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        buyerRef: `tg:${telegramId}`,
        authType: 'external_provider',
        authStatus: 'active',
        loginRef: `tg:${telegramId}`,
        sessionType: 'authenticated',
        trustLevel: 'active',
      }),
    }),
  );

  return response.json();
}

async function createAdminEvent(sessionId: string) {
  const response = await handleApiRequest(
    new Request('http://render.local/admin/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        slug: 'admin-test-event',
        venueId: 'ven_mix7_main',
        title: 'Admin Test Event',
        summary: 'Admin-created event.',
        description: 'Admin-created event for event management tests.',
        status: 'published',
        startsAt: '2026-05-10T18:00:00.000Z',
        endsAt: '2026-05-10T20:00:00.000Z',
        categoryRef: 'ecat_music',
        characteristicRefs: ['echar_evening'],
        visibility: 'public',
        metadata: {
          source: 'test',
        },
        capacity: 3,
        priceMinor: 1900,
        currency: 'rub',
        salesOpen: true,
      }),
    }),
  );

  return {
    response,
    json: await response.json(),
  };
}

describe('admin events routes', () => {
  beforeEach(() => {
    delete process.env.ADMIN_ACTOR_IDS;
    delete process.env.ADMIN_TELEGRAM_IDS;
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
  });

  afterAll(() => {
    delete process.env.ADMIN_ACTOR_IDS;
    delete process.env.ADMIN_TELEGRAM_IDS;
  });

  it('rejects non-admin access to admin endpoints', async () => {
    const session = await issueAuthenticatedNonAdminSession();

    const response = await handleApiRequest(
      new Request('http://render.local/admin/events', {
        headers: {
          'x-session-id': session.data.sessionId,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe('ADMIN_FORBIDDEN');
  });

  it('creates, updates, closes sales, reopens sales, archives, restores, and audits events', async () => {
    const admin = await issueAdminSession();

    const created = await createAdminEvent(admin.data.sessionId);
    expect(created.response.status).toBe(201);
    expect(created.json.data.event.slug).toBe('admin-test-event');
    expect(created.json.data.event.currency).toBe('RUB');
    expect(created.json.data.event.capacity).toBe(3);

    const eventId = created.json.data.event.id;

    const updatedResponse = await handleApiRequest(
      new Request(`http://render.local/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-session-id': admin.data.sessionId,
        },
        body: JSON.stringify({
          title: 'Admin Test Event Updated',
          capacity: 1,
          priceMinor: 2100,
        }),
      }),
    );
    const updatedJson = await updatedResponse.json();

    expect(updatedResponse.status).toBe(200);
    expect(updatedJson.data.event.title).toBe('Admin Test Event Updated');
    expect(updatedJson.data.event.capacity).toBe(1);
    expect(updatedJson.data.event.priceMinor).toBe(2100);

    const closedResponse = await handleApiRequest(
      new Request(`http://render.local/admin/events/${eventId}/close-sales`, {
        method: 'POST',
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const closedJson = await closedResponse.json();

    expect(closedResponse.status).toBe(200);
    expect(closedJson.data.event.salesOpen).toBe(false);

    const blockedCustomer = await issueCustomerSession('22222222-2222-4222-8222-222222222222');
    const blockedRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': blockedCustomer.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'admin-test-event',
        }),
      }),
    );
    const blockedRegistrationJson = await blockedRegistration.json();

    expect(blockedRegistration.status).toBe(409);
    expect(blockedRegistrationJson.error.code).toBe('EVENT_SALES_CLOSED');

    const reopenedResponse = await handleApiRequest(
      new Request(`http://render.local/admin/events/${eventId}/open-sales`, {
        method: 'POST',
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const reopenedJson = await reopenedResponse.json();

    expect(reopenedResponse.status).toBe(200);
    expect(reopenedJson.data.event.salesOpen).toBe(true);

    const allowedRegistration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': blockedCustomer.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'admin-test-event',
        }),
      }),
    );
    const allowedRegistrationJson = await allowedRegistration.json();

    expect(allowedRegistration.status).toBe(201);
    expect(allowedRegistrationJson.data.nextAction).toBe('checkout');

    const archiveResponse = await handleApiRequest(
      new Request(`http://render.local/admin/events/${eventId}/archive`, {
        method: 'POST',
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const archiveJson = await archiveResponse.json();

    expect(archiveResponse.status).toBe(200);
    expect(archiveJson.data.event.archivedAt).toEqual(expect.any(String));

    const unarchiveResponse = await handleApiRequest(
      new Request(`http://render.local/admin/events/${eventId}/unarchive`, {
        method: 'POST',
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const unarchiveJson = await unarchiveResponse.json();

    expect(unarchiveResponse.status).toBe(200);
    expect(unarchiveJson.data.event.archivedAt).toBeNull();

    const adminListResponse = await handleApiRequest(
      new Request('http://render.local/admin/events', {
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const adminListJson = await adminListResponse.json();
    const archivedEvent = adminListJson.data.events.find(
      (event: { id: string }) => event.id === eventId,
    );

    expect(adminListResponse.status).toBe(200);
    expect(archivedEvent).toBeDefined();
    expect(archivedEvent.archivedAt).toBeNull();

    const publicListResponse = await handleApiRequest(
      new Request('http://render.local/events'),
    );
    const publicListJson = await publicListResponse.json();

    expect(
      publicListJson.data.events.some((event: { id: string }) => event.id === eventId),
    ).toBe(true);

    const publicDetailResponse = await handleApiRequest(
      new Request('http://render.local/events/admin-test-event'),
    );
    const publicDetailJson = await publicDetailResponse.json();

    expect(publicDetailResponse.status).toBe(200);
    expect(publicDetailJson.data.slug).toBe('admin-test-event');

    const auditResponse = await handleApiRequest(
      new Request(`http://render.local/admin/audit-log?eventId=${eventId}`, {
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );
    const auditJson = await auditResponse.json();

    expect(auditResponse.status).toBe(200);
    expect(
      auditJson.data.auditLog.map((entry: { action: string }) => entry.action).sort(),
    ).toEqual([
      'EVENT_ARCHIVED',
      'EVENT_CREATED',
      'EVENT_SALES_CLOSED',
      'EVENT_SALES_OPENED',
      'EVENT_UNARCHIVED',
      'EVENT_UPDATED',
    ]);
  });

  it('keeps existing owned ticket reads intact after archiving an event', async () => {
    const admin = await issueAdminSession();
    const customer = await issueCustomerSession('33333333-3333-4333-8333-333333333333');

    const registrationResponse = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': customer.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'open-studio-day',
        }),
      }),
    );
    const registrationJson = await registrationResponse.json();

    expect(registrationResponse.status).toBe(201);
    expect(registrationJson.data.ticket.ticketId).toMatch(/^tkt_/);

    const archiveResponse = await handleApiRequest(
      new Request(
        'http://render.local/admin/events/evt_7f1ed0d65b3d7b6b18dc1001/archive',
        {
          method: 'POST',
          headers: {
            'x-session-id': admin.data.sessionId,
          },
        },
      ),
    );

    expect(archiveResponse.status).toBe(200);

    const ticketResponse = await handleApiRequest(
      new Request(
        `http://render.local/tickets/${registrationJson.data.ticket.ticketId}`,
        {
          headers: {
            'x-session-id': customer.data.sessionId,
          },
        },
      ),
    );
    const ticketJson = await ticketResponse.json();

    expect(ticketResponse.status).toBe(200);
    expect(ticketJson.data.id).toBe(registrationJson.data.ticket.ticketId);
    expect(ticketJson.data.event.slug).toBe('open-studio-day');
  });
});
