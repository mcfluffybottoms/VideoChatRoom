import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        https: {
            key: fs.readFileSync('../certs/key.pem'),
            cert: fs.readFileSync('../certs/cert.pem'),
        },
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                ws: true,
            },
        },
    },
});