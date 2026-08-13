'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPassword, signUpWithPassword } from '../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
      } else {
        await signUpWithPassword(email, password, fullName);
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleGuestStart() {
    sessionStorage.setItem('korail_guest', '1');
    router.push('/');
  }

  return (
    <div className="login-page" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleGuestStart}
        style={{ position: 'absolute', top: 18, right: 22, border: 0, background: 'none', color: '#98a4b4', fontSize: 11, fontWeight: 650 }}
      >
        로그인 없이 시작하기 →
      </button>

      <div className="card login-card">
        <div className="brand login-brand">
          <span className="brandmark">K</span>
          <span>
            <b>KORAIL</b> LINK
            <small>GLOBAL LOGISTICS</small>
          </span>
        </div>
        <h1>{mode === 'signin' ? '계정으로 로그인하세요' : '새 계정을 만드세요'}</h1>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <label className="field">
              <span>이름</span>
              <div>
                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
            </label>
          )}
          <label className="field">
            <span>이메일</span>
            <div>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </label>
          <label className="field">
            <span>비밀번호</span>
            <div>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </label>

          {error && <p className="login-message">{error}</p>}

          <button type="submit" disabled={submitting} className="primary wide">
            {submitting ? '처리 중…' : mode === 'signin' ? '로그인' : '회원가입'}
          </button>
        </form>

        <button
          type="button"
          className="text-btn login-switch"
          onClick={() => {
            setError(null);
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          }}
        >
          {mode === 'signin' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
}
