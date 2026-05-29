import type { HomeAssistant } from '../../hass-frontend/src/types';

interface EntityHistoryState {
  s: string;
  lc?: number;
  lu: number;
}

type HistoryStates = Record<string, EntityHistoryState[]>;

interface CacheEntry {
  hourStart: number; // epoch ms of the bucket-start hour this cache was computed for
  values: (number | null)[]; // length = bars - 1 (oldest first); current hour not included
  promise?: Promise<(number | null)[]>;
}

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

function hourStartMs(d: Date): number {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.getTime();
}

function bucketIndex(ts: number, firstHour: number): number {
  return Math.floor((ts - firstHour) / 3600000);
}

interface StatisticValue {
  start: number; // epoch ms of the hour bucket start
  mean?: number | null;
}
type Statistics = Record<string, StatisticValue[]>;

/**
 * Fetch hourly values for the past `bars - 1` hours (excluding the current
 * hour, which the caller already has from entity.state).
 *
 * Primary path: the recorder statistics API, which returns one pre-computed
 * `mean` per hour (~24 samples) for entities with long-term statistics.
 * Fallback: raw history bucketed into hourly averages, for sensors without
 * statistics. Empty buckets carry forward the previous value.
 */
async function fetchHourlyValues(
  hass: HomeAssistant,
  entityId: string,
  bars: number
): Promise<(number | null)[]> {
  const currentHourStart = hourStartMs(new Date());
  const firstHourStart = currentHourStart - (bars - 1) * 3600000;
  const slots: (number | null)[] = new Array(bars - 1).fill(null);

  const filled = await fillFromStatistics(hass, entityId, slots, firstHourStart, currentHourStart);
  if (!filled) {
    await fillFromHistory(hass, entityId, slots, firstHourStart, currentHourStart);
  }

  // Carry-forward fill for empty buckets (e.g. sensor offline that hour).
  let last: number | null = null;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) {
      slots[i] = last;
    } else {
      last = slots[i];
    }
  }

  return slots;
}

/**
 * Fill slots from recorder statistics (hourly mean). Returns true if any
 * value was placed, false if statistics are unavailable for this entity.
 */
async function fillFromStatistics(
  hass: HomeAssistant,
  entityId: string,
  slots: (number | null)[],
  firstHourStart: number,
  currentHourStart: number
): Promise<boolean> {
  let stats: StatisticValue[] = [];
  try {
    const result = await hass.callWS<Statistics>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(firstHourStart).toISOString(),
      end_time: new Date(currentHourStart).toISOString(),
      statistic_ids: [entityId],
      period: 'hour',
      types: ['mean'],
    });
    stats = result?.[entityId] ?? [];
  } catch {
    return false;
  }

  let placed = false;
  for (const s of stats) {
    if (s.mean === null || s.mean === undefined) continue;
    if (s.start < firstHourStart || s.start >= currentHourStart) continue;
    const idx = bucketIndex(s.start, firstHourStart);
    if (idx < 0 || idx >= slots.length) continue;
    slots[idx] = s.mean;
    placed = true;
  }
  return placed;
}

/**
 * Fill slots from raw history, averaging all numeric states within each hour.
 */
async function fillFromHistory(
  hass: HomeAssistant,
  entityId: string,
  slots: (number | null)[],
  firstHourStart: number,
  currentHourStart: number
): Promise<void> {
  const result = await hass.callWS<HistoryStates>({
    type: 'history/history_during_period',
    start_time: new Date(firstHourStart).toISOString(),
    end_time: new Date(currentHourStart).toISOString(),
    minimal_response: true,
    no_attributes: true,
    entity_ids: [entityId],
  });

  const states = result?.[entityId] ?? [];
  const sums = new Array(slots.length).fill(0);
  const counts = new Array(slots.length).fill(0);

  for (const s of states) {
    const ts = (s.lc ?? s.lu) * 1000;
    if (ts < firstHourStart || ts >= currentHourStart) continue;
    const idx = bucketIndex(ts, firstHourStart);
    if (idx < 0 || idx >= slots.length) continue;
    const n = parseFloat(s.s);
    if (isNaN(n)) continue;
    sums[idx] += n;
    counts[idx] += 1;
  }

  for (let i = 0; i < slots.length; i++) {
    if (counts[i] > 0) slots[i] = sums[i] / counts[i];
  }
}

/**
 * Get cached hourly values for an entity, fetching if needed.
 * The cache is keyed on the current hour start - if the wall clock moves into
 * a new hour, the cache is invalidated and a fresh fetch is triggered.
 */
export function getHourlyHistory(
  hass: HomeAssistant,
  entityId: string,
  bars: number
): { values: (number | null)[] | null; promise: Promise<(number | null)[]> } {
  const key = `${entityId}::${bars}`;
  const currentHour = hourStartMs(new Date());
  const existing = cache.get(key);

  if (existing && existing.hourStart === currentHour && !existing.promise) {
    return { values: existing.values, promise: Promise.resolve(existing.values) };
  }

  if (existing?.promise && existing.hourStart === currentHour) {
    return { values: existing.values ?? null, promise: existing.promise };
  }

  const entry: CacheEntry = {
    hourStart: currentHour,
    values: existing?.values ?? [],
  };
  entry.promise = fetchHourlyValues(hass, entityId, bars)
    .then((values) => {
      entry.values = values;
      entry.promise = undefined;
      const subs = subscribers.get(key);
      if (subs) for (const cb of subs) cb();
      return values;
    })
    .catch((err) => {
      entry.promise = undefined;
      // eslint-disable-next-line no-console
      console.warn('[shp] history fetch failed for', entityId, err);
      return entry.values;
    });
  cache.set(key, entry);

  return { values: existing?.hourStart === currentHour ? existing.values : null, promise: entry.promise };
}

export function subscribeHourlyHistory(
  entityId: string,
  bars: number,
  cb: () => void
): () => void {
  const key = `${entityId}::${bars}`;
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subscribers.delete(key);
  };
}

/**
 * Schedule a callback to fire at the next sharp hour boundary, then every hour
 * thereafter. Returns a cleanup function.
 */
export function scheduleHourlyTick(cb: () => void): () => void {
  let intervalId: ReturnType<typeof setInterval> | undefined;
  const now = new Date();
  const msUntilNextHour = 3600000 - (now.getTime() - hourStartMs(now)) + 50; // tiny offset past the boundary
  const timeoutId = setTimeout(() => {
    cb();
    intervalId = setInterval(cb, 3600000);
  }, msUntilNextHour);

  return () => {
    clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
  };
}
