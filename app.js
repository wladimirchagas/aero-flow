/* AeroFlow - Application Logic */

// Global App State
const state = {
    // Datasets
    countriesGeoJSON: null,
    airports: [],
    airlines: {},
    routesCount: 0,
    
    // Projections & Rendering
    projectionType: 'flat', // 'globe' or 'flat'
    projection: null,
    path: null,
    canvas: null,
    ctx: null,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,

    // Interaction & View
    scale: {
        globe: 300,
        flat: 240
    },
    zoom: 1,
    rotation: [0, -20, 0], // [lambda, phi, gamma]
    translation: [0, 0],
    isDragging: false,
    dragStart: [0, 0],
    dragRotationStart: [0, 0],
    dragTranslationStart: [0, 0],

    // Animation control
    autoRotate: false,
    rotationSpeed: 0.1, // degrees per frame
    lastFrameTime: 0,
    animFrameId: null,

    // Filtering State
    activeTab: 'airline', // 'airline' or 'location'
    connectionType: 'direct', // 'direct' or 'connecting'
    activeFilter: {
        type: null, // 'airline' or 'location'
        value: null // airline IATA code or airport index
    },
    
    // Render cache / animated items
    activeRoutes: [],
    particles: [], // animating planes
    selectedAirportIndex: null,
    hoveredItem: null // airport or route under cursor
};

// Colors (matching CSS variables)
const themeColors = {
    bgBase: '#06040a',
    ocean: '#090615',
    landFill: '#141022',
    landStroke: '#251e3c',
    graticule: '#1b162f',
    unBorder: '#382b68',
    routeInactive: 'rgba(121, 82, 245, 0.08)',
    routeActive: '#00f2fe',
    routeActiveGlow: 'rgba(0, 242, 254, 0.4)',
    routeLocation: '#ff3377',
    routeLocationGlow: 'rgba(255, 51, 119, 0.4)',
    airportBase: '#7952f5',
    airportGlow: 'rgba(121, 82, 245, 0.5)',
    airportActive: '#00f2fe',
    particleCyan: '#00f2fe',
    particlePink: '#ff3377'
};

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', () => {
    try {
        initCanvas();
        initUI();
        loadData();
    } catch (err) {
        console.error("Critical initialization failure:", err);
        const loader = document.getElementById('loader-text');
        if (loader) {
            loader.innerText = "Startup Error: " + err.message;
            loader.style.color = "#ff3377";
        }
    }
    
    // Resize handler
    window.addEventListener('resize', handleResize);
});

// Canvas Setup
function initCanvas() {
    state.canvas = document.getElementById('mapCanvas');
    state.ctx = state.canvas.getContext('2d');
    
    resizeCanvas();
    setupProjections();
    setupInteractions();
}

function resizeCanvas() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    
    state.canvas.width = state.width * state.devicePixelRatio;
    state.canvas.height = state.height * state.devicePixelRatio;
    
    state.canvas.style.width = `${state.width}px`;
    state.canvas.style.height = `${state.height}px`;
    
    state.ctx.scale(state.devicePixelRatio, state.devicePixelRatio);
}

function handleResize() {
    resizeCanvas();
    setupProjections();
    render();
}

// Setup Projections (D3 Integration)
function setupProjections() {
    const center = [state.width / 2 + (state.width > 768 ? 100 : 0), state.height / 2]; // Offset map slightly to the right to clear sidebar on desktop
    
    if (state.projectionType === 'globe') {
        state.projection = d3.geoOrthographic()
            .scale(state.scale.globe * state.zoom)
            .translate(center)
            .rotate(state.rotation)
            .clipAngle(90);
    } else {
        state.projection = d3.geoEqualEarth()
            .scale(state.scale.flat * state.zoom)
            .translate([center[0] + state.translation[0], center[1] + state.translation[1]])
            .rotate([state.rotation[0], 0, 0]); // Equal Earth only supports longitudinal rotation well in 2D
    }
    
    state.path = d3.geoPath()
        .projection(state.projection)
        .context(state.ctx);
}

