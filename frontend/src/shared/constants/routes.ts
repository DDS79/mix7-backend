export const routes = {
  events: () => '/events',
  eventDetail: (slug: string) => `/events/${slug}`,
  eventRegister: (slug: string) => `/events/${slug}/register`,
  telegramLogin: (returnPath?: string) =>
    returnPath
      ? `/login/telegram?returnPath=${encodeURIComponent(returnPath)}`
      : '/login/telegram',
  telegramLoginComplete: (token?: string) =>
    token
      ? `/login/telegram/complete?token=${encodeURIComponent(token)}`
      : '/login/telegram/complete',
  account: () => '/account',
  checkout: (orderId: string) => `/checkout/${orderId}`,
  ticket: (ticketId: string) => `/tickets/${ticketId}`,
} as const;
