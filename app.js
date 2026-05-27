/* AeroFlow - Application Logic (Performance-Optimized) */

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

    // PERF: dirty-flag — only repaint when something changed
    needsRender: true,

    // Filtering State
    activeTab: 'airline', // 'airline' or 'location'
    connectionType: 'direct', // 'direct' or 'connecting'
    activeFilter: {
        type: null, // 'airline' or 'location'
        value: null // airline IATA code or airport index
    },
    locationToIndex: null,  // optional second airport for point-to-point mode

    // Render cache / animated items
    activeRoutes: [],
    // PERF: pre-built GeoJSON features for active routes (rebuilt only on filter change)
    activeRouteFeatures: [],
    particles: [], // animating planes
    selectedAirportIndex: null,
    hoveredItem: null, // airport or route under cursor

    // PERF: cached static geometry
    graticuleGeometry: null,

    // PERF: hover rAF throttle
    hoverPending: false,
    lastMouseEvent: null,

    // PERF: resize debounce timer
    resizeTimer: null,

    // PERF: animateRotation in flight flag
    rotationAnimating: false,
};

// Canvas colour palettes — swapped on theme toggle
function getThemeColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
        return {
            bgBase: '#dde4f0',
            ocean: '#c8d5eb',
            landFill: '#e8eef8',
            landStroke: '#b0bcd8',
            graticule: '#c5cfe6',
            unBorder: '#99aace',
            routeInactive: 'rgba(96, 64, 224, 0.07)',
            routeActive: '#0088bb',
            routeActiveGlow: 'rgba(0, 136, 187, 0.4)',
            routeLocation: '#d6004a',
            routeLocationGlow: 'rgba(214, 0, 74, 0.4)',
            routeAirline: '#c47a00',
            routeAirlineGlow: 'rgba(196, 122, 0, 0.4)',
            routeDirect: '#1aaa50',
            routeDirectGlow: 'rgba(26, 170, 80, 0.45)',
            routeConnecting: '#b89000',
            routeConnectingGlow: 'rgba(184, 144, 0, 0.4)',
            routeConnectingStroke: 'rgba(184, 144, 0, 0.6)',
            airportBase: '#6040e0',
            airportGlow: 'rgba(96, 64, 224, 0.45)',
            airportActive: '#0088bb',
            particleCyan: '#0088bb',
            particlePink: '#d6004a',
            particleAirline: '#c47a00',
            particleDirect: '#1aaa50',
            particleConnecting: '#b89000'
        };
    }
    return {
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
        routeAirline: '#f5a623',
        routeAirlineGlow: 'rgba(245, 166, 35, 0.4)',
        routeDirect: '#39e07a',
        routeDirectGlow: 'rgba(57, 224, 122, 0.45)',
        routeConnecting: '#f5e642',
        routeConnectingGlow: 'rgba(245, 230, 66, 0.4)',
        routeConnectingStroke: 'rgba(245, 230, 66, 0.6)',
        airportBase: '#7952f5',
        airportGlow: 'rgba(121, 82, 245, 0.5)',
        airportActive: '#00f2fe',
        particleCyan: '#00f2fe',
        particlePink: '#ff3377',
        particleAirline: '#f5a623',
        particleDirect: '#39e07a',
        particleConnecting: '#f5e642'
    };
}

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', () => {
    try {
        initTheme();
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

    // PERF: debounced resize handler
    window.addEventListener('resize', handleResize);
});

// Theme initialisation — reads localStorage, applies to html element, wires toggle button
function initTheme() {
    const saved = localStorage.getItem('aeroflow-theme') || 'dark';
    applyTheme(saved, false);

    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';

        // Brief spin animation on the icon
        btn.classList.add('switching');
        setTimeout(() => btn.classList.remove('switching'), 400);

        applyTheme(next, true);
    });
}

function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('aeroflow-theme', theme);

    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');

    if (theme === 'light') {
        icon.setAttribute('data-lucide', 'sun');
        label.textContent = 'Light';
    } else {
        icon.setAttribute('data-lucide', 'moon');
        label.textContent = 'Dark';
    }

    // Re-render icon (lucide may already be loaded)
    if (window.lucide) lucide.createIcons({ nodes: [icon] });

    // Repaint canvas with new colour palette
    markDirty();
    // Also re-spawn particles so they pick up new colours
    if (state.activeRoutes.length) initParticles();
}

// Canvas Setup
function initCanvas() {
    state.canvas = document.getElementById('mapCanvas');
    state.ctx = state.canvas.getContext('2d');

    resizeCanvas();
    setupProjections();
    setupInteractions();

    // PERF: cache graticule geometry once — it never changes
    state.graticuleGeometry = d3.geoGraticule()();
}

