/**
 * Aero-Flow Add Wanaka (WKA) and NZ routes
 *   - Airport: Wanaka Airport (WKA) in Wanaka, New Zealand
 *   - Routes: Air New Zealand (NZ) Christchurch (CHC) <-> Wanaka (WKA)
 *             Air New Zealand (NZ) Wellington (WLG) <-> Wanaka (WKA)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[WKA-ADD] ' + msg); }

const wkaIata = 'WKA';
let wkaIdx = data.airports.findIndex(a => a.iata === wkaIata);

if (wkaIdx === -1) {
  // If not found in database, we add it. 
  // Note: WKA is already in the database from process_data.py but with 0 flightsCount!
  const wka = {
    iata: 'WKA',
    name: 'Wanaka Airport',
    city: 'Wanaka',
    country: 'New Zealand',
    lat: -44.722,
    lon: 169.246,
    flightsCount: 0
  };
  data.airports.push(wka);
  wkaIdx = data.airports.length - 1;
  log(`Added WKA airport at index ${wkaIdx}`);
} else {
  log(`WKA airport already exists at index ${wkaIdx}`);
}

const wlgIata = 'WLG';
const wlgIdx = data.airports.findIndex(a => a.iata === wlgIata);

const chcIata = 'CHC';
const chcIdx = data.airports.findIndex(a => a.iata === chcIata);

if (wlgIdx === -1) {
  log(`Error: Wellington (WLG) airport not found in dataset!`);
  process.exit(1);
}
if (chcIdx === -1) {
  log(`Error: Christchurch (CHC) airport not found in dataset!`);
  process.exit(1);
}

const al = data.airlines['NZ'];
if (!al) {
  log(`Error: Air New Zealand (NZ) airline not found in dataset!`);
  process.exit(1);
}

const newRoutes = [
  [wlgIdx, wkaIdx],
  [wkaIdx, wlgIdx],
  [chcIdx, wkaIdx],
  [wkaIdx, chcIdx]
];

let addedCount = 0;
for (const [f, t] of newRoutes) {
  const exists = al.routes.some(([rf, rt]) => rf === f && rt === t);
  if (!exists) {
    al.routes.push([f, t]);
    addedCount++;
    log(`Added route: NZ | ${data.airports[f].iata} -> ${data.airports[t].iata}`);
  }
}

if (addedCount > 0) {
  al.routesCount = al.routes.length;

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
  
  // Save updated data.json
  fs.writeFileSync(DATA_PATH, JSON.stringify(data));
  log(`Successfully wrote data.json!`);
} else {
  log('No new routes were added.');
}
