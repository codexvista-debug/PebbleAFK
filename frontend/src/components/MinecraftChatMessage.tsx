'use client';

import React from 'react';
import { ChatMessage } from '../types';

interface MinecraftChatMessageProps {
  message: ChatMessage | any;
  showTimestamp?: boolean;
  compact?: boolean;
}

// Brightened rank colors remain distinct and legible on the dark chat surface.
const DARK_RANK_COLORS: Record<string, string> = {
  IRON: '#c9c3ba', GOLD: '#ffc166', DIAMOND: '#72c9ff', EMERALD: '#76e6b1',
  NETHERITE: '#c1b9af', DONUT: '#ff9d68', FRESH: '#76e6b1', CHIEF: '#c49aff',
  TITAN: '#72c9ff', KING: '#ffc166', CHAMPION: '#ffb078', KNIGHT: '#83b5ff',
  EMPEROR: '#c49aff', 'OVERLORD++': '#c49aff', OVERLORD: '#c49aff', LORD: '#c49aff',
  JESTER: '#ff91dc', 'JESTER+': '#ff91dc', MEMBER: '#c1b9af', VIP: '#76e6b1',
  'VIP+': '#76e6b1', MVP: '#72e5ed', 'MVP+': '#72c9ff', MEDIA: '#ff849d',
  YOUTUBE: '#ff849d', STREAMER: '#d995ff', HELPER: '#72e5ed', STAFF: '#ff8181',
  ADMIN: '#ff8181', OWNER: '#ff8181', MOD: '#76e6b1', DEFAULT: '#d1c9c0',
};

const DARK_MC_COLORS: Record<string, string> = {
  '0': '#c9c0b6', '1': '#78a8ff', '2': '#78df86', '3': '#66d9d1',
  '4': '#ff7777', '5': '#d995ff', '6': '#ffc166', '7': '#e2d9ce',
  '8': '#b7aea4', '9': '#83b5ff', 'a': '#76e68a', 'b': '#72e5ed',
  'c': '#ff8181', 'd': '#ff91dc', 'e': '#ffe477', 'f': '#fffaf2',
  'g': '#ffdc70', 'h': '#e1ded8', 'i': '#c9c3ba', 'j': '#b7aea4',
  'm': '#ff7777', 'n': '#ffb078', 'p': '#ffc166', 'q': '#78df86',
  's': '#72e5ed', 't': '#83b5ff', 'u': '#d995ff',
};

export function parseLightMinecraftColorCodes(text: string): React.ReactNode {
  if (!text) return null;
  if (!text.includes('§')) return text;

  const parts = text.split(/(§[0-9a-fk-orxghijpqstu])/gi);
  let currentColor = '#f2eee8';
  let isBold = false;
  let isItalic = false;

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('§')) {
      const code = part.charAt(1).toLowerCase();
      if (DARK_MC_COLORS[code]) {
        currentColor = DARK_MC_COLORS[code];
      } else if (code === 'l') {
        isBold = true;
      } else if (code === 'o') {
        isItalic = true;
      } else if (code === 'r') {
        currentColor = '#f2eee8';
        isBold = false;
        isItalic = false;
      }

      if (part.length === 2) return null;

      const remaining = part.slice(2);
      if (!remaining) return null;
      return (
        <span
          key={index}
          style={{
            color: currentColor,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
          }}
        >
          {remaining}
        </span>
      );
    }
    return (
      <span
        key={index}
        style={{
          color: currentColor,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
        }}
      >
        {part}
      </span>
    );
  });
}

