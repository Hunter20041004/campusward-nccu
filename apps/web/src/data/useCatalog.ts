import type { Course } from '@campusward/engine';
import { termLabel, parseTerm } from '@campusward/engine';
import { useEffect, useState } from 'react';
import { defaultTerm, type CatalogSource, type TermInfo } from './catalog.ts';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; terms: TermInfo[]; term: string; label: string; courses: Course[] };

export function useCatalog(source: CatalogSource): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    (async () => {
      const terms = await source.listTerms();
      const term = defaultTerm(terms);
      const parsed = term ? parseTerm(term) : null;
      if (!term || !parsed) throw new Error('no term');
      const courses = await source.loadCourses(term);
      if (active) setState({ status: 'ready', terms, term, label: termLabel(parsed), courses });
    })().catch(() => {
      if (active) setState({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [source]);
  return state;
}
