import fs from 'fs';
import https from 'https';

const CHANNELS = [
    'idfonline', 'israeldefenseforces', 'abualiexpress', 'OSINTdefender',
    'FarsNewsAgency', 'Tasnimnews', 'irna_1313', 'sepah_pasdaran',
    'almanarnews', 'C_Military1', 'almayadeen', 'QudsN'
];

// Dictionaries to force-filter messages from the 500-message pool to surface explicit anchor candidates
const DICT = {
    danger: ['אזעקה', 'טילים', 'חיסול', 'תקיפה', 'חדירת', 'مقتل', 'صواريخ', 'غارات', 'هجوم', 'شهيد', 'حمله', 'موشک', 'شهادت', 'تلافی', 'intercept', 'strike', 'siren', 'barrage', 'target'],
    calm: ['שגרה', 'הסכם', 'שקט', 'הנחיות', 'הוסכם', 'هدوء', 'هدنة', 'اتفاق', 'مفاوضات', 'سلام', 'عادی', 'آتش‌بس', 'صلح', 'مذاکرات', 'آرامش', 'ceasefire', 'routine', 'normal', 'agreement', 'peace']
};

function fetchHTML(channelId, beforeId = null) {
    return new Promise((resolve) => {
        let url = `https://t.me/s/${channelId}`;
        if (beforeId) url += `?before=${beforeId}`;
        
        https.get(url, { timeout: 8000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, (redir) => {
                    let d = ''; redir.on('data', c => d+=c); redir.on('end', () => resolve(d));
                });
            } else {
                let d = ''; res.on('data', c => d+=c); res.on('end', () => resolve(d));
            }
        }).on('error', () => resolve(''));
    });
}

function extractMessages(html) {
    let matches = html.match(/<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs) || [];
    let msgs = matches.map(m => m.replace(/<br\s*[\/]?>/gi, " ").replace(/<\/?[^>]+(>|$)/g, ""));
    
    let ids = html.match(/data-post="[^/]+\/(\d+)"/g) || [];
    let lowestId = null;
    ids.forEach(idStr => {
        let n = parseInt(idStr.split('/')[1].replace('"', ''));
        if (!lowestId || n < lowestId) lowestId = n;
    });
    
    return { texts: msgs, lowestId };
}

async function scrapeChannel(channelId) {
    let allMsgs = [];
    let currentId = null;
    let pages = 0;
    
    // Scrape roughly 500 messages (approx 25 pages x 20 msgs)
    while (allMsgs.length < 500 && pages < 25) {
        let html = await fetchHTML(channelId, currentId);
        let { texts, lowestId } = extractMessages(html);
        if (texts.length === 0 || !lowestId) break;
        
        allMsgs.push(...texts);
        currentId = lowestId;
        pages++;
    }
    return [...new Set(allMsgs)];
}

function selectAnchors(messages) {
    let dangerCandidates = [];
    let calmCandidates = [];
    
    messages.forEach(msg => {
        if (msg.length > 300) return; // avoid massive essays
        let lower = msg.toLowerCase();
        
        // Find match count
        let dnMatch = DICT.danger.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
        let clMatch = DICT.calm.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
        
        if (dnMatch > clMatch && dnMatch > 0) dangerCandidates.push({ t: msg, s: dnMatch });
        else if (clMatch > dnMatch && clMatch > 0) calmCandidates.push({ t: msg, s: clMatch });
    });
    
    // Sort by most dense matches
    dangerCandidates.sort((a,b) => b.s - a.s);
    calmCandidates.sort((a,b) => b.s - a.s);
    
    return {
        danger: dangerCandidates.slice(0, 5).map(x => x.t),
        calm: calmCandidates.slice(0, 5).map(x => x.t)
    };
}

async function run() {
    let anchors = {};
    for (let c of CHANNELS) {
        console.log(`Processing 500 messages for ${c}...`);
        let msgs = await scrapeChannel(c);
        let channelAnchors = selectAnchors(msgs);
        
        // If not enough calm anchors (common in war channels), backfill with defaults or highly neutral text
        if (channelAnchors.calm.length === 0) {
            channelAnchors.calm = msgs.slice(0, 5); // Fallback to raw recent
        }
        if (channelAnchors.danger.length === 0) {
            channelAnchors.danger = msgs.slice(0, 5); 
        }
        
        anchors[c] = channelAnchors;
    }
    
    if (!fs.existsSync('../data')) fs.mkdirSync('../data', { recursive: true });
    fs.writeFileSync('data/channel_anchors.json', JSON.stringify(anchors, null, 2));
    console.log("Anchors flawlessly generated!");
}

run();
