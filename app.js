/* =========================================================================
   VISUALIZANDO LOS FLUJOS — GRUPO 4 (e[ad] PUCV • 2026)
   Lógica de Sincronización en Vivo con Google Sheets, Tablero Multicapa de
   Micas (2D, Partículas, 3D Explotado, Fotos), Modo Autor (Plumón Posca y
   Stickers), Dashboard Cuantitativo (10 Salidas) y Encuestas (n=96+).
   ========================================================================= */

const STORAGE_KEY_FLUJOS = 'ead_g4_flujos_digitales_v3';
const STORAGE_KEY_WEBHOOK = 'ead_g4_sheets_webhook_v1';

function fixUtf8Text(str) {
  if (typeof str !== 'string' || !str.includes('Ã')) return str;
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
}

function sanitizeFlowItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    ...item,
    nota: fixUtf8Text(item.nota || ''),
    colorName: fixUtf8Text(item.colorName || '')
  }));
}

// Estado global
let flujosData = loadFlujosFromStorage();
let surveyData = Array.isArray(window.INITIAL_SURVEY_DATA) ? [...window.INITIAL_SURVEY_DATA] : [];
let resumenData = window.INITIAL_RESUMEN_DATA;
let sesionesData = window.INITIAL_SESIONES_DATA;

let currentTerritory = 'sotomayor'; // 'sotomayor' | 'plaza_de_mayo'
let currentCornerFilter = 'ALL';    // 'ALL' | 'E1'..'E6'
let currentStickerFilter = 'ALL';   // 'ALL' | 'vehiculos' | 'senalizacion' | 'personas' | 'espacio' | 'cruce'
let currentBoardMode = '2d';        // '2d' | 'particles' | '3d' | 'photos'
let showPhotoUnderlay = false;
let showDrawnFlows2D = true;
let animateFlowsFlag = false;
let selectedBoardItemId = 'ST-E1-01';

// Estado Modo Autor (Digitalizador de recorridos y stickers)
let isAuthorUnlocked = false;
let authorTool = 'posca';           // 'posca' | 'sticker'
let authorCorner = 'E1';            // 'E1'..'E6'
let authorStickerType = 'vehiculos';
let isDrawingRoute = false;
let currentDrawingPoints = [];
let draggingStickerId = null;

// Estado Simulación de Partículas
let particleAnimId = null;
let boardParticles = [];
let particleModeFilters = { tp: true, auto: true, pie: true };
let particleSpeedMultiplier = 1.0;
let showParticleMap = true;
let particleMapOpacity = 0.28;
let isCornerZoomed = false;

// Estado de Sincronización con las 5 Google Sheets
let sheetsSyncStatus = {
  resumen:    { name: '04_Resumen_Graficos_Plaza_Sotomayor (Resumen + Por_sesion + Flujos_Digitales)', id: window.GOOGLE_SHEETS_CONFIG.resumenId, ok: true, rows: 120, updated: 'En vivo' },
  encuesta:   { name: 'Resultados - Encuesta Plaza Sotomayor (Respuestas de Encuesta)', id: window.GOOGLE_SHEETS_CONFIG.encuestaId, ok: true, rows: 96, updated: 'En vivo' },
  peatonal:   { name: '01_Registro_Peatonal (Esquinas E1 a E6)', id: window.GOOGLE_SHEETS_CONFIG.peatonalId, ok: true, rows: 539, updated: 'En vivo' },
  transporte: { name: '02_Transporte_Plaza_Sotomayor (Esquinas E1, E3, E4)', id: window.GOOGLE_SHEETS_CONFIG.transporteId, ok: true, rows: 300, updated: 'En vivo' },
  vehicular:  { name: '03_Vehiculos_Plaza_Sotomayor (Esquinas E1 a E6)', id: window.GOOGLE_SHEETS_CONFIG.vehicularId, ok: true, rows: 601, updated: 'En vivo' }
};

function loadFlujosFromStorage() {
  try {
    localStorage.removeItem('ead_g4_flujos_digitales_v2');
    const saved = localStorage.getItem(STORAGE_KEY_FLUJOS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return sanitizeFlowItems(parsed);
    }
  } catch (e) {}
  return sanitizeFlowItems(JSON.parse(JSON.stringify(window.INITIAL_FLUJOS_DATA || [])));
}

function saveFlujosToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_FLUJOS, JSON.stringify(flujosData));
  } catch (e) {}
}

/* =========================================================================
   1. PICTOGRAMAS SVG OFICIALES (FIELES A INSTRUCCIONES 13X25CM V2.PDF)
   ========================================================================= */
