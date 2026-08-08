import { supabase } from '../supabase'
import { exportToExcel } from '../lib/excelExport'
import { VideoEngine } from '../lib/videoEngine'
import { PitchCanvas } from '../lib/pitchCanvas'
import { CAC_LOGIC } from '../lib/cacLogic'

/* ──────────────────────────────────────────
   MODULE STATE
   ────────────────────────────────────────── */
let activeMatch = null;
let activeMatchId = null;
let masterEventsData = [];
let matchPlayers = [];
let dirtyRows = new Set();
let selectedRowId = null;
let activeQuickFilter = null;
let isMatchFutsal = false;
let qcPitch = null;
let qcVideo = null;

/* ──────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────── */
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m > 9 ? m : h ? '0' + m : m || '0', s > 9 ? s : '0' + s].filter(Boolean).join(':');
}

function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    let seconds = 0;
    if (parts.length === 3) seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    else if (parts.length === 2) seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    else if (parts.length === 1) seconds = parseFloat(parts[0]);
    return isNaN(seconds) ? 0 : seconds;
}

function showPopup(msg, title = 'Notification') {
    document.getElementById('qc-popup-title').innerText = title;
    document.getElementById('qc-popup-message').innerText = msg;
    document.getElementById('qc-popup-modal').style.display = 'flex';
}

function showConfirm(msg, title, onConfirm) {
    document.getElementById('qc-confirm-title').innerText = title || 'Confirm Action';
    document.getElementById('qc-confirm-message').innerText = msg;
    document.getElementById('qc-confirm-modal').style.display = 'flex';
    document.getElementById('qc-confirm-yes-btn').onclick = () => {
        document.getElementById('qc-confirm-modal').style.display = 'none';
        if (onConfirm) onConfirm();
    };
}

/* ──────────────────────────────────────────
   HTML TEMPLATE
   ────────────────────────────────────────── */
