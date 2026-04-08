import https from 'https';

const channels = [
    'idfonline', 'israeldefenseforces', 'abualiexpress', 'OSINTdefender',
    'FarsNewsAgency', 'Tasnimnews', 'irna_1313', 'sepah_pasdaran',
    'almanarnews', 'C_Military1', 'almayadeen', 'QudsN'
];

function fetchHTML(channelId) {
    return new Promise((resolve) => {
        https.get(`https://t.me/s/${channelId}`, (res) => {
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

async function run() {
    for (let c of channels) {
        console.log(`\n=== CHANNEL: ${c} ===`);
        let html = await fetchHTML(c);
        let matches = html.match(/<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs) || [];
        let texts = matches.map(m => m.replace(/<br\s*[\/]?>/gi, " ").replace(/<\/?[^>]+(>|$)/g, "")).slice(-5);
        texts.forEach(t => console.log(' -> ' + t.substring(0, 150)));
    }
}
run();
