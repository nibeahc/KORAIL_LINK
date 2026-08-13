'use client';

import type { ReactNode } from 'react';

/** app/globals.css의 .badge.red/.amber/.green/.blue 4종만 실제로 스타일이 정의되어 있다 */
export type BadgeTone = 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'neutral';

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