// Setup Drag & Zoom interactions on the canvas
function setupInteractions() {
    const canvas = state.canvas;
    
    // Drag control
    canvas.addEventListener('mousedown', (e) => {
        state.isDragging = true;
        state.dragStart = [e.clientX, e.clientY];
        state.dragRotationStart = [...state.rotation];
        state.dragTranslationStart = [...state.translation];
        
        if (state.autoRotate) {
            // Stop rotation temporarily during drag
            toggleAutoRotate(false);
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        // Proximity detection for tooltips
        handleHoverProximity(e);
        
        if (!state.isDragging) return;
        
        const dx = e.clientX - state.dragStart[0];
        const dy = e.clientY - state.dragStart[1];
        
        if (state.projectionType === 'globe') {
            // Globe rotation formula
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            state.rotation[1] = state.dragRotationStart[1] - dy * sensitivity;
            
            // Constrain latitude on globe
            state.rotation[1] = Math.max(-85, Math.min(85, state.rotation[1]));
        } else {
            // Flat map panning & longitudinal rotation
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            
            // vertical translate
            state.translation[1] = state.dragTranslationStart[1] + dy;
            state.translation[0] = state.dragTranslationStart[0] + dx * 0.5; // slow down horiz
        }
        
        setupProjections();
        render();
    });
    
    window.addEventListener('mouseup', () => {
        state.isDragging = false;
    });
    
    // Zoom control
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSensitivity = 0.08;
        const oldZoom = state.zoom;
        
        if (e.deltaY < 0) {
            state.zoom = Math.min(5, state.zoom + zoomSensitivity * state.zoom);
        } else {
            state.zoom = Math.max(0.6, state.zoom - zoomSensitivity * state.zoom);
        }
        
        setupProjections();
        render();
    }, { passive: false });
}

// Fetch files and load data
async function loadData() {
    const loadingScreen = document.getElementById('loading-screen');
    const progressFill = document.getElementById('progress-fill');
    const loaderText = document.getElementById('loader-text');
    
    try {
        // Step 1: Load boundaries
        loaderText.innerText = "Loading global UN borders...";
        progressFill.style.width = "25%";
        const geojsonRes = await fetch('data/countries.geojson?v=' + Date.now());
        state.countriesGeoJSON = await geojsonRes.json();
        
        // Step 2: Load flight databases
        loaderText.innerText = "Indexing routes database...";
        progressFill.style.width = "60%";
        const dataRes = await fetch('data/data.json?v=' + Date.now());
        const aerodata = await dataRes.json();
        
        state.airports = aerodata.airports;
        state.airlines = aerodata.airlines;
        
        // Count total routes
        state.routesCount = 0;
        Object.values(state.airlines).forEach(al => {
            state.routesCount += al.routesCount;
        });

        // Lucide Icons activation
        lucide.createIcons();
        
        // Initial filter setup to show default "global heartbeat" corridors
        resetFilter();
        
        // Complete loader
        progressFill.style.width = "100%";
        loaderText.innerText = "Ready!";
        
        setTimeout(() => {
            loadingScreen.style.opacity = 0;
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                // Trigger animation loop
                startAnimationLoop();
            }, 500);
        }, 500);
        
    } catch (err) {
        console.error("Failed to load aerodata:", err);
        loaderText.innerText = "Error loading data. Retrying...";
        loaderText.style.color = "#ff3377";
    }
}

