# Deployment Guide

This document describes the deployment process and architecture for the application.

## Infrastructure

- **VPS Provider:** Hetzner
- **IP Address:** `46.224.187.211`
- **Operating System:** Linux (Ubuntu/Debian)
- **Process Manager:** PM2
- **Database:** Neon (Serverless PostgreSQL)

## Deployment Process

The application is deployed manually by pulling the latest changes from the Git repository and rebuilding the project.

### Step-by-Step Update Procedure

1.  **Connect to the server:**
    ```bash
    ssh root@46.224.187.211
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd ~/cnctracker
    ```

3.  **Pull latest changes:**
    ```bash
    git pull
    ```

4.  **Install dependencies:**
    ```bash
    npm install
    ```

5.  **Update Database Schema:**
    If changes were made to `shared/schema.ts`, push those changes to the production database:
    ```bash
    npm run db:push
    ```

6.  **Build the application:**
    ```bash
    npm run build
    ```

7.  **Restart the service:**
    ```bash
    pm2 restart cnctracker
    ```

### Efficiency Tip: Single Line Command
Once connected to the server, you can run the following to update everything (excluding DB push):
```bash
cd ~/cnctracker && git pull && npm install && npm run build && pm2 restart cnctracker
```

## Monitoring

- **PM2 Status:** Check if the application is running:
    ```bash
    pm2 status
    ```
- **Logs:** View real-time application logs:
    ```bash
    pm2 logs cnctracker
    ```

## Backup & Recovery
- **Database:** Neon handles automated backups and point-in-time recovery.
- **Application:** Source code is stored in the Git repository.
