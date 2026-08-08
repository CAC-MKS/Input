import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

export function CreateMatchView() {
    return `
        <div class="fade-in">
            <header class="page-header">
                <h1 class="page-title">Initialize New Match</h1>
                <p class="page-subtitle">Set up match metadata and upload players roster</p>
            </header>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px;">
                <section class="card">
                    <h3 style="margin-bottom: 24px;">Match Metadata</h3>
                    <form id="match-meta-form">
                        <div class="form-group">
                            <label class="form-label">Tournament Name</label>
                            <input type="text" id="tournament-name" class="form-input" required placeholder="e.g. Futsal Champions League 2024">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Match Name / ID</label>
                            <input type="text" id="match-name" class="form-input" required placeholder="e.g. Final: Team A vs Team B">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Match Date</label>
                            <input type="date" id="match-date" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Video Source Type</label>
                            <select id="video-type" class="form-input">
                                <option value="youtube">YouTube URL</option>
                                <option value="local">Local File (Upload later in Tagger)</option>
                            </select>
                        </div>
                        <div class="form-group" id="yt-url-group">
                            <label class="form-label">YouTube URL</label>
                            <input type="url" id="yt-url" class="form-input" placeholder="https://www.youtube.com/watch?v=...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Pitch Format</label>
                            <select id="is-futsal" class="form-input">
                                <option value="true">Futsal (40m x 20m)</option>
                                <option value="false">Standard Football (120m x 80m)</option>
                            </select>
                        </div>
                        <div class="form-group" id="academy-picker-group" style="display: none;">
                            <label class="form-label">Academy</label>
                            <select id="academy-picker" class="form-input">
                                <option value="">Loading academies…</option>
                            </select>
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
                                As super admin you must pick which academy this match belongs to.
                            </div>
                        </div>
                    </form>
                </section>

                <section class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h3 style="margin-bottom: 0;">Roster Upload</h3>
                        <button id="download-template-btn" class="btn btn-ghost" style="width: auto; padding: 4px 12px; font-size: 0.75rem; border: 1px solid var(--border);">📥 Download Template</button>
                    </div>
                    
                    <div id="upload-zone" style="border: 2px dashed var(--border); border-radius: var(--radius-lg); padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
                        <span style="font-size: 2rem; display: block; margin-bottom: 12px;">📄</span>
                        <p style="color: var(--text-muted); margin-bottom: 16px;">Drop CSV/Excel here or click to browse</p>
                        <button class="btn btn-ghost" style="width: auto;">Select File</button>
                        <input type="file" id="roster-file" accept=".csv, .xlsx, .xls" style="display: none;">
                    </div>
                    <div id="upload-status" style="margin-top: 16px; font-size: 0.875rem;"></div>

                    <div style="margin-top: 24px; padding: 16px; background: var(--primary-light); border-radius: 8px; font-size: 0.8125rem; color: var(--text-muted);">
                        <strong style="color: var(--text-main); display: block; margin-bottom: 8px;">How to fill the template:</strong>
                        <ul style="margin-left: 20px; margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
                            <li><strong>Is_home:</strong> Type <code style="background: var(--hover-bg); padding: 2px 4px; border-radius: 3px;">TRUE</code> for the Home team, <code style="background: var(--hover-bg); padding: 2px 4px; border-radius: 3px;">FALSE</code> for Away.</li>
                            <li><strong>Starting_XI:</strong> Type <code style="background: var(--hover-bg); padding: 2px 4px; border-radius: 3px;">TRUE</code> for starters, <code style="background: var(--hover-bg); padding: 2px 4px; border-radius: 3px;">FALSE</code> for bench.</li>
                            <li><strong>Position:</strong> Optional. Use <code style="background: var(--hover-bg); padding: 2px 4px; border-radius: 3px;">GK, DF, MF, FW</code> or leave it blank.</li>
                        </ul>
                    </div>

                    <div id="preview-section" style="display: none; margin-top: 32px;">
                        <h4 style="margin-bottom: 16px;">Roster Preview</h4>
                        <div id="roster-summary" style="display: flex; gap: 16px; margin-bottom: 16px;"></div>
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md);">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.8125rem;">
                                <thead style="background: var(--primary-light); position: sticky; top: 0;">
                                    <tr>
                                        <th style="padding: 8px; text-align: left;">Team</th>
                                        <th style="padding: 8px; text-align: left;">#</th>
                                        <th style="padding: 8px; text-align: left;">Name</th>
                                        <th style="padding: 8px; text-align: left;">Pos</th>
                                        <th style="padding: 8px; text-align: left;">Start?</th>
                                    </tr>
                                </thead>
                                <tbody id="roster-preview-body"></tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>

            <div style="margin-top: 32px; display: flex; justify-content: flex-end;">
                <button id="create-match-btn" class="btn btn-primary" style="width: auto; padding: 12px 48px;" disabled>
                    Initialize Match Session
                </button>
            </div>
        </div>
    `;
}

