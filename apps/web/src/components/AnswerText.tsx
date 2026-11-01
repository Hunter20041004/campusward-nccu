const CODE = /([0-9A-Z]{9})/;

/** AI 回覆只當純文字顯示（不渲染 HTML、Markdown、圖片或連結）；文中的 9 碼課號比對快照，查無者標示（計畫 4.4）。 */
export function AnswerText({ text, knownCodes }: { text: string; knownCodes: ReadonlySet<string> }) {
  return (
    <>
      {text.split('\n').filter((line) => line.trim()).map((line, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {line.split(CODE).map((part, partIndex) => (
            CODE.test(part) && part.length === 9 && !knownCodes.has(part)
              ? <span key={partIndex}>{part}<span className="text-coral-ink">（快照查無此課號）</span></span>
              : <span key={partIndex}>{part}</span>
          ))}
        </p>
      ))}
    </>
  );
}
