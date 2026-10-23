'use client';

import React, { useState } from 'react';
import { X, User, Lock, LogIn, UserPlus, ShieldAlert, Check } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string, secretCode?: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleUsernameChange = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    setUsername(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Username is required');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isRegister ? 'register' : 'login',
          username: cleanUser,
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Authentication failed');
        return;
      }

      onSuccess(data.user.username, data.user.secretCode);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mc-auth-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="mc-auth-panel bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="mc-auth-header px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-slate-50">
          <div className="flex items-center gap-2">
            <div className="mc-auth-mark w-9 h-9 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <span aria-hidden="true">⛏</span>
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                {isRegister ? 'Create your PebbleAFK account' : 'Welcome back, builder'}
              </h2>
              <span className="text-[10px] text-slate-500 font-medium">BEDROCK CONTROL DECK <span className="mc-auth-divider">/</span> SECURE SIGN IN</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mc-auth-grid">
          {/* Form Body */}
          <form onSubmit={handleSubmit} className="mc-auth-form p-6 space-y-4">
            <div className="mc-auth-intro">
              <span className="mc-auth-kicker">{isRegister ? 'NEW ADVENTURE' : 'GOOD TO SEE YOU'}</span>
              <p>{isRegister ? 'Create an account to set up your Bedrock control room.' : 'Sign in to pick up where your worlds left off.'}</p>
            </div>
            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Username</label>
                <span className="text-[10px] font-mono text-slate-500">
                  {username.length}/16
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="e.g. Chief"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white shadow-2xs"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                Alphanumeric characters only.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white shadow-2xs"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mc-button-primary w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span className="mc-pixel-spinner w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isRegister ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register Account</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <div className="mc-auth-switch pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {isRegister ? 'Already have an account?' : 'Need an account?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                className="font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
              >
                {isRegister ? 'Sign In Instead' : 'Register Here'}
              </button>
            </div>
          </form>

          <aside className="mc-auth-world" aria-label="PebbleAFK features">
            <span className="mc-auth-world-tag"><span className="mc-status-dot" /> YOUR OVERWORLD HUB</span>
            <div className="mc-auth-world-copy">
              <span className="mc-auth-kicker">ONE LITTLE CONTROL ROOM</span>
              <h3>Everything in<br />its right place.</h3>
              <p>Keep an eye on your Bedrock crew and the worlds they call home.</p>
              <ul>
                <li><Check className="w-4 h-4" /> Server profiles &amp; account groups</li>
                <li><Check className="w-4 h-4" /> Live chat and connection activity</li>
                <li><Check className="w-4 h-4" /> Your Termux daemon at a glance</li>
              </ul>
            </div>
            <div className="mc-auth-blocks" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </aside>
        </div>
      </div>
    </div>
  );
};
