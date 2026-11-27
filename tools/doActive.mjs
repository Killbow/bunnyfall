#!/usr/bin/env node
// Reads each Durable Object's daily active time from Cloudflare's GraphQL analytics, as Markdown. It reads only.
// Run: node tools/doActive.mjs --account <id> --days [days] | --check [days] (token from CLOUDFLARE_API_TOKEN).

import { isMain } from './lib/isMain.mjs';

/**
 * @typedef {object} DatasetSchema
 * @property {string} root
 * @property {string} group
 * @property {Record<string, string[] | null>} parts
 * @property {string[]} filters
 * @property {string[]} orders
 * @property {Record<string, unknown> | null} settings
 */
/**
 * @typedef {object} ReadingPlan
 * @property {number} days
 * @property {number | null} cut
 * @property {'date' | 'date_range' | 'datetime'} byDay
 * @property {number} slice
 * @property {number} pageSize
 * @property {string | null} order
 * @property {boolean} namespace
 */

export const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
export const DATASET = 'durableObjectsPeriodicGroups';
export const DAYS_MAX = 7;
export const DAY_S = 86_400;
export const ALWAYS_ON_H = 22;
export const OBJECT_DAY_USD = (0.125 * DAY_S * 12.5) / 1e6;
export const HOUR_EDGES = Object.freeze([1, 2, 4, 8, 12, 16, 20, 22, 24]);
export const UNITS = Object.freeze([['microseconds', 1e-6], ['milliseconds', 1e-3]]);
export const TOP_N = 40;
export const PAGE_MAX = 10_000;
const SETTINGS = ['enabled', 'maxDuration', 'maxNumberOfFields', 'maxPageSize', 'notOlderThan'];

export function activeDays(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return DAYS_MAX;
  const days = /^[0-9]{1,2}$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(days) || days < 1 || days > DAYS_MAX) throw new Error(`not a window: ${JSON.stringify(raw)} - whole days, 1 to ${DAYS_MAX}`);
  return days;
}

export function accountId(raw) {
  const text = String(raw ?? '').trim();
  if (!/^[0-9a-f]{32}$/.test(text)) throw new Error(`not an account id: ${JSON.stringify(raw)}`);
  return text;
}

export function windowDays(days, now = Date.now()) {
  const today = Math.floor(now / 1000 / DAY_S) * DAY_S;
  return Array.from({ length: days }, (_, index) => new Date((today - (days - index) * DAY_S) * 1000).toISOString().slice(0, 10));
}

const TYPE_REF = 'name kind ofType { name kind ofType { name kind ofType { name kind } } }';
export const typeQuery = (name) => `query { __type(name: ${JSON.stringify(name)}) { name kind fields { name type { ${TYPE_REF} } args { name type { ${TYPE_REF} } } } inputFields { name } enumValues { name } } }`;
const unwrap = (typeRef) => {
  let inner = typeRef;
  while (inner && !inner.name) inner = inner.ofType;
  return inner ?? null;
};
const named = (typeRef) => unwrap(typeRef)?.name ?? null;
const fieldOf = (type, name) => type?.fields?.find((field) => field.name === name) ?? null;
const names = (list) => (list ?? []).map((field) => field.name);

/**
 * @param {(query: string) => Promise<any>} ask
 * @param {string} account
 * @returns {Promise<DatasetSchema>}
 */
export async function introspect(ask, account) {
  const type = async (name) => {
    const found = (await ask(typeQuery(name)))?.__type;
    if (!found) throw new Error(`the schema has no type ${name}`);
    return found;
  };
  const step = async (from, field) => {
    const definition = fieldOf(from, field);
    if (!definition) throw new Error(`${from.name} has no field ${field} - its fields: ${names(from.fields).join(', ')}`);
    return { field: definition, type: await type(named(definition.type)) };
  };
  const root = (await ask('query { __schema { queryType { name } } }'))?.__schema?.queryType?.name;
  if (!root) throw new Error('the schema names no query type');
  const viewer = await step(await type(root), 'viewer');
  const accounts = await step(viewer.type, 'accounts');
  const group = await step(accounts.type, DATASET);
  const parts = {};
  for (const field of group.type.fields ?? []) {
    const typeRef = unwrap(field.type);
    parts[field.name] = typeRef?.kind === 'OBJECT' ? names((await type(typeRef.name)).fields) : null;
  }
  const argType = async (arg) => {
    const argument = group.field.args?.find((declared) => declared.name === arg);
    return argument ? type(named(argument.type)) : null;
  };
  const filters = names((await argType('filter'))?.inputFields);
  const orders = names((await argType('orderBy'))?.enumValues);
  let settings = null;
  const settingsField = fieldOf(accounts.type, 'settings');
  if (settingsField) {
    const settingsType = await type(named(settingsField.type));
    const datasetSettings = fieldOf(settingsType, DATASET);
    const asked = datasetSettings ? names((await type(named(datasetSettings.type))).fields).filter((name) => SETTINGS.includes(name)) : [];
    if (asked.length) settings = (await ask(`query { viewer { accounts(filter: {accountTag: "${accountId(account)}"}) { settings { ${DATASET} { ${asked.join(' ')} } } } } }`))?.viewer?.accounts?.[0]?.settings?.[DATASET] ?? null;
  }
  return { root, group: group.type.name, parts, filters, orders, settings };
}

