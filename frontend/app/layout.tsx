import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

import Link from 'next/link';

import { appConstants } from '@/shared/constants/app';
import { routes } from '@/shared/constants/routes';
import { env } from '@/shared/lib/env';
import { SessionBootstrap } from '@/widgets/SessionBootstrap';

export const metadata: Metadata = {
  title: appConstants.name,
  description: appConstants.tagline || 'Phase-1 event registration frontend.',
  metadataBase: new URL(env.siteUrl),
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionBootstrap>
          <div className="page-container">
            <header className="app-shell-header">
              <span className="eyebrow">{appConstants.name}</span>
              <h1 className="hero-title">{appConstants.tagline || 'Events and tickets'}</h1>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link className="button button-secondary" href={routes.telegramLogin(routes.events())}>
                  Login with Telegram
                </Link>
              </div>
            </header>
            {props.children}
          </div>
        </SessionBootstrap>
      </body>
    </html>
  );
}