export function QCPortalView() {
    return `
    <style>
        /* ── QC Scoped Styles (light theme, integrated) ── */
        .qc-table-wrap { max-height: 500px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
        #qc-log-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; white-space: nowrap; font-family: var(--font-mono); }
        #qc-log-table th { padding: 8px; text-align: left; background: var(--primary-light); color: var(--text-muted); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--border); }
        #qc-log-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--text-main); }
        #qc-log-table tr:hover { background: var(--row-hover); }
        #qc-log-table tr.selected { background: var(--row-selected) !important; border-left: 3px solid var(--accent); }
        #qc-log-table td.editable { background: rgba(245, 158, 11, 0.08); cursor: text; }
        #qc-log-table td.editable:focus { background: rgba(245, 158, 11, 0.15); box-shadow: inset 0 0 0 2px var(--accent); outline: none; }
        #qc-log-table td.toggleable { background: rgba(0, 0, 0, 0.04); cursor: pointer; text-align: center; font-weight: 600; }
        #qc-log-table td.toggleable:hover { background: rgba(0, 0, 0, 0.08); }
        .qc-ts-link { color: var(--accent); font-weight: 600; text-decoration: underline; cursor: pointer; }
        .qc-ts-link:hover { color: var(--accent-hover); }

        .qc-quick-btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: 99px; background: transparent; cursor: pointer; font-size: 0.7rem; font-weight: 600; color: var(--text-muted); transition: all 0.2s; font-family: inherit; }
        .qc-quick-btn:hover { background: var(--hover-bg); color: var(--text-main); }
        .qc-quick-btn.active { background: var(--accent); color: white; border-color: var(--accent); box-shadow: 0 2px 8px var(--accent-glow); }

        .qc-badge { padding: 4px 12px; border-radius: 99px; font-weight: 600; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 6px; }
        .qc-badge-done { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .qc-badge-pending { background: var(--hover-bg); color: var(--text-muted); border: 1px solid var(--border); }

        .qc-filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 12px; background: var(--primary-light); border: 1px solid var(--border); border-radius: var(--radius-md); }
        .qc-filter-row select, .qc-filter-row input[type="text"] { padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-main); font-family: inherit; font-size: 0.75rem; min-width: 130px; }
        .qc-filter-row select:focus, .qc-filter-row input[type="text"]:focus { outline: none; border-color: var(--accent); }
        .qc-filter-row label { font-size: 0.75rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 4px; }

        .qc-modal-overlay { display: none; position: fixed; z-index: 3000; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); align-items: center; justify-content: center; }
        .qc-modal-box { background: var(--bg-card); padding: 32px; border-radius: var(--radius-xl); border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(0,0,0,0.15); max-width: 480px; width: 100%; text-align: center; }
        .qc-modal-box h3 { margin: 0 0 12px; font-size: 1.125rem; }
        .qc-modal-box p { color: var(--text-muted); margin-bottom: 24px; white-space: pre-wrap; line-height: 1.5; font-size: 0.875rem; }

        #qc-pitch-canvas { width: 100%; max-width: 480px; aspect-ratio: 3/2; border-radius: var(--radius-sm); cursor: crosshair; }
        #qc-goal-canvas { width: 100%; max-width: 480px; aspect-ratio: 3/1; display: none; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: var(--radius-sm); margin-top: 8px; }
    </style>

    <div class="fade-in" style="height: 100%; display: flex; flex-direction: column;">
        <!-- ── DASHBOARD VIEW ── -->
        <div id="qc-dashboard-view">
            <header class="page-header">
                <h1 class="page-title">Quality Control</h1>
                <p class="page-subtitle">Select a match to review, edit events, and finalize data</p>
            </header>
            <div id="qc-dashboard-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px;">
                <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">Loading matches...</div>
            </div>
        </div>

        <!-- ── APP VIEW (QC CENTER) ── -->
        <div id="qc-app-view" style="display: none; flex: 1; flex-direction: column; gap: 16px;">
            <!-- Header -->
            <header style="display: flex; justify-content: space-between; align-items: center; padding: 0 8px;">
                <div>
                    <h2 id="qc-match-teams" style="margin-bottom: 4px;">Loading Match...</h2>
                    <div id="qc-match-id-badge" style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Match ID: ...</div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <span id="qc-pitch-badge" style="font-size: 0.65rem; font-weight: 700; color: var(--accent); background: rgba(0,0,0,0.06); padding: 4px 10px; border-radius: 99px; border: 1px solid var(--border);">11v11</span>
                    <button id="qc-back-dashboard-btn" class="btn btn-ghost" style="width: auto; padding: 8px 16px;">Back</button>
                </div>
            </header>

            <!-- Main Grid: Video + Pitch -->
            <div style="display: grid; grid-template-columns: 1fr 480px; gap: 16px; min-height: 0;">
                <!-- Left: Video -->
                <div class="card" style="padding: 0; overflow: hidden; position: relative; flex-shrink: 0;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">QC Media Viewer</span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <button id="qc-choose-file-btn" class="btn btn-ghost" style="width: auto; padding: 4px 10px; font-size: 0.7rem;">Load File</button>
                            <input type="text" id="qc-yt-input" placeholder="YouTube URL..." class="form-input" style="width: 180px; padding: 4px 8px; font-size: 0.7rem;">
                            <button id="qc-load-yt-btn" class="btn btn-ghost" style="width: auto; padding: 4px 10px; font-size: 0.7rem;">Load YT</button>
                        </div>
                    </div>
                    <input type="file" id="qc-local-video-input" accept="video/*" style="display: none;">
                    <div id="qc-video-container" style="aspect-ratio: 16/9; background: #000;"></div>
                    <span id="qc-file-name" style="display: none;"></span>
                </div>

                <!-- Right: Pitch + Goal Face -->
                <div class="card" style="padding: 12px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
                    <canvas id="qc-pitch-canvas" width="480" height="320"></canvas>
                    <canvas id="qc-goal-canvas" width="480" height="160"></canvas>
                    <div id="qc-pitch-coords" style="margin-top: 8px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">Start: None | End: None</div>
                    <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 8px; text-align: center; line-height: 1.4;">
                        Select a row to view coordinates. Double-click cells to edit. Double-click Pressure to toggle.
                    </p>
                </div>
            </div>

            <!-- Event Log -->
            <div class="card" style="padding: 16px; display: flex; flex-direction: column; flex: 1; min-height: 400px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h4 style="margin: 0; font-size: 1rem;">Event Log <span id="qc-event-count" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;"></span></h4>
                    <div style="display: flex; gap: 8px;">
                        <button id="qc-reload-btn" class="btn btn-ghost" style="width: auto; padding: 6px 14px; font-size: 0.75rem; border: 1px solid var(--border);">Reload</button>
                        <button id="qc-save-btn" class="btn btn-ghost" style="width: auto; padding: 6px 14px; font-size: 0.75rem; border: 1px solid var(--warning); color: var(--warning);">Save Edits</button>
                    </div>
                </div>

                <!-- Quick Filters -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 12px;">
                    <span style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-right: 4px;">QUICK:</span>
                    <button class="qc-quick-btn" data-filter="Shoot">Shoot</button>
                    <button class="qc-quick-btn" data-filter="Goal">Goal</button>
                    <button class="qc-quick-btn" data-filter="Assist">Assist</button>
                    <button class="qc-quick-btn" data-filter="Key Pass">Key Pass</button>
                    <button class="qc-quick-btn" data-filter="Corner Kick">Corner Kick</button>
                    <button class="qc-quick-btn" data-filter="Save">Save</button>
                    <button class="qc-quick-btn" data-filter="Free Kick">Free Kick</button>
                    <button class="qc-quick-btn" data-filter="Foul">Foul</button>
                    <button class="qc-quick-btn" data-filter="Penalty">Penalty</button>
                </div>

                <!-- Filter Bar -->
                <div class="qc-filter-row" style="margin-bottom: 12px;">
                    <select id="qc-filter-analyst"><option value="">All Analysts</option></select>
                    <select id="qc-filter-action"><option value="">All Actions</option></select>
                    <select id="qc-filter-outcome"><option value="">All Outcomes</option></select>
                    <select id="qc-filter-sub-outcome"><option value="">All Sub Outcomes</option></select>
                    <label><input type="checkbox" id="qc-filter-has-notes"> Notes</label>
                    <input type="text" id="qc-filter-search" placeholder="Search...">
                    <button id="qc-reset-filters-btn" class="btn btn-ghost" style="width: auto; padding: 4px 12px; font-size: 0.7rem;">Reset</button>
                </div>

                <!-- Table -->
                <div class="qc-table-wrap" style="flex: 1;">
                    <table id="qc-log-table">
                        <thead>
                            <tr>
                                <th>Analyst</th><th>Time</th><th>Act Team</th><th>Act Player</th>
                                <th>Re-Act Team</th><th>Re-Act Player</th>
                                <th>Start X</th><th>Start Y</th><th>End X</th><th>End Y</th><th>End Z</th>
                                <th>Action</th><th>Outcome</th><th>Sub Outcome</th><th>Body Part</th>
                                <th>Dir</th><th>Pressure</th><th>Notes</th>
                            </tr>
                        </thead>
                        <tbody id="qc-table-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- Processing Center -->
            <div class="card" style="padding: 20px; border-top: 3px solid var(--warning);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="margin: 0 0 4px;">Data Processing</h4>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Calculate halves, minutes, mirror coordinates, and insert into processed_match_events.</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="qc-process-btn" class="btn btn-primary" style="width: auto; padding: 10px 24px; background: var(--success);">Process & Finalize</button>
                        <button id="qc-export-btn" class="btn btn-ghost" style="width: auto; padding: 10px 24px; border: 1px solid var(--border);" disabled>Export Excel</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── MODALS ── -->
        <div id="qc-popup-modal" class="qc-modal-overlay">
            <div class="qc-modal-box">
                <h3 id="qc-popup-title">Notification</h3>
                <p id="qc-popup-message">Message</p>
                <button class="btn btn-ghost" style="width: auto; padding: 8px 24px; border: 1px solid var(--border);" onclick="document.getElementById('qc-popup-modal').style.display='none'">OK</button>
            </div>
        </div>

        <div id="qc-confirm-modal" class="qc-modal-overlay">
            <div class="qc-modal-box">
                <h3 id="qc-confirm-title">Confirm Action</h3>
                <p id="qc-confirm-message">Are you sure?</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="qc-confirm-yes-btn" class="btn btn-primary" style="width: auto; padding: 8px 24px; background: var(--success);">Yes, Proceed</button>
                    <button class="btn btn-ghost" style="width: auto; padding: 8px 24px; border: 1px solid var(--border);" onclick="document.getElementById('qc-confirm-modal').style.display='none'">Cancel</button>
                </div>
            </div>
        </div>

        <div id="qc-tournament-modal" class="qc-modal-overlay">
            <div class="qc-modal-box" style="max-width: 540px; text-align: left;">
                <h3 style="text-align: center;">Finalize Match Settings</h3>
                <div style="margin-bottom: 20px; padding: 16px; background: var(--primary-light); border: 1px solid var(--border); border-radius: var(--radius-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label style="font-weight: 600; font-size: 0.875rem;">Match Time Offsets (Minutes)</label>
                        <span id="qc-format-display" style="font-size: 0.7rem; font-weight: 600; color: var(--accent); background: rgba(0,0,0,0.06); padding: 3px 8px; border-radius: 99px; border: 1px solid var(--border);">Detected: ---</span>
                    </div>
                    <p style="font-size: 0.7rem; color: var(--text-muted); margin: 0 0 12px;">Customize the starting minute for each period if non-standard half lengths.</p>
                    <div style="display: flex; gap: 12px;">
                        <div style="flex: 1;" id="qc-offset-2nd">
                            <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">2nd Half:</label>
                            <input type="number" id="qc-offset-2nd-val" value="45" class="form-input" style="padding: 8px;">
                        </div>
                        <div style="flex: 1;" id="qc-offset-1et">
                            <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">1st ET:</label>
                            <input type="number" id="qc-offset-1et-val" value="90" class="form-input" style="padding: 8px;">
                        </div>
                        <div style="flex: 1;" id="qc-offset-2et">
                            <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">2nd ET:</label>
                            <input type="number" id="qc-offset-2et-val" value="105" class="form-input" style="padding: 8px;">
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="qc-execute-publish-btn" class="btn btn-primary" style="width: auto; padding: 10px 24px; background: var(--success);">Confirm & Process</button>
                    <button class="btn btn-ghost" style="width: auto; padding: 10px 24px; border: 1px solid var(--border);" onclick="document.getElementById('qc-tournament-modal').style.display='none'">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

/* ──────────────────────────────────────────
   INIT
   ────────────────────────────────────────── */
export async function initQCPortal() {
    activeMatch = null;
    activeMatchId = null;
    masterEventsData = [];
    matchPlayers = [];
    dirtyRows.clear();
    selectedRowId = null;
    activeQuickFilter = null;
    isMatchFutsal = false;
    qcPitch = null;
    qcVideo = null;

    await loadDashboard();
    setupEventListeners();
}

/* ──────────────────────────────────────────
   EVENT LISTENERS
   ────────────────────────────────────────── */
function setupEventListeners() {
    document.getElementById('qc-back-dashboard-btn')?.addEventListener('click', goBackToDashboard);

    // Video
    document.getElementById('qc-choose-file-btn')?.addEventListener('click', () => document.getElementById('qc-local-video-input')?.click());
    document.getElementById('qc-local-video-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && qcVideo) qcVideo.loadLocalFile(file);
    });
    document.getElementById('qc-load-yt-btn')?.addEventListener('click', () => {
        const url = document.getElementById('qc-yt-input')?.value.trim();
        if (url && qcVideo) qcVideo.loadYouTube(url);
    });

    // Cascading filters
    const fAction = document.getElementById('qc-filter-action');
    const fOutcome = document.getElementById('qc-filter-outcome');
    const fSubOutcome = document.getElementById('qc-filter-sub-outcome');

    Object.keys(CAC_LOGIC).forEach(act => fAction.add(new Option(act, act)));

    fAction.addEventListener('change', () => {
        const act = fAction.value;
        fOutcome.innerHTML = '<option value="">All Outcomes</option>';
        fSubOutcome.innerHTML = '<option value="">All Sub Outcomes</option>';
        if (act && CAC_LOGIC[act]) Object.keys(CAC_LOGIC[act]).forEach(out => fOutcome.add(new Option(out, out)));
        renderLogTable();
    });
    fOutcome.addEventListener('change', () => {
        const act = fAction.value, out = fOutcome.value;
        fSubOutcome.innerHTML = '<option value="">All Sub Outcomes</option>';
        if (act && out && CAC_LOGIC[act]?.[out]) CAC_LOGIC[act][out].forEach(sub => fSubOutcome.add(new Option(sub, sub)));
        renderLogTable();
    });
    fSubOutcome.addEventListener('change', renderLogTable);
    document.getElementById('qc-filter-analyst')?.addEventListener('change', renderLogTable);
    document.getElementById('qc-filter-has-notes')?.addEventListener('change', renderLogTable);
    document.getElementById('qc-filter-search')?.addEventListener('input', renderLogTable);
    document.getElementById('qc-reset-filters-btn')?.addEventListener('click', resetFilters);

    // Quick filters
    document.querySelectorAll('.qc-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const f = btn.getAttribute('data-filter');
            activeQuickFilter = activeQuickFilter === f ? null : f;
            document.querySelectorAll('.qc-quick-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === activeQuickFilter));
            renderLogTable();
        });
    });

    // Actions
    document.getElementById('qc-reload-btn')?.addEventListener('click', handleReload);
    document.getElementById('qc-save-btn')?.addEventListener('click', saveLocalEdits);
    document.getElementById('qc-process-btn')?.addEventListener('click', triggerProcessing);
    document.getElementById('qc-export-btn')?.addEventListener('click', handleExportExcel);
}

function resetFilters() {
    document.getElementById('qc-filter-analyst').value = '';
    document.getElementById('qc-filter-action').value = '';
    document.getElementById('qc-filter-outcome').innerHTML = '<option value="">All Outcomes</option>';
    document.getElementById('qc-filter-sub-outcome').innerHTML = '<option value="">All Sub Outcomes</option>';
    document.getElementById('qc-filter-search').value = '';
    document.getElementById('qc-filter-has-notes').checked = false;
    activeQuickFilter = null;
    document.querySelectorAll('.qc-quick-btn').forEach(b => b.classList.remove('active'));
    renderLogTable();
}

/* ──────────────────────────────────────────
   DASHBOARD
   ────────────────────────────────────────── */
async function loadDashboard() {
    document.getElementById('qc-dashboard-view').style.display = 'block';
    document.getElementById('qc-app-view').style.display = 'none';

    const grid = document.getElementById('qc-dashboard-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">Loading matches...</div>';

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: matches, error } = await supabase
            .from('matches')
            .select('*, home_team:teams!home_team_id(team_name), away_team:teams!away_team_id(team_name)')
            .eq('created_by', user.id)
            .in('status', ['QC', 'Done'])
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!matches || matches.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 80px; background: var(--primary-light); border-radius: var(--radius-xl); border: 1px dashed var(--border);">
                    <p style="color: var(--text-muted);">No matches ready for QC. Matches in QC or Done status will appear here.</p>
                </div>`;
            return;
        }

        grid.innerHTML = matches.map(m => {
            const home = m.home_team?.team_name || 'Unknown';
            const away = m.away_team?.team_name || 'Unknown';
            const statusColor = m.status === 'Done' ? 'var(--success)' : 'var(--warning)';
            return `
            <div class="card qc-match-card" data-id="${m.match_id}" style="cursor: pointer; border-top: 4px solid ${statusColor};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="margin-bottom: 4px;">${home} vs ${away}</h4>
                        <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
                            ${m.match_date ? new Date(m.match_date).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'No date'}
                        </div>
                    </div>
                    <span style="background: ${statusColor}; color: white; padding: 3px 10px; border-radius: 99px; font-size: 0.6rem; font-weight: 700; text-transform: uppercase;">${m.status}</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--primary-light); border-radius: var(--radius-md); margin-top: 8px;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 600; font-size: 0.875rem;">${home}</div>
                        <div style="font-size: 0.6rem; color: var(--text-muted);">HOME</div>
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); padding: 0 12px;">VS</div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 600; font-size: 0.875rem;">${away}</div>
                        <div style="font-size: 0.6rem; color: var(--text-muted);">AWAY</div>
                    </div>
                </div>
                ${m.is_futsal ? '<span style="font-size: 0.6rem; color: var(--accent); background: rgba(0,0,0,0.06); padding: 2px 8px; border-radius: 99px; border: 1px solid var(--border); display: inline-block; margin-top: 8px;">Futsal</span>' : ''}
            </div>`;
        }).join('');

        // Attach click handlers
        grid.querySelectorAll('.qc-match-card').forEach(card => {
            const match = matches.find(m => m.match_id === card.dataset.id);
            if (match) card.addEventListener('click', () => openQCCenter(match));
        });
    } catch (err) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--danger);">Error: ${err.message}</div>`;
    }
}

