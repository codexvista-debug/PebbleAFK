'use client';

import React from 'react';
import { AlertTriangle, Power, X } from 'lucide-react';

interface ShutdownConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ShutdownConfirmDialog: React.FC<ShutdownConfirmDialogProps> = ({ open, onCancel, onConfirm }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shutdown-dialog-title"
        aria-describedby="shutdown-dialog-description"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700">
              <Power className="h-5 w-5" />
            </div>
            <div>
              <h2 id="shutdown-dialog-title" className="text-sm font-bold text-slate-900">Shut down Termux daemon?</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">This will stop this device’s PebbleAFK runner.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation"
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <p id="shutdown-dialog-description" className="text-sm leading-relaxed text-slate-600">
            Minecraft accounts and the Cloudflare tunnel will stop, and this device’s active tunnel will be removed from PebbleAFK.
          </p>
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Accounts on this Termux daemon will disconnect until it is started again.</span>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.98]"
          >
            <Power className="h-3.5 w-3.5" />
            Shut Down
          </button>
        </footer>
      </section>
    </div>
  );
};
