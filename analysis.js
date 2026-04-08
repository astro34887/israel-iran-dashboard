document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data/osint-feed.json');
        if (!response.ok) throw new Error("Fetch failed");
        
        const data = await response.json();
        const auditLogContainer = document.getElementById('auditLog');

        if (!data.semantic_logs || data.semantic_logs.length === 0) {
            auditLogContainer.innerHTML = '<p>No critical messages intercepted in the current interval.</p>';
            return;
        }

        data.semantic_logs.forEach(log => {
            const card = document.createElement('div');
            card.className = 'log-card';
            
            // Generate tags based on neural analysis
            let isDanger = log.semantic_danger_knn > 0.6;
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <strong style="color: var(--accent);">State Channel: ${log.channel}</strong>
                    <span style="color: var(--${isDanger ? 'peak' : 'low'}); font-weight: bold;">[KNN: ${log.semantic_danger_knn.toFixed(2)}] [Raw Sent: ${log.absolute_sentiment.toFixed(2)}]</span>
                </div>
                <p dir="auto" style="direction: rtl; font-size: 1.1rem; line-height: 1.5; color: #fff; margin-bottom: 1rem; background: rgba(0,0,0,0.2); padding: 1rem; border-right: 3px solid var(--accent); border-radius: 4px;">
                    ${log.text}
                </p>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                    <em>Neural Assessment: ${isDanger ? 'Flags heavy similarity to escalation anchors.' : 'Aligns structurally with baseline or calm patterns.'}</em>
                </div>
            `;
            auditLogContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Analysis Error:", err);
        document.getElementById('auditLog').innerHTML = '<p style="color: red;">Failed to load analysis feed. Refresh later.</p>';
    }
});
