'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentUser, getProfile, signOut, type Profile } from '../lib/supabase';

const RESEARCH_LINKS = [
  { href: '/', label: '홈' },
  { href: '/market', label: '시황' },
  { href: '/search', label: '정보 검색' },
];

const CASE_TABS = [
  { segment: '', label: '개요' },
  { segment: '/contract', label: '계약' },
  { segment: '/documents', label: '문서' },
  { segment: '/settlement', label: '정산' },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm ${
        active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user) return;
      setEmail(user.email ?? null);
      getProfile(user.id).then(setProfile);
    });
  }, []);

  const caseMatch = pathname.match(/^\/cases\/([^/]+)/);
  const activeCaseId = caseMatch?.[1] ?? null;
  const isCaseList = pathname === '/cases';

  async function handleSignOut() {
    await signOut().catch(() => {});
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-4 py-5">
        <span className="text-base font-semibold text-neutral-900">KORAIL LINK</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        <div>
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">리서치</p>
          <div className="space-y-0.5">
            {RESEARCH_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
            ))}
          </div>
        </div>

        <div>
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">파이프라인</p>
          <div className="space-y-0.5">
            <NavLink href="/quotes/new" label="견적 생성" active={pathname === '/quotes/new'} />

            <NavLink href="/cases" label="화물 운송" active={isCaseList} />
            {activeCaseId && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-neutral-200 pl-3">
                {CASE_TABS.map((tab) => {
                  const href = `/cases/${activeCaseId}${tab.segment}`;
                  return <NavLink key={tab.segment} href={href} label={tab.label} active={pathname === href} />;
                })}
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="border-t border-neutral-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-neutral-900">{profile?.fullName ?? email ?? '사용자'}</p>
        <p className="truncate text-xs text-neutral-500">{profile?.companyName ?? email ?? ''}</p>
        <button onClick={handleSignOut} className="mt-2 text-xs text-neutral-500 hover:text-neutral-800">
          로그아웃
        </button>
      </div>
    </aside>
  );
}
