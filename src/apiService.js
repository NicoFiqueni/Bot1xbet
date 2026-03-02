import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();

// Añadir plugin Stealth para evitar que Cloudflare detecte que somos un bot
puppeteer.use(StealthPlugin());

// Mantener una instancia global del navegador para no abrirlo y cerrarlo en cada ciclo
let browser = null;

const initBrowser = async () => {
    if (!browser) {
        console.log('[Puppeteer] 🌐 Iniciando navegador invisible (Stealth Mode)...');
        browser = await puppeteer.launch({
            headless: "new", // "new" es el modo silencioso moderno
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        });
    }
    return browser;
};

/**
 * Función genérica para obtener datos de la API de 1xBet usando Puppeteer
 * @param {string} url - URL del endpoint a consultar
 * @param {string} type - Tipo de evento (LIVE o PREMATCH) para logging
 * @returns {Promise<Array>} - Array de partidos procesados
 */
export const fetchMatchesFromAPI = async (apiUrl, type) => {
    let page = null;
    try {
        if (!apiUrl) {
            console.error(`[API - ${type}] Error: URL no configurada.`);
            return [];
        }

        const b = await initBrowser();
        page = await b.newPage();

        // Evitar cargar recursos innecesarios (imágenes, css) para ganar velocidad extrema
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[Puppeteer - ${type}] Abriendo portal de incógnito en ar-xbet.com...`);
        
        // 1. Navegamos a la página de inicio PRINCIPAL. 
        // Esto le dice al servidor "Soy un humano", nos autoriza la Cookie y pasamos CF.
        await page.goto('https://ar-xbet.com/es/line/football', { waitUntil: 'domcontentloaded', timeout: 35000 });

        // 2. Esperamos un poco para la inicialización básica (solo 2 segundos)
        await new Promise(r => setTimeout(r, 4000));

        // Filtro de ligas desde .env
        const allowedLeaguesRaw = process.env.ALLOWED_LEAGUES || "";
        const normalizeText = (text) => {
            return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        };
        const allowedLeagues = allowedLeaguesRaw.split(',').map(normalizeText).filter(Boolean);

        // console.log(`[Puppeteer - ${type}] Inyectando solicitud directa a la Base de Datos...`);

        // Usando inyección asíncrona dentro del DOM de Chromium
        const jsonResponse = await page.evaluate(async (endpoint, reqType, allowed) => {
            
            // Función auxiliar dentro del DOM de Chromium
            const normalizeTextP = (text) => {
                return text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
            };

            try {
                if (reqType === 'PRE-MATCH') {
                    // --- ALGORITMO ESPECIAL BYPASS PRE-MATCH (Limite 50 de Cloudfare) ---
                    // 1. Conseguimos el diccionario interno de todos los ID de Ligas
                    const rChamps = await fetch('https://ar-xbet.com/service-api/LineFeed/GetChampsZip?sport=1&lng=es&country=14', {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    const dChamps = await rChamps.json();
                    if (!dChamps || !dChamps.Value) return { Value: [] };
                    
                    // Filtrar ligas si hay restricción en .env ignorando tildes y mayúsculas
                    let validChamps = dChamps.Value;
                    if (allowed && allowed.length > 0) {
                        validChamps = validChamps.filter(c => {
                            const leagueName = normalizeTextP(c.L);
                            return allowed.some(al => leagueName.includes(al));
                        });
                    }
                    
                    const leagueIds = validChamps.map(x => x.LI);
                    let allMatches = [];
                    
                    // 2. Iteramos silenciosamente liga por liga sin explotar combinaciones
                    // Subimos el límite a todas las ligas grandes disponibles (o las filtradas)
                    let limit = leagueIds.length > 200 ? 200 : leagueIds.length;
                    
                    for(let i = 0; i < limit; i++) {
                         try {
                             const urlP = 'https://ar-xbet.com/service-api/LineFeed/Get1x2_VZip?sports=1&champs=' + leagueIds[i] + '&count=50&lng=es&mode=4';
                             const rP = await fetch(urlP, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/plain, */*' } });
                             if (rP.ok) {
                                 const tP = await rP.json();
                                 if (tP.Value) {
                                     allMatches = allMatches.concat(tP.Value);
                                 }
                             }
                         } catch(e) { } // ignorar error por liga
                    }
                    
                    return { Value: allMatches };
                } else {
                    // --- FLUJO NORMAL PARA EN VIVO ---
                    const res = await fetch(endpoint, {
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    if (!res.ok) {
                        return { error: 'Not OK', status: res.status, text: await res.text() };
                    }
                    const text = await res.text();
                    try {
                        const parsed = JSON.parse(text);
                        // Aplicar filtro si existe
                        if (parsed && parsed.Value && allowed && allowed.length > 0) {
                            parsed.Value = parsed.Value.filter(m => {
                                const leagueName = normalizeTextP(m.L);
                                return allowed.some(al => leagueName.includes(al));
                            });
                        }
                        return parsed;
                    } catch (e) {
                        return { error: 'Invalid JSON', text: text.substring(0, 500) };
                    }
                }
            } catch (e) {
                return { error: e.message };
            }
        }, apiUrl, type, allowedLeagues);

        const rawData = jsonResponse?.Value || jsonResponse || [];
        
        let matches = [];
        
        if (type === 'PRE MATCH MULTI-LIGA') {
            // Este tipo retorna Ligas, necesitamos extraer los IDs de sus campeonatos
            const champsList = [];
            for (const item of rawData) {
                if (item.LI) champsList.push(item.LI);
            }
            return champsList;
        } else {
            // Este es el flujo normal de extracción de partidos
            matches = processApiResponse(rawData);
        }

        // Si no es un lote parcial (para no spammear los logs internos), lo decimos:
        if (!type.includes('Lote')) {
            console.log(`[🔎 Scanner] ¡Éxito en ${type}! Se capturaron un total de ${matches.length || rawData.length} ítems usando inyección proxy.`);
        } else {
            console.log(` ---> ${type} completado - ${matches.length} partidos captados.`);
        }

        return matches || [];

    } catch (error) {
        console.error(`[API - ${type}] 🚨 Error crítico: ${error.message}`);
        return [];
    } finally {
        if (page) {
            await page.close().catch(e => console.error("Error cerrando pestaña", e.message));
        }
    }
};

/**
 * Bucle Maestro Multi-Hilos para romper el límite de 50 de la API PreMatch.
 * @param {string} champsUrl - Endpoint que devuelve la lista de TODAS las ligas
 * @param {string} baseUrl - Endpoint base de partidos
 */
export const fetchMasivePreMatches = async (champsUrl, baseUrl) => {
    try {
        console.log(`[🤖 Multi-Hilo] Iniciando escaneo masivo de campeonato Global...`);
        // 1. Obtenemos absolutamente todos los ID de las ligas del mundo que se jugarán
        const allLeagueIds = await fetchMatchesFromAPI(champsUrl, 'PRE MATCH MULTI-LIGA');
        
        if (!allLeagueIds || allLeagueIds.length === 0) {
            console.log(`[🤖] Falla temporal al obtener ligas, reintentando prox ciclo...`);
            return [];
        }

        console.log(`[🤖 Multi-Hilo] ¡Encontradas ${allLeagueIds.length} ligas diferentes! Construyendo inyecciones concurrentes...`);

        // 2. Dividimos los IDs en grupos (chunks) usando "Batching" para no explotar la memoria RAM.
        // Haremos lotes de 10 URLs por pestaña inyectada.
        const BATCH_SIZE = 10;
        let globalMatches = [];

        // Por rendimiento simulado inyectaremos peticiones masivas al aire y las coleccionamos
        // Para no matar la red, en JavaScript usamos fragmentación
        let requestCount = 0;
        for (let i = 0; i < allLeagueIds.length; i += BATCH_SIZE) {
            const chunk = allLeagueIds.slice(i, i + BATCH_SIZE);
            const chunkUrl = `${baseUrl}${chunk.join(',')}`;
            
            // Limitamos artificialmente para no reventar la PC ni ser baneado rápido - solo 10 lotes max por prueba inicial
            if (requestCount >= 10) break;
            requestCount++;

            // Reutiliza la función inyectora normal pero ahora pasándole docenas de torneos de un tirón
            const partialMatches = await fetchMatchesFromAPI(chunkUrl, `Lote Partido (${i} - ${i + BATCH_SIZE})`);
            globalMatches = globalMatches.concat(partialMatches);
        }

        console.log(`[🏆 PRE-MATCH DATA] El Bucle Masivo capturó exitosamente ${globalMatches.length} partidos!`);
        return globalMatches;

    } catch (e) {
        console.error(`[Pre-Match Masivo] Error en el bucle: ${e.message}`);
        return [];
    }
}
const processApiResponse = (data) => {
    const matches = [];
    
    if (!Array.isArray(data)) return matches;

    for (const item of data) {
        try {
            // Mapeo exacto basado en la estructura de 1xBet
            // I: ID, L: Liga, O1: Equipo 1, O2: Equipo 2
            const matchId = item.I;
            const league = item.L || 'Liga Desconocida';
            const team1 = item.O1 || 'Equipo Local Desconocido';
            const team2 = item.O2 || 'Equipo Visitante Desconocido';

            if (matchId) {
                matches.push({
                    id: matchId.toString(),
                    league: league,
                    team1: team1,
                    team2: team2
                });
            }
        } catch (err) {
            // Ignorar errores individuales para no corromper todo el listado
        }
    }

    return matches;
};