function updateBaseScales() {
    const availableWidth = state.width > 768 ? state.width - 380 : state.width;
    const refDimension = Math.min(availableWidth, state.height);
    
    // Calculate responsive base scales with sensible bounds to prevent overflow/too tiny views
    state.scale.globe = Math.max(120, refDimension * 0.38);
    state.scale.flat = Math.max(100, refDimension * 0.30);
}

function resizeCanvas() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    const dpr = state.devicePixelRatio;
    state.canvas.width = state.width * dpr;
    state.canvas.height = state.height * dpr;

    state.canvas.style.width = `${state.width}px`;
    state.canvas.style.height = `${state.height}px`;

    // Calculate responsive base scales
    updateBaseScales();

    // PERF: use setTransform instead of accumulating ctx.scale() on every resize
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function handleResize() {
    // PERF: debounce — only recompute after 150ms of no more resize events
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
        resizeCanvas();
        setupProjections();
        markDirty();
    }, 150);
}

// Setup Projections (D3 Integration)
function setupProjections() {
    const center = [state.width / 2 + (state.width > 768 ? 100 : 0), state.height / 2];

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
            .rotate([state.rotation[0], 0, 0]);
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
            toggleAutoRotate(false);
        }
    });

    window.addEventListener('mousemove', (e) => {
        // PERF: store latest event for rAF-throttled hover, dispatch at most once per frame
        state.lastMouseEvent = e;
        if (!state.hoverPending) {
            state.hoverPending = true;
            requestAnimationFrame(() => {
                if (state.lastMouseEvent) {
                    handleHoverProximity(state.lastMouseEvent);
                }
                state.hoverPending = false;
            });
        }

        if (!state.isDragging) return;

        const dx = e.clientX - state.dragStart[0];
        const dy = e.clientY - state.dragStart[1];

        if (state.projectionType === 'globe') {
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            state.rotation[1] = state.dragRotationStart[1] - dy * sensitivity;
            state.rotation[1] = Math.max(-85, Math.min(85, state.rotation[1]));
        } else {
            const sensitivity = 0.25 / state.zoom;
            state.rotation[0] = state.dragRotationStart[0] + dx * sensitivity;
            state.translation[1] = state.dragTranslationStart[1] + dy;
            state.translation[0] = state.dragTranslationStart[0] + dx * 0.5;
        }

        // PERF: update projection once per drag event (not via setupProjections which is heavier call)
        setupProjections();
        markDirty();
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
    });

    // Zoom control
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSensitivity = 0.08;

        if (e.deltaY < 0) {
            state.zoom = Math.min(5, state.zoom + zoomSensitivity * state.zoom);
        } else {
            state.zoom = Math.max(0.6, state.zoom - zoomSensitivity * state.zoom);
        }

        setupProjections();
        markDirty();
    }, { passive: false });
}

