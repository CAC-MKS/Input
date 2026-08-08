export class VideoEngine {
    constructor(containerId, videoType = 'youtube') {
        this.container = document.getElementById(containerId);
        this.videoType = videoType;
        this.player = null;
        this.ytPlayer = null;
        this.extWindow = null;
        this.isPip = false;
        this._currentRate = 1;
        
        // PTZ state
        this.ptzMode = false;
        this.ptz = { scale: 1, x: 0, y: 0, active: false, startX: 0, startY: 0 };
        
        // Store bound handlers for cleanup
        this._ptzMouseMove = null;
        this._ptzMouseUp = null;
        
        // Build internal structure for PTZ
        this.container.innerHTML = `
            <div id="ve-inner" style="position: relative; width: 100%; height: 100%; overflow: hidden; background: black;">
                <div id="ve-ptz-overlay" style="position: absolute; top:0; left:0; width:100%; height:100%; z-index:10; cursor: grab; display: none;"></div>
                <div id="ve-transform" style="transform-origin: top left; width: 100%; height: 100%; transition: transform 0.1s ease-out;">
                    <!-- Player goes here -->
                </div>
            </div>
            <div id="ve-empty-state" style="display: none; padding: 40px; text-align: center; background: var(--bg); border: 2px dashed var(--border); border-radius: var(--radius-md); height: 100%; box-sizing: border-box; align-items: center; justify-content: center; flex-direction: column;">
                <h3 style="margin-top: 0; font-size: 1.25rem;">🪟 Video is popped out</h3>
                <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 20px;">The Pro Video Engine is running in an external window.</p>
                <button id="ve-bring-back-btn" class="btn btn-primary" style="background: var(--success); width: auto;">📥 Bring Video Back Here</button>
            </div>
        `;
        
        this.inner = this.container.querySelector('#ve-inner');
        this.transformWrap = this.container.querySelector('#ve-transform');
        this.ptzOverlay = this.container.querySelector('#ve-ptz-overlay');
        this.emptyState = this.container.querySelector('#ve-empty-state');
        this.currentUrl = null;

        this.init();
        this.setupPTZ();
        
        this.container.querySelector('#ve-bring-back-btn').addEventListener('click', () => this.restoreVideoFromPiPAndClose());
    }

    init() {
        if (this.videoType === 'local') {
            this.player = document.createElement('video');
            this.player.style.width = '100%';
            this.player.style.height = '100%';
            this.player.controls = true;
            this.player.playsInline = true;
            this.transformWrap.appendChild(this.player);
        } else {
            const ytDiv = document.createElement('div');
            ytDiv.id = 've-yt-player';
            this.transformWrap.appendChild(ytDiv);

            if (!window.YT) {
                const tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                window.onYouTubeIframeAPIReady = () => {
                    if (this.currentUrl) this.loadYouTube(this.currentUrl);
                };
            }
        }
    }

    loadLocalFile(file) {
        if (this.videoType !== 'local') return;
        this.player.src = URL.createObjectURL(file);
    }

    loadYouTube(url) {
        this.currentUrl = url;
        const videoId = this.extractYTId(url);
        if (!videoId) return;

        if (window.YT && window.YT.Player) {
            this.transformWrap.innerHTML = '<div id="ve-yt-player"></div>';
            this.ytPlayer = new window.YT.Player('ve-yt-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'playsinline': 1 }
            });
        }
    }

    extractYTId(url) {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/);
        return (match && match[1]) ? match[1] : null;
    }

    getCurrentTime() {
        if (this.videoType === 'local') return this.player ? this.player.currentTime : 0;
        if (this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') return this.ytPlayer.getCurrentTime();
        return 0;
    }

    seek(seconds) {
        seconds = Math.max(0, seconds);
        if (this.videoType === 'local' && this.player) this.player.currentTime = seconds;
        else if (this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') this.ytPlayer.seekTo(seconds, true);
    }

    seekRelative(offset) {
        this.seek(this.getCurrentTime() + offset);
    }

    play() {
        if (this.videoType === 'local' && this.player) {
            this.player.play();
        } else if (this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
            this.ytPlayer.playVideo();
        }
    }

    pause() {
        if (this.videoType === 'local' && this.player) {
            this.player.pause();
        } else if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
            this.ytPlayer.pauseVideo();
        }
    }

    togglePlay() {
        if (this.videoType === 'local' && this.player) {
            this.player.paused ? this.play() : this.pause();
        } else if (this.ytPlayer && typeof this.ytPlayer.getPlayerState === 'function') {
            const state = this.ytPlayer.getPlayerState();
            state === 1 ? this.pause() : this.play();
        }
    }

    // ==========================================
    // PLAYBACK SPEED CONTROL
    // ==========================================
    static SPEED_STEPS = [0.25, 0.5, 1, 1.5, 2];

    setPlaybackRate(rate) {
        this._currentRate = rate;
        if (this.videoType === 'local' && this.player) {
            this.player.playbackRate = rate;
        } else if (this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === 'function') {
            this.ytPlayer.setPlaybackRate(rate);
        }
    }

    getPlaybackRate() {
        if (this.videoType === 'local' && this.player) {
            return this.player.playbackRate;
        } else if (this.ytPlayer && typeof this.ytPlayer.getPlaybackRate === 'function') {
            return this.ytPlayer.getPlaybackRate();
        }
        return this._currentRate;
    }

    cycleSpeedUp() {
        const steps = VideoEngine.SPEED_STEPS;
        const current = this.getPlaybackRate();
        let idx = steps.indexOf(current);
        idx = idx === -1 ? steps.indexOf(1) : idx;
        const next = steps[Math.min(idx + 1, steps.length - 1)];
        this.setPlaybackRate(next);
        return next;
    }

    cycleSpeedDown() {
        const steps = VideoEngine.SPEED_STEPS;
        const current = this.getPlaybackRate();
        let idx = steps.indexOf(current);
        idx = idx === -1 ? steps.indexOf(1) : idx;
        const next = steps[Math.max(idx - 1, 0)];
        this.setPlaybackRate(next);
        return next;
    }

    // ==========================================
    // PTZ LOGIC
    // ==========================================
    togglePTZ() {
        this.ptzMode = !this.ptzMode;
        this.ptzOverlay.style.display = this.ptzMode ? 'block' : 'none';
        return this.ptzMode;
    }

    resetPTZ() {
        this.ptz = { scale: 1, x: 0, y: 0, active: false, startX: 0, startY: 0 };
        this.applyPTZ();
    }

    applyPTZ() {
        this.transformWrap.style.transform = `translate(${this.ptz.x}px, ${this.ptz.y}px) scale(${this.ptz.scale})`;
    }

    setupPTZ() {
        this.ptzOverlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = -e.deltaY * 0.002;
            this.ptz.scale = Math.max(1, Math.min(this.ptz.scale + zoomAmount, 5));
            this.applyPTZ();
        });

        this.ptzOverlay.addEventListener('mousedown', (e) => {
            this.ptz.active = true;
            this.ptz.startX = e.clientX - this.ptz.x;
            this.ptz.startY = e.clientY - this.ptz.y;
            this.ptzOverlay.style.cursor = 'grabbing';
        });

        this._ptzMouseMove = (e) => {
            if (this.ptz.active) {
                this.ptz.x = e.clientX - this.ptz.startX;
                this.ptz.y = e.clientY - this.ptz.startY;
                this.applyPTZ();
            }
        };

        this._ptzMouseUp = () => {
            this.ptz.active = false;
            this.ptzOverlay.style.cursor = 'grab';
        };

        document.addEventListener('mousemove', this._ptzMouseMove);
        document.addEventListener('mouseup', this._ptzMouseUp);
    }

    // ==========================================
    // CLEANUP
    // ==========================================
    destroy() {
        if (this._ptzMouseMove) {
            document.removeEventListener('mousemove', this._ptzMouseMove);
            this._ptzMouseMove = null;
        }
        if (this._ptzMouseUp) {
            document.removeEventListener('mouseup', this._ptzMouseUp);
            this._ptzMouseUp = null;
        }
        if (this._onDragMove) {
            document.removeEventListener('mousemove', this._onDragMove);
            document.removeEventListener('mouseup', this._onDragEnd);
        }
    }

    // ==========================================
    // MULTI-MONITOR POPOUT LOGIC
    // ==========================================
    async togglePopOut() {
        if (this.extWindow) {
            this.restoreVideoFromPiPAndClose();
            return;
        }

        if ('documentPictureInPicture' in window) {
            try {
                this.extWindow = await window.documentPictureInPicture.requestWindow({ width: 800, height: 450 });
                this.setupExternalWindow(this.extWindow);
                return;
            } catch (err) {
                console.warn("Doc PiP failed, fallback to window.open", err);
            }
        }
        
        // Fallback to Window.open
        try {
            this.extWindow = window.open('', 'ExternalVideo', 'width=800,height=450,menubar=no,toolbar=no,location=no,status=no');
            if (this.extWindow) {
                this.extWindow.document.write('<!DOCTYPE html><html><head><title>Pro Video Engine</title></head><body></body></html>');
                this.extWindow.document.close();
                this.setupExternalWindow(this.extWindow);
                return;
            }
        } catch(e) {}
        
        // Ultimate Fallback: CSS Float
        this.fallbackCssFloat();
    }

    fallbackCssFloat() {
        this.isFloat = !this.isFloat;
        const btn = document.getElementById('popout-btn');
        const card = document.getElementById('main-video-card') || this.container.parentElement;
        const dragHandle = document.getElementById('video-controls') || this.container;
        
        if (this.isFloat) {
            if (btn) btn.innerText = "⚓ Dock";
            
            // Save original styles
            this.origStyles = {
                position: card.style.position, top: card.style.top, left: card.style.left, right: card.style.right,
                width: card.style.width, height: card.style.height, zIndex: card.style.zIndex,
                boxShadow: card.style.boxShadow, border: card.style.border, resize: card.style.resize
            };
            
            card.style.position = 'fixed';
            card.style.top = '20px';
            card.style.right = '20px';
            card.style.left = 'auto';
            card.style.width = '550px';
            card.style.height = 'auto';
            card.style.zIndex = '3000';
            card.style.boxShadow = 'var(--shadow-lg)';
            card.style.border = '2px solid var(--accent)';
            card.style.resize = 'both';
            card.style.overflow = 'hidden';
            
            dragHandle.style.cursor = 'move';
            
            // Drag logic
            this._dragInfo = { active: false, x: 0, y: 0 };
            this._onDragStart = (e) => {
                if (['BUTTON', 'SELECT', 'INPUT'].includes(e.target.tagName)) return;
                this._dragInfo.active = true;
                this._dragInfo.x = e.clientX - card.offsetLeft;
                this._dragInfo.y = e.clientY - card.offsetTop;
            };
            this._onDragMove = (e) => {
                if (this._dragInfo.active) {
                    card.style.left = (e.clientX - this._dragInfo.x) + 'px';
                    card.style.top = (e.clientY - this._dragInfo.y) + 'px';
                    card.style.right = 'auto';
                }
            };
            this._onDragEnd = () => { this._dragInfo.active = false; };
            
            dragHandle.addEventListener('mousedown', this._onDragStart);
            document.addEventListener('mousemove', this._onDragMove);
            document.addEventListener('mouseup', this._onDragEnd);
            
        } else {
            if (btn) btn.innerText = "🪟 Pop Out";
            
            // Restore styles
            if (this.origStyles) {
                Object.keys(this.origStyles).forEach(k => card.style[k] = this.origStyles[k] || '');
            }
            dragHandle.style.cursor = 'default';
            
            if (this._onDragStart) {
                dragHandle.removeEventListener('mousedown', this._onDragStart);
                document.removeEventListener('mousemove', this._onDragMove);
                document.removeEventListener('mouseup', this._onDragEnd);
            }
        }
    }

    setupExternalWindow(win) {
        win.document.body.style.background = 'black';
        win.document.body.style.margin = '0';
        win.document.body.style.overflow = 'hidden';

        // Move the entire internal wrapper into the new window
        win.document.body.appendChild(this.inner);
        this.emptyState.style.display = 'flex';

        // YouTube specific: if we move the DOM, the iframe reloads and drops connection to the API. 
        // We MUST re-initialize the player in the new window context.
        if (this.videoType === 'youtube' && this.ytPlayer && this.currentUrl) {
            const videoId = this.extractYTId(this.currentUrl);
            let startAt = 0;
            try { startAt = this.ytPlayer.getCurrentTime(); } catch(e){}
            
            this.transformWrap.innerHTML = '<div id="ve-yt-player"></div>';
            this.ytPlayer = new win.YT.Player('ve-yt-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'autoplay': 1, 'playsinline': 1, 'start': Math.floor(startAt) }
            });
        }

        win.addEventListener('pagehide', () => this.restoreVideoFromPiP());

        // Relay keyboard events (e.g. Spacebar) back to main window
        win.addEventListener('keydown', (e) => {
            const mainEvent = new KeyboardEvent('keydown', { key: e.key, code: e.code, bubbles: true });
            document.dispatchEvent(mainEvent);
        });
        
        // Relay mouse events for PTZ tracking across window boundaries
        win.addEventListener('mousemove', (e) => {
            if (this.ptz.active) {
                this.ptz.x = e.screenX - this.ptz.startX; 
                this.ptz.y = e.screenY - this.ptz.startY;
                this.applyPTZ();
            }
        });
        win.addEventListener('mouseup', () => { this.ptz.active = false; this.ptzOverlay.style.cursor = 'grab'; });
    }

    restoreVideoFromPiP() {
        if (!this.extWindow) return;
        
        this.emptyState.style.display = 'none';
        this.container.insertBefore(this.inner, this.emptyState);
        
        if (this.videoType === 'youtube' && this.ytPlayer && this.currentUrl) {
            const videoId = this.extractYTId(this.currentUrl);
            let currentTime = 0;
            try { currentTime = this.ytPlayer.getCurrentTime(); } catch(e){}
            
            this.transformWrap.innerHTML = '<div id="ve-yt-player"></div>';
            this.ytPlayer = new window.YT.Player('ve-yt-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'autoplay': 1, 'playsinline': 1, 'start': Math.floor(currentTime) }
            });
        }
        
        this.resetPTZ();
        this.extWindow = null;
    }

    restoreVideoFromPiPAndClose() {
        if (this.extWindow) {
            try { this.extWindow.close(); } catch(e) {}
        } else if (this.isFloat) {
            this.fallbackCssFloat();
        }
        this.restoreVideoFromPiP();
    }
}