function goBackToDashboard() {
    if (dirtyRows.size > 0) {
        showConfirm('You have unsaved edits. Leave anyway?', 'Unsaved Edits', () => { dirtyRows.clear(); loadDashboard(); });
        return;
    }
    loadDashboard();
}

/* ──────────────────────────────────────────
   OPEN QC CENTER
   ────────────────────────────────────────── */
async function openQCCenter(match) {
    activeMatch = match;
    activeMatchId = match.match_id;
    isMatchFutsal = match.is_futsal || false;
    masterEventsData = [];
    matchPlayers = [];
    dirtyRows.clear();
    selectedRowId = null;

    const home = match.home_team?.team_name || 'Unknown';
    const away = match.away_team?.team_name || 'Unknown';

    document.getElementById('qc-dashboard-view').style.display = 'none';
    const appView = document.getElementById('qc-app-view');
    appView.style.display = 'flex';

    document.getElementById('qc-match-teams').innerText = `${home} vs ${away}`;
    document.getElementById('qc-match-id-badge').innerText = `Match ID: ${activeMatchId.split('-')[0]}...`;
    document.getElementById('qc-pitch-badge').innerText = isMatchFutsal ? 'Futsal 5v5' : 'Standard 11v11';

    const processBtn = document.getElementById('qc-process-btn');
    processBtn.innerText = 'Process & Finalize';
    processBtn.disabled = false;
    processBtn.style.opacity = '1';

    initPitch();

    if (!qcVideo) qcVideo = new VideoEngine('qc-video-container', 'youtube');
    if (match.video_url) {
        document.getElementById('qc-yt-input').value = match.video_url;
        qcVideo.loadYouTube(match.video_url);
    }

    await fetchPlayersForMatch(activeMatchId);
    await loadMatchEvents(activeMatchId);
}

