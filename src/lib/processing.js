export function processMatchEvents(events, isFutsal) {
    const processed = [];
    let currentPeriod = "1st Half";
    
    // Pitch dimensions
    const pitchLen = isFutsal ? 40 : 120;
    const pitchWid = isFutsal ? 20 : 80;
    const goalWid = isFutsal ? 3 : 7.32;

    // Sort events by time
    const sortedEvents = [...events].sort((a, b) => a.match_time_seconds - b.match_time_seconds);

    sortedEvents.forEach(e => {
        // Period assignment
        if (e.action === "Match Time") {
            if (e.outcome === "1st Half") currentPeriod = "1st Half";
            if (e.outcome === "2nd Half") currentPeriod = "2nd Half";
        }

        const pEvent = { ...e };
        pEvent.period = currentPeriod;
        pEvent.match_minute = Math.floor(e.match_time_seconds / 60) + 1;

        // Pass Distance
        if (e.start_x !== null && e.end_x !== null) {
            const dx = e.end_x - e.start_x;
            const dy = e.end_y - e.start_y;
            pEvent.distance = Math.round(Math.sqrt(dx*dx + dy*dy) * 100) / 100;
        } else {
            pEvent.distance = null;
        }

        // xG Calculation (Legacy Logistic Regression Model)
        if (e.action === "Shoot") {
            pEvent.xg = calculateXG(
                e.start_x, 
                e.start_y, 
                e.body_part, 
                isFutsal, 
                pitchLen, 
                pitchWid, 
                goalWid, 
                e.type, 
                e.pressure_on
            );
        } else {
            pEvent.xg = null;
        }

        processed.push(pEvent);
    });

    return processed;
}

function calculateXG(x, y, bodyPart, isFutsal, pitchLen, pitchWid, goalWid, subOutcome, pressureOn) {
    if (x === null || y === null) return null;

    // --- STATIC OVERRIDES ---
    if (subOutcome === 'Penalty') {
        return isFutsal ? 0.750 : 0.780;
    }
    if (subOutcome === 'Free Kick') {
        return isFutsal ? 0.090 : 0.060;
    }

    // Goal is at X=pitchLen, Y=pitchWid/2 (Standardized for calculation)
    const goalX = pitchLen;
    const goalY = pitchWid / 2;
    
    const distance = Math.sqrt(Math.pow(goalX - x, 2) + Math.pow(goalY - y, 2));
    
    const post1Y = goalY - (goalWid / 2);
    const post2Y = goalY + (goalWid / 2);
    
    const distPost1Sq = Math.pow(goalX - x, 2) + Math.pow(post1Y - y, 2);
    const distPost2Sq = Math.pow(goalX - x, 2) + Math.pow(post2Y - y, 2);
    const goalWidSq = Math.pow(goalWid, 2);
    
    let angleCos = (distPost1Sq + distPost2Sq - goalWidSq) / (2 * Math.sqrt(distPost1Sq) * Math.sqrt(distPost2Sq));
    angleCos = Math.max(-1, Math.min(1, angleCos)); 
    const angle = Math.acos(angleCos);

    // Logistic Regression Coefficients
    let intercept = isFutsal ? -1.5 : -2.85;
    let coefDist = isFutsal ? -0.25 : -0.146;
    let coefAngle = isFutsal ? 1.5 : 2.72;
    
    if (bodyPart === 'Head') intercept -= 0.8;
    else if (bodyPart === 'Other') intercept -= 1.0;

    if (pressureOn) intercept -= 0.6;

    const logit = intercept + (coefDist * distance) + (coefAngle * angle);
    let xg = 1 / (1 + Math.exp(-logit));
    
    return parseFloat(Math.max(0.01, Math.min(0.99, xg)).toFixed(3));
}
