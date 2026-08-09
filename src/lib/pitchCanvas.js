export class PitchCanvas {
    constructor(canvasId, isFutsal = true) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.isFutsal = isFutsal;
        this.updateConfig();

        this.startPoint = null;
        this.endPoint = null;
        this.allowEndPoint = true;
        this.onCoordsChange = null;

        this.canvas.addEventListener('click', (e) => this.handleClick(e));
    }

    updateConfig() {
        if (this.isFutsal) {
            this.config = { type: 'futsal', maxX: 40, maxY: 20, goalWidth: 3.0, goalHeight: 2.0 };
        } else {
            this.config = { type: 'standard', maxX: 120, maxY: 80, goalWidth: 7.32, goalHeight: 2.44 };
        }
        this.draw();
    }

    // Fixed pitch styling (navy pitch, white lines, red goals, green
    // centre spot) — independent of the app's light/dark theme toggle,
    // matching the reference tagging tool's look.
    getColors() {
        return {
            bg: '#16213e',
            field: '#16213e',
            lines: 'rgba(255,255,255,0.85)',
            goal: '#ef4444',
            spot: '#ffffff',
            grid: 'rgba(255,255,255,0.06)',
            start: '#4ade80',
            end: '#f87171',
            dashLine: 'rgba(255,255,255,0.5)',
        };
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const internalX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const internalY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

        const padX = this.config.maxX * 0.05;
        const padY = this.config.maxY * 0.05;

        // Calculate pitch coordinates precise to 2 decimal places
        let pitchX = Math.round(Math.max(0, Math.min(((internalX / this.canvas.width) * (this.config.maxX + 2 * padX)) - padX, this.config.maxX)) * 100) / 100;
        let pitchY = Math.round(Math.max(0, Math.min((((this.canvas.height - internalY) / this.canvas.height) * (this.config.maxY + 2 * padY)) - padY, this.config.maxY)) * 100) / 100;

        if (!this.startPoint || (this.startPoint && this.endPoint) || (this.startPoint && !this.allowEndPoint)) {
            this.startPoint = { x: pitchX, y: pitchY };
            this.endPoint = null;
        } else {
            this.endPoint = { x: pitchX, y: pitchY };
        }

        this.draw();
        if (this.onCoordsChange) this.onCoordsChange(this.startPoint, this.endPoint, e);
    }

    draw() {
        const ctx = this.ctx;
        const p = this.config;
        const padX = p.maxX * 0.05;
        const padY = p.maxY * 0.05;
        const c = this.getColors();

        const sx = (x) => (x + padX) * (this.canvas.width / (p.maxX + 2 * padX));
        const sy = (y) => this.canvas.height - ((y + padY) * (this.canvas.height / (p.maxY + 2 * padY)));

        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = c.field;
        ctx.fillRect(sx(0), sy(p.maxY), sx(p.maxX) - sx(0), sy(0) - sy(p.maxY));

        // Subtle dot-grid texture across the pitch
        ctx.fillStyle = c.grid;
        const gridStep = p.type === 'standard' ? 5 : 2;
        for (let gx = gridStep; gx < p.maxX; gx += gridStep) {
            for (let gy = gridStep; gy < p.maxY; gy += gridStep) {
                ctx.beginPath();
                ctx.arc(sx(gx), sy(gy), 1.2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        ctx.strokeStyle = c.lines;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx(0), sy(p.maxY), sx(p.maxX) - sx(0), sy(0) - sy(p.maxY));

        ctx.beginPath();
        ctx.moveTo(sx(p.maxX / 2), sy(0));
        ctx.lineTo(sx(p.maxX / 2), sy(p.maxY));
        ctx.stroke();

        const centerRadius = p.type === 'standard' ? 9.15 : 3;
        ctx.beginPath();
        ctx.arc(sx(p.maxX / 2), sy(p.maxY / 2), centerRadius * (this.canvas.width / (p.maxX + 2 * padX)), 0, 2 * Math.PI);
        ctx.stroke();

        // Penalty Areas
        const penaltyHalfDepth = p.type === 'standard' ? 20.16 : 6;
        const penaltyDist = p.type === 'standard' ? 16.5 : 6;
        const penaltySpotDist = p.type === 'standard' ? 11 : 6;
        const penaltyRadius = 9.15; // "D" arc radius, standard pitches only
        ctx.strokeStyle = c.lines;
        ctx.strokeRect(sx(0), sy(p.maxY / 2 + penaltyHalfDepth), sx(penaltyDist) - sx(0), sy(p.maxY / 2 - penaltyHalfDepth) - sy(p.maxY / 2 + penaltyHalfDepth));
        ctx.strokeRect(sx(p.maxX - penaltyDist), sy(p.maxY / 2 + penaltyHalfDepth), sx(p.maxX) - sx(p.maxX - penaltyDist), sy(p.maxY / 2 - penaltyHalfDepth) - sy(p.maxY / 2 + penaltyHalfDepth));

        // Penalty spots
        ctx.fillStyle = c.spot;
        ctx.beginPath();
        ctx.arc(sx(penaltySpotDist), sy(p.maxY / 2), 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx(p.maxX - penaltySpotDist), sy(p.maxY / 2), 3, 0, 2 * Math.PI);
        ctx.fill();

        // "D" arcs — the portion of the penalty-radius circle outside each box
        if (p.type === 'standard') {
            const dRadiusPx = penaltyRadius * (this.canvas.width / (p.maxX + 2 * padX));
            const dHalfAngle = Math.acos((penaltyDist - penaltySpotDist) / penaltyRadius);
            ctx.beginPath();
            ctx.arc(sx(penaltySpotDist), sy(p.maxY / 2), dRadiusPx, -dHalfAngle, dHalfAngle);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx(p.maxX - penaltySpotDist), sy(p.maxY / 2), dRadiusPx, Math.PI - dHalfAngle, Math.PI + dHalfAngle);
            ctx.stroke();
        }

        // Goal mouths — small red markers at each end, centred on the goal line
        const goalHalf = p.goalWidth / 2;
        ctx.strokeStyle = c.goal;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(p.maxY / 2 - goalHalf));
        ctx.lineTo(sx(0), sy(p.maxY / 2 + goalHalf));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx(p.maxX), sy(p.maxY / 2 - goalHalf));
        ctx.lineTo(sx(p.maxX), sy(p.maxY / 2 + goalHalf));
        ctx.stroke();
        ctx.lineWidth = 2;

        // Draw points
        if (this.startPoint) {
            ctx.fillStyle = c.start;
            ctx.beginPath();
            ctx.arc(sx(this.startPoint.x), sy(this.startPoint.y), 6, 0, 2 * Math.PI);
            ctx.fill();
        }
        if (this.endPoint) {
            ctx.fillStyle = c.end;
            ctx.beginPath();
            ctx.arc(sx(this.endPoint.x), sy(this.endPoint.y), 6, 0, 2 * Math.PI);
            ctx.fill();

            // Draw line only if start point also exists
            if (this.startPoint) {
                ctx.strokeStyle = c.dashLine;
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(sx(this.startPoint.x), sy(this.startPoint.y));
                ctx.lineTo(sx(this.endPoint.x), sy(this.endPoint.y));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    clear() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.startPoint = null;
        this.endPoint = null;
    }

    reset() {
        this.clear();
        this.draw();
    }
}
