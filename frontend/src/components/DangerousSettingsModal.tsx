'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { ServerProfile, BotSettings } from '../types';

interface DangerousSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: ServerProfile | null;
  onToggleSetting: (key: keyof BotSettings, value: boolean) => void;
  onDeleteServer: (serverId: string) => void;
}

export const DangerousSettingsModal: React.FC<DangerousSettingsModalProps> = ({
  isOpen,
  onClose,
  server,
  onToggleSetting,
  onDeleteServer,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen || !server) return null;

  const physicsEnabled = server.settings?.physics ?? true;
  const resourcePacksEnabled = server.settings?.acceptResourcePacks ?? true;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDeleteServer(server.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>Dangerous settings</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Settings for this server profile that are easy to get wrong and hard to undo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-5 space-y-5">
          {/* 1. Physics */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-900 block">Physics</span>
              <p className="text-xs text-slate-500">
                Be affected by gravity, water and etc.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-xl mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>Disable at your own risk. Servers might ban you with physics disabled.</span>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => onToggleSetting('physics', !physicsEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                physicsEnabled ? 'bg-emerald-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  physicsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2. Resource packs */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-900 block">Resource packs</span>
              <p className="text-xs text-slate-500">
                Automatically accept resource packs on join.
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => onToggleSetting('acceptResourcePacks', !resourcePacksEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                resourcePacksEnabled ? 'bg-emerald-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  resourcePacksEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 3. Delete server profile */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div>
              <span className="text-xs font-bold text-slate-900 block">Delete server profile</span>
              <p className="text-xs text-slate-500">
                Permanently delete this server profile.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDelete}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                confirmDelete
                  ? 'bg-rose-700 text-white animate-pulse'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-600 hover:text-white'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmDelete ? 'Confirm Delete?' : 'Delete server'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
