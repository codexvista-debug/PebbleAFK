'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ServerProfile, DEFAULT_BOT_SETTINGS, FRESHSMP_DEFAULT_BOT_SETTINGS } from '../types';
import { X, Info, ChevronDown, Check } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface ServerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverProfiles: ServerProfile[];
  initialProfile?: ServerProfile | null;
  currentUser?: string | null;
  onSaveProfile: (profile: ServerProfile) => Promise<void>;
  onDeleteProfile?: (profileId: string) => Promise<void>;
}

const BEDROCK_VERSIONS = [
  { label: 'Auto Detect (Recommended)', value: 'auto' },
  { label: '1.26.30 (Bedrock 26.x)', value: '1.26.30' },
  { label: '1.26.51 (Bedrock Preview)', value: '1.26.51' },
  { label: '1.21.50 (Bedrock 1.21 Stable)', value: '1.21.50' },
  { label: '1.21.40', value: '1.21.40' },
  { label: '1.21.30', value: '1.21.30' },
  { label: '1.21.20', value: '1.21.20' },
  { label: '1.21.2', value: '1.21.2' },
  { label: '1.21.0', value: '1.21.0' },
  { label: '1.20.80', value: '1.20.80' },
  { label: '1.20.70', value: '1.20.70' },
  { label: '1.20.60', value: '1.20.60' },
  { label: '1.20.50', value: '1.20.50' },
  { label: '1.20.40', value: '1.20.40' },
  { label: '1.20.30', value: '1.20.30' },
  { label: '1.20.10', value: '1.20.10' },
  { label: '1.20.0', value: '1.20.0' },
];

const POPULAR_BEDROCK_SETUPS = [
  { name: 'FreshSMP', host: 'play.freshsmp.fun', port: 19132, version: 'auto' },
  { name: 'DonutSMP', host: 'bedrock.donutsmp.net', port: 19132, version: 'auto' },
];

const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');

