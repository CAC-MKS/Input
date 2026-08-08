import { supabase } from '../supabase'
import { exportToExcel, exportToCSV } from '../lib/excelExport'
import { CAC_LOGIC } from '../lib/cacLogic'

/* ──────────────────────────────────────────
   MODULE STATE
   ────────────────────────────────────────── */
let allMatches = [];
let allTeams = [];
let allPlayers = [];
let allUsers = [];
let allAcademies = [];
let allAssignments = {};
let flowRules = [];
let flowEdits = {};
let teamStats = {};
let playerStats = {};
let mergeTeamSource = null;
let mergeTeamTarget = null;
let mergePlayerSource = null;
let mergePlayerTarget = null;
let selectedMatchIds = new Set();

/* ──────────────────────────────────────────
   VIEW
   ────────────────────────────────────────── */
export function AdminPortalView() {
    return `
    <style>
        .admin-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 2px solid var(--border); padding-bottom: 0; flex-wrap: wrap; }
        .admin-tab { padding: 10px 20px; border: 1px solid transparent; border-bottom: none; border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); font-family: inherit; transition: all 0.15s; }
        .admin-tab:hover { color: var(--text-main); background: var(--row-hover); }
        .admin-tab.active { color: var(--text-main); background: var(--bg-card); border-color: var(--border); margin-bottom: -2px; border-bottom: 2px solid var(--bg-card); }
        .admin-section { display: none; }
        .admin-section.visible { display: block; }

        .admin-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; font-family: var(--font-mono); }
        .admin-table th { padding: 10px 12px; text-align: left; background: var(--primary-light); color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid var(--border); white-space: nowrap; }
        .admin-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
        .admin-table tr:hover { background: var(--row-hover); }

        .admin-status { padding: 3px 10px; border-radius: 99px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; display: inline-block; }

        .admin-search { margin-bottom: 16px; }

        .merge-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .merge-col h4 { margin-bottom: 8px; font-size: 0.85rem; }
        .merge-list { max-height: 280px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
        .merge-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.8rem; transition: background 0.1s; }
        .merge-item:last-child { border-bottom: none; }
        .merge-item:hover { background: var(--row-hover); }
        .merge-item.selected { background: var(--row-selected); border-left: 3px solid var(--accent); }
        .merge-item .merge-meta { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }

        .merge-summary { padding: 12px 16px; background: var(--primary-light); border: 1px solid var(--border); border-radius: var(--radius-md); margin: 16px 0; font-size: 0.8rem; }

        .dl-btn { background: none; border: 1px solid var(--border); color: var(--text-main); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; font-family: inherit; transition: all 0.15s; }
        .dl-btn:hover { background: var(--hover-bg); border-color: var(--hover-border); }
        .dl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .bulk-bar { display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: var(--primary-light); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 16px; flex-wrap: wrap; }
        .bulk-bar .bulk-count { font-size: 0.8rem; font-weight: 700; color: var(--accent); }

        .assign-select { padding: 4px 8px; font-size: 0.7rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit; }

        @media (max-width: 768px) {
            .merge-columns { grid-template-columns: 1fr; }
        }
    </style>

    <div class="fade-in">
        <header class="page-header">
            <h1 class="page-title">Admin Portal</h1>
            <p class="page-subtitle">Global data management, downloads, and cleanup tools</p>
        </header>

        <div class="admin-tabs">
            <button class="admin-tab active" data-tab="academies">Academies</button>
            <button class="admin-tab" data-tab="users">Analysts</button>
            <button class="admin-tab" data-tab="matches">Matches</button>
            <button class="admin-tab" data-tab="teams">Merge Teams</button>
            <button class="admin-tab" data-tab="players">Merge Players</button>
            <button class="admin-tab" data-tab="actionflow">Action Flow</button>
        </div>

        <!-- ACADEMIES TAB -->
        <section id="admin-tab-academies" class="admin-section visible">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0;">Academies</h3>
                    <button id="btn-create-academy" class="btn btn-primary" style="width: auto; padding: 8px 20px;">+ Create Academy</button>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
                    Each academy is an isolated workspace. Analysts only see matches, teams, and players belonging to the academy they are assigned to.
                </p>
                <div style="overflow-x: auto;">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Slug</th>
                                <th>Analysts</th>
                                <th>Matches</th>
                                <th>Created</th>
                                <th style="text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-academies-tbody">
                            <tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading…</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Create Academy Modal -->
            <div id="academy-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center;">
                <div style="background: var(--bg-card); padding: 32px; border-radius: var(--radius-xl); max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                    <h3 id="academy-modal-title" style="margin-bottom: 16px;">Create Academy</h3>
                    <input type="hidden" id="academy-modal-id">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input id="academy-modal-name" class="form-input" placeholder="Academy name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Slug</label>
                        <input id="academy-modal-slug" class="form-input" placeholder="academy-slug (lowercase, no spaces)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Logo URL (optional)</label>
                        <input id="academy-modal-logo" class="form-input" placeholder="https://...">
                    </div>
                    <div id="academy-modal-error" style="color: var(--danger); font-size: 0.8rem; margin-bottom: 8px; display: none;"></div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button id="academy-modal-cancel" class="btn btn-ghost" style="flex: 1;">Cancel</button>
                        <button id="academy-modal-save" class="btn btn-primary" style="flex: 1;">Save</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- MATCHES TAB -->
        <section id="admin-tab-matches" class="admin-section">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0;">All Matches</h3>
                    <input id="admin-match-search" class="form-input admin-search" style="width: 280px; margin: 0;" type="text" placeholder="Search matches...">
                </div>

                <!-- Bulk Operations Bar -->
                <div id="bulk-bar" class="bulk-bar" style="display: none;">
                    <span class="bulk-count" id="bulk-count">0 selected</span>
                    <button class="dl-btn" id="bulk-status-doing">Set: Doing</button>
                    <button class="dl-btn" id="bulk-status-qc">Set: QC</button>
                    <button class="dl-btn" id="bulk-status-done">Set: Done</button>
                    <button class="dl-btn" id="bulk-export-xlsx">Export XLSX</button>
                    <button class="dl-btn" id="bulk-export-csv">Export CSV</button>
                    <button class="dl-btn" id="bulk-delete" style="color: var(--danger); border-color: var(--danger);">Delete</button>
                    <button class="dl-btn" id="bulk-clear">Clear Selection</button>
                </div>

                <div style="overflow-x: auto;">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th style="width: 30px;"><input type="checkbox" id="select-all-matches" title="Select all"></th>
                                <th>Match</th>
                                <th>Home</th>
                                <th>Away</th>
                                <th>Creator</th>
                                <th>Assigned To</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Events</th>
                                <th>Type</th>
                                <th>Download</th>
                            </tr>
                        </thead>
                        <tbody id="admin-matches-tbody">
                            <tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- ANALYSTS TAB -->
        <section id="admin-tab-users" class="admin-section">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0;">Analysts</h3>
                    <button id="btn-create-analyst" class="btn btn-primary" style="width: auto; padding: 8px 20px;">+ Create Analyst</button>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
                    Each analyst must be assigned to exactly one academy. Analysts without an academy cannot log in until you assign one.
                </p>
                <div style="overflow-x: auto;">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Academy</th>
                                <th style="text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="admin-users-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Create Analyst Modal -->
            <div id="analyst-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center;">
                <div style="background: var(--bg-card); padding: 32px; border-radius: var(--radius-xl); max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                    <h3 style="margin-bottom: 16px;">Create Analyst</h3>
                    <div class="form-group">
                        <label class="form-label">Email</label>
                        <input id="analyst-modal-email" class="form-input" type="email" placeholder="analyst@example.com">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Username</label>
                        <input id="analyst-modal-username" class="form-input" placeholder="Display name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Temporary Password</label>
                        <input id="analyst-modal-password" class="form-input" type="text" placeholder="Min 8 chars, letters, numbers, special">
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Share this with the analyst. They can reset it later.</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Academy</label>
                        <select id="analyst-modal-academy" class="form-input"></select>
                    </div>
                    <div id="analyst-modal-error" style="color: var(--danger); font-size: 0.8rem; margin-bottom: 8px; display: none;"></div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button id="analyst-modal-cancel" class="btn btn-ghost" style="flex: 1;">Cancel</button>
                        <button id="analyst-modal-save" class="btn btn-primary" style="flex: 1;">Create</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- TEAM MERGE TAB -->
        <section id="admin-tab-teams" class="admin-section">
            <div class="card">
                <h3 style="margin-bottom: 8px;">Merge Teams</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">
                    Combine duplicate teams. All matches, players, and events from Source will be reassigned to Target, then Source is deleted.
                </p>
                <input id="admin-team-search" class="form-input" type="text" placeholder="Search teams..." style="margin-bottom: 16px;">
                <div class="merge-columns">
                    <div class="merge-col">
                        <h4 style="color: var(--danger);">Source (to delete)</h4>
                        <div class="merge-list" id="merge-team-source-list"></div>
                    </div>
                    <div class="merge-col">
                        <h4 style="color: var(--success);">Target (to keep)</h4>
                        <div class="merge-list" id="merge-team-target-list"></div>
                    </div>
                </div>
                <div class="merge-summary" id="merge-team-summary" style="display: none;"></div>
                <button id="btn-merge-teams" class="btn btn-primary" style="background: var(--warning); color: black; margin-top: 8px;" disabled>Merge Teams</button>
            </div>
        </section>

        <!-- PLAYER MERGE TAB -->
        <section id="admin-tab-players" class="admin-section">
            <div class="card">
                <h3 style="margin-bottom: 8px;">Merge Players</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">
                    Combine duplicate players. All events and lineups from Source will be reassigned to Target, then Source is deleted.
                </p>
                <input id="admin-player-search" class="form-input" type="text" placeholder="Search players..." style="margin-bottom: 16px;">
                <div class="merge-columns">
                    <div class="merge-col">
                        <h4 style="color: var(--danger);">Source (to delete)</h4>
                        <div class="merge-list" id="merge-player-source-list"></div>
                    </div>
                    <div class="merge-col">
                        <h4 style="color: var(--success);">Target (to keep)</h4>
                        <div class="merge-list" id="merge-player-target-list"></div>
                    </div>
                </div>
                <div class="merge-summary" id="merge-player-summary" style="display: none;"></div>
                <button id="btn-merge-players" class="btn btn-primary" style="background: var(--warning); color: black; margin-top: 8px;" disabled>Merge Players</button>
            </div>
        </section>

        <!-- ACTION FLOW TAB -->
        <section id="admin-tab-actionflow" class="admin-section">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h3 style="margin: 0;">Action Flow Rules</h3>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Define what the next entry should be based on the current action, outcome, and type. Changes affect the tagger for all analysts.</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input id="flow-search" class="form-input admin-search" style="width: 220px; margin: 0;" type="text" placeholder="Filter by action...">
                        <button id="btn-save-flow" class="btn btn-primary" style="width: auto; padding: 8px 24px;">Save Changes</button>
                    </div>
                </div>

                <!-- OTP Modal -->
                <div id="flow-otp-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center;">
                    <div style="background: var(--bg-card); padding: 32px; border-radius: var(--radius-xl); max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                        <h3 style="margin-bottom: 8px;">Enter Password to Save</h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">Enter your admin login password to confirm changes.</p>
                        <input id="flow-otp-input" class="form-input" type="password" placeholder="Enter your password" style="font-size: 1rem; font-weight: 500;">
                        <div id="flow-otp-error" style="color: var(--danger); font-size: 0.8rem; margin-top: 8px; display: none;"></div>
                        <div style="display: flex; gap: 8px; margin-top: 20px;">
                            <button id="flow-otp-cancel" class="btn btn-ghost" style="flex: 1;">Cancel</button>
                            <button id="flow-otp-confirm" class="btn btn-primary" style="flex: 1;">Confirm Save</button>
                        </div>
                    </div>
                </div>

                <div id="flow-status" style="display: none; padding: 10px 16px; border-radius: var(--radius-md); margin-bottom: 12px; font-size: 0.8rem;"></div>

                <div style="overflow-x: auto; max-height: 70vh; overflow-y: auto;">
                    <table class="admin-table" id="flow-rules-table">
                        <thead style="position: sticky; top: 0; z-index: 2;">
                            <tr>
                                <th style="background: var(--warning); color: black;">Current Action</th>
                                <th style="background: var(--warning); color: black;">Current Outcome</th>
                                <th style="background: var(--warning); color: black;">Current Type</th>
                                <th style="background: var(--accent); color: white;">Next Action</th>
                                <th style="background: var(--accent); color: white;">Next Outcome</th>
                                <th style="background: var(--accent); color: white;">Next Type</th>
                                <th style="background: var(--accent); color: white;">Next Action Player</th>
                                <th style="background: var(--accent); color: white;">Next Reaction Player</th>
                            </tr>
                        </thead>
                        <tbody id="flow-rules-tbody">
                            <tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">Loading flow rules...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    </div>
    `;
}

