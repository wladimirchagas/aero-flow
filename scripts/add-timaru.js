/**
 * Aero-Flow Add Timaru (TIU) and NZ routes
 * Sourced from official Air New Zealand schedules:
 *   - Airport: Richard Pearse Airport (TIU) in Timaru, New Zealand
 *   - Routes: Air New Zealand (NZ) Wellington (WLG) <-> Timaru (TIU)
 *             Air New Zealand (NZ) Christchurch (CHC) <-> Timaru (TIU)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[TIU-ADD] ' + msg); }

const tiuIata = 'TIU';
let tiuIdx = data.airports.findIndex(a => a.iata === tiuIata);

if (tiuIdx === -1) {
  const tiu = {
    iata: 'TIU',
    name: 'Richard Pearse Airport',
    city: 'Timaru',
    country: 'New Zealand',
    lat: -44.301,
    lon: 171.225,
    flightsCount: 0 // Will be computed below
  };
  data.airports.push(tiu);
  tiuIdx = data.airports.length - 1;
  log(`Added TIU airport at index ${tiuIdx}`);
} else {
  log(`TIU airport already exists at index ${tiuIdx}`);
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
  [wlgIdx, tiuIdx],
  [tiuIdx, wlgIdx],
  [chcIdx, tiuIdx],
  [tiuIdx, chcIdx]
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
