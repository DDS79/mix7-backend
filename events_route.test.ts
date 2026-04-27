import { GET, GET_BY_SLUG } from './events_route';
import { handleApiRequest } from './server';
import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { resetPaymentRuntimeStore } from './payment_runtime_store';
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

describe('events routes', () => {
  beforeEach(() => {
    delete process.env.ADMIN_ACTOR_IDS;
    delete process.env.ADMIN_TELEGRAM_IDS;
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
  });

  it('lists published events', async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(json.data.events)).toBe(true);
    expect(json.data.events.length).toBeGreaterThanOrEqual(2);
    expect(json.data.events[0]).toHaveProperty('slug');
  });

  it('returns event detail by slug', async () => {
    const response = await GET_BY_SLUG(
      new Request('http://render.local/events/open-studio-day'),
      'open-studio-day',
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.slug).toBe('open-studio-day');
    expect(json.data.pricing.mode).toBe('free');
  });

  it('returns 404 for unknown event slug', async () => {
    const response = await GET_BY_SLUG(
      new Request('http://render.local/events/missing'),
      'missing',
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe('EVENT_NOT_FOUND');
  });

  it('omits private, draft, and archived events from public routes', async () => {
    const admin = await issueAdminSession();

    await handleApiRequest(
      new Request('http://render.local/admin/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': admin.data.sessionId,
        },
        body: JSON.stringify({
          slug: 'private-event',
          venueId: null,
          title: 'Private Event',
          summary: 'Hidden',
          description: 'Hidden',
          status: 'published',
          startsAt: '2026-06-01T18:00:00.000Z',
          endsAt: '2026-06-01T20:00:00.000Z',
          categoryRef: null,
          characteristicRefs: [],
          visibility: 'private',
          metadata: {},
          priceMinor: 0,
          currency: 'RUB',
        }),
      }),
    );

    const draftResponse = await handleApiRequest(
      new Request('http://render.local/admin/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': admin.data.sessionId,
        },
        body: JSON.stringify({
          slug: 'draft-event',
          venueId: null,
          title: 'Draft Event',
          summary: 'Draft',
          description: 'Draft',
          status: 'draft',
          startsAt: '2026-06-02T18:00:00.000Z',
          endsAt: '2026-06-02T20:00:00.000Z',
          categoryRef: null,
          characteristicRefs: [],
          visibility: 'public',
          metadata: {},
          priceMinor: 0,
          currency: 'RUB',
        }),
      }),
    );
    const draftJson = await draftResponse.json();

    await handleApiRequest(
      new Request('http://render.local/admin/events/evt_7f1ed0d65b3d7b6b18dc1001/archive', {
        method: 'POST',
        headers: {
          'x-session-id': admin.data.sessionId,
        },
      }),
    );

    const listResponse = await GET();
    const listJson = await listResponse.json();

    expect(listJson.data.events.some((event: { slug: string }) => event.slug === 'private-event')).toBe(
      false,
    );
    expect(listJson.data.events.some((event: { slug: string }) => event.slug === 'draft-event')).toBe(
      false,
    );
    expect(listJson.data.events.some((event: { slug: string }) => event.slug === 'open-studio-day')).toBe(
      false,
    );

    const privateDetail = await GET_BY_SLUG(
      new Request('http://render.local/events/private-event'),
      'private-event',
    );
    const draftDetail = await GET_BY_SLUG(
      new Request('http://render.local/events/draft-event'),
      'draft-event',
    );
    const archivedDetail = await GET_BY_SLUG(
      new Request('http://render.local/events/open-studio-day'),
      'open-studio-day',
    );

    expect(draftJson.data.event.id).toMatch(/^evt_/);
    expect(privateDetail.status).toBe(404);
    expect(draftDetail.status).toBe(404);
    expect(archivedDetail.status).toBe(404);
  });
});
