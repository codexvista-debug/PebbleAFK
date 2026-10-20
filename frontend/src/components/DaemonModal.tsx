'use client';

import React, { useState } from 'react';
import { X, Radio, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck } from 'lucide-react';
import { SocketStatus } from '../types';

interface DaemonModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SocketStatus;
  daemonUrl: string;
  onUpdateDaemonUrl: (url: string) => void;
  authToken: string;
  onUpdateAuthToken: (token: string) => void;
  latency: number | null;
  onReconnect: () => void;
}

export const DaemonModal: React.FC<DaemonModalProps> = ({
  isOpen,
  onClose,
  status,
  daemonUrl,
  onUpdateDaemonUrl,
  authToken,
  onUpdateAuthToken,
  latency,
  onReconnect,
}) => {
  const [urlInput, setUrlInput] = useState(daemonUrl);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateDaemonUrl(urlInput.trim());
    onUpdateAuthToken(tokenInput.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onReconnect();
    }, 400);
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'AUTHENTICATED':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Daemon Connected & Authenticated</span>
            {latency !== null && (
              <span className="ml-auto font-mono text-[10px] text-emerald-600 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                {latency}ms
              </span>
            )}
          </div>
        );
      case 'CONNECTED':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Authenticating with Daemon...</span>
          </div>
        );
      case 'CONNECTING':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
            <span>Connecting to Daemon WebSocket...</span>
          </div>
        );
      case 'AUTH_ERROR':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>Authentication Failed (Check Secret Token)</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Disconnected (Daemon not reachable)</span>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">Bedrock Daemon Bridge</h2>
              <span className="text-[10px] text-slate-500 font-medium">Local Node.js or Termux Cloudflare Tunnel</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Live Connection Status</label>
            {getStatusBadge()}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Daemon WebSocket URL
            </label>
            <input
              type="text"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="ws://localhost:8080 or wss://tunnel.trycloudflare.com"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white shadow-2xs"
            />
            <span className="text-[10px] text-slate-500 block mt-1">
              Use <code>ws://localhost:8080</code> for local test or <code>wss://...</code> when tunneling from phone.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Daemon Auth Token (Optional)
            </label>
            <div className="relative">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Leave blank if DAEMON_AUTH_TOKEN is disabled"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white shadow-2xs"
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Save & Connect</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onReconnect}
              className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Force Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