/* ──────────────────────────────────────────
   INIT
   ────────────────────────────────────────── */
export async function initAdminPortal() {
    // Tab switching
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('visible'));
            tab.classList.add('active');
            document.getElementById(`admin-tab-${tab.dataset.tab}`).classList.add('visible');
        });
    });

    // Load academies first — both Analysts and Matches tabs depend on it
    await fetchAdminAcademies();

    // Load all sections in parallel
    await Promise.all([
        fetchAdminMatches(),
        fetchAdminUsers(),
        fetchTeamMergeData(),
        fetchPlayerMergeData(),
        fetchFlowRules(),
    ]);

    // Academy modal handlers
    document.getElementById('btn-create-academy').addEventListener('click', () => openAcademyModal());
    document.getElementById('academy-modal-cancel').addEventListener('click', closeAcademyModal);
    document.getElementById('academy-modal-save').addEventListener('click', saveAcademyModal);

    // Analyst modal handlers
    document.getElementById('btn-create-analyst').addEventListener('click', openAnalystModal);
    document.getElementById('analyst-modal-cancel').addEventListener('click', closeAnalystModal);
    document.getElementById('analyst-modal-save').addEventListener('click', saveAnalystModal);

    // Search handlers
    document.getElementById('admin-match-search').addEventListener('input', renderMatchRows);
    document.getElementById('admin-team-search').addEventListener('input', () => renderTeamMergeLists());
    document.getElementById('admin-player-search').addEventListener('input', () => renderPlayerMergeLists());

    // Merge buttons
    document.getElementById('btn-merge-teams').addEventListener('click', () => handleMerge('teams'));
    document.getElementById('btn-merge-players').addEventListener('click', () => handleMerge('players'));

    // Download / action delegation
    document.getElementById('admin-matches-tbody').addEventListener('click', handleMatchAction);

    // Select all checkbox
    document.getElementById('select-all-matches').addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
            allMatches.forEach(m => selectedMatchIds.add(m.match_id));
        } else {
            selectedMatchIds.clear();
        }
        renderMatchRows();
        updateBulkBar();
    });

    // Bulk operation buttons
    document.getElementById('bulk-status-doing').addEventListener('click', () => bulkChangeStatus('Doing'));
    document.getElementById('bulk-status-qc').addEventListener('click', () => bulkChangeStatus('QC'));
    document.getElementById('bulk-status-done').addEventListener('click', () => bulkChangeStatus('Done'));
    document.getElementById('bulk-export-xlsx').addEventListener('click', () => bulkExport('xlsx'));
    document.getElementById('bulk-export-csv').addEventListener('click', () => bulkExport('csv'));
    document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
    document.getElementById('bulk-clear').addEventListener('click', () => {
        selectedMatchIds.clear();
        document.getElementById('select-all-matches').checked = false;
        renderMatchRows();
        updateBulkBar();
    });

    // Action Flow handlers
    document.getElementById('flow-search')?.addEventListener('input', renderFlowTable);
    document.getElementById('btn-save-flow')?.addEventListener('click', handleFlowSave);
    document.getElementById('flow-otp-cancel')?.addEventListener('click', () => {
        document.getElementById('flow-otp-modal').style.display = 'none';
    });
    document.getElementById('flow-otp-confirm')?.addEventListener('click', handleFlowOTPConfirm);
}

