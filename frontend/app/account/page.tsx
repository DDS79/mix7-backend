'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listTickets, type TicketDetail } from '@/features/tickets/api/tickets.api';
import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readSessionState } from '@/entities/session/lib/sessionStorage';
import { routes } from '@/shared/constants/routes';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

function formatOptionalDate(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function toTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortTicketsForAccount(tickets: TicketDetail[]) {
  const now = Date.now();

  return [...tickets].sort((left, right) => {
    const leftStartsAt = toTimestamp(left.event.startsAt);
    const rightStartsAt = toTimestamp(right.event.startsAt);

    const leftUpcoming = leftStartsAt !== null && leftStartsAt >= now;
    const rightUpcoming = rightStartsAt !== null && rightStartsAt >= now;

    if (leftUpcoming !== rightUpcoming) {
      return leftUpcoming ? -1 : 1;
    }

    if (leftStartsAt !== null && rightStartsAt !== null) {
      return leftUpcoming ? leftStartsAt - rightStartsAt : rightStartsAt - leftStartsAt;
    }

    if (leftStartsAt !== null) {
      return -1;
    }

    if (rightStartsAt !== null) {
      return 1;
    }

    return left.id.localeCompare(right.id);
  });
}

export default function AccountPage() {
  const runtimeSession = useRuntimeSessionState();
  const [tickets, setTickets] = useState<TicketDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = readSessionState() ?? runtimeSession;
    const isAuthenticated = Boolean(
      session?.sessionId && session.sessionType && session.sessionType !== 'anonymous',
    );

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    void listTickets({ sessionId: session!.sessionId })
      .then((result) => {
        setTickets(result);
        setLoading(false);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load tickets.');
        setLoading(false);
      });
  }, [runtimeSession]);

  const currentSession = readSessionState() ?? runtimeSession;
  const isAuthenticated = Boolean(
    currentSession?.sessionId &&
      currentSession.sessionType &&
      currentSession.sessionType !== 'anonymous',
  );

  if (loading) {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <div className="stack">
          <h2>Личный кабинет</h2>
          <p className="subtle">
            Войдите через Telegram, чтобы увидеть свои билеты.
          </p>
          <Link className="button button-primary" href={routes.telegramLogin(routes.account())}>
            Login with Telegram
          </Link>
        </div>
      </Card>
    );
  }

  if (error) {
    return <ErrorState title="Не удалось загрузить билеты" message={error} />;
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <EmptyState title="Личный кабинет" message="У вас пока нет билетов" />
      </Card>
    );
  }

  const sortedTickets = sortTicketsForAccount(tickets);

  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <h2>Мои билеты</h2>
          <p className="subtle">
            Здесь показаны билеты, привязанные к вашему текущему аккаунту MIX7.
          </p>
        </div>
      </Card>

      {sortedTickets.map((ticket) => {
        const eventDate = formatOptionalDate(ticket.event.startsAt);

        return (
          <Card key={ticket.id}>
            <div className="stack">
              <div className="stack" style={{ gap: '0.5rem' }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div className="stack" style={{ gap: '0.25rem' }}>
                    <h3 style={{ marginBottom: 0 }}>{ticket.event.title || ticket.event.slug}</h3>
                    {eventDate ? <span className="subtle">{eventDate}</span> : null}
                  </div>
                  <Badge tone="success">{ticket.status}</Badge>
                </div>
              </div>
              <div className="meta-list">
                {!ticket.event.title ? <span>Событие: {ticket.event.slug}</span> : null}
                <span>Ticket: {ticket.id}</span>
                <span>Статус: {ticket.status}</span>
                <span>Access class: {ticket.accessClass}</span>
                {ticket.orderId ? <span>Order: {ticket.orderId}</span> : null}
              </div>
              <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <Link className="button button-primary" href={routes.ticket(ticket.id)}>
                  Открыть билет
                </Link>
                <Link className="button button-secondary" href={routes.eventDetail(ticket.event.slug)}>
                  Открыть событие
                </Link>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