/* ──────────────────────────────────────────
   PITCH & GOAL FACE
   ────────────────────────────────────────── */
function initPitch() {
    qcPitch = new PitchCanvas('qc-pitch-canvas', isMatchFutsal);
}

function drawEventOnPitch(eventObj) {
    if (qcPitch) { qcPitch.startPoint = null; qcPitch.endPoint = null; qcPitch.draw(); }
    const goalCanvas = document.getElementById('qc-goal-canvas');
    if (goalCanvas) goalCanvas.style.display = 'none';
    document.getElementById('qc-pitch-coords').innerText = 'Start: None | End: None';
    if (!eventObj) return;

    const hasStart = eventObj.Start_X != null;
    const hasEnd = eventObj.End_X != null;

    let endStr = hasEnd ? `${eventObj.End_X},${eventObj.End_Y}` : 'None';
    if (eventObj.Action === 'Shoot' && eventObj.End_Z != null) endStr += ` (Z: ${eventObj.End_Z})`;
    document.getElementById('qc-pitch-coords').innerText = `Start: ${hasStart ? eventObj.Start_X + ',' + eventObj.Start_Y : 'None'} | End: ${endStr}`;

    if (qcPitch) {
        if (hasStart) qcPitch.startPoint = { x: parseFloat(eventObj.Start_X), y: parseFloat(eventObj.Start_Y) };
        if (hasEnd) qcPitch.endPoint = { x: parseFloat(eventObj.End_X), y: parseFloat(eventObj.End_Y) };
        qcPitch.draw();
    }
    if (eventObj.Action === 'Shoot') drawGoalFace(eventObj);
}

