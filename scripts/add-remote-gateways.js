/**
 * Aero-Flow Add Missing Remote Gateways
 * Injects geographically / culturally significant extreme-remote airports and their routes:
 *   1. Seymour Airport (GPS) in Galapagos Islands, Ecuador (served by LATAM [LA] and Avianca [AV] from Quito [UIO] and Guayaquil [GYE])
 *   2. Saint Helena Airport (HLE), Saint Helena (served by Airlink [4Z] from Johannesburg [JNB])
 *   3. Mount Pleasant Airport (MPN), Falkland Islands (served by LATAM [LA] from Santiago [SCL] and Punta Arenas [PUQ])
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[GATEWAY-ADD] ' + msg); }

// --- 1. Ensure Airlink (4Z) is registered in data.airlines ---
if (!data.airlines['4Z']) {
  data.airlines['4Z'] = {
    name: 'Airlink',
    iata: '4Z',
    routes: [],
    routesCount: 0
  };
  log("Registered new airline: Airlink (4Z)");
}

// --- 2. Define remote gateways to add ---
const newGateways = [
  {
    iata: 'GPS',
    name: 'Seymour Airport',
    city: 'Baltra Island',
    country: 'Ecuador',
    lat: -0.454,
    lon: -90.266,
    routes: [
      { airline: 'LA', endpoint: 'UIO' },
      { airline: 'LA', endpoint: 'GYE' },
      { airline: 'AV', endpoint: 'UIO' },
      { airline: 'AV', endpoint: 'GYE' }
    ]
  },
  {
    iata: 'HLE',
    name: 'Saint Helena Airport',
    city: 'Jamestown',
    country: 'United Kingdom',
    lat: -15.961,
    lon: -5.645,
    routes: [
      { airline: '4Z', endpoint: 'JNB' }
    ]
  },
  {
    iata: 'MPN',
    name: 'Mount Pleasant Airport',
    city: 'Mount Pleasant',
    country: 'United Kingdom',
    lat: -51.823,
    lon: -58.447,
    routes: [
      { airline: 'LA', endpoint: 'SCL' },
      { airline: 'LA', endpoint: 'PUQ' }
    ]
  }
];

let addedAirports = 0;
let addedRoutes = 0;

for (const gw of newGateways) {
  let apIdx = data.airports.findIndex(a => a.iata === gw.iata);
  
  if (apIdx === -1) {
    const ap = {
      iata: gw.iata,
      name: gw.name,
      city: gw.city,
      country: gw.country,
      lat: gw.lat,
      lon: gw.lon,
      flightsCount: 0
    };
    data.airports.push(ap);
    apIdx = data.airports.length - 1;
    addedAirports++;
    log(`Added airport: ${gw.iata} (${gw.name}) at index ${apIdx}`);
  } else {
    log(`Airport ${gw.iata} already exists at index ${apIdx}`);
  }

  // Add routes in both directions
  for (const r of gw.routes) {
    const endIdx = data.airports.findIndex(a => a.iata === r.endpoint);
    if (endIdx === -1) {
      log(`Warning: Endpoint airport ${r.endpoint} not found for ${gw.iata} route!`);
      continue;
    }

    const al = data.airlines[r.airline];
    if (!al) {
      log(`Warning: Airline ${r.airline} not found for ${gw.iata} route!`);
      continue;
    }

    const directedRoutes = [
      [apIdx, endIdx],
      [endIdx, apIdx]
    ];

    for (const [f, t] of directedRoutes) {
      const exists = al.routes.some(([rf, rt]) => rf === f && rt === t);
      if (!exists) {
        al.routes.push([f, t]);
        al.routesCount = al.routes.length;
        addedRoutes++;
        log(`Added route: ${r.airline} | ${data.airports[f].iata} -> ${data.airports[t].iata}`);
      }
    }
  }
}

if (addedAirports > 0 || addedRoutes > 0) {
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
  log('No new gateways or routes were added.');
}
