'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { CaseAssistantWidget } from '../../../components/CaseAssistantWidget';

export default function CaseLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <>
      {children}
      <CaseAssistantWidget caseId={params.id} />
    </>
  );
}
