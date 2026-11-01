import { render, screen } from '@testing-library/react';
import { parseStudentExport } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import exportJson from '../../../../packages/engine/test/fixtures/synthetic/student-export.json' with { type: 'json' };
import { StudentRecordCard } from './StudentRecordCard.tsx';

const parsed = parseStudentExport(JSON.stringify(exportJson));
if (!parsed.ok) throw new Error('fixture');

test('stops suggesting the identity once the fields the export knows already match', () => {
  const record = { ...parsed.record, suggestedProfile: { level: 'undergrad' as const, additionalMajor: 'none' as const } };
  render(<StudentRecordCard record={record} onRecord={vi.fn()} courses={[]} profile={{ level: 'undergrad', year: 2, additionalMajor: 'none' }} onProfile={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '套用到我的條件' })).not.toBeInTheDocument();
});