// Initialize UI Panel controls and listeners
function initUI() {
    // 1. Sidebar tab switching
    const tabAirline = document.getElementById('tab-airline');
    const tabLocation = document.getElementById('tab-location');
    const searchAirlineCont = document.getElementById('search-airline-container');
    const searchLocationCont = document.getElementById('search-location-container');
    
    tabAirline.addEventListener('click', () => {
        state.activeTab = 'airline';
        tabAirline.classList.add('active');
        tabAirline.setAttribute('aria-selected', 'true');
        tabLocation.classList.remove('active');
        tabLocation.setAttribute('aria-selected', 'false');
        
        searchAirlineCont.classList.add('active');
        searchLocationCont.classList.remove('active');
        
        // Clear suggestions
        hideSuggestions();
    });
    
    tabLocation.addEventListener('click', () => {
        state.activeTab = 'location';
        tabLocation.classList.add('active');
        tabLocation.setAttribute('aria-selected', 'true');
        tabAirline.classList.remove('active');
        tabAirline.setAttribute('aria-selected', 'false');
        
        searchLocationCont.classList.add('active');
        searchAirlineCont.classList.remove('active');
        
        // Clear suggestions
        hideSuggestions();
    });

    // 2. Search Autocomplete
    const airInput = document.getElementById('airline-search');
    const locInput = document.getElementById('location-search');
    
    airInput.addEventListener('input', (e) => handleSearchInput('airline', e.target.value));
    locInput.addEventListener('input', (e) => handleSearchInput('location', e.target.value));
    
    // Clear input buttons
    const clearAir = document.getElementById('clear-airline');
    const clearLoc = document.getElementById('clear-location');
    
    clearAir.addEventListener('click', () => {
        airInput.value = '';
        clearAir.style.display = 'none';
        hideSuggestions();
    });
    
    clearLoc.addEventListener('click', () => {
        locInput.value = '';
        clearLoc.style.display = 'none';
        hideSuggestions();
    });
    
    // 3. Projections switching
    const btnGlobe = document.getElementById('btn-globe');
    const btnFlat = document.getElementById('btn-flat');
    const projInfo = document.getElementById('projection-info-text');
    
    btnGlobe.addEventListener('click', () => {
        if (state.projectionType === 'globe') return;
        state.projectionType = 'globe';
        btnGlobe.classList.add('active');
        btnFlat.classList.remove('active');
        projInfo.innerText = "Orthographic projection: Drag to rotate the planet. Scroll to zoom. Great-circle curves represent real flight paths.";
        setupProjections();
        render();
    });
    
    btnFlat.addEventListener('click', () => {
        if (state.projectionType === 'flat') return;
        state.projectionType = 'flat';
        btnFlat.classList.add('active');
        btnGlobe.classList.remove('active');
        projInfo.innerText = "Equal Earth projection: A true-to-earth flat projection showing highly accurate sizes of all landmasses. Drag to pan, scroll to zoom.";
        setupProjections();
        render();
    });

    // 4. Floating HUD Control buttons
    document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
        state.zoom = Math.min(5, state.zoom + 0.2);
        setupProjections();
        render();
    });
    
    document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
        state.zoom = Math.max(0.6, state.zoom - 0.2);
        setupProjections();
        render();
    });
    
    document.getElementById('ctrl-reset').addEventListener('click', () => {
        state.zoom = 1;
        state.rotation = [0, -20, 0];
        state.translation = [0, 0];
        setupProjections();
        render();
    });
    
    const btnAutoRotate = document.getElementById('ctrl-auto-rotate');
    btnAutoRotate.addEventListener('click', () => {
        toggleAutoRotate(!state.autoRotate);
    });

    // 5. Close Pill button
    document.getElementById('filter-pill-close').addEventListener('click', () => {
        resetFilter();
    });

    // 6. Connection Type toggle buttons
    const btnDirect = document.getElementById('btn-direct');
    const btnConnecting = document.getElementById('btn-connecting');
    
    btnDirect.addEventListener('click', () => {
        if (state.connectionType === 'direct') return;
        state.connectionType = 'direct';
        btnDirect.classList.add('active');
        btnConnecting.classList.remove('active');
        reapplyActiveFilter();
    });
    
    btnConnecting.addEventListener('click', () => {
        if (state.connectionType === 'connecting') return;
        state.connectionType = 'connecting';
        btnConnecting.classList.add('active');
        btnDirect.classList.remove('active');
        reapplyActiveFilter();
    });
}

// Re-apply active filters when toggling modes
function reapplyActiveFilter() {
    if (state.activeFilter.type === 'airline') {
        setAirlineFilter(state.activeFilter.value);
    } else if (state.activeFilter.type === 'location') {
        setLocationFilter(state.activeFilter.value);
    } else {
        resetFilter();
    }
}

// Enable/Disable auto rotation
function toggleAutoRotate(enabled) {
    state.autoRotate = enabled;
    const btn = document.getElementById('ctrl-auto-rotate');
    if (enabled) {
        btn.classList.add('active');
        btn.querySelector('i').setAttribute('data-lucide', 'play');
        lucide.createIcons();
    } else {
        btn.classList.remove('active');
        btn.querySelector('i').setAttribute('data-lucide', 'pause');
        lucide.createIcons();
    }
}

