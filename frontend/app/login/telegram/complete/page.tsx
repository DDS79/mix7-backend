'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { exchangeTelegramLoginToken } from '@/entities/session/api/telegramLogin.api';
import { writeSessionState } from '@/entities/session/lib/sessionStorage';
import { routes } from '@/shared/constants/routes';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

export default function TelegramLoginCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const token = searchParams.get('token');

    if (!token) {
      setError('Telegram login token is missing.');
      return;
    }

    async function completeLogin() {
      try {
        const activeToken = token;
        if (!activeToken) {
          throw new Error('Telegram login token is missing.');
        }
        const result = await exchangeTelegramLoginToken(activeToken);
        writeSessionState({
          buyerRef: result.buyerRef,
          sessionId: result.sessionId,
          actorId: result.actorId,
          authAccountId: result.authAccountId,
          trustLevel: result.trustLevel,
          sessionType: result.sessionType,
          sessionStatus: result.sessionStatus,
        });

        if (active) {
          router.replace(result.returnPath || routes.events());
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Telegram login exchange failed.');
        }
      }
    }

    void completeLogin();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  if (error) {
    return <ErrorState title="Telegram login failed" message={error} />;
  }

  return (
    <Card>
      <div className="stack">
        <h2>Completing Telegram login</h2>
        <p className="subtle">Exchanging one-time handoff token and restoring the site session.</p>
        <div className="screen-center">
          <Spinner />
        </div>
      </div>
    </Card>
  );
}
