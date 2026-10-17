# PHP account API

This PHP 8.1+ API uses PDO MySQL with no Composer dependencies. Copy the `backend` folder to `C:/xampp/htdocs/backend` for local XAMPP use. The API is reached at `http://localhost/backend/public`; `.htaccess` rules block requests to private source, config, and SQL files.

The admin question-image upload route stores images in `public/uploads/question-images` and requires an active PHP API bearer session with administrator access. `public/.user.ini` sets the PHP request limits needed for uploads; PHP-FPM may need a few minutes to reload per-directory settings after deployment.

## XAMPP setup

1. Start Apache and MySQL in XAMPP Control Panel.
2. Configure database credentials in `config.php` (copy `config.php.example`) or use `.env` for local development. PHP environment variables still take precedence when the host provides them.
3. Import `schema.sql` from phpMyAdmin.
   For a database created from an earlier schema, run `migrations/001_add_user_suspension.sql` through `migrations/014_add_group_answer_marks.sql` once, in order.
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
| `POST` | `/backend/public/papers/unlock?id={id}` | Student bearer token | Spend 20 coins to unlock a paper for 24 hours. Free coins are used before purchased coins; repeat requests during the active period do not charge again. After expiry, unlock again to restore access. Returns the unlocked paper, expiry time, and updated account balances. |
| `POST` | `/backend/public/papers/answers` | Student bearer token | Submit `{ "paperId": "123", "questionKey": "question-id.part-id", "answer": "..." }` for an unlocked paper. The key must identify a real top-level question or nested subquestion. Stores the latest answer per prompt and queues it with `pending` status for marking. |
| `POST` | `/backend/public/papers/reports` | Student bearer token | Report `{ "paperId": "123", "category": "Incorrect content", "details": "..." }`. Categories are Incorrect content, Missing content, Wrong paper details, Formatting issue, and Other. Reports start with `open` status. |
| `GET` | `/backend/public/papers/reports?paperId={id}` | Student bearer token | List reported issues for a paper, including category, description, and review status. Reporter identity is private. |
| `GET` | `/backend/public/admin/paper-reports?limit=25&cursor=` | Admin bearer token | Page through submitted paper reports, including reporter and paper details. Returns `reports` and `nextCursor`. |
| `PATCH` | `/backend/public/admin/paper-reports?id={id}` | Admin bearer token | Update `{ "status": "open|reviewing|resolved" }` for a paper report. |
| `GET` | `/backend/public/wallet` | Bearer token | Read the current MySQL coin balances and latest 100 wallet transactions. |
| `GET` | `/backend/public/wallet/operators` | Bearer token | Load mobile money operators from the existing payment service through the backend. |
| `POST` | `/backend/public/wallet/transactions` | Bearer token | Create and initialize a top-up using `{ "packId", "operatorId", "operatorName", "mobile" }`. Coin amounts and MWK charges are fixed by the backend pack catalog. |
| `POST` | `/backend/public/wallet/transactions/verify` | Bearer token | Verify `{ "chargeId" }` with the payment service and credit the authenticated user's MySQL balance once after payment succeeds. |
| `GET` / `POST` | `/backend/public/groups` | Bearer token | List the current user's groups or create `{ "name", "course", "description" }`; the creator becomes the first member. |
| `GET` | `/backend/public/groups/invitations` | Bearer token | List pending invitations for the current account. |
| `POST` | `/backend/public/groups/invitations` | Group owner bearer token | Invite an existing account with `{ "groupId", "email" }`. |
| `POST` | `/backend/public/groups/invitations/respond` | Invited user's bearer token | Accept or decline with `{ "invitationId", "accept" }`. Accepting also adds group membership. |
| `GET` / `POST` | `/backend/public/groups/messages?groupId={id}` | Group member bearer token | Read paged discussion messages or post `{ "text" }`. Older-page requests include `before={messageId}`. |
| `GET` / `POST` | `/backend/public/groups/plans?groupId={id}` | Group member / owner bearer token | List scheduled discussions or create one with `{ "paperId", "scheduledAt" }`. Scheduling is owner-only. Each answerable leaf prompt becomes one ordered step; parent instructions are retained as context without being copied into the child prompt. |
| `POST` | `/backend/public/groups/plans/join?groupId={id}` | Group member bearer token | Join a started discussion with `{ "planId" }`. |
| `POST` | `/backend/public/groups/plans/next?groupId={id}` | Group owner bearer token | Publish the next prompt step for `{ "planId" }`. Only that current step and its responses are shown; the owner advances after the group responds. |
| `POST` | `/backend/public/groups/plans/end?groupId={id}` | Group owner bearer token | End a started discussion with `{ "planId" }`; members can no longer join or respond. |
| `POST` | `/backend/public/groups/plans/mark?groupId={id}` | Group owner bearer token | Save AI results `{ "questionId", "results" }` after all members who joined have answered or passed. Each result must match a response in that discussion. |
| `POST` | `/backend/public/groups/plans/publish-due?groupId={id}` | Group owner bearer token | Automatically publish the first question of due plans. |
| `POST` | `/backend/public/groups/plans/answer?groupId={id}` | Joined discussion member bearer token | Post `{ "questionId", "answer" }` once for the current discussion question. |
| `POST` | `/rt/last_minute/backend/public/marking.php` | Student bearer token | Mark one question in a `questions` array. The endpoint resolves the user from the shared backend session and stores every result or provider failure in `marking_usage_events`. Supply `paperId` and a `paper` snapshot with title, course, and year for useful analytics. Group marking also sends `sourceType: "group_discussion"`, `groupId`, and `discussionId`; the endpoint verifies the authenticated user created that discussion. |
| `PATCH` | `/backend/public/admin/users?id={id}` | Admin bearer token | Set `{ "isAdmin": true|false }` or `{ "isSuspended": true|false }`. |
| `POST` | `/backend/public/admin/users/gift?id={id}` | Admin bearer token | Add `{ "amount": 50 }` free coins to an account. |
| `GET` | `/backend/public/admin/marking?limit=50` | Admin bearer token | View individual practice marking totals and recent attempts, plus group marking totals, per-group usage, and recent answer-level marker events. |
| `GET` | `/backend/public/admin/academics?type=colleges` | Admin bearer token | List colleges. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records`. |
| `GET` | `/backend/public/academics?type=colleges` | Bearer token | Read the academic directory for profile selections. Use `type=schools&parentId={collegeId}`, `type=departments&parentId={schoolId}`, or `type=programmes&parentId={departmentId}` for descendants. Returns `records` with `id`, `name`, and `alias`. |
| `POST` | `/backend/public/admin/academics` | Admin bearer token | Create `{ "type": "colleges|schools|departments|programmes", "name": "...", "alias": "...", "parentId": "..." }`. `parentId` is required below college level. Returns `record`. |
| `PATCH` | `/backend/public/profile` | Bearer token | Update `{ "username", "phoneNumber", "college", "school", "department", "program", "yearOfStudy", "semesterNumber" }`. Email and account permissions cannot be changed through this route. Returns the updated public user. |

Signup accepts `{ "name", "email", "phone", "password" }`. Login accepts `{ "email", "password" }`. Passwords use PHP's `password_hash` and `password_verify`. The client receives a random 256-bit token; MySQL stores only its SHA-256 digest. Sessions expire after 30 days.

On Hostinger, create `backend/config.php` from `config.php.example` and enter the database name, user, password, and host shown in hPanel. Keep `APP_ORIGINS` set to the exact browser origins that should access the API, such as `https://last.nkk-sec.com`; separate multiple origins with commas and do not include URL paths. The backend `.htaccess` denies web access to this private PHP configuration file. Do not commit the real config file. The wallet calls the existing PayChangu PHP endpoints server-to-server; `PAYMENT_API_BASE_URL` sets their base URL.