/* ──────────────────────────────────────────
   MATCHES
   ────────────────────────────────────────── */
async function fetchAdminMatches() {
    const [matchRes, userRes, assignRes] = await Promise.all([
        supabase.from('matches').select(`
            *, home_team:teams!home_team_id(team_name),
            away_team:teams!away_team_id(team_name),
            creator:profiles!created_by(username)
        `).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, username, role'),
        supabase.from('match_assignments').select('match_id, user_id'),
    ]);

    if (matchRes.error) {
        document.getElementById('admin-matches-tbody').innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--danger);">${matchRes.error.message}</td></tr>`;
        return;
    }

    allUsers = userRes.data || [];

    // Build assignment lookup: match_id -> [user_id, ...]
    allAssignments = {};
    (assignRes.data || []).forEach(a => {
        if (!allAssignments[a.match_id]) allAssignments[a.match_id] = [];
        allAssignments[a.match_id].push(a.user_id);
    });

    // Paginated fetch for event counts — Supabase limits to 1000 rows
    let allEventRows = [], rangeStart = 0;
    while (true) {
        const { data: page } = await supabase.from('match_events').select('match_id').range(rangeStart, rangeStart + 999);
        allEventRows = allEventRows.concat(page || []);
        if (!page || page.length < 1000) break;
        rangeStart += 1000;
    }

    const eventCounts = {};
    allEventRows.forEach(e => { eventCounts[e.match_id] = (eventCounts[e.match_id] || 0) + 1; });

    allMatches = (matchRes.data || []).map(m => ({
        ...m,
        homeName: m.home_team?.team_name || '?',
        awayName: m.away_team?.team_name || '?',
        creatorName: m.creator?.username || 'Unknown',
        eventCount: eventCounts[m.match_id] || 0,
    }));

    renderMatchRows();
    renderAcademiesTable();
}