function drawGoalFace(eventObj) {
    const gc = document.getElementById('qc-goal-canvas');
    if (!gc) return;
    gc.style.display = 'block';
    const ctx = gc.getContext('2d');
    ctx.clearRect(0, 0, gc.width, gc.height);

    const pw = isMatchFutsal ? 20 : 80, gw = isMatchFutsal ? 3 : 7.32, gh = isMatchFutsal ? 2 : 2.44;
    const yC = pw / 2, yMin = yC - gw * 1.5, ySpan = gw * 3, zMax = gh * 1.5;
    const gsx = y => ((y - yMin) / ySpan) * gc.width;
    const gsy = z => gc.height - (z / zMax) * gc.height;

    ctx.fillStyle = 'rgba(16,185,129,0.08)'; ctx.fillRect(0, 0, gc.width, gc.height);

    // Posts + crossbar
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(gsx(yC - gw / 2), gc.height); ctx.lineTo(gsx(yC - gw / 2), gsy(gh));
    ctx.lineTo(gsx(yC + gw / 2), gsy(gh)); ctx.lineTo(gsx(yC + gw / 2), gc.height);
    ctx.stroke();

    // Net
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(gsx(yC - gw / 2 + (gw / 10) * i), gc.height); ctx.lineTo(gsx(yC - gw / 2 + (gw / 10) * i), gsy(gh)); ctx.stroke(); }
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(gsx(yC - gw / 2), gsy((gh / 5) * i)); ctx.lineTo(gsx(yC + gw / 2), gsy((gh / 5) * i)); ctx.stroke(); }

    if (eventObj?.End_Y != null && eventObj?.End_Z != null) {
        const sx = gsx(parseFloat(eventObj.End_Y)), sy = gsy(parseFloat(eventObj.End_Z));
        const isGoal = eventObj.Action_Outcome === 'Goal', isSave = eventObj.Action_Outcome === 'Save';
        ctx.fillStyle = isGoal ? 'var(--success)' : (isSave ? 'var(--accent)' : 'var(--danger)');
        // Can't use CSS vars in canvas, use raw colors
        ctx.fillStyle = isGoal ? '#10b981' : (isSave ? '#3b82f6' : '#ef4444');
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = '11px monospace';
        ctx.fillText(`Z:${eventObj.End_Z} Y:${eventObj.End_Y}`, sx + 10, sy - 8);
    }
}

/* ──────────────────────────────────────────
   DATA LOADING
   ────────────────────────────────────────── */
async function fetchPlayersForMatch(matchId) {
    try {
        const { data: md } = await supabase.from('matches').select('home_team_id, away_team_id').eq('match_id', matchId).single();
        if (!md) return;
        const { data: pd } = await supabase.from('players').select('player_id, player_name, position, team_id, teams(team_name)').in('team_id', [md.home_team_id, md.away_team_id]);
        const { data: ld } = await supabase.from('lineups').select('player_id, jersey_no').eq('match_id', matchId);
        matchPlayers = (pd || []).map(p => {
            const lu = (ld || []).find(l => l.player_id === p.player_id);
            return { player_id: p.player_id, player_name: p.player_name, jersey_no: lu?.jersey_no ?? null, team_name: p.teams?.team_name || 'Unknown', team_id: p.team_id, position: p.position };
        });
    } catch (e) { console.warn('Could not load players', e); }
}

async function loadMatchEvents(matchId) {
    const tbody = document.getElementById('qc-table-body');
    tbody.innerHTML = '';

    try {
        let allEvents = [], fetchMore = true, rangeStart = 0;
        const { data: profiles } = await supabase.from('profiles').select('id, username');
        const pm = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));

        while (fetchMore) {
            const { data, error } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('match_time_seconds', { ascending: true }).range(rangeStart, rangeStart + 999);
            if (error) throw error;
            allEvents = allEvents.concat((data || []).map(d => ({
                Match_Event_ID: d.match_event_id, Match_ID: d.match_id, Analyst_ID: d.analyst_id,
                Analyst_Username: pm[d.analyst_id] || d.analyst_id?.substring(0, 6) || 'N/A',
                Timestamp: formatTime(d.match_time_seconds), Match_Time_Seconds: d.match_time_seconds,
                Action: d.action, Action_Outcome: d.outcome, Sub_Action_Outcome: d.type,
                Body_Part: d.body_part, Pressure_On: d.pressure_on ? 'Yes' : 'No',
                Start_X: d.start_x, Start_Y: d.start_y, End_X: d.end_x, End_Y: d.end_y, End_Z: d.end_z,
                Team_Direction: d.team_direction, Notes: d.notes,
                Player_ID: d.player_id, Reaction_Player_ID: d.reaction_player_id, Is_Futsal: d.is_futsal,
                Shot_Technique: d.shot_technique, First_Time_Shot: d.first_time_shot, Assist_Type: d.assist_type
            })));
            if (!data || data.length < 1000) fetchMore = false;
            rangeStart += 1000;
        }

        masterEventsData = allEvents;
        if (masterEventsData.length > 0) isMatchFutsal = masterEventsData[0].Is_Futsal === true;
        document.getElementById('qc-pitch-badge').innerText = isMatchFutsal ? 'Futsal 5v5' : 'Standard 11v11';
        initPitch();
        populateAnalystFilter();
        renderLogTable();
        document.getElementById('qc-export-btn').disabled = activeMatch?.status !== 'Done';
    } catch (err) { showPopup('Error fetching events: ' + err.message, 'Database Error'); }
}

function populateAnalystFilter() {
    const f = document.getElementById('qc-filter-analyst');
    const set = new Set();
    masterEventsData.forEach(e => { if (e.Analyst_Username && e.Action !== 'Match Time') set.add(e.Analyst_Username); });
    f.innerHTML = '<option value="">All Analysts</option>';
    [...set].sort().forEach(x => f.add(new Option(x, x)));
}

/* ──────────────────────────────────────────
   TABLE RENDERING
   ────────────────────────────────────────── */
