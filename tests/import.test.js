import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { importRows } from '../scripts/import.mjs';
import { bootstrapAdminSql } from '../scripts/admin.mjs';
import { testDatabase } from './sqlite';

test('imports skip blanks and duplicates, preserve branches and feedback, and are repeatable', () => {
  const database = testDatabase();
  try {
    const result = importRows({
      source: 'https://example.test/source',
      rows: [
        { row: 2, cells: ['', '', '', 'Malta', false] },
        { row: 3, cells: ["Test's Café", 'Cafe', ' Ħamrun ', 'Malta', true, '', 'Oriġinali'] },
        { row: 4, cells: ["test's café", 'Cafe', 'Ħamrun', 'Malta'] },
        { row: 5, cells: ["Test's Café", 'Cafe', 'Victoria', 'Gozo'] },
      ],
    });
    database.sqlite.exec(result.sql);
    database.sqlite.exec(result.sql);
    expect(result.report.imported).toBe(2);
    expect(result.report.skipped).toHaveLength(2);
    expect(database.sqlite.prepare('SELECT * FROM places').all()).toHaveLength(2);
    expect(database.sqlite.prepare('SELECT * FROM feedback').all()).toMatchObject([
      { body: 'Oriġinali', rating: null, author_id: null },
    ]);
    expect(
      database.sqlite
        .prepare('SELECT cam_verified,source_cam,cam_verified_at FROM places WHERE island=?')
        .get('Malta'),
    ).toMatchObject({ cam_verified: 0, source_cam: 1, cam_verified_at: null });
  } finally {
    database.sqlite.close();
  }
});

test('local bootstrap requires a verified account and only creates the first admin', () => {
  const database = testDatabase();
  try {
    database.sqlite.exec(
      "INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('one','One','one@example.test',0,0),('two','Two','two@example.test',0,0)",
    );
    database.sqlite.exec(bootstrapAdminSql('one'));
    expect(database.sqlite.prepare('SELECT * FROM profiles').all()).toHaveLength(0);
    database.sqlite.exec('UPDATE user SET emailVerified=1');
    database.sqlite.exec(bootstrapAdminSql('one'));
    database.sqlite.exec(bootstrapAdminSql('two'));
    database.sqlite.exec(bootstrapAdminSql("one'; DELETE FROM user; --"));
    expect(database.sqlite.prepare('SELECT * FROM profiles').all()).toMatchObject([
      { user_id: 'one', role: 'admin' },
    ]);
    expect(database.sqlite.prepare('SELECT * FROM audit_log').all()).toHaveLength(1);
    expect(database.sqlite.prepare('SELECT * FROM user').all()).toHaveLength(2);
  } finally {
    database.sqlite.close();
  }
});

test('order-only imports retain provenance without guessing classification or services', () => {
  const database = testDatabase();
  try {
    const imported = importRows({
      source: 'https://example.test',
      rows: [{ row: 2, cells: ['Order business', 'By Order/Takeaway', '', 'Malta'] }],
    });
    database.sqlite.exec(imported.sql);
    database.sqlite.exec(imported.sql);
    expect(database.sqlite.prepare('SELECT * FROM places').all()).toMatchObject([
      {
        business_types: '[]',
        source_type: 'By Order/Takeaway',
        services: '[]',
        advance_orders: 'unknown',
      },
    ]);
  } finally {
    database.sqlite.close();
  }
});

test('public seed excludes community feedback and retains only business records', () => {
  const source = JSON.parse(readFileSync('data/restaurants.json', 'utf8'));
  expect(source.rows.every((row) => !row.cells[6])).toBe(true);
  const result = importRows(source);
  expect(result.report.feedback).toBe(0);
  expect(result.sql).not.toContain('INSERT OR IGNORE INTO feedback');
  expect(readFileSync('data/seed.sql', 'utf8').replaceAll('\r\n', '\n')).toBe(result.sql);
});
