let timelineChartInstance = null;

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
        let dangerStr = data.tension.global_knn_danger;
        
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
        
        descEl.innerHTML = `Global KNN Semantic Danger Score: <b>${dangerStr}</b> (1.0 = Max Escalation, 0.0 = Ceasefire)`;

        // 2. Official Network Overview (Top Topics equivalent)
        const topicBox = document.getElementById('topTopics');
        if (topicBox) {
            topicBox.innerHTML = '';
            
            Object.entries(data.channel_data || {}).forEach(([id, c]) => {
                let topicHtml = `
                    <div style="margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">
                        <strong>${c.name} (${id})</strong>: Scraped ${c.num_messages} messages<br/>
                        <small style="opacity: 0.8">Raw Sentiment: ${c.raw_sentiment.toFixed(2)} | KNN Escalation: ${c.knn_danger_metric.toFixed(2)}</small>
                    </div>
                `;
                topicBox.innerHTML += topicHtml;
            });
        }

        // 3. Render Timeline Chart
        renderTimelineChart(data.timeline || []);

    } catch(e) {
        console.error('Error fetching data:', e);
        if (document.getElementById('tensionLevel')) {
            document.getElementById('tensionLevel').textContent = "ERROR";
        }
    }
}

function renderTimelineChart(timeline) {
    if (timeline.length === 0) return;
    
    // Map timeline payload to axes
    const labels = timeline.map(t => {
        let d = new Date(t.time);
        return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    });
    
    const dangerData = timeline.map(t => t.danger);
    const sentimentData = timeline.map(t => t.sentiment);

    const ctx = document.getElementById('timelineChart');
    if(!ctx) return;
    
    if (timelineChartInstance) {
        timelineChartInstance.destroy();
    }
    
    timelineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Global KNN Danger Score',
                    data: dangerData,
                    borderColor: '#f87171',
                    backgroundColor: 'rgba(248, 113, 113, 0.2)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Global Normalized Sentiment',
                    data: sentimentData,
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96, 165, 250, 0)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1.0,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff' } }
            }
        }
    });
}

setInterval(updateDashboard, 60000); // 1-minute auto-refresh
updateDashboard();
