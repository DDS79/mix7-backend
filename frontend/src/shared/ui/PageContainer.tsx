import type { ReactNode } from 'react';

export function PageContainer(props: { children: ReactNode }) {
  return <main className="page-container">{props.children}</main>;
}
