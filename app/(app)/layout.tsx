'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, getCurrentUser } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentUser().then((user) => {
      if (!mounted) return;
      setAuthed(!!user);
      setChecked(true);
      if (!user) router.replace('/login');
    });
    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
      if (!session?.user) router.replace('/login');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!checked) {
    return <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">불러오는 중…</div>;
  }
  if (!authed) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar />
      <div className="flex-1 overflow-y-auto bg-neutral-50">{children}</div>
    </div>
  );
}
