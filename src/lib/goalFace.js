export class GoalFaceCanvas {
    constructor(canvasId, isFutsal = true) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.isFutsal = isFutsal;
        this.updateConfig();

        this.shotTarget = null; // { z: float, yOffset: float }
        this.onShotChange = null;

        this.canvas.addEventListener('click', (e) => this.handleClick(e));
    }

    updateConfig() {
        if (this.isFutsal) {
            this.config = { goalWidth: 3.0, goalHeight: 2.0 };
        } else {
            this.config = { goalWidth: 7.32, goalHeight: 2.44 };
        }
        this.draw();
    }

    // Theme-aware colors
    getColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            grass: isDark ? '#16a34a' : '#10b981',
            frame: isDark ? '#e2e8f0' : '#f8fafc',
            net: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)',
            shot: isDark ? '#f87171' : '#ef4444',
            shotGlow: isDark ? 'rgba(248,113,113,0.9)' : 'rgba(239,68,68,0.8)',
        };
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const clickY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

        const pad = 40;
        const innerW = this.canvas.width - 2 * pad;
        const innerH = this.canvas.height - 40;
        const gh = this.config.goalHeight;
        const gw = this.config.goalWidth;

        let z = gh * ((this.canvas.height - 20 - clickY) / innerH);
        // Clamp z between 0 and goal height, keep 2 decimal places
        z = Math.round(Math.max(0, Math.min(z, gh)) * 100) / 100;

        let yOffsetRaw = gw * ((clickX - pad) / innerW) - (gw / 2);
        // Clamp yOffset between -goalWidth/2 and +goalWidth/2, keep 2 decimal places
        yOffsetRaw = Math.round(Math.max(-gw / 2, Math.min(yOffsetRaw, gw / 2)) * 100) / 100;

        this.shotTarget = { yOffset: yOffsetRaw, z: z };

        this.draw();
        if (this.onShotChange) this.onShotChange(this.shotTarget);
    }

    draw() {
        const ctx = this.ctx;
        const gc = this.canvas;
        const c = this.getColors();
        ctx.clearRect(0, 0, gc.width, gc.height);

        // Grass
        ctx.fillStyle = c.grass;
        ctx.fillRect(0, gc.height - 20, gc.width, 20);

        // Goal Frame
        const pad = 40;
        const innerW = gc.width - 2 * pad;
        const innerH = gc.height - 40;

        ctx.strokeStyle = c.frame;
        ctx.lineWidth = 6;
        ctx.strokeRect(pad, 20, innerW, innerH);

        // Net pattern
        ctx.strokeStyle = c.net;
        ctx.lineWidth = 1;
        for (let i = pad + 15; i < gc.width - pad; i += 15) {
            ctx.beginPath(); ctx.moveTo(i, 20); ctx.lineTo(i, gc.height - 20); ctx.stroke();
        }
        for (let i = 35; i < gc.height - 20; i += 15) {
            ctx.beginPath(); ctx.moveTo(pad, i); ctx.lineTo(gc.width - pad, i); ctx.stroke();
        }

        // Shot target
        if (this.shotTarget) {
            const gw = this.config.goalWidth;
            const gh = this.config.goalHeight;
            const cx = pad + ((this.shotTarget.yOffset + (gw / 2)) / gw) * innerW;
            const cy = (gc.height - 20) - (this.shotTarget.z / gh) * innerH;

            ctx.fillStyle = c.shot;
            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
            ctx.fill();

            // Glow effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = c.shotGlow;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    reset() {
        this.shotTarget = null;
        this.draw();
    }
}
