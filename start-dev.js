import { spawn } from 'child_process';
import net from 'net';

// Yerel gelistirme CANLI veritabanina SSH tuneliyle baglanir:
// localhost:5433 -> VPS localhost:5432 (Postgres disariya ACIK DEGIL).
const TUNNEL_PORT = 5433;
const VPS = 'root@167.235.252.49';

function portAcikMi(port) {
    return new Promise((resolve) => {
        const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); resolve(true); });
        s.on('error', () => resolve(false));
        s.setTimeout(1500, () => { s.destroy(); resolve(false); });
    });
}

async function startTunnel() {
    if (await portAcikMi(TUNNEL_PORT)) {
        console.log(`SSH tuneli zaten acik (localhost:${TUNNEL_PORT}).`);
        return;
    }
    console.log('SSH tuneli aciliyor: localhost:5433 -> VPS Postgres...');
    const tunnel = spawn('ssh', [
        '-N',
        '-L', `${TUNNEL_PORT}:localhost:5432`,
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=3',
        VPS,
    ], { stdio: 'inherit', shell: false });

    tunnel.on('error', (error) => {
        console.error('Tunel baslatilamadi (ssh kurulu mu?):', error.message);
    });
    tunnel.on('exit', (code) => {
        console.log(`SSH tuneli kapandi (kod ${code}). 5 sn sonra tekrar denenecek...`);
        setTimeout(startTunnel, 5000);
    });
    process.on('exit', () => tunnel.kill());
    // Tunelin oturmasi icin kisa bekleme
    await new Promise((r) => setTimeout(r, 2000));
}

function startServer() {
    console.log('Starting server...');
    const child = spawn('npx', ['tsx', 'server/index.ts'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, NODE_ENV: 'development' }
    });

    child.on('error', (error) => {
        console.error('Failed to start server:', error);
        // Retry after 5 seconds
        setTimeout(startServer, 5000);
    });

    child.on('exit', (code) => {
        console.log(`Server exited with code ${code}. Restarting in 3 seconds...`);
        setTimeout(startServer, 3000);
    });
}

startTunnel().then(startServer);
