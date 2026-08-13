"use client";

import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('');
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup') setMessage('가입 완료. 이메일 인증이 필요하면 메일함을 확인하세요.');
    else window.location.href = '/';
    setLoading(false);
  }

  return <main className="login-page">
    <div className="login-card card">
      <div className="brand login-brand"><span className="brandmark">K</span><span><b>KORAIL</b> LINK<small>GLOBAL LOGISTICS</small></span></div>
      <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
      <form onSubmit={submit} className="login-form">
        {mode === 'signup' && <label className="field"><span>이름</span><input required value={fullName} onChange={e => setFullName(e.target.value)} /></label>}
        <label className="field"><span>이메일</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span>비밀번호</span><input required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary wide" disabled={loading} type="submit">{loading ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}</button>
      </form>
      {message && <p role="status" className="login-message">{message}</p>}
      <button type="button" className="text-btn login-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? '처음이면 회원가입' : '이미 계정이 있으면 로그인'}
      </button>
    </div>
  </main>;
}
