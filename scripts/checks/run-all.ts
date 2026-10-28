import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  findBrandViolations,
  findHardcodedTerms,
  findStudentIds,
  findUnpinnedWorkflows,
  type SourceFile,
} from './checks.ts';

const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf|zip|gz)$/i;
// 自我測試用的違規範例不算。
const EXCLUDED = /^scripts\/checks\/fixtures\//;

const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((path) => path && !BINARY.test(path) && !EXCLUDED.test(path));

const files: SourceFile[] = paths.flatMap((path) => {
  try {
    return [{ path, text: readFileSync(path, 'utf8') }];
  } catch {
    return []; // 已刪除但仍在索引中的檔案
  }
});

const violations = [
  ...findHardcodedTerms(files),
  ...findStudentIds(files),
  ...findUnpinnedWorkflows(files),
  ...findBrandViolations(files),
];

for (const v of violations) console.error(`${v.path}:${v.line} [${v.check}] ${v.detail}`);
console.log(`檢查 ${files.length} 個檔案，${violations.length} 個問題。`);
process.exitCode = violations.length ? 1 : 0;
