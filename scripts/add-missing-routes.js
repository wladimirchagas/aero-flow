/**
 * Aero-Flow Add Missing Intercontinental Routes
 * Sourced from 2026 commercial airline routes:
 *   1. LATAM (LA): Santiago (SCL) <-> Melbourne (MEL) [LA805]
 *   2. Qantas (QF): Perth (PER) <-> Johannesburg (JNB) [QF65/QF66]
 *   3. LATAM (LA): São Paulo (GRU) <-> Johannesburg (JNB) [LA8059/LA8058]
 *   4. South African Airways (SA): São Paulo (GRU) <-> Cape Town (CPT) [SA226/SA227]
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[ADD-ROUTES] ' + msg); }

const newRoutes = [
  { airline: 'LA', from: 'SCL', to: 'MEL' },
  { airline: 'LA', from: 'MEL', to: 'SCL' },
  { airline: 'QF', from: 'PER', to: 'JNB' },
  { airline: 'QF', from: 'JNB', to: 'PER' },
  { airline: 'LA', from: 'GRU', to: 'JNB' },
  { airline: 'LA', from: 'JNB', to: 'GRU' },
  { airline: 'SA', from: 'GRU', to: 'CPT' },
  { airline: 'SA', from: 'CPT', to: 'GRU' }
];

let addedCount = 0;

for (const nr of newRoutes) {
  const al = data.airlines[nr.airline];
  if (!al) {
    log(`Warning: Airline ${nr.airline} not found in dataset!`);
    continue;
  }

  const fromIdx = data.airports.findIndex(a => a.iata === nr.from);
  const toIdx = data.airports.findIndex(a => a.iata === nr.to);

  if (fromIdx === -1 || toIdx === -1) {
    log(`Warning: Airport ${nr.from} or ${nr.to} not found in dataset!`);
    continue;
  }

  // Check if route already exists
  const exists = al.routes.some(([f, t]) => f === fromIdx && t === toIdx);
  if (!exists) {
    al.routes.push([fromIdx, toIdx]);
    al.routesCount = al.routes.length;
    addedCount++;
    log(`Added route: ${nr.airline} | ${nr.from} (${fromIdx}) -> ${nr.to} (${toIdx})`);
  } else {
    log(`Route already exists: ${nr.airline} | ${nr.from} -> ${nr.to}`);
  }
}

if (addedCount > 0) {
  // Recompute flightsCount for all airports
  const computedCounts = new Array(data.airports.length).fill(0);
  for (const [code, airline] of Object.entries(data.airlines)) {
    for (const [f, t] of airline.routes) {
      computedCounts[f]++;
      computedCounts[t]++;
    }
  }

  let updatedAirportsCount = 0;
  data.airports.forEach((ap, i) => {
    if (ap.flightsCount !== computedCounts[i]) {
      ap.flightsCount = computedCounts[i];
      updatedAirportsCount++;
    }
  });

  log(`Recomputed flightsCount for ${updatedAirportsCount} airports.`);
  
  // Write updated data.json
  fs.writeFileSync(DATA_PATH, JSON.stringify(data));
  log(`Successfully wrote ${addedCount} new routes to data.json!`);
} else {
  log('No new routes added.');
}
