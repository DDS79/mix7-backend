'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { createTelegramLoginChallenge } from '@/entities/session/api/telegramLogin.api';
import { routes } from '@/shared/constants/routes';
import { env } from '@/shared/lib/env';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';

function buildTelegramStartLink(challengeId: string) {
  if (!env.telegramBotLinkBase) {
    throw new Error('Telegram bot link base is not configured.');
  }
  const url = new URL(env.telegramBotLinkBase);
  url.searchParams.set('start', `login_${challengeId}`);
  return url.toString();
}

export default function TelegramLoginPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnPath = useMemo(
    () => searchParams.get('returnPath') || routes.events(),
    [searchParams],
  );

  async function startTelegramLogin() {
    try {
      setLoading(true);
      setError(null);
      const challenge = await createTelegramLoginChallenge(returnPath);
      window.location.href = buildTelegramStartLink(challenge.challengeId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Telegram login start failed.');
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <h2>Login with Telegram</h2>
          <p className="subtle">
            Start Telegram confirmation in the bot, then come back through the one-time site
            handoff link.
          </p>
        </div>
        {error ? <ErrorState title="Telegram login unavailable" message={error} /> : null}
        <Button disabled={loading} onClick={startTelegramLogin}>
          {loading ? 'Opening Telegram…' : 'Open Telegram'}
        </Button>
      </div>
    </Card>
  );
}
