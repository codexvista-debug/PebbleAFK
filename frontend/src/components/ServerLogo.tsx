'use client';

import React, { useState, useEffect } from 'react';

interface ServerLogoProps {
  host: string;
  name: string;
  size?: string;
  className?: string;
}

export const ServerLogo: React.FC<ServerLogoProps> = ({
  host,
  name,
  size = 'w-7 h-7',
  className = '',
}) => {
  const [useFallback, setUseFallback] = useState(false);
  const [useInitial, setUseInitial] = useState(false);

  const cleanHost = (host || '').trim().split(':')[0];

  useEffect(() => {
    setUseFallback(false);
    setUseInitial(false);
  }, [host]);

  if (!cleanHost || useInitial) {
    return (
      <div
        className={`${size} rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 flex items-center justify-center text-xs font-black shrink-0 ${className}`}
      >
        {name ? name.charAt(0).toUpperCase() : 'S'}
      </div>
    );
  }

  const primaryUrl = `https://api.mcsrvstat.us/icon/${encodeURIComponent(cleanHost)}`;
  const fallbackUrl = `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(cleanHost)}`;
  const src = useFallback ? fallbackUrl : primaryUrl;

  return (
    <div
      className={`${size} rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 shadow-2xs ${className}`}
    >
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover [image-rendering:pixelated]"
        onError={() => {
          if (!useFallback) {
            setUseFallback(true);
          } else {
            setUseInitial(true);
          }
        }}
      />
    </div>
  );
};