let parsedRoster = null;
let matchState = {
    tournament: '',
    name: '',
    date: '',
    videoType: 'youtube',
    ytUrl: '',
    isFutsal: 'true'
};

export function initCreateMatch() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('roster-file');
    const videoType = document.getElementById('video-type');
    const ytUrlGroup = document.getElementById('yt-url-group');
    const createBtn = document.getElementById('create-match-btn');
    const templateBtn = document.getElementById('download-template-btn');

    // Setup input elements
    const inputs = {
        tournament: document.getElementById('tournament-name'),
        name: document.getElementById('match-name'),
        date: document.getElementById('match-date'),
        videoType: videoType,
        ytUrl: document.getElementById('yt-url'),
        isFutsal: document.getElementById('is-futsal')
    };

    // Hydrate state
    const today = new Date().toISOString().split('T')[0];
    inputs.tournament.value = matchState.tournament;
    inputs.name.value = matchState.name;
    inputs.date.value = matchState.date || today;
    matchState.date = inputs.date.value; // ensure state stays updated
    
    inputs.videoType.value = matchState.videoType;
    inputs.ytUrl.value = matchState.ytUrl;
    inputs.isFutsal.value = matchState.isFutsal;
    ytUrlGroup.style.display = matchState.videoType === 'youtube' ? 'block' : 'none';

    // Roster Hydration
    if (parsedRoster) {
        document.getElementById('upload-status').innerText = `Successfully loaded ${parsedRoster.length} players.`;
        document.getElementById('upload-status').style.color = 'var(--success)';
        document.getElementById('create-match-btn').disabled = false;
        renderPreview();
    }

    // Bind inputs to state
    Object.keys(inputs).forEach(key => {
        inputs[key].addEventListener('input', (e) => {
            matchState[key] = e.target.value;
        });
    });

    templateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const templateData = [
            ['Team_Name', 'Is_home', 'Jersey_No', 'Player_Name', 'Starting_XI', 'Position', 'Substitution_In_Time', 'Substitution_Off_Time', 'Match_Duration'],
            ['Eagles FC', 'TRUE', '1', 'John Doe', 'TRUE', 'GK', '', '', '90'],
            ['Eagles FC', 'TRUE', '10', 'Jane Smith', 'TRUE', 'FW', '', '', '90'],
            ['Falcons Utd', 'FALSE', '9', 'Mike Johnson', 'TRUE', 'FW', '', '', '90'],
            ['Falcons Utd', 'FALSE', '7', 'Sarah Williams', 'FALSE', 'MF', '60', '90', '90']
        ];
        const ws = XLSX.utils.aoa_to_sheet(templateData);
        ws['!cols'] = [{wch:15}, {wch:10}, {wch:10}, {wch:20}, {wch:10}, {wch:10}, {wch:18}, {wch:18}, {wch:15}];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "CAC_Roster_Template");
        XLSX.writeFile(wb, "CAC_Roster_Template.xlsx");
    });

    videoType.addEventListener('change', () => {
        ytUrlGroup.style.display = videoType.value === 'youtube' ? 'block' : 'none';
        matchState.videoType = videoType.value; // ensure state stays updated
    });

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = 'var(--accent)';
        uploadZone.style.background = 'var(--hover-bg)';
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.style.borderColor = 'var(--border)';
        uploadZone.style.background = 'transparent';
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });

    createBtn.addEventListener('click', handleCreateMatch);

    // Show academy picker for super_admin (they have no default academy)
    initAcademyPicker();
}

