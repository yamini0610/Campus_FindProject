# CampusFind — MySQL + In-app Notifications

A multi-page campus lost-and-found web application for the CAP302 Web Technology academic project. Built with HTML, CSS, browser JavaScript, Node.js, Express and MySQL. Notifications are stored in MySQL and displayed inside the website. SMTP email alerts are supported for matching found items and claim decisions.

## Included
- Responsive redesigned home page with warm cream, navy and coral colours, a custom CSS lost-item illustration, three-step explainer and Get Started CTA
- Register/login with `@sastra.ac.in` format validation and bcrypt password hashing
- Student dashboard, lost/found reporting with optional photo, search, item details, my reports, claims and notification center
- Admin claim review and collected status workflow
- SQL schema and environment configuration example
- Code comments explaining major sections; return-to-dashboard links on workflows

## Setup (Windows / VS Code)
1. Install Node.js 18+ and MySQL Server / MySQL Workbench.
2. Extract the ZIP and open the `CampusFind_Demo` folder in VS Code.
3. In MySQL Workbench, open `schema.sql` and execute the complete script. It creates the `campusfind` database and tables. If you are upgrading an earlier CampusFind database, keep your existing data and run `migrate-existing.sql` once instead of recreating the database.
4. Open a terminal in the `CampusFind_Demo` folder and run `npm install`.
5. Copy `.env.example` to `.env`; set `DB_USER`, `DB_PASSWORD` and a long unique `SESSION_SECRET`. For email alerts, also set the SMTP values described below. Keep `.env` private.
6. Run `npm start` and open `http://localhost:3000/pages/index.html`. Do not use Live Server because the backend API must run.
7. Check `http://localhost:3000/api/health`; `database: connected` confirms MySQL connectivity.

## Create an admin
Register an account through the website, then run this in Workbench:
`USE campusfind; UPDATE users SET role='admin' WHERE email='your-admin@sastra.ac.in';`
Log out and sign in again. Open `/pages/admin.html` to review claims. After a claim is approved, admin can mark the item collected from the item management flow (API endpoint is `PATCH /api/admin/items/:id/collected`).

## Email notifications (required setup)
- When a student reports a found item, CampusFind compares its item name and category against open lost reports by other students.
- For each exact name/category match, the owner gets an in-app notification and an email at the address used for their account.
- Claim approval/rejection also attempts to email the claimant. Email delivery requires SMTP settings; the code cannot send email until these are configured.
- The email contains the item, found location, verification/claim instructions, and College Admin Office collection guidance.

### Configure Gmail SMTP
1. Use a Gmail account dedicated to sending CampusFind messages, if possible.
2. Turn on 2-Step Verification for that Google account and create a Google **App Password**. Do not use your normal Gmail password.
3. In `.env`, fill in `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=your-sender@gmail.com`, `SMTP_PASS=the-16-character-app-password`, and `MAIL_FROM=CampusFind <your-sender@gmail.com>`.
4. Save `.env` and restart the server (`Ctrl+C`, then `npm start`).
5. Sign in to CampusFind and send a test email by opening browser developer tools Console and running: `fetch('/api/email/test',{method:'POST'}).then(r=>r.json()).then(console.log)`. Check inbox and spam. If SMTP is missing, the server reports that email is not configured.
6. Test the full flow with two student accounts: account A reports an item as lost; account B reports the same item name and category as found. Account A should receive an email and an in-site notification. Make sure both accounts use email addresses you can access.

In-site notifications are stored in MySQL and appear on the notification page. Email delivery can fail because of SMTP/network/provider settings; check the server terminal logs if a message is not received. Never share or upload your `.env` or App Password.

## Database details
The `.env` file controls local MySQL settings. Default schema name is `campusfind`, host `localhost`, port `3306`, user `root`. Change values to match your local MySQL setup. Run `schema.sql` before starting the server.

## Academic/demo safety
- Email validation checks format only; it does not prove that the account belongs to a student.
- Use test accounts and dummy items, not real private student data.
- Passwords are stored as bcrypt hashes. Use HTTPS, strong session secrets, rate limiting, CSRF protection and institution-approved hosting before any real deployment.
