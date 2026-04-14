import { randomUUID } from 'node:crypto';

export type TelegramLoginChallengeStatus =
  | 'pending'
  | 'completed'
  | 'consumed'
  | 'expired';

export type TelegramLoginSessionPayload = {
  buyerRef: string;
  actorId: string;
  authAccountId: string;
  sessionId: string;
  sessionType: string;
  sessionStatus: string;
  trustLevel: string;
  returnPath: string;
};

export type TelegramLoginChallengeRecord = {
  id: string;
  status: TelegramLoginChallengeStatus;
  createdAt: string;
  expiresAt: string;
  returnPath: string;
  completedActorId: string | null;
  handoffTokenId: string | null;
};

export type TelegramLoginHandoffTokenRecord = {
  id: string;
  challengeId: string;
  sessionPayload: TelegramLoginSessionPayload;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

const DEFAULT_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export class TelegramLoginHandoffError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'TelegramLoginHandoffError';
    this.code = code;
    this.status = status;
  }
}

const challenges = new Map<string, TelegramLoginChallengeRecord>();
const tokens = new Map<string, TelegramLoginHandoffTokenRecord>();

function nowIso(now: Date) {
  return now.toISOString();
}

function ensureInternalReturnPath(value?: string | null) {
  const normalized = value?.trim() || '/events';
  if (!normalized.startsWith('/')) {
    throw new TelegramLoginHandoffError(
      'RETURN_PATH_INVALID',
      'Return path must be an internal path.',
      400,
    );
  }
  if (normalized.startsWith('//')) {
    throw new TelegramLoginHandoffError(
      'RETURN_PATH_INVALID',
      'Return path must not be protocol-relative.',
      400,
    );
  }

  let url: URL;
  try {
    url = new URL(normalized, 'https://mix7.local');
  } catch {
    throw new TelegramLoginHandoffError(
      'RETURN_PATH_INVALID',
      'Return path is invalid.',
      400,
    );
  }

  if (url.origin !== 'https://mix7.local') {
    throw new TelegramLoginHandoffError(
      'RETURN_PATH_INVALID',
      'Return path must stay inside the site boundary.',
      400,
    );
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function ensureChallengeUsable(challenge: TelegramLoginChallengeRecord, now: Date) {
  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    challenge.status = 'expired';
    challenges.set(challenge.id, challenge);
    throw new TelegramLoginHandoffError(
      'LOGIN_CHALLENGE_EXPIRED',
      'Telegram login challenge expired.',
      410,
    );
  }

  if (challenge.status === 'consumed') {
    throw new TelegramLoginHandoffError(
      'LOGIN_CHALLENGE_CONSUMED',
      'Telegram login challenge was already consumed.',
      409,
    );
  }
}

function ensureTokenUsable(token: TelegramLoginHandoffTokenRecord, now: Date) {
  if (new Date(token.expiresAt).getTime() <= now.getTime()) {
    throw new TelegramLoginHandoffError(
      'HANDOFF_TOKEN_EXPIRED',
      'Telegram login handoff token expired.',
      410,
    );
  }

  if (token.consumedAt) {
    throw new TelegramLoginHandoffError(
      'HANDOFF_TOKEN_CONSUMED',
      'Telegram login handoff token was already consumed.',
      409,
    );
  }
}

export function createTelegramLoginChallenge(args?: {
  returnPath?: string | null;
  now?: Date;
  ttlMs?: number;
}) {
  const now = args?.now ?? new Date();
  const ttlMs = args?.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  const record: TelegramLoginChallengeRecord = {
    id: `tlc_${randomUUID().replace(/-/g, '')}`,
    status: 'pending',
    createdAt: nowIso(now),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    returnPath: ensureInternalReturnPath(args?.returnPath),
    completedActorId: null,
    handoffTokenId: null,
  };

  challenges.set(record.id, record);
  return record;
}

export function completeTelegramLoginChallenge(args: {
  challengeId: string;
  sessionPayload: Omit<TelegramLoginSessionPayload, 'returnPath'>;
  now?: Date;
  ttlMs?: number;
}) {
  const now = args.now ?? new Date();
  const challenge = challenges.get(args.challengeId);
  if (!challenge) {
    throw new TelegramLoginHandoffError(
      'LOGIN_CHALLENGE_NOT_FOUND',
      'Telegram login challenge not found.',
      404,
    );
  }

  ensureChallengeUsable(challenge, now);

  if (challenge.status === 'completed' && challenge.handoffTokenId) {
    const existingToken = tokens.get(challenge.handoffTokenId);
    if (existingToken) {
      ensureTokenUsable(existingToken, now);
      return {
        challenge,
        handoffToken: existingToken,
        replayed: true,
      };
    }
  }

  const handoffToken: TelegramLoginHandoffTokenRecord = {
    id: `tlt_${randomUUID().replace(/-/g, '')}`,
    challengeId: challenge.id,
    sessionPayload: {
      ...args.sessionPayload,
      returnPath: challenge.returnPath,
    },
    createdAt: nowIso(now),
    expiresAt: new Date(now.getTime() + (args.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS)).toISOString(),
    consumedAt: null,
  };

  const completedChallenge: TelegramLoginChallengeRecord = {
    ...challenge,
    status: 'completed',
    completedActorId: args.sessionPayload.actorId,
    handoffTokenId: handoffToken.id,
  };

  challenges.set(completedChallenge.id, completedChallenge);
  tokens.set(handoffToken.id, handoffToken);

  return {
    challenge: completedChallenge,
    handoffToken,
    replayed: false,
  };
}

export function exchangeTelegramLoginHandoffToken(args: {
  tokenId: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const token = tokens.get(args.tokenId);
  if (!token) {
    throw new TelegramLoginHandoffError(
      'HANDOFF_TOKEN_NOT_FOUND',
      'Telegram login handoff token not found.',
      404,
    );
  }

  ensureTokenUsable(token, now);

  const consumedToken: TelegramLoginHandoffTokenRecord = {
    ...token,
    consumedAt: nowIso(now),
  };
  tokens.set(consumedToken.id, consumedToken);

  const challenge = challenges.get(token.challengeId);
  if (challenge) {
    challenges.set(challenge.id, {
      ...challenge,
      status: 'consumed',
    });
  }

  return consumedToken.sessionPayload;
}

export function resetTelegramLoginHandoffStore() {
  challenges.clear();
  tokens.clear();
}
