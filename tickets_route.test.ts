import { resetHttpRuntimeState } from './http_runtime';
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

async function createFreeRegistration(sessionId: string) {
  const response = await handleApiRequest(
    new Request('http://render.local/registrations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        eventSlug: 'open-studio-day',
      }),
    }),
  );

  return response.json();
}

describe('tickets route', () => {
  beforeEach(() => {
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
  });

  it('returns owned ticket detail', async () => {
    const session = await issueSession('44444444-4444-4444-8444-444444444444');
    const registration = await createFreeRegistration(session.data.sessionId);

    const response = await handleApiRequest(
      new Request(`http://render.local/tickets/${registration.data.ticket.ticketId}`, {
        headers: {
          'x-session-id': session.data.sessionId,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(registration.data.ticket.ticketId);
    expect(json.data.event.slug).toBe('open-studio-day');
    expect(json.data.accessCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(json.data.qrPayload).toMatch(/^mix7:ticket:/);
  });

  it('returns a stable access code for the same ticket', async () => {
    const session = await issueSession('77777777-7777-4777-8777-777777777777');
    const registration = await createFreeRegistration(session.data.sessionId);

    const first = await handleApiRequest(
      new Request(`http://render.local/tickets/${registration.data.ticket.ticketId}`, {
        headers: {
          'x-session-id': session.data.sessionId,
        },
      }),
    );
    const second = await handleApiRequest(
      new Request(`http://render.local/tickets/${registration.data.ticket.ticketId}`, {
        headers: {
          'x-session-id': session.data.sessionId,
        },
      }),
    );

    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstJson.data.accessCode).toBe(secondJson.data.accessCode);
  });

  it('lists owned tickets for the resolved actor', async () => {
    const first = await issueSession('88888888-8888-4888-8888-888888888888');
    const second = await issueSession('99999999-9999-4999-8999-999999999999');

    await createFreeRegistration(first.data.sessionId);
    await createFreeRegistration(second.data.sessionId);

    const response = await handleApiRequest(
      new Request('http://render.local/tickets', {
        headers: {
          'x-session-id': first.data.sessionId,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(json.data.tickets)).toBe(true);
    expect(json.data.tickets).toHaveLength(1);
    expect(json.data.tickets[0].event.slug).toBe('open-studio-day');
    expect(json.data.tickets[0].accessCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('rejects ticket access for a different actor', async () => {
    const first = await issueSession('55555555-5555-4555-8555-555555555555');
    const second = await issueSession('66666666-6666-4666-8666-666666666666');
    const registration = await createFreeRegistration(first.data.sessionId);

    const response = await handleApiRequest(
      new Request(`http://render.local/tickets/${registration.data.ticket.ticketId}`, {
        headers: {
          'x-session-id': second.data.sessionId,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.code).toBe('TICKET_FORBIDDEN');
  });
});
