// wrangler d1 execute takes no parameters, so operator tools write values into statements as SQL literals.

export function lit(/** @type {unknown} */ v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v);
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  throw new Error(`lit: a value no statement here writes: ${typeof v}`);
}
