import { supabase } from '../supabase'

export function AnalyticsView() {
    return `
    <style>
        .analytics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; text-align: center; }
        .stat-value { font-size: 2rem; font-weight: 800; color: var(--text-main); }
        .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; letter-spacing: 0.05em; }
        .analytics-row { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px; }
        .analytics-full { margin-bottom: 24px; }
        .leaderboard-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .leaderboard-table th { padding: 10px 12px; text-align: left; background: var(--primary-light); color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid var(--border); }
        .leaderboard-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
        .leaderboard-table tr:hover { background: var(--row-hover); }
        .rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 0.7rem; font-weight: 700; }
        @media (max-width: 768px) {
            .analytics-grid { grid-template-columns: repeat(2, 1fr); }
            .analytics-row { grid-template-columns: 1fr; }
        }
    </style>
    <div class="fade-in">
        <header class="page-header">
            <h1 class="page-title">Analytics Dashboard</h1>
            <p class="page-subtitle">Team performance metrics and tagging statistics</p>
        </header>

        <div class="analytics-grid">
            <div class="stat-card">
                <div class="stat-value" id="stat-total-matches">—</div>
                <div class="stat-label">Total Matches</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-total-events">—</div>
                <div class="stat-label">Total Events</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-today-events">—</div>
                <div class="stat-label">Events Today</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="stat-avg-events">—</div>
                <div class="stat-label">Avg Events/Match</div>
            </div>
        </div>

        <div class="analytics-row">
            <div class="card" style="padding: 20px;">
                <h3 style="margin-bottom: 16px;">Events Per Day (Last 30 Days)</h3>
                <canvas id="daily-chart" width="700" height="250" style="width: 100%; max-height: 250px;"></canvas>
            </div>
            <div class="card" style="padding: 20px;">
                <h3 style="margin-bottom: 16px;">Action Breakdown</h3>
                <canvas id="action-chart" width="350" height="250" style="width: 100%; max-height: 250px;"></canvas>
            </div>
        </div>

        <div class="analytics-full" id="leaderboard-section">
            <div class="card" style="padding: 20px;">
                <h3 style="margin-bottom: 16px;">Top Taggers Leaderboard</h3>
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Analyst</th>
                            <th style="text-align:center;">Matches</th>
                            <th style="text-align:center;">Total Events</th>
                            <th style="text-align:center;">Avg/Match</th>
                            <th style="text-align:center;">Last Active</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboard-body">
                        <tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;
}

export async function initAnalytics() {
    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Paginated fetch helper — Supabase limits to 1000 rows per request
        async function fetchAll(query) {
            let all = [], rangeStart = 0;
            while (true) {
                const { data, error } = await query.range(rangeStart, rangeStart + 999);
                if (error) throw error;
                all = all.concat(data || []);
                if (!data || data.length < 1000) break;
                rangeStart += 1000;
            }
            return all;
        }

        // All authenticated users see stats across all matches — paginated
        const [matches, events, profiles] = await Promise.all([
            fetchAll(supabase.from('matches').select('match_id, created_by, created_at, status')),
            fetchAll(supabase.from('match_events').select('match_event_id, match_id, analyst_id, action, created_at')),
            fetchAll(supabase.from('profiles').select('id, username, role')),
        ]);

        // Summary stats
        const totalMatches = matches.length;
        const totalEvents = events.length;
        const today = new Date().toISOString().split('T')[0];
        const todayEvents = events.filter(e => e.created_at && e.created_at.startsWith(today)).length;
        const avgEvents = totalMatches > 0 ? Math.round(totalEvents / totalMatches) : 0;

        document.getElementById('stat-total-matches').textContent = totalMatches;
        document.getElementById('stat-total-events').textContent = totalEvents.toLocaleString();
        document.getElementById('stat-today-events').textContent = todayEvents;
        document.getElementById('stat-avg-events').textContent = avgEvents;

        // Daily events chart (last 30 days)
        renderDailyChart(events);

        // Action breakdown chart
        renderActionChart(events);

        // Leaderboard
        renderLeaderboard(events, matches, profiles);
    } catch (err) {
        console.error('Analytics load error:', err);
    }
}

function renderDailyChart(events) {
    const canvas = document.getElementById('daily-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Build last 30 days
    const days = [];
    const counts = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days.push(key);
        counts.push(0);
    }

    events.forEach(e => {
        if (!e.created_at) return;
        const day = e.created_at.split('T')[0];
        const idx = days.indexOf(day);
        if (idx !== -1) counts[idx]++;
    });

    const maxVal = Math.max(...counts, 1);
    const padL = 50, padR = 10, padT = 20, padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const barW = chartW / days.length - 2;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Background
    ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? '#999' : '#666';
        ctx.font = '10px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal * (1 - i / 4)), padL - 8, y + 4);
    }

    // Bars
    const gradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    gradient.addColorStop(0, '#22c55e');
    gradient.addColorStop(1, '#16a34a');

    counts.forEach((c, i) => {
        const x = padL + i * (chartW / days.length) + 1;
        const h = (c / maxVal) * chartH;
        const y = padT + chartH - h;

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barW, h);

        // Day label (every 5 days)
        if (i % 5 === 0 || i === days.length - 1) {
            ctx.fillStyle = isDark ? '#999' : '#666';
            ctx.font = '9px Courier New';
            ctx.textAlign = 'center';
            const label = days[i].slice(5); // MM-DD
            ctx.fillText(label, x + barW / 2, H - padB + 14);
        }
    });
}

function renderActionChart(events) {
    const canvas = document.getElementById('action-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Count actions
    const actionCounts = {};
    events.forEach(e => {
        if (e.action) actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    });

    // Sort by count, take top 10
    const sorted = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (sorted.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '14px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', W / 2, H / 2);
        return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const maxVal = sorted[0][1];
    const padL = 120, padR = 50, padT = 10, padB = 10;
    const chartW = W - padL - padR;
    const barH = Math.min(20, (H - padT - padB) / sorted.length - 4);

    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

    sorted.forEach(([action, count], i) => {
        const y = padT + i * (barH + 4);
        const w = (count / maxVal) * chartW;

        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(padL, y, w, barH);

        // Label
        ctx.fillStyle = isDark ? '#ccc' : '#333';
        ctx.font = '10px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(action, padL - 6, y + barH / 2 + 4);

        // Count
        ctx.textAlign = 'left';
        ctx.fillText(count, padL + w + 6, y + barH / 2 + 4);
    });
}

function renderLeaderboard(events, matches, profiles) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    // Build analyst stats
    const stats = {};
    profiles.forEach(p => {
        stats[p.id] = { username: p.username || 'Unnamed', role: p.role, totalEvents: 0, matchSet: new Set(), lastActive: null };
    });

    events.forEach(e => {
        const aid = e.analyst_id;
        if (!aid) return;
        if (!stats[aid]) stats[aid] = { username: 'Unknown', role: '?', totalEvents: 0, matchSet: new Set(), lastActive: null };
        stats[aid].totalEvents++;
        if (e.match_id) stats[aid].matchSet.add(e.match_id);
        if (e.created_at && (!stats[aid].lastActive || e.created_at > stats[aid].lastActive)) {
            stats[aid].lastActive = e.created_at;
        }
    });

    // Sort by total events
    const sorted = Object.entries(stats)
        .filter(([, s]) => s.totalEvents > 0)
        .sort((a, b) => b[1].totalEvents - a[1].totalEvents);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No tagging activity yet.</td></tr>';
        return;
    }

    const rankColors = ['#f59e0b', '#9ca3af', '#cd7f32'];

    tbody.innerHTML = sorted.map(([id, s], i) => {
        const matchCount = s.matchSet.size;
        const avg = matchCount > 0 ? Math.round(s.totalEvents / matchCount) : 0;
        const lastStr = s.lastActive ? new Date(s.lastActive).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
        const rankBg = i < 3 ? rankColors[i] : 'var(--primary-light)';
        const rankColor = i < 3 ? '#fff' : 'var(--text-muted)';
        return `
        <tr>
            <td><span class="rank-badge" style="background: ${rankBg}; color: ${rankColor};">${i + 1}</span></td>
            <td><strong>${s.username}</strong> <span style="font-size:0.65rem;color:var(--text-muted);">${s.role}</span></td>
            <td style="text-align:center;">${matchCount}</td>
            <td style="text-align:center; font-weight: 700;">${s.totalEvents.toLocaleString()}</td>
            <td style="text-align:center;">${avg}</td>
            <td style="text-align:center; font-size: 0.75rem; color: var(--text-muted);">${lastStr}</td>
        </tr>`;
    }).join('');
}
