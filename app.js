document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/osint-feed.json');
        if (!response.ok) throw new Error("Fetch failed");
        
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

        // 2. Official Network Overview
        const topicBox = document.getElementById('topTopics');
        topicBox.innerHTML = '';
        
        // Populate the channel averages
        for (const [channelName, stats] of Object.entries(data.channel_data)) {
            const el = document.createElement('div');
            el.innerHTML = `<strong>${channelName}:</strong> KNN Danger: ${stats.knn_danger_metric.toFixed(2)} | Sent. Shift: ${stats.normalized_sentiment > 0 ? '+' : ''}${stats.normalized_sentiment.toFixed(2)}`;
            el.className = 'topic-tag';
            topicBox.appendChild(el);
        }

        // 3. Build Multi-Channel Graph (Replacing old OSINT volume chart)
        const ctxVol = document.getElementById('volumeChart').getContext('2d');
        
        const channels = Object.keys(data.channel_data);
        const sentiments = channels.map(c => data.channel_data[c].normalized_sentiment);
        const dangers = channels.map(c => data.channel_data[c].knn_danger_metric);

        new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: channels,
                datasets: [
                    {
                        label: 'Normalized Sentiment Shift',
                        data: sentiments,
                        backgroundColor: sentiments.map(s => s > 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
                        borderColor: 'transparent',
                        borderWidth: 1
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: -1, max: 1 } } }
        });

        // 4. Build KNN Chart (Replacing Keyword chart)
        const ctxKey = document.getElementById('keywordChart').getContext('2d');
        new Chart(ctxKey, {
            type: 'bar',
            data: {
                labels: channels,
                datasets: [{
                    label: 'KNN Escalation Distance (0.0 to 1.0)',
                    data: dangers,
                    backgroundColor: dangers.map(d => d > 0.6 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)')
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 1 } } }
        });

    } catch (err) {
        console.error("Dashboard Feed Error:", err);
    }
});
