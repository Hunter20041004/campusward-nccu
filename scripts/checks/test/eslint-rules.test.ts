import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

const ENGINE_FILE = 'packages/engine/src/example.ts';
const WEB_FILE = 'apps/web/src/Example.tsx';

describe('engine isolation', () => {
  test.each([
    ["import { readFileSync } from 'node:fs';\nvoid readFileSync;", 'no-restricted-imports'],
    ["import fs from 'fs';\nvoid fs;", 'no-restricted-imports'],
    ["import { useState } from 'react';\nvoid useState;", 'no-restricted-imports'],
    ["export const load = () => fetch('https://example.com');", 'no-restricted-globals'],
    ["export const read = () => localStorage.getItem('x');", 'no-restricted-globals'],
    ["export const w = () => window.location.href;", 'no-restricted-globals'],
    ["export const env = () => process.env;", 'no-restricted-globals'],
  ])('rejects %s', async (code, rule) => {
    expect(await ruleIds(code, ENGINE_FILE)).toContain(rule);
  });

  test('allows pure logic with URL and TextEncoder', async () => {
    const code = "export const host = new URL('https://es.nccu.edu.tw').hostname;\nexport const size = new TextEncoder().encode('課').length;";
    expect(await ruleIds(code, ENGINE_FILE)).toEqual([]);
  });
});

describe('web safety', () => {
  test('rejects dangerouslySetInnerHTML', async () => {
    const code = "export const Bad = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />;";
    expect(await ruleIds(code, WEB_FILE)).toContain('react/no-danger');
  });

  test('allows ordinary JSX', async () => {
    const code = "export const Ok = ({ text }: { text: string }) => <p>{text}</p>;";
    expect(await ruleIds(code, WEB_FILE)).toEqual([]);
  });
});
