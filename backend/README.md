# PHP account API

This PHP 8.1+ API uses PDO MySQL with no Composer dependencies. Copy the `backend` folder to `C:/xampp/htdocs/backend` for local XAMPP use. The API is reached at `http://localhost/backend/public`; `.htaccess` rules block requests to private source, config, and SQL files.

## XAMPP setup

1. Start Apache and MySQL in XAMPP Control Panel.
2. In the htdocs copy, create `.env` from `.env.example`; set MySQL credentials if they differ from XAMPP defaults.
3. Import `schema.sql` from phpMyAdmin.
   For a database created from an earlier schema, run `migrations/001_add_user_suspension.sql`, `migrations/002_add_academic_structure.sql`, `migrations/003_add_academic_aliases.sql`, and `migrations/004_add_user_study_profile.sql` once, in order.
4. Ensure Apache has `AllowOverride All` and `mod_rewrite` enabled.
5. Start Vite in the project workspace. Its `/backend/*` proxy sends API requests to XAMPP Apache.

## Modules

| Path | Responsibility |
| --- | --- |
| `public/index.php` | Apache front controller. |
| `public/.htaccess` | Allows API entry and rewrites routes to `index.php`. |
| `.htaccess` | Denies direct web access to backend source/config files. |
| `bootstrap.php` | Namespace loader, service wiring, CORS, dispatch, error boundary. |
| `src/Config/Environment.php` | Process and local environment settings. |
| `src/Config/Database.php` | PDO MySQL connection. |
| `src/Http/` | HTTP request parsing, JSON responses, API exceptions. |
| `src/Routing/Router.php` | Explicit method/path route registry. |
| `src/Controllers/AuthController.php` | HTTP handlers for auth routes. |
| `src/Services/AuthService.php` | Validation, password hashing, and session behavior. |
| `src/Repositories/` | Prepared SQL queries for users and sessions. |
| `src/Controllers/AdminAcademicController.php` and `src/Repositories/AcademicStructureRepository.php` | Admin-only academic directory API and SQL hierarchy. |
| `src/Middleware/Authenticate.php` | Bearer-session validation. |
| `src/Support/UserSerializer.php` | Safe public user response shape. |
| `schema.sql` | Account and session table definitions. |

## Auth routes

Errors use `{ "message": "..." }` JSON.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/backend/public/auth/register` | Public | Create an account and session. |
| `POST` | `/backend/public/auth/login` | Public | Verify email/password and create a session. |
| `GET` | `/backend/public/auth/me` | Bearer token | Read the current account. |
| `POST` | `/backend/public/auth/logout` | Bearer token | Revoke the current session. |
| `GET` | `/backend/public/admin/users?limit=40&search=&cursor=` | Admin bearer token | Search and page through SQL accounts. Returns `users` and `nextCursor`. |
| `PATCH` | `/backend/public/admin/users?id={id}` | Admin bearer token | Set `{ "isAdmin": true|false }` or `{ "isSuspended": true|false }`. |
| `POST` | `/backend/public/admin/users/gift?id={id}` | Admin bearer token | Add `{ "amount": 50 }` free coins to an account. |
| `GET` | `/backend/public/admin/academics?type=colleges` | Admin bearer token | List colleges. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records`. |
| `GET` | `/backend/public/academics?type=colleges` | Bearer token | Read the academic directory for profile selections. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records` with `id`, `name`, and `alias`. |
| `POST` | `/backend/public/admin/academics` | Admin bearer token | Create `{ "type": "colleges|schools|departments|programmes", "name": "...", "alias": "...", "parentId": "..." }`. `parentId` is required below college level. Returns `record`. |
| `PATCH` | `/backend/public/profile` | Bearer token | Update `{ "username", "phoneNumber", "college", "school", "department", "program", "yearOfStudy", "semesterNumber" }`. Email and account permissions cannot be changed through this route. Returns the updated public user. |

Signup accepts `{ "name", "email", "phone", "password" }`. Login accepts `{ "email", "password" }`. Passwords use PHP's `password_hash` and `password_verify`. The client receives a random 256-bit token; MySQL stores only its SHA-256 digest. Sessions expire after 30 days.

Admin user routes resolve the current bearer session and read the administrator role from MySQL on each request. Suspended accounts cannot sign in or use an existing session. The user list returns only public account fields and never includes password hashes.

To grant the first administrator, update the account directly in MySQL after registering it: `UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';`. Replace the address with the registered account email.

## Postman

Import `postman/Last-Minute-Auth.postman_collection.json`. The default base URL is `http://localhost/backend/public`. Send the four requests in order. Signup generates a new email and Malawi phone number; it saves the returned token for Login, `/me`, and Logout. If Apache listens on port 8080, change `baseUrl` to `http://localhost:8080/backend/public`.

## Adding an API module

Put HTTP translation in `src/Controllers`, business rules in `src/Services`, and prepared SQL in a focused `src/Repositories` class. Register the route in `bootstrap.php`. Keep credentials server-side and return only public fields from controllers.