// PERF: dirty-flag helper — marks the scene as needing a repaint
function markDirty() {
    state.needsRender = true;
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
        // PERF: use a stable version key instead of Date.now() to allow browser caching
        const geojsonRes = await fetch('data/countries.geojson?v=1');
        state.countriesGeoJSON = await geojsonRes.json();

        // Step 2: Load flight databases
        loaderText.innerText = "Indexing routes database...";
        progressFill.style.width = "60%";
        const dataRes = await fetch('data/data.json?v=1');
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

        // 1. Activate the Location Tab in the sidebar UI
        activateLocationTab();

        // 2. Pre-select Melbourne (Australia, IATA: MEL, index 139) as the absolute default
        setLocationFilter(139);

        // 3. Request user's physical location in the background
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const closestApIdx = getClosestAirport(lat, lon);
                    setLocationFilter(closestApIdx);
                },
                (error) => {
                    console.warn("Geolocation access denied or failed. Defaulting to Melbourne.", error);
                    // Already defaulted to Melbourne, so no additional action is needed.
                },
                { timeout: 8000, enableHighAccuracy: false }
            );
        }

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

        hideSuggestions();
    });

    // 2. Search Autocomplete
    const airInput = document.getElementById('airline-search');
    const locInput = document.getElementById('location-search');
    const locToInput = document.getElementById('location-to-search');

    airInput.addEventListener('input', (e) => handleSearchInput('airline', e.target.value));
    locInput.addEventListener('input', (e) => handleSearchInput('location', e.target.value));
    locToInput.addEventListener('input', (e) => handleSearchInput('location-to', e.target.value));

    // Clear input buttons
    const clearAir = document.getElementById('clear-airline');
    const clearLoc = document.getElementById('clear-location');
    const clearLocTo = document.getElementById('clear-location-to');

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

    clearLocTo.addEventListener('click', () => {
        locToInput.value = '';
        clearLocTo.style.display = 'none';
        hideSuggestions();
    });

    // Chip clear buttons
    document.getElementById('loc-from-clear').addEventListener('click', () => {
        clearLocationFrom();
    });

    document.getElementById('loc-to-clear').addEventListener('click', () => {
        clearLocationTo();
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
        markDirty();
    });

    btnFlat.addEventListener('click', () => {
        if (state.projectionType === 'flat') return;
        state.projectionType = 'flat';
        btnFlat.classList.add('active');
        btnGlobe.classList.remove('active');
        projInfo.innerText = "Equal Earth projection: A true-to-earth flat projection showing highly accurate sizes of all landmasses. Drag to pan, scroll to zoom.";
        setupProjections();
        markDirty();
    });

    // 4. Floating HUD Control buttons
    document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
        state.zoom = Math.min(5, state.zoom + 0.2);
        setupProjections();
        markDirty();
    });

    document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
        state.zoom = Math.max(0.6, state.zoom - 0.2);
        setupProjections();
        markDirty();
    });

    document.getElementById('ctrl-reset').addEventListener('click', () => {
        state.zoom = 1;
        state.rotation = [0, -20, 0];
        state.translation = [0, 0];
        setupProjections();
        markDirty();
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
        if (state.locationToIndex !== null) {
            // Re-run point-to-point with current locationToIndex
            applyPointToPointFilter(state.activeFilter.value, state.locationToIndex);
        } else {
            setLocationFilter(state.activeFilter.value);
        }
    } else {
        resetFilter();
    }
}

// Enable/Disable auto rotation
function toggleAutoRotate(enabled) {
    state.autoRotate = enabled;
    const btn = document.getElementById('ctrl-auto-rotate');
    const icon = btn.querySelector('i');

    if (enabled) {
        btn.classList.add('active');
        // PERF: update just the icon attribute and re-create only that single icon
        icon.setAttribute('data-lucide', 'play');
    } else {
        btn.classList.remove('active');
        icon.setAttribute('data-lucide', 'pause');
    }
    // PERF: replace only the single icon element instead of scanning the full DOM
    lucide.createIcons({ nodes: [icon] });
}

// Autocomplete logic
function handleSearchInput(type, query) {
    let clearBtnId, suggestListId;
    if (type === 'airline') {
        clearBtnId = 'clear-airline'; suggestListId = 'airline-suggestions';
    } else if (type === 'location-to') {
        clearBtnId = 'clear-location-to'; suggestListId = 'location-to-suggestions';
    } else {
        clearBtnId = 'clear-location'; suggestListId = 'location-suggestions';
    }

    const clearBtn = document.getElementById(clearBtnId);
    const suggestList = document.getElementById(suggestListId);

    if (!query || query.trim().length < 2) {
        clearBtn.style.display = 'none';
        suggestList.style.display = 'none';
        return;
    }

    clearBtn.style.display = 'block';

    const cleanQuery = query.toLowerCase().trim();
    let matches = [];

    if (type === 'airline') {
        Object.values(state.airlines).forEach(al => {
            if (al.name.toLowerCase().includes(cleanQuery) || al.iata.toLowerCase().includes(cleanQuery)) {
                matches.push(al);
            }
        });
        matches.sort((a, b) => b.routesCount - a.routesCount);
        renderAirlineSuggestions(matches.slice(0, 6));
    } else {
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
        matches.sort((a, b) => b.flightsCount - a.flightsCount);
        if (type === 'location-to') {
            renderLocationToSuggestions(matches.slice(0, 6));
        } else {
            renderLocationSuggestions(matches.slice(0, 6));
        }
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

function renderLocationToSuggestions(matches) {
    const list = document.getElementById('location-to-suggestions');
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
            setLocationToFilter(ap.originalIndex);
            hideSuggestions();
            document.getElementById('location-to-search').value = '';
            document.getElementById('clear-location-to').style.display = 'none';
        });

        list.appendChild(item);
    });

    list.style.display = 'block';
}

function hideSuggestions() {
    document.getElementById('airline-suggestions').style.display = 'none';
    document.getElementById('location-suggestions').style.display = 'none';
    document.getElementById('location-to-suggestions').style.display = 'none';
}

