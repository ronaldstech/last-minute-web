# Last Minute web app

A responsive React and Vite version of the Last Minute exam paper library.

## Run locally

```sh
npm install
npm run dev
```

## PHP and MySQL auth API with XAMPP

The working backend source is `C:\Users\liwewe\last-minute-web\backend`. Copy that whole `backend` folder into `C:\xampp\htdocs`, giving you `C:\xampp\htdocs\backend`. Keep the project copy so changes remain in the workspace.

1. Start Apache and MySQL in XAMPP Control Panel.
2. In the `htdocs\backend` copy, copy `.env.example` to `.env`. XAMPP's default MySQL user is `root`; add your MySQL password if you set one.
3. Go to `http://localhost/phpmyadmin`, click **Import**, select `C:\xampp\htdocs\backend\schema.sql`, and import it. Then run `migrations/019_add_coin_pricing_settings.sql`; the baseline schema does not include the latest app-configuration and coin-pricing columns.
4. Start or restart Vite with `npm run dev`. The local API URL is `http://localhost/backend/public`.
5. In Postman, import `C:\xampp\htdocs\backend\postman\Last-Minute-Auth.postman_collection.json` and run its requests in order.

The backend has an `.htaccess` in its root to protect its source files and a second one in `public/` to route API calls. XAMPP must support `.htaccess` and `mod_rewrite` (the default XAMPP Apache setup does).

See [backend/README.md](backend/README.md) for module responsibilities, API routes, and the Postman steps.

The account endpoints use PHP/MySQL. Other app data is still being migrated from Firebase. For a deployed frontend, set `VITE_API_BASE_URL` to the deployed API path and configure `APP_ORIGINS` in the backend environment.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally.
- `npm run lint` checks the source with ESLint.
