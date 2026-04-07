const fs = require('fs');
const path = require('path');
const https = require('https');

const CHANNELS = ['abualiexpress', 'amitsegal', 'kann_news', 'ynetalerts', 'N12_news'];
const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const FEED_FILE = path.join(DATA_DIR, 'osint-feed.json');

const KEYWORDS = {
    'תקיפה': 'Strike',
    'אזעקות': 'Sirens',
    'טילים': 'Missiles',
    'חיסול': 'Assassination',
    'כטב"מ': 'UAV',
    'לבנון': 'Lebanon',
    'איראן': 'Iran',
    'משא ומתן': 'Negotiations',
    'צבא': 'Army/IDF',
    'נפילות': 'Impacts',
    'חירום': 'Emergency',
    'הרוגים': 'Fatalities',
    'פצועים': 'Injured'
};

function fetchChannelHtml(channelId) {
    return new Promise((resolve, reject) => {
        https.get(`https://t.me/s/${channelId}`, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

async function fetchChannelMessages(channelId) {
    try {
        const html = await fetchChannelHtml(channelId);
        const matches = html.match(/<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs) || [];
        const texts = matches.map(m => m.replace(/<br\s*[\/]?>/gi, " ").replace(/<\/?[^>]+(>|$)/g, ""));
        return texts.map(text => ({ channel: channelId, text: text }));
    } catch (error) {
        console.error(`Failed to fetch ${channelId}:`, error);
        return [];
    }
}

async function generateAlertFeed() {
    let allMessages = [];
    for (const channel of CHANNELS) {
        const messages = await fetchChannelMessages(channel);
        allMessages = allMessages.concat(messages);
    }
    
    const keywordCounts = {};
    Object.keys(KEYWORDS).forEach(k => keywordCounts[k] = 0);
    
    let caughtMessages = []; // For semantic analysis logging

    allMessages.forEach(msgObj => {
        let keywordHits = 0;
        let matchedWords = [];

        Object.keys(KEYWORDS).forEach(keyword => {
            if (msgObj.text.includes(keyword)) {
                keywordCounts[keyword]++;
                keywordHits++;
                matchedWords.push(keyword);
            }
        });

        // Semantic Engine: Flag message if it contains highly sensitive words or multiple tension keywords
        if (keywordHits >= 2 || (msgObj.text.includes('חיסול') && msgObj.text.includes('בכיר')) || msgObj.text.includes('חירום')) {
            caughtMessages.push({
                channel: msgObj.channel,
                text: msgObj.text,
                matched_keywords: matchedWords,
                severity: keywordHits >= 3 ? 'CRITICAL' : 'HIGH'
            });
        }
    });

    const currentVolume = allMessages.length; 
    
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        } catch (e) {}
    }

    const timestamp = new Date().toISOString();
    history.push({ time: timestamp, volume: currentVolume });
    if (history.length > 72) history.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    const avgVolume = history.length > 0 ? history.reduce((sum, entry) => sum + entry.volume, 0) / history.length : currentVolume;
    
    let tensionLevel = "LOW";
    let tensionDesc = "Routine News Volume";
    const ratio = avgVolume > 0 ? currentVolume / avgVolume : 1;
    
    if (ratio > 1.2 && ratio <= 1.5) {
        tensionLevel = "ELEVATED";
        tensionDesc = "Higher than average news volume";
    } else if (ratio > 1.5 && ratio <= 2.0) {
        tensionLevel = "HIGH";
        tensionDesc = "Significant reporting spike";
    } else if (ratio > 2.0) {
        tensionLevel = "PEAK";
        tensionDesc = "Extreme breaking news event detected";
    }

    // Keep only the most recent/interesting caught messages (max 20)
    caughtMessages = caughtMessages.slice(-20).reverse();

    const payload = {
        last_updated: timestamp,
        tension: {
            level: tensionLevel,
            description: tensionDesc,
            current_volume: currentVolume,
            avg_volume: avgVolume.toFixed(1),
            ratio: ratio.toFixed(2)
        },
        keywords: keywordCounts,
        top_topics: Object.keys(keywordCounts).sort((a,b) => keywordCounts[b] - keywordCounts[a]).slice(0, 5),
        semantic_logs: caughtMessages,
        history_window: history
    };

    fs.writeFileSync(FEED_FILE, JSON.stringify(payload, null, 2));
    console.log(`Successfully generated OSINT feed V2. Tension: ${tensionLevel}`);
}

generateAlertFeed();
