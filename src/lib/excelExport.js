import * as XLSX from 'xlsx'

function buildExportRows(data) {
    return data.map(e => ({
        'Half': e.half || '',
        'Minute': e.match_minute ?? '',
        'Time (s)': e.match_time_seconds,
        'Action': e.action,
        'Outcome': e.outcome,
        'Type': e.type || '',
        'Body Part': e.body_part || '',
        'Act Team': e.act_team_name || '',
        'Act Player': e.act_player_name || '',
        'Act Jersey': e.act_jersey_no != null ? Math.round(Number(e.act_jersey_no)) : '',
        'React Team': e.react_team_name || '',
        'React Player': e.react_player_name || '',
        'React Jersey': e.react_jersey_no != null ? Math.round(Number(e.react_jersey_no)) : '',
        'Direction': e.team_direction || 'L2R',
        'Start X': e.start_x,
        'Start Y': e.start_y,
        'End X': e.end_x ?? '',
        'End Y': e.end_y ?? '',
        'End Z': e.end_z ?? '',
        'Pressure': e.pressure_on ? 'Yes' : 'No',
        'Shot Technique': e.shot_technique || '',
        'First Time Shot': e.first_time_shot ?? '',
        'Assist Type': e.assist_type || '',
    }));
}

export function exportToExcel(data, filename) {
    const rows = buildExportRows(data);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Match Events');

    const colCount = Object.keys(rows[0] || {}).length;
    worksheet['!cols'] = Array(colCount).fill({ wch: 15 });

    XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportToCSV(data, filename) {
    const rows = buildExportRows(data);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