function renderLogTable() {
    const tbody = document.getElementById('qc-table-body');
    tbody.innerHTML = '';

    const fA = document.getElementById('qc-filter-analyst').value;
    const fAct = document.getElementById('qc-filter-action').value;
    const fOut = document.getElementById('qc-filter-outcome').value;
    const fSub = document.getElementById('qc-filter-sub-outcome').value;
    const fS = document.getElementById('qc-filter-search').value.toLowerCase();
    const fN = document.getElementById('qc-filter-has-notes').checked;

    let count = 0;

    masterEventsData.forEach(ev => {
        // Quick filter
        if (activeQuickFilter) {
            let m = false;
            const a = ev.Action || '', o = ev.Action_Outcome || '', s = ev.Sub_Action_Outcome || '';
            switch (activeQuickFilter) {
                case 'Shoot': m = a === 'Shoot'; break;
                case 'Goal': m = o === 'Goal' || s === 'Own Goal' || o === 'Own Goal'; break;
                case 'Assist': m = o === 'Assist' || s === 'Assist'; break;
                case 'Key Pass': m = o === 'Key Pass' || s === 'Key Pass'; break;
                case 'Corner Kick': m = o === 'Corner Kick' || s === 'Corner Kick'; break;
                case 'Save': m = a === 'Save' || o === 'Save' || s === 'Save'; break;
                case 'Free Kick': m = a === 'Free Kick' || o === 'Free Kick' || s === 'Free Kick'; break;
                case 'Foul': m = o.includes('Foul') || s.includes('Foul'); break;
                case 'Penalty': m = o.includes('Penalty') || s.includes('Penalty'); break;
            }
            if (!m) return;
        }

        if (fA && ev.Analyst_Username !== fA && ev.Action !== 'Match Time') return;
        if (fAct && ev.Action !== fAct) return;
        if (fOut && ev.Action_Outcome !== fOut) return;
        if (fSub && ev.Sub_Action_Outcome !== fSub) return;
        if (fN && (!ev.Notes || !ev.Notes.trim())) return;
        if (fS) {
            const haystack = `${ev.Notes || ''} ${getPlayerName(ev.Player_ID)} ${ev.Action || ''} ${ev.Action_Outcome || ''}`.toLowerCase();
            if (!haystack.includes(fS)) return;
        }

        count++;
        const tr = document.createElement('tr');
        if (selectedRowId === ev.Match_Event_ID) tr.classList.add('selected');
        if (dirtyRows.has(ev.Match_Event_ID)) tr.style.borderLeft = '3px solid var(--warning)';

        tr.onclick = e => {
            if (e.target.contentEditable === 'true' || e.target.classList.contains('toggleable') || e.target.tagName === 'SELECT') return;
            document.querySelectorAll('#qc-table-body tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            selectedRowId = ev.Match_Event_ID;
            drawEventOnPitch(ev);
        };

        let pTeam = '-', pInfo = '-', rTeam = '-', rInfo = '-';
        if (matchPlayers.length) {
            const p1 = matchPlayers.find(p => p.player_id === ev.Player_ID);
            if (p1) { pTeam = p1.team_name; pInfo = (p1.jersey_no != null ? `#${p1.jersey_no} ` : '') + p1.player_name; }
            const p2 = matchPlayers.find(p => p.player_id === ev.Reaction_Player_ID);
            if (p2) { rTeam = p2.team_name; rInfo = (p2.jersey_no != null ? `#${p2.jersey_no} ` : '') + p2.player_name; }
        }

        const cols = [
            { k: 'Analyst_Username', v: ev.Analyst_Username, e: false },
            { k: 'Timestamp', v: ev.Timestamp, e: false },
            { k: 'Player_Team', v: pTeam, e: false },
            { k: 'Player_Jersey', v: pInfo, e: 'p1' },
            { k: 'Reaction_Player_Team', v: rTeam, e: false },
            { k: 'Reaction_Player_Jersey', v: rInfo, e: 'p2' },
            { k: 'Start_X', v: ev.Start_X, e: true },
            { k: 'Start_Y', v: ev.Start_Y, e: true },
            { k: 'End_X', v: ev.End_X, e: true },
            { k: 'End_Y', v: ev.End_Y, e: true },
            { k: 'End_Z', v: ev.End_Z, e: true },
            { k: 'Action', v: ev.Action, e: true },
            { k: 'Action_Outcome', v: ev.Action_Outcome, e: true },
            { k: 'Sub_Action_Outcome', v: ev.Sub_Action_Outcome, e: true },
            { k: 'Body_Part', v: ev.Body_Part, e: true },
            { k: 'Team_Direction', v: ev.Team_Direction, e: false },
            { k: 'Pressure_On', v: ev.Pressure_On, e: 'toggle' },
            { k: 'Notes', v: ev.Notes, e: true }
        ];

        cols.forEach(c => {
            const td = document.createElement('td');
            td.innerText = c.v != null ? c.v : '';

            if (c.k === 'Timestamp' && c.v) {
                td.className = 'qc-ts-link';
                td.title = 'Seek video to 5s before';
                td.onclick = e => { e.stopPropagation(); seekVideoTo(c.v); };
            }

            if (c.e === true) {
                td.classList.add('editable');
                td.ondblclick = () => { td.contentEditable = 'true'; td.focus(); };
                td.onkeypress = e => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } };
                td.onblur = () => {
                    td.contentEditable = 'false';
                    let nv = td.innerText.trim();
                    if (['Start_X', 'Start_Y', 'End_X', 'End_Y', 'End_Z'].includes(c.k)) { nv = nv === '' ? null : parseFloat(nv); if (isNaN(nv)) nv = null; }
                    else { if (nv === '') nv = null; }
                    const idx = masterEventsData.findIndex(x => x.Match_Event_ID === ev.Match_Event_ID);
                    if (idx !== -1 && masterEventsData[idx][c.k] !== nv) {
                        masterEventsData[idx][c.k] = nv;
                        dirtyRows.add(ev.Match_Event_ID);
                        tr.style.borderLeft = '3px solid var(--warning)';
                    }
                };
            } else if (c.e === 'toggle') {
                td.classList.add('toggleable');
                td.title = 'Double-click to toggle';
                td.ondblclick = () => {
                    const nv = td.innerText === 'Yes' ? 'No' : 'Yes';
                    td.innerText = nv;
                    const idx = masterEventsData.findIndex(x => x.Match_Event_ID === ev.Match_Event_ID);
                    if (idx !== -1) { masterEventsData[idx][c.k] = nv; dirtyRows.add(ev.Match_Event_ID); tr.style.borderLeft = '3px solid var(--warning)'; }
                };
            } else if (c.e === 'p1' || c.e === 'p2') {
                td.classList.add('editable');
                td.title = 'Double-click to change player';
                td.ondblclick = () => {
                    if (td.querySelector('select')) return;
                    const isR = c.e === 'p2';
                    const curId = isR ? ev.Reaction_Player_ID : ev.Player_ID;
                    const sel = document.createElement('select');
                    Object.assign(sel.style, { width: '100%', padding: '2px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--accent)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '0.7rem' });
                    if (isR) sel.add(new Option('None', ''));
                    matchPlayers.forEach(p => {
                        const lbl = `${p.team_name} - ${p.jersey_no != null ? '#' + p.jersey_no + ' ' : ''}${p.player_name}`;
                        const o = new Option(lbl, p.player_id);
                        if (p.player_id === curId) o.selected = true;
                        sel.add(o);
                    });
                    td.innerHTML = ''; td.appendChild(sel); sel.focus();
                    const done = () => {
                        const nid = sel.value === '' ? null : sel.value;
                        const dk = isR ? 'Reaction_Player_ID' : 'Player_ID';
                        const idx = masterEventsData.findIndex(x => x.Match_Event_ID === ev.Match_Event_ID);
                        if (idx !== -1 && masterEventsData[idx][dk] !== nid) { masterEventsData[idx][dk] = nid; dirtyRows.add(ev.Match_Event_ID); }
                        renderLogTable();
                    };
                    sel.onblur = done; sel.onchange = done;
                };
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    document.getElementById('qc-event-count').innerText = `(${count} events)`;
}

function getPlayerName(id) {
    if (!id || !matchPlayers.length) return '';
    return matchPlayers.find(p => p.player_id === id)?.player_name || '';
}

/* ──────────────────────────────────────────
   VIDEO SEEKING
   ────────────────────────────────────────── */
function seekVideoTo(ts) {
    if (!qcVideo) return;
    qcVideo.seek(Math.max(0, timeToSeconds(ts) - 5));
    qcVideo.play();
}

/* ──────────────────────────────────────────
   SAVE EDITS
   ────────────────────────────────────────── */
async function saveLocalEdits() {
    if (dirtyRows.size === 0) return showPopup('No edits to save.');
    const promises = Array.from(dirtyRows).map(id => {
        const e = masterEventsData.find(x => x.Match_Event_ID === id);
        if (!e) return Promise.resolve();
        return supabase.from('match_events').update({
            action: e.Action, outcome: e.Action_Outcome, type: e.Sub_Action_Outcome,
            body_part: e.Body_Part, pressure_on: e.Pressure_On === 'Yes',
            start_x: e.Start_X, start_y: e.Start_Y, end_x: e.End_X, end_y: e.End_Y, end_z: e.End_Z,
            player_id: e.Player_ID, reaction_player_id: e.Reaction_Player_ID, notes: e.Notes
        }).eq('match_event_id', e.Match_Event_ID);
    });
    try {
        await Promise.all(promises);
        dirtyRows.clear(); renderLogTable();
        showPopup('Changes saved successfully.', 'Success');
    } catch (err) { showPopup('Save failed: ' + err.message, 'Error'); }
}

/* ──────────────────────────────────────────
   RELOAD
   ────────────────────────────────────────── */
async function handleReload() {
    if (!activeMatchId) return;
    if (dirtyRows.size > 0) {
        showConfirm('Unsaved edits will be lost. Reload?', 'Discard Edits', async () => { dirtyRows.clear(); await loadMatchEvents(activeMatchId); showPopup('Data reloaded.', 'Done'); });
    } else { await loadMatchEvents(activeMatchId); showPopup('Data reloaded.', 'Done'); }
}

/* ──────────────────────────────────────────
   PROCESSING PIPELINE
   ────────────────────────────────────────── */
function triggerProcessing() {
    if (!activeMatchId) return;
    if (!masterEventsData.length) return showPopup('No events to process.');
    if (dirtyRows.size > 0) return showPopup("Save edits before processing.");

    const sorted = [...masterEventsData].sort((a, b) => timeToSeconds(a.Timestamp) - timeToSeconds(b.Timestamp));
    const endEv = sorted.slice().reverse().find(e => e.Action === 'Match Time' && e.Sub_Action_Outcome === 'Match End');
    if (!endEv) return showPopup("Missing 'Match End' event. Ensure the tagger logged a Match Time -> [Period] -> Match End event.", 'Error');

    const lp = endEv.Action_Outcome;
    const c2 = document.getElementById('qc-offset-2nd'), c1e = document.getElementById('qc-offset-1et'), c2e = document.getElementById('qc-offset-2et');
    const fd = document.getElementById('qc-format-display');
    c2.style.display = c1e.style.display = c2e.style.display = 'none';

    if (lp === '1st Half') fd.innerText = 'Single Half';
    else if (lp === '2nd Half') { fd.innerText = 'Standard 2 Halves'; c2.style.display = 'block'; }
    else if (lp === '1st Extra Time') { fd.innerText = 'Ended in 1st ET'; c2.style.display = c1e.style.display = 'block'; }
    else { fd.innerText = `Full ET (${lp})`; c2.style.display = c1e.style.display = c2e.style.display = 'block'; }

    document.getElementById('qc-tournament-modal').style.display = 'flex';
    document.getElementById('qc-execute-publish-btn').onclick = () => executeProcessing();
}

async function executeProcessing() {
    const o2 = parseInt(document.getElementById('qc-offset-2nd-val').value) || 45;
    const o1e = parseInt(document.getElementById('qc-offset-1et-val').value) || 90;
    const o2e = parseInt(document.getElementById('qc-offset-2et-val').value) || 105;
    document.getElementById('qc-tournament-modal').style.display = 'none';

    const btn = document.getElementById('qc-process-btn');
    const orig = btn.innerText;
    btn.innerText = 'Processing...'; btn.disabled = true; btn.style.opacity = '0.6';

    let df = JSON.parse(JSON.stringify(masterEventsData));
    try {
        df.sort((a, b) => timeToSeconds(a.Timestamp) - timeToSeconds(b.Timestamp));
        let curHalf = null, koTimes = {};
        const offsets = { '1st Half': 0, '2nd Half': o2, '1st Extra Time': o1e, '2nd Extra Time': o2e };
        const pLen = isMatchFutsal ? 40 : 120, pWid = isMatchFutsal ? 20 : 80;

        // Pass 1: Halves
        df.forEach(r => {
            if (r.Action === 'Match Time' && r.Sub_Action_Outcome === 'Kick-Off') { curHalf = r.Action_Outcome; if (!koTimes[curHalf]) koTimes[curHalf] = timeToSeconds(r.Timestamp); }
            else if (r.Action === 'Match Time' && r.Action_Outcome === 'Penalty shootout') curHalf = 'Penalty shootout';
            r.Half = curHalf;
            if (r.Action === 'Match Time' && (r.Sub_Action_Outcome === 'Half Break' || r.Sub_Action_Outcome === 'Match End')) curHalf = null;
        });

        // Pass 2: Build payloads
        const payloads = df.map(r => {
            let min = null;
            if (r.Half && r.Half !== 'Penalty shootout' && koTimes[r.Half] != null) {
                min = Math.round((timeToSeconds(r.Timestamp) - koTimes[r.Half]) / 60) + offsets[r.Half];
            }
            let sx = r.Start_X != null ? parseFloat(r.Start_X) : null, sy = r.Start_Y != null ? parseFloat(r.Start_Y) : null;
            let ex = r.End_X != null ? parseFloat(r.End_X) : null, ey = r.End_Y != null ? parseFloat(r.End_Y) : null;
            let ez = r.End_Z != null ? parseFloat(r.End_Z) : null;
            if (r.Team_Direction === 'R2L' && r.Half !== 'Penalty shootout') {
                if (sx != null) sx = pLen - sx; if (ex != null) ex = pLen - ex;
                if (sy != null) sy = pWid - sy; if (ey != null) ey = pWid - ey;
            }
            return {
                match_event_id: r.Match_Event_ID, match_id: activeMatchId,
                half: r.Half || null, match_minute: min, match_time_seconds: timeToSeconds(r.Timestamp),
                start_x: sx, start_y: sy, end_x: ex, end_y: ey, end_z: ez,
                team_direction: 'L2R',
                action: r.Action || 'Unknown', outcome: r.Action_Outcome || 'Unknown',
                type: r.Sub_Action_Outcome || null, body_part: r.Body_Part || null,
                player_id: r.Player_ID, reaction_player_id: r.Reaction_Player_ID || null,
                is_futsal: isMatchFutsal, pressure_on: r.Pressure_On === 'Yes',
                shot_technique: r.Shot_Technique || null,
                first_time_shot: r.First_Time_Shot != null ? parseInt(r.First_Time_Shot) : null,
                assist_type: r.Assist_Type || null
            };
        });

        await supabase.from('processed_match_events').delete().eq('match_id', activeMatchId);
        for (let i = 0; i < payloads.length; i += 1000) {
            const { error } = await supabase.from('processed_match_events').insert(payloads.slice(i, i + 1000));
            if (error) throw error;
        }
        const { error: ue } = await supabase.from('matches').update({ status: 'Done' }).eq('match_id', activeMatchId);
        if (ue) throw ue;

        activeMatch.status = 'Done';
        document.getElementById('qc-export-btn').disabled = false;
        btn.innerText = 'Finalized';
        showPopup('Processing complete. Data inserted into processed_match_events.', 'Success');
    } catch (err) {
        btn.innerText = orig; btn.disabled = false; btn.style.opacity = '1';
        showPopup('Processing error: ' + err.message, 'Error');
        console.error(err);
    }
}

/* ──────────────────────────────────────────
   EXCEL EXPORT
   ────────────────────────────────────────── */
async function handleExportExcel() {
    if (!activeMatch) return;
    try {
        // Paginated fetch — Supabase limits to 1000 rows per request
        let data = [], rangeStart = 0;
        while (true) {
            const { data: page, error: pgErr } = await supabase.from('processed_match_events').select('*').eq('match_id', activeMatch.match_id).order('match_time_seconds', { ascending: true }).range(rangeStart, rangeStart + 999);
            if (pgErr) throw pgErr;
            data = data.concat(page || []);
            if (!page || page.length < 1000) break;
            rangeStart += 1000;
        }
        if (!data.length) return showPopup('No processed data. Run Process & Finalize first.', 'Error');

        // Ensure we have player data loaded
        if (!matchPlayers.length) await fetchPlayersForMatch(activeMatch.match_id);

        // Build player lookup map: id -> { player_name, jersey_no, team_name }
        const playerMap = Object.fromEntries(matchPlayers.map(p => [p.player_id, p]));

        // Enrich data with player names, jersey numbers, team names
        const enriched = data.map(e => {
            const actPlayer = playerMap[e.player_id];
            const reactPlayer = e.reaction_player_id ? playerMap[e.reaction_player_id] : null;
            return {
                ...e,
                act_player_name: actPlayer?.player_name || '',
                act_jersey_no: actPlayer?.jersey_no ?? '',
                act_team_name: actPlayer?.team_name || '',
                react_player_name: reactPlayer?.player_name || '',
                react_jersey_no: reactPlayer?.jersey_no ?? '',
                react_team_name: reactPlayer?.team_name || ''
            };
        });

        const home = activeMatch.home_team?.team_name || 'Home';
        const away = activeMatch.away_team?.team_name || 'Away';
        const filename = `QC_${home}_vs_${away}`;
        exportToExcel(enriched, filename);
        showPopup('Excel report generated.', 'Success');
    } catch (err) { showPopup('Export failed: ' + err.message, 'Error'); }
}