async function initAcademyPicker() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        if (profile?.role !== 'super_admin') return;

        const group = document.getElementById('academy-picker-group');
        const select = document.getElementById('academy-picker');
        if (!group || !select) return;

        const { data: academies, error } = await supabase
            .from('academies')
            .select('academy_id, name')
            .order('name');
        if (error) throw error;

        if (!academies || academies.length === 0) {
            select.innerHTML = '<option value="">No academies — create one in the admin portal first</option>';
        } else {
            select.innerHTML = '<option value="">— Select an academy —</option>'
                + academies.map(a => `<option value="${a.academy_id}">${a.name}</option>`).join('');
        }
        group.style.display = 'block';
    } catch (err) {
        console.warn('Academy picker init failed:', err.message);
    }
}

async function handleFile(file) {
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.innerText = 'Parsing file...';
    status.style.color = 'var(--text-muted)';

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet);

        // Validation
        const requiredHeaders = ['Team_Name', 'Is_home', 'Jersey_No', 'Player_Name', 'Starting_XI', 'Position'];
        const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
        
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            throw new Error(`Missing required columns: ${missing.join(', ')}`);
        }

        parsedRoster = json.map(row => ({
            teamName: String(row.Team_Name).trim(),
            isHome: String(row.Is_home).toLowerCase() === 'true' || row.Is_home === 1,
            jerseyNo: String(row.Jersey_No),
            playerName: String(row.Player_Name).trim(),
            startingXI: String(row.Starting_XI).toLowerCase() === 'true' || row.Starting_XI === 1,
            position: row.Position ? String(row.Position).toUpperCase().trim() : null,
            subTimeIn: row.Substitution_In_Time || null,
            subTimeOff: row.Substitution_Off_Time || null,
            duration: row.Match_Duration || null
        }));

        // Position validation: GK, DF, MF, FW, or null
        const invalidPos = parsedRoster.find(p => p.position && !['GK', 'DF', 'MF', 'FW'].includes(p.position));
        if (invalidPos) {
            throw new Error(`Invalid position found: ${invalidPos.position}. Must be GK, DF, MF, FW, or left blank.`);
        }

        renderPreview();
        status.innerText = `Successfully loaded ${parsedRoster.length} players.`;
        status.style.color = 'var(--success)';
        document.getElementById('create-match-btn').disabled = false;

    } catch (err) {
        status.innerText = `Error: ${err.message}`;
        status.style.color = 'var(--danger)';
        parsedRoster = null;
        document.getElementById('create-match-btn').disabled = true;
        document.getElementById('preview-section').style.display = 'none';
    }
}

