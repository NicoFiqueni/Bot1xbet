import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import { fetchMatchesFromAPI, fetchMasivePreMatches } from './apiService.js';
import { sendNotification } from './telegram.js';

dotenv.config();

// Cache para almacenar ids procesados (ttl 12hrs)
const CACHE = new NodeCache({ stdTTL: 43200, checkperiod: 600 });

const API_LIVE = process.env.API_URL_LIVE;
const API_PREMATCH = process.env.API_URL_PREMATCH;

// Bandera global para evitar flood y bloqueo de Telegram (Error 429)
let isFirstRun = true;

/**
 * Función central del ciclo, encargada de solicitar a API, comparar con Node-Cache y notificar en Telegram
 */
const runMasterCycle = async () => {
    try {
        console.log(`\n[🚀 Ciclo Maestro] Ejecutando inicio del Check... (${new Date().toLocaleTimeString()})`);

        // Llamadas paralelas a la API
        const [liveMatches, preMatches] = await Promise.all([
            fetchMatchesFromAPI(API_LIVE, 'EN VIVO'),
            fetchMatchesFromAPI(API_PREMATCH, 'PRE-MATCH')
        ]);

        if (isFirstRun) {
            // ARRANQUE SILENCIOSO: Guardar todos en caché sin notificar
            const totalMatches = (liveMatches?.length || 0) + (preMatches?.length || 0);
            
            const allMatches = [...(liveMatches || []), ...(preMatches || [])];
            for (const match of allMatches) {
                if (match && match.id) CACHE.set(match.id, true);
            }

            console.log(`[🔇] Iniciando bot. Arranque silencioso completado: ${totalMatches} partidos guardados en memoria sin enviar spam.`);
            isFirstRun = false; // Desactivar bandera
        } else {
            // EJECUCIÓN NORMAL: Análisis y notificaciones
            await processMatches(liveMatches, 'LIVE');
            await processMatches(preMatches, 'PRE-MATCH');
        }

        console.log('[🚀 Ciclo Maestro] Análisis finalizado. Esperando 2 minutos...');
    } catch (globalError) {
        // Logueo silencioso para no crashear Node.js
        console.error(`[🚨 Fallo Global] Cronjob principal encontró un error: ${globalError.message}`);
    }
};

/**
 * Recorre el array procesado y dispara las notificaciones a Telegram
 * @param {Array} matches - Datos ya mapeados (con ID, liga, equipo A, equipo B)
 * @param {String} type - "LIVE" o "PRE-MATCH"
 */
const processMatches = async (matches, type) => {
    if (!matches || matches.length === 0) return;

    for (let match of matches) {
        // Chequeo contra Caché: si NO existe es un nuevo partido
        if (!CACHE.has(match.id)) {
            // Envío directo a Bot por nuevo partido detectado
            await sendNotification(match, type);
            // Inmediatamente lo guardo en memoria con ID de la API
            CACHE.set(match.id, true);
        }
    }
};

/**
 * Función Inicial: arranca y enciende las frecuencias
 */
const startMonitor = () => {
    console.log('🤖 Inicializando Monitor de Apuestas (API JSON Version)...');
    
    // Ejecución Inmediata en el inicio
    runMasterCycle();

    // CronJob principal cada 120,000 ms (2 minutos) estricto.
    setInterval(runMasterCycle, 120 * 1000);
};

// Start
startMonitor();
