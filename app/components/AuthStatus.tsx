'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getProfile, signOut } from '../lib/supabase';

export function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user) return;
      setEmail(user.email ?? null);
      getProfile(user.id).then((p) => {
        setName(p?.fullName ?? null);
        setRole(p?.role ?? null);
      });
    });
  }, []);

  async function logout() {
    await signOut().catch(() => {});
    sessionStorage.removeItem('korail_guest');
    router.push('/login');
  }

  return (
    <div className="auth-status">
      {email ? (
        <>
          <span>
            {name ?? email}
            {role === 'admin' && ' · 관리자'}
          </span>
          <button type="button" onClick={logout}>
            로그아웃
          </button>
        </>
      ) : (
        <>
          <span>게스트 모드</span>
          <button type="button" onClick={logout}>
            로그인 화면으로
          </button>
        </>
      )}
    </div>
  );
}
