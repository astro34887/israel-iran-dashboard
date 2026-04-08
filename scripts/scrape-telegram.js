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

const CHANNELS = {
    'idfonline': 'IDF',
    'israeldefenseforces': 'IDF',
    'abualiexpress': 'Israel_OSINT',
    'OSINTdefender': 'Global_OSINT',
    'FarsNewsAgency': 'IRGC',
    'Tasnimnews': 'IRGC',
    'irna_1313': 'IRGC',
    'sepah_pasdaran': 'IRGC',
    'almanarnews': 'Hezbollah',
    'C_Military1': 'Hezbollah',
    'almayadeen': 'Arab_Axis',
    'QudsN': 'Arab_Axis'
};

const DATA_DIR = path.join(__dirname, '../data');
const FEED_FILE = path.join(DATA_DIR, 'osint-feed.json');
const ANCHORS_FILE = path.join(DATA_DIR, 'channel_anchors.json');

// --- NATIVE LIGHTWEIGHT K-NEAREST NEIGHBOR (TF-IDF Cosine Distance) ---

let channelAnchorsMap = {};
if (fs.existsSync(ANCHORS_FILE)) {
    channelAnchorsMap = JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf-8'));
}

function tokenize(text) {
    return text.toString().toLowerCase().replace(/[.,!؟"']/g, "").split(/\s+/).filter(w => w.length > 2);
}

function calculateTf(tokens) {
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    const maxFreq = Math.max(...Object.values(tf), 1);
    for (let t in tf) tf[t] = tf[t] / maxFreq;
    return tf;
}

function computeIdf(globalDocsTokens) {
    const idf = {};
    const N = globalDocsTokens.length;
    if (N === 0) return idf;
    globalDocsTokens.forEach(tokens => {
        const unique = new Set(tokens);
        unique.forEach(t => idf[t] = (idf[t] || 0) + 1);
    });
    for (let t in idf) idf[t] = Math.log(N / idf[t]);
    return idf;
}

const nlpModels = {};

// Build isolated NLP models for each channel based on their active dynamic anchors
Object.keys(CHANNELS).forEach(cId => {
    let anchors = channelAnchorsMap[cId] || { calm: [], danger: [] };
    let calmTokens = anchors.calm.map(tokenize);
    let dangerTokens = anchors.danger.map(tokenize);
    let allTokens = [...calmTokens, ...dangerTokens];
    
    let idf = computeIdf(allTokens);
    
    nlpModels[cId] = {
        idf: idf,
        calm: anchors.calm,
        danger: anchors.danger
    };
});

function extractVector(text, idfMap) {
    const tf = calculateTf(tokenize(text));
    const vec = {};
    for (let t in tf) {
        if (idfMap[t]) vec[t] = tf[t] * idfMap[t];
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

// Gives a 0-1 score (1 = Danger) based on distance to channel specific danger vs calm anchors
function getSemanticDangerScore(text, channelId) {
    let model = nlpModels[channelId];
    if (!model || [...model.calm, ...model.danger].length === 0) return 0.5;
    
    const vec = extractVector(text, model.idf);
    if (Object.keys(vec).length === 0) return 0.5; // Neutral noise baseline
    
    let maxDangerSim = 0;
    let maxCalmSim = 0;
    
    model.calm.forEach(anchor => {
        maxCalmSim = Math.max(maxCalmSim, cosineSimilarity(vec, extractVector(anchor, model.idf)));
    });
    model.danger.forEach(anchor => {
        maxDangerSim = Math.max(maxDangerSim, cosineSimilarity(vec, extractVector(anchor, model.idf)));
    });

    if (maxDangerSim === 0 && maxCalmSim === 0) return 0.5;
    return maxDangerSim / (maxDangerSim + maxCalmSim);
}

// --- SCRAPING ROUTINE ---
function fetchChannelHtml(channelId) {
    return new Promise((resolve) => {
        https.get(`https://t.me/s/${channelId}`, { timeout: 8000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, { timeout: 8000 }, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => resolve(data));
                }).on('error', () => resolve(''));
            } else {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }
        }).on('error', () => resolve(''));
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
    const classifier = await pipeline('sentiment-analysis', 'Xenova/bert-base-multilingual-uncased-sentiment');
    
    let messages = await scrapeAll();
    console.log(`Scraped ${messages.length} official messages. Analyzing...`);

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    
    let analyzedMessages = [];

    for (let msg of messages) {
        let result = await classifier(msg.text.substring(0, 500)); 
        let numStars = parseInt(result[0].label.split(' ')[0]);
        let absoluteSentiment = ((numStars - 3) / 2); 
        
        let dangerScore = getSemanticDangerScore(msg.text, msg.channelId);
        
        analyzedMessages.push({
            channelId: msg.channelId,
            channel: msg.channelName,
            text: msg.text,
            absolute_sentiment: absoluteSentiment,
            semantic_danger_knn: dangerScore
        });
    }

    let channelAggregates = {};
    for (const [id, label] of Object.entries(CHANNELS)) {
        let msgs = analyzedMessages.filter(m => m.channelId === id);
        if (msgs.length === 0) continue;

        let curAvgSent = msgs.reduce((sum, m) => sum + m.absolute_sentiment, 0) / msgs.length;
        let curDanger = msgs.reduce((sum, m) => sum + m.semantic_danger_knn, 0) / msgs.length;
        
        channelAggregates[id] = {
            name: label,
            num_messages: msgs.length,
            raw_sentiment: curAvgSent,
            knn_danger_metric: curDanger
        };
    }
    
    let semanticLogs = analyzedMessages
        .filter(m => m.semantic_danger_knn > 0.6 || Math.abs(m.absolute_sentiment) > 0.8)
        .sort((a,b) => b.semantic_danger_knn - a.semantic_danger_knn)
        .slice(0, 15);

    const timestamp = new Date().toISOString();
    
    // Overall network calculations
    const combinedDanger = Object.values(channelAggregates).reduce((sum, c) => sum + c.knn_danger_metric, 0) / Math.max(1, Object.keys(channelAggregates).length);
    const combinedNormSent = Object.values(channelAggregates).reduce((sum, c) => sum + c.raw_sentiment, 0) / Math.max(1, Object.keys(channelAggregates).length);

    let tensionLevel = combinedDanger > 0.7 ? "PEAK_DANGER" : (combinedDanger > 0.5 ? "ESCALATING" : "CALM_CEASEFIRE");
    
    // Maintain Timeline Graph state
    let pastTimeline = [];
    if (fs.existsSync(FEED_FILE)) {
        try { 
            let oldFeed = JSON.parse(fs.readFileSync(FEED_FILE, 'utf-8')); 
            if (oldFeed.timeline) pastTimeline = oldFeed.timeline;
        } catch (e) {}
    }
    
    pastTimeline.push({
        time: timestamp,
        danger: parseFloat(combinedDanger.toFixed(3)),
        sentiment: parseFloat(combinedNormSent.toFixed(3))
    });
    
    // Kept to latest 48 points
    if (pastTimeline.length > 48) {
        pastTimeline = pastTimeline.slice(pastTimeline.length - 48);
    }
    
    const payload = {
        last_updated: timestamp,
        tension: {
            level: tensionLevel,
            global_knn_danger: combinedDanger.toFixed(2),
            global_norm_sentiment: combinedNormSent.toFixed(2),
        },
        timeline: pastTimeline,
        channel_data: channelAggregates,
        semantic_logs: semanticLogs
    };

    fs.writeFileSync(FEED_FILE, JSON.stringify(payload, null, 2));
    console.log("V4 Neural Analysis complete! Overall Danger Score:", combinedDanger.toFixed(2));
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
