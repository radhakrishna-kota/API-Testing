# API Tester - Angular Application Setup

## Project Overview
A simple Angular 18 application with:
- Login page (default: admin/123)
- Dashboard/home page
- Authentication guard for protected routes
- Clean, responsive UI

## Getting Started

### Prerequisites
- Node.js v18+
- npm

### Installation
1. Open terminal
2. Run: `npm install`
3. Run: `npm start`
4. Navigate to `http://localhost:4200`

### Login
- Username: **admin**
- Password: **123**

## Project Structure

```
src/
├── app/
│   ├── login/              # Login component with form
│   ├── home/               # Dashboard/home page
│   ├── auth.service.ts     # Authentication logic
│   ├── auth.guard.ts       # Route protection
│   ├── app.routes.ts       # Route configuration
│   ├── app.config.ts       # App providers
│   └── app.component.ts    # Root component
├── environments/           # Environment configs
└── index.html             # HTML entry
```

## Key Features

1. **Authentication Service** (`src/app/auth.service.ts`)
   - Handles login/logout
   - Stores auth state in localStorage
   - Default credentials: admin/123

2. **Auth Guard** (`src/app/auth.guard.ts`)
   - Protects /home route
   - Redirects to login if not authenticated

3. **Routing** (`src/app/app.routes.ts`)
   - /login - Public login page
   - /home - Protected dashboard
   - / - Redirects to /login

## Development Commands

- `npm start` - Start dev server (localhost:4200)
- `npm run build` - Build for production
- `npm run watch` - Watch mode development
- `npm test` - Run tests

## Notes
- This is a starter template
- Modify `src/app/auth.service.ts` to change default credentials
- All components are standalone (no NgModule required)