// Autocomplete logic
function handleSearchInput(type, query) {
    const clearBtn = document.getElementById(type === 'airline' ? 'clear-airline' : 'clear-location');
    const suggestList = document.getElementById(type === 'airline' ? 'airline-suggestions' : 'location-suggestions');
    
    if (!query || query.trim().length < 2) {
        clearBtn.style.display = 'none';
        suggestList.style.display = 'none';
        return;
    }
    
    clearBtn.style.display = 'block';
    
    const cleanQuery = query.toLowerCase().trim();
    let matches = [];
    
    if (type === 'airline') {
        // Match active airlines
        Object.values(state.airlines).forEach(al => {
            if (al.name.toLowerCase().includes(cleanQuery) || al.iata.toLowerCase().includes(cleanQuery)) {
                matches.push(al);
            }
        });
        // Sort matches by route count
        matches.sort((a, b) => b.routesCount - a.routesCount);
        renderAirlineSuggestions(matches.slice(0, 6));
    } else {
        // Match airports
        state.airports.forEach((ap, index) => {
            if (
                ap.iata.toLowerCase().includes(cleanQuery) || 
                ap.city.toLowerCase().includes(cleanQuery) || 
                ap.name.toLowerCase().includes(cleanQuery) || 
                ap.country.toLowerCase().includes(cleanQuery)
            ) {
                matches.push({ ...ap, originalIndex: index });
            }
        });
        // Sort by busiest
        matches.sort((a, b) => b.flightsCount - a.flightsCount);
        renderLocationSuggestions(matches.slice(0, 6));
    }
}

function renderAirlineSuggestions(matches) {
    const list = document.getElementById('airline-suggestions');
    list.innerHTML = '';
    
    if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item"><span class="title">No airlines found</span></div>`;
        list.style.display = 'block';
        return;
    }
    
    matches.forEach(al => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="title">${al.name}</span>
            <div class="subtitle">
                <span>Code: ${al.iata}</span>
                <span class="sub-badge">${al.routesCount} routes</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            setAirlineFilter(al.iata);
            hideSuggestions();
            document.getElementById('airline-search').value = '';
            document.getElementById('clear-airline').style.display = 'none';
        });
        
        list.appendChild(item);
    });
    
    list.style.display = 'block';
}

function renderLocationSuggestions(matches) {
    const list = document.getElementById('location-suggestions');
    list.innerHTML = '';
    
    if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item"><span class="title">No airports found</span></div>`;
        list.style.display = 'block';
        return;
    }
    
    matches.forEach(ap => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <span class="title">${ap.city} (${ap.iata})</span>
            <div class="subtitle">
                <span>${ap.name}</span>
                <span class="sub-badge">${ap.flightsCount} flights</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            setLocationFilter(ap.originalIndex);
            hideSuggestions();
            document.getElementById('location-search').value = '';
            document.getElementById('clear-location').style.display = 'none';
        });
        
        list.appendChild(item);
    });
    
    list.style.display = 'block';
}

function hideSuggestions() {
    document.getElementById('airline-suggestions').style.display = 'none';
    document.getElementById('location-suggestions').style.display = 'none';
}