function renderMatchRows() {
    const tbody = document.getElementById('admin-matches-tbody');
    const q = (document.getElementById('admin-match-search')?.value || '').toLowerCase();

    const filtered = q ? allMatches.filter(m =>
        m.match_name.toLowerCase().includes(q) ||
        m.homeName.toLowerCase().includes(q) ||
        m.awayName.toLowerCase().includes(q) ||
        m.creatorName.toLowerCase().includes(q)
    ) : allMatches;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">${q ? 'No matches found.' : 'No matches in the system.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(m => {
        const sc = statusStyle(m.status);
        const date = m.match_date ? new Date(m.match_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '-';
        const isChecked = selectedMatchIds.has(m.match_id) ? 'checked' : '';
        const assignedIds = allAssignments[m.match_id] || [];
        const assignedNames = assignedIds.map(id => {
            const u = allUsers.find(u => u.id === id);
            return u?.username || 'Unknown';
        }).join(', ') || '-';

        const checkboxOptions = allUsers.map(u => {
            const checked = assignedIds.includes(u.id) ? 'checked' : '';
            return `<label style="display: flex; align-items: center; gap: 4px; padding: 2px 0; cursor: pointer; white-space: nowrap;">
                <input type="checkbox" class="admin-assign-cb" data-match-id="${m.match_id}" data-user-id="${u.id}" ${checked}>
                <span style="font-size: 0.7rem;">${u.username || 'Unnamed'}</span>
            </label>`;
        }).join('');

        return `
        <tr>
            <td><input type="checkbox" class="match-checkbox" data-match-id="${m.match_id}" ${isChecked}></td>
            <td><strong>${m.match_name}</strong></td>
            <td>${m.homeName}</td>
            <td>${m.awayName}</td>
            <td>${m.creatorName}</td>
            <td style="position: relative;">
                <div class="admin-assign-toggle" data-match-id="${m.match_id}" style="padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 0.7rem; min-width: 100px; display: flex; justify-content: space-between; align-items: center;">
                    <span class="admin-assign-label" data-match-id="${m.match_id}">${assignedIds.length > 0 ? assignedIds.length + ' assigned' : 'Unassigned'}</span>
                    <span style="font-size: 0.55rem;">▼</span>
                </div>
                <div class="admin-assign-menu" data-match-id="${m.match_id}" style="display: none; position: absolute; z-index: 20; background: var(--bg-main); border: 1px solid var(--border); border-radius: 6px; padding: 8px; max-height: 160px; overflow-y: auto; min-width: 150px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    ${checkboxOptions}
                </div>
            </td>
            <td style="white-space: nowrap;">${date}</td>
            <td><span class="admin-status" style="background: ${sc.bg}; color: ${sc.color};">${m.status}</span></td>
            <td style="text-align: center;">${m.eventCount}</td>
            <td>${m.is_futsal ? 'Futsal' : '11v11'}</td>
            <td style="white-space: nowrap;">
                <button class="dl-btn" data-action="xlsx" data-id="${m.match_id}" data-name="${m.match_name}">XLSX</button>
                <button class="dl-btn" data-action="csv" data-id="${m.match_id}" data-name="${m.match_name}">CSV</button>
            </td>
        </tr>`;
    }).join('');

    // Checkbox event delegation for bulk selection
    tbody.querySelectorAll('.match-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const matchId = e.target.dataset.matchId;
            if (e.target.checked) {
                selectedMatchIds.add(matchId);
            } else {
                selectedMatchIds.delete(matchId);
            }
            updateBulkBar();
        });
    });

    // Toggle assign dropdown menus
    tbody.querySelectorAll('.admin-assign-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const matchId = toggle.dataset.matchId;
            const menu = tbody.querySelector(`.admin-assign-menu[data-match-id="${matchId}"]`);
            tbody.querySelectorAll('.admin-assign-menu').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            e.stopPropagation();
        });
    });

    document.addEventListener('click', () => {
        tbody.querySelectorAll('.admin-assign-menu').forEach(m => m.style.display = 'none');
    });

    // Handle assignment checkbox changes
    tbody.querySelectorAll('.admin-assign-cb').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const matchId = e.target.dataset.matchId;
            const userId = e.target.dataset.userId;

            if (e.target.checked) {
                const { error } = await supabase.from('match_assignments').insert({ match_id: matchId, user_id: userId });
                if (error) {
                    alert('Assignment failed: ' + error.message);
                    e.target.checked = false;
                    return;
                }
                if (!allAssignments[matchId]) allAssignments[matchId] = [];
                allAssignments[matchId].push(userId);
            } else {
                const { error } = await supabase.from('match_assignments').delete().eq('match_id', matchId).eq('user_id', userId);
                if (error) {
                    alert('Unassign failed: ' + error.message);
                    e.target.checked = true;
                    return;
                }
                allAssignments[matchId] = (allAssignments[matchId] || []).filter(id => id !== userId);
            }

            // Update label
            const count = (allAssignments[matchId] || []).length;
            const label = tbody.querySelector(`.admin-assign-label[data-match-id="${matchId}"]`);
            if (label) label.textContent = count > 0 ? count + ' assigned' : 'Unassigned';
        });
    });
}

function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    const count = document.getElementById('bulk-count');
    if (selectedMatchIds.size > 0) {
        bar.style.display = 'flex';
        count.textContent = `${selectedMatchIds.size} selected`;
    } else {
        bar.style.display = 'none';
    }
}

function statusStyle(status) {
    if (status === 'Done') return { bg: 'var(--success)', color: 'white' };
    if (status === 'QC') return { bg: 'var(--warning)', color: 'black' };
    return { bg: 'var(--accent)', color: 'white' };
}

/* ──────────────────────────────────────────
   BULK OPERATIONS
   ────────────────────────────────────────── */
async function bulkChangeStatus(newStatus) {
    if (selectedMatchIds.size === 0) return;
    if (!confirm(`Change ${selectedMatchIds.size} matches to "${newStatus}"?`)) return;

    const ids = [...selectedMatchIds];
    const { error } = await supabase.from('matches').update({ status: newStatus }).in('match_id', ids);
    if (error) {
        alert('Bulk status change failed: ' + error.message);
    } else {
        selectedMatchIds.clear();
        document.getElementById('select-all-matches').checked = false;
        await fetchAdminMatches();
        updateBulkBar();
    }
}

async function bulkExport(format) {
    if (selectedMatchIds.size === 0) return;
    const ids = [...selectedMatchIds];

    for (const id of ids) {
        const match = allMatches.find(m => m.match_id === id);
        if (!match) continue;
        try {
            const enriched = await fetchEnrichedEvents(id);
            if (!enriched || !enriched.length) continue;
            const filename = `Bulk_${match.match_name.replace(/\s+/g, '_')}`;
            if (format === 'xlsx') exportToExcel(enriched, filename);
            else exportToCSV(enriched, filename);
        } catch (err) {
            console.error(`Export failed for ${id}:`, err);
        }
    }
}

async function bulkDelete() {
    if (selectedMatchIds.size === 0) return;
    if (!confirm(`PERMANENTLY DELETE ${selectedMatchIds.size} matches and all their events? This cannot be undone!`)) return;
    if (!confirm(`Are you REALLY sure? Type the number of matches to confirm.`)) return;

    const ids = [...selectedMatchIds];
    for (const id of ids) {
        // Delete events first, then lineups, then match
        await supabase.from('match_events').delete().eq('match_id', id);
        await supabase.from('processed_match_events').delete().eq('match_id', id);
        await supabase.from('lineups').delete().eq('match_id', id);
        await supabase.from('matches').delete().eq('match_id', id);
    }

    selectedMatchIds.clear();
    document.getElementById('select-all-matches').checked = false;
    await fetchAdminMatches();
    updateBulkBar();
    alert(`${ids.length} matches deleted.`);
}

/* ──────────────────────────────────────────
   DOWNLOAD
   ────────────────────────────────────────── */
