'use client';

import React from 'react';

// Minecraft Bedrock / Java Section Sign Formatting Map
const COLOR_MAP: Record<string, string> = {
  // Standard Minecraft Colors
  '0': '#000000', // Black
  '1': '#1e3a8a', // Dark Blue
  '2': '#15803d', // Dark Green
  '3': '#0e7490', // Dark Aqua
  '4': '#b91c1c', // Dark Red
  '5': '#7e22ce', // Dark Purple
  '6': '#d97706', // Gold / Amber
  '7': '#64748b', // Gray
  '8': '#334155', // Dark Gray
  '9': '#2563eb', // Blue
  'a': '#16a34a', // Bright Green
  'b': '#0891b2', // Aqua / Cyan
  'c': '#dc2626', // Red
  'd': '#c026d3', // Light Purple
  'e': '#ca8a04', // Yellow
  'f': '#0f172a', // White (Mapped to dark slate for high contrast on light UI)

  // Bedrock Edition Extended Material & Rank Colors
  'g': '#ca8a04', // Minecoin Gold
  'h': '#94a3b8', // Material Quartz (slate)
  'i': '#64748b', // Material Iron (slate gray)
  'j': '#334155', // Material Netherite (dark gray)
  'm': '#dc2626', // Redstone
  'n': '#b45309', // Copper
  'p': '#7c3aed', // Purple / Gold rank
  'q': '#15803d', // Emerald Green
  's': '#0891b2', // Diamond Aqua
  't': '#1e40af', // Lapis Blue
  'u': '#9333ea', // Amethyst Purple
};

interface MinecraftTextProps {
  text: string;
  className?: string;
}

interface TextSpan {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export function parseMinecraftText(rawText: string): TextSpan[] {
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
      if (code in COLOR_MAP) {
        currentColor = COLOR_MAP[code];
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

export const MinecraftText: React.FC<MinecraftTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Fast path: if no formatting codes present, render plain text (clearing any stray §)
  if (!text.includes('§') && !text.includes('&')) {
    return <span className={className}>{text.replace(/§+/g, '')}</span>;
  }

  const spans = parseMinecraftText(text);

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
