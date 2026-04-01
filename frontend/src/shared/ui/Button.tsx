import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: 'primary' | 'secondary';
  },
) {
  const { children, className, variant = 'primary', ...rest } = props;
  return (
    <button
      {...rest}
      className={`button button-${variant} ${className ?? ''}`.trim()}
    >
      {children}
    </button>
  );
}
