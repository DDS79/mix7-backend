import type { ReactNode } from 'react';

export function Badge(props: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' }) {
  return <span className={`badge badge-${props.tone ?? 'neutral'}`}>{props.children}</span>;
}
