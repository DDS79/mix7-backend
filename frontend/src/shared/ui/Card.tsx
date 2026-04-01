import type { ReactNode } from 'react';

export function Card(props: { children: ReactNode; className?: string }) {
  return <section className={`card ${props.className ?? ''}`.trim()}>{props.children}</section>;
}
