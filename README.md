# API Tester

A simple Angular application for testing APIs with a login page.

## Project Setup

This project was generated with Angular 18.

## Default Credentials

- **Username:** admin
- **Password:** 123

## Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)

## Installation

1. Navigate to the project directory
2. Install dependencies:
```bash
npm install
```

## Development Server

Run the development server:
```bash
npm start
```

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any source files.

## Build

Build the project for production:
```bash
npm run build
```

The build artifacts will be stored in the `dist/apitester/` directory.

## Features

- **Login Page:** Secure login with default credentials (admin / 123)
- **Dashboard:** Welcome page after successful login
- **Authentication Guard:** Protected routes that require authentication
- **Logout:** Option to logout from the dashboard
- **Responsive Design:** Works on desktop and mobile devices

## File Structure

```
src/
├── app/
│   ├── login/               # Login component
│   ├── home/                # Home/dashboard component
│   ├── auth.service.ts      # Authentication service
│   ├── auth.guard.ts        # Route guard for protected routes
│   ├── app.routes.ts        # Application routing configuration
│   ├── app.config.ts        # Application configuration
│   ├── app.component.ts     # Root component
│   └── app.component.html   # Root template
├── environments/            # Environment configurations
├── styles.css              # Global styles
├── main.ts                 # Application bootstrap
└── index.html              # HTML entry point
```

## How to Use

1. **Start the application:**
   ```
   npm start
   ```

2. **Login Page:** 
   - Enter default credentials (username: admin, password: 123)
   - Click Login or press Enter

3. **Dashboard:**
   - View the welcome message with your username
   - See available features
   - Click Logout to return to login page

## Notes

- This is a starter template with basic authentication
- Feel free to expand with actual API testing functionality
- Update the default credentials in `src/app/auth.service.ts` as needed
