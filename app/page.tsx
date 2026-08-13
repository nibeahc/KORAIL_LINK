'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, getCurrentUser, signOut } from './lib/supabase';
import { useCases } from './lib/state';
import { CASE_STATUS_LABEL } from './lib/types';

export default function HomePage() {
  const router = useRouter();
  const { cases, loading: casesLoading } = useCases();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setCheckingAuth(false));

    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await signOut().catch(() => {});
    router.push('/login');
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <h1 className="text-lg font-semibold text-neutral-900">KORAIL LINK</h1>
        {!checkingAuth && user ? (
          <div className="flex items-center gap-3 text-sm text-neutral-600">
            <span>{user.email}</span>
            <button onClick={handleSignOut} className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
              로그아웃
            </button>
          </div>
        ) : !checkingAuth ? (
          <a href="/login" className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
            로그인
          </a>
        ) : null}
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-500">
          진행 중인 Case {casesLoading ? '(불러오는 중…)' : `(${cases.length}건)`}
        </h2>
        <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {cases.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-neutral-900">{c.caseNumber} · {c.shipperName}</p>
                <p className="text-neutral-500">{c.route}</p>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                {CASE_STATUS_LABEL[c.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
