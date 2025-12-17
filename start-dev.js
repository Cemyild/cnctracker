import { spawn } from 'child_process';

const child = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
});

child.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

child.on('exit', (code) => {
    process.exit(code || 0);
});
