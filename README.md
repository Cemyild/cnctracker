# CNC Tracker - Custom Clearance Tracking System

A modern web application for tracking and analyzing customs clearance data (Gümrük Takip Sistemi).

## 🚀 Quick Start

**New to this project?** See [QUICK_START.md](QUICK_START.md) for a 5-minute setup guide!

## 📋 Prerequisites

- Node.js (v18 or higher)
- A PostgreSQL database (see setup options below)

## 🔧 Database Setup

This application has been configured to work independently of Replit. You have several options for the database:

### Option 1: Free Cloud Database (Recommended)
- **Neon** - https://neon.tech (Free tier, no credit card required)
- **Supabase** - https://supabase.com (Free tier available)

### Option 2: Local PostgreSQL
Install PostgreSQL locally on your machine

### Option 3: Docker PostgreSQL
Use Docker container for PostgreSQL

**See [DATABASE_SETUP.md](DATABASE_SETUP.md) for detailed instructions on all options.**

## 💻 Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```powershell
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Add your database connection string to `.env`:
     ```
     DATABASE_URL=your_postgresql_connection_string
     PORT=5000
     NODE_ENV=development
     ```

4. **Initialize database schema**
   ```powershell
   npm run db:push
   ```

5. **Start development server**
   ```powershell
   node start-dev.js
   ```
   
   Or use npm:
   ```powershell
   npm run dev
   ```

6. **Open your browser**
   Navigate to: http://localhost:5000

## 📁 Project Structure

```
cnctracker/
├── client/          # React frontend application
├── server/          # Express backend API
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
├── .env            # Environment variables (create this)
├── .env.example    # Environment variables template
└── package.json    # Dependencies and scripts
```

## 🎯 Features

- **Excel Import** - Upload customs clearance data from Excel files
- **Data Tracking** - Track customs clearance records by month and year
- **Analytics** - View summaries by company, customs office, and staff
- **Charts & Reports** - Visualize data with interactive charts
- **Data Management** - Add, view, and delete customs records

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push database schema changes
- `npm run check` - Type check with TypeScript

## 📚 Tech Stack

- **Frontend**: React, Wouter (routing), TailwindCSS, Shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Build Tool**: Vite

## 🔒 Security Notes

- Never commit the `.env` file (it's in `.gitignore`)
- Keep your database credentials secure
- Change default credentials in production

## 🌐 Deployment

This app is ready to deploy to various platforms:
- Heroku
- Railway
- Render
- Vercel (with PostgreSQL addon)
- Your own VPS

Make sure to set the `DATABASE_URL` environment variable in your deployment platform.

## 📝 Environment Variables

Required environment variables:

```
DATABASE_URL=postgresql://user:password@host:port/database
PORT=5000
NODE_ENV=production
```

## 🔄 Migrating from Replit

If you're migrating from Replit:
1. Follow the database setup guide
2. The `.replit` file can be ignored or deleted
3. All Replit-specific configurations have been made optional

## 🤝 Contributing

Feel free to fork this project and make improvements!

## 📄 License

MIT

## ❓ Support

For issues or questions:
1. Check [QUICK_START.md](QUICK_START.md)
2. Check [DATABASE_SETUP.md](DATABASE_SETUP.md)
3. Review the error messages in the console

---

**Ready to get started?** Follow the [QUICK_START.md](QUICK_START.md) guide! 🚀
