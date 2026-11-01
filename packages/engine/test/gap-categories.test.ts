import { describe, expect, test } from 'vitest';
import { gapGeneralEducation, type AuditGap } from '../src/studentExport.ts';

const CATEGORIES = ['人文通識', '社會通識', '自然通識', '資訊通識', '中文通識', '外文通識', '書院通識', '跨領域(人文、社會)'];
const gap = (area: AuditGap['area'], label: string, text: string): AuditGap => ({ area, label, text, items: [] });

describe('gapGeneralEducation', () => {
  test('maps the school audit gaps to this term\'s 通識 categories', () => {
    expect(gapGeneralEducation([gap('chinese', '中文通識', '[中文通識欠3學分]')], CATEGORIES)).toEqual(['中文通識']);
    expect(gapGeneralEducation([gap('english', '外文通識', '[外文通識欠2學分]')], CATEGORIES)).toEqual(['外文通識']);
  });

  test('a general gap that names an area keeps only that area', () => {
    expect(gapGeneralEducation([gap('general', '一般通識', '尚缺跨領域 2 學分')], CATEGORIES)).toEqual(['跨領域(人文、社會)']);
    expect(gapGeneralEducation([gap('general', '一般通識', '[社會欠3學分]')], CATEGORIES)).toEqual(['社會通識', '跨領域(人文、社會)']);
  });

  test('a general gap without an area means every non-language category', () => {
    expect(gapGeneralEducation([gap('liberal', '通識總計', '[通識欠4學分]')], CATEGORIES)).toEqual(['人文通識', '社會通識', '自然通識', '資訊通識', '書院通識', '跨領域(人文、社會)']);
  });

  test('gaps that are not 通識 (體育、群修) are ignored', () => {
    expect(gapGeneralEducation([gap('pe', '體育', '[體育欠1門]'), gap('group', '群修', '[群修欠3學分]')], CATEGORIES)).toEqual([]);
  });
});
