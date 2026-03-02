import axios from 'axios';

// Headers falsos para evadir bloqueos básicos por parte de la plataforma
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-ES,es;q=0.9',
    'Referer': 'https://1xbet.com/',
    'Connection': 'keep-alive'
};

/**
 * Función para obtener partidos en vivo (En Vivo).
 * Actualizada para usar axios pero devolviendo mocks por ahora.
 */
export const fetchLiveMatches = async () => {
    try {
        // En un escenario real harías esto:
        // const response = await axios.get('https://api-1xbet.com/live', { headers: HEADERS, timeout: 5000 });
        // return parseLiveMatches(response.data);

        // Retornamos un array mockeado
        return [
            {
                id: `live_${Math.floor(Math.random() * 1000)}`,
                league: 'UEFA Champions League',
                team1: 'Real Madrid',
                team2: 'Manchester City',
                startTime: new Date().toLocaleTimeString(),
                url: 'https://1xbet.com/es/live/football'
            }
        ];
    } catch (error) {
        console.error(`[Scraper - LIVE] Error extrayendo datos: ${error.message}`);
        // Retornamos array vacío para no detener la ejecución si el HTTP status falla
        return [];
    }
};

/**
 * Función para obtener partidos futuros (Pre-Partido).
 * Actualizada para usar axios pero devolviendo mocks por ahora.
 */
export const fetchPreMatches = async () => {
    try {
        // En un escenario real harías esto:
        // const response = await axios.get('https://api-1xbet.com/line', { headers: HEADERS, timeout: 5000 });
        // return parsePreMatches(response.data);

        // Retornamos un array mockeado
        return [
            {
                id: `pre_${Math.floor(Math.random() * 1000)}`,
                league: 'Premier League',
                team1: 'Arsenal',
                team2: 'Liverpool',
                startTime: new Date(Date.now() + 86400000).toLocaleString(), // Mañana
                url: 'https://1xbet.com/es/line/football'
            }
        ];
    } catch (error) {
        console.error(`[Scraper - PRE] Error extrayendo datos: ${error.message}`);
        // Retornamos array vacío si algo falla
        return [];
    }
};