// Filters implementation
function setAirlineFilter(iata) {
    const al = state.airlines[iata];
    if (!al) return;
    
    state.activeFilter = { type: 'airline', value: iata };
    state.selectedAirportIndex = null;
    
    // Process active routes
    state.activeRoutes = al.routes.map(r => ({
        src: state.airports[r[0]],
        dst: state.airports[r[1]],
        airline: iata,
        type: 'direct'
    }));
    
    // Focus view towards airline hubs (average coordinates of its routes)
    focusCameraOnRoutes(state.activeRoutes);
    
    // Initialize flow particles
    initParticles();
    
    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Selected Airline: ${al.name}`;
    
    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes);
    document.getElementById('stat-routes').innerText = al.routesCount;
    
    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "HQ Country";
    document.getElementById('stat-extra-value').innerText = al.name.split(' ').pop(); // fallback abbreviation or standard
    // FindHQ if exists, otherwise display flight info
    state.airports.forEach(ap => {
        if(ap.iata === iata) document.getElementById('stat-extra-value').innerText = ap.country;
    });
    
    // Hubs list
    displayAirlineHubs(al);
}

function setLocationFilter(apIdx) {
    apIdx = parseInt(apIdx);
    const ap = state.airports[apIdx];
    if (!ap) return;
    
    state.activeFilter = { type: 'location', value: apIdx };
    state.selectedAirportIndex = apIdx;
    
    state.activeRoutes = [];
    
    // 1. Gather all direct routes first (A -> H)
    const directConnectedSet = new Set();
    const directRoutes = [];
    
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === apIdx || r[1] === apIdx) {
                const src = state.airports[r[0]];
                const dst = state.airports[r[1]];
                
                // Track which airport is connected directly
                const otherIdx = r[0] === apIdx ? r[1] : r[0];
                directConnectedSet.add(otherIdx);
                
                directRoutes.push({
                    src: src,
                    dst: dst,
                    airline: alIata,
                    type: 'direct'
                });
            }
        });
    });
    
    state.activeRoutes.push(...directRoutes);
    
    // 2. If 'connecting' type selected, compute 2-hop layovers (Paris -> Hub -> Destination)
    if (state.connectionType === 'connecting') {
        const connectingRoutes = [];
        const seenConnectingDest = new Set();
        
        // Loop through all direct connected airports (layover hubs)
        directConnectedSet.forEach(hubIdx => {
            // Find routes outbound from this hub
            Object.entries(state.airlines).forEach(([alIata, al]) => {
                al.routes.forEach(r => {
                    if (r[0] === hubIdx) {
                        const destIdx = r[1];
                        
                        // Destination must not be the starting airport, and not already directly connected
                        if (destIdx !== apIdx && !directConnectedSet.has(destIdx)) {
                            const key = `${hubIdx}-${destIdx}`;
                            if (!seenConnectingDest.has(key)) {
                                seenConnectingDest.add(key);
                                
                                connectingRoutes.push({
                                    src: state.airports[hubIdx],
                                    dst: state.airports[destIdx],
                                    airline: alIata,
                                    type: 'connecting'
                                });
                            }
                        }
                    }
                });
            });
        });
        
        // Sort connecting destinations by busiest
        connectingRoutes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        
        // Keep up to 250 connecting paths to ensure fluid 60 FPS canvas performance
        state.activeRoutes.push(...connectingRoutes.slice(0, 250));
    }
    
    // Focus camera directly on airport
    focusCameraOnPoints([[ap.lon, ap.lat]]);
    
    // Initialize flow particles
    initParticles();
    
    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Selected Location: ${ap.city} (${ap.iata})`;
    
    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes) - 1;
    document.getElementById('stat-routes').innerText = state.activeRoutes.length;
    
    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airport Code";
    document.getElementById('stat-extra-value').innerText = `${ap.iata} / ${ap.country.substring(0, 8)}`;
    
    // Airlines operating list
    displayLocationAirlines(apIdx);
}

function resetFilter() {
    state.activeFilter = { type: null, value: null };
    state.selectedAirportIndex = null;
    
    // Default mode: display top 300 busiest international routes globally for gorgeous heartbeat
    state.activeRoutes = [];
    let gatheredCount = 0;
    
    // Slice active routes from first few busy airlines
    const majorAirlines = Object.values(state.airlines)
        .sort((a, b) => b.routesCount - a.routesCount)
        .slice(0, 18);
        
    majorAirlines.forEach(al => {
        al.routes.forEach(r => {
            if (gatheredCount < 300) {
                state.activeRoutes.push({
                    src: state.airports[r[0]],
                    dst: state.airports[r[1]],
                    airline: al.iata
                });
                gatheredCount++;
            }
        });
    });
    
    initParticles();
    
    // UI Reset
    document.getElementById('active-filter-pill').style.display = 'none';
    
    // Reset global stats
    document.getElementById('stat-airports').innerText = state.airports.length;
    document.getElementById('stat-routes').innerText = state.routesCount;
    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airlines Indexed";
    document.getElementById('stat-extra-value').innerText = Object.keys(state.airlines).length;
    
    document.getElementById('stats-desc-text').innerText = "Showing the global commercial flights network. Search and select an airline or an airport above to analyze specific routes and connectivity hubs.";
    document.getElementById('top-hubs-container').style.display = 'none';
}

