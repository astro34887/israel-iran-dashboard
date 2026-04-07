document.addEventListener('DOMContentLoaded', async () => {

    try {
        // Fetch real-time data scraped by GitHub actions
        const response = await fetch('data/osint-feed.json');
        if (!response.ok) throw new Error("Data fetch failed");
        
        const data = await response.json();
        
        // 1. Update Timestamp
        const dateObj = new Date(data.last_updated);
        document.getElementById('lastUpdated').innerText = dateObj.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

        // 2. Update Tension UI
        const tensionValueObj = document.getElementById('tensionLevel');
        const tensionDescObj = document.getElementById('tensionDesc');
        
        tensionValueObj.innerText = data.tension.level;
        tensionDescObj.innerText = `${data.tension.description} (Ratio: ${data.tension.ratio}x vs Avg)`;
        
        const lvl = data.tension.level.toLowerCase();
        tensionValueObj.className = `stat-value tension-${lvl}`;

        // 3. Render Top Topics
        const topicsList = document.getElementById('topTopics');
        data.top_topics.forEach(topic => {
            const span = document.createElement('span');
            span.className = 'topic-tag';
            span.innerText = topic;
            topicsList.appendChild(span);
        });

        // 4. Volume History Chart
        const volCtx = document.getElementById('volumeChart').getContext('2d');
        const times = data.history_window.map(item => {
            const hDate = new Date(item.time);
            return hDate.getHours() + ':00';
        });
        const volumes = data.history_window.map(item => item.volume);
        
        // Add current hourly average as a straight line
        const avgArray = Array(data.history_window.length).fill(data.tension.avg_volume);

        new Chart(volCtx, {
            type: 'line',
            data: {
                labels: times,
                datasets: [
                    {
                        label: 'OSINT Messages',
                        data: volumes,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Sliding Avg',
                        data: avgArray,
                        borderColor: 'rgba(148, 163, 184, 0.5)',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { grid: { color: 'rgba(60, 70, 90, 0.4)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { color: 'rgba(60, 70, 90, 0.4)' }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // 5. Keyword Bar Chart
        const kwCtx = document.getElementById('keywordChart').getContext('2d');
        const keywords = Object.keys(data.keywords);
        const counts = Object.values(data.keywords);

        new Chart(kwCtx, {
            type: 'bar',
            data: {
                labels: keywords,
                datasets: [{
                    label: 'Mentions in Last 24hrs',
                    data: counts,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { grid: { color: 'rgba(60, 70, 90, 0.4)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {family: 'Outfit'} } }
                }
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        document.getElementById('tensionLevel').innerText = "ERROR";
        document.getElementById('tensionDesc').innerText = "Failed to load OSINT stream.";
    }

});
