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
            
            // Generate tags array into spans
            const tagsHTML = log.matched_keywords.map(k => `<span class="topic-tag">${k}</span>`).join(' ');

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <strong style="color: var(--accent);">Source: @${log.channel}</strong>
                    <span style="color: var(--${log.severity === 'CRITICAL' ? 'peak' : 'high'}); font-weight: bold;">[${log.severity}]</span>
                </div>
                <p dir="auto" style="direction: rtl; font-size: 1.1rem; line-height: 1.5; color: #fff; margin-bottom: 1rem; background: rgba(0,0,0,0.2); padding: 1rem; border-right: 3px solid var(--accent); border-radius: 4px;">
                    ${log.text}
                </p>
                <div>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Trigger Words:</span> 
                    ${tagsHTML}
                </div>
            `;
            auditLogContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Analysis Error:", err);
        document.getElementById('auditLog').innerHTML = '<p style="color: red;">Failed to load analysis feed. Refresh later.</p>';
    }
});
