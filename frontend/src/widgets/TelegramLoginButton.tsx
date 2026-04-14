'use client';

import Link from 'next/link';

import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { routes } from '@/shared/constants/routes';
import { Badge } from '@/shared/ui/Badge';

export function TelegramLoginButton() {
  const session = useRuntimeSessionState();
  const isAuthenticated = Boolean(session?.sessionType && session.sessionType !== 'anonymous');

  if (isAuthenticated) {
    return <Badge tone="success">Telegram connected</Badge>;
  }

  return (
    <Link className="button button-secondary" href={routes.telegramLogin(routes.events())}>
      Login with Telegram
    </Link>
  );
}
