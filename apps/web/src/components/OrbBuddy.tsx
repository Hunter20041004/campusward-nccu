import { useId } from 'react';

export type BuddyMood = 'idle' | 'thinking' | 'happy' | 'worried';

/**
 * 小助手「光球」（2026-11-01 使用者要求參考 Claude Duet 與 Grok 陪伴角色，融入政大與同家族元素）：
 * 霧藍光球、下半部指南山稜線、薄荷色醉夢溪水波環繞；有臉，表情跟著狀況變。
 * 動畫只在 prefers-reduced-motion 沒開時播放（styles.css 的 buddy-* 類別）。
 */
export function OrbBuddy({ size = 56, mood = 'idle', label }: { size?: number; mood?: BuddyMood; label?: string }) {
  const id = useId().replace(/:/g, '');
  const eyes = {
    idle: (
      <g className="buddy-blink">
        <ellipse cx="25" cy="28" rx="2.6" ry="3.4" />
        <ellipse cx="39" cy="28" rx="2.6" ry="3.4" />
      </g>
    ),
    thinking: (
      <g>
        <ellipse cx="26.5" cy="25.5" rx="2.4" ry="3" />
        <ellipse cx="40.5" cy="25.5" rx="2.4" ry="3" />
      </g>
    ),
    happy: (
      <g fill="none" strokeWidth="2.4" strokeLinecap="round" stroke="currentColor">
        <path d="M21.5 29 q3.5 -5 7 0" />
        <path d="M35.5 29 q3.5 -5 7 0" />
      </g>
    ),
    worried: (
      <g>
        <ellipse cx="25" cy="29" rx="2.4" ry="3" />
        <ellipse cx="39" cy="29" rx="2.4" ry="3" />
        <path d="M21 23 l7 2.2 M43 23 l-7 2.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    ),
  }[mood];
  const mouth = {
    idle: <path d="M28 35 q4 3 8 0" />,
    thinking: <circle cx="32" cy="36" r="1.8" fill="currentColor" stroke="none" />,
    happy: <path d="M26.5 34 q5.5 6 11 0" />,
    worried: <path d="M28 37.5 q4 -2.6 8 0" />,
  }[mood];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`buddy buddy-${mood} shrink-0 text-[oklch(0.22_0.04_263)]`}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="oklch(0.86 0.04 263)" />
          <stop offset="55%" stopColor="oklch(0.68 0.07 263)" />
          <stop offset="100%" stopColor="oklch(0.55 0.08 263)" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="32" cy="32" r="22" />
        </clipPath>
      </defs>
      {/* 醉夢溪：薄荷色水波環 */}
      <path
        className="buddy-stream"
        d="M32 4 C 48 4 60 16 60 32 C 60 48 48 60 32 60 C 16 60 4 48 4 32 C 4 16 16 4 32 4"
        fill="none"
        stroke="rgb(90 191 184 / 0.55)"
        strokeWidth="3"
        strokeDasharray="10 5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="22" fill={`url(#${id}-body)`} />
      {/* 指南山稜線：光球下半部兩層較深的霧藍 */}
      <g clipPath={`url(#${id}-clip)`}>
        <path d="M8 47 L18 39 L25 43 L33 35 L41 42 L47 38 L58 46 L58 60 L8 60 Z" fill="oklch(0.5 0.07 263 / 0.55)" />
        <path d="M8 52 L20 46 L29 50 L38 44 L48 49 L58 47 L58 60 L8 60 Z" fill="oklch(0.42 0.07 263 / 0.6)" />
        <path d="M10 54 q6 -2 12 0 t12 0 t12 0 t12 0" fill="none" stroke="rgb(140 220 212 / 0.8)" strokeWidth="1.4" />
      </g>
      <circle cx="24" cy="21" r="4.5" fill="white" opacity="0.55" />
      <g fill="currentColor">{eyes}</g>
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{mouth}</g>
      {mood === 'thinking' && (
        <g className="buddy-dots" fill="rgb(90 191 184)">
          <circle cx="47" cy="12" r="2" />
          <circle cx="53" cy="8" r="2.6" />
        </g>
      )}
    </svg>
  );
}
