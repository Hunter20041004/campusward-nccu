import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildCorpus, buildRecord, serializeCorpus, type CorpusRecord } from '../corpus.ts';
import { big5NotUploadedPage, syllabusPage, weekTable } from './fixtures/synthetic/page.ts';

const MARK = '〔聯絡資訊已移除〕';
const encode = (text: string) => new TextEncoder().encode(text);
const contact = ['teacher', 'nccu.edu.tw'].join('@');
const weeks = weekTable([['1', `導論 ${contact}`], ['2', '方法'], ['3', '實作']]);

describe('buildRecord', () => {
  test('fields come out in the shared format order, scrubbed, with the raw page hash', () => {
    const bytes = encode(syllabusPage({ description: `<p>有問題寫信到 ${contact}</p>`, prerequisite: '程式設計', weekly: weeks }));
    const result = buildRecord('000211011', bytes);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(Object.keys(result.record)).toEqual(['code', 'title', 'description', 'objectives', 'grading', 'prerequisite', 'weekly', 'weeklyText', 'hash']);
    expect(result.record.description).toBe(`有問題寫信到 ${MARK}`);
    expect(result.record.weekly[0]).toEqual({ week: 1, topic: `導論 ${MARK}` });
    expect(result.record.prerequisite).toBe('程式設計');
    expect(result.record.hash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(result.hits).toEqual({ email: 2 });
  });

  test('pages not uploaded yet produce no record', () => {
    expect(buildRecord('000211011', big5NotUploadedPage())).toEqual({ status: 'notUploaded' });
  });
});

describe('serializeCorpus', () => {
  const record = (code: string): CorpusRecord => ({ code, title: 't', description: '', objectives: '', grading: '', prerequisite: '', weekly: [], weeklyText: '', hash: 'h' });

  test('one line per course, sorted by code, byte-stable', () => {
    const text = serializeCorpus([record('b'), record('a')]);
    expect(text).toBe(`${JSON.stringify(record('a'))}\n${JSON.stringify(record('b'))}\n`);
    expect(serializeCorpus([record('a'), record('b')])).toBe(text);
    expect(serializeCorpus([])).toBe('');
  });
});

describe('buildCorpus', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'corpus-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('fetches, parses, scrubs and summarises a term', async () => {
    const pages: Record<string, Uint8Array | number | Error> = {
      '000300001': encode(syllabusPage({ titleZh: '乙', weekly: weeks })),
      '000200001': encode(syllabusPage({ titleZh: '甲', weekly: '<p>每週討論</p>' })),
      '000400001': big5NotUploadedPage(),
      '000500001': 404,
      '000600001': new Error('reset'),
    };
    let clock = 0;
    const courses = [...Object.keys(pages), '000700001'].map((code) => ({
      code,
      links: code === '000700001' ? {} : { syllabus: `https://newdoc.nccu.edu.tw/teaschm/1151/${code}.html` },
    }));
    const { corpus, meta } = await buildCorpus({
      term: '1151',
      courses,
      cacheDir: join(dir, 'cache'),
      fetchedAt: '2026-11-01T00:00:00.000Z',
      fetchImpl: async (target) => {
        const page = pages[/(\d{9})\.html$/.exec(target)![1]!]!;
        if (page instanceof Error) throw page;
        if (typeof page === 'number') return new Response('', { status: page });
        return new Response(page);
      },
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
    });
    const lines = corpus.trimEnd().split('\n').map((line) => JSON.parse(line) as CorpusRecord);
    expect(lines.map(({ code, title }) => [code, title])).toEqual([['000200001', '甲 Introduction to Testing'], ['000300001', '乙 Introduction to Testing']]);
    expect(lines[0]!.weeklyText).toBe('每週討論');
    expect(lines[1]!.weekly).toHaveLength(3);
    expect(meta).toEqual({
      term: '1151',
      fetchedAt: '2026-11-01T00:00:00.000Z',
      pages: 3,
      parsed: 2,
      notUploaded: 1,
      missing: 2,
      failed: 1,
      scrubHits: { email: 1 },
    });
    expect(Object.keys(meta)).toEqual(['term', 'fetchedAt', 'pages', 'parsed', 'notUploaded', 'missing', 'failed', 'scrubHits']);
    expect(readFileSync(join(dir, 'cache', '000300001.html')).length).toBeGreaterThan(0);
  });
});
