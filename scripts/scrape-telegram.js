import fs from 'fs';
import path from 'path';
import https from 'https';
import { pipeline, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable local model loading, force remote huggingface download for GH Actions
env.allowLocalModels = false;
env.useBrowserCache = false;

// We pull exclusively from official state organs / affiliates
const CHANNELS = {
    'idfonline': 'IDF',
    'almanarnews': 'Hezbollah_Affiliate',
    'FarsNewsAgency': 'IRGC_Affiliate'
};

const DATA_DIR = path.join(__dirname, '../data');
const HISTORICAL_STATS_FILE = path.join(DATA_DIR, 'v3-channel-stats.json');
const FEED_FILE = path.join(DATA_DIR, 'osint-feed.json'); // We overwrite to maintain frontend routing

// 5 Calm and 5 Danger anchors across exact language sets (Hebrew, Arabic, Persian)
const CALM_ANCHORS = [
    "הפסקת אש הושגה, שני הצדדים מסכימים למשא ומתן להסכם. חזרה חלקית לשגרה", // HE
    "רוגע ביטחוני, תיווך בינלאומי להפסקת הלחימה והעברת סיוע הומניטרי לתושבים", // HE
    "وقف إطلاق النار وبدء المفاوضات للسلام والهدوء", // AR
    "هدنة إنسانية وعودة النازحين وتوقف العمليات العسكرية تماما", // AR
    "آتش‌بس و مذاکرات برای صلح و توافق با رفع تحریم‌ها" // FA
];

const DANGER_ANCHORS = [
    "תקיפה נרחבת מאוד, שיגור עשרות טילים ובליסטיים. מלחמה כוללת", // HE
    "זמן לחירום. חיסול של בכיר, איום מלחמתי ותגובה קשה ללא תנאים", // HE
    "إطلاق صواريخ وتدمير العدو. الحرب مستمرة والانتقام العظيم حتمي", // AR
    "هجوم عنيف وسقوط قتلى وتصعيد عسكري كبير جدا", // AR
    "حمله موشکی سنگین پهپاد و انتقام سخت نظامی و جنگ" // FA
];

// --- NATIVE LIGHTWEIGHT K-NEAREST NEIGHBOR (TF-IDF Cosine Distance) ---
function tokenize(text) {
    return text.toString().toLowerCase().replace(/[.,!؟"']/g, "").split(/\s+/).filter(w => w.length > 2);
}

function calculateTf(tokens) {
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    const maxFreq = Math.max(...Object.values(tf));
    for (let t in tf) tf[t] = tf[t] / maxFreq;
    return tf;
}

const anchorTokens = [...CALM_ANCHORS, ...DANGER_ANCHORS].map(tokenize);
function computeIdf(globalDocsTokens) {
    const idf = {};
    const N = globalDocsTokens.length;
    globalDocsTokens.forEach(tokens => {
        const unique = new Set(tokens);
        unique.forEach(t => idf[t] = (idf[t] || 0) + 1);
    });
    for (let t in idf) idf[t] = Math.log(N / idf[t]);
    return idf;
}
const globalIdf = computeIdf(anchorTokens);

function extractVector(text) {
    const tf = calculateTf(tokenize(text));
    const vec = {};
    for (let t in tf) {
        if (globalIdf[t]) vec[t] = tf[t] * globalIdf[t];
    }
    return vec;
}

function cosineSimilarity(v1, v2) {
    const intersection = Object.keys(v1).filter(k => v2[k]);
    let dot = 0.0;
    intersection.forEach(k => dot += v1[k] * v2[k]);
    let mag1 = 0.0; Object.values(v1).forEach(v => mag1 += v*v);
    let mag2 = 0.0; Object.values(v2).forEach(v => mag2 += v*v);
    if (mag1 === 0 || mag2 === 0) return 0;
    return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// Gives a 0-1 score (1 = Danger) based on distance to danger vs calm anchors
function getSemanticDangerScore(text) {
    const vec = extractVector(text);
    if (Object.keys(vec).length === 0) return 0.5; // Neutral noise baseline
    
    let maxDangerSim = 0;
    let maxCalmSim = 0;
    
    CALM_ANCHORS.forEach(anchor => {
        maxCalmSim = Math.max(maxCalmSim, cosineSimilarity(vec, extractVector(anchor)));
    });
    DANGER_ANCHORS.forEach(anchor => {
        maxDangerSim = Math.max(maxDangerSim, cosineSimilarity(vec, extractVector(anchor)));
    });

    if (maxDangerSim === 0 && maxCalmSim === 0) return 0.5;
    return maxDangerSim / (maxDangerSim + maxCalmSim);
}

// --- SCRAPING ROUTINE ---
function fetchChannelHtml(channelId) {
    return new Promise((resolve, reject) => {
        https.get(`https://t.me/s/${channelId}`, { timeout: 8000 }, (res) => {
            // FarsNewsAgency sometimes redirects dynamically
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, { timeout: 8000 }, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => resolve(data));
                });
            } else {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        }).on('error', err => reject(err));
    });
}

async function scrapeAll() {
    let allMessages = [];
    for (const [id, label] of Object.entries(CHANNELS)) {
        try {
            const html = await fetchChannelHtml(id);
            const matches = html.match(/<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs) || [];
            // Take the 15 most recent messages
            let texts = matches.map(m => m.replace(/<br\s*[\/]?>/gi, " ").replace(/<\/?[^>]+(>|$)/g, ""));
            texts = texts.slice(-15);
            
            texts.forEach(text => allMessages.push({ channelId: id, channelName: label, text: text }));
        } catch (err) {
            console.error(`Failed to scrape ${id}:`, err.message);
        }
    }
    return allMessages;
}

async function run() {
    console.log("Loading Multilingual Xenova Sentiment Model...");
    // Xenova maps stars 1-5 natively in JS
    const classifier = await pipeline('sentiment-analysis', 'Xenova/bert-base-multilingual-uncased-sentiment');
    
    let messages = await scrapeAll();
    console.log(`Scraped ${messages.length} official messages. Analyzing...`);

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    
    let channelStats = {};
    if (fs.existsSync(HISTORICAL_STATS_FILE)) {
        try { channelStats = JSON.parse(fs.readFileSync(HISTORICAL_STATS_FILE, 'utf-8')); } catch (e) {}
    }
    
    // Initialize stats
    Object.keys(CHANNELS).forEach(key => {
        if (!channelStats[key]) channelStats[key] = { avgSentiment: 0, count: 0 };
    });

    let analyzedMessages = [];

    for (let msg of messages) {
        // Run neural model
        let result = await classifier(msg.text.substring(0, 500)); // Limit to avoid hitting token length limits
        let label = result[0].label; // e.g., '1 star'
        let numStars = parseInt(label.split(' ')[0]);
        
        // Map 1-5 stars to -1.0 to 1.0 Sentiment
        let absoluteSentiment = ((numStars - 3) / 2); // 1 = -1, 3 = 0, 5 = 1
        
        // Semantic Danger calculation (KNN approximation)
        let dangerScore = getSemanticDangerScore(msg.text);
        
        analyzedMessages.push({
            channel: msg.channelName,
            text: msg.text,
            absolute_sentiment: absoluteSentiment,
            semantic_danger_knn: dangerScore
        });
    }

    // Now, calculate the current channel averages and normalize individual stats over the history
    let channelAggregates = {};
    
    for (const [id, label] of Object.entries(CHANNELS)) {
        let msgs = analyzedMessages.filter(m => m.channel === label);
        if (msgs.length === 0) continue;

        let curAvgSent = msgs.reduce((sum, m) => sum + m.absolute_sentiment, 0) / msgs.length;
        let curDanger = msgs.reduce((sum, m) => sum + m.semantic_danger_knn, 0) / msgs.length;
        
        // Normalize using historical running baseline
        let histAvg = channelStats[id].avgSentiment;
        let normalizedSentiment = curAvgSent - histAvg;
        
        // Update historical baseline
        let histCount = channelStats[id].count;
        let newCount = histCount + msgs.length;
        channelStats[id].avgSentiment = ((histAvg * histCount) + (curAvgSent * msgs.length)) / newCount;
        channelStats[id].count = newCount;
        
        channelAggregates[label] = {
            num_messages: msgs.length,
            normalized_sentiment: normalizedSentiment,
            raw_sentiment: curAvgSent,
            knn_danger_metric: curDanger
        };
    }
    
    fs.writeFileSync(HISTORICAL_STATS_FILE, JSON.stringify(channelStats, null, 2));

    // Determine extreme "caught" messages for explainability dashboard based on High KNN Danger
    let semanticLogs = analyzedMessages
        .filter(m => m.semantic_danger_knn > 0.6 || Math.abs(m.absolute_sentiment) > 0.8)
        .sort((a,b) => b.semantic_danger_knn - a.semantic_danger_knn)
        .slice(0, 10); // Keep top 10 most extreme

    const timestamp = new Date().toISOString();
    
    // Overall network calculations
    const combinedDanger = Object.values(channelAggregates).reduce((sum, c) => sum + c.knn_danger_metric, 0) / Object.keys(channelAggregates).length;
    const combinedNormSent = Object.values(channelAggregates).reduce((sum, c) => sum + c.normalized_sentiment, 0) / Object.keys(channelAggregates).length;

    let tensionLevel = combinedDanger > 0.7 ? "PEAK_DANGER" : (combinedDanger > 0.5 ? "ESCALATING" : "CALM_CEASEFIRE");
    
    const payload = {
        last_updated: timestamp,
        tension: {
            level: tensionLevel,
            global_knn_danger: combinedDanger.toFixed(2),
            global_norm_sentiment: combinedNormSent.toFixed(2),
        },
        channel_data: channelAggregates,
        semantic_logs: semanticLogs
    };

    fs.writeFileSync(FEED_FILE, JSON.stringify(payload, null, 2));
    console.log("V3 Analysis complete! Overall Danger Score:", combinedDanger.toFixed(2));
}

run().catch(console.error);
