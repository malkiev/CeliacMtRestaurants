import { dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const quote = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replaceAll("'", "''")}'`;
export function importRows(input) {
  const seen = new Set();
  const statements = [];
  const report = { imported: 0, feedback: 0, skipped: [], warnings: [] };
  for (const { row, cells } of input.rows) {
    const [rawName, type, rawLocality, island, cam, menu, comment] = cells;
    const name = String(rawName || '').trim();
    if (!name) {
      report.skipped.push({ row, reason: 'Empty name' });
      continue;
    }
    if (!['Malta', 'Gozo'].includes(island)) {
      report.skipped.push({ row, reason: 'Invalid island' });
      continue;
    }
    const locality = String(rawLocality || '').trim();
    const key = `${name.toLowerCase()}|${locality.toLowerCase()}|${island}`;
    if (seen.has(key)) {
      report.skipped.push({
        row,
        reason: 'Duplicate name/locality/island; review branches manually',
      });
      continue;
    }
    seen.add(key);
    const id = `import-${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
    const slug =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ħ/gi, 'h')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      id.slice(-6);
    const ref = `${input.source}#gid=0&range=A${row}:G${row}`;
    const knownTypes = [
      'Restaurant',
      'Cafe',
      'Bar',
      'Bakery',
      'Butcher',
      'Food shop',
      'Food producer',
      'Wine bar',
      'Importer/distributor',
    ];
    const importedType = type === 'Shop' ? 'Food shop' : type;
    const types = knownTypes.includes(importedType) ? [importedType] : [];
    if (!types.length)
      report.warnings.push({
        row,
        reason:
          'Business classification needs review; source type preserved without inferring services or premises',
      });
    statements.push(
      `INSERT OR IGNORE INTO places(id,slug,name,type,business_types,source_type,locality,island,source_cam,menu_info,source_ref) VALUES(${[id, slug, name, types[0] || '', JSON.stringify(types), type || '', locality, island, cam === true || cam === 'TRUE' ? 1 : 0, menu || '', ref].map(quote).join(',')});`,
    );
    if (comment) {
      statements.push(
        `INSERT OR IGNORE INTO feedback(id,place_id,kind,body,source_ref) VALUES(${[id + '-feedback', id, 'imported', comment, ref].map(quote).join(',')});`,
      );
      report.feedback++;
    }
    if (!locality) report.warnings.push({ row, reason: 'Locality missing; no map pin created' });
    if (cam === true || cam === 'TRUE')
      report.warnings.push({ row, reason: 'CAM flag retained privately; admin check required' });
    report.imported++;
  }
  return { sql: statements.join('\n') + '\n', report };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2] || 'data/restaurants.json';
  const out = process.argv[3] || (process.argv[2] ? 'data/private/seed.sql' : 'data/seed.sql');
  mkdirSync(dirname(out), { recursive: true });
  const result = importRows(JSON.parse(readFileSync(source, 'utf8')));
  writeFileSync(out, result.sql);
  writeFileSync(
    out.replace(/\.sql$/, '.report.json'),
    JSON.stringify(result.report, null, 2) + '\n',
  );
  console.log(
    `Preview generated: ${out}. ${result.report.imported} places, ${result.report.feedback} imported comments. No database changed.`,
  );
}
