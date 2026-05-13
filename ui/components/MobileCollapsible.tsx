'use client';

import { ReactNode } from 'react';
import { cx } from '../lib/cx';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function MobileCollapsible({ title, defaultOpen = false, children, className }: Readonly<Props>) {
  return (
    <details
      open={defaultOpen}
      className={cx('terminal-card overflow-hidden', className)}
    >
      <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center justify-between">
        <span className="panel-header">{title}</span>
        <span className="font-mono text-xs text-muted details-arrow">expand</span>
      </summary>
      <div className="px-3.5 pb-3.5">{children}</div>
    </details>
  );
}
