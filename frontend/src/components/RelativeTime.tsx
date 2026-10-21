'use client';

import React, { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      listeners.forEach((notify) => notify());
    }, 5000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function getSnapshot() {
  return Math.floor(Date.now() / 5000);
}

function getServerSnapshot() {
  return 0;
}

export function formatRelativeTime(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface RelativeTimeProps {
  timestamp: number;
  className?: string;
}

export function RelativeTime({ timestamp, className }: RelativeTimeProps) {
  const clockTick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = clockTick === 0 ? 0 : clockTick * 5000;
  const date = new Date(timestamp);

  return (
    <time
      dateTime={Number.isFinite(timestamp) ? date.toISOString() : undefined}
      title={Number.isFinite(timestamp) ? date.toISOString() : undefined}
      className={className}
    >
      {formatRelativeTime(timestamp, now)}
    </time>
  );
}
