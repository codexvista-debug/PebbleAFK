'use client';

import React, { useState } from 'react';
import { X, Network, Check, Copy, Terminal, ChevronDown, RotateCw, Power } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  daemonUrl: string;
  authToken: string;
  onSaveDaemonSettings: (url: string, token: string) => void;
  termuxCommand?: string;
  onRestartDaemon?: () => void;
  onUpdateDaemon?: () => void;
  onShutdownDaemon?: () => boolean;
  isDaemonOnline?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  daemonUrl,
  authToken,
  onSaveDaemonSettings,
  termuxCommand = 'curl -sL https://pebbleafk.vercel.app/install | bash',
  onRestartDaemon,
  onUpdateDaemon,
  onShutdownDaemon,
  isDaemonOnline = false,
}) => {
  const [urlInput, setUrlInput] = useState(daemonUrl);
  const [tokenInput, setTokenInput] = useState(authToken);
  const [isSaved, setIsSaved] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartSuccess, setRestartSuccess] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  React.useEffect(() => {
    setUrlInput(daemonUrl);
  }, [daemonUrl]);

  React.useEffect(() => {
    setTokenInput(authToken);
  }, [authToken]);

  if (!isOpen) return null;

  const handleRestart = async () => {
    if (!onRestartDaemon || isRestarting) return;
    setIsRestarting(true);
    setRestartSuccess(false);
    try {
      await onRestartDaemon();
      setRestartSuccess(true);
      setTimeout(() => setRestartSuccess(false), 3000);
    } finally {
      setTimeout(() => setIsRestarting(false), 1200);
    }
  };

  const handleUpdate = async () => {
    if (!onUpdateDaemon || isUpdating) return;
    setIsUpdating(true);
    setUpdateSuccess(false);
    try {
      await onUpdateDaemon();
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 4000);
    } finally {
      setTimeout(() => setIsUpdating(false), 2000);
    }
  };

  const handleShutdown = () => {
    if (!onShutdownDaemon || isShuttingDown) return;
    const confirmed = typeof window !== 'undefined' && window.confirm(
      'Fully shut down the Termux daemon? This will stop the Minecraft accounts, Cloudflare tunnel, and remove this device’s active tunnel from PebbleAFK.'
    );
    if (!confirmed) return;
    setIsShuttingDown(true);
    if (!onShutdownDaemon()) {
      setIsShuttingDown(false);
      return;
    }
  };

  const handleCopyCommand = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(termuxCommand);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2500);
    }
  };

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDaemonSettings(urlInput.trim(), tokenInput.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 shadow-2xs">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-900">Termux Daemon Bridge</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                    isDaemonOnline
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isDaemonOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {isDaemonOnline ? 'Online' : 'Standby'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Connect and sync your Android Termux Bedrock runner</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Section 1: Android Termux 1-Click Launcher */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Terminal className="w-4 h-4 text-emerald-600" />
              <span>Android Termux 1-Click Launcher</span>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 p-4 rounded-2xl border border-emerald-200/90 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <span>📱</span> Run this command in Termux:
                </span>
                <div className="flex items-center gap-2">
                  {onUpdateDaemon && isDaemonOnline && (
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={isUpdating}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                        updateSuccess
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                      }`}
                      title="Fetch latest updates from GitHub and restart"
                    >
                      <RotateCw
                        className={`w-3.5 h-3.5 ${
                          isUpdating
                            ? 'animate-spin text-sky-600'
                            : updateSuccess
                            ? 'text-emerald-600'
                            : 'text-sky-600'
                        }`}
                      />
                      <span>
                        {isUpdating
                          ? 'Updating...'
                          : updateSuccess
                          ? 'Update Triggered!'
                          : 'Update Engine'}
                      </span>
                    </button>
                  )}
                  {onRestartDaemon && (
                    <button
                      type="button"
                      onClick={handleRestart}
                      disabled={isRestarting || !isDaemonOnline}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                        restartSuccess
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : isDaemonOnline
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                      title={
                        isDaemonOnline
                          ? 'Reboot daemon & reset all Bedrock bot connections'
                          : 'Daemon is offline. Run the command in Termux first.'
                      }
                    >
                      <RotateCw
                        className={`w-3.5 h-3.5 ${
                          isRestarting
                            ? 'animate-spin text-amber-600'
                            : restartSuccess
                            ? 'text-emerald-600'
                            : isDaemonOnline
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>
                        {isRestarting
                          ? 'Restarting...'
                          : restartSuccess
                          ? 'Daemon Restarted!'
                          : 'Restart Daemon'}
                      </span>
                    </button>
                  )}
                  {onShutdownDaemon && (
                    <button
                      type="button"
                      onClick={handleShutdown}
                      disabled={isShuttingDown || !isDaemonOnline}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 text-xs font-bold transition shadow-xs cursor-pointer disabled:cursor-not-allowed active:scale-95"
                      title="Stop the full Termux daemon stack and remove its active tunnel"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{isShuttingDown ? 'Shutting Down...' : 'Shut Down'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                  >
                    {copiedCommand ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCommand ? 'Copied to Clipboard!' : 'Copy Command'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200/90 font-mono text-[11px] text-slate-800 break-all select-all shadow-inner leading-relaxed">
                {termuxCommand}
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed flex items-center gap-1">
                <span className="text-emerald-700 font-bold">✨ Auto-Sync:</span>
                <span>Termux will automatically sync your tunnel to this dashboard with zero copy-pasting.</span>
              </div>
            </div>
          </div>

          {/* Section 2: Manual Tunnel URL (Collapsed by default accordion) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 transition">
            <button
              type="button"
              onClick={() => setIsManualExpanded(!isManualExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-slate-500" />
                <span>Manual Tunnel URL (Optional Fallback)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <span>{isManualExpanded ? 'Hide' : 'Configure'}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isManualExpanded ? 'rotate-180 text-emerald-600' : 'text-slate-400'
                  }`}
                />
              </div>
            </button>

            {isManualExpanded && (
              <form onSubmit={handleSaveConnection} className="p-4 pt-2 space-y-3.5 border-t border-slate-200 bg-white">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WebSocket Tunnel URL (from `cloudflared`)
                  </label>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="wss://your-tunnel.trycloudflare.com"
                    className="w-full bg-slate-50/60 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 transition shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Paste the secure <code className="text-emerald-700 font-mono">wss://</code> address output by your Cloudflare tunnel on Termux.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daemon Secret Token (optional, from daemon .env)
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Leave empty if no auth token is set in Termux"
                    className="w-full bg-slate-50/60 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 transition shadow-2xs"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                  >
                    {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
                    <span>{isSaved ? 'Saved!' : 'Save & Connect'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer border border-slate-200 shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
