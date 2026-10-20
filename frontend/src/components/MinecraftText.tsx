'use client';

import React from 'react';

// Minecraft Bedrock / Java Section Sign Formatting Map
const COLOR_MAP: Record<string, string> = {
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

  // Normalize formatting characters: replace & codes if used as section signs, or literal §
  const regex = /(?:§|&)([0-9a-fk-or])/gi;
  const spans: TextSpan[] = [];

  let currentColor: string | undefined = undefined;
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrikethrough = false;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textChunk = rawText.substring(lastIndex, match.index);
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

    const code = match[1].toLowerCase();
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

    lastIndex = regex.lastIndex;
  }

  // Trailing text
  if (lastIndex < rawText.length) {
    const textChunk = rawText.substring(lastIndex);
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

  // Fast path: if no formatting codes present, render plain text
  if (!text.includes('§') && !text.includes('&')) {
    return <span className={className}>{text}</span>;
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
