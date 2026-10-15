# Last Minute web app

A responsive React and Vite version of the Last Minute exam paper library.

## Run locally

This project loads the root `.env` file through Vite. Email/password sign-in and account creation use the PHP API in `backend/`, with account data stored in MySQL. Firebase remains in the project for app data during the gradual backend migration; it is no longer used to create or authenticate accounts.

```sh
npm install
npm run dev
```

### PHP and MySQL auth API

1. In XAMPP Control Panel, start Apache and MySQL.
2. Copy `backend/.env.example` to `backend/.env`. The default XAMPP MySQL username is `root`; set `DB_PASSWORD` to your MySQL password if you configured one.
3. Open phpMyAdmin, import `backend/schema.sql`, and confirm the `last_minute` database and its tables were created.
4. Add this Alias to `C:/xampp/apache/conf/httpd.conf`, updating the project path if needed:

```apache
Alias /api "C:/Users/liwewe/last-minute/backend/public"
<Directory "C:/Users/liwewe/last-minute/backend/public">
    AllowOverride All
    Require all granted
</Directory>
```

5. Confirm Apache has `mod_rewrite` enabled, then restart Apache. The Vite `/api` proxy forwards requests to XAMPP Apache on port 80.
6. Run the frontend with `npm run dev` and create an account from the signup screen.

For deployment, point `VITE_API_BASE_URL` at the deployed PHP API and set `APP_ORIGINS` to the exact frontend origins. Serve `backend/public` as the web root so the database config and schema are not exposed.

Use `.env.example` as a reference when setting up another environment. Vite exposes only variables prefixed with `VITE_` to browser code. Keep service credentials such as `GROQ_API_KEY` on the server and never rename them with a `VITE_` prefix.

## Scripts

- `npm run dev` starts the development server.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally.
- `npm run lint` checks the source with ESLint.