async function handleMatchAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, id, name } = btn.dataset;
    if (action !== 'xlsx' && action !== 'csv') return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
        const enriched = await fetchEnrichedEvents(id);
        if (!enriched || !enriched.length) {
            alert('No processed data found. Process this match in the QC portal first.');
            return;
        }
        const filename = `Admin_${name.replace(/\s+/g, '_')}`;
        if (action === 'xlsx') exportToExcel(enriched, filename);
        else exportToCSV(enriched, filename);
    } catch (err) {
        alert('Download failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.action.toUpperCase();
    }
}

async function fetchEnrichedEvents(matchId) {
    // Paginated fetch for processed events — Supabase limits to 1000 rows
    let events = [], rangeStart = 0;
    while (true) {
        const { data: page, error } = await supabase.from('processed_match_events').select('*').eq('match_id', matchId).order('match_time_seconds').range(rangeStart, rangeStart + 999);
        if (error) throw error;
        events = events.concat(page || []);
        if (!page || page.length < 1000) break;
        rangeStart += 1000;
    }

    const { data: mdData } = await supabase.from('matches').select('home_team_id, away_team_id').eq('match_id', matchId).single();

    if (!events.length) return null;
    if (!mdData) return events;

    const [plRes, luRes] = await Promise.all([
        supabase.from('players').select('player_id, player_name, team_id, teams(team_name)').in('team_id', [mdData.home_team_id, mdData.away_team_id]),
        supabase.from('lineups').select('player_id, jersey_no').eq('match_id', matchId),
    ]);

    const playerMap = {};
    (plRes.data || []).forEach(p => {
        const lu = (luRes.data || []).find(l => l.player_id === p.player_id);
        playerMap[p.player_id] = {
            player_name: p.player_name,
            jersey_no: lu?.jersey_no ?? '',
            team_name: p.teams?.team_name || '',
        };
    });

    return events.map(e => ({
        ...e,
        act_player_name: playerMap[e.player_id]?.player_name || '',
        act_jersey_no: playerMap[e.player_id]?.jersey_no ?? '',
        act_team_name: playerMap[e.player_id]?.team_name || '',
        react_player_name: playerMap[e.reaction_player_id]?.player_name || '',
        react_jersey_no: playerMap[e.reaction_player_id]?.jersey_no ?? '',
        react_team_name: playerMap[e.reaction_player_id]?.team_name || '',
    }));
}

/* ──────────────────────────────────────────
   ACADEMIES
   ────────────────────────────────────────── */
async function fetchAdminAcademies() {
    const { data, error } = await supabase
        .from('academies')
        .select('academy_id, name, slug, logo_url, created_at')
        .order('name');
    if (error) {
        console.error('Failed to load academies:', error);
        allAcademies = [];
    } else {
        allAcademies = data || [];
    }
    renderAcademiesTable();
}

function renderAcademiesTable() {
    const tbody = document.getElementById('admin-academies-tbody');
    if (!tbody) return;
    if (!allAcademies.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No academies yet. Click + Create Academy to get started.</td></tr>';
        return;
    }

    // Compute analyst + match counts per academy from already-loaded data
    const analystCounts = {};
    const matchCounts = {};
    (allUsers || []).forEach(u => {
        if (u.role === 'analyst' && u.academy_id) {
            analystCounts[u.academy_id] = (analystCounts[u.academy_id] || 0) + 1;
        }
    });
    (allMatches || []).forEach(m => {
        if (m.academy_id) matchCounts[m.academy_id] = (matchCounts[m.academy_id] || 0) + 1;
    });

    tbody.innerHTML = allAcademies.map(a => `
        <tr>
            <td><strong>${a.name}</strong></td>
            <td style="color: var(--text-muted); font-size: 0.75rem;">${a.slug}</td>
            <td style="text-align: center;">${analystCounts[a.academy_id] || 0}</td>
            <td style="text-align: center;">${matchCounts[a.academy_id] || 0}</td>
            <td style="font-size: 0.75rem; color: var(--text-muted);">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '-'}</td>
            <td style="text-align: center; white-space: nowrap;">
                <button class="dl-btn" data-edit-academy="${a.academy_id}">Edit</button>
                <button class="dl-btn" data-delete-academy="${a.academy_id}" style="color: var(--danger); border-color: var(--danger);">Delete</button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('[data-edit-academy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = allAcademies.find(x => x.academy_id === btn.dataset.editAcademy);
            if (a) openAcademyModal(a);
        });
    });
    tbody.querySelectorAll('[data-delete-academy]').forEach(btn => {
        btn.addEventListener('click', () => deleteAcademy(btn.dataset.deleteAcademy));
    });
}

function openAcademyModal(academy) {
    document.getElementById('academy-modal-title').textContent = academy ? 'Edit Academy' : 'Create Academy';
    document.getElementById('academy-modal-id').value = academy?.academy_id || '';
    document.getElementById('academy-modal-name').value = academy?.name || '';
    document.getElementById('academy-modal-slug').value = academy?.slug || '';
    document.getElementById('academy-modal-logo').value = academy?.logo_url || '';
    document.getElementById('academy-modal-error').style.display = 'none';
    document.getElementById('academy-modal').style.display = 'flex';
}

function closeAcademyModal() {
    document.getElementById('academy-modal').style.display = 'none';
}

async function saveAcademyModal() {
    const id = document.getElementById('academy-modal-id').value;
    const name = document.getElementById('academy-modal-name').value.trim();
    const slug = document.getElementById('academy-modal-slug').value.trim().toLowerCase().replace(/\s+/g, '-');
    const logoUrl = document.getElementById('academy-modal-logo').value.trim() || null;
    const errorEl = document.getElementById('academy-modal-error');

    if (!name || !slug) {
        errorEl.textContent = 'Name and slug are required.';
        errorEl.style.display = 'block';
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let result;
    if (id) {
        result = await supabase.from('academies').update({ name, slug, logo_url: logoUrl }).eq('academy_id', id);
    } else {
        result = await supabase.from('academies').insert({ name, slug, logo_url: logoUrl, created_by: user.id });
    }

    if (result.error) {
        errorEl.textContent = result.error.message;
        errorEl.style.display = 'block';
        return;
    }

    closeAcademyModal();
    await fetchAdminAcademies();
    renderAcademiesTable();
}

async function deleteAcademy(academyId) {
    const academy = allAcademies.find(a => a.academy_id === academyId);
    if (!academy) return;

    const attachedAnalysts = (allUsers || []).filter(u => u.academy_id === academyId).length;
    if (attachedAnalysts > 0) {
        alert(`Cannot delete: ${attachedAnalysts} analyst(s) are still assigned to this academy. Move them to another academy first.`);
        return;
    }
    if (!confirm(`Delete academy "${academy.name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('academies').delete().eq('academy_id', academyId);
    if (error) {
        alert('Delete failed: ' + error.message);
        return;
    }
    await fetchAdminAcademies();
    renderAcademiesTable();
}

/* ──────────────────────────────────────────
   ANALYSTS (USERS)
   ────────────────────────────────────────── */
async function fetchAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    const { data: users, error } = await supabase.from('profiles').select('*').order('username');

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 20px; text-align: center; color: var(--danger);">Error: ${error.message}</td></tr>`;
        return;
    }

    allUsers = users || [];

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const academyMap = Object.fromEntries(allAcademies.map(a => [a.academy_id, a.name]));

    tbody.innerHTML = allUsers.map(u => {
        const isMe = u.id === currentUser.id;
        const academyOptions = '<option value="">— Unassigned —</option>'
            + allAcademies.map(a => `<option value="${a.academy_id}" ${u.academy_id === a.academy_id ? 'selected' : ''}>${a.name}</option>`).join('');
        const academyCell = u.role === 'super_admin'
            ? '<span style="color: var(--text-muted); font-size: 0.75rem;">— (super admin)</span>'
            : `<select class="assign-select admin-academy-select" data-user-id="${u.id}">${academyOptions}</select>`;

        return `
            <tr>
                <td><strong>${u.username || 'Unnamed'}</strong></td>
                <td>
                    <span class="admin-status" style="background: ${u.role === 'super_admin' ? 'var(--accent)' : 'var(--hover-bg)'}; color: ${u.role === 'super_admin' ? 'white' : 'var(--text-main)'};">
                        ${(u.role || '').toUpperCase()}
                    </span>
                </td>
                <td>${academyCell}</td>
                <td style="text-align: center;">
                    ${isMe ? '<span style="font-size: 0.75rem; color: var(--text-muted);">You</span>' : ''}
                </td>
            </tr>
        `;
    }).join('');

    // Re-render the academies tab counts now that we have user data
    renderAcademiesTable();

    // Wire academy reassignment dropdowns
    tbody.querySelectorAll('.admin-academy-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const userId = e.target.dataset.userId;
            const newAcademyId = e.target.value || null;
            const { error: upErr } = await supabase
                .from('profiles')
                .update({ academy_id: newAcademyId })
                .eq('id', userId);
            if (upErr) {
                alert('Failed to update academy: ' + upErr.message);
                return;
            }
            const u = allUsers.find(x => x.id === userId);
            if (u) u.academy_id = newAcademyId;
            renderAcademiesTable();
        });
    });
}

