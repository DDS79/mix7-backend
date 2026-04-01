export const routes = {
  events: () => '/events',
  eventDetail: (slug: string) => `/events/${slug}`,
  eventRegister: (slug: string) => `/events/${slug}/register`,
  checkout: (orderId: string) => `/checkout/${orderId}`,
  ticket: (ticketId: string) => `/tickets/${ticketId}`,
} as const;