export function stripMinecraftFormatting(text: string): string {
  if (!text) return '';
  return text
    .replace(/<\/?(?:span|div|b|i|u|p|br|strong|em|font|a)\b[^>]*>/gi, '')
    .replace(/§[0-9a-fk-orxghijpqstu]/gi, '')
    .replace(/§/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export const MinecraftChatMessage: React.FC<MinecraftChatMessageProps> = ({
  message,
  showTimestamp = true,
  compact = false,
}) => {
  let rawText = message.message || message.raw || message.formattedText || '';

  // Clean out Unicode replacement diamonds
  rawText = rawText.replace(/[\uFFFD\u25C6\u25C7]/g, '').trim();
  const cleanText = stripMinecraftFormatting(rawText);
  const cleanSender = stripMinecraftFormatting(message.sender || '');

  // Compact timestamp for mobile screens vs full on desktop
  const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
  const timeShort = timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  const timeFull = timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 0. Session divider / new session line
  const isSessionDivider =
    message.type === 'session_divider' ||
    message.sender === 'SessionDivider' ||
    message.isSessionDivider ||
    cleanText.startsWith('---') ||
    cleanText.startsWith('New Session Started') ||
    cleanText.includes('Transferred / Respawned in world') ||
    cleanText.startsWith('🟢 Connected & spawned into');

  if (isSessionDivider) {
    return (
      <div className={`w-full ${compact ? 'my-1.5' : 'my-2.5 sm:my-3'} flex items-center gap-2 sm:gap-3 select-none`}>
        <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-slate-300 to-slate-400" />
        <div className={`px-2.5 py-0.5 rounded-full bg-white border border-slate-300 shadow-2xs ${compact ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'} font-mono font-bold text-slate-700 flex items-center gap-1.5 shrink-0`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Session Event</span>
          <span className="text-slate-400 font-normal">•</span>
          <span className="text-emerald-700 font-semibold">{timeFull || timeShort}</span>
        </div>
        <div className="flex-1 h-[1.5px] bg-gradient-to-r from-slate-400 via-slate-300 to-transparent" />
      </div>
    );
  }

  // 1. Matches rank + player username + message (e.g. "DIAMOND Bob ▶ hello", "[MEMBER] Player > hello")
  const rankPlayerMatch = cleanText.match(
    /^(?:\[?(IRON\+*|GOLD\+*|DIAMOND\+*|EMERALD\+*|NETHERITE\+*|DONUT\+*|FRESH\+*|CHIEF\+*|TITAN\+*|KING\+*|CHAMPION\+*|KNIGHT\+*|EMPEROR\+*|OVERLORD\+*|LORD\+*|JESTER\+*|MEMBER\+*|VIP\+*|MVP\+*|MEDIA|YOUTUBE|STREAMER|HELPER|STAFF|ADMIN|OWNER|MOD)\]?)\s+([+*.~#]?[a-zA-Z0-9_]{1,24})(?:\s+\[[^\]]{1,12}\])?\s*(?:▶|>|:|»)\s*(.*)$/i
  );

  if (rankPlayerMatch) {
    const rank = rankPlayerMatch[1].toUpperCase();
    const username = rankPlayerMatch[2];
    const cleanBody = rankPlayerMatch[3];
    const baseRank = rank.replace(/\+/g, '');
    const rankColor = DARK_RANK_COLORS[rank] || DARK_RANK_COLORS[baseRank] || '#d1c9c0';

    // Extract color-coded message body from rawText if available
    let rawBody = cleanBody;
    const arrowIndex = rawText.search(/[▶>:»]/);
    if (arrowIndex !== -1) {
      rawBody = rawText.slice(arrowIndex + 1).replace(/^[\s§r]+/, '');
    }

    return (
      <div className={`group min-w-0 max-w-full flex items-start gap-1.5 ${compact ? 'py-0.5 px-1 sm:px-1.5' : 'py-1 px-1.5 sm:px-2'} hover:bg-slate-100/80 rounded-lg transition-colors`}>
        {showTimestamp && (
          <time
            className={`${compact ? 'text-[8.5px] sm:text-[9px]' : 'text-[9.5px] sm:text-[10px]'} text-slate-400 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums`}
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <div className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text ${compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed'} font-sans`}>
          {/* Rank Badge */}
          <span
            className={`inline-flex items-center ${compact ? 'px-1 py-0.2 text-[8.5px]' : 'px-1.5 py-0.5 text-[10px]'} font-black uppercase tracking-wider mr-1.5 shrink-0 align-baseline select-none shadow-2xs font-mono rounded`}
            style={{
              color: rankColor,
              backgroundColor: `${rankColor}14`,
              borderColor: `${rankColor}30`,
              borderWidth: 1,
              borderStyle: 'solid',
            }}
          >
            {rank}
          </span>

          {/* Gamertag */}
          <span className="font-bold text-slate-900 mr-1 tracking-tight">
            {username}
          </span>

          {/* Separator */}
          <span className="text-sky-600 font-bold mr-1.5 select-none text-[10px]">▶</span>

          {/* Chat Body */}
          <span className="font-medium text-slate-800">
            {rawBody && rawBody.includes('§') ? parseLightMinecraftColorCodes(rawBody) : cleanBody}
          </span>
        </div>
      </div>
    );
  }

  // 2. Standard player chat match: <Username> message, Username » message, or Username > message
  const standardPlayerMatch = cleanText.match(
    /^(?:<([+*.~#]?[a-zA-Z0-9_]{1,24})>|([+*.~#]?[a-zA-Z0-9_]{3,20})\s*(?:▶|>|»))\s*(.*)$/
  );
  if (standardPlayerMatch) {
    const username = standardPlayerMatch[1] || standardPlayerMatch[2];
    const cleanBody = standardPlayerMatch[3];

    let rawBody = cleanBody;
    const closingBracket = rawText.indexOf('>');
    const arrowIndex = rawText.search(/[▶>»]/);
    const splitIndex = standardPlayerMatch[1] ? closingBracket : arrowIndex;
    if (splitIndex !== -1) {
      rawBody = rawText.slice(splitIndex + 1).replace(/^[\s§r]+/, '');
    }

    return (
      <div className={`group min-w-0 max-w-full flex items-start gap-1.5 ${compact ? 'py-0.5 px-1 sm:px-1.5' : 'py-1 px-1.5 sm:px-2'} hover:bg-slate-100/80 rounded-lg transition-colors`}>
        {showTimestamp && (
          <time
            className={`${compact ? 'text-[8.5px] sm:text-[9px]' : 'text-[9.5px] sm:text-[10px]'} text-slate-400 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums`}
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <div className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text ${compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed'} font-sans`}>
          <span className="font-bold text-slate-900 mr-1 tracking-tight">
            {username}
          </span>
          <span className="text-sky-600 font-bold mr-1.5 select-none text-[10px]">▶</span>
          <span className="font-medium text-slate-800">
            {rawBody && rawBody.includes('§') ? parseLightMinecraftColorCodes(rawBody) : cleanBody}
          </span>
        </div>
      </div>
    );
  }

  // 3. Death & Combat Messages (Rose background with skull icon)
  const deathKeywords = [
    'was slain by',
    'was obliterated',
    'blew up',
    'fell from a great height',
    'has died',
    'burned to death',
    'drowned',
    'suffocated',
    'hit the ground too hard',
    'fell off a scaffold',
    'was shot by',
    'starved to death',
    'experienced kinetic energy',
    'was pummeled by',
    'eliminated by',
    'died!',
  ];

  const isDeath = message.type === 'death' || deathKeywords.some((k) => cleanText.toLowerCase().includes(k));
  if (isDeath) {
    return (
      <div className="min-w-0 max-w-full flex items-start gap-1.5 py-1 px-1.5 sm:px-2 hover:bg-rose-50/70 rounded-lg transition-colors text-rose-700 bg-rose-50/40 border border-rose-200/80">
        {showTimestamp && (
          <time
            className="text-[9.5px] sm:text-[10px] text-rose-400 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums"
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <span className="text-rose-500 font-bold shrink-0 select-none text-[11px] leading-tight">☠</span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text font-sans text-xs font-semibold leading-relaxed">
          {cleanText}
        </span>
      </div>
    );
  }

  // 4. Economy & Orders (Green with dollar icon)
  const isEconomy = /You sold|has ordered|ordered|balance|\$[0-9,]+/i.test(cleanText);
  if (isEconomy) {
    return (
      <div className="min-w-0 max-w-full flex items-start gap-1.5 py-1 px-1.5 sm:px-2 hover:bg-emerald-50/70 rounded-lg transition-colors text-emerald-800 bg-emerald-50/40 border border-emerald-200/80">
        {showTimestamp && (
          <time
            className="text-[9.5px] sm:text-[10px] text-emerald-500/70 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums"
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <span className="text-amber-600 font-bold shrink-0 select-none text-xs leading-tight font-mono">$</span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text font-sans text-xs font-semibold leading-relaxed">
          {cleanText}
        </span>
      </div>
    );
  }

  // 5. PebbleAFK / PocketAFK / System Bot Events (Emerald Green Pill)
  if (
    cleanText.includes('[PebbleAFK]') ||
    cleanText.includes('[PocketAFK]') ||
    message.sender === 'PebbleAFK' ||
    message.sender === 'PocketAFK' ||
    message.sender === 'AutoCommand'
  ) {
    const textWithoutPrefix = cleanText.replace(/\[(?:PebbleAFK|PocketAFK)\]\s*/i, '');
    return (
      <div className="min-w-0 max-w-full flex items-start gap-1.5 py-1 px-1.5 sm:px-2 hover:bg-emerald-50/70 rounded-lg transition-colors text-emerald-800 bg-emerald-50/40 border border-emerald-200/80">
        {showTimestamp && (
          <time
            className="text-[9.5px] sm:text-[10px] text-emerald-500/70 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums"
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shrink-0 select-none shadow-2xs font-mono">
          PebbleAFK
        </span>
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text font-mono text-xs font-bold leading-relaxed text-emerald-950">
          {textWithoutPrefix}
        </span>
      </div>
    );
  }

  // 6. General Colored Minecraft Chat / Announcements
  if (rawText.includes('§')) {
    return (
      <div className="group min-w-0 max-w-full flex items-start gap-1.5 py-1 px-1.5 sm:px-2 hover:bg-slate-100/80 rounded-lg transition-colors">
        {showTimestamp && (
          <time
            className="text-[9.5px] sm:text-[10px] text-slate-400 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums"
            title={timeFull}
          >
            <span className="sm:hidden">{timeShort}</span>
            <span className="hidden sm:inline">{timeFull}</span>
          </time>
        )}
        <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text text-xs leading-relaxed font-sans">
          {cleanSender && (
            <span className="mr-1.5 font-bold text-sky-700 font-sans">&lt;{cleanSender}&gt;</span>
          )}
          {parseLightMinecraftColorCodes(rawText)}
        </div>
      </div>
    );
  }

  // 7. Default Server / Player Message Fallback
  const isServer = message.sender === 'Server' || message.type === 'system';
  const senderColor = isServer ? '#ffc166' : DARK_RANK_COLORS[message.sender?.toUpperCase()] || '#72c9ff';

  return (
    <div className="group min-w-0 max-w-full flex items-start gap-1.5 py-1 px-1.5 sm:px-2 hover:bg-slate-100/80 rounded-lg transition-colors text-slate-800">
      {showTimestamp && (
        <time
          className="text-[9.5px] sm:text-[10px] text-slate-400 font-mono shrink-0 select-none pt-0.5 leading-none tabular-nums"
          title={timeFull}
        >
          <span className="sm:hidden">{timeShort}</span>
          <span className="hidden sm:inline">{timeFull}</span>
        </time>
      )}
      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] select-text text-xs leading-relaxed font-sans">
        {message.sender && (
          <span className="font-bold mr-1.5 font-sans" style={{ color: senderColor }}>
            {message.type === 'system' ? `[${message.sender}]` : `<${message.sender}>`}
          </span>
        )}
        <span className="font-medium text-slate-800">{cleanText}</span>
      </div>
    </div>
  );
};
