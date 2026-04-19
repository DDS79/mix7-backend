'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { listTickets, type TicketDetail } from '@/features/tickets/api/tickets.api';
import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readPendingCheckout, readSessionState } from '@/entities/session/lib/sessionStorage';
import { routes } from '@/shared/constants/routes';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

type ReturnState =
  | { kind: 'loading' }
  | { kind: 'ticket'; ticket: TicketDetail }
  | { kind: 'processing'; orderId: string | null; eventSlug: string | null }
  | { kind: 'list'; tickets: TicketDetail[] }
  | { kind: 'session_missing' }
  | { kind: 'error'; message: string };

function selectRelevantTicket(args: {
  tickets: TicketDetail[];
  orderId: string | null;
  eventSlug: string | null;
}) {
  if (args.orderId) {
    const byOrder = args.tickets.find((ticket) => ticket.orderId === args.orderId);
    if (byOrder) {
      return byOrder;
    }
  }

  if (args.eventSlug) {
    const byEvent = args.tickets.find((ticket) => ticket.event.slug === args.eventSlug);
    if (byEvent) {
      return byEvent;
    }
  }

  return null;
}

export default function CheckoutReturnPage() {
  const router = useRouter();
  const runtimeSession = useRuntimeSessionState();
  const [state, setState] = useState<ReturnState>({ kind: 'loading' });

  useEffect(() => {
    const session = readSessionState() ?? runtimeSession;
    const isAuthenticated = Boolean(
      session?.sessionId && session.sessionType && session.sessionType !== 'anonymous',
    );

    if (!isAuthenticated) {
      setState({ kind: 'session_missing' });
      return;
    }

    const pendingCheckoutRaw =
      typeof window === 'undefined'
        ? null
        : window.sessionStorage.getItem('mix7.phase1.pendingCheckout');
    const pendingCheckout = pendingCheckoutRaw
      ? (() => {
          try {
            return JSON.parse(pendingCheckoutRaw) as {
              orderId: string;
              eventSlug: string;
              totalMinor: number;
              currency: string;
            };
          } catch {
            return null;
          }
        })()
      : null;

    void listTickets({ sessionId: session!.sessionId })
      .then((tickets) => {
        const relevantTicket = selectRelevantTicket({
          tickets,
          orderId: pendingCheckout?.orderId ?? null,
          eventSlug: pendingCheckout?.eventSlug ?? null,
        });

        if (relevantTicket) {
          router.replace(routes.ticket(relevantTicket.id));
          setState({ kind: 'ticket', ticket: relevantTicket });
          return;
        }

        if (pendingCheckout?.orderId || pendingCheckout?.eventSlug) {
          setState({
            kind: 'processing',
            orderId: pendingCheckout?.orderId ?? null,
            eventSlug: pendingCheckout?.eventSlug ?? null,
          });
          return;
        }

        if (tickets.length > 0) {
          setState({ kind: 'list', tickets });
          return;
        }

        setState({
          kind: 'processing',
          orderId: null,
          eventSlug: null,
        });
      })
      .catch((error) => {
        if (!readSessionState()) {
          setState({ kind: 'session_missing' });
          return;
        }

        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Failed to recover checkout return state.',
        });
      });
  }, [router, runtimeSession]);

  if (state.kind === 'loading') {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (state.kind === 'session_missing') {
    return (
      <ErrorState
        title="Session unavailable"
        message="Open the event page again from the same browser session to recover your purchase state."
      />
    );
  }

  if (state.kind === 'error') {
    return <ErrorState title="Checkout return unavailable" message={state.message} />;
  }

  if (state.kind === 'ticket') {
    return (
      <Card>
        <div className="stack">
          <h2>Payment confirmed</h2>
          <p className="subtle">
            Your ticket is ready. Redirecting to the ticket page.
          </p>
          <Link className="button button-primary" href={routes.ticket(state.ticket.id)}>
            Open ticket
          </Link>
        </div>
      </Card>
    );
  }

  if (state.kind === 'list') {
    return (
      <Card>
        <div className="stack">
          <h2>Payment return recovered</h2>
          <p className="subtle">
            Checkout context was not available locally, but your current backend-owned tickets were recovered.
          </p>
          <Link className="button button-primary" href={routes.ticket(state.tickets[0].id)}>
            Open latest ticket
          </Link>
          <Link className="button button-secondary" href={routes.events()}>
            Back to events
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <EmptyState
        title="Payment is being processed"
        message={
          state.eventSlug
            ? `We are waiting for the final backend confirmation for ${state.eventSlug}. If your ticket is not visible yet, reopen the event page in a few seconds.`
            : 'We are waiting for the final backend confirmation. Refresh this page or reopen the event page in a few seconds.'
        }
      />
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button onClick={() => window.location.reload()}>Refresh status</Button>
        <Link className="button button-secondary" href={state.eventSlug ? routes.eventDetail(state.eventSlug) : routes.events()}>
          Back
        </Link>
      </div>
    </div>
  );
}
