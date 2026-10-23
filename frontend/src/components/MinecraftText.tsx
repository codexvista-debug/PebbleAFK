'use client';

import React from 'react';

// Minecraft colors are lifted for the dark control-room/chat surfaces.
const DARK_COLOR_MAP: Record<string, string> = {
  '0': '#c9c0b6', '1': '#78a8ff', '2': '#78df86', '3': '#66d9d1',
  '4': '#ff7777', '5': '#d995ff', '6': '#ffc166', '7': '#e2d9ce',
  '8': '#b7aea4', '9': '#83b5ff', 'a': '#76e68a', 'b': '#72e5ed',
  'c': '#ff8181', 'd': '#ff91dc', 'e': '#ffe477', 'f': '#fffaf2',
  'g': '#ffdc70', 'h': '#e1ded8', 'i': '#c9c3ba', 'j': '#b7aea4',
  'm': '#ff7777', 'n': '#ffb078', 'p': '#d995ff', 'q': '#78df86',
  's': '#72e5ed', 't': '#83b5ff', 'u': '#d995ff',
};

// The AFK boss bar intentionally stays light, so use readable dark text there.
const LIGHT_COLOR_MAP: Record<string, string> = {
  '0': '#26231f', '1': '#244c9a', '2': '#276b35', '3': '#176d70',
  '4': '#a92e32', '5': '#71349b', '6': '#91520d', '7': '#5d554c',
  '8': '#49443f', '9': '#245fc0', 'a': '#26753a', 'b': '#087b83',
  'c': '#bd3038', 'd': '#a63885', 'e': '#8a6a08', 'f': '#26231f',
  'g': '#8a6a08', 'h': '#5d554c', 'i': '#5d554c', 'j': '#49443f',
  'm': '#bd3038', 'n': '#91520d', 'p': '#71349b', 'q': '#26753a',
  's': '#087b83', 't': '#245fc0', 'u': '#71349b',
};

interface MinecraftTextProps {
  text: string;
  className?: string;
  palette?: 'dark' | 'light';
}

interface TextSpan {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export function parseMinecraftText(rawText: string, palette: 'dark' | 'light' = 'dark'): TextSpan[] {
  if (!rawText) return [];

  // Match hex codes (e.g. §x§r§r§g§g§b§b) or single code (e.g. §a, §l, §i, etc.)
  const regex = /(?:(?:§|&)x(?:(?:§|&)([0-9a-fA-F])){6})|(?:(?:§|&)([0-9a-zA-Z]))/gi;
  const spans: TextSpan[] = [];

  let currentColor: string | undefined = undefined;
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrikethrough = false;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textChunk = rawText.substring(lastIndex, match.index).replace(/§+/g, '');
    if (textChunk.length > 0) {
      spans.push({
        text: textChunk,
        color: currentColor,
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        strikethrough: isStrikethrough,
      });
    }

    if (match[0].toLowerCase().includes('x')) {
      // Hex RGB code
      const hexDigits = match[0].replace(/[^0-9a-fA-F]/g, '').slice(1);
      if (hexDigits.length === 6) {
        currentColor = '#' + hexDigits;
      }
    } else {
      const code = (match[2] || '').toLowerCase();
      const colorMap = palette === 'light' ? LIGHT_COLOR_MAP : DARK_COLOR_MAP;
      if (code in colorMap) {
        currentColor = colorMap[code];
        // In Minecraft, applying a color resets formatting styles
        isBold = false;
        isItalic = false;
        isUnderline = false;
        isStrikethrough = false;
      } else if (code === 'l') {
        isBold = true;
      } else if (code === 'o') {
        isItalic = true;
      } else if (code === 'n') {
        isUnderline = true;
      } else if (code === 'm') {
        isStrikethrough = true;
      } else if (code === 'r') {
        // Reset
        currentColor = undefined;
        isBold = false;
        isItalic = false;
        isUnderline = false;
        isStrikethrough = false;
      }
      // Any other unrecognized code is safely consumed so raw § is never output
    }

    lastIndex = regex.lastIndex;
  }

  // Trailing text
  if (lastIndex < rawText.length) {
    const textChunk = rawText.substring(lastIndex).replace(/§+/g, '');
    if (textChunk.length > 0) {
      spans.push({
        text: textChunk,
        color: currentColor,
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        strikethrough: isStrikethrough,
      });
    }
  }

  return spans;
}

export const MinecraftText: React.FC<MinecraftTextProps> = ({ text, className = '', palette = 'dark' }) => {
  if (!text) return null;

  // Fast path: if no formatting codes present, render plain text (clearing any stray §)
  if (!text.includes('§') && !text.includes('&')) {
    return <span className={className}>{text.replace(/§+/g, '')}</span>;
  }

  const spans = parseMinecraftText(text, palette);

  return (
    <span className={className}>
      {spans.map((span, idx) => {
        const classes = [
          span.bold ? 'font-bold' : '',
          span.italic ? 'italic' : '',
          span.underline ? 'underline' : '',
          span.strikethrough ? 'line-through' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <span
            key={idx}
            className={classes}
            style={span.color ? { color: span.color } : undefined}
          >
            {span.text}
          </span>
        );
      })}
    </span>
  );
};
