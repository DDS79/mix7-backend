'use client';

import Link from 'next/link';

import { useOwnedEventTicket } from '@/features/tickets/hooks/useOwnedEventTicket';
import { routes } from '@/shared/constants/routes';
import { Button } from '@/shared/ui/Button';

export function EventDetailPrimaryAction(props: { eventSlug: string }) {
  const ownedTicketState = useOwnedEventTicket(props.eventSlug);

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
    <Link className="button button-primary" href={routes.eventRegister(props.eventSlug)}>
      Register
    </Link>
  );
}