// Focus D3 camera projection on specific set of points
function focusCameraOnPoints(points) {
    if (points.length === 0) return;
    
    // Average coordinates
    let avgLon = 0, avgLat = 0;
    points.forEach(p => {
        avgLon += p[0];
        avgLat += p[1];
    });
    
    avgLon /= points.length;
    avgLat /= points.length;
    
    // Smoothly animate rotation
    animateRotation([-avgLon, -avgLat, 0]);
}

function focusCameraOnRoutes(routes) {
    if (routes.length === 0) return;
    const coords = [];
    routes.forEach(r => {
        coords.push([r.src.lon, r.src.lat]);
        coords.push([r.dst.lon, r.dst.lat]);
    });
    focusCameraOnPoints(coords);
}

function animateRotation(targetRotation) {
    // Basic linear interpolation animation
    const duration = 45; // frames
    let frame = 0;
    const startRot = [...state.rotation];
    
    // Ensure longitudinal rotation wraps short way
    let diffLon = targetRotation[0] - startRot[0];
    while (diffLon < -180) diffLon += 360;
    while (diffLon > 180) diffLon -= 360;
    
    const targetLon = startRot[0] + diffLon;
    
    function step() {
        frame++;
        const t = frame / duration;
        // Ease out quadratic
        const ease = 1 - (1 - t) * (1 - t);
        
        state.rotation[0] = startRot[0] + (targetLon - startRot[0]) * ease;
        state.rotation[1] = startRot[1] + (targetRotation[1] - startRot[1]) * ease;
        state.rotation[2] = 0;
        
        setupProjections();
        render();
        
        if (frame < duration) {
            requestAnimationFrame(step);
        }
    }
    
    requestAnimationFrame(step);
}

// Count unique airports in active routes list
function getUniqueAirportsCount(routes) {
    const uniqueSet = new Set();
    routes.forEach(r => {
        uniqueSet.add(r.src.iata);
        uniqueSet.add(r.dst.iata);
    });
    return uniqueSet.size;
}

