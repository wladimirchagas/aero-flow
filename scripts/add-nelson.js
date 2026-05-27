/**
 * Aero-Flow Add Nelson (NSN) and NZ routes
 *   - Airport: Nelson Airport (NSN) in Nelson, New Zealand
 *   - Routes: Air New Zealand (NZ) Wellington (WLG) <-> Nelson (NSN)
 *             Air New Zealand (NZ) Christchurch (CHC) <-> Nelson (NSN)
 *             Air New Zealand (NZ) Auckland (AKL) <-> Nelson (NSN)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[NSN-ADD] ' + msg); }

const nsnIata = 'NSN';
let nsnIdx = data.airports.findIndex(a => a.iata === nsnIata);

if (nsnIdx === -1) {
  const nsn = {
    iata: 'NSN',
    name: 'Nelson Airport',
    city: 'Nelson',
    country: 'New Zealand',
    lat: -41.298,
    lon: 173.221,
    flightsCount: 0
  };
  data.airports.push(nsn);
  nsnIdx = data.airports.length - 1;
  log(`Added NSN airport at index ${nsnIdx}`);
} else {
  log(`NSN airport already exists at index ${nsnIdx}`);
}

const wlgIata = 'WLG';
const wlgIdx = data.airports.findIndex(a => a.iata === wlgIata);

const chcIata = 'CHC';
const chcIdx = data.airports.findIndex(a => a.iata === chcIata);

const aklIata = 'AKL';
const aklIdx = data.airports.findIndex(a => a.iata === aklIata);

if (wlgIdx === -1 || chcIdx === -1 || aklIdx === -1) {
  log(`Error: Main NZ airports not found in dataset!`);
  process.exit(1);
}

const al = data.airlines['NZ'];
if (!al) {
  log(`Error: Air New Zealand (NZ) airline not found in dataset!`);
  process.exit(1);
}

const newRoutes = [
  [wlgIdx, nsnIdx],
  [nsnIdx, wlgIdx],
  [chcIdx, nsnIdx],
  [nsnIdx, chcIdx],
  [aklIdx, nsnIdx],
  [nsnIdx, aklIdx]
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