export const ServerProfileModal: React.FC<ServerProfileModalProps> = ({
  isOpen,
  onClose,
  serverProfiles,
  initialProfile,
  currentUser,
  onSaveProfile,
  onDeleteProfile,
}) => {
  const [serverHost, setServerHost] = useState('');
  const [serverVersion, setServerVersion] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [showBrowseSetups, setShowBrowseSetups] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  const wasOpenRef = useRef(false);
  const activeProfileIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    const profileChanged = initialProfile?.id !== activeProfileIdRef.current;

    if (isOpen && (justOpened || profileChanged)) {
      setShowBrowseSetups(false);
      setFormError('');
      if (initialProfile) {
        setServerHost(initialProfile.serverHost || '');
        setServerVersion(initialProfile.serverVersion || 'auto');
      } else {
        setServerHost('');
        setServerVersion('auto');
      }
    }

    wasOpenRef.current = isOpen;
    activeProfileIdRef.current = initialProfile?.id;
  }, [isOpen, initialProfile]);

  if (!isOpen) return null;

  const selectedSetup = POPULAR_BEDROCK_SETUPS.find((setup) => normalizeHost(setup.host) === normalizeHost(serverHost));
  const legacyProfile = Boolean(initialProfile && !selectedSetup);
  const isSetupAlreadyAdded = (setup: typeof POPULAR_BEDROCK_SETUPS[number]) => serverProfiles.some((profile) =>
    profile.id !== initialProfile?.id && (
      normalizeHost(profile.serverHost) === normalizeHost(setup.host) ||
      (profile.name || '').trim().toLowerCase() === setup.name.toLowerCase()
    )
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!selectedSetup) {
      setFormError('Only FreshSMP and DonutSMP profiles are supported right now.');
      return;
    }

    if (isSetupAlreadyAdded(selectedSetup)) {
      setFormError(`${selectedSetup.name} already has a profile on this account.`);
      return;
    }

    const effectiveName = selectedSetup.name;
    const isFreshSmp = selectedSetup.name === 'FreshSMP';
    const effectiveAccountId = initialProfile ? (initialProfile.accountId || '') : '';
    const effectiveAssignedAccountIds = initialProfile
      ? (initialProfile.assignedAccountIds || (initialProfile.accountId ? [initialProfile.accountId] : []))
      : [];

    setLoading(true);
    try {
      const profile: ServerProfile = {
        id: initialProfile?.id || `srv_${Math.random().toString(36).substring(2, 9)}`,
        name: effectiveName,
        pebbleUser: currentUser || initialProfile?.pebbleUser,
        accountId: effectiveAccountId,
        assignedAccountIds: effectiveAssignedAccountIds,
        serverHost: selectedSetup.host,
        serverPort: selectedSetup.port,
        serverVersion: serverVersion || selectedSetup.version,
        authType: 'microsoft',
        autoReconnect: initialProfile?.autoReconnect ?? true,
        settings: initialProfile?.settings || {
          ...(isFreshSmp ? FRESHSMP_DEFAULT_BOT_SETTINGS : DEFAULT_BOT_SETTINGS),
        },
      };

      await onSaveProfile(profile);
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this server profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSetup = (setup: typeof POPULAR_BEDROCK_SETUPS[0]) => {
    if (isSetupAlreadyAdded(setup)) return;
    setServerHost(setup.host);
    setServerVersion(setup.version);
    setShowBrowseSetups(false);
  };

  const isEditing = !!initialProfile;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div>
            <h2 className="font-extrabold text-base text-slate-900 tracking-tight">
              {isEditing ? 'Edit Server Profile' : 'Add a server'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              For now, profiles are limited to FreshSMP and DonutSMP, with one profile per server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Server IP + Browse setups */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Server IP
            </label>
            <div className="flex gap-2 relative">
              <input
                type="text"
                required
                value={serverHost}
                readOnly
                placeholder="Choose FreshSMP or DonutSMP"
                className="flex-1 bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none transition shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowBrowseSetups(!showBrowseSetups)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs"
              >
                <span>Browse setups</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showBrowseSetups ? 'rotate-180' : ''}`} />
              </button>

              {/* Browse Setups Dropdown Popover */}
              {showBrowseSetups && (
                <div className="absolute right-0 top-12 z-20 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                    Supported Servers
                  </div>
                  {POPULAR_BEDROCK_SETUPS.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => handleSelectSetup(s)}
                      disabled={isSetupAlreadyAdded(s)}
                      className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 hover:text-emerald-800 transition flex items-center justify-between text-xs cursor-pointer group disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-emerald-700">{s.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{isSetupAlreadyAdded(s) ? 'Already added' : s.host}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Profile Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Profile name</label>
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
              {selectedSetup?.name || (legacyProfile ? `${initialProfile?.name} (unsupported legacy profile)` : 'Select a supported server above')}
            </div>
          </div>

          {legacyProfile && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">This existing profile is outside the current FreshSMP/DonutSMP test scope. Delete it before creating a supported profile.</p>}
          {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">{formError}</p>}

          {/* 2-Column: Bedrock Version & Fixed Bedrock Port */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Bedrock version */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-slate-700">
                <span>Bedrock version</span>
                <Info className="w-3.5 h-3.5 text-slate-400" />
              </label>
              <div className="relative">
                <select
                  value={serverVersion}
                  onChange={(e) => setServerVersion(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none transition cursor-pointer appearance-none shadow-2xs"
                >
                  <option value="auto">Auto Detect (server ping)</option>
                  {BEDROCK_VERSIONS.filter(v => v.value !== 'auto').map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>
              {(!serverVersion || serverVersion === 'auto') && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                  <span>✓ Uses the server-advertised Bedrock protocol when available.</span>
                </p>
              )}
            </div>

            {/* Supported profiles use the standard Bedrock port. */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-slate-700">
                <span>Bedrock port</span>
                <Info className="w-3.5 h-3.5 text-slate-400" />
              </label>
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-mono font-bold text-slate-700">19132</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !selectedSetup || legacyProfile || isSetupAlreadyAdded(selectedSetup)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5 ml-auto"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Creating...' : isEditing ? 'Save Changes' : 'Create server'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation if Editing */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Server Profile"
        message={`Are you sure you want to delete server profile "${initialProfile?.name || selectedSetup?.name || 'this profile'}"? This action cannot be undone.`}
        confirmText="Delete Profile"
        cancelText="Cancel"
        isDestructive
        onConfirm={async () => {
          if (onDeleteProfile && initialProfile) {
            await onDeleteProfile(initialProfile.id);
          }
          setShowDeleteConfirm(false);
          onClose();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
