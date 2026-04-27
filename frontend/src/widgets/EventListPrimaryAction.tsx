'use client';

import Link from 'next/link';

import type { EventListItem } from '@/features/events/api/events.api';
import { useOwnedEventTicket } from '@/features/tickets/hooks/useOwnedEventTicket';
import { getEventSalesLabel, getRemainingCapacityLabel } from '@/shared/lib/eventLabels';
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

  if (!props.event.sales.open) {
    return <Button disabled>{getEventSalesLabel(false)}</Button>;
  }

  if (props.event.soldOut) {
    return <Button disabled>{getRemainingCapacityLabel(0, true)}</Button>;
  }

  return (
    <Link className="button button-primary" href={routes.eventRegister(props.event.slug)}>
      {props.event.pricing.mode === 'free' ? 'Зарегистрироваться' : 'Купить билет'}
    </Link>
  );
}
