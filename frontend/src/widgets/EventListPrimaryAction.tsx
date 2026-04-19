'use client';

import Link from 'next/link';

import type { EventListItem } from '@/features/events/api/events.api';
import { useOwnedEventTicket } from '@/features/tickets/hooks/useOwnedEventTicket';
import { routes } from '@/shared/constants/routes';
import { Button } from '@/shared/ui/Button';

export function EventListPrimaryAction(props: { event: EventListItem }) {
  const ownedTicketState = useOwnedEventTicket(props.event.slug);

  if (ownedTicketState.ticket) {
    return (
      <Link className="button button-primary" href={routes.ticket(ownedTicketState.ticket.id)}>
        Открыть билет
      </Link>
    );
  }

  if (ownedTicketState.loading) {
    return <Button disabled>Проверяем билет…</Button>;
  }

  return (
    <Link className="button button-primary" href={routes.eventRegister(props.event.slug)}>
      {props.event.pricing.mode === 'free' ? 'Register' : 'Buy ticket'}
    </Link>
  );
}
