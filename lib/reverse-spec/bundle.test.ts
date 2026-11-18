import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_REVIEW_MARKER, assembleBundle, guardStatement, readBundle, writeBundle, BUNDLE_SCHEMA_VERSION } from './bundle';
import { UNSUPPORTED_MARKER, type CitableClass } from './citations';

const classes: CitableClass[] = [
  { classId: 'p:f:a', count: 7, evidenceIds: ['E1', 'E2'], representatives: ['E1'] },
];

describe('assembleBundle', () => {
  it('cites evidence, flags unsupported and missing, keeps every requirement', () => {
    const b = assembleBundle({
      package: 'p',
      model: 'm',
      generatedAt: '2025-01-01T00:00:00.000Z',
      classes,
      requirements: [
        { id: 'R1', statement: 'does a', classIds: ['p:f:a'] },
        { id: 'R2', statement: 'does b', classIds: ['nope'] },
      ],
    });
    const req = b.documents['requirements.md'];
    expect(req).toContain('E1');
    expect(req).toContain('cited class not found');
    expect(req.split(UNSUPPORTED_MARKER)).toHaveLength(2);
    expect(b.traceability.text).toBe('1 / 2 requirements cite evidence');
    expect(b.citationIssues).toHaveLength(1);
    expect(Object.keys(b.documents)).toEqual(
      expect.arrayContaining(['requirements.md', 'design.md', 'tasks.md', 'steering/product.md']),
    );
    expect(b.documents['tasks.md']).toContain('R2');
  });

  it('readBundle returns null when no cache exists', () => {
    expect(readBundle('missing-pkg', tmpdir())).toBeNull();
  });
});

describe('language guard in the bundle (Req 9.3)', () => {
  it('replaces only the violating sentence with a review marker', () => {
    expect(guardStatement('Returns a string. The output is guaranteed stable. Handles null.')).toBe(
      `Returns a string. ${LANGUAGE_REVIEW_MARKER} Handles null.`,
    );
    expect(guardStatement('Evidence, not proof, of behavior.')).toBe('Evidence, not proof, of behavior.');
  });

  it('marks violations in every document and keeps clean statements', () => {
    const b = assembleBundle({
      package: 'p',
      model: 'm',
      classes,
      requirements: [
        { id: 'R1', statement: 'Output is identical to the original.', classIds: ['p:f:a'] },
        { id: 'R2', statement: 'Trims input.', classIds: ['p:f:a'] },
      ],
    });
    for (const name of ['requirements.md', 'design.md', 'tasks.md']) {
      expect(b.documents[name]).toContain(LANGUAGE_REVIEW_MARKER);
      expect(b.documents[name]).not.toMatch(/identical/i);
    }
    expect(b.documents['requirements.md']).toContain('Trims input.');
  });
});

describe('Property 7: Stored JSON round trip (spec bundle record)', () => {
  it('write then read returns a deep-equal bundle', () => {
    // **Validates: Requirements 3.4, 5.7**
    const root = mkdtempSync(join(tmpdir(), 'bundle-rt-'));
    try {
      const ids = fc.constantFrom('p:f:a', 'p:f:b', 'gone');
      const req = fc.record({
        id: fc.string({ minLength: 1, maxLength: 6 }),
        statement: fc.string({ minLength: 1, maxLength: 30 }),
        classIds: fc.array(ids, { maxLength: 3 }),
      });
      const cls: CitableClass[] = [
        { classId: 'p:f:a', count: 3, evidenceIds: ['E1', 'E2'], representatives: ['E1'] },
        { classId: 'p:f:b', count: 1, evidenceIds: ['E3'], representatives: [] },
      ];
      fc.assert(
        fc.property(
          fc.array(req, { maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
          (reqs, model, cap) => {
            const bundle = assembleBundle({
              package: 'pkg',
              model,
              classes: cls,
              requirements: reqs,
              generatedAt: '2025-01-01T00:00:00.000Z',
            });
            if (cap !== undefined) bundle.groqCapMessage = cap;
            writeBundle(bundle, root);
            const back = readBundle('pkg', root);
            expect(back).toEqual(JSON.parse(JSON.stringify(bundle)));
            expect(back?.schemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
