import { supabase } from '../supabase'
import calcioAcLogo from '../assets/calcio-ac-logo.svg'

// --- HTML escaping utility to prevent XSS ---
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function LoginView() {
    return `
        <div class="auth-card">
            <img src="${calcioAcLogo}" alt="Calcio AC" class="auth-logo" />
            <h2 class="auth-title">Welcome Back</h2>
            <p class="auth-subtitle">Sign in to your Calcio AC account</p>
            <form id="login-form" autocomplete="on">
                <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" id="email" class="form-input" required placeholder="name@example.com" autocomplete="email">
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" id="password" class="form-input" required placeholder="••••••••" autocomplete="current-password">
                </div>
                <div id="auth-error" style="color: var(--danger); font-size: 0.875rem; margin-bottom: 20px; display: none;"></div>
                <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
                <div style="margin-top: 16px; text-align: center; display: flex; flex-direction: column; gap: 8px;">
                    <a href="#forgot-password" class="btn btn-ghost" style="font-size: 0.8125rem; color: var(--warning);">Forgot Password?</a>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Account creation is managed by your administrator.</p>
                </div>
            </form>
        </div>
    `;
}

export function RegisterView() {
    return `
        <div class="auth-card">
            <h2 class="auth-title">Registration Closed</h2>
            <p class="auth-subtitle">Accounts on this site are created by the super admin.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 20px 0;">
                If you need access, please contact your administrator. They will create an analyst account
                and assign you to your academy.
            </p>
            <div style="margin-top: 16px; text-align: center;">
                <a href="#login" class="btn btn-primary" style="display: inline-block;">Back to Login</a>
            </div>
        </div>
    `;
}

export function ForgotPasswordView() {
    return `
        <div class="auth-card">
            <h2 class="auth-title">Reset Password</h2>
            <p class="auth-subtitle">Enter your email and we'll send a reset link</p>
            <form id="forgot-form">
                <div class="form-group">
                    <label class="form-label">Email Address</label>
                    <input type="email" id="email" class="form-input" required placeholder="name@example.com" autocomplete="email">
                </div>
                <div id="auth-error" style="font-size: 0.875rem; margin-bottom: 20px; display: none;"></div>
                <button type="submit" class="btn btn-primary" id="forgot-btn">Send Reset Link</button>
                <div style="margin-top: 16px; text-align: center;">
                    <a href="#login" class="btn btn-ghost" style="font-size: 0.8125rem;">Back to Login</a>
                </div>
            </form>
        </div>
    `;
}

export function ResetPasswordView() {
    return `
        <div class="auth-card">
            <h2 class="auth-title">Set New Password</h2>
            <p class="auth-subtitle">Choose a strong new password</p>
            <form id="reset-form">
                <div class="form-group">
                    <label class="form-label">New Password</label>
                    <input type="password" id="new-password" class="form-input" required placeholder="Min 8 chars, letters, numbers, special" autocomplete="new-password" minlength="8">
                </div>
                <div class="form-group">
                    <label class="form-label">Confirm New Password</label>
                    <input type="password" id="confirm-password" class="form-input" required placeholder="Retype your new password" autocomplete="new-password">
                </div>
                <div id="auth-error" style="font-size: 0.875rem; margin-bottom: 20px; display: none;"></div>
                <button type="submit" class="btn btn-primary" id="reset-btn">Update Password</button>
            </form>
        </div>
    `;
}

