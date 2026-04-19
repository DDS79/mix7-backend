'use client';

import { useEffect, useState } from 'react';

import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readSessionState } from '@/entities/session/lib/sessionStorage';
import { listTickets, type TicketDetail } from '@/features/tickets/api/tickets.api';

export function useOwnedEventTicket(eventSlug: string | null) {
  const runtimeSession = useRuntimeSessionState();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventSlug) {
      setTicket(null);
      setLoading(false);
      return;
    }

    const session = readSessionState() ?? runtimeSession;
    const isAuthenticated = Boolean(
      session?.sessionId && session.sessionType && session.sessionType !== 'anonymous',
    );

    if (!isAuthenticated) {
      setTicket(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void listTickets({ sessionId: session!.sessionId })
      .then((tickets) => {
        if (!active) {
          return;
        }

        const ownedTicket =
          tickets.find((currentTicket) => currentTicket.event.slug === eventSlug) ?? null;
        setTicket(ownedTicket);
        setLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setTicket(null);
        setError(nextError instanceof Error ? nextError.message : 'Ticket lookup failed.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventSlug, runtimeSession]);

  return { ticket, loading, error };
}
