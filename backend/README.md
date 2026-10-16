# PHP account API

This PHP 8.1+ API uses PDO MySQL with no Composer dependencies. Copy the `backend` folder to `C:/xampp/htdocs/backend` for local XAMPP use. The API is reached at `http://localhost/backend/public`; `.htaccess` rules block requests to private source, config, and SQL files.

## XAMPP setup

1. Start Apache and MySQL in XAMPP Control Panel.
2. Configure database credentials in `config.php` (copy `config.php.example`) or use `.env` for local development. PHP environment variables still take precedence when the host provides them.
3. Import `schema.sql` from phpMyAdmin.
   For a database created from an earlier schema, run `migrations/001_add_user_suspension.sql`, `migrations/002_add_academic_structure.sql`, `migrations/003_add_academic_aliases.sql`, `migrations/004_add_user_study_profile.sql`, `migrations/005_add_papers.sql`, `migrations/006_add_paper_programmes.sql`, `migrations/007_add_paper_department.sql`, `migrations/008_add_user_paper_access.sql`, `migrations/009_add_practice_answer_submissions.sql`, and `migrations/010_add_marking_usage_events.sql` once, in order.
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
| `src/Controllers/AdminPaperController.php` and `src/Repositories/AdminPaperRepository.php` | Admin-only paper library API with paged metadata and JSON question content. |
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
| `GET` | `/backend/public/admin/papers?limit=40&cursor=` | Admin bearer token | Page through SQL papers. Returns `papers` and `nextCursor`. Add `id={id}` to load full paper content. |
| `POST` | `/backend/public/admin/papers` | Admin bearer token | Create a paper with `{ "title": "quiz1|midsemester|quiz2|quiz3|endsemester|project|presentation|sample", "course", "year", "semester": "1|2", "departmentId", "programmeAssignments": [{ "programmeId", "studyYear": 1 }], "questions": [] }`. Exam year must be 2015 through the current year. Returns the saved `paper`. |
| `PATCH` | `/backend/public/admin/papers?id={id}` | Admin bearer token | Replace a paper's metadata, department, programme assignments, and question content. Returns the updated `paper`. |
| `DELETE` | `/backend/public/admin/papers?id={id}` | Admin bearer token | Delete a paper from the SQL library. |
| `GET` | `/backend/public/papers` | Student bearer token | List papers with saved/unlocked state and no question content. |
| `GET` | `/backend/public/papers/detail?id={id}` | Student bearer token | Read paper details; question content is returned only after it is unlocked. |
| `POST` | `/backend/public/papers/saved?id={id}` | Student bearer token | Save a paper to the account. |
| `DELETE` | `/backend/public/papers/saved?id={id}` | Student bearer token | Remove a paper from the account's saved list. |
| `POST` | `/backend/public/papers/unlock?id={id}` | Student bearer token | Spend 20 coins once to unlock a paper. Free coins are used before purchased coins; repeat requests do not charge again. Returns the unlocked paper and updated account balances. |
| `POST` | `/backend/public/papers/answers` | Student bearer token | Submit `{ "paperId": "123", "questionKey": "question-id.part-id", "answer": "..." }` for an unlocked paper. The key must identify a real top-level question or nested subquestion. Stores the latest answer per prompt and queues it with `pending` status for marking. |
| `POST` | `/rt/last_minute/backend/public/marking.php` | Student bearer token | Mark one question in a `questions` array. The endpoint resolves the user from the shared backend session and stores every result or provider failure in `marking_usage_events`. Supply `paperId` and a `paper` snapshot with title, course, and year for useful analytics. |
| `PATCH` | `/backend/public/admin/users?id={id}` | Admin bearer token | Set `{ "isAdmin": true|false }` or `{ "isSuspended": true|false }`. |
| `POST` | `/backend/public/admin/users/gift?id={id}` | Admin bearer token | Add `{ "amount": 50 }` free coins to an account. |
| `GET` | `/backend/public/admin/academics?type=colleges` | Admin bearer token | List colleges. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records`. |
| `GET` | `/backend/public/academics?type=colleges` | Bearer token | Read the academic directory for profile selections. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records` with `id`, `name`, and `alias`. |
| `POST` | `/backend/public/admin/academics` | Admin bearer token | Create `{ "type": "colleges|schools|departments|programmes", "name": "...", "alias": "...", "parentId": "..." }`. `parentId` is required below college level. Returns `record`. |
| `PATCH` | `/backend/public/profile` | Bearer token | Update `{ "username", "phoneNumber", "college", "school", "department", "program", "yearOfStudy", "semesterNumber" }`. Email and account permissions cannot be changed through this route. Returns the updated public user. |

Signup accepts `{ "name", "email", "phone", "password" }`. Login accepts `{ "email", "password" }`. Passwords use PHP's `password_hash` and `password_verify`. The client receives a random 256-bit token; MySQL stores only its SHA-256 digest. Sessions expire after 30 days.

On Hostinger, create `backend/config.php` from `config.php.example` and enter the database name, user, password, and host shown in hPanel. The backend `.htaccess` denies web access to this private PHP configuration file. Do not commit the real config file.

Admin user routes resolve the current bearer session and read the administrator role from MySQL on each request. Suspended accounts cannot sign in or use an existing session. The user list returns only public account fields and never includes password hashes.

The AI marking endpoint uses this backend's `bootstrap.php`, database settings, and active bearer sessions to record per-question usage. Run migration `010_add_marking_usage_events.sql` before using it against an existing database. The public `marking.php` wrapper exposes the marker while the backend root `.htaccess` continues to block direct access to private backend files.

To grant the first administrator, update the account directly in MySQL after registering it: `UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';`. Replace the address with the registered account email.

## Postman

Import `postman/Last-Minute-Auth.postman_collection.json`. The default base URL is `http://localhost/backend/public`. Send the four requests in order. Signup generates a new email and Malawi phone number; it saves the returned token for Login, `/me`, and Logout. If Apache listens on port 8080, change `baseUrl` to `http://localhost:8080/backend/public`.

## Adding an API module

Put HTTP translation in `src/Controllers`, business rules in `src/Services`, and prepared SQL in a focused `src/Repositories` class. Register the route in `bootstrap.php`. Keep credentials server-side and return only public fields from controllers.
