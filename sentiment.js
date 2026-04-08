let chartInstances = {};

async function updateDashboard() {
    try {
        const response = await fetch('data/osint-feed.json');
        if (!response.ok) throw new Error('Data not ready');
        
        const data = await response.json();
        
        // 1. Update Core Stats
        const statusEl = document.getElementById('tensionLevel');
        const descEl = document.getElementById('tensionDesc');
        const dateEl = document.getElementById('lastUpdated');

        let level = data.tension.level;
        let sentStr = data.tension.global_norm_sentiment;
        
        if (dateEl) dateEl.textContent = new Date(data.last_updated).toLocaleString();
        
        if (level === 'PEAK_DANGER') {
            statusEl.textContent = 'PEAK ESCALATION';
            statusEl.className = 'stat-value text-red';
        } else if (level === 'ESCALATING') {
            statusEl.textContent = 'ELEVATED/ESCALATING';
            statusEl.className = 'stat-value text-orange';
        } else {
            statusEl.textContent = 'CALM / CEASEFIRE';
            statusEl.className = 'stat-value text-green';
        }
        
        descEl.innerHTML = `Global Normalized Sentiment: <b>${sentStr}</b> (1.0 = Highly Positive, -1.0 = Highly Negative)`;

        // 2. Extract History Arrays
        const timeline = data.timeline || [];
        if (timeline.length === 0) return;
        
        const labels = timeline.map(t => {
            let d = new Date(t.time);
            return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
        });
        
        // Render Global Chart
        const globalSentiment = timeline.map(t => t.global_sentiment !== undefined ? t.global_sentiment : t.sentiment);
        renderSparkline('timelineChartGlobal', labels, globalSentiment, 'rgba(168, 85, 247, 1)', 'rgba(168, 85, 247, 0.2)');

        // Render Individual 12 Channels
        const internalChannels = [
            'idfonline', 'israeldefenseforces', 'abualiexpress', 'OSINTdefender',
            'FarsNewsAgency', 'Tasnimnews', 'irna_1313', 'sepah_pasdaran',
            'almanarnews', 'C_Military1', 'almayadeen', 'QudsN'
        ];
        
        internalChannels.forEach(ch => {
            let chData = timeline.map(t => {
                if (t.channels && t.channels[ch]) return t.channels[ch].sentiment;
                return t.sentiment; // fallback to global if undefined historically
            });
            
            // Map colors per faction
            let color = 'rgba(56, 189, 248, 1)';
            let fill = 'rgba(56, 189, 248, 0.2)';
            if (['FarsNewsAgency', 'Tasnimnews', 'irna_1313', 'sepah_pasdaran'].includes(ch)) {
                color = 'rgba(249, 115, 22, 1)';
                fill = 'rgba(249, 115, 22, 0.2)';
            }
            if (['almanarnews', 'C_Military1', 'almayadeen', 'QudsN'].includes(ch)) {
                color = 'rgba(239, 68, 68, 1)';
                fill = 'rgba(239, 68, 68, 0.2)';
            }
            
            renderSparkline(`chart-${ch}`, labels, chData, color, fill);
        });

    } catch(e) {
        console.error('Error fetching data:', e);
        if (document.getElementById('tensionLevel')) {
            document.getElementById('tensionLevel').textContent = "ERROR";
        }
    }
}

function renderSparkline(canvasId, labels, dataPoints, borderColor, fillColor) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                borderColor: borderColor,
                backgroundColor: fillColor,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: -1.0,
                    max: 1.0,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#64748b', maxTicksLimit: 5 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', maxTicksLimit: 6 }
                }
            }
        }
    });
}

setInterval(updateDashboard, 60000);
updateDashboard();
