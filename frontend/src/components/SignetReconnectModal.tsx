'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Zap, Copy, Check, X, Terminal, ShieldAlert } from 'lucide-react';

interface SignetReconnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  daemonStatus: 'AUTHENTICATED' | 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'AUTH_ERROR';
  daemonUrl?: string;
  onReconnectNow: () => void;
  termuxCommand: string;
  reconnectAttempt?: number;
}

export const SignetReconnectModal: React.FC<SignetReconnectModalProps> = ({
  isOpen,
  onClose,
  daemonStatus,
  daemonUrl,
  onReconnectNow,
  termuxCommand,
  reconnectAttempt = 1,
}) => {
  const [copied, setCopied] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(25);
  const isAuthenticated = daemonStatus === 'AUTHENTICATED';
  const isConnecting = daemonStatus === 'CONNECTING' || daemonStatus === 'CONNECTED';

  useEffect(() => {
    if (!isOpen) {
      setReconnectCountdown(25);
      return;
    }
    if (isAuthenticated) return;

    const timer = setInterval(() => {
      setReconnectCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, isAuthenticated]);

  const handleCopyCommand = async () => {
    if (!termuxCommand) return;
    try {
      await navigator.clipboard.writeText(termuxCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signet-reconnect-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className={`relative w-full max-w-[480px] overflow-hidden rounded-2xl border-2 transition-all duration-300 shadow-2xl ${
          isAuthenticated
            ? 'border-emerald-500 bg-gradient-to-b from-[#1b341f] via-[#142318] to-[#0f1a12] shadow-[0_0_40px_rgba(16,185,129,0.35)]'
            : 'border-emerald-500/80 bg-gradient-to-b from-[#222a1f] via-[#191e16] to-[#121610] shadow-[0_0_40px_rgba(84,158,55,0.25)]'
        }`}
      >
        {/* Animated Top Accent Bar */}
        <div
          className={`h-1.5 w-full transition-all duration-500 ${
            isAuthenticated
              ? 'bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500'
              : 'bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-600 animate-pulse'
          }`}
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss reconnection notification"
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          {/* Header Row with Signet Allay Mascot */}
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <div
                className={`relative w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                  isAuthenticated
                    ? 'bg-emerald-950/80 border-emerald-400/90 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'bg-black/40 border-emerald-500/60 shadow-[0_0_15px_rgba(84,158,55,0.3)]'
                }`}
              >
                <img
                  src="/nav/daemon-allay-active.png"
                  alt="Signet mascot"
                  className={`w-11 h-11 object-contain transition-transform duration-300 ${
                    isAuthenticated ? 'scale-110 drop-shadow-[0_0_8px_#34d399]' : 'animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]'
                  }`}
                  style={{ animationDuration: isAuthenticated ? '0s' : '2.2s' }}
                />
              </div>
              {/* Status Ping Badge */}
              <div
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#191e16] flex items-center justify-center ${
                  isAuthenticated
                    ? 'bg-emerald-500'
                    : 'bg-amber-400 animate-ping'
                }`}
              />
            </div>

            <div className="flex-1 min-w-0 pr-6">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-mono font-bold tracking-wider text-emerald-300 uppercase mb-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>PebbleAFK · Signet Autopilot</span>
              </div>
              <h2
                id="signet-reconnect-title"
                className="text-base font-extrabold text-white tracking-tight leading-snug"
              >
                {isAuthenticated
                  ? 'Termux Daemon Reconnected!'
                  : isConnecting
                  ? 'Reconnecting to Termux Daemon...'
                  : 'Reconnecting to Termux Daemon...'}
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {isAuthenticated
                  ? 'WebSocket authenticated! Live bots and chat stream are synchronized.'
                  : 'Detected browser wakeup after being AFK. Signet is auto-restoring your real-time WebSocket connection to Termux.'}
              </p>
            </div>
          </div>

          {/* Connection Diagnostics Card */}
          <div className="mt-4 p-3.5 rounded-xl bg-black/40 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                )}
                <span className={isAuthenticated ? 'text-emerald-300 font-bold' : 'text-slate-200'}>
                  {isAuthenticated
                    ? 'Active & Authenticated'
                    : daemonStatus === 'CONNECTED'
                    ? 'Authenticating session token...'
                    : 'Restoring WebSocket connection...'}
                </span>
              </div>
              {!isAuthenticated && (
                <span className="text-[11px] text-slate-400">
                  Attempt #{reconnectAttempt}
                </span>
              )}
            </div>

            {daemonUrl && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 truncate bg-black/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <span className="text-emerald-400 select-none">wss://</span>
                <span className="truncate text-slate-300">
                  {daemonUrl.replace(/^wss?:\/\//, '')}
                </span>
              </div>
            )}
          </div>

          {/* Fallback Launcher Hint if Termux was killed in background */}
          {!isAuthenticated && reconnectCountdown <= 10 && (
            <div className="mt-3.5 p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-xs text-amber-200/90 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  Termux may have been stopped by your device's battery optimizer. You can re-launch it with your 1-click command:
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/60 px-2.5 py-1.5 rounded-lg border border-amber-600/30 text-[11px] font-mono text-amber-300 truncate">
                  {termuxCommand || 'curl -sL https://pebbleafk.vercel.app/install | bash'}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCommand}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-700/80 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              {isAuthenticated ? 'Close' : 'Dismiss'}
            </button>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={onReconnectNow}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>Reconnect Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
