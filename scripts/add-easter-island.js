/**
 * Aero-Flow Add Easter Island (IPC) and SCL-IPC Route
 * Sourced from official LATAM Chile schedules:
 *   - Airport: Mataveri International Airport (IPC) in Easter Island, Chile
 *   - Route: LATAM (LA) Santiago (SCL) <-> Easter Island (IPC)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[IPC-ADD] ' + msg); }

const ipcIata = 'IPC';
let ipcIdx = data.airports.findIndex(a => a.iata === ipcIata);

if (ipcIdx === -1) {
  const ipc = {
    iata: 'IPC',
    name: 'Mataveri International Airport',
    city: 'Easter Island',
    country: 'Chile',
    lat: -27.165,
    lon: -109.422,
    flightsCount: 0 // Will be computed below
  };
  data.airports.push(ipc);
  ipcIdx = data.airports.length - 1;
  log(`Added IPC airport at index ${ipcIdx}`);
} else {
  log(`IPC airport already exists at index ${ipcIdx}`);
}

const sclIata = 'SCL';
const sclIdx = data.airports.findIndex(a => a.iata === sclIata);

if (sclIdx === -1) {
  log(`Error: Santiago (SCL) airport not found in dataset!`);
  process.exit(1);
}

const al = data.airlines['LA'];
if (!al) {
  log(`Error: LATAM (LA) airline not found in dataset!`);
  process.exit(1);
}

const newRoutes = [
  [sclIdx, ipcIdx],
  [ipcIdx, sclIdx]
];

let addedCount = 0;
for (const [f, t] of newRoutes) {
  const exists = al.routes.some(([rf, rt]) => rf === f && rt === t);
  if (!exists) {
    al.routes.push([f, t]);
    addedCount++;
    log(`Added route: LA | ${data.airports[f].iata} -> ${data.airports[t].iata}`);
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