// Password strength checker
function checkPasswordStrength(password) {
    let score = 0;
    const checks = [];

    if (password.length >= 8) { score++; } else { checks.push('8+ characters'); }
    if (password.length >= 12) { score++; }
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) { score++; } else { checks.push('upper & lowercase'); }
    if (/\d.*\d/.test(password)) { score++; } else { checks.push('2+ numbers'); }
    if (/[@$!%*#?&^()_+\-=\[\]{}|;:,.<>]/.test(password)) { score++; } else { checks.push('1 special char'); }

    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

    return {
        score,
        label: labels[Math.min(score, 4)],
        color: colors[Math.min(score, 4)],
        missing: checks,
        valid: score >= 3 // At least "Fair"
    };
}

// Validate password meets minimum requirements
const PASSWORD_REGEX = /^(?=.*[A-Za-z].*[A-Za-z])(?=.*\d.*\d)(?=.*[@$!%*#?&^()_+\-=\[\]{}|;:,.<>])[A-Za-z\d@$!%*#?&^()_+\-=\[\]{}|;:,.<>]{8,}$/;

// Rate limiting on the client side (complement to Supabase server-side)
const authAttempts = { count: 0, lastAttempt: 0, lockoutUntil: 0 };

function checkRateLimit() {
    const now = Date.now();
    if (now < authAttempts.lockoutUntil) {
        const waitSec = Math.ceil((authAttempts.lockoutUntil - now) / 1000);
        return { allowed: false, message: `Too many attempts. Wait ${waitSec}s.` };
    }
    // Reset counter after 5 minutes of inactivity
    if (now - authAttempts.lastAttempt > 300000) {
        authAttempts.count = 0;
    }
    authAttempts.count++;
    authAttempts.lastAttempt = now;
    if (authAttempts.count > 5) {
        authAttempts.lockoutUntil = now + 60000; // 1 minute lockout
        return { allowed: false, message: 'Too many attempts. Wait 60 seconds.' };
    }
    return { allowed: true };
}

// Function to attach listeners after rendering
export function initAuth() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotForm = document.getElementById('forgot-form');
    const resetForm = document.getElementById('reset-form');

    // --- LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('auth-error');
            const btn = document.getElementById('login-btn');

            errorEl.style.display = 'none';

            // Client-side rate limit
            const rateCheck = checkRateLimit();
            if (!rateCheck.allowed) {
                errorEl.textContent = rateCheck.message;
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            // Basic validation
            if (!email || !password) {
                errorEl.textContent = 'Please fill in all fields.';
                errorEl.style.display = 'block';
                return;
            }

            btn.textContent = 'Authenticating...';
            btn.disabled = true;

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });

                if (error) {
                    if (error.status === 429) {
                        errorEl.textContent = 'Too many attempts! Please wait 60 seconds and try again.';
                    } else {
                        // Don't expose whether email exists — generic message
                        errorEl.textContent = 'Invalid email or password.';
                    }
                    errorEl.style.color = 'var(--danger)';
                    errorEl.style.display = 'block';
                } else {
                    // Reset rate limit on success
                    authAttempts.count = 0;
                }
            } catch (err) {
                errorEl.textContent = 'Network error. Please check your connection.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
            }

            btn.textContent = 'Sign In';
            btn.disabled = false;
        });
    }

    // --- REGISTER ---
    if (registerForm) {
        // Password strength indicator
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                const strengthEl = document.getElementById('password-strength');
                if (!strengthEl) return;
                const s = checkPasswordStrength(passwordInput.value);
                if (passwordInput.value.length === 0) {
                    strengthEl.textContent = '';
                } else {
                    strengthEl.textContent = `${s.label}${s.missing.length ? ' — Need: ' + s.missing.join(', ') : ''}`;
                    strengthEl.style.color = s.color;
                }
            });
        }

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('auth-error');
            const btn = document.getElementById('register-btn');

            errorEl.style.display = 'none';

            // Validate username
            if (!username || username.length < 2 || username.length > 30) {
                errorEl.textContent = 'Username must be 2-30 characters.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            // Validate password strength
            if (!PASSWORD_REGEX.test(password)) {
                errorEl.textContent = 'Password must be min 8 chars, with at least 2 letters, 2 numbers, and 1 special character.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            const rateCheck = checkRateLimit();
            if (!rateCheck.allowed) {
                errorEl.textContent = rateCheck.message;
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            btn.textContent = 'Creating Account...';
            btn.disabled = true;

            try {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username: esc(username) }
                    }
                });

                if (error) {
                    if (error.status === 429) {
                        errorEl.textContent = 'Too many attempts! Please wait 60 seconds and try again.';
                    } else {
                        errorEl.textContent = error.message;
                    }
                    errorEl.style.color = 'var(--danger)';
                    errorEl.style.display = 'block';
                    btn.textContent = 'Create Account';
                    btn.disabled = false;
                } else {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                        errorEl.textContent = 'Check your email for a confirmation link!';
                        errorEl.style.color = 'var(--success)';
                        errorEl.style.display = 'block';
                        btn.textContent = 'Email Sent';
                    }
                }
            } catch (err) {
                errorEl.textContent = 'Network error. Please check your connection.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                btn.textContent = 'Create Account';
                btn.disabled = false;
            }
        });
    }

    // --- FORGOT PASSWORD ---
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const errorEl = document.getElementById('auth-error');
            const btn = document.getElementById('forgot-btn');

            errorEl.style.display = 'none';

            if (!email) {
                errorEl.textContent = 'Please enter your email address.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            const rateCheck = checkRateLimit();
            if (!rateCheck.allowed) {
                errorEl.textContent = rateCheck.message;
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/#reset-password`,
                });

                // Always show success message to prevent email enumeration
                errorEl.textContent = 'If an account exists with that email, a reset link has been sent. Check your inbox.';
                errorEl.style.color = 'var(--success)';
                errorEl.style.display = 'block';
                btn.textContent = 'Email Sent';

                if (error) {
                    console.warn('Password reset error:', error.message);
                }
            } catch (err) {
                errorEl.textContent = 'Network error. Please check your connection.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                btn.textContent = 'Send Reset Link';
                btn.disabled = false;
            }
        });
    }

    // --- RESET PASSWORD (after clicking link in email) ---
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const errorEl = document.getElementById('auth-error');
            const btn = document.getElementById('reset-btn');

            errorEl.style.display = 'none';

            if (newPassword !== confirmPassword) {
                errorEl.textContent = 'Passwords do not match.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            if (!PASSWORD_REGEX.test(newPassword)) {
                errorEl.textContent = 'Password must be min 8 chars, with at least 2 letters, 2 numbers, and 1 special character.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                return;
            }

            btn.textContent = 'Updating...';
            btn.disabled = true;

            try {
                const { error } = await supabase.auth.updateUser({ password: newPassword });

                if (error) {
                    errorEl.textContent = error.message;
                    errorEl.style.color = 'var(--danger)';
                    errorEl.style.display = 'block';
                    btn.textContent = 'Update Password';
                    btn.disabled = false;
                } else {
                    errorEl.textContent = 'Password updated! Redirecting to login...';
                    errorEl.style.color = 'var(--success)';
                    errorEl.style.display = 'block';
                    btn.textContent = 'Done!';
                    setTimeout(() => {
                        window.location.hash = '#login';
                    }, 2000);
                }
            } catch (err) {
                errorEl.textContent = 'Network error. Please try again.';
                errorEl.style.color = 'var(--danger)';
                errorEl.style.display = 'block';
                btn.textContent = 'Update Password';
                btn.disabled = false;
            }
        });
    }
}
