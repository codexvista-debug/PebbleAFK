'use client';

import React, { useState, useMemo } from 'react';
import { BedrockAccount, MAX_BEDROCK_ACCOUNTS } from '../types';
import { X, UserPlus, Trash2, CheckCircle2, ShieldCheck, Sparkles, ExternalLink, KeyRound, AlertTriangle, RefreshCw } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BedrockAccount[];
  onStartMicrosoftLogin: (target?: BedrockAccount | string) => void;
  onDeleteAccount: (id: string) => Promise<void>;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onStartMicrosoftLogin,
  onDeleteAccount,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expectedIgnInput, setExpectedIgnInput] = useState('');
  const [deletingAccount, setDeletingAccount] = useState<BedrockAccount | null>(null);

  // Accounts list: include verified accounts and any accounts with mismatch/auth errors
  const displayAccounts = useMemo(() => {
    return accounts.filter((a) => a.verified || Boolean(a.authError));
  }, [accounts]);

  if (!isOpen) return null;

  const verifiedCount = accounts.filter((a) => a.verified).length;
  const isLimitReached = verifiedCount >= MAX_BEDROCK_ACCOUNTS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">Bedrock Accounts</h2>
              <span className="text-[11px] text-emerald-700 font-semibold">Official Bedrock Edition (Microsoft Linked)</span>
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
        <div className="p-6 overflow-y-auto space-y-4">
          {!showAddForm ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 font-semibold">
                  {verifiedCount}/{MAX_BEDROCK_ACCOUNTS} accounts {isLimitReached ? '(Limit Reached)' : 'linked'}
                </span>
                <button
                  disabled={isLimitReached}
                  onClick={() => {
                    setExpectedIgnInput('');
                    setShowAddForm(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  title={isLimitReached ? `Maximum of ${MAX_BEDROCK_ACCOUNTS} accounts reached` : 'Add Bedrock Account'}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isLimitReached ? `${MAX_BEDROCK_ACCOUNTS}/${MAX_BEDROCK_ACCOUNTS} Limit` : '+ Add Account'}
                </button>
              </div>

              {displayAccounts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl bg-slate-50/50 p-6 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-800">No linked Bedrock accounts yet</div>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Link your official Minecraft Bedrock account with one-click Microsoft sign-in.
                  </p>
                  <button
                    onClick={() => {
                      setExpectedIgnInput('');
                      setShowAddForm(true);
                    }}
                    className="mt-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
                  >
                    + Add Account
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayAccounts.map((acc) => {
                    const displayName = acc.ign || acc.expectedIgn || acc.username || 'BedrockPlayer';
                    const rawName = displayName.includes('@') ? displayName.split('@')[0] : displayName;
                    const idOrName = acc.uuid || rawName;
                    const primaryAvatarUrl = `https://crafthead.net/helm/${encodeURIComponent(idOrName)}/48`;
                    const hasError = Boolean(acc.authError);

                    return (
                      <div
                        key={acc.id}
                        className={`p-3.5 rounded-xl border ${
                          hasError ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200 bg-white hover:border-slate-300'
                        } flex items-center justify-between gap-3 transition shadow-2xs`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Player Head Skin Avatar */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-300 shrink-0 bg-slate-100 shadow-2xs">
                            <img
                              src={primaryAvatarUrl}
                              alt={rawName}
                              className="w-full h-full object-cover [image-rendering:pixelated]"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                if (!img.src.includes('mc-heads')) {
                                  img.src = `https://mc-heads.net/avatar/${encodeURIComponent(idOrName)}/48`;
                                } else if (!img.src.includes('minotar')) {
                                  img.src = `https://minotar.net/helm/${encodeURIComponent(rawName)}/48.png`;
                                } else {
                                  img.src = 'https://minotar.net/helm/MHF_Steve/48.png';
                                }
                              }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-xs text-slate-900 truncate">
                                {displayName}
                              </span>

                              {hasError ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                                  Verification Failed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  Verified Bedrock
                                </span>
                              )}
                            </div>

                            {hasError ? (
                              <div className="text-[11px] text-rose-600 font-medium leading-tight mt-1 bg-white/70 p-1.5 rounded-lg border border-rose-100">
                                {acc.authError}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                                Bedrock Edition &bull; Synced with Supabase & Termux
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions: Re-link on error + Delete */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasError && (
                            <button
                              onClick={() => {
                                onStartMicrosoftLogin(acc);
                              }}
                              className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                              title="Re-verify with correct Microsoft account"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Re-link</span>
                            </button>
                          )}

                          <button
                            onClick={() => setDeletingAccount(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="Unlink Bedrock Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Microsoft Sign-In Form with Optional Target Gamertag Guard */
            <div className="space-y-4 bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <KeyRound className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Official Microsoft Authentication
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Sign in with your Microsoft account (normal or incognito/private tab). We automatically retrieve your official Minecraft Bedrock Gamertag, skin head, and XUID.
                </p>
              </div>

              {/* Optional Target Gamertag input to protect against signing into the wrong account */}
              <div className="text-left space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-700">
                  Target Bedrock Gamertag (Optional)
                </label>
                <input
                  type="text"
                  value={expectedIgnInput}
                  onChange={(e) => setExpectedIgnInput(e.target.value)}
                  placeholder="e.g. SteveBedrock (Prevents accidental login as another account)"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 font-mono font-medium focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
                <p className="text-[10px] text-slate-400 leading-normal">
                  If set, PebbleAFK ensures you don&apos;t accidentally sign in with a different account.
                </p>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-left text-[11px] text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  No Password Required
                </div>
                <p className="text-emerald-700 leading-normal">
                  You never enter your password on PebbleAFK. Microsoft handles authentication safely on their official servers.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = expectedIgnInput.trim() || undefined;
                    setShowAddForm(false);
                    onStartMicrosoftLogin(target);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Login with Microsoft</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Modern In-App Confirm Unlink Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingAccount)}
        title="Unlink Bedrock Account"
        message={`Are you sure you want to unlink @${deletingAccount?.ign || deletingAccount?.expectedIgn || deletingAccount?.username}? This will remove it from PebbleAFK and Termux.`}
        confirmText="Unlink Account"
        cancelText="Cancel"
        isDestructive
        onConfirm={async () => {
          if (deletingAccount) {
            await onDeleteAccount(deletingAccount.id);
          }
          setDeletingAccount(null);
        }}
        onCancel={() => setDeletingAccount(null)}
      />
    </div>
  );
};
