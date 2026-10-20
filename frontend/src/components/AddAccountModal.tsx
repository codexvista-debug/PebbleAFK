'use client';

import React, { useState } from 'react';
import { X, Mail, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
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
    setEmail('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#12161f] border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="font-extrabold text-base text-slate-100 tracking-tight">Add an account</h2>
            <p className="text-xs text-slate-400">
              Add a Minecraft account so you can use it on your server profiles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Account Type Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Account type
            </label>
            <div className="relative">
              <select
                disabled
                className="w-full bg-[#1a202c] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 appearance-none font-medium cursor-not-allowed opacity-90 shadow-inner"
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
            <label className="block text-xs font-bold text-slate-300">
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
                className="w-full bg-[#1a202c] border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 font-medium focus:outline-none transition shadow-inner"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-normal pt-1">
              Microsoft will lock the authentication to this exact email, preventing accidental sign-ins to another account in your browser.
            </p>
          </div>

          {/* Security Note */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-300/90 leading-relaxed">
              No password required here. Microsoft handles authentication directly on official Microsoft servers.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
