'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { createRegistration } from '@/features/registrations/api/registrations.api';
import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readSessionState } from '@/entities/session/lib/sessionStorage';
import { resolveRegistrationNextAction } from '@/processes/registration/lib/resolveRegistrationNextAction';
import { routes } from '@/shared/constants/routes';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const runtimeSession = useRuntimeSessionState();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const loginHref = slug ? routes.telegramLogin(routes.eventRegister(slug)) : routes.telegramLogin();
  const currentSession = readSessionState() ?? runtimeSession;
  const isAuthenticated = Boolean(
    currentSession?.sessionId &&
      currentSession.sessionType &&
      currentSession.sessionType !== 'anonymous',
  );

  async function onSubmit() {
    if (!slug) {
      setError('Event route parameter is missing.');
      return;
    }

    const session = readSessionState() ?? runtimeSession;
    if (!session?.sessionId || !session.sessionType || session.sessionType === 'anonymous') {
      setError('Login with Telegram to continue registration.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const result = await createRegistration({
        sessionId: session.sessionId,
        eventSlug: slug,
      });
      router.push(resolveRegistrationNextAction(result));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Registration failed.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="stack">
        <div>
          <h2>Confirm registration</h2>
          <p className="subtle">
            The backend will decide whether this registration continues to checkout or directly
            returns an issued ticket.
          </p>
        </div>
        {error ? <ErrorState title="Registration failed" message={error} /> : null}
        {!isAuthenticated ? (
          <Link className="button button-secondary" href={loginHref}>
            Login with Telegram
          </Link>
        ) : null}
        <Button disabled={submitting} onClick={onSubmit}>
          {submitting ? 'Submitting…' : 'Submit registration'}
        </Button>
        <Link className="button button-secondary" href={slug ? routes.eventDetail(slug) : routes.events()}>
          Back to event
        </Link>
      </div>
    </Card>
  );
}
