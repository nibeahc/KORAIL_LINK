'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, getCurrentUser } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { AuthStatus } from '../components/AuthStatus';
import { Topbar } from '../components/Topbar';
import { AppAssistantWidget } from '../components/AppAssistantWidget';

function isGuest(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem('korail_guest') === '1';
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentUser().then((user) => {
      if (!mounted) return;
      const allowed = !!user || isGuest();
      setAuthed(allowed);
      setChecked(true);
      if (!allowed) router.replace('/login');
    });
    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      const allowed = !!session?.user || isGuest();
      setAuthed(allowed);
      if (!allowed) router.replace('/login');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!checked) {
    return (
      <div className="app">
        <div className="stage" style={{ marginLeft: 0 }}>
          <div style={{ padding: 40, color: 'var(--muted)', fontSize: 12 }}>불러오는 중…</div>
        </div>
      </div>
    );
  }
  if (!authed) {
    return null;
  }

  return (
    <div className={`app${navCollapsed ? ' nav-collapsed' : ''}`}>
      <Sidebar />
      <div className="stage">
        <AuthStatus />
        <Topbar collapsed={navCollapsed} toggleNav={() => setNavCollapsed((v) => !v)} />
        <main>{children}</main>
      </div>
      <AppAssistantWidget />
    </div>
  );
}