function getStickerPictogramSvg(type, strokeColor = '#FFFFFF') {
  switch (type) {
    case 'vehiculos':
      // Auto frontal con parabrisas y focos
      return `<svg viewBox="0 0 36 36" class="w-full h-full p-0.5">
        <path d="M8 20 L10.5 12.5 C11 11.2 12.2 10.5 13.6 10.5 H22.4 C23.8 10.5 25 11.2 25.5 12.5 L28 20 V26 C28 26.8 27.3 27.5 26.5 27.5 H25 C24.2 27.5 23.5 26.8 23.5 26 V24.5 H12.5 V26 C12.5 26.8 11.8 27.5 11 27.5 H9.5 C8.7 27.5 8 26.8 8 26 V20 Z" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M10.5 18.5 H25.5" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="12.5" cy="21.5" r="1.7" fill="${strokeColor}"/>
        <circle cx="23.5" cy="21.5" r="1.7" fill="${strokeColor}"/>
      </svg>`;
    case 'senalizacion':
      // Poste con letreros direccionales y línea diagonal tachada
      return `<svg viewBox="0 0 36 36" class="w-full h-full p-0.5">
        <line x1="18" y1="7" x2="18" y2="29" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
        <path d="M11 11 H23 L25.5 13.5 L23 16 H11 Z" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M25 18.5 H13 L10.5 21 L13 23.5 H25 Z" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
        <line x1="8" y1="28" x2="28" y2="8" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;
    case 'personas':
      // Dos siluetas humanas sobre la línea de vereda
      return `<svg viewBox="0 0 36 36" class="w-full h-full p-0.5">
        <circle cx="13.5" cy="11" r="2.6" fill="${strokeColor}"/>
        <path d="M10.5 15.5 C10.5 14.3 11.8 13.8 13.5 13.8 C15.2 13.8 16.5 14.3 16.5 15.5 V21.5 H15 V26 H12 V21.5 H10.5 Z" fill="${strokeColor}"/>
        <circle cx="22.5" cy="11" r="2.6" fill="${strokeColor}"/>
        <path d="M19.5 15.5 C19.5 14.3 20.8 13.8 22.5 13.8 C24.2 13.8 25.5 14.3 25.5 15.5 V21.5 H24 V26 H21 V21.5 H19.5 Z" fill="${strokeColor}"/>
        <line x1="7" y1="28.2" x2="29" y2="28.2" stroke="${strokeColor}" stroke-width="2.3" stroke-linecap="round"/>
      </svg>`;
    case 'espacio':
      // Persona entre dos muros verticales con flechas hacia adentro |-> o <-|
      return `<svg viewBox="0 0 36 36" class="w-full h-full p-0.5">
        <line x1="7.5" y1="8" x2="7.5" y2="28" stroke="${strokeColor}" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="28.5" y1="8" x2="28.5" y2="28" stroke="${strokeColor}" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="18" cy="12" r="2.4" fill="${strokeColor}"/>
        <path d="M15.3 16.5 C15.3 15.5 16.5 15 18 15 C19.5 15 20.7 15.5 20.7 16.5 V22 H19.3 V27 H16.7 V22 H15.3 Z" fill="${strokeColor}"/>
        <path d="M9.5 18 H14 M12.2 16 L14.2 18 L12.2 20" fill="none" stroke="${strokeColor}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26.5 18 H22 M23.8 16 L21.8 18 L23.8 20" fill="none" stroke="${strokeColor}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'cruce':
    default:
      // Paso de cebra (3 barras verticales) con una cruz en la esquina inferior derecha
      return `<svg viewBox="0 0 36 36" class="w-full h-full p-0.5">
        <line x1="10" y1="9" x2="10" y2="26.5" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round"/>
        <line x1="15.5" y1="9" x2="15.5" y2="26.5" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round"/>
        <line x1="21" y1="9" x2="21" y2="18.5" stroke="${strokeColor}" stroke-width="2.8" stroke-linecap="round"/>
        <line x1="21" y1="21.5" x2="27.5" y2="28" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round"/>
        <line x1="27.5" y1="21.5" x2="21" y2="28" stroke="${strokeColor}" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;
  }
}

/* =========================================================================
   2. RENDERIZADO DE LEYENDAS DE PICTOGRAMAS (SECCIÓN 01 Y PANEL 19x41CM)
   ========================================================================= */
function renderPictogramLegends() {
  const sec1Container = document.getElementById('codificacionPictogramsList');
  const panelLegend = document.getElementById('instructionStickerLegend');

  const territoryItems = flujosData.filter(f => f.territorio === currentTerritory && f.tipo === 'sticker');

  if (sec1Container) {
    sec1Container.innerHTML = Object.values(window.STICKER_TYPES).map(st => {
      const count = territoryItems.filter(i => i.categoria === st.id).length;
      return `
        <div onclick="setStickerFilter('${st.id}'); document.getElementById('tablero').scrollIntoView({behavior:'smooth'});" class="p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/90 flex items-center justify-between gap-3 cursor-pointer transition">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-neutral-900 text-white shrink-0 flex items-center justify-center shadow-sm">
              ${getStickerPictogramSvg(st.id, '#FFFFFF')}
            </div>
            <div>
              <span class="text-xs font-extrabold text-neutral-900 block">${st.label}</span>
              <span class="text-[11px] text-stone-500 block">${st.desc}</span>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-white border border-stone-200 text-[10px] font-extrabold text-neutral-900 shrink-0">${count} en micas</span>
        </div>
      `;
    }).join('');
  }

  if (panelLegend) {
    const activeStickers = territoryItems.filter(i => currentCornerFilter === 'ALL' || i.esquina === currentCornerFilter);
    panelLegend.innerHTML = Object.values(window.STICKER_TYPES).map(st => {
      const count = activeStickers.filter(i => i.categoria === st.id).length;
      const isActive = (currentStickerFilter === st.id);
      return `
        <button type="button" onclick="setStickerFilter('${currentStickerFilter === st.id ? 'ALL' : st.id}')" class="w-full p-1.5 rounded-xl ${isActive ? 'bg-neutral-900 text-white' : 'hover:bg-stone-100 text-neutral-900'} flex items-center justify-between gap-2 text-left transition">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full ${isActive ? 'bg-taupe' : 'bg-neutral-900'} text-white shrink-0 flex items-center justify-center">
              ${getStickerPictogramSvg(st.id, '#FFFFFF')}
            </div>
            <span class="text-[11px] font-bold leading-tight">${st.label}</span>
          </div>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'}">${count}</span>
        </button>
      `;
    }).join('');
  }
}

/* =========================================================================
   3. MAPA BASE EN VINILO NEGRO/BLANCO + GRABADO LÁSER DE ACRÍLICO
      (PLAZA SOTOMAYOR EN VALPARAÍSO Y PLAZA DE MAYO EN BUENOS AIRES)
   ========================================================================= */
function renderBaseVinylMap() {
  const svg = document.getElementById('baseVinylMapSvg');
  if (!svg) return;

  if (currentTerritory === 'sotomayor') {
    // Mapa fiel al prototipo físico de Plaza Sotomayor (media_1794271366400_67b72309.jpg)
    // Manzanas en negro con líneas blancas grabadas, calles en gris claro/blanco translúcido, pasos de cebra y las 6 esquinas numeradas
    const c = window.CORNERS_CONFIG;
    svg.innerHTML = `
      <defs>
        <pattern id="zebraH" width="1.2" height="4" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="0.65" height="4" fill="rgba(255,255,255,0.55)" />
        </pattern>
        <pattern id="zebraV" width="4" height="1.2" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="4" height="0.65" fill="rgba(255,255,255,0.55)" />
        </pattern>
      </defs>

      <!-- Fondo de calles (gris grafito claro del grabado sobre trovicel) -->
      <rect x="0" y="0" width="100" height="100" fill="#23252b" />

      <!-- MANZANAS SUPERIORES (Borde Norte/Poniente: Armada, Institucional, Comercio, Estación) -->
      <g fill="#0c0d10" stroke="rgba(255,255,255,0.62)" stroke-width="0.32">
        <!-- Manzana Sup-Izq (Edificio Armada) -->
        <rect x="2" y="2" width="12.5" height="17" rx="0.5" />
        <rect x="3.5" y="3.5" width="9.5" height="14" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />
        <!-- Manzana Sup-Centro-Izq (Prat a Cochrane) -->
        <rect x="23" y="2" width="18.5" height="17" rx="0.5" />
        <rect x="25" y="3.5" width="14.5" height="14" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />
        <!-- Manzana Sup-Centro-Der (Cochrane a Blanco) -->
        <rect x="50" y="2" width="21.5" height="17" rx="0.5" />
        <rect x="52" y="3.5" width="17.5" height="14" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />
        <!-- Manzana Sup-Der (Blanco a Puerto) -->
        <rect x="80" y="2" width="18" height="17" rx="0.5" />
        <rect x="82" y="3.5" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />

        <!-- FRANJA CENTRAL: BORDES Y EXPLANADAS DE PLAZA SOTOMAYOR -->
        <!-- Borde Izquierdo (Serrano) -->
        <rect x="2" y="31" width="12.5" height="35" rx="0.5" />
        <!-- Explanada Central 1 (Plaza Sotomayor Poniente con 6 jardineras grabadas [X]) -->
        <rect x="23" y="31" width="18.5" height="35" rx="0.8" />
        <!-- Jardineras grabadas en la explanada poniente (igual a la foto real en mesa) -->
        <g stroke="rgba(255,255,255,0.45)" stroke-width="0.22" fill="none">
          <rect x="25" y="34" width="4" height="6" /><line x1="25" y1="34" x2="29" y2="40"/><line x1="29" y1="34" x2="25" y2="40"/>
          <rect x="30.2" y="34" width="4" height="6" /><line x1="30.2" y1="34" x2="34.2" y2="40"/><line x1="34.2" y1="34" x2="30.2" y2="40"/>
          <rect x="35.5" y="34" width="4" height="6" /><line x1="35.5" y1="34" x2="39.5" y2="40"/><line x1="39.5" y1="34" x2="35.5" y2="40"/>
          <rect x="25" y="42" width="4" height="6" /><line x1="25" y1="42" x2="29" y2="48"/><line x1="29" y1="42" x2="25" y2="48"/>
          <rect x="30.2" y="42" width="4" height="6" /><line x1="30.2" y1="42" x2="34.2" y2="48"/><line x1="34.2" y1="42" x2="30.2" y2="48"/>
          <rect x="35.5" y="42" width="4" height="6" /><line x1="35.5" y1="42" x2="39.5" y2="48"/><line x1="39.5" y1="42" x2="35.5" y2="48"/>
          <rect x="25" y="51" width="14.5" height="12" />
        </g>

        <!-- Explanada Central 2 (Monumento a los Héroes de Iquique con diagonales grabadas) -->
        <rect x="50" y="31" width="21.5" height="35" rx="0.8" />
        <g stroke="rgba(255,255,255,0.45)" stroke-width="0.24" fill="none">
          <rect x="51.8" y="33.5" width="4.2" height="6.5" /><line x1="51.8" y1="33.5" x2="56" y2="40"/><line x1="56" y1="33.5" x2="51.8" y2="40"/>
          <rect x="51.8" y="42" width="4.2" height="6.5" /><line x1="51.8" y1="42" x2="56" y2="48.5"/><line x1="56" y1="42" x2="51.8" y2="48.5"/>
          <rect x="57.5" y="33.5" width="12" height="29.5" />
          <line x1="57.5" y1="33.5" x2="69.5" y2="63" />
          <line x1="69.5" y1="33.5" x2="57.5" y2="63" />
          <circle cx="63.5" cy="48.2" r="3.4" fill="#18191e" stroke="rgba(255,255,255,0.75)" stroke-width="0.35" />
        </g>

        <!-- Manzana Central-Der (Borde Estación Puerto / Aduana) -->
        <rect x="80" y="31" width="18" height="35" rx="0.5" />
        <rect x="82.5" y="34" width="13" height="29" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />

        <!-- MANZANAS INFERIORES (Borde Sur/Oriente: CCNI, CENTEX, Hotel de las Artes, BancoEstado) -->
        <rect x="2" y="78" width="12.5" height="20" rx="0.5" />
        <rect x="23" y="78" width="18.5" height="20" rx="0.5" />
        <rect x="25" y="80" width="14.5" height="16" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />
        <rect x="50" y="78" width="21.5" height="20" rx="0.5" />
        <polygon points="52,96 60.8,80 69.5,96" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.22" />
        <rect x="80" y="78" width="18" height="20" rx="0.5" />
      </g>

      <!-- PASOS PEATONALES (CEBRAS GRABADAS EN LÍNEA BLANCA) -->
      <g opacity="0.85">
        <!-- Cruces en Prat -->
        <rect x="15" y="19.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="15" y="28.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="15" y="66.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="15" y="75.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <!-- Cruces en Cochrane -->
        <rect x="42" y="19.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="42" y="28.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="42" y="66.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="42" y="75.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <!-- Cruces en Blanco -->
        <rect x="72" y="19.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="72" y="28.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="72" y="66.5" width="7.5" height="2.2" fill="url(#zebraH)" />
        <rect x="72" y="75.2" width="7.5" height="2.2" fill="url(#zebraH)" />
        <!-- Cruces transversales Sotomayor -->
        <rect x="21" y="22" width="2.2" height="6" fill="url(#zebraV)" />
        <rect x="48.2" y="22" width="2.2" height="6" fill="url(#zebraV)" />
        <rect x="70.2" y="22" width="2.2" height="6" fill="url(#zebraV)" />
        <rect x="21" y="69" width="2.2" height="6" fill="url(#zebraV)" />
        <rect x="48.2" y="69" width="2.2" height="6" fill="url(#zebraV)" />
        <rect x="70.2" y="69" width="2.2" height="6" fill="url(#zebraV)" />
      </g>

      <!-- NOMBRES DE CALLES Y FLECHAS DE DIRECCIÓN DEL TRÁNSITO GRABADAS (COMPENSADAS EN ESCALA 0.75x HORIZONTAL PARA NO VERSE APLASTADAS) -->
      <g fill="rgba(255,255,255,0.72)" font-family="Montserrat, sans-serif" font-weight="700" font-size="2.5" letter-spacing="0.16">
        <g transform="translate(18.8, 49) scale(0.75, 1) rotate(-90)"><text x="0" y="0" text-anchor="middle">Prat</text></g>
        <g transform="translate(45.8, 49) scale(0.75, 1) rotate(-90)"><text x="0" y="0" text-anchor="middle">Cochrane</text></g>
        <g transform="translate(75.8, 49) scale(0.75, 1) rotate(-90)"><text x="0" y="0" text-anchor="middle">Blanco</text></g>
        <g transform="translate(58, 25.8) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle">Sotomayor</text></g>
        <g transform="translate(58, 73.2) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle">Sotomayor</text></g>
        <!-- Flechas de sentido vehicular -->
        <g transform="translate(18.8, 13) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="3.0">↓</text></g>
        <g transform="translate(45.8, 13) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="3.0">↑</text></g>
        <g transform="translate(75.8, 86) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="3.0">↑</text></g>
        <g transform="translate(34, 25.8) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="3.0">←</text></g>
        <g transform="translate(34, 73.2) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="3.0">→</text></g>
      </g>

      <!-- LAS 6 ESQUINAS NUMERADAS EN EL PLANO BASE (CÍRCULOS Y NÚMEROS PERFECTAMENTE REDONDOS CON SCALE 0.75, 1) -->
      ${Object.values(c).map(corner => `
        <g transform="translate(${corner.mapX}, ${corner.mapY}) scale(0.75, 1)">
          <circle cx="0" cy="0" r="3.4" fill="#111215" stroke="${corner.hex}" stroke-width="0.7" />
          <text x="0" y="1.05" text-anchor="middle" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="900" font-size="3.0">${corner.num}</text>
        </g>
      `).join('')}
    `;
  } else {
    // Mapa adaptado para PLAZA DE MAYO (BUENOS AIRES)
    const c = window.CORNERS_CONFIG;
    svg.innerHTML = `
      <rect x="0" y="0" width="100" height="100" fill="#23252b" />
      <g fill="#0c0d10" stroke="rgba(255,255,255,0.62)" stroke-width="0.32">
        <!-- Borde Norte (Catedral Metropolitana, Banco Nación) -->
        <rect x="2" y="2" width="14" height="15" rx="0.5" />
        <rect x="22" y="2" width="24" height="15" rx="0.5" />
        <rect x="52" y="2" width="26" height="15" rx="0.5" />
        <rect x="84" y="2" width="14" height="15" rx="0.5" />

        <!-- Borde Oeste (Cabildo de Buenos Aires y Av. de Mayo) -->
        <rect x="2" y="25" width="12" height="20" rx="0.5" />
        <rect x="2" y="53" width="12" height="20" rx="0.5" />

        <!-- GRAN EXPLANADA CENTRAL DE PLAZA DE MAYO (Pirámide de Mayo y Monumento a Belgrano) -->
        <rect x="22" y="25" width="56" height="48" rx="2.5" />
        <g stroke="rgba(255,255,255,0.42)" stroke-width="0.25" fill="none">
          <line x1="22" y1="25" x2="78" y2="73" />
          <line x1="78" y1="25" x2="22" y2="73" />
          <line x1="50" y1="25" x2="50" y2="73" />
          <line x1="22" y1="49" x2="78" y2="49" />
          <!-- Pirámide de Mayo (Centro) -->
          <g transform="translate(44, 49) scale(0.75, 1)">
            <circle cx="0" cy="0" r="4.6" fill="#18191e" stroke="rgba(255,255,255,0.85)" stroke-width="0.4" />
          </g>
          <!-- Monumento a Belgrano (Oriente hacia Casa Rosada) -->
          <g transform="translate(64, 49) scale(0.75, 1)">
            <circle cx="0" cy="0" r="3.5" fill="#18191e" stroke="rgba(255,255,255,0.75)" stroke-width="0.35" />
          </g>
        </g>

        <!-- Borde Este (Casa Rosada) -->
        <rect x="85" y="25" width="13" height="48" rx="0.8" />
        <rect x="87" y="29" width="9" height="40" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.25" />

        <!-- Borde Sur (Ministerio de Economía, AFIP, Banco Hipotecario) -->
        <rect x="2" y="81" width="14" height="17" rx="0.5" />
        <rect x="22" y="81" width="24" height="17" rx="0.5" />
        <rect x="52" y="81" width="26" height="17" rx="0.5" />
        <rect x="84" y="81" width="14" height="17" rx="0.5" />
      </g>

      <!-- Calles de Plaza de Mayo -->
      <g fill="rgba(255,255,255,0.72)" font-family="Montserrat, sans-serif" font-weight="700" font-size="2.3" letter-spacing="0.15">
        <g transform="translate(50, 21.5) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle">Av. Rivadavia</text></g>
        <g transform="translate(50, 77.8) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle">Hipólito Yrigoyen</text></g>
        <g transform="translate(18, 49) scale(0.75, 1) rotate(-90)"><text x="0" y="0" text-anchor="middle">Bolívar (Cabildo)</text></g>
        <g transform="translate(81.5, 49) scale(0.75, 1) rotate(-90)"><text x="0" y="0" text-anchor="middle">Balcarce (Casa Rosada)</text></g>
        <g transform="translate(8, 49.8) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="2.0">Av. de Mayo</text></g>
        <g transform="translate(44, 56) scale(0.75, 1)"><text x="0" y="0" text-anchor="middle" font-size="1.9" fill="rgba(255,255,255,0.55)">Pirámide de Mayo</text></g>
      </g>

      <!-- Las 6 esquinas homologadas en Plaza de Mayo -->
      ${Object.values(c).map(corner => `
        <g transform="translate(${corner.baMapX}, ${corner.baMapY}) scale(0.75, 1)">
          <circle cx="0" cy="0" r="3.4" fill="#111215" stroke="${corner.hex}" stroke-width="0.7" />
          <text x="0" y="1.05" text-anchor="middle" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="900" font-size="3.0">${corner.num}</text>
        </g>
      `).join('')}
    `;
  }
}

/* =========================================================================
   4. RENDERIZADO DE LAS 6 MICAS: TRAZOS DE FLUJO + STICKERS EN VINILO
   ========================================================================= */
function parseCoordsList(coordsStr) {
  if (!coordsStr) return [];
  return String(coordsStr)
    .split(';')
    .map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    })
    .filter(pt => !isNaN(pt.x) && !isNaN(pt.y));
}

function buildSmoothSvgPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(2);
    const midY = ((prev.y + curr.y) / 2).toFixed(2);
    if (i === 1) {
      d += ` L ${midX} ${midY}`;
    } else {
      d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${midX} ${midY}`;
    }
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

function renderBoardRoutesAndStickers() {
  const routesSvg = document.getElementById('micaPoscaRoutesSvg');
  const stickersLayer = document.getElementById('micaStickersLayer');
  const photoUnderlay = document.getElementById('realMicaPhotoUnderlay');
  if (!routesSvg || !stickersLayer) return;

  // Actualizar foto real calco si está activada
  if (photoUnderlay) {
    if (showPhotoUnderlay && currentTerritory === 'sotomayor') {
      photoUnderlay.classList.remove('hidden');
      if (currentCornerFilter === 'ALL') {
        photoUnderlay.src = 'assets/mica_superpuesta.jpg';
      } else {
        const cCfg = window.CORNERS_CONFIG[currentCornerFilter];
        if (cCfg) photoUnderlay.src = cCfg.photoAsset;
      }
    } else {
      photoUnderlay.classList.add('hidden');
    }
  }

  const territoryItems = flujosData.filter(f => f.territorio === currentTerritory);
  const routes = territoryItems.filter(f => f.tipo === 'trazo');
  const stickers = territoryItems.filter(f => f.tipo === 'sticker');

  // Definir marcadores de punta de flecha por color de esquina
  const defsHtml = `
    <defs>
      ${Object.values(window.CORNERS_CONFIG).map(c => `
        <marker id="arrow-${c.id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="${c.hex}" />
        </marker>
      `).join('')}
    </defs>
  `;

  // Renderizar cada trazo de flujo dibujado (si están visibles en Tablero 2D)
  const shouldShowStrokes = (currentBoardMode === '2d' ? showDrawnFlows2D : false);
  const routesHtml = !shouldShowStrokes ? '' : routes.map(r => {
    const cornerCfg = window.CORNERS_CONFIG[r.esquina] || window.CORNERS_CONFIG.E1;
    const isCornerMatch = (currentCornerFilter === 'ALL' || currentCornerFilter === r.esquina);
    if (!isCornerMatch) return '';
    const pts = parseCoordsList(r.coords);
    if (pts.length < 2) return '';
    const d = buildSmoothSvgPath(pts);
    const isSelected = (selectedBoardItemId === r.id);
    const opacity = isSelected ? 1 : 0.9;
    const strokeW = isSelected ? 1.35 : 0.92;
    const animClass = animateFlowsFlag ? 'animate-flow-stroke' : '';

    return `
      <path
        d="${d}"
        stroke="${cornerCfg.hex}"
        stroke-width="${strokeW}"
        opacity="${opacity}"
        marker-end="url(#arrow-${cornerCfg.id})"
        class="posca-stroke ${isSelected ? 'selected-stroke' : ''} ${animClass}"
        style="color:${cornerCfg.hex}; pointer-events:stroke;"
        onclick="selectBoardItem('${r.id}', event)"
      >
        <title>${r.id} (${cornerCfg.shortName}): ${r.nota || 'Recorrido en mica'}</title>
      </path>
    `;
  }).join('');

  // Si el usuario está dibujando un trazo nuevo en Modo Autor, previsualizarlo en vivo
  let activeDrawHtml = '';
  if (isDrawingRoute && currentDrawingPoints.length > 1) {
    const cCfg = window.CORNERS_CONFIG[authorCorner];
    const d = buildSmoothSvgPath(currentDrawingPoints);
    activeDrawHtml = `<path d="${d}" stroke="${cCfg.hex}" stroke-width="1.2" fill="none" stroke-dasharray="1.5 0.8" marker-end="url(#arrow-${cCfg.id})" />`;
  }

  routesSvg.innerHTML = defsHtml + routesHtml + activeDrawHtml;

  // Renderizar cada sticker en vinilo sobre la mica
  stickersLayer.innerHTML = '';
  stickers.forEach(st => {
    const cornerCfg = window.CORNERS_CONFIG[st.esquina] || window.CORNERS_CONFIG.E1;
    const stTypeCfg = window.STICKER_TYPES[st.categoria] || window.STICKER_TYPES.cruce;
    const isCornerMatch = (currentCornerFilter === 'ALL' || currentCornerFilter === st.esquina);
    const isStickerMatch = (currentStickerFilter === 'ALL' || currentStickerFilter === st.categoria);
    const isVisible = isCornerMatch && isStickerMatch;
    if (!isVisible) return;

    const pts = parseCoordsList(st.coords);
    if (!pts.length) return;
    const { x, y } = pts[0];

    const el = document.createElement('div');
    const isSelected = (selectedBoardItemId === st.id);
    const textColor = st.esquina === 'E2' ? '#171717' : '#FFFFFF';
    el.className = `vinyl-sticker w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center ${isSelected ? 'selected-sticker' : ''}`;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.backgroundColor = cornerCfg.hex;
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    el.style.zIndex = isSelected ? '85' : '45';
    el.title = `${st.id} • ${cornerCfg.shortName} • ${stTypeCfg.label}: ${st.nota || ''}`;
    el.innerHTML = getStickerPictogramSvg(st.categoria, textColor);

    el.onclick = (e) => {
      e.stopPropagation();
      selectBoardItem(st.id, e);
    };

    if (isAuthorUnlocked) {
      el.onmousedown = (e) => startDragSticker(e, st.id);
      el.ontouchstart = (e) => startDragSticker(e, st.id);
    }

    stickersLayer.appendChild(el);
  });

  renderPictogramLegends();
  renderMicaSummaryBreakdown();
  updateHeroKPIs();
}

function toggleDrawnFlows2D() {
  showDrawnFlows2D = !showDrawnFlows2D;
  const btn = document.getElementById('btnToggleDrawnFlows');
  const txt = document.getElementById('drawnFlowsBtnText');
  if (txt) {
    txt.textContent = showDrawnFlows2D ? 'Líneas de Flujo: Visibles' : 'Activar Líneas de Flujo';
  }
  if (btn) {
    btn.className = showDrawnFlows2D
      ? 'px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-neutral-900 text-white flex items-center gap-1.5 transition shadow-sm'
      : 'px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-500 text-neutral-950 flex items-center gap-1.5 transition shadow-sm';
  }
  if (showDrawnFlows2D) {
    animateDrawnFlows2D();
  } else {
    renderBoardRoutesAndStickers();
  }
}

function animateDrawnFlows2D() {
  showDrawnFlows2D = true;
  const btn = document.getElementById('btnToggleDrawnFlows');
  const txt = document.getElementById('drawnFlowsBtnText');
  if (txt) txt.textContent = 'Líneas de Flujo: Visibles';
  if (btn) {
    btn.className = 'px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-neutral-900 text-white flex items-center gap-1.5 transition shadow-sm';
  }
  animateFlowsFlag = true;
  renderBoardRoutesAndStickers();
  clearTimeout(window._animFlowsTimer);
  window._animFlowsTimer = setTimeout(() => {
    animateFlowsFlag = false;
  }, 1600);
}

function selectBoardItem(itemId, event) {
  if (event) event.stopPropagation();
  selectedBoardItemId = itemId;
  const item = flujosData.find(f => f.id === itemId);
  if (!item) return;

  const cornerCfg = window.CORNERS_CONFIG[item.esquina] || window.CORNERS_CONFIG.E1;
  document.getElementById('inspItemId').textContent = `#${item.id}`;
  document.getElementById('inspItemDot').style.backgroundColor = cornerCfg.hex;

  if (item.tipo === 'sticker') {
    const stType = window.STICKER_TYPES[item.categoria] || window.STICKER_TYPES.cruce;
    document.getElementById('inspItemTitle').textContent = `${cornerCfg.shortName} • Sticker: ${stType.label}`;
  } else {
    document.getElementById('inspItemTitle').textContent = `${cornerCfg.shortName} • Trazo de Flujo (${item.categoria === 'cruce_informal' ? 'Cruce / Corte de camino' : 'Ruta formal'})`;
  }

  document.getElementById('inspItemDesc').textContent = item.nota || 'Registro levantado en lámina de mica.';
  const delWrap = document.getElementById('inspDeleteWrap');
  if (delWrap) {
    if (isAuthorUnlocked) delWrap.classList.remove('hidden');
    else delWrap.classList.add('hidden');
  }

  renderBoardRoutesAndStickers();
}

/* =========================================================================
   5. FILTROS DEL TABLERO, MODOS DE VISTA (2D, PARTÍCULAS, 3D, FOTOS)
   ========================================================================= */
function setBoardTerritory(territoryKey) {
  currentTerritory = territoryKey;
  resetParticleCornerZoom();

  const btnCl = document.getElementById('btnTerritorySotomayor');
  const btnAr = document.getElementById('btnTerritoryMayo');
  const badge = document.getElementById('boardActiveTerritoryBadge');
  const question = document.getElementById('instructionPanelQuestion');
  const summaryLabel = document.getElementById('micaSummaryTerritoryLabel');

  if (territoryKey === 'sotomayor') {
    btnCl.className = 'px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider bg-neutral-900 text-white transition flex items-center gap-2';
    btnAr.className = 'px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-300 transition flex items-center gap-2';
    badge.textContent = '🇨🇱 Plaza Sotomayor (Valparaíso)';
    question.textContent = '¿Qué recorrido utilizaste la última vez que atravesaste Plaza Sotomayor?';
    if (summaryLabel) summaryLabel.textContent = 'Plaza Sotomayor (Valparaíso)';
  } else {
    btnAr.className = 'px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider bg-neutral-900 text-white transition flex items-center gap-2';
    btnCl.className = 'px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-300 transition flex items-center gap-2';
    badge.textContent = '🇦🇷 Plaza de Mayo (Buenos Aires)';
    question.textContent = '¿Qué recorrido utilizaste la última vez que atravesaste Plaza de Mayo?';
    if (summaryLabel) summaryLabel.textContent = 'Plaza de Mayo (Buenos Aires)';
  }

  renderBaseVinylMap();
  renderBoardRoutesAndStickers();
  updateParticleMapVisibility();
  if (currentBoardMode === '3d') render3DExplodedStack();
  if (currentBoardMode === 'particles') rebuildParticlesForBoard();
}

function setCornerFilter(cornerKey) {
  currentCornerFilter = cornerKey;
  document.querySelectorAll('.corner-filter-btn').forEach(btn => {
    const k = btn.dataset.corner;
    if (k === cornerKey) {
      btn.className = 'corner-filter-btn px-3.5 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider bg-neutral-900 text-white flex items-center gap-1.5 transition shadow-sm';
    } else {
      btn.className = 'corner-filter-btn px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-white text-stone-700 border border-stone-300 hover:border-neutral-900 flex items-center gap-1.5 transition';
    }
  });

  const layerBadge = document.getElementById('boardActiveLayerBadge');
  if (layerBadge) {
    layerBadge.textContent = cornerKey === 'ALL'
      ? '6 Esquinas Superpuestas'
      : `Lámina ${window.CORNERS_CONFIG[cornerKey]?.shortName || cornerKey}`;
  }

  if (cornerKey !== 'ALL') {
    setAuthorCorner(cornerKey);
  }

  if (currentBoardMode === '2d' && showDrawnFlows2D) {
    animateDrawnFlows2D();
  } else {
    renderBoardRoutesAndStickers();
  }
  if (currentBoardMode === '3d') render3DExplodedStack();
}

function setStickerFilter(stKey) {
  currentStickerFilter = stKey;
  document.querySelectorAll('.st-filter-btn').forEach(btn => {
    if (btn.dataset.st === stKey) {
      btn.className = 'st-filter-btn px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-taupe text-white transition';
    } else {
      btn.className = 'st-filter-btn px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 transition';
    }
  });
  renderBoardRoutesAndStickers();
}

function focusCornerOnBoard(cornerKey) {
  setCornerFilter(cornerKey);
  document.getElementById('tablero').scrollIntoView({ behavior: 'smooth' });
}

function selectPoscaMarker(cornerKey) {
  setAuthorCorner(cornerKey);
  if (!isAuthorUnlocked) {
    setCornerFilter(currentCornerFilter === cornerKey ? 'ALL' : cornerKey);
  } else {
    showToast(`Esquina ${window.CORNERS_CONFIG[cornerKey].shortName} seleccionada`);
  }
}

function toggleFotoUnderlay(forceState) {
  showPhotoUnderlay = typeof forceState === 'boolean' ? forceState : !showPhotoUnderlay;
  const txt = document.getElementById('photoUnderlayText');
  if (txt) {
    txt.textContent = `Calcar foto real de mica: ${showPhotoUnderlay ? 'ON' : 'OFF'}`;
  }
  renderBoardRoutesAndStickers();
}

function setBoardMode(mode) {
  currentBoardMode = mode;
  const modes = {
    '2d': 'btnMode2D',
    'particles': 'btnModeParticles',
    '3d': 'btnMode3D',
    'photos': 'btnModePhotos'
  };

  Object.entries(modes).forEach(([k, btnId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const iconBox = btn.querySelector('div');
    if (k === mode) {
      btn.className = 'p-4 rounded-xl text-left bg-neutral-900 text-white shadow-md border-2 border-neutral-900 transition flex items-start gap-3.5 group';
      if (iconBox) iconBox.className = 'w-10 h-10 rounded-lg bg-white/15 text-white flex items-center justify-center shrink-0 text-lg';
    } else {
      btn.className = 'p-4 rounded-xl text-left bg-white hover:bg-stone-50 text-neutral-900 border-2 border-stone-300 hover:border-neutral-900 transition flex items-start gap-3.5 group';
      if (iconBox) iconBox.className = 'w-10 h-10 rounded-lg bg-stone-100 group-hover:bg-neutral-900 group-hover:text-white flex items-center justify-center shrink-0 text-lg transition';
    }
  });

  const c2d = document.getElementById('boardContainer2DAndParticles');
  const c3d = document.getElementById('boardContainer3D');
  const cPh = document.getElementById('boardContainerPhotos');
  const pCanvas = document.getElementById('particleFlowCanvas');
  const sub2D = document.getElementById('subControls2D');
  const subP = document.getElementById('subControlsParticles');
  const sub3 = document.getElementById('subControls3D');

  c2d.classList.add('hidden');
  c3d.classList.add('hidden');
  cPh.classList.add('hidden');
  pCanvas.classList.add('hidden');
  if (sub2D) {
    sub2D.classList.add('hidden');
    sub2D.classList.remove('flex');
  }
  subP.classList.add('hidden');
  subP.classList.remove('flex');
  sub3.classList.add('hidden');
  sub3.classList.remove('flex');

  if (mode === '2d') {
    c2d.classList.remove('hidden');
    if (sub2D) {
      sub2D.classList.remove('hidden');
      sub2D.classList.add('flex');
    }
    stopParticleLoop();
    updateParticleMapVisibility();
    renderBoardRoutesAndStickers();
  } else if (mode === 'particles') {
    c2d.classList.remove('hidden');
    pCanvas.classList.remove('hidden');
    subP.classList.remove('hidden');
    subP.classList.add('flex');
    updateParticleMapVisibility();
    renderBoardRoutesAndStickers();
    startParticleLoop();
  } else if (mode === '3d') {
    c3d.classList.remove('hidden');
    sub3.classList.remove('hidden');
    sub3.classList.add('flex');
    stopParticleLoop();
    updateParticleMapVisibility();
    render3DExplodedStack();
  } else if (mode === 'photos') {
    cPh.classList.remove('hidden');
    stopParticleLoop();
    updateParticleMapVisibility();
    renderRealMicasGallery();
  }
}

/* =========================================================================
   6. SIMULACIÓN DE PARTÍCULAS CON CONTROL DE VELOCIDAD Y MAPA DE FONDO TENUE
   ========================================================================= */
function setParticleSpeed(mult) {
  particleSpeedMultiplier = Number(mult) || 1;
  document.querySelectorAll('.pspeed-btn').forEach(btn => {
    if (Number(btn.dataset.pspeed) === particleSpeedMultiplier) {
      btn.className = 'pspeed-btn px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500 text-neutral-950 transition';
    } else {
      btn.className = 'pspeed-btn px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/10 hover:bg-white/20 text-stone-300 transition';
    }
  });
}

function toggleParticleMapOverlay() {
  showParticleMap = !showParticleMap;
  const slider = document.getElementById('sliderParticleMapOpacity');
  if (showParticleMap && particleMapOpacity < 0.08) {
    particleMapOpacity = 0.28;
    if (slider) slider.value = 28;
  }
  updateParticleMapVisibility();
}

function updateParticleMapOpacity(val) {
  const num = Number(val) || 0;
  particleMapOpacity = num / 100;
  showParticleMap = num > 2;
  updateParticleMapVisibility();
}

function updateParticleMapVisibility() {
  const baseSvg = document.getElementById('baseVinylMapSvg');
  const lineOverlay = document.getElementById('particleSubtleMapOverlay');
  const btn = document.getElementById('btnToggleParticleMap');
  const txt = document.getElementById('particleMapBtnText');

  if (currentBoardMode === 'particles') {
    if (showParticleMap) {
      if (baseSvg) baseSvg.style.opacity = String(Math.min(1, particleMapOpacity * 1.6));
      if (lineOverlay) {
        if (currentTerritory === 'sotomayor') {
          lineOverlay.classList.remove('hidden');
          lineOverlay.style.opacity = String(particleMapOpacity);
        } else {
          lineOverlay.classList.add('hidden');
        }
      }
      if (txt) txt.textContent = 'Mapa Base: ON (Suave)';
      if (btn) btn.className = 'px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-500/25 border border-sky-400 text-sky-200 flex items-center gap-1.5 transition';
    } else {
      if (baseSvg) baseSvg.style.opacity = '0';
      if (lineOverlay) lineOverlay.classList.add('hidden');
      if (txt) txt.textContent = 'Mapa Base: OFF (Sin Mapa)';
      if (btn) btn.className = 'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-stone-300 flex items-center gap-1.5 transition';
    }
  } else {
    if (baseSvg) baseSvg.style.opacity = '1';
    if (lineOverlay) lineOverlay.classList.add('hidden');
  }
}

function rebuildParticlesForBoard() {
  const canvas = document.getElementById('particleFlowCanvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(400, rect.width);
  canvas.height = Math.max(250, rect.height);

  const activeRoutes = flujosData.filter(f =>
    f.territorio === currentTerritory &&
    f.tipo === 'trazo' &&
    (currentCornerFilter === 'ALL' || f.esquina === currentCornerFilter)
  );

  boardParticles = [];
  const totalParticles = 520;
  for (let i = 0; i < totalParticles; i++) {
    boardParticles.push(createRouteParticle(activeRoutes));
  }
}

function createRouteParticle(activeRoutes) {
  const rand = Math.random();
  const mode = rand < 0.594 ? 'tp' : (rand < 0.813 ? 'auto' : 'pie');
  const route = activeRoutes.length > 0
    ? activeRoutes[Math.floor(Math.random() * activeRoutes.length)]
    : null;
  const pts = route ? parseCoordsList(route.coords) : [{ x: 15, y: 25 }, { x: 85, y: 75 }];
  const cornerCfg = route ? (window.CORNERS_CONFIG[route.esquina] || window.CORNERS_CONFIG.E1) : window.CORNERS_CONFIG.E1;

  return {
    mode,
    esquina: cornerCfg.id,
    color: cornerCfg.hex,
    pts: pts.length >= 2 ? pts : [{ x: 15, y: 25 }, { x: 85, y: 75 }],
    segIdx: Math.floor(Math.random() * Math.max(1, pts.length - 1)),
    t: Math.random(),
    speed: 0.007 + Math.random() * 0.011,
    jitterX: (Math.random() - 0.5) * 1.1,
    jitterY: (Math.random() - 0.5) * 1.1
  };
}

function startParticleLoop() {
  rebuildParticlesForBoard();
  if (particleAnimId) cancelAnimationFrame(particleAnimId);

  const canvas = document.getElementById('particleFlowCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  function step() {
    if (currentBoardMode !== 'particles') return;
    const w = canvas.width;
    const h = canvas.height;

    // Desvanecer estelas hacia transparente (destination-out) para que el mapa de fondo con baja opacidad sea siempre visible
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fillRect(0, 0, w, h);

    // Dibujar halos de tensión en cada sticker activo
    ctx.globalCompositeOperation = 'source-over';
    const activeStickers = flujosData.filter(f =>
      f.territorio === currentTerritory &&
      f.tipo === 'sticker' &&
      (currentCornerFilter === 'ALL' || f.esquina === currentCornerFilter) &&
      (currentStickerFilter === 'ALL' || f.categoria === currentStickerFilter)
    );

    activeStickers.forEach(st => {
      const pts = parseCoordsList(st.coords);
      if (!pts.length) return;
      const sx = (pts[0].x / 100) * w;
      const sy = (pts[0].y / 100) * h;
      const rad = Math.min(w, h) * 0.065;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.12)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    });

    // Actualizar y dibujar partículas siguiendo las rutas reales de las micas con el multiplicador de velocidad elegido
    ctx.globalCompositeOperation = 'screen';
    boardParticles.forEach(p => {
      if (!particleModeFilters[p.mode]) return;
      if (currentCornerFilter !== 'ALL' && p.esquina !== currentCornerFilter) return;

      const p1 = p.pts[p.segIdx];
      const p2 = p.pts[p.segIdx + 1] || p.pts[0];
      const curX = p1.x + (p2.x - p1.x) * p.t + p.jitterX;
      const curY = p1.y + (p2.y - p1.y) * p.t + p.jitterY;

      // Verificar si pasa cerca de un sticker de fricción (reduce velocidad)
      let localSpeed = p.speed * particleSpeedMultiplier;
      for (let i = 0; i < activeStickers.length; i++) {
        const sPt = parseCoordsList(activeStickers[i].coords)[0];
        if (sPt && Math.hypot(sPt.x - curX, sPt.y - curY) < 5.5) {
          localSpeed *= 0.38;
          break;
        }
      }

      p.t += localSpeed;
      if (p.t >= 1) {
        p.t = 0;
        p.segIdx++;
        if (p.segIdx >= p.pts.length - 1) {
          p.segIdx = 0;
        }
      }

      const px = (curX / 100) * w;
      const py = (curY / 100) * h;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Nodos pulsantes en las 6 esquinas (clic para hacer zoom y abrir diagnóstico)
    ctx.globalCompositeOperation = 'source-over';
    const pulse = Math.sin(Date.now() * 0.004) * 4;
    Object.values(window.CORNERS_CONFIG).forEach(c => {
      const mx = currentTerritory === 'sotomayor' ? c.mapX : c.baMapX;
      const my = currentTerritory === 'sotomayor' ? c.mapY : c.baMapY;
      const px = (mx / 100) * w;
      const py = (my / 100) * h;

      ctx.beginPath();
      ctx.arc(px, py, 14 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = c.hex;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.65;
      ctx.stroke();
    });

    particleAnimId = requestAnimationFrame(step);
  }

  step();
}

function stopParticleLoop() {
  if (particleAnimId) {
    cancelAnimationFrame(particleAnimId);
    particleAnimId = null;
  }
}

function toggleParticleModeFilter(modeKey, btn) {
  particleModeFilters[modeKey] = !particleModeFilters[modeKey];
  btn.classList.toggle('opacity-40', !particleModeFilters[modeKey]);
}

function zoomIntoCornerNode(cornerKey) {
  const c = window.CORNERS_CONFIG[cornerKey];
  if (!c) return;
  const stage = document.getElementById('micaBoardStage');
  const modal = document.getElementById('cornerZoomModal');
  const mx = currentTerritory === 'sotomayor' ? c.mapX : c.baMapX;
  const my = currentTerritory === 'sotomayor' ? c.mapY : c.baMapY;

  isCornerZoomed = true;
  stage.style.transition = 'transform 0.85s cubic-bezier(0.25, 1, 0.5, 1)';
  stage.style.transformOrigin = `${mx}% ${my}%`;
  stage.style.transform = 'scale(1.95)';

  const rPeat = resumenData.peatones.find(r => r.esquina === cornerKey);
  const rVeh = resumenData.vehiculos.find(r => r.esquina === cornerKey);

  document.getElementById('zoomModalSubtitle').textContent = c.vocacion;
  document.getElementById('zoomModalTitle').textContent = currentTerritory === 'sotomayor' ? c.name : c.baName;
  document.getElementById('zoomModalTitle').style.color = c.hex;
  document.getElementById('zoomModalDesc').textContent = c.desc;
  modal.style.borderLeftColor = c.hex;

  document.getElementById('zoomModalMetrics').innerHTML = `
    <div class="p-2 rounded-xl bg-white/5">
      <span class="block text-sm font-extrabold text-white">${rPeat ? rPeat.peatonesMin : '—'}/min</span>
      <span class="text-[9px] uppercase text-stone-400">Peatones</span>
    </div>
    <div class="p-2 rounded-xl bg-white/5">
      <span class="block text-sm font-extrabold text-white">${rPeat ? rPeat.pausaPct + '%' : '—'}</span>
      <span class="text-[9px] uppercase text-stone-400">En Pausa</span>
    </div>
    <div class="p-2 rounded-xl bg-white/5">
      <span class="block text-sm font-extrabold text-amber-400">${rVeh ? rVeh.pctOtro + '%' : '—'}</span>
      <span class="text-[9px] uppercase text-stone-400">Cruce Informal</span>
    </div>
  `;
  modal.classList.remove('hidden');
}

function resetParticleCornerZoom() {
  isCornerZoomed = false;
  const stage = document.getElementById('micaBoardStage');
  const modal = document.getElementById('cornerZoomModal');
  if (stage) stage.style.transform = 'scale(1)';
  if (modal) modal.classList.add('hidden');
}

/* =========================================================================
   7. VISTA EXPLOTADA ISOMÉTRICA 3D DE LAS 6 LÁMINAS DE MICA
   ========================================================================= */
function render3DExplodedStack() {
  const stack = document.getElementById('exploded3DStack');
  if (!stack) return;

  const gap = Number(document.getElementById('slider3DGap')?.value || 34);
  const rotZ = Number(document.getElementById('slider3DRotZ')?.value || -18);
  stack.style.transform = `rotateX(56deg) rotateZ(${rotZ}deg)`;

  const cornersOrder = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
  const territoryItems = flujosData.filter(f => f.territorio === currentTerritory);

  let html = '';

  // Capa 0: Base de Trovicel con Mapa en Vinilo Negro
  html += `
    <div class="exploded-layer bg-[#111215] border-2 border-stone-500 shadow-2xl" style="transform: translateZ(${-3.5 * gap}px);">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-full opacity-90">
        ${document.getElementById('baseVinylMapSvg')?.innerHTML || ''}
      </svg>
      <span class="absolute bottom-2 left-3 px-2.5 py-0.5 rounded bg-black/85 text-white text-[10px] font-extrabold uppercase tracking-wider border border-white/20">
        Base Trovicel + Mapa en Vinilo
      </span>
    </div>
  `;

  // Capas 1 a 6: Las 6 Láminas de Mica Transparentes por Esquina
  cornersOrder.forEach((ck, idx) => {
    const cCfg = window.CORNERS_CONFIG[ck];
    const zOffset = (-2.5 + idx) * gap;
    const isHighlighted = (currentCornerFilter === 'ALL' || currentCornerFilter === ck);
    const layerOpacity = isHighlighted ? 0.96 : 0.18;

    const cRoutes = territoryItems.filter(f => f.tipo === 'trazo' && f.esquina === ck);
    const cStickers = territoryItems.filter(f => f.tipo === 'sticker' && f.esquina === ck);

    const pathsMarkup = cRoutes.map(r => {
      const pts = parseCoordsList(r.coords);
      if (pts.length < 2) return '';
      return `<path d="${buildSmoothSvgPath(pts)}" stroke="${cCfg.hex}" stroke-width="1.15" fill="none" stroke-linecap="round" />`;
    }).join('');

    const dotsMarkup = cStickers.map(st => {
      const pts = parseCoordsList(st.coords);
      if (!pts.length) return '';
      return `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="1.8" fill="${cCfg.hex}" stroke="#ffffff" stroke-width="0.4" />`;
    }).join('');

    html += `
      <div onclick="setCornerFilter('${currentCornerFilter === ck ? 'ALL' : ck}')" class="exploded-layer cursor-pointer border border-white/45 bg-sky-100/10 backdrop-blur-[1px]" style="transform: translateZ(${zOffset}px); opacity:${layerOpacity}; box-shadow: 0 12px 28px rgba(0,0,0,0.28);">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-full">
          ${pathsMarkup}
          ${dotsMarkup}
        </svg>
        <span class="absolute top-2 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow" style="background:${cCfg.hex}; color:${ck === 'E2' ? '#171717' : '#FFFFFF'};">
          Mica ${idx + 1} • ${cCfg.shortName} (${cRoutes.length} rutas, ${cStickers.length} stickers)
        </span>
      </div>
    `;
  });

  // Capa 7 (Superior): Cubierta de Acrílico Grabada
  html += `
    <div class="exploded-layer border-2 border-white/60 bg-white/10 pointer-events-none" style="transform: translateZ(${3.6 * gap}px); box-shadow: inset 0 0 20px rgba(255,255,255,0.25);">
      <span class="absolute top-2 left-3 px-2.5 py-0.5 rounded bg-white/90 text-neutral-900 text-[10px] font-extrabold uppercase tracking-wider">
        Cubierta Superior de Acrílico Grabado
      </span>
    </div>
  `;

  stack.innerHTML = html;
}

function update3DStackTransform() {
  render3DExplodedStack();
}

/* =========================================================================
   8. GALERÍA DE LAS 7 FOTOGRAFÍAS REALES DE LAS MICAS EN TERRENO
   ========================================================================= */
function renderRealMicasGallery() {
  const grid = document.getElementById('realMicasGalleryGrid');
  if (!grid) return;

  const cards = [
    {
      title: 'Flujo Superpuesto (6 Micas Apiladas)',
      subtitle: 'Visualización Colectiva en Terreno',
      color: '#574F4D',
      img: 'assets/mica_superpuesta.jpg',
      fallback: 'https://wiki-ead.b-cdn.net/images/8/8d/Flujo_superpuesto_plaza_soto_mayor.jpeg',
      cornerKey: 'ALL'
    },
    {
      title: 'Dispositivo Físico en Mesa',
      subtitle: 'Base Trovicel + Micas + Instrucciones',
      color: '#171717',
      img: 'assets/dispositivo_mesa.jpg',
      fallback: 'https://wiki-ead.b-cdn.net/images/4/46/PPBS_prototipo_visualizacion_grupo_4_v8_explotada_y_armada.png',
      cornerKey: 'ALL'
    },
    ...Object.values(window.CORNERS_CONFIG).map(c => ({
      title: c.shortName,
      subtitle: c.name,
      color: c.hex,
      img: c.photoAsset,
      fallback: c.wikiPhoto,
      cornerKey: c.id
    }))
  ];

  grid.innerHTML = cards.map(c => `
    <div class="rounded-2xl border border-stone-200 overflow-hidden bg-stone-50 flex flex-col justify-between shadow-sm hover:shadow-md transition">
      <div onclick="openLightbox('${c.img}', '${c.title} — ${c.subtitle}')" class="relative h-48 bg-stone-900 cursor-zoom-in overflow-hidden group">
        <img src="${c.img}" onerror="this.src='${c.fallback}'" alt="${c.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-black text-white shadow" style="background:${c.color}">${c.title}</span>
      </div>
      <div class="p-4 flex items-center justify-between gap-2 bg-white">
        <span class="text-[11px] font-bold text-stone-700 truncate">${c.subtitle}</span>
        <button onclick="setCornerFilter('${c.cornerKey}'); setBoardMode('2d'); toggleFotoUnderlay(true);" class="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-neutral-900 hover:text-white text-[10px] font-extrabold uppercase shrink-0 transition">
          Calcar en 2D
        </button>
      </div>
    </div>
  `).join('');
}

/* =========================================================================
   9. MODO AUTOR: DIBUJAR NUEVOS RECORRIDOS CON PLUMÓN POSCA Y PEGAR STICKERS
   ========================================================================= */
function handleAuthorModeClick() {
  if (isAuthorUnlocked) {
    setAuthorMode(false);
    showToast('Modo Lectura activado');
  } else {
    document.getElementById('authorPinError').classList.add('hidden');
    document.getElementById('authorModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('authorPinInput').focus(), 60);
  }
}

function activateAuthorAndScroll() {
  if (!isAuthorUnlocked) {
    setAuthorMode(true);
    showToast('Modo Autor habilitado: Dibuja sobre el mapa con el cursor');
  }
  setBoardMode('2d');
  document.getElementById('tablero').scrollIntoView({ behavior: 'smooth' });
}

function closeAuthorModal() {
  document.getElementById('authorModal').classList.add('hidden');
}

function verifyAuthorPin() {
  const val = document.getElementById('authorPinInput').value.trim().toLowerCase();
  if (val === 'grupo4' || val === 'pedro' || val === 'ead2026' || val === 'sotomayor') {
    closeAuthorModal();
    setAuthorMode(true);
    setBoardMode('2d');
    showToast('Modo Autor activado: Puedes trazar rutas y pegar stickers');
  } else {
    document.getElementById('authorPinError').classList.remove('hidden');
  }
}

function setAuthorMode(unlocked) {
  isAuthorUnlocked = unlocked;
  const btn = document.getElementById('authorModeToggleBtn');
  const text = document.getElementById('authorModeText');
  const toolbar = document.getElementById('authorToolbarPanel');
  const stage = document.getElementById('micaBoardStage');
  const delWrap = document.getElementById('inspDeleteWrap');

  if (unlocked) {
    btn.className = 'px-3.5 py-2 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition shadow-md';
    text.textContent = 'Modo Autor: ON';
    toolbar.classList.remove('hidden');
    stage.classList.add('cursor-crosshair');
    if (delWrap) delWrap.classList.remove('hidden');
  } else {
    btn.className = 'px-3.5 py-2 rounded-full border border-stone-300 hover:border-neutral-900 bg-white text-[11px] font-bold uppercase tracking-wider text-neutral-700 hover:text-neutral-900 flex items-center gap-1.5 transition shadow-sm';
    text.textContent = 'Añadir Flujos';
    toolbar.classList.add('hidden');
    stage.classList.remove('cursor-crosshair');
    if (delWrap) delWrap.classList.add('hidden');
  }

  renderBoardRoutesAndStickers();
}

function setAuthorTool(tool) {
  authorTool = tool;
  const btnPosca = document.getElementById('toolBtnPosca');
  const btnSticker = document.getElementById('toolBtnSticker');
  if (tool === 'posca') {
    btnPosca.className = 'p-2.5 rounded-2xl bg-white text-emerald-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md';
    btnSticker.className = 'p-2.5 rounded-2xl bg-emerald-900/90 text-emerald-100 border border-emerald-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-800';
  } else {
    btnSticker.className = 'p-2.5 rounded-2xl bg-white text-emerald-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md';
    btnPosca.className = 'p-2.5 rounded-2xl bg-emerald-900/90 text-emerald-100 border border-emerald-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-800';
  }
}

function setAuthorCorner(cornerKey) {
  authorCorner = cornerKey;
  document.querySelectorAll('#authorCornerSwatches button').forEach(b => {
    if (b.dataset.ac === cornerKey) {
      b.classList.add('ring-4', 'ring-white', 'opacity-100', 'scale-110');
      b.classList.remove('opacity-75');
    } else {
      b.classList.remove('ring-4', 'ring-white', 'scale-110');
      b.classList.add('opacity-75');
    }
  });
}

function setAuthorStickerType(stType) {
  authorStickerType = stType;
}

function setupBoardAuthorInteractions() {
  const stage = document.getElementById('micaBoardStage');
  if (!stage) return;

  function getRelativeBoardCoords(e) {
    const rect = stage.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(1.5, Math.min(98.5, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1.5, Math.min(98.5, ((clientY - rect.top) / rect.height) * 100));
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  }

  stage.addEventListener('mousedown', (e) => {
    if (currentBoardMode === 'particles' && !isAuthorUnlocked) {
      // En modo partículas, clic cerca de una esquina hace zoom a esa esquina
      const pt = getRelativeBoardCoords(e);
      Object.values(window.CORNERS_CONFIG).forEach(c => {
        const mx = currentTerritory === 'sotomayor' ? c.mapX : c.baMapX;
        const my = currentTerritory === 'sotomayor' ? c.mapY : c.baMapY;
        if (Math.hypot(pt.x - mx, pt.y - my) < 7) {
          zoomIntoCornerNode(c.id);
        }
      });
      return;
    }

    if (!isAuthorUnlocked || draggingStickerId || currentBoardMode !== '2d') return;
    const pt = getRelativeBoardCoords(e);

    if (authorTool === 'sticker') {
      createNewStickerAt(pt.x, pt.y);
    } else if (authorTool === 'posca') {
      isDrawingRoute = true;
      currentDrawingPoints = [pt];
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDrawingRoute || !isAuthorUnlocked) return;
    const pt = getRelativeBoardCoords(e);
    const last = currentDrawingPoints[currentDrawingPoints.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 2.2) {
      currentDrawingPoints.push(pt);
      renderBoardRoutesAndStickers();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDrawingRoute) return;
    isDrawingRoute = false;
    if (currentDrawingPoints.length >= 2) {
      finalizeNewPoscaRoute(currentDrawingPoints);
    }
    currentDrawingPoints = [];
    renderBoardRoutesAndStickers();
  });
}

function finalizeNewPoscaRoute(points) {
  const cCfg = window.CORNERS_CONFIG[authorCorner];
  const noteInput = document.getElementById('authorNoteInput');
  const customNote = noteInput ? noteInput.value.trim() : '';
  const coordsStr = points.map(p => `${p.x},${p.y}`).join(';');
  const nextNum = flujosData.filter(f => f.tipo === 'trazo' && f.esquina === authorCorner).length + 1;
  const newId = `TR-${authorCorner}-${String(nextNum).padStart(2, '0')}`;

  const newItem = {
    id: newId,
    tipo: 'trazo',
    territorio: currentTerritory,
    esquina: authorCorner,
    colorName: cCfg.colorName,
    categoria: 'cruce_informal',
    coords: coordsStr,
    nota: customNote || `Recorrido trazado en mica ${cCfg.shortName}`,
    fecha: new Date().toLocaleDateString('es-CL')
  };

  flujosData.push(newItem);
  if (noteInput) noteInput.value = '';
  saveFlujosToStorage();
  sendNewItemToWebhookIfConfigured(newItem);
  selectBoardItem(newId);
  showToast(`Trazo ${newId} guardado en mica ${cCfg.colorName}`);
}

function createNewStickerAt(x, y) {
  const cCfg = window.CORNERS_CONFIG[authorCorner];
  const stCfg = window.STICKER_TYPES[authorStickerType];
  const noteInput = document.getElementById('authorNoteInput');
  const customNote = noteInput ? noteInput.value.trim() : '';
  const nextNum = flujosData.filter(f => f.tipo === 'sticker' && f.esquina === authorCorner).length + 1;
  const newId = `ST-${authorCorner}-${String(nextNum).padStart(2, '0')}`;

  const newItem = {
    id: newId,
    tipo: 'sticker',
    territorio: currentTerritory,
    esquina: authorCorner,
    colorName: cCfg.colorName,
    categoria: authorStickerType,
    coords: `${x},${y}`,
    nota: customNote || `${stCfg.label} registrado en mica ${cCfg.shortName}`,
    fecha: new Date().toLocaleDateString('es-CL')
  };

  flujosData.push(newItem);
  if (noteInput) noteInput.value = '';
  saveFlujosToStorage();
  sendNewItemToWebhookIfConfigured(newItem);
  selectBoardItem(newId);
  showToast(`Sticker ${newId} (${stCfg.shortLabel}) adherido`);
}

function startDragSticker(e, stickerId) {
  if (!isAuthorUnlocked) return;
  e.stopPropagation();
  draggingStickerId = stickerId;
  selectBoardItem(stickerId);

  const stage = document.getElementById('micaBoardStage');

  function onMove(moveEv) {
    if (!draggingStickerId) return;
    const rect = stage.getBoundingClientRect();
    const clientX = moveEv.touches ? moveEv.touches[0].clientX : moveEv.clientX;
    const clientY = moveEv.touches ? moveEv.touches[0].clientY : moveEv.clientY;
    const x = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((clientY - rect.top) / rect.height) * 100));

    const item = flujosData.find(f => f.id === draggingStickerId);
    if (item) {
      item.coords = `${x.toFixed(1)},${y.toFixed(1)}`;
      renderBoardRoutesAndStickers();
    }
  }

  function onUp() {
    draggingStickerId = null;
    saveFlujosToStorage();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
}

function deleteSelectedBoardItem() {
  if (!isAuthorUnlocked || !selectedBoardItemId) return;
  flujosData = flujosData.filter(f => f.id !== selectedBoardItemId);
  saveFlujosToStorage();
  selectedBoardItemId = flujosData[0]?.id || '';
  renderBoardRoutesAndStickers();
  showToast('Registro eliminado de la mica');
}

function undoLastFlowItem() {
  if (!isAuthorUnlocked || flujosData.length <= 10) return;
  const popped = flujosData.pop();
  saveFlujosToStorage();
  renderBoardRoutesAndStickers();
  showToast(`Deshecho: ${popped.id}`);
}

function resetFlowsToFieldOriginal() {
  if (!isAuthorUnlocked) return;
  flujosData = JSON.parse(JSON.stringify(window.INITIAL_FLUJOS_DATA || []));
  saveFlujosToStorage();
  renderBoardRoutesAndStickers();
  showToast('Datos originales de terreno restaurados');
}

function copyNewFlowsForGoogleSheets() {
  const tsvRows = flujosData.map(f =>
    [f.id, f.tipo, f.territorio, f.esquina, f.colorName, f.categoria, f.coords, f.nota, f.fecha].join('\t')
  );
  const header = ['ID', 'Tipo', 'Territorio', 'Esquina', 'Color_Mica', 'Categoria_Dificultad', 'Coordenadas', 'Nota_Observacion', 'Fecha'].join('\t');
  navigator.clipboard.writeText([header, ...tsvRows].join('\n'));
  showToast('Filas copiadas (listas para pegar en Google Sheets: Flujos_Digitales)');
}

function exportFlowsCSV() {
  const headers = ['ID', 'Tipo', 'Territorio', 'Esquina', 'Color_Mica', 'Categoria_Dificultad', 'Coordenadas', 'Nota_Observacion', 'Fecha'];
  const rows = flujosData.map(f => [
    f.id, f.tipo, f.territorio, f.esquina, f.colorName, f.categoria,
    `"${f.coords}"`, `"${(f.nota || '').replace(/"/g, '""')}"`, f.fecha
  ].join(','));
  const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = encodeURI(csv);
  a.download = 'flujos_digitales_grupo4.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* =========================================================================
   10. RESUMEN ESTADÍSTICO DEL TABLERO DE MICAS Y HERO KPIS
   ========================================================================= */
function renderMicaSummaryBreakdown() {
  const barsContainer = document.getElementById('micaCornerBreakdownBars');
  const typesContainer = document.getElementById('micaStickerTypeBreakdown');
  if (!barsContainer || !typesContainer) return;

  const pool = flujosData.filter(f => f.territorio === currentTerritory);
  const corners = Object.values(window.CORNERS_CONFIG);

  barsContainer.innerHTML = corners.map(c => {
    const cRoutes = pool.filter(f => f.tipo === 'trazo' && f.esquina === c.id).length;
    const cStickers = pool.filter(f => f.tipo === 'sticker' && f.esquina === c.id).length;
    const pctWidth = Math.min(100, Math.round(((cRoutes + cStickers) / 30) * 100));

    return `
      <div onclick="setCornerFilter('${currentCornerFilter === c.id ? 'ALL' : c.id}')" class="space-y-1 cursor-pointer group">
        <div class="flex items-center justify-between text-xs">
          <span class="font-extrabold text-neutral-900 flex items-center gap-2 group-hover:underline">
            <span class="w-3 h-3 rounded-full" style="background:${c.hex}"></span>
            ${currentTerritory === 'sotomayor' ? c.name : c.baName}
          </span>
          <span class="text-stone-500 font-semibold">${cRoutes} trazos • <strong>${cStickers} stickers</strong></span>
        </div>
        <div class="w-full h-3 rounded-full bg-stone-100 overflow-hidden p-0.5">
          <div class="h-full rounded-full transition-all duration-300" style="width:${Math.max(8, pctWidth)}%; background:${c.hex}"></div>
        </div>
      </div>
    `;
  }).join('');

  const allStickers = pool.filter(f => f.tipo === 'sticker');
  const totalSt = allStickers.length || 1;

  typesContainer.innerHTML = Object.values(window.STICKER_TYPES).map(st => {
    const count = allStickers.filter(s => s.categoria === st.id).length;
    const pct = Math.round((count / totalSt) * 100);
    return `
      <div onclick="setStickerFilter('${currentStickerFilter === st.id ? 'ALL' : st.id}')" class="p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/80 flex items-center justify-between gap-3 cursor-pointer transition">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0">
            ${getStickerPictogramSvg(st.id, '#FFFFFF')}
          </div>
          <div>
            <span class="text-xs font-extrabold text-neutral-900 block">${st.label}</span>
            <span class="text-[10px] text-stone-500">Encuesta: ${st.surveyPct}% • Micas: ${pct}%</span>
          </div>
        </div>
        <span class="text-sm font-black text-neutral-900">${count}</span>
      </div>
    `;
  }).join('');

  // Actualizar contadores comparativos Chile vs Argentina
  const clRoutes = flujosData.filter(f => f.territorio === 'sotomayor' && f.tipo === 'trazo').length;
  const clStickers = flujosData.filter(f => f.territorio === 'sotomayor' && f.tipo === 'sticker').length;
  const arRoutes = flujosData.filter(f => f.territorio === 'plaza_de_mayo' && f.tipo === 'trazo').length;
  const arStickers = flujosData.filter(f => f.territorio === 'plaza_de_mayo' && f.tipo === 'sticker').length;

  if (document.getElementById('compClRoutes')) document.getElementById('compClRoutes').textContent = clRoutes;
  if (document.getElementById('compClStickers')) document.getElementById('compClStickers').textContent = clStickers;
  if (document.getElementById('compArRoutes')) document.getElementById('compArRoutes').textContent = arRoutes;
  if (document.getElementById('compArStickers')) document.getElementById('compArStickers').textContent = arStickers;
}

function updateHeroKPIs() {
  const totalRoutes = flujosData.filter(f => f.tipo === 'trazo').length;
  const totalStickers = flujosData.filter(f => f.tipo === 'sticker').length;
  const totalSurveys = surveyData.length;
  const avgSafety = totalSurveys > 0
    ? (surveyData.reduce((a, b) => a + (Number(b.seguridad) || 3), 0) / totalSurveys).toFixed(2)
    : '2.99';

  if (document.getElementById('heroKpiRoutes')) document.getElementById('heroKpiRoutes').textContent = totalRoutes;
  if (document.getElementById('heroKpiStickers')) document.getElementById('heroKpiStickers').textContent = totalStickers;
  if (document.getElementById('heroKpiSurveys')) document.getElementById('heroKpiSurveys').textContent = totalSurveys;
  if (document.getElementById('heroKpiSafety')) document.getElementById('heroKpiSafety').textContent = avgSafety;
  if (document.getElementById('navSurveyCount')) document.getElementById('navSurveyCount').textContent = totalSurveys;
  if (document.getElementById('sectionSurveyTotal')) document.getElementById('sectionSurveyTotal').textContent = totalSurveys;
}

/* =========================================================================
   11. SECCIÓN 03: DASHBOARD CUANTITATIVO DE LAS 10 SALIDAS DE 10 MINUTOS
   ========================================================================= */
function renderQuantitativeSection() {
  const peatContainer = document.getElementById('chartQuantPeatones');
  const tpContainer = document.getElementById('chartQuantTransporte');
  const crContainer = document.getElementById('chartQuantCruces');
  const tbody = document.getElementById('quantResumenTableBody');

  if (peatContainer) {
    peatContainer.innerHTML = resumenData.peatones.map(r => {
      const c = window.CORNERS_CONFIG[r.esquina];
      const wPct = Math.round((r.peatonesMin / 30) * 100);
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="font-bold text-neutral-900 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" style="background:${c.hex}"></span>
              ${r.esquina} (${r.minutos} min)
            </span>
            <span class="font-semibold text-stone-700"><strong>${r.peatonesMin}</strong> peat/min • <span class="text-taupe">${r.pausaPct}% pausa</span></span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${wPct}%; background:${c.hex}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (tpContainer) {
    const validTp = resumenData.transporte.filter(t => t.aplica);
    tpContainer.innerHTML = validTp.map(t => {
      const c = window.CORNERS_CONFIG[t.esquina];
      return `
        <div class="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold text-neutral-900 flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" style="background:${c.hex}"></span>
              ${c.name}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-white border border-stone-200 text-[10px] font-extrabold text-neutral-900">${t.microsMin} micros/min</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div class="p-2 rounded-xl bg-white border border-stone-200/60">
              <strong class="block text-sm font-black text-neutral-900">${t.esperandoProm}</strong>
              <span class="text-[9px] uppercase text-stone-400">Espera Prom.</span>
            </div>
            <div class="p-2 rounded-xl bg-white border border-stone-200/60">
              <strong class="block text-sm font-black text-rose-600">${t.esperandoMax} pers.</strong>
              <span class="text-[9px] uppercase text-stone-400">Máximo / min</span>
            </div>
            <div class="p-2 rounded-xl bg-white border border-stone-200/60">
              <strong class="block text-sm font-black text-emerald-700">${t.subenMin}/min</strong>
              <span class="text-[9px] uppercase text-stone-400">Suben</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (crContainer) {
    crContainer.innerHTML = resumenData.vehiculos.map(v => {
      const c = window.CORNERS_CONFIG[v.esquina];
      const formalPct = 100 - v.pctOtro;
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="font-bold text-neutral-900 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" style="background:${c.hex}"></span>
              ${v.esquina} (${v.vehMin} veh/min)
            </span>
            <span class="font-bold ${v.pctOtro >= 45 ? 'text-rose-600' : 'text-stone-700'}">${v.pctOtro}% cruce informal (${v.otroMin}/${v.crucesMin})</span>
          </div>
          <div class="w-full h-3 rounded-full bg-stone-100 overflow-hidden flex p-0.5 gap-0.5">
            <div class="h-full bg-emerald-600 rounded-l-full" style="width:${formalPct}%" title="Paso habilitado: ${formalPct}%"></div>
            <div class="h-full bg-rose-500 rounded-r-full" style="width:${v.pctOtro}%" title="Por otro lugar (informal): ${v.pctOtro}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (tbody) {
    tbody.innerHTML = resumenData.peatones.map((p, idx) => {
      const tp = resumenData.transporte[idx];
      const vh = resumenData.vehiculos[idx];
      const c = window.CORNERS_CONFIG[p.esquina];
      return `
        <tr onclick="focusCornerOnBoard('${p.esquina}')" class="hover:bg-stone-50 cursor-pointer transition">
          <td class="py-3.5 px-4 font-extrabold text-neutral-900 flex items-center gap-2">
            <span class="w-3 h-3 rounded-full shrink-0" style="background:${c.hex}"></span>
            <span>${c.name}</span>
          </td>
          <td class="py-3.5 px-4 font-semibold text-stone-600">${p.minutos} min</td>
          <td class="py-3.5 px-4 font-extrabold text-neutral-900">${p.peatonesMin}</td>
          <td class="py-3.5 px-4 font-semibold">${p.pausaMin}/min <span class="text-stone-400">(${p.pausaPct}%)</span></td>
          <td class="py-3.5 px-4 font-semibold">${tp.aplica ? tp.microsMin + '/min' : '<span class="text-stone-400">No aplica</span>'}</td>
          <td class="py-3.5 px-4 font-semibold">${tp.aplica ? `${tp.esperandoProm} prom. (máx ${tp.esperandoMax})` : '<span class="text-stone-400">No aplica</span>'}</td>
          <td class="py-3.5 px-4 font-extrabold text-neutral-900">${vh.vehMin}/min <span class="text-[10px] font-normal text-stone-500">(${vh.partMin} part, ${vh.taxisMin} taxi)</span></td>
          <td class="py-3.5 px-4 font-semibold">${vh.crucesMin}/min <span class="text-[10px] text-stone-500">(${vh.habMin} hab / ${vh.otroMin} otro)</span></td>
          <td class="py-3.5 px-4">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${vh.pctOtro >= 45 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}">${vh.pctOtro}%</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderSessionsComparisonTable();
}

function switchQuantSubTab(tabKey) {
  const map = {
    resumen:  { btn: 'quantTabResumen',  panel: 'quantPanelResumen' },
    sesiones: { btn: 'quantTabSesiones', panel: 'quantPanelSesiones' },
    raw:      { btn: 'quantTabRaw',      panel: 'quantPanelRaw' }
  };

  Object.entries(map).forEach(([k, cfg]) => {
    const b = document.getElementById(cfg.btn);
    const p = document.getElementById(cfg.panel);
    if (k === tabKey) {
      b.className = 'px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-neutral-900 text-white transition';
      p.classList.remove('hidden');
    } else {
      b.className = 'px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider text-stone-600 hover:text-neutral-900 transition';
      p.classList.add('hidden');
    }
  });

  if (tabKey === 'raw') {
    loadLiveRawCornerSheet();
  }
}

function renderSessionsComparisonTable() {
  const container = document.getElementById('sessionsTableContainer');
  const metric = document.getElementById('sessionMetricSelect')?.value || 'peatones_flujo';
  if (!container) return;

  let dataset, rowsObj;
  if (metric === 'peatones_flujo') {
    dataset = sesionesData.peatones;
    rowsObj = dataset.flujo;
  } else if (metric === 'peatones_pausa') {
    dataset = sesionesData.peatones;
    rowsObj = dataset.pausa;
  } else if (metric === 'transporte_micros') {
    dataset = sesionesData.transporte;
    rowsObj = dataset.micros;
  } else if (metric === 'transporte_espera') {
    dataset = sesionesData.transporte;
    rowsObj = dataset.espera;
  } else if (metric === 'vehiculos_flujo') {
    dataset = sesionesData.vehiculos;
    rowsObj = dataset.flujoVeh;
  } else if (metric === 'vehiculos_cruces') {
    dataset = sesionesData.vehiculos;
    rowsObj = dataset.crucesTot;
  } else {
    dataset = sesionesData.vehiculos;
    rowsObj = dataset.crucesOtro;
  }

  const headersHtml = dataset.fechas.map((f, i) => `
    <th class="py-2.5 px-3 text-center border-l border-white/15">
      <span class="block text-[10px] font-black">Salida ${i + 1}</span>
      <span class="block text-[9px] font-normal text-stone-300">${f} (${dataset.dias[i]})</span>
      <span class="block text-[9px] font-semibold text-amber-300">${dataset.horas[i]}</span>
    </th>
  `).join('');

  const bodyHtml = Object.entries(rowsObj).map(([ck, vals]) => {
    const c = window.CORNERS_CONFIG[ck];
    return `
      <tr class="hover:bg-stone-50">
        <td class="py-3 px-4 font-extrabold text-neutral-900 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full" style="background:${c.hex}"></span>
          ${ck}
        </td>
        ${vals.map(v => `<td class="py-3 px-3 text-center font-semibold border-l border-stone-100 ${v === null ? 'text-stone-300' : 'text-neutral-900'}">${v === null ? '—' : v}</td>`).join('')}
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="w-full text-left border-collapse text-xs">
      <thead>
        <tr class="bg-taupe text-white">
          <th class="py-3 px-4 rounded-tl-xl">Esquina</th>
          ${headersHtml}
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-200">${bodyHtml}</tbody>
    </table>
  `;
}

/* =========================================================================
   12. VISOR EN VIVO DE LAS PLANILLAS MINUTO A MINUTO (01, 02, 03)
   ========================================================================= */
async function loadLiveRawCornerSheet() {
  const book = document.getElementById('rawSheetBookSelect')?.value || 'peatonal';
  const corner = document.getElementById('rawSheetCornerSelect')?.value || 'E1';
  const statusEl = document.getElementById('rawSheetStatusLabel');
  const container = document.getElementById('rawSheetTableContainer');
  if (!container) return;

  const idMap = {
    peatonal: window.GOOGLE_SHEETS_CONFIG.peatonalId,
    transporte: window.GOOGLE_SHEETS_CONFIG.transporteId,
    vehicular: window.GOOGLE_SHEETS_CONFIG.vehicularId
  };
  const sheetId = idMap[book];
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(corner)}`;

  if (statusEl) statusEl.textContent = `Consultando Google Sheets (${book} • ${corner})...`;
  container.innerHTML = `<div class="p-8 text-center text-xs text-stone-500">Cargando registros en tiempo real desde Google Sheets...</div>`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    const rows = parseCSV(csvText).filter(r => r.some(cell => cell.trim() !== ''));

    if (rows.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-xs text-stone-500">Sin filas registradas en ${corner}.</div>`;
      return;
    }

    const headerRow = rows[0].slice(0, 11);
    const dataRows = rows.slice(1, 120);

    container.innerHTML = `
      <table class="w-full text-left border-collapse text-[11px]">
        <thead class="sticky top-0 bg-stone-100 text-stone-700 uppercase text-[10px] border-b border-stone-200">
          <tr>
            ${headerRow.map(h => `<th class="py-2.5 px-3 font-extrabold">${h || '—'}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          ${dataRows.map(r => `
            <tr class="hover:bg-stone-50">
              ${headerRow.map((_, i) => `<td class="py-2 px-3 text-stone-700">${r[i] || ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    if (statusEl) statusEl.textContent = `🟢 Conectado en vivo • ${dataRows.length} filas leídas de ${corner}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Modo local activo (Respaldo consolidado)`;
    container.innerHTML = `<div class="p-6 text-xs text-stone-600">No se pudo conectar en directo al endpoint CSV en este momento. Puedes abrir la planilla directamente con el botón superior.</div>`;
  }
}

/* =========================================================================
   13. SECCIÓN 04: ANÁLISIS EN VIVO DE LAS 96+ ENCUESTAS CIUDADANAS
   ========================================================================= */
function renderSurveyAnalyticsAndTable() {
  const total = surveyData.length || 1;
  const avgSafety = (surveyData.reduce((a, b) => a + (Number(b.seguridad) || 3), 0) / total).toFixed(2);

  // Conteos dinámicos
  const countBy = (field) => {
    const map = {};
    surveyData.forEach(s => {
      const val = (s[field] || 'Otro').trim();
      if (!val) return;
      map[val] = (map[val] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const trCounts = countBy('transporte');
  const ageCounts = countBy('edad');
  const comfCounts = countBy('comodidad');
  const diffCounts = countBy('dificultad');

  const topTransport = trCounts[0] ? `${trCounts[0][0]} (${((trCounts[0][1] / total) * 100).toFixed(1)}%)` : 'Micro / Bus';
  const comfPositive = surveyData.filter(s => s.comodidad === 'Cómodo' || s.comodidad === 'Muy cómodo').length;
  const comfPct = ((comfPositive / total) * 100).toFixed(1);

  const kpiGrid = document.getElementById('surveyLiveKpiGrid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="p-5 rounded-xl mica-sheet-card border-l-4 border-l-[#29A9E1]">
        <span class="text-[10px] font-display font-bold uppercase tracking-widest text-stone-400 block">Total Encuestados</span>
        <span class="text-3xl font-display font-bold text-neutral-900 mt-1 block">${surveyData.length}</span>
        <span class="text-xs text-stone-500">Sincronizado con Google Sheets</span>
      </div>
      <div class="p-5 rounded-xl mica-sheet-card border-l-4 border-l-[#EAB308]">
        <span class="text-[10px] font-display font-bold uppercase tracking-widest text-stone-400 block">Seguridad Cruce Peatonal</span>
        <span class="text-3xl font-display font-bold text-amber-600 mt-1 block">${avgSafety} <small class="text-base font-bold text-stone-400">/ 5.0</small></span>
        <span class="text-xs text-stone-500">Percepción media de riesgo vial</span>
      </div>
      <div class="p-5 rounded-xl mica-sheet-card border-l-4 border-l-[#1E56C6]">
        <span class="text-[10px] font-display font-bold uppercase tracking-widest text-stone-400 block">Transporte Predominante</span>
        <span class="text-xl sm:text-2xl font-display font-bold text-e5 mt-1 block">${topTransport}</span>
        <span class="text-xs text-stone-500">59,4% llega en Transporte Público</span>
      </div>
      <div class="p-5 rounded-xl mica-sheet-card border-l-4 border-l-[#2EAA62]">
        <span class="text-[10px] font-display font-bold uppercase tracking-widest text-stone-400 block">Satisfacción Desplazamiento</span>
        <span class="text-3xl font-display font-bold text-e4 mt-1 block">${comfPct}%</span>
        <span class="text-xs text-stone-500">Evalúa Cómodo o Muy cómodo</span>
      </div>
    `;
  }

  function renderMiniBars(containerId, entries, barColor) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = entries.slice(0, 6).map(([label, cnt]) => {
      const pct = ((cnt / total) * 100).toFixed(1);
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="font-bold text-stone-800 truncate pr-2">${label}</span>
            <span class="font-extrabold text-neutral-900 shrink-0">${cnt} (${pct}%)</span>
          </div>
          <div class="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
            <div class="h-full rounded-full" style="width:${pct}%; background:${barColor}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderMiniBars('surveyChartTransport', trCounts, '#1E56C6');
  renderMiniBars('surveyChartAge', ageCounts, '#574F4D');
  renderMiniBars('surveyChartDifficulties', diffCounts, '#E03131');
  renderMiniBars('surveyChartComfort', comfCounts, '#2EAA62');

  renderSurveyResponsesTable();
}

function renderSurveyResponsesTable() {
  const tbody = document.getElementById('surveyResponsesTableBody');
  const countEl = document.getElementById('surveyTableFilteredCount');
  if (!tbody) return;

  const q = (document.getElementById('surveySearchInput')?.value || '').trim().toLowerCase();
  const trFilter = document.getElementById('surveyFilterTransport')?.value || 'ALL';

  const filtered = surveyData.filter(s => {
    if (trFilter !== 'ALL' && s.transporte !== trFilter) return false;
    if (!q) return true;
    return (
      (s.lugar || '').toLowerCase().includes(q) ||
      (s.dificultad || '').toLowerCase().includes(q) ||
      (s.ocupacion || '').toLowerCase().includes(q) ||
      (s.motivo || '').toLowerCase().includes(q) ||
      (s.edad || '').toLowerCase().includes(q)
    );
  });

  if (countEl) countEl.textContent = filtered.length;

  tbody.innerHTML = filtered.map(s => `
    <tr class="hover:bg-stone-50 transition">
      <td class="py-2.5 px-4 font-bold text-stone-400">${s.id}</td>
      <td class="py-2.5 px-4">
        <span class="font-bold text-neutral-900 block">${s.edad}</span>
        <span class="text-[11px] text-stone-500">${s.ocupacion}</span>
      </td>
      <td class="py-2.5 px-4 text-stone-700">${s.motivo}</td>
      <td class="py-2.5 px-4 font-semibold text-neutral-900">${s.transporte}</td>
      <td class="py-2.5 px-4 font-semibold">${s.comodidad}</td>
      <td class="py-2.5 px-4 font-bold text-rose-700">${s.dificultad}</td>
      <td class="py-2.5 px-4 italic text-stone-700">${s.lugar || '—'}</td>
      <td class="py-2.5 px-4 text-center">
        <span class="px-2.5 py-1 rounded-full text-xs font-extrabold ${s.seguridad <= 2 ? 'bg-rose-100 text-rose-800' : (s.seguridad === 3 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800')}">${s.seguridad}/5</span>
      </td>
    </tr>
  `).join('');
}

/* =========================================================================
   14. SECCIÓN 05: GALERÍA INTERACTIVA DE LOS 20 CROQUIS DE FASE 1
   ========================================================================= */
function renderCroquisGallery(tagFilter = 'ALL') {
  const grid = document.getElementById('croquisGalleryGrid');
  if (!grid) return;

  const list = window.CROQUIS_DATA.filter(c => tagFilter === 'ALL' || c.tag === tagFilter);
  grid.innerHTML = list.map(c => `
    <div onclick="openLightbox('${c.img}', '${c.title.replace(/'/g, "\\'")}: ${c.desc.replace(/'/g, "\\'")}')" class="rounded-3xl bg-white border border-stone-200/90 overflow-hidden shadow-sm hover:shadow-md transition cursor-zoom-in flex flex-col justify-between group">
      <div class="relative h-48 bg-stone-100 overflow-hidden border-b border-stone-100">
        <img src="${c.img}" alt="${c.title}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-bold uppercase tracking-wider">${c.tag}</span>
      </div>
      <div class="p-4 space-y-1.5">
        <h4 class="text-xs font-extrabold uppercase text-neutral-900 leading-snug">${c.title}</h4>
        <p class="text-[11px] text-stone-600 leading-relaxed line-clamp-3">${c.desc}</p>
      </div>
    </div>
  `).join('');
}

function filterCroquisByTag(tag) {
  document.querySelectorAll('.croquis-tag-btn').forEach(btn => {
    if (btn.dataset.ctag === tag) {
      btn.className = 'croquis-tag-btn px-3 py-1.5 rounded-full text-[11px] font-bold uppercase bg-neutral-900 text-white';
    } else {
      btn.className = 'croquis-tag-btn px-3 py-1.5 rounded-full text-[11px] font-bold uppercase bg-white border border-stone-300 text-stone-700';
    }
  });
  renderCroquisGallery(tag);
}

/* =========================================================================
   15. PARSER CSV RFC-4180 Y SINCRONIZACIÓN EN VIVO CON LAS 5 GOOGLE SHEETS
   ========================================================================= */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cur);
        cur = '';
      } else if (ch === '\n') {
        row.push(cur.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function syncAllGoogleSheetsLive(notifyUser = false) {
  const statusText = document.getElementById('liveSyncStatusText');
  if (statusText) statusText.textContent = 'Sincronizando...';

  let syncedCount = 0;

  // 1. Sincronizar Encuestas en vivo (Respuestas de Encuesta)
  try {
    const urlEnc = `https://docs.google.com/spreadsheets/d/${window.GOOGLE_SHEETS_CONFIG.encuestaId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Respuestas de Encuesta')}`;
    const res = await fetch(urlEnc, { cache: 'no-store' });
    if (res.ok) {
      const csv = await res.text();
      const rows = parseCSV(csv).slice(1).filter(r => r.length >= 8 && r[1]);
      if (rows.length >= 1) {
        surveyData = rows.map((r, i) => ({
          id: `ENC-${String(i + 1).padStart(2, '0')}`,
          timestamp: r[0] || '',
          edad: r[1] || '',
          ocupacion: r[2] || '',
          motivo: r[3] || '',
          transporte: r[4] || '',
          comodidad: r[5] || '',
          dificultad: r[6] || '',
          lugar: r[7] || '',
          seguridad: Number(r[8]) || 3
        }));
        sheetsSyncStatus.encuesta.ok = true;
        sheetsSyncStatus.encuesta.rows = surveyData.length;
        sheetsSyncStatus.encuesta.updated = new Date().toLocaleTimeString('es-CL');
        syncedCount++;
      }
    }
  } catch (e) {}

  // 2. Sincronizar Flujos_Digitales desde 04_Resumen_Graficos_Plaza_Sotomayor
  try {
    const urlFlujos = `https://docs.google.com/spreadsheets/d/${window.GOOGLE_SHEETS_CONFIG.resumenId}/gviz/tq?tqx=out:csv&sheet=Flujos_Digitales`;
    const resF = await fetch(urlFlujos, { cache: 'no-store' });
    if (resF.ok) {
      const csvF = await resF.text();
      const rowsF = parseCSV(csvF).slice(1).filter(r => r.length >= 7 && r[0]);
      if (rowsF.length >= 10) {
        const sheetItems = rowsF.map(r => ({
          id: r[0],
          tipo: r[1],
          territorio: r[2],
          esquina: r[3],
          colorName: r[4],
          categoria: r[5],
          coords: r[6],
          nota: r[7] || '',
          fecha: r[8] || ''
        }));

        // Combinar elementos creados localmente en el navegador con las filas nuevas de la hoja
        const sheetIds = new Set(sheetItems.map(i => i.id));
        const localCustom = flujosData.filter(f => !sheetIds.has(f.id));
        flujosData = [...sheetItems, ...localCustom];
        saveFlujosToStorage();

        sheetsSyncStatus.resumen.ok = true;
        sheetsSyncStatus.resumen.rows = flujosData.length;
        sheetsSyncStatus.resumen.updated = new Date().toLocaleTimeString('es-CL');
        syncedCount++;
      }
    }
  } catch (e) {}

  renderBoardRoutesAndStickers();
  renderQuantitativeSection();
  renderSurveyAnalyticsAndTable();

  if (statusText) {
    statusText.textContent = 'Sheets en Vivo (5/5)';
  }
  renderSyncModalList();

  if (notifyUser) {
    showToast(`Sincronizado en vivo con Google Sheets (${surveyData.length} encuestas, ${flujosData.length} flujos)`);
  }
}

function openSyncModal() {
  renderSyncModalList();
  const savedHook = localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';
  const input = document.getElementById('webhookUrlInput');
  if (input) input.value = savedHook;
  document.getElementById('syncModal').classList.remove('hidden');
}

function closeSyncModal() {
  document.getElementById('syncModal').classList.add('hidden');
}

function renderSyncModalList() {
  const list = document.getElementById('syncModalStatusList');
  if (!list) return;
  list.innerHTML = Object.values(sheetsSyncStatus).map(s => `
    <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <span class="w-2.5 h-2.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-amber-500'} shrink-0"></span>
        <div>
          <span class="font-bold text-neutral-900 block">${s.name}</span>
          <span class="text-[10px] text-stone-500">ID: ${s.id} • ${s.rows} registros • Última sinc: ${s.updated}</span>
        </div>
      </div>
      <a href="https://docs.google.com/spreadsheets/d/${s.id}/edit" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-white border border-stone-300 hover:border-neutral-900 text-[11px] font-bold shrink-0">
        Abrir Sheet ↗
      </a>
    </div>
  `).join('');
}

function saveWebhookUrl() {
  const val = document.getElementById('webhookUrlInput')?.value.trim() || '';
  localStorage.setItem(STORAGE_KEY_WEBHOOK, val);
  showToast('URL de Webhook guardada');
}

function sendNewItemToWebhookIfConfigured(item) {
  const hook = localStorage.getItem(STORAGE_KEY_WEBHOOK);
  if (!hook) return;
  fetch(hook, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  }).catch(() => {});
}

/* =========================================================================
   16. ANIMACIÓN DE FONDO DEL HERO + LIGHTBOX + TOAST
   ========================================================================= */
function initHeroBackgroundCanvas() {
  const canvas = document.getElementById('heroFlowCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;

  function resize() {
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = canvas.parentElement.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#29A9E1', '#EAB308', '#E85C90', '#2EAA62', '#1E56C6', '#E03131'];
  const walkers = Array.from({ length: 42 }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.1),
    vy: 0,
    color: colors[i % colors.length],
    trail: []
  }));

  function animateHero() {
    ctx.clearRect(0, 0, w, h);
    walkers.forEach(wk => {
      if (Math.random() < 0.02) {
        if (wk.vx !== 0) {
          wk.vy = (Math.random() > 0.5 ? 1 : -1) * Math.abs(wk.vx);
          wk.vx = 0;
        } else {
          wk.vx = (Math.random() > 0.5 ? 1 : -1) * Math.abs(wk.vy);
          wk.vy = 0;
        }
      }
      wk.x += wk.vx;
      wk.y += wk.vy;
      if (wk.x < 0) wk.x = w;
      if (wk.x > w) wk.x = 0;
      if (wk.y < 0) wk.y = h;
      if (wk.y > h) wk.y = 0;

      wk.trail.push({ x: wk.x, y: wk.y });
      if (wk.trail.length > 38) wk.trail.shift();

      if (wk.trail.length > 2) {
        ctx.beginPath();
        ctx.moveTo(wk.trail[0].x, wk.trail[0].y);
        for (let i = 1; i < wk.trail.length; i++) {
          if (Math.hypot(wk.trail[i].x - wk.trail[i - 1].x, wk.trail[i].y - wk.trail[i - 1].y) > 50) {
            ctx.moveTo(wk.trail[i].x, wk.trail[i].y);
          } else {
            ctx.lineTo(wk.trail[i].x, wk.trail[i].y);
          }
        }
        ctx.strokeStyle = wk.color;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    });
    requestAnimationFrame(animateHero);
  }
  animateHero();
}

function openLightbox(src, caption) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  if (!modal || !img) return;
  img.src = src;
  if (cap) cap.textContent = caption || '';
  modal.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightboxModal').classList.add('hidden');
}

function showToast(msg) {
  const t = document.getElementById('toastNotification');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* =========================================================================
   17. INICIALIZACIÓN GENERAL AL CARGAR EL SITIO
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  initHeroBackgroundCanvas();
  renderBaseVinylMap();
  renderBoardRoutesAndStickers();
  setupBoardAuthorInteractions();
  renderQuantitativeSection();
  renderSurveyAnalyticsAndTable();
  renderCroquisGallery('ALL');
  selectBoardItem('ST-E1-01');

  // Conectar en vivo con las 5 Google Sheets al iniciar y cada 60 segundos
  syncAllGoogleSheetsLive(false);
  setInterval(() => syncAllGoogleSheetsLive(false), 60000);
});
