'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { routes } from '@/shared/constants/routes';
import { Badge } from '@/shared/ui/Badge';

export function TelegramLoginButton() {
  const pathname = usePathname();
  const session = useRuntimeSessionState();
  const isAuthenticated = Boolean(session?.sessionType && session.sessionType !== 'anonymous');
  const returnPath = pathname || routes.events();

  if (isAuthenticated) {
    return <Badge tone="success">Telegram connected</Badge>;
  }

  return (
    <Link className="button button-secondary" href={routes.telegramLogin(returnPath)}>
      Login with Telegram
    </Link>
  );
}
