import { GET, GET_BY_SLUG } from './events_route';
import { resetEventRegistrationTicketStore } from './event_registration_ticket_store';

describe('events routes', () => {
  beforeEach(() => {
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
});