Admin user routes resolve the current bearer session and read the administrator role from MySQL on each request. Suspended accounts cannot sign in or use an existing session. The user list returns only public account fields and never includes password hashes.

The AI marking endpoint uses this backend's `bootstrap.php`, database settings, and active bearer sessions to record per-question usage. Group discussion requests are tagged with the group and discussion IDs so administrators can review group usage at `/admin/marking`. Run migration `010_add_marking_usage_events.sql` before using the marker against an existing database. Run migration `015_add_group_marking_analytics.sql` after migrations `012` through `014`; it adds group attribution fields and backfills older group events when their response records still exist. The public `marking.php` wrapper exposes the marker while the backend root `.htaccess` continues to block direct access to private backend files. Run migration `011_add_wallet_transactions.sql` on existing databases before opening the Coins screen.

Run migration `016_add_paper_reports.sql` on existing databases before accepting reports through the PHP/MySQL backend.

To grant the first administrator, update the account directly in MySQL after registering it: `UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';`. Replace the address with the registered account email.

## Postman

Import `postman/Last-Minute-Auth.postman_collection.json`. The default base URL is `http://localhost/backend/public`. Send the four requests in order. Signup generates a new email and Malawi phone number; it saves the returned token for Login, `/me`, and Logout. If Apache listens on port 8080, change `baseUrl` to `http://localhost:8080/backend/public`.

## Adding an API module

Put HTTP translation in `src/Controllers`, business rules in `src/Services`, and prepared SQL in a focused `src/Repositories` class. Register the route in `bootstrap.php`. Keep credentials server-side and return only public fields from controllers.
