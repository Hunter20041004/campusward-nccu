/** Campusward 的光球標記：霧藍核心＋薄荷光環（設計第 7 節）。 */
export function OrbMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="rgb(90 191 184)" strokeWidth="3" opacity="0.55" />
      <circle cx="16" cy="16" r="9.5" fill="oklch(0.626 0.072 263)" />
      <circle cx="13" cy="12.5" r="3" fill="oklch(0.97 0.01 263)" opacity="0.7" />
    </svg>
  );
}