function openAnalystModal() {
    if (!allAcademies.length) {
        alert('Create an academy first before creating analysts.');
        return;
    }
    const select = document.getElementById('analyst-modal-academy');
    select.innerHTML = allAcademies.map(a => `<option value="${a.academy_id}">${a.name}</option>`).join('');
    document.getElementById('analyst-modal-email').value = '';
    document.getElementById('analyst-modal-username').value = '';
    document.getElementById('analyst-modal-password').value = '';
    document.getElementById('analyst-modal-error').style.display = 'none';
    document.getElementById('analyst-modal').style.display = 'flex';
}

function closeAnalystModal() {
    document.getElementById('analyst-modal').style.display = 'none';
}

async function saveAnalystModal() {
    const email = document.getElementById('analyst-modal-email').value.trim().toLowerCase();
    const username = document.getElementById('analyst-modal-username').value.trim();
    const password = document.getElementById('analyst-modal-password').value;
    const academyId = document.getElementById('analyst-modal-academy').value;
    const errorEl = document.getElementById('analyst-modal-error');

    if (!email || !username || !password || !academyId) {
        errorEl.textContent = 'All fields are required.';
        errorEl.style.display = 'block';
        return;
    }
    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
    }

    // Save the current super_admin session so we can restore it after signUp
    // (signUp will sign the new user in as a side effect).
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    if (!adminSession) {
        errorEl.textContent = 'Your session expired. Please log in again.';
        errorEl.style.display = 'block';
        return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
    });

    // Restore super_admin session immediately, even if signUp failed
    await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
    });

    if (signUpError || !signUpData?.user) {
        errorEl.textContent = signUpError?.message || 'Failed to create account.';
        errorEl.style.display = 'block';
        return;
    }

    // Upsert the analyst profile (handles both: profile auto-created by trigger, or not)
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: signUpData.user.id,
        username,
        role: 'analyst',
        academy_id: academyId,
    });

    if (profileError) {
        errorEl.textContent = 'Account created but profile update failed: ' + profileError.message;
        errorEl.style.display = 'block';
        return;
    }

    closeAnalystModal();
    await fetchAdminUsers();
    alert(`Analyst "${username}" created. Share the temporary password with them.`);
}

/* ──────────────────────────────────────────
   TEAM MERGE
   ────────────────────────────────────────── */
async function fetchTeamMergeData() {
    const [teamRes, matchRes, playerRes] = await Promise.all([
        supabase.from('teams').select('team_id, team_name').order('team_name'),
        supabase.from('matches').select('home_team_id, away_team_id'),
        supabase.from('players').select('team_id'),
    ]);

    allTeams = teamRes.data || [];
    teamStats = {};
    allTeams.forEach(t => { teamStats[t.team_id] = { matchCount: 0, playerCount: 0 }; });
    (matchRes.data || []).forEach(m => {
        if (teamStats[m.home_team_id]) teamStats[m.home_team_id].matchCount++;
        if (teamStats[m.away_team_id]) teamStats[m.away_team_id].matchCount++;
    });
    (playerRes.data || []).forEach(p => {
        if (teamStats[p.team_id]) teamStats[p.team_id].playerCount++;
    });

    mergeTeamSource = null;
    mergeTeamTarget = null;
    renderTeamMergeLists();
}

