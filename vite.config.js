import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        sourcemap: false,
    },
    server: {
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
    },
})
