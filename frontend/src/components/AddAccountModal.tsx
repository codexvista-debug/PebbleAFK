'use client';

import React, { useState } from 'react';
import { X, Mail, ShieldCheck, Sparkles, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  waitingForPopup?: boolean;
  targetEmail?: string;
  authUrl?: string;
  errorMessage?: string | null;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  waitingForPopup = false,
  targetEmail = '',
  authUrl = '',
  errorMessage = null,
}) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your Microsoft account email.');
      return;
    }
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    onSubmit(cleanEmail);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header (Clean Light Theme) */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-slate-100 bg-slate-50/50">
          <div className="space-y-1">
            <h2 className="font-extrabold text-base text-slate-900 tracking-tight">Add an account</h2>
            <p className="text-xs text-slate-500">
              Add a Minecraft account so you can use it on your server profiles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* State 1: WAITING FOR POPUP LOGIN (Matching MinecraftAFK) */}
        {waitingForPopup ? (
          <div className="p-8 text-center space-y-5">
            <div className="py-2">
              <div className="w-11 h-11 border-3 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mx-auto shadow-xs" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Complete your login in the popup
              </h3>
              <p className="text-xs text-slate-500">
                We&apos;re waiting for Microsoft to confirm...
              </p>
            </div>

            {targetEmail && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{targetEmail}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="pt-2 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (authUrl) {
                    window.open(authUrl, '_blank');
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer flex items-center gap-1 transition"
              >
                <span>Popup not showing?</span>
                <span className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-0.5">
                  Continue in this tab
                  <ExternalLink className="w-3 h-3" />
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* State 2: EMAIL INPUT FORM (Matching Pebble Light Theme) */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Account Type Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Account type
              </label>
              <div className="relative">
                <select
                  disabled
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 appearance-none font-medium cursor-not-allowed opacity-90 shadow-2xs"
                >
                  <option>Bedrock / Microsoft Edition</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="example@outlook.com"
                  className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none transition shadow-2xs"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-normal pt-1">
                A Microsoft login popup will open pre-filled with this email address so you don&apos;t accidentally sign in with another account.
              </p>
            </div>

            {/* Security Note */}
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                No password required here. Microsoft handles authentication safely on their official servers.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
