'use client';

import { usePathname } from 'next/navigation';

import { useSessionBootstrap } from '@/entities/session/hooks/useSessionBootstrap';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

function isPublicBootstrapPath(pathname: string | null) {
  if (!pathname || pathname === '/') {
    return true;
  }

  if (pathname === '/events') {
    return true;
  }

  const eventDetailMatch = /^\/events\/[^/]+$/.test(pathname);
  return eventDetailMatch;
}

export function SessionBootstrap(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading, error } = useSessionBootstrap();
  const isPublicPath = isPublicBootstrapPath(pathname);

  if (isPublicPath) {
    return <>{props.children}</>;
  }

  if (loading) {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Session unavailable" message={error} />;
  }

  return <>{props.children}</>;
}
