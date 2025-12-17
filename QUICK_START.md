# Quick Start Guide - Get Your App Running in 5 Minutes! 🚀

## Step 1: Create Free Database (2 minutes)

I've opened Neon.tech for you in your browser. Follow these quick steps:

1. **Sign up** - Click "Sign up" (you can use GitHub, Google, or email)
2. **Create Project** - After signup, create a new project (any name is fine, like "cnctracker")
3. **Get Connection String** - Copy the connection string shown (looks like: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb`)

## Step 2: Create .env File (30 seconds)

Create a file named `.env` in `e:\CEM APPS\cnctracker\` with this content:

```
DATABASE_URL=paste_your_connection_string_here
PORT=5000
NODE_ENV=development
```

Replace `paste_your_connection_string_here` with the actual connection string from Neon.

## Step 3: Initialize Database (30 seconds)

Open terminal in your project folder and run:
```powershell
npm run db:push
```

This creates the database tables automatically.

## Step 4: Start the App! (30 seconds)

Run:
```powershell
node start-dev.js
```

Your app will be running at: **http://localhost:5000** 🎉

## Troubleshooting

### Error: "DATABASE_URL must be set"
- Make sure you created the `.env` file in the correct location
- Check that the connection string is on the `DATABASE_URL=` line

### Can't connect to database
- Verify your connection string is correct
- Make sure you have internet connection (Neon is cloud-based)

### App won't start
- Make sure you ran `npm install` first
- Check that port 5000 isn't already in use

---

**Need help?** Check `DATABASE_SETUP.md` for alternative database options.
