import React from 'react';

interface BrandMarkProps {
  className?: string;
  title?: string;
}

/** A compact pebble with an always-on signal, designed for small UI surfaces. */
export function BrandMark({ className = '', title = 'PebbleAFK' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pebbleafk-mark" x1="5" y1="3" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#pebbleafk-mark)" />
      <path d="M8 19.5C8 15.91 10.91 13 14.5 13H17.5C21.09 13 24 15.91 24 19.5C24 22.54 21.54 25 18.5 25H13.5C10.46 25 8 22.54 8 19.5Z" fill="#ECFDF5" fillOpacity="0.96" />
      <path d="M11.5 18.75C11.5 17.78 12.28 17 13.25 17H18.75C19.72 17 20.5 17.78 20.5 18.75V21.25C20.5 22.22 19.72 23 18.75 23H13.25C12.28 23 11.5 22.22 11.5 21.25V18.75Z" fill="#0F766E" />
      <circle cx="14.5" cy="20" r="1" fill="#A7F3D0" />
      <path d="M21.25 7.25C23.04 8.13 24.25 9.97 24.25 12.1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.75 8.9C19.89 9.46 20.65 10.63 20.65 11.98" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17.25" cy="11.9" r="1.2" fill="white" />
    </svg>
  );
}
