'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getEventDetail, type EventDetail } from '@/features/events/api/events.api';
import { createRegistration } from '@/features/registrations/api/registrations.api';
import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readSessionState } from '@/entities/session/lib/sessionStorage';
import { useOwnedEventTicket } from '@/features/tickets/hooks/useOwnedEventTicket';
import { resolveRegistrationNextAction } from '@/processes/registration/lib/resolveRegistrationNextAction';
import { getEventSalesLabel } from '@/shared/lib/eventLabels';
import { routes } from '@/shared/constants/routes';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const runtimeSession = useRuntimeSessionState();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const ownedTicketState = useOwnedEventTicket(slug ?? null);
  const loginHref = slug ? routes.telegramLogin(routes.eventRegister(slug)) : routes.telegramLogin();
  const currentSession = readSessionState() ?? runtimeSession;
  const isAuthenticated = Boolean(
    currentSession?.sessionId &&
      currentSession.sessionType &&
      currentSession.sessionType !== 'anonymous',
  );

  useEffect(() => {
    if (!slug) {
      setEvent(null);
      setEventLoading(false);
      setError('Событие не найдено.');
      return;
    }

    let active = true;
    setEventLoading(true);

    void getEventDetail(slug)
      .then((nextEvent) => {
        if (!active) {
          return;
        }
        setEvent(nextEvent);
        setEventLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        setEvent(null);
        setError(nextError instanceof Error ? nextError.message : 'Событие недоступно.');
        setEventLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  async function onSubmit() {
    if (!slug) {
      setError('Event route parameter is missing.');
      return;
    }

    if (event && !event.registration.salesOpen) {
      setError('Продажи закрыты.');
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
      if (!readSessionState()) {
        setError(null);
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Registration failed.');
      }
      setSubmitting(false);
    }
  }

  if (eventLoading) {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (!event && error) {
    return <ErrorState title="Событие недоступно" message={error} />;
  }

  const salesClosed = Boolean(event && !event.registration.salesOpen && !ownedTicketState.ticket);

  return (
    <Card>
      <div className="stack">
        <div>
          <h2>Регистрация на событие</h2>
          <p className="subtle">
            Сервер определяет, ведёт ли регистрация сразу к билету или дальше к оплате.
          </p>
        </div>
        {ownedTicketState.ticket ? (
          <>
            <p className="subtle">
              У вас уже есть билет на это событие. Повторная регистрация и оплата не нужны.
            </p>
            <Link className="button button-primary" href={routes.ticket(ownedTicketState.ticket.id)}>
              Открыть билет
            </Link>
            <Link className="button button-secondary" href={slug ? routes.eventDetail(slug) : routes.events()}>
              Back to event
            </Link>
          </>
        ) : (
          <>
        {salesClosed ? (
          <ErrorState
            title={getEventSalesLabel(false)}
            message="Новые регистрации и покупки для этого события сейчас недоступны."
          />
        ) : null}
        {error && !salesClosed ? <ErrorState title="Регистрация не выполнена" message={error} /> : null}
        {!isAuthenticated ? (
          <Link className="button button-secondary" href={loginHref}>
            Войти через Telegram
          </Link>
        ) : null}
        <Button
          disabled={submitting || ownedTicketState.loading || salesClosed}
          onClick={onSubmit}
        >
          {submitting ? 'Отправляем…' : salesClosed ? getEventSalesLabel(false) : 'Продолжить'}
        </Button>
        <Link className="button button-secondary" href={slug ? routes.eventDetail(slug) : routes.events()}>
          Назад к событию
        </Link>
          </>
        )}
      </div>
    </Card>
  );
}