function renderPreview() {
    const preview = document.getElementById('preview-section');
    const body = document.getElementById('roster-preview-body');
    const summary = document.getElementById('roster-summary');
    
    preview.style.display = 'block';
    body.innerHTML = '';

    const teams = [...new Set(parsedRoster.map(p => p.teamName))];
    summary.innerHTML = teams.map(t => {
        const players = parsedRoster.filter(p => p.teamName === t);
        const xiCount = players.filter(p => p.startingXI).length;
        return `
            <div style="background: var(--primary-light); padding: 8px 12px; border-radius: 6px; font-size: 0.75rem; border: 1px solid var(--border);">
                <strong>${t}</strong>: ${players.length} total (${xiCount} starters)
            </div>
        `;
    }).join('');

    body.innerHTML = parsedRoster.map(p => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px; color: ${p.isHome ? 'var(--accent)' : 'var(--text-main)'}">${p.teamName}</td>
            <td style="padding: 8px;">${p.jerseyNo}</td>
            <td style="padding: 8px; font-weight: 500;">${p.playerName}</td>
            <td style="padding: 8px;"><span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${p.position}</span></td>
            <td style="padding: 8px;">${p.startingXI ? '✅' : '—'}</td>
        </tr>
    `).join('');
}

async function handleCreateMatch() {
    const btn = document.getElementById('create-match-btn');
    const status = document.getElementById('upload-status');
    
    const tournament = document.getElementById('tournament-name').value.trim();
    const name = document.getElementById('match-name').value.trim();
    const date = document.getElementById('match-date').value;
    const videoType = document.getElementById('video-type').value;
    const ytUrl = document.getElementById('yt-url').value.trim();
    const isFutsal = document.getElementById('is-futsal').value === 'true';

    let missing = [];
    if (!tournament) missing.push('Tournament Name');
    if (!name) missing.push('Match Name / ID');
    if (!date) missing.push('Match Date');
    if (videoType === 'youtube' && !ytUrl) missing.push('YouTube URL');

    if (missing.length > 0) {
        alert('Please fill in the following missing metadata:\n- ' + missing.join('\n- '));
        return;
    }

    btn.innerText = 'Initializing Match...';
    btn.disabled = true;

    try {
        const { data: { user } } = await supabase.auth.getUser();

        // Determine which academy this match belongs to:
        //   – analyst: their own profile.academy_id (also auto-stamped by DB trigger)
        //   – super_admin: must pick one from the academy picker
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, academy_id')
            .eq('id', user.id)
            .single();

        let matchAcademyId = profile?.academy_id || null;
        if (profile?.role === 'super_admin') {
            const picker = document.getElementById('academy-picker');
            matchAcademyId = picker?.value || null;
            if (!matchAcademyId) {
                alert('Please select which academy this match belongs to.');
                btn.innerText = 'Initialize Match Session';
                btn.disabled = false;
                return;
            }
        }

        // 1. Create or get tournament (optional optimization, but let's just use text for now or insert into table)
        // For SaaS, we just insert into 'matches' directly which has match_name as meta.

        // 2. Insert Teams (ensure unique by name for this user or global?)
        // The PRD says "Auto-generate teams/players and save to DB".
        // I'll check first if the team exists in the user's scope or global.
        
        const teamsMap = new Map(); // teamName -> teamId
        const teamNames = [...new Set(parsedRoster.map(p => p.teamName))];

        for (const tName of teamNames) {
            // Look up an existing team in the same academy first; if none, create it
            let teamLookup = supabase
                .from('teams')
                .select('team_id')
                .eq('team_name', tName);
            if (matchAcademyId) {
                teamLookup = teamLookup.eq('academy_id', matchAcademyId);
            }
            let { data: team } = await teamLookup.maybeSingle();

            if (!team) {
                const { data: newTeam, error: nErr } = await supabase
                    .from('teams')
                    .insert({ team_name: tName, created_by: user.id, academy_id: matchAcademyId })
                    .select('team_id')
                    .single();
                if (nErr) throw nErr;
                team = newTeam;
            }
            teamsMap.set(tName, team.team_id);
        }

        // 3. Create Match
        const homeTeamName = parsedRoster.find(p => p.isHome)?.teamName || teamNames[0];
        const awayTeamName = teamNames.find(t => t !== homeTeamName) || teamNames[1] || homeTeamName;

        const { data: match, error: mErr } = await supabase
            .from('matches')
            .insert({
                match_name: name,
                tournament_name: tournament,
                match_date: date,
                home_team_id: teamsMap.get(homeTeamName),
                away_team_id: teamsMap.get(awayTeamName),
                is_futsal: isFutsal,
                video_url: videoType === 'youtube' ? ytUrl : null,
                status: 'Doing',
                created_by: user.id,
                academy_id: matchAcademyId,
            })
            .select('match_id')
            .single();

        
        if (mErr) throw mErr;

        // 4. Insert Players & Lineups
        for (const p of parsedRoster) {
            let { data: player, error: pErr } = await supabase
                .from('players')
                .select('player_id')
                .eq('player_name', p.playerName)
                .single();
            
            if (!player) {
                const { data: newPlayer, error: npErr } = await supabase
                    .from('players')
                    .insert({ 
                        player_name: p.playerName, 
                        team_id: teamsMap.get(p.teamName),
                        position: p.position, 
                        created_by: user.id 
                    })
                    .select('player_id')
                    .single();
                if (npErr) throw npErr;
                player = newPlayer;
            }

            const { error: lErr } = await supabase
                .from('lineups')
                .insert({
                    match_id: match.match_id,
                    team_id: teamsMap.get(p.teamName),
                    player_id: player.player_id,
                    jersey_no: p.jerseyNo,
                    position: p.position,
                    starting_xi: p.startingXI,
                    substitution_in_time: p.subTimeIn,
                    substitution_off_time: p.subTimeOff,
                    match_duration: p.duration
                });
            if (lErr) throw lErr;
        }

        status.innerText = 'Match initialized successfully! Redirecting...';
        status.style.color = 'var(--success)';

        setTimeout(() => {
            // Reset state upon successful creation to avoid ghost values on next match
            parsedRoster = null;
            matchState = { tournament: '', name: '', date: '', videoType: 'youtube', ytUrl: '', isFutsal: 'true' };
            window.location.hash = '#matches';
        }, 1500);

    } catch (err) {
        console.error(err);
        status.innerText = `Database Error: ${err.message}`;
        status.style.color = 'var(--danger)';
        btn.innerText = 'Initialize Match Session';
        btn.disabled = false;
    }
}
