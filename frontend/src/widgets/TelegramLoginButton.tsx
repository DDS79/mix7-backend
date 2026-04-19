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
    return (
      <div className="row" style={{ justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Badge tone="success">Telegram connected</Badge>
        <Link className="button button-secondary" href={routes.account()}>
          Мои билеты
        </Link>
      </div>
    );
  }

  return (
    <Link className="button button-secondary" href={routes.telegramLogin(returnPath)}>
      Login with Telegram
    </Link>
  );
}
