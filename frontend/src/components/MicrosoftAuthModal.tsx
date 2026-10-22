'use client';

import React, { useState } from 'react';
import { X, ExternalLink, Copy, CheckCircle2, KeyRound, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';

interface MicrosoftAuthModalProps {
  authData: {
    botId: string;
    userCode: string;
    url: string;
    message?: string;
    targetEmail?: string;
  } | null;
  accountEmail?: string;
  isPolling?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
}

export const MicrosoftAuthModal: React.FC<MicrosoftAuthModalProps> = ({
  authData,
  accountEmail,
  isPolling,
  errorMessage,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!authData) return null;

  const effectiveEmail = accountEmail || authData.targetEmail;

  // Prefer the daemon's device-specific URL so the automatic tab and manual fallback match.
  let directRemoteUrl = authData.url || `https://login.live.com/oauth20_remoteconnect.srf?otc=${encodeURIComponent(authData.userCode)}&prompt=select_account`;
  if (effectiveEmail && !directRemoteUrl.includes('login_hint=')) {
    directRemoteUrl += `${directRemoteUrl.includes('?') ? '&' : '?'}login_hint=${encodeURIComponent(effectiveEmail)}`;
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(authData.userCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directRemoteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">Microsoft Authentication</h2>
              <span className="text-[11px] text-emerald-700 font-semibold">1-Time Bedrock / Xbox Device Link</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-center overflow-y-auto">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-left flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-0.5">
                <span className="block font-bold">Verification Error</span>
                <span className="font-normal text-[11px] leading-relaxed">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Active Waiting Indicator */}
          {!errorMessage && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/90 shadow-2xs text-left relative overflow-hidden">
              <div className="flex items-center gap-3 relative z-10">
                <div className="relative flex items-center justify-center shrink-0 w-8 h-8">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <div className="relative rounded-full w-7 h-7 bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-950">
                    <span>Waiting for Microsoft Approval...</span>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-emerald-800/90 font-medium leading-relaxed mt-0.5">
                    Approve in your browser. <b>Do not close this window</b> — it will verify and close automatically!
                  </p>
                </div>
              </div>
            </div>
          )}

          {effectiveEmail && (
            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs flex items-center justify-between text-left">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Account:</span>
              <span className="font-mono font-bold text-slate-900 truncate max-w-[220px]">{effectiveEmail}</span>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Enter this code at Microsoft to verify your Bedrock account:
          </p>

          {/* Big Code Card */}
          <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Your Verification Code:
            </span>
            <div className="font-mono text-3xl sm:text-4xl font-black text-amber-400 tracking-widest select-all">
              {authData.userCode}
            </div>
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700 cursor-pointer shadow-xs active:scale-95"
            >
              {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Code Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* Account selection stays in the user's control; no browser session is signed out. */}
          <div className="p-3.5 rounded-xl bg-sky-50/80 border border-sky-200/90 text-left space-y-1.5">
            <div className="flex items-center gap-1.5 text-sky-900 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Choose the Microsoft account for this Bedrock link</span>
            </div>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              Microsoft will show its account chooser. Select <b>Use another account</b> if needed; PebbleAFK won&apos;t sign out your browser.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <a
              href={directRemoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer active:scale-98"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Microsoft Sign-In</span>
            </a>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={handleCopyLink}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition border cursor-pointer flex items-center justify-center gap-1.5 ${
                  copiedLink
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 shadow-2xs'
                }`}
                title="Copy the Microsoft account-selection link"
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Microsoft Sign-In Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