/** @param {DatasetSchema} schema */
export function schemaTable(schema) {
  const rows = [['group', schema.group]];
  for (const [part, fields] of Object.entries(schema.parts)) rows.push([part, fields ? fields.join(', ') : '(a value)']);
  rows.push(['filter', schema.filters.join(', ')]);
  rows.push(['orderBy (activeTime)', schema.orders.filter((order) => /activeTime/.test(order)).join(', ') || '(none)']);
  rows.push(['settings', schema.settings ? Object.entries(schema.settings).map(([key, value]) => `${key} ${value}`).join(', ') : '(not exposed)']);
  return `**What the account exposes (\`${DATASET}\`)**\n\n| part | fields |\n|---|---|\n${rows.map(([label, text]) => `| ${label} | ${String(text).replace(/\|/g, '\\|')} |`).join('\n')}\n`;
}

/**
 * @param {DatasetSchema} schema
 * @param {number} days
 * @returns {ReadingPlan}
 */
export function readingPlan(schema, days) {
  const dimensions = schema.parts.dimensions ?? [];
  const sums = schema.parts.sum ?? [];
  const missing = [];
  if (!dimensions.includes('objectId')) missing.push('dimensions.objectId');
  if (!sums.includes('activeTime')) missing.push('sum.activeTime');
  const byDay = schema.filters.includes('date') ? 'date' : schema.filters.includes('date_geq') && schema.filters.includes('date_leq') ? 'date_range' : schema.filters.includes('datetime_geq') && schema.filters.includes('datetime_lt') ? 'datetime' : null;
  if (!byDay) missing.push('a filter by day (date, date_geq/date_leq or datetime_geq/datetime_lt)');
  const maxDuration = Number(schema.settings?.maxDuration);
  if (byDay !== 'datetime' && Number.isFinite(maxDuration) && maxDuration > 0 && maxDuration < DAY_S) missing.push(`a filter finer than a day (maxDuration ${maxDuration} s)`);
  if (missing.length) throw new Error(`the account's ${DATASET} lacks ${missing.join('; ')} - nothing past the schema can be read`);
  const notOlderThan = Number(schema.settings?.notOlderThan);
  const keptDays = Number.isFinite(notOlderThan) && notOlderThan > 0 ? Math.floor(notOlderThan / DAY_S) - 1 : days;
  const pageSize = Math.min(PAGE_MAX, Number(schema.settings?.maxPageSize) > 0 ? Number(schema.settings.maxPageSize) : PAGE_MAX);
  const slice = byDay === 'datetime' && Number.isFinite(maxDuration) && maxDuration > 0 ? Math.min(DAY_S, maxDuration) : DAY_S;
  return {
    days: Math.max(1, Math.min(days, keptDays)),
    cut: keptDays < days ? keptDays : null,
    byDay,
    slice,
    pageSize,
    order: schema.orders.includes('sum_activeTime_DESC') ? 'sum_activeTime_DESC' : null,
    namespace: dimensions.includes('namespaceId'),
  };
}

/**
 * @param {ReadingPlan} plan
 * @param {string} day
 */
export function dayFilters(plan, day) {
  if (plan.byDay === 'date') return [`{date: "${day}"}`];
  if (plan.byDay === 'date_range') return [`{date_geq: "${day}", date_leq: "${day}"}`];
  const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
  const filters = [];
  for (let sliceStart = dayStart; sliceStart < dayStart + DAY_S; sliceStart += plan.slice) {
    filters.push(`{datetime_geq: "${new Date(sliceStart * 1000).toISOString()}", datetime_lt: "${new Date(Math.min(sliceStart + plan.slice, dayStart + DAY_S) * 1000).toISOString()}"}`);
  }
  return filters;
}

