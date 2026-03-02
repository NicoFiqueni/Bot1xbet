import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.CHAT_ID;

// Deshabilita el polling porque este bot solo enviará mensajes proactivamente
const bot = new TelegramBot(token, { polling: false });

/**
 * Envía una notificación formateada a Telegram
 * @param {Object} match - Los datos del partido
 * @param {String} type - "LIVE" o "PRE-PARTIDO"
 */
export const sendNotification = async (match, type) => {
    try {
        const statusIcon = type === 'LIVE' ? '🔴 En Directo' : '⏳ Pre-Partido';
        
        const message = `
🏆 <b>Liga:</b> ${match.league}
⚽ <b>Partido:</b> ${match.team1} vs ${match.team2}
📊 <b>Modalidad:</b> ${statusIcon}
        `;

        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML', 
            disable_web_page_preview: true 
        });
        
        console.log(`[Telegram] Notificación enviada: ${match.team1} vs ${match.team2} (${type})`);
    } catch (error) {
        console.error(`[Telegram] Error al enviar notificación: ${error.message}`);
    }
};