// Side panel statistical analysis
function displayAirlineHubs(al) {
    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    const descText = document.getElementById('stats-desc-text');
    
    descText.innerText = `Visualizing flight connections for ${al.name} (${al.iata}). It operates ${al.routesCount} direct flights connecting airports around the globe.`;
    
    // Tally hub frequencies
    const hubs = {};
    al.routes.forEach(r => {
        const src = state.airports[r[0]];
        const dst = state.airports[r[1]];
        hubs[src.city] = (hubs[src.city] || 0) + 1;
        hubs[dst.city] = (hubs[dst.city] || 0) + 1;
    });
    
    // Sort hubs
    const sortedHubs = Object.entries(hubs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
        
    topHubsList.innerHTML = '';
    sortedHubs.forEach(([city, count]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">${city}</span><span class="hub-count">${count} routes</span>`;
        topHubsList.appendChild(li);
    });
    
    topHubsContainer.style.display = 'block';
    topHubsContainer.querySelector('h3').innerText = "Top Airline Hubs";
}

function displayLocationAirlines(apIdx) {
    const ap = state.airports[apIdx];
    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    const descText = document.getElementById('stats-desc-text');
    
    descText.innerText = `Visualizing all direct inbound and outbound routes for ${ap.name} in ${ap.city}, ${ap.country}. Serving as a connection node for ${state.activeRoutes.length} global paths.`;
    
    // Tally airline frequencies
    const opAirlines = {};
    state.activeRoutes.forEach(r => {
        const al = state.airlines[r.airline];
        if (al) {
            opAirlines[al.name] = (opAirlines[al.name] || 0) + 1;
        }
    });
    
    const sortedAirlines = Object.entries(opAirlines)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
        
    topHubsList.innerHTML = '';
    sortedAirlines.forEach(([name, count]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">${name}</span><span class="hub-count">${count} flights</span>`;
        topHubsList.appendChild(li);
    });
    
    topHubsContainer.style.display = 'block';
    topHubsContainer.querySelector('h3').innerText = "Key Carriers Operating";
}

// Setup flow particles along paths
function initParticles() {
    state.particles = [];
    const maxParticles = Math.min(120, state.activeRoutes.length);
    
    // Select subset of routes to spawn particles along
    const indices = [];
    for (let i = 0; i < state.activeRoutes.length; i++) indices.push(i);
    // Shuffle indices
    indices.sort(() => Math.random() - 0.5);
    
    const particlesToSpawn = indices.slice(0, maxParticles);
    
    particlesToSpawn.forEach(idx => {
        const r = state.activeRoutes[idx];
        state.particles.push({
            route: r,
            progress: Math.random(), // distribute positions along paths initially
            speed: 0.003 + Math.random() * 0.003,
            color: r.type === 'connecting' ? 'rgba(0, 242, 254, 0.7)' : (state.activeFilter.type === 'location' ? themeColors.particlePink : themeColors.particleCyan)
        });
    });
}

// Draw the entire scene on Canvas
function render() {
    const ctx = state.ctx;
    const path = state.path;
    const proj = state.projection;
    
    // 1. Clear Screen
    ctx.clearRect(0, 0, state.width, state.height);
    
    // 2. Draw Sphere Background (Globe mode only)
    if (state.projectionType === 'globe') {
        ctx.beginPath();
        path({ type: 'Sphere' });
        ctx.fillStyle = themeColors.ocean;
        ctx.fill();
        
        // Graticule grid lines
        ctx.beginPath();
        path(d3.geoGraticule()());
        ctx.strokeStyle = themeColors.graticule;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    
    // 3. Draw Country Shapes & UN Borders
    if (state.countriesGeoJSON) {
        ctx.beginPath();
        path(state.countriesGeoJSON);
        ctx.fillStyle = themeColors.landFill;
        ctx.fill();
        
        ctx.strokeStyle = themeColors.landStroke;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        
        // Highlights UN recognized boundaries extra fine glow
        ctx.strokeStyle = themeColors.unBorder;
        ctx.lineWidth = 0.4;
        ctx.stroke();
    }
    
    // 4. Draw Flight Connections (Arcs)
    drawFlightRoutes();
    
    // 5. Draw Flight Particles (Planes)
    drawParticles();
    
    // 6. Draw Airports
    drawAirports();
}

function drawFlightRoutes() {
    const ctx = state.ctx;
    const path = state.path;
    
    state.activeRoutes.forEach(r => {
        // Generate line geometry
        const lineGeo = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [[r.src.lon, r.src.lat], [r.dst.lon, r.dst.lat]]
            }
        };
        
        ctx.beginPath();
        path(lineGeo);
        
        if (state.activeFilter.type) {
            if (r.type === 'connecting') {
                ctx.setLineDash([3, 4]); // Dashed line for layovers
                ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)'; // Semitransparent cyan
                ctx.lineWidth = 0.9;
                ctx.shadowBlur = 0;
            } else {
                ctx.setLineDash([]); // Solid line for direct flights
                ctx.strokeStyle = state.activeFilter.type === 'location' ? themeColors.routeLocation : themeColors.routeActive;
                ctx.shadowColor = state.activeFilter.type === 'location' ? themeColors.routeLocation : themeColors.routeActive;
                ctx.shadowBlur = 4;
                ctx.lineWidth = 1.6;
            }
        } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = themeColors.routeInactive;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0.8;
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    });
    
    // Always reset line dash for other drawings
    ctx.setLineDash([]);
}

function drawParticles() {
    const ctx = state.ctx;
    const proj = state.projection;
    
    // Identify visible center point for globe clipping
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];
    
    state.particles.forEach(p => {
        // Interpolate along the arc between airports
        const interpolator = d3.geoInterpolate([p.route.src.lon, p.route.src.lat], [p.route.dst.lon, p.route.dst.lat]);
        const currentCoords = interpolator(p.progress);
        
        // Clip particles behind globe
        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, currentCoords);
            if (dist > Math.PI / 2) return; // Point is on back side of globe
        }
        
        // Project coordinates to pixel coordinates
        const px = proj(currentCoords);
        if (!px) return;
        
        // Draw plane particle
        ctx.beginPath();
        ctx.arc(px[0], px[1], 2, 0, 2 * Math.PI);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Update position for animation loop
        p.progress += p.speed;
        if (p.progress >= 1.0) {
            p.progress = 0; // loop back to origin airport
        }
    });
}

