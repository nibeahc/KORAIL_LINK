'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentUser, getProfile, type Profile } from '../lib/supabase';
import { useCases } from '../lib/state';
import { Icon } from './Icon';

const CASE_SUB_ITEMS: [string, string, string][] = [
  ['/contract', '/contracts', '계약'],
  ['/documents', '/documents', '문서'],
  ['/settlement', '/settlements', '정산'],
];

const NAV_ICON_SRC: Record<string, string> = { home: '/icons/nav-home.svg', search: '/icons/nav-search.svg', case: '/icons/nav-shipment.svg' };

function NavIcon({ name }: { name: 'home' | 'search' | 'case' }) {
  return <img className={`nav-icon nav-icon-${name}`} src={NAV_ICON_SRC[name]} alt="" aria-hidden />;
}

export function Sidebar() {
  const pathname = usePathname();
  const { cases } = useCases();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user) return;
      setEmail(user.email ?? null);
      getProfile(user.id).then(setProfile);
    });
  }, []);

  const caseMatch = pathname.match(/^\/cases\/([^/]+)/);
  const activeCaseId = caseMatch?.[1] ?? null;
  const moduleTopLevel = pathname === '/contracts' || pathname === '/documents' || pathname === '/settlements';
  const shipmentActive = pathname.startsWith('/cases') || moduleTopLevel;
  const open = manualOpen === null ? true : manualOpen;
  const needsAttention = cases.filter((c) => c.status === 'needs_review' || c.status === 'pending_validation').length;
  const contractCount = cases.filter((c) => c.status === 'contracted').length;
  const documentCount = contractCount;
  const settlementCount = cases.filter((c) => c.status === 'settlement').length;
  const subCounts: Record<string, number> = { 계약: contractCount, 문서: documentCount, 정산: settlementCount };

  const displayName = profile?.fullName ?? email?.split('@')[0] ?? '게스트';

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brandmark">K</span>
        <span>
          <b>KORAIL</b> LINK
          <small>GLOBAL LOGISTICS</small>
        </span>
      </Link>

      <nav>
        <div className="sidebar-group">
          <span className="sidebar-group-label">리서치</span>
          <Link href="/" className={pathname === '/' ? 'active' : ''}>
            <NavIcon name="home" />홈
          </Link>
          <Link href="/search" className={pathname === '/search' ? 'active' : ''}>
            <NavIcon name="search" />시황·정보 검색
          </Link>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-group-label">파이프라인</span>
          <Link href="/quotes/new" className={pathname === '/quotes/new' ? 'active' : ''}>
            <Icon name="spark" />견적 생성
          </Link>
          <div className="sidebar-expand-row">
            <Link href="/cases" className={shipmentActive ? 'active' : ''} onClick={() => setManualOpen(true)}>
              <NavIcon name="case" />
              화물 운송{needsAttention > 0 && <em>{needsAttention}</em>}
            </Link>
            <button type="button" className="sidebar-chev" aria-label={open ? '접기' : '펼치기'} onClick={() => setManualOpen(!open)}>
              {open ? '▴' : '▾'}
            </button>
          </div>
          {open && (
            <div className="sidebar-sub">
              {CASE_SUB_ITEMS.map(([caseSegment, topLevelPath, label]) => {
                const href = activeCaseId ? `/cases/${activeCaseId}${caseSegment}` : topLevelPath;
                const count = subCounts[label] ?? 0;
                const active = pathname === href || (!activeCaseId && pathname === topLevelPath);
                return (
                  <Link key={label} href={href} className={active ? 'active' : ''}>
                    {label}
                    {count > 0 && <em>{count}</em>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="side-bottom">
        <button type="button">
          <Icon name="settings" />
          설정
        </button>
        <div className="profile">
          <span>{displayName.slice(0, 1)}</span>
          <div>
            <b>{displayName}</b>
            <small>{email ?? '로그인 없이 둘러보는 중'}</small>
          </div>
          <i>···</i>
        </div>
      </div>
    </aside>
  );
}
