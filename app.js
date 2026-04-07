document.addEventListener('DOMContentLoaded', () => {
    
    // Animate numbers
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // Set Date
    const today = new Date();
    document.getElementById('currentDate').innerText = today.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // Target stats (Based on April 7, 2026 data context)
    const startDate = new Date('2026-02-28');
    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    animateValue(document.getElementById("stat-duration"), 0, diffDays, 1500);
    animateValue(document.getElementById("stat-cas-iran"), 0, 1680, 2500);
    animateValue(document.getElementById("stat-cas-leb"), 0, 1400, 2500);

    // Load Intel Feed
    const intelData = [
        { time: "T-01:30 HOURS", text: "Extensive joint U.S.-Israeli strikes reported targeting petrochemical facilities and critical hubs in Iran.", severity: "high" },
        { time: "T-05:45 HOURS", text: "Ceasefire mediations involving a 45-day proposal reportedly rejected; Iran demands permanent cessation of hostilities.", severity: "normal" },
        { time: "T-12:00 HOURS", text: "Strait of Hormuz tensions rise following U.S. ultimatum threatening Iranian energy infrastructure.", severity: "high" },
        { time: "T-24:00 HOURS", text: "Exchanges intensify between Hezbollah and standard military forces in Southern Lebanon.", severity: "normal" },
        { time: "T-48:00 HOURS", text: "Operation Epic Fury enters its 6th week with sustained campaign dynamics.", severity: "normal" }
    ];

    const intelList = document.getElementById('intelList');
    intelData.forEach((intel, index) => {
        setTimeout(() => {
            const li = document.createElement('li');
            li.className = `intel-item ${intel.severity}`;
            li.innerHTML = `
                <div class="intel-item-time">${intel.time}</div>
                <div class="intel-item-desc">${intel.text}</div>
            `;
            intelList.appendChild(li);
        }, index * 400); // Stagger animation
    });

    // Chart.js Setup
    const ctx = document.getElementById('casualtyChart').getContext('2d');
    
    // Mock data tracking the 6 weeks
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'];
    const iranData = [150, 420, 800, 1100, 1450, 1680];
    const lebData = [200, 450, 750, 1050, 1200, 1400];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Iran (Reported)',
                    data: iranData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Lebanon (Reported)',
                    data: lebData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(60, 70, 90, 0.4)' },
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
                },
                x: {
                    grid: { color: 'rgba(60, 70, 90, 0.4)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            }
        }
    });

});