function drawAirports() {
    const ctx = state.ctx;
    const proj = state.projection;
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];
    
    // Draw only a small set of busiest airports if no filters are selected, to optimize canvas drawing
    const limit = state.activeFilter.type ? state.airports.length : 150;
    
    for (let i = 0; i < limit; i++) {
        const ap = state.airports[i];
        
        // Clip back of globe
        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue;
        }
        
        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;
        
        const isSelected = state.selectedAirportIndex === i;
        
        if (isSelected) {
            // Pulse Halo ring around selected airport
            const pulseRadius = 5 + (Date.now() % 1000) / 100 * 1.5;
            ctx.beginPath();
            ctx.arc(px[0], px[1], pulseRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = themeColors.routeLocation;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(px[0], px[1], 5, 0, 2 * Math.PI);
            ctx.fillStyle = themeColors.routeLocation;
            ctx.fill();
        } else {
            // standard airport dot
            ctx.beginPath();
            ctx.arc(px[0], px[1], state.activeFilter.type ? 2 : 1.5, 0, 2 * Math.PI);
            ctx.fillStyle = state.activeFilter.type ? themeColors.airportActive : themeColors.airportBase;
            ctx.fill();
        }
    }
}

// Proximity detection on mousemove for tooltips
function handleHoverProximity(e) {
    if (!state.airports.length) return;
    
    // Absolute position relative to canvas bounds
    const rect = state.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const proj = state.projection;
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];
    const tooltip = document.getElementById('map-tooltip');
    
    let closestAirport = null;
    let minDist = 8; // detection threshold in pixels
    
    // Scan airports for hover hits
    const scanLimit = state.activeFilter.type ? state.airports.length : 200;
    for (let i = 0; i < scanLimit; i++) {
        const ap = state.airports[i];
        
        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue; // Behind globe
        }
        
        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;
        
        const dx = mouseX - px[0];
        const dy = mouseY - px[1];
        const pixelDist = Math.sqrt(dx*dx + dy*dy);
        
        if (pixelDist < minDist) {
            minDist = pixelDist;
            closestAirport = ap;
        }
    }
    
    if (closestAirport) {
        // Display tooltip
        tooltip.innerHTML = `
            <div class="tooltip-title">${closestAirport.city} (${closestAirport.iata})</div>
            <div class="tooltip-line">
                <span class="label">Airport:</span>
                <span class="val">${closestAirport.name}</span>
            </div>
            <div class="tooltip-line">
                <span class="label">Country:</span>
                <span class="val">${closestAirport.country}</span>
            </div>
            <div class="tooltip-line">
                <span class="label">Connections:</span>
                <span class="val">${closestAirport.flightsCount} flights</span>
            </div>
        `;
        
        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
        tooltip.style.display = 'flex';
        tooltip.style.opacity = 1;
        state.hoveredItem = closestAirport;
        state.canvas.style.cursor = 'pointer';
    } else {
        tooltip.style.display = 'none';
        tooltip.style.opacity = 0;
        state.hoveredItem = null;
        state.canvas.style.cursor = state.isDragging ? 'grabbing' : 'grab';
    }
}

// Animation loop
function startAnimationLoop() {
    function loop(timestamp) {
        if (!state.lastFrameTime) state.lastFrameTime = timestamp;
        
        // Auto-rotation handling
        if (state.autoRotate) {
            state.rotation[0] += state.rotationSpeed;
            // loop rotation
            if (state.rotation[0] >= 180) state.rotation[0] -= 360;
            
            setupProjections();
        }
        
        render();
        
        state.lastFrameTime = timestamp;
        state.animFrameId = requestAnimationFrame(loop);
    }
    
    state.animFrameId = requestAnimationFrame(loop);
}