// PERF: Pre-build GeoJSON features for active routes once on filter change,
// instead of creating a new object per route per frame in the render loop.
function buildRouteFeatures() {
    state.activeRouteFeatures = state.activeRoutes.map(r => ({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: [[r.src.lon, r.src.lat], [r.dst.lon, r.dst.lat]]
        },
        properties: { routeType: r.type, filterType: state.activeFilter.type }
    }));
}

// Filters implementation
function setAirlineFilter(iata) {
    const al = state.airlines[iata];
    if (!al) return;

    state.activeFilter = { type: 'airline', value: iata };
    state.selectedAirportIndex = null;

    // Build direct routes for this airline
    const directRoutes = al.routes.map(r => ({
        src: state.airports[r[0]],
        dst: state.airports[r[1]],
        airline: iata,
        type: 'direct'
    }));

    // Collect all airport indices directly served by this airline
    const directServedSet = new Set();
    al.routes.forEach(r => {
        directServedSet.add(r[0]);
        directServedSet.add(r[1]);
    });

    state.activeRoutes = [...directRoutes];

    // If 1-stop mode: find outbound legs from every airline hub to airports not directly served
    if (state.connectionType === 'connecting') {
        const connectingRoutes = [];
        const seenConnectingKey = new Set();

        directServedSet.forEach(hubIdx => {
            Object.entries(state.airlines).forEach(([alIata, otherAl]) => {
                otherAl.routes.forEach(r => {
                    if (r[0] === hubIdx) {
                        const destIdx = r[1];
                        if (!directServedSet.has(destIdx)) {
                            const key = `${hubIdx}-${destIdx}`;
                            if (!seenConnectingKey.has(key)) {
                                seenConnectingKey.add(key);
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

        // Sort by destination traffic and cap to keep performance reasonable
        connectingRoutes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        state.activeRoutes.push(...connectingRoutes.slice(0, 300));
    }

    // PERF: pre-build route geometry
    buildRouteFeatures();

    focusCameraOnRoutes(state.activeRoutes);
    initParticles();

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Selected Airline: ${al.name}`;

    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes);
    document.getElementById('stat-routes').innerText = state.connectionType === 'connecting'
        ? state.activeRoutes.length
        : al.routesCount;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "HQ Country";
    document.getElementById('stat-extra-value').innerText = al.name.split(' ').pop();
    state.airports.forEach(ap => {
        if (ap.iata === iata) document.getElementById('stat-extra-value').innerText = ap.country;
    });

    displayAirlineHubs(al);
    markDirty();
}

function setLocationFilter(apIdx) {
    apIdx = parseInt(apIdx);
    const ap = state.airports[apIdx];
    if (!ap) return;

    state.activeFilter = { type: 'location', value: apIdx };
    state.selectedAirportIndex = apIdx;

    // Update From chip UI
    const fromChip = document.getElementById('loc-from-chip');
    document.getElementById('loc-from-chip-label').innerText = `${ap.city} (${ap.iata})`;
    fromChip.style.display = 'flex';
    lucide.createIcons({ nodes: [fromChip.querySelector('i')] });

    // If a "To" airport is already selected, run point-to-point immediately
    if (state.locationToIndex !== null) {
        applyPointToPointFilter(apIdx, state.locationToIndex);
        return;
    }

    state.activeRoutes = [];

    // 1. Gather all direct routes first
    const directConnectedSet = new Set();
    const directRoutes = [];

    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === apIdx || r[1] === apIdx) {
                const src = state.airports[r[0]];
                const dst = state.airports[r[1]];
                const otherIdx = r[0] === apIdx ? r[1] : r[0];
                directConnectedSet.add(otherIdx);
                directRoutes.push({ src, dst, airline: alIata, type: 'direct' });
            }
        });
    });

    state.activeRoutes.push(...directRoutes);

    // 2. If 'connecting' type selected, compute 2-hop layovers
    if (state.connectionType === 'connecting') {
        const connectingRoutes = [];
        const seenConnectingDest = new Set();

        directConnectedSet.forEach(hubIdx => {
            Object.entries(state.airlines).forEach(([alIata, al]) => {
                al.routes.forEach(r => {
                    if (r[0] === hubIdx) {
                        const destIdx = r[1];
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

        connectingRoutes.sort((a, b) => b.dst.flightsCount - a.dst.flightsCount);
        state.activeRoutes.push(...connectingRoutes.slice(0, 250));
    }

    // PERF: pre-build route geometry
    buildRouteFeatures();

    focusCameraOnPoints([[ap.lon, ap.lat]]);
    initParticles();

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `Location: ${ap.city} (${ap.iata})`;

    document.getElementById('stat-airports').innerText = getUniqueAirportsCount(state.activeRoutes) - 1;
    document.getElementById('stat-routes').innerText = state.activeRoutes.length;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airport Code";
    document.getElementById('stat-extra-value').innerText = `${ap.iata} / ${ap.country.substring(0, 8)}`;

    displayLocationAirlines(apIdx);
    markDirty();
}

// Called when user picks a "To" destination airport
function setLocationToFilter(apIdx) {
    apIdx = parseInt(apIdx);
    const ap = state.airports[apIdx];
    if (!ap) return;

    state.locationToIndex = apIdx;

    // Update To chip UI
    const toChip = document.getElementById('loc-to-chip');
    document.getElementById('loc-to-chip-label').innerText = `${ap.city} (${ap.iata})`;
    toChip.style.display = 'flex';
    lucide.createIcons({ nodes: [toChip.querySelector('i')] });

    // If a "From" airport is already selected, apply point-to-point filter
    if (state.activeFilter.type === 'location' && state.activeFilter.value !== null) {
        applyPointToPointFilter(state.activeFilter.value, apIdx);
    }
    // else: wait for user to pick a From airport
}

// Compute and display routes between two specific airports (direct + 1-stop)
function applyPointToPointFilter(fromIdx, toIdx) {
    fromIdx = parseInt(fromIdx);
    toIdx = parseInt(toIdx);
    const fromAp = state.airports[fromIdx];
    const toAp = state.airports[toIdx];
    if (!fromAp || !toAp) return;

    state.activeRoutes = [];

    // --- Direct routes between fromIdx <-> toIdx ---
    const directRoutes = [];
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            const isFromTo = (r[0] === fromIdx && r[1] === toIdx) || (r[0] === toIdx && r[1] === fromIdx);
            if (isFromTo) {
                directRoutes.push({
                    src: state.airports[r[0]],
                    dst: state.airports[r[1]],
                    airline: alIata,
                    type: 'direct'
                });
            }
        });
    });
    state.activeRoutes.push(...directRoutes);

    // --- 1-stop connection routes (always shown regardless of connectionType toggle) ---
    // A 1-stop connection is: fromIdx → hub → toIdx (any airline each leg)
    // Build set of hubs reachable from fromIdx
    const fromHubs = new Map(); // hubIdx -> [{airline}]
    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            if (r[0] === fromIdx && r[1] !== toIdx) {
                if (!fromHubs.has(r[1])) fromHubs.set(r[1], []);
                fromHubs.get(r[1]).push(alIata);
            }
            if (r[1] === fromIdx && r[0] !== toIdx) {
                if (!fromHubs.has(r[0])) fromHubs.set(r[0], []);
                fromHubs.get(r[0]).push(alIata);
            }
        });
    });

    // Find hubs that also connect to toIdx
    const seenHubs = new Set();
    const connectingLegs = []; // legs: from → hub, hub → to

    Object.entries(state.airlines).forEach(([alIata, al]) => {
        al.routes.forEach(r => {
            let hubIdx = null;
            // r goes hub → toIdx
            if (r[1] === toIdx && fromHubs.has(r[0])) hubIdx = r[0];
            // r goes toIdx → hub (undirected)
            if (r[0] === toIdx && fromHubs.has(r[1])) hubIdx = r[1];

            if (hubIdx !== null && !seenHubs.has(hubIdx)) {
                seenHubs.add(hubIdx);
                const hub = state.airports[hubIdx];
                // Leg 1: from → hub
                connectingLegs.push({
                    src: fromAp, dst: hub,
                    airline: (fromHubs.get(hubIdx) || [alIata])[0],
                    type: 'connecting'
                });
                // Leg 2: hub → to
                connectingLegs.push({
                    src: hub, dst: toAp,
                    airline: alIata,
                    type: 'connecting'
                });
            }
        });
    });

    // Sort hubs by traffic and cap
    connectingLegs.sort((a, b) => (b.dst.flightsCount || 0) - (a.dst.flightsCount || 0));
    state.activeRoutes.push(...connectingLegs.slice(0, 400));

    // PERF: pre-build route geometry
    buildRouteFeatures();

    state.selectedAirportIndex = fromIdx;
    focusCameraOnPoints([[fromAp.lon, fromAp.lat], [toAp.lon, toAp.lat]]);
    initParticles();

    const directCount = directRoutes.length;
    const hubCount = seenHubs.size;

    // UI Updates
    document.getElementById('active-filter-pill').style.display = 'flex';
    document.getElementById('filter-pill-label').innerText = `${fromAp.iata} → ${toAp.iata}`;

    document.getElementById('stat-airports').innerText = hubCount + (directCount > 0 ? 0 : 0);
    document.getElementById('stat-routes').innerText = state.activeRoutes.length;

    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Direct Flights";
    document.getElementById('stat-extra-value').innerText = directCount > 0 ? directCount : 'None';

    // Description text
    const descText = document.getElementById('stats-desc-text');
    if (directCount > 0) {
        descText.innerText = `${directCount} direct flight${directCount > 1 ? 's' : ''} found between ${fromAp.city} and ${toAp.city}. ${hubCount} possible 1-stop connection hubs shown.`;
    } else {
        descText.innerText = `No direct flights between ${fromAp.city} and ${toAp.city}. Showing ${hubCount} possible 1-stop connection hub${hubCount !== 1 ? 's' : ''}.`;
    }

    // Show hubs list
    const topHubsContainer = document.getElementById('top-hubs-container');
    const topHubsList = document.getElementById('top-hubs-list');
    topHubsList.innerHTML = '';
    topHubsContainer.querySelector('h3').innerText = '1-Stop Connection Hubs';

    const sortedHubs = [...seenHubs]
        .map(idx => state.airports[idx])
        .sort((a, b) => (b.flightsCount || 0) - (a.flightsCount || 0))
        .slice(0, 5);

    sortedHubs.forEach(hub => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">${hub.city} (${hub.iata})</span><span class="hub-count">via hub</span>`;
        topHubsList.appendChild(li);
    });

    if (sortedHubs.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="hub-name">No 1-stop hubs found</span>`;
        topHubsList.appendChild(li);
    }
    topHubsContainer.style.display = 'block';

    markDirty();
}

// Clear the From airport selection
function clearLocationFrom() {
    state.activeFilter = { type: null, value: null };
    state.selectedAirportIndex = null;
    document.getElementById('loc-from-chip').style.display = 'none';

    // If To is still set, keep it but revert to a vanilla filter reset
    if (state.locationToIndex !== null) {
        // Apply single-location filter from the To side
        const toIdx = state.locationToIndex;
        state.locationToIndex = null;
        document.getElementById('loc-to-chip').style.display = 'none';
    }
    resetFilter();
}

// Clear the To airport selection
function clearLocationTo() {
    state.locationToIndex = null;
    document.getElementById('loc-to-chip').style.display = 'none';

    // Re-apply single-airport filter for the From airport
    if (state.activeFilter.type === 'location' && state.activeFilter.value !== null) {
        setLocationFilter(state.activeFilter.value);
    }
}

function resetFilter() {
    state.activeFilter = { type: null, value: null };
    state.selectedAirportIndex = null;
    state.locationToIndex = null;

    // Hide chips
    document.getElementById('loc-from-chip').style.display = 'none';
    document.getElementById('loc-to-chip').style.display = 'none';

    state.activeRoutes = [];
    let gatheredCount = 0;

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

    // PERF: pre-build route geometry
    buildRouteFeatures();

    initParticles();

    // UI Reset
    document.getElementById('active-filter-pill').style.display = 'none';

    document.getElementById('stat-airports').innerText = state.airports.length;
    document.getElementById('stat-routes').innerText = state.routesCount;
    document.getElementById('stat-extra-card').style.display = 'flex';
    document.getElementById('stat-extra-label').innerText = "Airlines Indexed";
    document.getElementById('stat-extra-value').innerText = Object.keys(state.airlines).length;

    document.getElementById('stats-desc-text').innerText = "Showing the global commercial flights network. Search and select an airline or an airport above to analyze specific routes and connectivity hubs.";
    document.getElementById('top-hubs-container').style.display = 'none';

    markDirty();
}

// Helper to calculate the closest airport to a given lat/lon coordinate pair
function getClosestAirport(lat, lon) {
    let closestApIdx = 139; // Fallback to Melbourne (index 139)
    let minDistance = Infinity;
    
    state.airports.forEach((ap, idx) => {
        // Equirectangular distance approximation (fast and accurate enough for proximity)
        const x = (ap.lon - lon) * Math.cos((ap.lat + lat) * Math.PI / 360);
        const y = ap.lat - lat;
        const dist = x * x + y * y;
        if (dist < minDistance) {
            minDistance = dist;
            closestApIdx = idx;
        }
    });
    
    return closestApIdx;
}

// Helper to programmatically activate the Location Tab in the UI Sidebar
function activateLocationTab() {
    state.activeTab = 'location';
    
    const tabAirline = document.getElementById('tab-airline');
    const tabLocation = document.getElementById('tab-location');
    const searchAirlineCont = document.getElementById('search-airline-container');
    const searchLocationCont = document.getElementById('search-location-container');

    if (tabAirline && tabLocation && searchAirlineCont && searchLocationCont) {
        tabLocation.classList.add('active');
        tabLocation.setAttribute('aria-selected', 'true');
        tabAirline.classList.remove('active');
        tabAirline.setAttribute('aria-selected', 'false');

        searchLocationCont.classList.add('active');
        searchAirlineCont.classList.remove('active');
    }
    
    hideSuggestions();
}

// Focus D3 camera projection on specific set of points — instant snap, no animation
function focusCameraOnPoints(_points) {
    // Camera repositioning disabled: map stays in place when filters change
}

function focusCameraOnRoutes(_routes) {
    // Camera repositioning disabled: map stays in place when filters change
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

    const hubs = {};
    al.routes.forEach(r => {
        const src = state.airports[r[0]];
        const dst = state.airports[r[1]];
        hubs[src.city] = (hubs[src.city] || 0) + 1;
        hubs[dst.city] = (hubs[dst.city] || 0) + 1;
    });

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
// PERF: pre-compute and cache the geoInterpolate function per particle at spawn time
function initParticles() {
    state.particles = [];
    const maxParticles = Math.min(120, state.activeRoutes.length);
    const colors = getThemeColors();

    const indices = [];
    for (let i = 0; i < state.activeRoutes.length; i++) indices.push(i);
    indices.sort(() => Math.random() - 0.5);

    const particlesToSpawn = indices.slice(0, maxParticles);

    particlesToSpawn.forEach(idx => {
        const r = state.activeRoutes[idx];
        // PERF: create the interpolator ONCE per particle, not every frame
        const interpolator = d3.geoInterpolate(
            [r.src.lon, r.src.lat],
            [r.dst.lon, r.dst.lat]
        );
        state.particles.push({
            route: r,
            interpolator,
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.003,
            color: r.type === 'connecting'
                ? colors.particleConnecting
                : colors.particleDirect
        });
    });

    markDirty();
}

// Draw the entire scene on Canvas
function render() {
    const ctx = state.ctx;
    const path = state.path;
    const themeColors = getThemeColors();

    // 1. Clear Screen
    ctx.clearRect(0, 0, state.width, state.height);

    // 2. Draw Sphere Background (Globe mode only)
    if (state.projectionType === 'globe') {
        ctx.beginPath();
        path({ type: 'Sphere' });
        ctx.fillStyle = themeColors.ocean;
        ctx.fill();

        // PERF: use cached graticule geometry instead of recalculating every frame
        ctx.beginPath();
        path(state.graticuleGeometry);
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
    const themeColors = getThemeColors();
    const hasFilter = !!state.activeFilter.type;

    // PERF: separate routes into two buckets (glow / no-glow) and draw each bucket
    // in a single save/restore block to minimise Canvas state changes.
    // Bucket A: inactive / connecting (no shadow blur)
    // Bucket B: active direct (shadow glow)

    // --- Bucket A: 1-stop connecting routes (yellow dashed, no glow) ---
    ctx.save();
    ctx.shadowBlur = 0;

    state.activeRouteFeatures.forEach((feat, i) => {
        const r = state.activeRoutes[i];
        const isConnecting = r.type === 'connecting';

        if (!hasFilter || isConnecting) {
            if (isConnecting) {
                ctx.setLineDash([5, 6]);
                ctx.strokeStyle = themeColors.routeConnectingStroke;
                ctx.lineWidth = 1.2;
            } else {
                ctx.setLineDash([]);
                ctx.strokeStyle = themeColors.routeInactive;
                ctx.lineWidth = 0.8;
            }
            ctx.beginPath();
            path(feat);
            ctx.stroke();
        }
    });

    ctx.setLineDash([]);
    ctx.restore();

    // --- Bucket B: direct routes (green solid, with glow) ---
    if (hasFilter) {
        ctx.save();
        ctx.shadowColor = themeColors.routeDirectGlow;
        ctx.shadowBlur = 5;
        ctx.strokeStyle = themeColors.routeDirect;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);

        state.activeRouteFeatures.forEach((feat, i) => {
            const r = state.activeRoutes[i];
            if (!r.type || r.type === 'direct') {
                ctx.beginPath();
                path(feat);
                ctx.stroke();
            }
        });

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

function drawParticles() {
    const ctx = state.ctx;
    const proj = state.projection;

    const centerLonLat = [-state.rotation[0], -state.rotation[1]];

    // PERF: batch all particles in a single save/restore shadow block
    ctx.save();
    ctx.shadowBlur = 8;

    state.particles.forEach(p => {
        // PERF: use pre-cached interpolator instead of creating a new closure each frame
        const currentCoords = p.interpolator(p.progress);

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, currentCoords);
            if (dist > Math.PI / 2) {
                p.progress += p.speed;
                if (p.progress >= 1.0) p.progress = 0;
                return;
            }
        }

        const px = proj(currentCoords);
        if (!px) {
            p.progress += p.speed;
            if (p.progress >= 1.0) p.progress = 0;
            return;
        }

        ctx.beginPath();
        ctx.arc(px[0], px[1], 2, 0, 2 * Math.PI);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.fill();

        p.progress += p.speed;
        if (p.progress >= 1.0) p.progress = 0;
    });

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawAirports() {
    const ctx = state.ctx;
    const proj = state.projection;
    const themeColors = getThemeColors();
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];

    const limit = state.activeFilter.type ? state.airports.length : 150;

    // PERF: draw selected airport pulse halo separately with shadow, then batch the rest
    // First pass: all non-selected airports (no shadow)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = state.activeFilter.type === 'location'
        ? themeColors.airportActive
        : state.activeFilter.type === 'airline'
            ? themeColors.airportActive
            : themeColors.airportBase;
    const dotRadius = state.activeFilter.type ? 2 : 1.5;

    for (let i = 0; i < limit; i++) {
        const ap = state.airports[i];
        if (state.selectedAirportIndex === i) continue;
        if (state.locationToIndex === i) continue;

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue;
        }

        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;

        ctx.beginPath();
        ctx.arc(px[0], px[1], dotRadius, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.restore();

    // Helper to draw a pulsing highlighted airport dot
    function drawHighlightedAirport(apIdx, color) {
        const ap = state.airports[apIdx];
        if (!ap) return;
        const px = proj([ap.lon, ap.lat]);
        if (!px) return;

        ctx.save();
        const pulseRadius = 5 + (Date.now() % 1000) / 100 * 1.5;
        ctx.beginPath();
        ctx.arc(px[0], px[1], pulseRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px[0], px[1], 5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
    }

    // Second pass: selected "From" airport with glow halo
    if (state.selectedAirportIndex !== null) {
        drawHighlightedAirport(state.selectedAirportIndex, themeColors.routeLocation);
    }

    // Third pass: selected "To" airport with pink glow halo
    if (state.locationToIndex !== null) {
        drawHighlightedAirport(state.locationToIndex, themeColors.routeLocation);
    }
}

// PERF: rAF-throttled hover detection — called via the mousemove listener at most once per frame
function handleHoverProximity(e) {
    if (!state.airports.length) return;

    const rect = state.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const proj = state.projection;
    const centerLonLat = [-state.rotation[0], -state.rotation[1]];
    const tooltip = document.getElementById('map-tooltip');

    let closestAirport = null;
    let minDist = 8; // detection threshold in pixels

    const scanLimit = state.activeFilter.type ? state.airports.length : 200;
    for (let i = 0; i < scanLimit; i++) {
        const ap = state.airports[i];

        if (state.projectionType === 'globe') {
            const dist = d3.geoDistance(centerLonLat, [ap.lon, ap.lat]);
            if (dist > Math.PI / 2) continue;
        }

        const px = proj([ap.lon, ap.lat]);
        if (!px) continue;

        const dx = mouseX - px[0];
        const dy = mouseY - px[1];
        const pixelDist = Math.sqrt(dx * dx + dy * dy);

        if (pixelDist < minDist) {
            minDist = pixelDist;
            closestAirport = ap;
        }
    }

    if (closestAirport) {
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
// PERF: only call render() when the dirty flag is set, or when particles / auto-rotation
// need a new frame. Idle frames with no state change skip the repaint entirely.
function startAnimationLoop() {
    const hasAnimatedParticles = () => state.particles.length > 0;

    function loop(timestamp) {
        if (!state.lastFrameTime) state.lastFrameTime = timestamp;

        if (state.autoRotate && !state.rotationAnimating) {
            state.rotation[0] += state.rotationSpeed;
            if (state.rotation[0] >= 180) state.rotation[0] -= 360;
            // PERF: only rebuild the projection when the rotation actually changes
            setupProjections();
            state.needsRender = true;
        }

        // Particles always need a repaint when present (they move every frame)
        if (hasAnimatedParticles()) {
            state.needsRender = true;
        }

        // Only repaint if dirty (avoids wasted GPU compositing on idle frames)
        if (state.needsRender) {
            render();
            state.needsRender = false;
        }

        state.lastFrameTime = timestamp;
        state.animFrameId = requestAnimationFrame(loop);
    }

    state.animFrameId = requestAnimationFrame(loop);
}
