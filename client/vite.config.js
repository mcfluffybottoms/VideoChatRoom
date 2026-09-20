import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ command }) => {
    const config = {
        plugins: [react()],
    };

    if (command === 'serve') {
        const keyPath = path.resolve(__dirname, 'certs/key.pem');
        const certPath = path.resolve(__dirname, 'certs/cert.pem');

        config.server = {
            host: '0.0.0.0',

            https: {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
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
        };
    }

    return config;
});