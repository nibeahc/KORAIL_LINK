'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentUser, getProfile, type Profile } from '../lib/supabase';
import { useCases } from '../lib/state';

const CASE_SUB_ITEMS: [string, string][] = [
  ['/contract', '계약'],
  ['/documents', '문서'],
  ['/settlement', '정산'],
];

function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    home: '⌂',
    case: '▤',
    search: '⌕',
    spark: '✦',
    settings: '⚙',
  };
  return (
    <span className="icon" aria-hidden>
      {glyphs[name] ?? '•'}
    </span>
  );
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
  const shipmentActive = pathname.startsWith('/cases');
  const open = manualOpen === null ? shipmentActive : manualOpen;
  const needsAttention = cases.filter((c) => c.status === 'needs_review' || c.status === 'pending_validation').length;

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
            <Icon name="home" />홈
          </Link>
          <Link href="/market" className={pathname === '/market' ? 'active' : ''}>
            <Icon name="search" />시황
          </Link>
          <Link href="/search" className={pathname === '/search' ? 'active' : ''}>
            <Icon name="search" />정보 검색
          </Link>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-group-label">파이프라인</span>
          <Link href="/quotes/new" className={pathname === '/quotes/new' ? 'active' : ''}>
            <Icon name="spark" />견적 생성
          </Link>
          <div className="sidebar-expand-row">
            <Link href="/cases" className={shipmentActive ? 'active' : ''} onClick={() => setManualOpen(true)}>
              <Icon name="case" />
              화물 운송{needsAttention > 0 && <em>{needsAttention}</em>}
            </Link>
            <button type="button" className="sidebar-chev" aria-label={open ? '접기' : '펼치기'} onClick={() => setManualOpen(!open)}>
              {open ? '▴' : '▾'}
            </button>
          </div>
          {open && activeCaseId && (
            <div className="sidebar-sub">
              {CASE_SUB_ITEMS.map(([segment, label]) => {
                const href = `/cases/${activeCaseId}${segment}`;
                return (
                  <Link key={segment} href={href} className={pathname === href ? 'active' : ''}>
                    {label}
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
