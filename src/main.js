import './styles/index.css'
import { supabase } from './supabase'
import { router } from './router'
import calcioAcLogo from './assets/calcio-ac-logo.svg'

// Load saved theme before render to prevent flash
const savedTheme = localStorage.getItem('cac-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// HTML escape utility — prevents XSS in all template literals
function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

class App {
    constructor() {
        this.appElement = document.getElementById('app');
        this.user = null;
        this.userRole = null;
        this._sessionWarningTimer = null;
        this._sessionExpireTimer = null;
        this._renderLock = null;

        // Global error handling
        window.addEventListener('error', (e) => this.showFatalError(e.message));
        window.addEventListener('unhandledrejection', (e) => this.showFatalError(e.reason?.message || e.reason));

        this.init();
    }

    showFatalError(msg) {
        console.error('Fatal Error:', msg);
        if (this.appElement) {
            this.appElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--danger);">
                    <h2 style="margin-bottom: 16px;">App Load Failed</h2>
                    <p style="color: var(--text-muted); margin-bottom: 24px;">${esc(msg)}</p>
                    <button onclick="location.reload()" class="btn btn-primary" style="width: auto;">Try Refreshing</button>
                </div>
            `;
        }
    }

    async init() {
        window.addEventListener('hashchange', () => this.render());


        const { data: { session } } = await supabase.auth.getSession();
        await this.handleAuthChange(session?.user ?? null);

        supabase.auth.onAuthStateChange(async (_event, session) => {
            // Handle password recovery flow
            if (_event === 'PASSWORD_RECOVERY') {
                window.location.hash = '#reset-password';
            }
            if (_event === 'TOKEN_REFRESHED' || _event === 'SIGNED_IN') {
                this.resetSessionTimers();
            }
            await this.handleAuthChange(session?.user ?? null);
        });
    }

    // ── Session Timeout Warning ──────────────────────────────
    resetSessionTimers() {
        clearTimeout(this._sessionWarningTimer);
        clearTimeout(this._sessionExpireTimer);
        this.dismissSessionWarning();

        if (!this.user) return;

        // Supabase default session = 1 hour. Warn at 55 min, expire at 60 min.
        this._sessionWarningTimer = setTimeout(() => {
            this.showSessionWarning();
        }, 55 * 60 * 1000); // 55 minutes

        this._sessionExpireTimer = setTimeout(() => {
            this.dismissSessionWarning();
            alert('Your session has expired. Please log in again.');
            supabase.auth.signOut();
        }, 60 * 60 * 1000); // 60 minutes
    }

    showSessionWarning() {
        // Don't duplicate
        if (document.getElementById('session-warning-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'session-warning-bar';
        bar.className = 'session-warning-bar';
        bar.innerHTML = `
            <span>Your session expires in ~5 minutes. Save your work!</span>
            <button id="session-refresh-btn" style="margin-left:12px;padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.5);background:transparent;color:white;cursor:pointer;font-family:inherit;font-weight:700;">Refresh Session</button>
            <button id="session-dismiss-btn" style="margin-left:8px;background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.1rem;">✕</button>
        `;
        document.body.prepend(bar);
        document.getElementById('session-refresh-btn')?.addEventListener('click', async () => {
            const { error } = await supabase.auth.refreshSession();
            if (!error) {
                this.resetSessionTimers();
                this.dismissSessionWarning();
            }
        });
        document.getElementById('session-dismiss-btn')?.addEventListener('click', () => this.dismissSessionWarning());
    }

    dismissSessionWarning() {
        document.getElementById('session-warning-bar')?.remove();
    }

    async handleAuthChange(user) {
        // Skip if same user and role already fetched
        if (user && this.user?.id === user.id && this.userRole) {
            return;
        }

        this.user = user;

        if (user) {
            // Fetch role with retry — don't reset to null first so
            // stale data is better than nothing during concurrent calls
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', user.id)
                        .single();
                    if (error) throw error;
                    this.userRole = profile?.role || 'analyst';
                    break;
                } catch (e) {
                    console.warn(`Role fetch attempt ${attempt + 1} failed:`, e.message);
                    if (attempt === 1) this.userRole = this.userRole || 'analyst';
                }
            }

            // Defensive: only super_admin and analyst can use this site
            if (this.userRole !== 'super_admin' && this.userRole !== 'analyst') {
                alert('Your account role is not allowed on this site. Please contact your administrator.');
                await supabase.auth.signOut();
                return;
            }

            this.resetSessionTimers();
        } else {
            this.userRole = null;
            clearTimeout(this._sessionWarningTimer);
            clearTimeout(this._sessionExpireTimer);
        }

        // Redirect if needed, then always render
        const publicRoutes = ['#login', '#register', '#forgot-password', '#reset-password'];
        if (!user && !publicRoutes.includes(window.location.hash.split('?')[0])) {
            window.location.hash = '#login';
        } else if (user && publicRoutes.includes(window.location.hash.split('?')[0]) && window.location.hash !== '#reset-password') {
            window.location.hash = '#create-match';
        }
        this.render();
    }

    render() {
        this._renderLock = (this._renderLock || Promise.resolve())
            .then(() => this._doRender())
            .catch(err => console.error('Render error:', err));
        return this._renderLock;
    }

    async _doRender() {
        const hash = window.location.hash || '#create-match';
        const route = router.getRoute(hash);

        // Auth guard
        if (route.requiresAuth && !this.user) {
            window.location.hash = '#login';
            return;
        }

        // Super admin guard — RLS also enforces this server-side
        if (route.requiresSuperAdmin && this.userRole !== 'super_admin') {
            window.location.hash = '#create-match';
            return;
        }

        // Unauthenticated layout
        if (!this.user) {
            this.appElement.innerHTML = `
                <div class="auth-overlay">
                    <div id="auth-content"></div>
                </div>
            `;
            const authContent = document.getElementById('auth-content');
            authContent.innerHTML = await route.component();
        } else {
            // Authenticated layout
            const displayName = esc(this.user.user_metadata?.username ?? 'User');
            const avatarLetter = esc(this.user.email?.[0]?.toUpperCase() ?? 'U');
            const roleName = esc(this.userRole === 'super_admin' ? 'Super Admin' : 'Analyst');

            this.appElement.innerHTML = `
                <!-- Offline Banner -->
                <div id="offline-banner" class="offline-banner" style="display: none;">
                    <span id="offline-text">You are offline — events saved locally</span>
                </div>
                <div class="app-container">
                    <aside class="sidebar">
                        <div class="sidebar-brand">
                            <img src="${calcioAcLogo}" alt="Calcio AC" />
                            <span>Calcio AC</span>
                        </div>
                        <nav class="nav-list">
                            <a href="#create-match" class="nav-item ${hash === '#create-match' ? 'active' : ''}">
                                <span>+</span> Create Match
                            </a>
                            <a href="#matches" class="nav-item ${hash === '#matches' ? 'active' : ''}">
                                <span>@</span> My Matches
                            </a>
                            <a href="#qc" class="nav-item ${hash === '#qc' ? 'active' : ''}">
                                <span>~</span> QC Portal
                            </a>
                            <a href="#analytics" class="nav-item ${hash === '#analytics' ? 'active' : ''}">
                                <span>#</span> Analytics
                            </a>
                            ${this.userRole === 'super_admin' ? `
                            <a href="#admin" class="nav-item ${hash.startsWith('#admin') ? 'active' : ''}">
                                <span>*</span> Admin Portal
                            </a>` : ''}
                        </nav>
                        <div class="sidebar-footer">
                            <div class="theme-toggle">
                                <span id="theme-label">${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Dark' : 'Light'}</span>
                                <label class="theme-switch">
                                    <input type="checkbox" id="theme-checkbox" ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'checked' : ''}>
                                    <span class="theme-slider"></span>
                                </label>
                            </div>
                            <div class="user-profile">
                                <div class="user-avatar">${avatarLetter}</div>
                                <div class="user-info">
                                    <div class="user-name">${displayName}</div>
                                    <div class="user-role">${roleName}</div>
                                </div>
                            </div>
                            <button class="btn btn-ghost" id="logout-btn">
                                Logout
                            </button>
                        </div>
                    </aside>
                    <main class="main-content">
                        <div id="main-view" class="view-container"></div>
                    </main>
                </div>
            `;

            const mainView = document.getElementById('main-view');
            mainView.innerHTML = await route.component();

            document.getElementById('logout-btn').addEventListener('click', () => {
                supabase.auth.signOut();
            });

            const themeCheckbox = document.getElementById('theme-checkbox');
            if (themeCheckbox) {
                themeCheckbox.addEventListener('change', () => {
                    const isDark = themeCheckbox.checked;
                    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
                    localStorage.setItem('cac-theme', isDark ? 'dark' : 'light');
                    const label = document.getElementById('theme-label');
                    if (label) label.textContent = isDark ? 'Dark' : 'Light';
                });
            }

            // Offline/Online detection
            this.setupOfflineDetection();
        }

        if (route.onRender) await route.onRender();
    }

    setupOfflineDetection() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;

        const updateBanner = () => {
            if (!navigator.onLine) {
                banner.style.display = 'flex';
                document.getElementById('offline-text').textContent = 'You are offline — events saved locally';
            } else {
                banner.style.display = 'none';
            }
        };

        window.addEventListener('online', () => {
            banner.style.display = 'none';
            // Dispatch custom event so tagger can auto-sync
            window.dispatchEvent(new CustomEvent('cac-online'));
        });
        window.addEventListener('offline', updateBanner);
        updateBanner();
    }
}

new App();
