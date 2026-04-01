import type { RegistrationResponse } from '@/features/registrations/api/registrations.api';
import { writePendingCheckout } from '@/entities/session/lib/sessionStorage';
import { routes } from '@/shared/constants/routes';

export function resolveRegistrationNextAction(result: RegistrationResponse) {
  if (result.nextAction === 'ticket_ready' && result.ticket) {
    return routes.ticket(result.ticket.ticketId);
  }

  if (result.nextAction === 'checkout' && result.checkout) {
    writePendingCheckout({
      orderId: result.checkout.orderId,
      eventSlug: result.eventSlug,
      totalMinor: result.checkout.totalMinor,
      currency: result.checkout.currency,
    });
    return routes.checkout(result.checkout.orderId);
  }

  throw new Error('Registration response is missing a valid nextAction payload.');
}
