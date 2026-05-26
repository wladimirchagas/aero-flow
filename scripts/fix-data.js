/**
 * Aero-Flow Data Fix Script
 * Applies all issues found in the 2026-05-27 audit:
 *   1. Add BER (Berlin Brandenburg), migrate TXL + SXF routes to it, remove TXL & SXF
 *   2. Remove NAY (Beijing Nanyuan, closed 2019), reassign routes to PEK
 *   3. Fix isolated airports PAC & GOM (set flightsCount to 0, no route data exists)
 *   4. Fix city name typos: CSX, NGB, MAA
 *   5. Recompute all flightsCount values from actual route data
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// ─── Utility ────────────────────────────────────────────────────────────────

function log(msg) { console.log('[FIX] ' + msg); }

// ─── STEP 1: Fix city name typos ─────────────────────────────────────────────

const typoFixes = {
  CSX: { city: 'Changsha' },   // was 'Changcha'
  NGB: { city: 'Ningbo' },     // was 'Ninbo'
  MAA: { city: 'Chennai' },    // was 'Madras'
};

let typoCount = 0;
for (const ap of data.airports) {
  if (typoFixes[ap.iata]) {
    const fix = typoFixes[ap.iata];
    log(`Typo fix: ${ap.iata} city "${ap.city}" → "${fix.city}"`);
    Object.assign(ap, fix);
    typoCount++;
  }
}
log(`✓ ${typoCount} city name typos fixed`);

// ─── STEP 2: Fix isolated airports (PAC, GOM) ────────────────────────────────

const isolatedFix = ['PAC', 'GOM'];
for (const ap of data.airports) {
  if (isolatedFix.includes(ap.iata)) {
    log(`Isolated airport fix: ${ap.iata} flightsCount ${ap.flightsCount} → 0 (no route data)`);
    ap.flightsCount = 0;
  }
}
log('✓ Isolated airport flightsCounts zeroed');

// ─── STEP 3: Add BER (Berlin Brandenburg Airport) ────────────────────────────

if (!data.airports.find(a => a.iata === 'BER')) {
  const ber = {
    iata: 'BER',
    name: 'Berlin Brandenburg Airport',
    city: 'Berlin',
    country: 'Germany',
    lat: 52.3671,
    lon: 13.5033,
    flightsCount: 0   // will be recomputed in step 7
  };
  data.airports.push(ber);
  log(`Added BER at index ${data.airports.length - 1}`);
} else {
  log('BER already exists, skipping add');
}

// ─── STEP 4: Build index maps (current state, before removals) ───────────────

function buildIndexMap(airports) {
  const byIata = {};
  airports.forEach((ap, i) => { byIata[ap.iata] = i; });
  return byIata;
}

let indexMap = buildIndexMap(data.airports);

// Airports to remove after route migration
const toRemove = ['TXL', 'SXF', 'NAY'];
// Airports to redirect their routes to
const redirectTo = {
  TXL: 'BER',
  SXF: 'BER',
  NAY: 'PEK',
};

// ─── STEP 5: Rewrite all route indices (redirect deprecated airports) ─────────

log('Redirecting routes for deprecated airports...');
let redirectedLegs = 0;
const redirectStats = { TXL: 0, SXF: 0, NAY: 0 };

for (const [code, airline] of Object.entries(data.airlines)) {
  for (let i = 0; i < airline.routes.length; i++) {
    let [fromIdx, toIdx] = airline.routes[i];
    let changed = false;

    for (const [deprecatedIata, targetIata] of Object.entries(redirectTo)) {
      const depIdx = indexMap[deprecatedIata];
      const tgtIdx = indexMap[targetIata];
      if (depIdx === undefined || tgtIdx === undefined) continue;

      if (fromIdx === depIdx) { fromIdx = tgtIdx; changed = true; redirectStats[deprecatedIata]++; }
      if (toIdx === depIdx)   { toIdx   = tgtIdx; changed = true; redirectStats[deprecatedIata]++; }
    }

    if (changed) {
      airline.routes[i] = [fromIdx, toIdx];
      redirectedLegs++;
    }
  }
}

for (const [iata, count] of Object.entries(redirectStats)) {
  log(`  ${iata} → ${redirectTo[iata]}: ${count} route endpoints redirected`);
}
log(`✓ ${redirectedLegs} route legs updated`);

// ─── STEP 6: Remove self-loops introduced by the redirect (e.g. BER→BER) ─────

let selfLoopsRemoved = 0;
for (const [code, airline] of Object.entries(data.airlines)) {
  const before = airline.routes.length;
  airline.routes = airline.routes.filter(([f, t]) => f !== t);
  const removed = before - airline.routes.length;
  if (removed > 0) {
    selfLoopsRemoved += removed;
    airline.routesCount = airline.routes.length;
  }
}
log(`✓ ${selfLoopsRemoved} self-loop routes removed after redirect`);

// ─── STEP 7: Remove deprecated airports and remap all route indices ───────────

const removeIndices = new Set(toRemove.map(iata => indexMap[iata]).filter(i => i !== undefined));
log(`Removing airport indices: ${[...removeIndices].join(', ')} (${toRemove.join(', ')})`);

// Build a mapping: old index → new index (after removal)
const oldToNew = {};
let newIdx = 0;
for (let oldIdx = 0; oldIdx < data.airports.length; oldIdx++) {
  if (removeIndices.has(oldIdx)) {
    oldToNew[oldIdx] = null; // removed
  } else {
    oldToNew[oldIdx] = newIdx++;
  }
}

// Remap all routes
let remappedRoutes = 0;
for (const [code, airline] of Object.entries(data.airlines)) {
  airline.routes = airline.routes.map(([f, t]) => {
    const nf = oldToNew[f];
    const nt = oldToNew[t];
    if (nf === null || nt === null) {
      // Shouldn't happen after redirect step - but log if it does
      log(`WARNING: Route ${f}→${t} in airline ${code} still references removed airport!`);
      return null;
    }
    return [nf, nt];
  }).filter(r => r !== null);
  const newCount = airline.routes.length;
  if (airline.routesCount !== newCount) {
    airline.routesCount = newCount;
  }
  remappedRoutes += airline.routes.length;
}

// Remove deprecated airports from the array
const newAirports = data.airports.filter((_, i) => !removeIndices.has(i));
const removedNames = toRemove.map(iata => {
  const ap = data.airports[indexMap[iata]];
  return ap ? `${iata} (${ap.name})` : iata;
});
log(`Removed airports: ${removedNames.join(', ')}`);
data.airports = newAirports;
log(`✓ Airport array: ${data.airports.length} airports (was ${data.airports.length + removeIndices.size})`);

// ─── STEP 8: Remove duplicate routes introduced by merging (e.g. both TXL→LHR and SXF→LHR now BER→LHR) ──

let dupsRemoved = 0;
for (const [code, airline] of Object.entries(data.airlines)) {
  const seen = new Set();
  const before = airline.routes.length;
  airline.routes = airline.routes.filter(([f, t]) => {
    const key = f + '-' + t;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const removed = before - airline.routes.length;
  if (removed > 0) {
    dupsRemoved += removed;
    airline.routesCount = airline.routes.length;
  }
}
log(`✓ ${dupsRemoved} duplicate routes removed after airport merging`);

// ─── STEP 9: Recompute flightsCount for ALL airports ─────────────────────────

const computedCounts = new Array(data.airports.length).fill(0);
for (const [code, airline] of Object.entries(data.airlines)) {
  for (const [f, t] of airline.routes) {
    computedCounts[f]++;
    computedCounts[t]++;
  }
}

let updatedCounts = 0;
data.airports.forEach((ap, i) => {
  const computed = computedCounts[i];
  if (ap.flightsCount !== computed) {
    updatedCounts++;
    ap.flightsCount = computed;
  }
});
log(`✓ flightsCount recomputed for ${updatedCounts} airports`);

// ─── STEP 10: Verify ──────────────────────────────────────────────────────────

const finalIndexMap = buildIndexMap(data.airports);
const maxIdx = data.airports.length - 1;
let verifyErrors = 0;

for (const [code, airline] of Object.entries(data.airlines)) {
  for (const [f, t] of airline.routes) {
    if (f < 0 || f > maxIdx || t < 0 || t > maxIdx) {
      log(`VERIFY ERROR: airline ${code} route [${f},${t}] out of range!`);
      verifyErrors++;
    }
    if (f === t) {
      log(`VERIFY ERROR: airline ${code} self-loop at index ${f}`);
      verifyErrors++;
    }
  }
}

for (const iata of toRemove) {
  if (finalIndexMap[iata] !== undefined) {
    log(`VERIFY ERROR: ${iata} still present in airports!`);
    verifyErrors++;
  }
}
for (const addIata of ['BER']) {
  if (finalIndexMap[addIata] === undefined) {
    log(`VERIFY ERROR: ${addIata} not found after fix!`);
    verifyErrors++;
  }
}

const berAp = data.airports[finalIndexMap['BER']];
log(`BER check: ${JSON.stringify(berAp)}`);

if (verifyErrors === 0) {
  log('✓ All verification checks passed!');
} else {
  log(`✗ ${verifyErrors} verification errors found!`);
  process.exit(1);
}

// ─── STEP 11: Final stats ────────────────────────────────────────────────────

let totalRouteEntries = 0;
const uniqueRoutes = new Set();
for (const [code, airline] of Object.entries(data.airlines)) {
  totalRouteEntries += airline.routes.length;
  for (const [f, t] of airline.routes) {
    uniqueRoutes.add(f + '-' + t);
  }
}

log('\n=== FINAL STATS ===');
log(`Airports:              ${data.airports.length}`);
log(`Airlines:              ${Object.keys(data.airlines).length}`);
log(`Total route entries:   ${totalRouteEntries}`);
log(`Unique directional routes: ${uniqueRoutes.size}`);

// ─── STEP 12: Write output ────────────────────────────────────────────────────

fs.writeFileSync(DATA_PATH, JSON.stringify(data));
log(`\n✅ data.json written (${(fs.statSync(DATA_PATH).size / 1024).toFixed(1)} KB)`);
