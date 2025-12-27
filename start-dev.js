import { spawn } from 'child_process';

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

startServer();
