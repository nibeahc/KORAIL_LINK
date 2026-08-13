'use client';

import type { ReactNode } from 'react';

export function PageTitle({ eyebrow, title, desc, action }: { eyebrow?: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  );
}