const groups = (account, args, body) => `query { viewer { accounts(filter: {accountTag: "${accountId(account)}"}) { g: ${DATASET}(${args}) { ${body} } } } }`;
export const objectsQuery = (account, plan, filter) => groups(account, `limit: ${plan.pageSize}, filter: ${filter}${plan.order ? `, orderBy: [${plan.order}]` : ''}`, `dimensions { objectId${plan.namespace ? ' namespaceId' : ''} } sum { activeTime }`);
export const totalQuery = (account, plan, filter) => groups(account, `limit: ${plan.pageSize}, filter: ${filter}`, `${plan.namespace ? 'dimensions { namespaceId } ' : ''}sum { activeTime }`);

export function unitOf(busiestRaw) {
  const readings = UNITS.map(([name, seconds]) => ({ name, s: seconds, hours: (busiestRaw * seconds) / 3600 }));
  const fit = readings.filter((candidate) => candidate.hours <= 24.5).sort((left, right) => right.hours - left.hours)[0];
  return { readings, chosen: fit ?? readings[0], sure: !!fit };
}

export const bucketOf = (hours) => {
  const index = HOUR_EDGES.findIndex((edge) => hours <= edge);
  return index < 0 ? HOUR_EDGES.length - 1 : index;
};

const num = (value, digits = 1) => (Number.isInteger(value) ? value.toLocaleString('en-US') : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }));
const table = (title, columns, rows) => `**${title}**\n\n| ${columns.join(' | ')} |\n|${columns.map(() => '---').join('|')}|\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;

/** @param {{ ask: (query: string) => Promise<any>, account: string, days: number, now?: number, out: (md: string) => void, namespaces?: Map<string, string> }} options */
export async function reading({ ask, account, days, now = Date.now(), out, namespaces = new Map() }) {
  const schema = await introspect(ask, account);
  out(`${schemaTable(schema)}\n`);
  const plan = readingPlan(schema, activeDays(days));
  if (plan.cut != null) out(`The account keeps ${plan.cut} whole day(s) of this dataset: the window is cut to it.\n\n`);
  const namespaceName = (id) => (id == null ? '(all)' : namespaces.get(id) ?? id);
  const perDay = [];
  for (const day of windowDays(plan.days, now)) {
    const objects = new Map();
    let cut = false;
    const totals = new Map();
    for (const filter of dayFilters(plan, day)) {
      const rows = (await ask(objectsQuery(account, plan, filter)))?.viewer?.accounts?.[0]?.g ?? [];
      if (rows.length >= plan.pageSize) cut = true;
      for (const row of rows) {
        const id = row.dimensions?.objectId;
        if (!id) continue;
        const object = objects.get(id) ?? { ns: row.dimensions?.namespaceId ?? null, raw: 0 };
        object.raw += Number(row.sum?.activeTime ?? 0);
        objects.set(id, object);
      }
      for (const row of (await ask(totalQuery(account, plan, filter)))?.viewer?.accounts?.[0]?.g ?? []) {
        const namespace = row.dimensions?.namespaceId ?? null;
        totals.set(namespace, (totals.get(namespace) ?? 0) + Number(row.sum?.activeTime ?? 0));
      }
    }
    perDay.push({ day, objects, cut, totals });
  }
  let busiest = 0;
  for (const dayReading of perDay) for (const object of dayReading.objects.values()) busiest = Math.max(busiest, object.raw);
  const unit = unitOf(busiest);
  const hoursOf = (raw) => (raw * unit.chosen.s) / 3600;
  out(`**The unit of activeTime** (not in Cloudflare's docs): the busiest object-day reads ${num(busiest, 0)} - ${unit.readings.map((candidate) => `${num(candidate.hours, 2)} h as ${candidate.name}`).join(', ')}. Read as **${unit.chosen.name}**, ${unit.sure ? 'the reading nearest a whole day without passing it (the hub\'s bus is awake all day)' : 'UNSURE: every reading passes a whole day'}.\n\n`);

  const dayRows = [];
  let objectDays = 0;
  for (const dayReading of perDay) {
    const byNamespace = new Map();
    for (const object of dayReading.objects.values()) {
      const entry = byNamespace.get(object.ns) ?? { n: 0, on: 0 };
      entry.n++;
      if (hoursOf(object.raw) > ALWAYS_ON_H) entry.on++;
      byNamespace.set(object.ns, entry);
    }
    for (const [namespace, raw] of dayReading.totals) {
      const dayObjectDays = hoursOf(raw) / 24;
      objectDays += dayObjectDays;
      const entry = byNamespace.get(namespace) ?? { n: 0, on: 0 };
      dayRows.push([dayReading.day, namespaceName(namespace), num(entry.n), dayReading.cut ? `yes (${num(plan.pageSize)})` : 'no', num(entry.on), num(dayObjectDays, 1), `$${num(dayObjectDays * OBJECT_DAY_USD, 2)}`]);
    }
  }
  out(`${table('Day by day (UTC)', ['day', 'namespace', 'objects', 'page cut', `awake > ${ALWAYS_ON_H} h`, 'object_days', 'duration $'], dayRows)}\n`);
  out(`Over the window: ${num(objectDays, 1)} object-days, ${num(objectDays / perDay.length, 1)} a day - $${num((objectDays / perDay.length) * OBJECT_DAY_USD, 2)} a day at $${num(OBJECT_DAY_USD, 3)} an object-day (the bill's duration line divided by it should come to the same).\n\n`);

  const histogram = HOUR_EDGES.map(() => 0);
  let held = 0;
  for (const dayReading of perDay)
    for (const object of dayReading.objects.values()) {
      histogram[bucketOf(hoursOf(object.raw))]++;
      held++;
    }
  out(`${table(`Hours awake a day (the ${num(held)} object-days the pages hold${perDay.some((dayReading) => dayReading.cut) ? '; a cut page leaves out the least awake' : ''})`, ['hours', 'object_days'], HOUR_EDGES.map((edge, index) => [`${index ? HOUR_EDGES[index - 1] : 0}-${edge}`, num(histogram[index])]))}\n`);

  const byObject = new Map();
  for (const dayReading of perDay) {
    for (const [id, object] of dayReading.objects) {
      const entry = byObject.get(id) ?? { ns: object.ns, days: 0, hours: 0, on: 0 };
      entry.days++;
      entry.hours += hoursOf(object.raw);
      if (hoursOf(object.raw) > ALWAYS_ON_H) entry.on++;
      byObject.set(id, entry);
    }
  }
  const top = [...byObject].sort((left, right) => right[1].hours - left[1].hours || (left[0] < right[0] ? -1 : 1)).slice(0, TOP_N);
  out(`${table(`The ${TOP_N} objects awake longest (hours a day over the days each was seen)`, ['object', 'namespace', 'days', 'hours_a_day', `days > ${ALWAYS_ON_H} h`], top.map(([id, entry]) => [`\`${id}\``, namespaceName(entry.ns), num(entry.days), num(entry.hours / entry.days, 1), num(entry.on)]))}\n`);
  return { schema, plan, unit, perDay, objectDays };
}

export function graphqlAsk(token, fetchImpl = fetch) {
  return async (query) => {
    const response = await fetchImpl(GRAPHQL, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000) });
    const body = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) throw new Error(`refused (HTTP ${response.status}) - the token needs Account Analytics: Read`);
    if (!response.ok || !body || body.errors?.length) throw new Error(`not answered (HTTP ${response.status}): ${JSON.stringify(body?.errors ?? body).slice(0, 400)}`);
    return body.data;
  };
}

export async function namespacesOf(token, account, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId(account)}/workers/durable_objects/namespaces?per_page=100`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    const body = await response.json();
    if (!response.ok || !Array.isArray(body?.result)) return new Map();
    return new Map(body.result.map((namespace) => [namespace.id, `${namespace.class ?? namespace.name ?? namespace.id}${namespace.script ? ` (${namespace.script})` : ''}`]));
  } catch {
    return new Map();
  }
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const option = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? '' : null;
  };
  try {
    if (option('--check') != null || argv[0] === '--check') console.log(activeDays(option('--check')));
    else if (option('--account') != null) {
      const token = process.env.CLOUDFLARE_API_TOKEN;
      if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
      const account = accountId(option('--account'));
      const days = activeDays(option('--days'));
      await reading({ ask: graphqlAsk(token), account, days, out: (md) => process.stdout.write(md), namespaces: await namespacesOf(token, account) });
    } else {
      console.error('usage: doActive.mjs --account <id> --days [days] | --check [days]');
      process.exit(2);
    }
  } catch (error) {
    console.error(`::error::${error?.message ?? error}`);
    process.exit(1);
  }
}
