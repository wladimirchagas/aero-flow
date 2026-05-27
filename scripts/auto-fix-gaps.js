/**
 * Aero-Flow Auto-Fix Connectivity Gaps Script
 * Automatically identifies all unconnected airports (flightsCount === 0) globally,
 * finds their closest active geographical hub in the same country (or globally),
 * and connects them bidirectionally via the busiest airline serving that hub.
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[AUTO-GAP-FIX] ' + msg); }

// Geodesic distance calculation on sphere (approximate)
function getSphericalDistance(ap1, ap2) {
  const rad = Math.PI / 180;
  const lat1 = ap1.lat * rad;
  const lat2 = ap2.lat * rad;
  const lon1 = ap1.lon * rad;
  const lon2 = ap2.lon * rad;

  // Haversine formula
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c; // returns distance in radians
}

const airports = data.airports;
const airlines = data.airlines;

log(`Initial total airports: ${airports.length}`);

// Step 1: Identify initially active airports (flightsCount > 0)
// We pre-compute this so we don't dynamically target newly connected airports as hubs
const activeAirportsSet = new Set();
airports.forEach((ap, idx) => {
  if (ap.flightsCount > 0) {
    activeAirportsSet.add(idx);
  }
});

log(`Initially active airports (hubs): ${activeAirportsSet.size}`);
log(`Initially unconnected airports to fix: ${airports.length - activeAirportsSet.size}`);

// Step 2: Pre-compute busiest airline for each active airport
// Busiest airline = airline with the most routes touching this airport index
const busiestAirlineCache = new Map(); // apIdx -> airlineIata

activeAirportsSet.forEach(apIdx => {
  const counts = new Map(); // alIata -> routeCount
  Object.entries(airlines).forEach(([alIata, al]) => {
    al.routes.forEach(r => {
      if (r[0] === apIdx || r[1] === apIdx) {
        counts.set(alIata, (counts.get(alIata) || 0) + 1);
      }
    });
  });

  let busiestAl = 'NZ'; // Default fallback
  let maxCount = -1;
  counts.forEach((cnt, alIata) => {
    if (cnt > maxCount) {
      maxCount = cnt;
      busiestAl = alIata;
    }
  });

  busiestAirlineCache.set(apIdx, busiestAl);
});

// Step 3: For each unconnected airport, find the closest active hub and add route
let fixedCount = 0;
let routeAddedCount = 0;

airports.forEach((ap, idx) => {
  if (ap.flightsCount > 0) return; // Already connected!

  // 1. Filter active airports in the same country
  let potentialHubs = [...activeAirportsSet].filter(hIdx => airports[hIdx].country === ap.country);
  
  // If no active airports in the same country, search globally
  if (potentialHubs.length === 0) {
    potentialHubs = [...activeAirportsSet];
  }

  if (potentialHubs.length === 0) {
    log(`Warning: No active hubs found globally for ${ap.city} (${ap.iata})`);
    return;
  }

  // 2. Find closest geographical hub
  let closestHubIdx = -1;
  let minDistance = Infinity;

  potentialHubs.forEach(hIdx => {
    const hub = airports[hIdx];
    const dist = getSphericalDistance(ap, hub);
    if (dist < minDistance) {
      minDistance = dist;
      closestHubIdx = hIdx;
    }
  });

  if (closestHubIdx !== -1) {
    const hub = airports[closestHubIdx];
    // 3. Determine airline
    const alIata = busiestAirlineCache.get(closestHubIdx) || 'NZ';
    const al = airlines[alIata];

    if (al) {
      // Add bidirectional routes
      al.routes.push([idx, closestHubIdx]);
      al.routes.push([closestHubIdx, idx]);
      al.routesCount = al.routes.length;
      
      routeAddedCount += 2;
      fixedCount++;
      
      // Proactively print NZ/AU additions to show they are fixed
      if (ap.country === 'New Zealand' || ap.country === 'Australia') {
        log(`Connected: ${ap.city} (${ap.iata}) ↔ ${hub.city} (${hub.iata}) via ${alIata} [Distance: ${Math.round(minDistance * 6371)} km]`);
      }
    }
  }
});

log(`Total unconnected airports successfully connected: ${fixedCount}`);
log(`Total bidirectional route segments injected: ${routeAddedCount}`);

// Step 4: Recompute flightsCount for all airports
const computedCounts = new Array(airports.length).fill(0);
Object.entries(airlines).forEach(([code, airline]) => {
  airline.routes.forEach(r => {
    computedCounts[r[0]]++;
    computedCounts[r[1]]++;
  });
});

let updatedAirportsCount = 0;
airports.forEach((ap, i) => {
  if (ap.flightsCount !== computedCounts[i]) {
    ap.flightsCount = computedCounts[i];
    updatedAirportsCount++;
  }
});

log(`Recomputed flightsCount for ${updatedAirportsCount} airports.`);

// Step 5: Save updated data.json
fs.writeFileSync(DATA_PATH, JSON.stringify(data));
log(`Successfully wrote database update to data.json!`);
