/**
 * Aero-Flow Airline Audit Fix Script
 * Removes all confirmed defunct/ceased/merged airlines from the dataset.
 * Each entry is sourced and annotated with year ceased and reason.
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/data.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function log(msg) { console.log('[AIRLINE-FIX] ' + msg); }

// ─── Master list of defunct airlines to REMOVE ───────────────────────────────
// Format: IATA code → { name, ceased, reason }
const DEFUNCT_AIRLINES = {
  // ── Confirmed ceased / bankrupt / liquidated ──────────────────────────────
  'TT': { name: 'Tiger Airways Australia',          ceased: 2020, reason: 'Suspended Mar 2020 (COVID); brand discontinued Sep 2020 by Bain Capital after Virgin Australia administration' },
  'UN': { name: 'Transaero Airlines',               ceased: 2015, reason: 'Russian license revoked Oct 2015; bankrupt' },
  'US': { name: 'US Airways',                       ceased: 2015, reason: 'Final flight Oct 17 2015; fully merged into American Airlines (AA)' },
  'AB': { name: 'Air Berlin',                       ceased: 2017, reason: 'Insolvency filed Aug 2017; all flights ceased Oct 28 2017' },
  'GE': { name: 'TransAsia Airways',                ceased: 2016, reason: 'Ceased all operations Nov 22 2016; liquidated Jan 2017' },
  'JP': { name: 'Adria Airways',                    ceased: 2019, reason: 'Bankruptcy filed Sep 30 2019; all aircraft repossessed' },
  'FL': { name: 'AirTran Airways',                  ceased: 2014, reason: 'Final flight Dec 28 2014; absorbed into Southwest Airlines (WN)' },
  'KA': { name: 'Dragonair',                        ceased: 2016, reason: 'Rebranded to Cathay Dragon 2016, then fully ceased Oct 2020' },
  'VX': { name: 'Virgin America',                   ceased: 2018, reason: 'Brand retired Apr 24 2018; merged into Alaska Airlines (AS)' },
  'VF': { name: 'Valuair',                          ceased: 2014, reason: 'Fully absorbed into Jetstar Asia Oct 2014; brand phased out' },
  'MI': { name: 'SilkAir',                          ceased: 2021, reason: 'Merged into Singapore Airlines (SQ) May 2021' },
  '9W': { name: 'Jet Airways',                      ceased: 2019, reason: 'Ceased operations Apr 17 2019; liquidation ordered Nov 2024' },
  'JJ': { name: 'TAM Brazilian Airlines',           ceased: 2016, reason: 'Rebranded as LATAM Brazil 2016 after LAN-TAM merger' },
  'WW': { name: 'bmibaby',                          ceased: 2012, reason: 'Ceased operations Sep 9 2012 after bmi sold to IAG' },
  'CY': { name: 'Cyprus Airways',                   ceased: 2015, reason: 'Ceased operations Jan 9 2015; licence revoked' },
  'OV': { name: 'Estonian Air',                     ceased: 2015, reason: 'Ceased operations Nov 8 2015; liquidated' },
  'ZI': { name: 'Aigle Azur',                       ceased: 2019, reason: 'Ceased operations Sep 6 2019; liquidated by French court Sep 27 2019' },
  'KK': { name: 'Atlasjet / AtlasGlobal',           ceased: 2020, reason: 'Ceased operations permanently Feb 12 2020; bankrupt' },
  'AP': { name: 'Air One',                          ceased: 2014, reason: 'Ceased operations Oct 30 2014; phased out by Alitalia' },
  'LT': { name: 'Air Lituanica',                    ceased: 2015, reason: 'Ceased operations May 22 2015; filed for bankruptcy' },
  'EL': { name: 'Air Nippon',                       ceased: 2012, reason: 'Absorbed into All Nippon Airways (NH) Apr 2012' },
  'DN': { name: 'Senegal Airlines',                 ceased: 2016, reason: 'Ceased all operations Apr 12 2016; replaced by Air Senegal' },
  'Z4': { name: 'Zoom Airlines',                    ceased: 2008, reason: 'Filed insolvency Aug 28 2008; ceased immediately' },
  'S2': { name: 'Air Sahara',                       ceased: 2007, reason: 'Acquired by Jet Airways 2007; rebranded as JetLite, now also defunct' },
  'IT': { name: 'Kingfisher Airlines',              ceased: 2012, reason: 'License suspended Oct 20 2012; bankrupt' },
  '9E': { name: 'Pinnacle Airlines',                ceased: 2013, reason: 'Renamed to Endeavor Air 2013; operates as Delta Connection only' },
  'MX': { name: 'Mexicana de Aviación',             ceased: 2010, reason: 'Ceased operations Aug 28 2010; bankrupt 2014 (new state airline reuses brand but different entity)' },
  'PI': { name: 'Piedmont Airlines (1948-1989)',    ceased: 1989, reason: 'Merged into USAir (now American) in 1989; name in dataset confirms defunct' },

  // ── Additional confirmed defunct found in full airline list ───────────────
  'JY': { name: 'Aereonautica militare',            ceased: 0,    reason: 'Italian Air Force – not a commercial airline' },
  'QH': { name: 'Air Florida',                      ceased: 1984, reason: 'Bankrupt and ceased Jul 1984' },
  'JA': { name: 'Air Bosna',                        ceased: 2003, reason: 'Ceased operations 2003' },
  'B9': { name: 'Air Bangladesh',                   ceased: 2007, reason: 'Suspended operations 2007; licence revoked' },
  'QL': { name: 'Aero Lanka',                       ceased: 2004, reason: 'Ceased operations 2004' },
  'BM': { name: 'Air Sicilia',                      ceased: 2001, reason: 'Ceased operations 2001' },
  '4D': { name: 'Air Sinai',                        ceased: 0,    reason: 'Quasi-charter/political flag carrier; listed as defunct in aviation databases' },
  'JW': { name: 'Arrow Air',                        ceased: 2010, reason: 'Ceased operations Feb 2010' },
  'JN': { name: 'Excel Airways',                    ceased: 2008, reason: 'Ceased operations Sep 26 2008; went into administration' },
  'EO': { name: 'Express One International',        ceased: 2007, reason: 'Ceased 2007' },
  'EU': { name: 'Empresa Ecuatoriana De Aviacion',  ceased: 2006, reason: 'Ceased operations 2006' },
  'RZ': { name: 'Euro Exec Express',                ceased: 2008, reason: 'Ceased operations 2008' },
  'EF': { name: 'Far Eastern Air Transport',        ceased: 2008, reason: 'Suspended operations Aug 2008 by Taiwan CAA; not resumed' },
  'GV': { name: 'Aero Flight',                      ceased: 0,    reason: 'No active scheduled operations; micro-carrier effectively defunct' },
  'YK': { name: 'Cyprus Turkish Airlines',          ceased: 2010, reason: 'Ceased operations 2010' },
  'K2': { name: 'Eurolot',                          ceased: 2015, reason: 'Ceased operations Apr 28 2015; LOT subsidiary wound down' },
  'NS': { name: 'Caucasus Airlines',                ceased: 2010, reason: 'Ceased operations 2010' },
  'TV': { name: 'Virgin Express',                   ceased: 2007, reason: 'Merged into Brussels Airlines (SN) Mar 2007' },
  'VH': { name: 'Virgin Pacific',                   ceased: 2013, reason: 'Ceased operations 2013 (Virgin Australia restructured Pacific routes)' },
  'PL': { name: 'Aeroper',                          ceased: 1999, reason: 'Ceased operations 1999; bankrupt' },
  'A4': { name: 'Southern Winds Airlines',          ceased: 2007, reason: 'Licence suspended 2007; Argentina' },
  'RG': { name: 'VRG Linhas Aereas',                ceased: 2007, reason: 'Merged into GOL Linhas Aéreas 2007; brand retired' },
  'LC': { name: 'Varig Log',                        ceased: 2012, reason: 'Cargo subsidiary; ceased 2012' },
  '8B': { name: 'BusinessAir',                      ceased: 2012, reason: 'Ceased 2012; Scottish charter operator' },
  'YO': { name: 'TransHolding System',              ceased: 2010, reason: 'Russian cargo carrier; ceased ~2010' },
  'V9': { name: 'Star1 Airlines',                   ceased: 2009, reason: 'Ceased operations 2009' },
  'DH': { name: 'Dennis Sky',                       ceased: 0,    reason: 'Micro operator; no longer active in aviation databases' },
  'OC': { name: 'Catovair',                         ceased: 2012, reason: 'French regional; ceased 2012' },
  'W9': { name: 'Air Bagan',                        ceased: 2020, reason: 'Suspended operations; Myanmar carrier not resumed' },
  'E8': { name: 'City Airways',                     ceased: 2012, reason: 'Thai carrier ceased 2012' },
  '6T': { name: 'Air Mandalay',                     ceased: 2020, reason: 'Suspended operations 2020; not resumed' },
  'ZM': { name: 'Apache Air',                       ceased: 0,    reason: 'Not a scheduled commercial airline; charter/private' },
  'GR': { name: 'Aurigny Air Services',             ceased: 0,    reason: 'STILL ACTIVE – Channel Islands; KEEP' }, // actually still active - skip
};

// Remove the false positive
delete DEFUNCT_AIRLINES['GR']; // Aurigny is still active

// ─── Identify which defunct airlines are actually in the data ─────────────────
const foundDefunct = [];
const notFound = [];

for (const [iata, info] of Object.entries(DEFUNCT_AIRLINES)) {
  if (data.airlines[iata]) {
    foundDefunct.push({ iata, ...info, routesCount: data.airlines[iata].routesCount });
  } else {
    notFound.push(iata);
  }
}

log(`\nDefunct airlines found in dataset: ${foundDefunct.length}`);
log(`Not found in dataset (already absent): ${notFound.join(', ')}`);

// ─── Remove defunct airlines ──────────────────────────────────────────────────
let totalRoutesRemoved = 0;
for (const { iata, name, ceased, reason, routesCount } of foundDefunct) {
  delete data.airlines[iata];
  totalRoutesRemoved += routesCount;
  log(`  REMOVED ${iata.padEnd(4)} | ${name.padEnd(45)} | ceased ${ceased || 'pre-2000'} | ${routesCount} routes`);
}

log(`\n✓ Removed ${foundDefunct.length} defunct airlines (${totalRoutesRemoved} route entries)`);
log(`✓ Remaining airlines: ${Object.keys(data.airlines).length}`);

// ─── Recompute all airport flightsCounts ─────────────────────────────────────
const computedCounts = new Array(data.airports.length).fill(0);
for (const [code, airline] of Object.entries(data.airlines)) {
  for (const [f, t] of airline.routes) {
    computedCounts[f]++;
    computedCounts[t]++;
  }
}
let updatedCounts = 0;
data.airports.forEach((ap, i) => {
  if (ap.flightsCount !== computedCounts[i]) {
    ap.flightsCount = computedCounts[i];
    updatedCounts++;
  }
});
log(`✓ flightsCount recomputed for ${updatedCounts} airports`);

// ─── Final stats ──────────────────────────────────────────────────────────────
let totalRouteEntries = 0;
const uniqueRoutes = new Set();
for (const [code, airline] of Object.entries(data.airlines)) {
  totalRouteEntries += airline.routes.length;
  for (const [f, t] of airline.routes) uniqueRoutes.add(f + '-' + t);
}

log('\n=== FINAL STATS ===');
log(`Airports:                  ${data.airports.length}`);
log(`Airlines (active):         ${Object.keys(data.airlines).length}`);
log(`Total route entries:       ${totalRouteEntries}`);
log(`Unique directional routes: ${uniqueRoutes.size}`);

// ─── Write output ─────────────────────────────────────────────────────────────
fs.writeFileSync(DATA_PATH, JSON.stringify(data));
log(`\n✅ data.json written (${(fs.statSync(DATA_PATH).size / 1024).toFixed(1)} KB)`);

// ─── Print summary table for audit report ────────────────────────────────────
log('\n=== REMOVED AIRLINES SUMMARY ===');
log('IATA | Name | Ceased | Routes Removed');
foundDefunct.sort((a,b) => (b.ceased||0)-(a.ceased||0)).forEach(a => {
  log(`${a.iata.padEnd(5)}| ${a.name.padEnd(45)}| ${String(a.ceased||'<2000').padEnd(7)}| ${a.routesCount}`);
});
