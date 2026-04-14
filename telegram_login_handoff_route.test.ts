import {
  resetHttpRuntimeIdentityForTests,
  resetHttpRuntimeState,
} from './http_runtime';
import { resetEventRegistrationTicketStore } from './event_registration_ticket_store';
import { resetPaymentRuntimeStore } from './payment_runtime_store';
import { handleApiRequest } from './server';
import { resetTelegramLoginHandoffStore } from './telegram_login_handoff_store';

function postJson(url: string, body: Record<string, unknown>) {
  return handleApiRequest(
    new Request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('telegram site login handoff', () => {
  beforeEach(() => {
    resetHttpRuntimeIdentityForTests();
    resetHttpRuntimeState();
    resetPaymentRuntimeStore();
    resetEventRegistrationTicketStore();
    resetTelegramLoginHandoffStore();
  });

  it('creates, completes, exchanges, and reuses canonical actor mapping for telegram login', async () => {
    const create = await postJson('http://render.local/login/telegram/challenges', {
      returnPath: '/events/night-listening-session/register',
    });
    const createJson = await create.json();

    expect(create.status).toBe(201);
    expect(createJson.data.challengeId).toMatch(/^tlc_/);
    expect(createJson.data.status).toBe('pending');

    const complete = await postJson(
      `http://render.local/login/telegram/challenges/${createJson.data.challengeId}/complete`,
      {
        telegramId: 7000000001,
        displayName: 'Telegram Login User',
      },
    );
    const completeJson = await complete.json();

    expect(complete.status).toBe(200);
    expect(completeJson.data.status).toBe('completed');
    expect(completeJson.data.handoffToken).toMatch(/^tlt_/);
    expect(completeJson.data.returnPath).toBe('/events/night-listening-session/register');

    const exchange = await postJson('http://render.local/login/telegram/exchange', {
      token: completeJson.data.handoffToken,
    });
    const exchangeJson = await exchange.json();

    expect(exchange.status).toBe(200);
    expect(exchangeJson.data.buyerRef).toBe('tg:7000000001');
    expect(exchangeJson.data.actorId).toMatch(/^act_/);
    expect(exchangeJson.data.authAccountId).toMatch(/^auth_/);
    expect(exchangeJson.data.sessionId).toMatch(/^sess_/);
    expect(exchangeJson.data.returnPath).toBe('/events/night-listening-session/register');

    const secondCreate = await postJson('http://render.local/login/telegram/challenges', {
      returnPath: '/events/open-studio-day/register',
    });
    const secondCreateJson = await secondCreate.json();

    const secondComplete = await postJson(
      `http://render.local/login/telegram/challenges/${secondCreateJson.data.challengeId}/complete`,
      {
        telegramId: 7000000001,
        displayName: 'Telegram Login User',
      },
    );
    const secondCompleteJson = await secondComplete.json();

    const secondExchange = await postJson('http://render.local/login/telegram/exchange', {
      token: secondCompleteJson.data.handoffToken,
    });
    const secondExchangeJson = await secondExchange.json();

    expect(secondExchange.status).toBe(200);
    expect(secondExchangeJson.data.actorId).toBe(exchangeJson.data.actorId);
    expect(secondExchangeJson.data.authAccountId).toBe(exchangeJson.data.authAccountId);
  });

  it('allows registration with exchanged telegram-authenticated session and blocks token replay', async () => {
    const create = await postJson('http://render.local/login/telegram/challenges', {
      returnPath: '/events/night-listening-session/register',
    });
    const createJson = await create.json();

    const complete = await postJson(
      `http://render.local/login/telegram/challenges/${createJson.data.challengeId}/complete`,
      {
        telegramId: 7000000002,
        displayName: 'Telegram Registrant',
      },
    );
    const completeJson = await complete.json();

    const exchange = await postJson('http://render.local/login/telegram/exchange', {
      token: completeJson.data.handoffToken,
    });
    const exchangeJson = await exchange.json();

    const registration = await handleApiRequest(
      new Request('http://render.local/registrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-session-id': exchangeJson.data.sessionId,
        },
        body: JSON.stringify({
          eventSlug: 'night-listening-session',
        }),
      }),
    );
    const registrationJson = await registration.json();

    expect(registration.status).toBe(201);
    expect(registrationJson.data.nextAction).toBe('checkout');
    expect(registrationJson.data.checkout.orderId).toMatch(/^ord_/);

    const replay = await postJson('http://render.local/login/telegram/exchange', {
      token: completeJson.data.handoffToken,
    });
    const replayJson = await replay.json();

    expect(replay.status).toBe(409);
    expect(replayJson.error.code).toBe('HANDOFF_TOKEN_CONSUMED');
  });
});
