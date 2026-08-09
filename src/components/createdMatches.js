import { supabase } from '../supabase'

export function MatchesView() {
    return `
        <div class="fade-in">
            <header class="page-header">
                <h1 class="page-title">My Matches</h1>
                <p class="page-subtitle">All tagged matches</p>
            </header>

            <div id="matches-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px;">
                <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">
                    Loading matches...
                </div>
            </div>
        </div>
    `;
}

export async function initMatches() {
    const grid = document.getElementById('matches-grid');

    try {
        const { data: { user } } = await supabase.auth.getUser();

        // All authenticated users see all matches (RLS also enforces this server-side)
        const matchesQuery = supabase
            .from('matches')
            .select(`
                match_id, match_name, match_date, status, video_url, locked_by, locked_at, created_by,
                home_team:teams!home_team_id(team_name),
                away_team:teams!away_team_id(team_name)
            `)
            .order('created_at', { ascending: false });

        const analystsQuery = supabase.from('profiles').select('id, username').order('username');

        const [matchesResult, analystsResult, assignmentsResult] = await Promise.all([
            matchesQuery,
            analystsQuery,
            supabase.from('match_assignments').select('match_id, user_id')
        ]);

        if (matchesResult.error) throw matchesResult.error;
        const matches = matchesResult.data || [];
        const analystList = analystsResult.data || [];
        const assignments = assignmentsResult.data || [];

        // Build assignment lookup: match_id -> [user_id, ...]
        const assignmentMap = {};
        assignments.forEach(a => {
            if (!assignmentMap[a.match_id]) assignmentMap[a.match_id] = [];
            assignmentMap[a.match_id].push(a.user_id);
        });

        // Build username lookup
        const usernames = {};
        analystList.forEach(u => { usernames[u.id] = u.username; });

        if (!matches || matches.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 80px; background: var(--primary-light); border-radius: var(--radius-xl); border: 1px dashed var(--border);">
                    <p style="color: var(--text-muted); margin-bottom: 24px;">No matches found. Create your first match to get started.</p>
                    <a href="#create-match" class="btn btn-primary" style="width: auto; padding: 12px 32px;">+ Create New Match</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = matches.map(m => {
            const isLocked = m.locked_by && m.locked_by !== user.id &&
                (Date.now() - new Date(m.locked_at).getTime() < 10 * 60 * 1000);
            const lockerName = usernames[m.locked_by] || 'Someone';
            const assignedIds = assignmentMap[m.match_id] || [];
            const isReceivedAssignment = assignedIds.includes(user.id) && m.created_by !== user.id;

            // Multi-select checkbox options (exclude the creator)
            const checkboxOptions = analystList
                .filter(a => a.id !== user.id)
                .map(a => {
                    const checked = assignedIds.includes(a.id) ? 'checked' : '';
                    return `
                        <label style="display: flex; align-items: center; gap: 6px; padding: 4px 0; cursor: pointer;">
                            <input type="checkbox" class="assign-checkbox" data-match-id="${m.match_id}" data-user-id="${a.id}" ${checked}>
                            <span>${a.username || 'Unnamed'}</span>
                        </label>`;
                }).join('');

            // Show assigned names as chips
            const assignedChips = assignedIds
                .map(id => usernames[id] || 'Unknown')
                .map(name => `<span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 99px; font-size: 0.625rem; font-weight: 600;">${name}</span>`)
                .join(' ');

            return `
            <div class="card" style="display: flex; flex-direction: column; gap: 16px; border-top: 4px solid ${m.status === 'Done' ? 'var(--success)' : m.status === 'QC' ? 'var(--warning)' : 'var(--accent)'}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="margin-bottom: 4px; font-size: 1.125rem;">${m.match_name}</h4>
                        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
                            ${new Date(m.match_date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                        </div>
                        ${isReceivedAssignment ? '<div style="font-size: 0.65rem; color: var(--warning); margin-top: 4px; font-weight: 600;">ASSIGNED TO YOU</div>' : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span style="background: ${getStatusColor(m.status)}; color: white; padding: 4px 10px; border-radius: 99px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase;">
                            ${m.status === 'Doing' ? 'Tagging' : m.status}
                        </span>
                        ${isLocked ? `<span style="font-size: 0.6rem; color: var(--danger); font-weight: 600;">LOCKED by ${lockerName}</span>` : ''}
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--primary-light); border-radius: var(--radius-md);">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 600; font-size: 0.875rem;">${m.home_team.team_name}</div>
                        <div style="font-size: 0.625rem; color: var(--text-muted);">HOME</div>
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); padding: 0 12px;">VS</div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 600; font-size: 0.875rem;">${m.away_team.team_name}</div>
                        <div style="font-size: 0.625rem; color: var(--text-muted);">AWAY</div>
                    </div>
                </div>

                ${assignedIds.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                    <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">Assigned:</span>
                    ${assignedChips}
                </div>
                ` : ''}

                ${m.created_by === user.id ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); position: relative;">
                    <label style="font-weight: 600; display: block; margin-bottom: 4px;">Assign analysts:</label>
                    <div class="assign-dropdown-toggle" data-match-id="${m.match_id}" style="padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; background: var(--bg-main); font-size: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                        <span>${assignedIds.length > 0 ? assignedIds.length + ' analyst(s) selected' : 'Select analysts...'}</span>
                        <span style="font-size: 0.6rem;">▼</span>
                    </div>
                    <div class="assign-dropdown-menu" data-match-id="${m.match_id}" style="display: none; position: absolute; z-index: 10; background: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 12px; max-height: 180px; overflow-y: auto; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        ${checkboxOptions || '<div style="color: var(--text-muted); font-size: 0.75rem;">No other analysts available</div>'}
                    </div>
                </div>
                ` : ''}

                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                    ${getActionBtn(m, isLocked)}
                </div>
            </div>
        `}).join('');

        // Toggle dropdown menus
        grid.querySelectorAll('.assign-dropdown-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const matchId = toggle.dataset.matchId;
                const menu = grid.querySelector(`.assign-dropdown-menu[data-match-id="${matchId}"]`);
                // Close all other dropdowns first
                grid.querySelectorAll('.assign-dropdown-menu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
                e.stopPropagation();
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            grid.querySelectorAll('.assign-dropdown-menu').forEach(m => m.style.display = 'none');
        });

        // Handle checkbox changes — update junction table
        grid.querySelectorAll('.assign-checkbox').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const matchId = e.target.dataset.matchId;
                const userId = e.target.dataset.userId;

                if (e.target.checked) {
                    const { error } = await supabase.from('match_assignments').insert({ match_id: matchId, user_id: userId });
                    if (error) {
                        alert('Assignment failed: ' + error.message);
                        e.target.checked = false;
                    }
                } else {
                    const { error } = await supabase.from('match_assignments').delete().eq('match_id', matchId).eq('user_id', userId);
                    if (error) {
                        alert('Unassign failed: ' + error.message);
                        e.target.checked = true;
                    }
                }

                // Update the toggle label and chips
                const card = e.target.closest('.card');
                const allChecked = card.querySelectorAll('.assign-checkbox:checked');
                const toggle = card.querySelector('.assign-dropdown-toggle span:first-child');
                if (toggle) {
                    toggle.textContent = allChecked.length > 0 ? allChecked.length + ' analyst(s) selected' : 'Select analysts...';
                }
            });
        });

    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger); text-align: center;">Error loading matches: ${err.message}</div>`;
    }
}

function getStatusColor(status) {
    if (status === 'Done') return 'var(--success)';
    if (status === 'QC') return 'var(--warning)';
    return 'var(--accent)';
}

function getActionBtn(match, isLocked) {
    const lockWarning = isLocked ? ' (LOCKED)' : '';

    if (match.status === 'Doing') {
        return `<a href="#tagger?id=${match.match_id}" class="btn btn-primary">Start Tagging${lockWarning}</a>`;
    }
    if (match.status === 'QC') {
        return `
            <a href="#tagger?id=${match.match_id}" class="btn btn-ghost" style="border: 1px solid var(--border);">Edit Tags${lockWarning}</a>
            <a href="#qc?id=${match.match_id}" class="btn btn-primary" style="background: var(--warning);">Open QC Portal</a>
        `;
    }
    if (match.status === 'Done') {
        return `
            <a href="#qc?id=${match.match_id}" class="btn btn-primary" style="background: var(--success);">View Analysis & Export</a>
        `;
    }
    return '';
}
