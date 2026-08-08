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

    // Theme-aware colors
    getColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            bg: isDark ? '#0f172a' : '#1e293b',
            field: isDark ? '#1e3a2f' : '#334155',
            lines: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.4)',
            start: isDark ? '#4ade80' : '#10b981',      // brighter green in dark
            end: isDark ? '#f87171' : '#ef4444',          // brighter red in dark
            dashLine: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.6)',
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
        if (p.type === 'standard') {
            ctx.strokeRect(sx(0), sy(p.maxY / 2 + 20.16), sx(16.5) - sx(0), sy(p.maxY / 2 - 20.16) - sy(p.maxY / 2 + 20.16));
            ctx.strokeRect(sx(p.maxX - 16.5), sy(p.maxY / 2 + 20.16), sx(p.maxX) - sx(p.maxX - 16.5), sy(p.maxY / 2 - 20.16) - sy(p.maxY / 2 + 20.16));
        } else {
            ctx.strokeRect(sx(0), sy(p.maxY / 2 + 6), sx(6) - sx(0), sy(p.maxY / 2 - 6) - sy(p.maxY / 2 + 6));
            ctx.strokeRect(sx(p.maxX - 6), sy(p.maxY / 2 + 6), sx(p.maxX) - sx(p.maxX - 6), sy(p.maxY / 2 - 6) - sy(p.maxY / 2 + 6));
        }

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