function renderTeamMergeLists() {
    const q = (document.getElementById('admin-team-search')?.value || '').toLowerCase();
    const filtered = q ? allTeams.filter(t => t.team_name.toLowerCase().includes(q)) : allTeams;

    const sourceList = document.getElementById('merge-team-source-list');
    const targetList = document.getElementById('merge-team-target-list');

    const buildItems = (selectedId, role) => filtered.map(t => {
        const s = teamStats[t.team_id] || { matchCount: 0, playerCount: 0 };
        return `<div class="merge-item ${selectedId === t.team_id ? 'selected' : ''}" data-merge-role="${role}" data-id="${t.team_id}">
            <strong>${t.team_name}</strong>
            <div class="merge-meta">${s.matchCount} match${s.matchCount !== 1 ? 'es' : ''}, ${s.playerCount} player${s.playerCount !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');

    sourceList.innerHTML = buildItems(mergeTeamSource, 'source') || '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No teams found</div>';
    targetList.innerHTML = buildItems(mergeTeamTarget, 'target') || '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No teams found</div>';

    sourceList.onclick = (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        mergeTeamSource = item.dataset.id;
        renderTeamMergeLists();
        updateTeamMergeSummary();
    };
    targetList.onclick = (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        mergeTeamTarget = item.dataset.id;
        renderTeamMergeLists();
        updateTeamMergeSummary();
    };
}

function updateTeamMergeSummary() {
    const summary = document.getElementById('merge-team-summary');
    const btn = document.getElementById('btn-merge-teams');

    if (mergeTeamSource && mergeTeamTarget && mergeTeamSource !== mergeTeamTarget) {
        const src = allTeams.find(t => t.team_id === mergeTeamSource);
        const tgt = allTeams.find(t => t.team_id === mergeTeamTarget);
        const ss = teamStats[mergeTeamSource] || {};
        summary.innerHTML = `Merge <strong style="color: var(--danger);">${src?.team_name}</strong> (${ss.matchCount || 0} matches, ${ss.playerCount || 0} players) <strong>INTO</strong> <strong style="color: var(--success);">${tgt?.team_name}</strong>`;
        summary.style.display = 'block';
        btn.disabled = false;
    } else {
        summary.style.display = 'none';
        btn.disabled = true;
    }
}

/* ──────────────────────────────────────────
   PLAYER MERGE
   ────────────────────────────────────────── */
async function fetchPlayerMergeData() {
    const playerRes = await supabase.from('players').select('player_id, player_name, team_id, teams(team_name)').order('player_name');

    allPlayers = (playerRes.data || []).map(p => ({
        player_id: p.player_id,
        player_name: p.player_name,
        team_name: p.teams?.team_name || 'No Team',
    }));

    // Paginated fetch — Supabase limits to 1000 rows
    let allEventRows = [], rangeStart = 0;
    while (true) {
        const { data: page } = await supabase.from('match_events').select('player_id, reaction_player_id').range(rangeStart, rangeStart + 999);
        allEventRows = allEventRows.concat(page || []);
        if (!page || page.length < 1000) break;
        rangeStart += 1000;
    }

    playerStats = {};
    allEventRows.forEach(e => {
        if (e.player_id) playerStats[e.player_id] = (playerStats[e.player_id] || 0) + 1;
        if (e.reaction_player_id) playerStats[e.reaction_player_id] = (playerStats[e.reaction_player_id] || 0) + 1;
    });

    mergePlayerSource = null;
    mergePlayerTarget = null;
    renderPlayerMergeLists();
}

function renderPlayerMergeLists() {
    const q = (document.getElementById('admin-player-search')?.value || '').toLowerCase();
    const filtered = q ? allPlayers.filter(p =>
        p.player_name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q)
    ) : allPlayers;

    const sourceList = document.getElementById('merge-player-source-list');
    const targetList = document.getElementById('merge-player-target-list');

    const buildItems = (selectedId, role) => filtered.map(p => {
        const count = playerStats[p.player_id] || 0;
        return `<div class="merge-item ${selectedId === p.player_id ? 'selected' : ''}" data-merge-role="${role}" data-id="${p.player_id}">
            <strong>${p.player_name}</strong>
            <div class="merge-meta">${p.team_name} | ${count} event${count !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');

    sourceList.innerHTML = buildItems(mergePlayerSource, 'source') || '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No players found</div>';
    targetList.innerHTML = buildItems(mergePlayerTarget, 'target') || '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No players found</div>';

    sourceList.onclick = (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        mergePlayerSource = item.dataset.id;
        renderPlayerMergeLists();
        updatePlayerMergeSummary();
    };
    targetList.onclick = (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        mergePlayerTarget = item.dataset.id;
        renderPlayerMergeLists();
        updatePlayerMergeSummary();
    };
}

function updatePlayerMergeSummary() {
    const summary = document.getElementById('merge-player-summary');
    const btn = document.getElementById('btn-merge-players');

    if (mergePlayerSource && mergePlayerTarget && mergePlayerSource !== mergePlayerTarget) {
        const src = allPlayers.find(p => p.player_id === mergePlayerSource);
        const tgt = allPlayers.find(p => p.player_id === mergePlayerTarget);
        const sc = playerStats[mergePlayerSource] || 0;
        summary.innerHTML = `Merge <strong style="color: var(--danger);">${src?.player_name}</strong> (${src?.team_name}, ${sc} events) <strong>INTO</strong> <strong style="color: var(--success);">${tgt?.player_name}</strong>`;
        summary.style.display = 'block';
        btn.disabled = false;
    } else {
        summary.style.display = 'none';
        btn.disabled = true;
    }
}

/* ──────────────────────────────────────────
   MERGE HANDLER
   ────────────────────────────────────────── */
async function handleMerge(type) {
    const isTeam = type === 'teams';
    const sourceId = isTeam ? mergeTeamSource : mergePlayerSource;
    const targetId = isTeam ? mergeTeamTarget : mergePlayerTarget;

    if (!sourceId || !targetId) return;
    if (sourceId === targetId) return alert('Source and Target cannot be the same.');
    if (!confirm(`Are you sure you want to merge these ${type}? This action is permanent and cannot be undone.`)) return;

    const rpcName = isTeam ? 'merge_teams' : 'merge_players';
    const { error } = await supabase.rpc(rpcName, { source_id: sourceId, target_id: targetId });

    if (error) {
        alert(`Merge failed: ${error.message}\n\nMake sure the '${rpcName}' RPC function exists in your Supabase SQL editor.`);
    } else {
        alert('Merge successful!');
        if (isTeam) await fetchTeamMergeData();
        else await fetchPlayerMergeData();
        await fetchAdminMatches();
    }
}

/* ──────────────────────────────────────────
   ACTION FLOW RULES
   ────────────────────────────────────────── */

// All possible actions and their outcomes/types from CAC_LOGIC
const ALL_ACTIONS = Object.keys(CAC_LOGIC);

function buildActionOptions(selected) {
    return ALL_ACTIONS.map(a => `<option value="${a}" ${a === selected ? 'selected' : ''}>${a}</option>`).join('');
}

function buildOutcomeOptions(action, selected) {
    const outcomes = action && CAC_LOGIC[action] ? Object.keys(CAC_LOGIC[action]) : [];
    return `<option value="">—</option>` + outcomes.map(o => `<option value="${o}" ${o === selected ? 'selected' : ''}>${o}</option>`).join('');
}

function buildTypeOptions(action, outcome, selected) {
    const types = (action && outcome && CAC_LOGIC[action]?.[outcome]) || [];
    return `<option value="">—</option>` + types.map(t => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('');
}

const PLAYER_OPTIONS = [
    { value: '', label: '— None (clear)' },
    { value: 'prevAction', label: 'Current Action Player' },
    { value: 'prevReaction', label: 'Current Reaction Player' },
    { value: 'prevReaction_or_prevAction', label: 'Reaction (or Action fallback)' },
];

function buildPlayerOptions(selected) {
    return PLAYER_OPTIONS.map(o => `<option value="${o.value}" ${(selected || '') === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
}

async function fetchFlowRules() {
    const { data, error } = await supabase.from('action_flow_rules').select('*').order('current_action').order('current_outcome').order('current_type');
    if (error) {
        console.error('Failed to fetch flow rules:', error);
        flowRules = [];
    } else {
        flowRules = data || [];
    }
    flowEdits = {};
    renderFlowTable();
}

function renderFlowTable() {
    const tbody = document.getElementById('flow-rules-tbody');
    if (!tbody) return;
    const q = (document.getElementById('flow-search')?.value || '').toLowerCase();

    const filtered = q ? flowRules.filter(r =>
        r.current_action.toLowerCase().includes(q) ||
        (r.current_outcome || '').toLowerCase().includes(q)
    ) : flowRules;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">${q ? 'No matching rules.' : 'No flow rules found. Run the migration to seed them.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const edited = flowEdits[r.id];
        const bg = edited ? 'background: var(--row-selected);' : '';
        return `
        <tr style="${bg}" data-rule-id="${r.id}">
            <td style="font-weight: 600;">${r.current_action}</td>
            <td>${r.current_outcome}</td>
            <td style="color: var(--text-muted);">${r.current_type || '—'}</td>
            <td>
                <select class="flow-edit" data-field="next_action" data-id="${r.id}" style="font-size: 0.7rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit;">
                    ${buildActionOptions(edited?.next_action ?? r.next_action)}
                </select>
            </td>
            <td>
                <select class="flow-edit" data-field="next_outcome" data-id="${r.id}" style="font-size: 0.7rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit;">
                    ${buildOutcomeOptions(edited?.next_action ?? r.next_action, edited?.next_outcome ?? r.next_outcome)}
                </select>
            </td>
            <td>
                <select class="flow-edit" data-field="next_type" data-id="${r.id}" style="font-size: 0.7rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit;">
                    ${buildTypeOptions(edited?.next_action ?? r.next_action, edited?.next_outcome ?? r.next_outcome, edited?.next_type ?? r.next_type)}
                </select>
            </td>
            <td>
                <select class="flow-edit" data-field="next_action_player" data-id="${r.id}" style="font-size: 0.7rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit;">
                    ${buildPlayerOptions(edited?.next_action_player ?? r.next_action_player)}
                </select>
            </td>
            <td>
                <select class="flow-edit" data-field="next_reaction_player" data-id="${r.id}" style="font-size: 0.7rem; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-main); font-family: inherit;">
                    ${buildPlayerOptions(edited?.next_reaction_player ?? r.next_reaction_player)}
                </select>
            </td>
        </tr>`;
    }).join('');

    // Listen for edits
    tbody.querySelectorAll('.flow-edit').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            const field = e.target.dataset.field;
            const value = e.target.value;
            const rule = flowRules.find(r => r.id === id);
            if (!rule) return;

            if (!flowEdits[id]) {
                flowEdits[id] = {
                    next_action: rule.next_action,
                    next_outcome: rule.next_outcome,
                    next_type: rule.next_type,
                    next_action_player: rule.next_action_player,
                    next_reaction_player: rule.next_reaction_player,
                };
            }
            flowEdits[id][field] = value || null;

            // If next_action changed, re-render outcomes/types for this row
            if (field === 'next_action') {
                flowEdits[id].next_outcome = null;
                flowEdits[id].next_type = null;
                renderFlowTable();
            } else if (field === 'next_outcome') {
                flowEdits[id].next_type = null;
                renderFlowTable();
            }

            // Highlight edited row
            const row = tbody.querySelector(`tr[data-rule-id="${id}"]`);
            if (row) row.style.background = 'var(--row-selected)';
        });
    });
}

let pendingFlowEdits = null;

async function handleFlowSave() {
    const editIds = Object.keys(flowEdits);
    if (editIds.length === 0) {
        showFlowStatus('No changes to save.', 'var(--text-muted)');
        return;
    }

    pendingFlowEdits = { ...flowEdits };

    // Show password modal
    document.getElementById('flow-otp-modal').style.display = 'flex';
    document.getElementById('flow-otp-input').value = '';
    document.getElementById('flow-otp-error').style.display = 'none';
    document.getElementById('flow-otp-input').focus();
}

async function handleFlowOTPConfirm() {
    const otpInput = document.getElementById('flow-otp-input');
    const otpError = document.getElementById('flow-otp-error');
    const password = otpInput.value.trim();

    if (!password) {
        otpError.textContent = 'Please enter your password.';
        otpError.style.display = 'block';
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Verify admin password
    const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
    });

    if (verifyError) {
        otpError.textContent = 'Incorrect password. Please try again.';
        otpError.style.display = 'block';
        return;
    }

    // Password verified — save all edits
    document.getElementById('flow-otp-modal').style.display = 'none';
    showFlowStatus('Saving changes...', 'var(--text-muted)');

    let saveCount = 0;
    let errorMsg = null;

    for (const [id, edits] of Object.entries(pendingFlowEdits)) {
        const { error } = await supabase.from('action_flow_rules').update({
            next_action: edits.next_action,
            next_outcome: edits.next_outcome,
            next_type: edits.next_type,
            next_action_player: edits.next_action_player || null,
            next_reaction_player: edits.next_reaction_player || null,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
        }).eq('id', parseInt(id));

        if (error) {
            errorMsg = error.message;
            break;
        }
        saveCount++;
    }

    if (errorMsg) {
        showFlowStatus(`Error after saving ${saveCount} rules: ${errorMsg}`, 'var(--danger)');
    } else {
        showFlowStatus(`Saved ${saveCount} rule(s) successfully!`, 'var(--success)');
        pendingFlowEdits = null;
        await fetchFlowRules();
    }
}

function showFlowStatus(msg, color) {
    const el = document.getElementById('flow-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color;
    el.style.display = 'block';
    if (color === 'var(--success)' || color === 'var(--text-muted)') {
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }
}
