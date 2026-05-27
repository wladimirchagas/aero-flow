#!/usr/bin/env python3
import urllib.request
import csv
import json
import os
import sys

# Define target paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Datasets URLs
AIRPORTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"
AIRLINES_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat"
ROUTES_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat"
COUNTRIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"

def download_file(url, desc):
    print(f"Downloading {desc} from {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Error downloading {desc}: {e}")
        sys.exit(1)

def main():
    # 1. Download world countries boundaries
    countries_geojson = download_file(COUNTRIES_URL, "UN / sovereign country borders GeoJSON")
    countries_path = os.path.join(DATA_DIR, "countries.geojson")
    with open(countries_path, "w", encoding="utf-8") as f:
        f.write(countries_geojson)
    print(f"Saved country boundaries to {countries_path}")

    # 2. Download OpenFlights data
    airports_raw = download_file(AIRPORTS_URL, "OpenFlights Airports")
    airlines_raw = download_file(AIRLINES_URL, "OpenFlights Airlines")
    routes_raw = download_file(ROUTES_URL, "OpenFlights Routes")

    # 3. Parse Airports
    print("Parsing airports...")
    airports_dict = {}
    reader = csv.reader(airports_raw.strip().splitlines())
    for row in reader:
        if len(row) < 8:
            continue
        ap_id = row[0]
        name = row[1]
        city = row[2]
        country = row[3]
        iata = row[4]
        icao = row[5]
        try:
            lat = float(row[6])
            lon = float(row[7])
        except ValueError:
            continue

        # Keep airports with valid IATA (3-letter code) and coordinates
        if iata and len(iata) == 3 and iata != "\\N":
            airports_dict[ap_id] = {
                "id": ap_id,
                "iata": iata,
                "name": name,
                "city": city,
                "country": country,
                "lat": lat,
                "lon": lon,
                "flightsCount": 0
            }
            # Also register by IATA for routes matching
            airports_dict[iata] = airports_dict[ap_id]

    print(f"Successfully parsed {len(set(id(v) for v in airports_dict.values()))} unique IATA airports.")

    # 4. Parse Airlines
    print("Parsing airlines...")
    airlines_dict = {}
    reader = csv.reader(airlines_raw.strip().splitlines())
    for row in reader:
        if len(row) < 8:
            continue
        al_id = row[0]
        name = row[1]
        iata = row[3]
        icao = row[4]
        active = row[7]

        # Only keep active airlines with 2-letter IATA code
        if active == "Y" and iata and len(iata) == 2 and iata != "\\N":
            airlines_dict[iata] = {
                "name": name,
                "iata": iata,
                "routesCount": 0,
                "routes": [] # routes stored as indices [src_idx, dst_idx]
            }

    # Inject manual active airlines that are missing or obsolete in the OpenFlights database
    airlines_dict["BF"] = {
        "name": "French Bee",
        "iata": "BF",
        "routesCount": 0,
        "routes": []
    }
    airlines_dict["VB"] = {
        "name": "VivaAerobus",
        "iata": "VB",
        "routesCount": 0,
        "routes": []
    }

    print(f"Successfully parsed {len(airlines_dict)} active airlines (including manual additions).")

    # 5. Parse Routes & Match
    print("Parsing and matching routes...")
    reader = csv.reader(routes_raw.strip().splitlines())
    routes_list = []
    
    # We will first gather all valid routes connecting parsed airports
    for row in reader:
        if len(row) < 6:
            continue
        # Skip codeshare routes (row[6] is codeshare indicator, usually 'Y')
        if len(row) > 6 and row[6] == "Y":
            continue
        al_iata = row[0]
        src_iata = row[2]
        dst_iata = row[4]

        # Verify source and destination exist in our airports dictionary
        if src_iata in airports_dict and dst_iata in airports_dict and al_iata in airlines_dict:
            src_ap = airports_dict[src_iata]
            dst_ap = airports_dict[dst_iata]
            
            # Avoid self-loops
            if src_ap["iata"] == dst_ap["iata"]:
                continue

            routes_list.append({
                "airline": al_iata,
                "src": src_ap["iata"],
                "dst": dst_ap["iata"]
            })

    # Inject manual long-haul routes for French Bee (BF) connecting ORY, EWR, SFO, LAX, MIA, PPT, RUN
    manual_routes = [
        {"airline": "BF", "src": "ORY", "dst": "EWR"},
        {"airline": "BF", "src": "EWR", "dst": "ORY"},
        {"airline": "BF", "src": "ORY", "dst": "SFO"},
        {"airline": "BF", "src": "SFO", "dst": "ORY"},
        {"airline": "BF", "src": "ORY", "dst": "LAX"},
        {"airline": "BF", "src": "LAX", "dst": "ORY"},
        {"airline": "BF", "src": "ORY", "dst": "MIA"},
        {"airline": "BF", "src": "MIA", "dst": "ORY"},
        {"airline": "BF", "src": "SFO", "dst": "PPT"},
        {"airline": "BF", "src": "PPT", "dst": "SFO"},
        {"airline": "BF", "src": "ORY", "dst": "RUN"},
        {"airline": "BF", "src": "RUN", "dst": "ORY"}
    ]
    for mr in manual_routes:
        if mr["src"] in airports_dict and mr["dst"] in airports_dict:
            src_ap = airports_dict[mr["src"]]
            dst_ap = airports_dict[mr["dst"]]
            routes_list.append({
                "airline": mr["airline"],
                "src": src_ap["iata"],
                "dst": dst_ap["iata"]
            })

    print(f"Total initial matching routes: {len(routes_list)}")

    # 6. Count airport frequencies & filter down to top busiest airports
    # This prevents the client from loading too many unused/small airports, optimizing memory.
    for r in routes_list:
        airports_dict[r["src"]]["flightsCount"] += 1
        airports_dict[r["dst"]]["flightsCount"] += 1

    # Extract unique airport records (avoiding duplicates from double ID/IATA indexing)
    # Since only original airport IDs are purely numeric strings (digits), filtering by digits isolates them!
    unique_airports = [v for k, v in airports_dict.items() if k.isdigit()]
    
    # Sort by activity count and slice top 1800 airports
    unique_airports.sort(key=lambda x: x["flightsCount"], reverse=True)
    
    # Keep the top 1800 busiest airports (this easily includes Paris, Melbourne, Singapore, all major hubs)
    retained_airports = unique_airports[:1800]
    retained_iata_set = set(ap["iata"] for ap in retained_airports)
    
    print(f"Retained top {len(retained_airports)} busiest airports.")

    # Re-index airports to create a compact array for the client
    # Clean up the dictionaries so they are small
    client_airports = []
    iata_to_index = {}
    for idx, ap in enumerate(retained_airports):
        client_airports.append({
            "iata": ap["iata"],
            "name": ap["name"],
            "city": ap["city"],
            "country": ap["country"],
            "lat": round(ap["lat"], 3),
            "lon": round(ap["lon"], 3),
            "flightsCount": ap["flightsCount"]
        })
        iata_to_index[ap["iata"]] = idx

    # Filter routes to only connect retained airports, and build index-based route lists
    final_routes_count = 0
    for r in routes_list:
        if r["src"] in retained_iata_set and r["dst"] in retained_iata_set:
            src_idx = iata_to_index[r["src"]]
            dst_idx = iata_to_index[r["dst"]]
            al_iata = r["airline"]
            
            airlines_dict[al_iata]["routes"].append([src_idx, dst_idx])
            airlines_dict[al_iata]["routesCount"] += 1
            final_routes_count += 1

    # Clean up airlines: only keep airlines with at least one active route
    client_airlines = {}
    for al_iata, al in airlines_dict.items():
        if al["routesCount"] > 0:
            client_airlines[al_iata] = {
                "name": al["name"],
                "iata": al["iata"],
                "routes": al["routes"],
                "routesCount": al["routesCount"]
            }

    print(f"Final retained active airlines: {len(client_airlines)}")
    print(f"Final retained flight routes: {final_routes_count}")

    # Compile the final data bundle
    output_bundle = {
        "airports": client_airports,
        "airlines": client_airlines
    }

    # Save to file
    output_path = os.path.join(DATA_DIR, "data.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_bundle, f, ensure_ascii=False, separators=(',', ':'))
        
    print(f"Successfully processed datasets! Saved optimized data bundle to {output_path}")
    print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")

if __name__ == "__main__":
    main()
