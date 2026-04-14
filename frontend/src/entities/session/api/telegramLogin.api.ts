import { apiRequest } from '@/shared/api/client';

export type CreateTelegramLoginChallengeResponse = {
  challengeId: string;
  status: 'pending';
  expiresAt: string;
  returnPath: string;
};

export type ExchangeTelegramLoginTokenResponse = {
  buyerRef: string;
  actorId: string;
  authAccountId: string;
  sessionId: string;
  sessionType: string;
  sessionStatus: string;
  trustLevel: string;
  returnPath: string;
};

export async function createTelegramLoginChallenge(returnPath?: string) {
  const response = await apiRequest<{
    ok: true;
    data: CreateTelegramLoginChallengeResponse;
  }>({
    path: '/login/telegram/challenges',
    method: 'POST',
    body: returnPath ? { returnPath } : {},
  });

  return response.data;
}

export async function exchangeTelegramLoginToken(token: string) {
  const response = await apiRequest<{
    ok: true;
    data: ExchangeTelegramLoginTokenResponse;
  }>({
    path: '/login/telegram/exchange',
    method: 'POST',
    body: { token },
  });

  return response.data;
}
