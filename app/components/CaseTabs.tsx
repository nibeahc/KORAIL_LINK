'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabGroup {
  label: string | null;
  items: { segment: string; label: string }[];
}

const TAB_GROUPS: TabGroup[] = [
  { label: null, items: [{ segment: '', label: '개요' }] },
  { label: '운임 인텔리전스', items: [{ segment: '/validation', label: '견적 검증' }] },
  {
    label: '업무 연결',
    items: [
      { segment: '/contract', label: '계약' },
      { segment: '/documents', label: '문서' },
      { segment: '/settlement', label: '정산' },
    ],
  },
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  return (
    <div className="tabs">
      {TAB_GROUPS.map((group, gi) => (
        <div className="tab-group" key={group.label ?? 'intro'}>
          {gi > 0 && <i className="tab-divider" />}
          {group.label && <span className="tab-group-label">{group.label}</span>}
          {group.items.map((tab) => {
            const href = `/cases/${caseId}${tab.segment}`;
            return (
              <Link key={tab.segment} href={href} className={pathname === href ? 'active' : ''}>
                {tab.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
