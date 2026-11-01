require('dotenv').config();
const express = require('express'), mysql = require('mysql2/promise'), bcrypt = require('bcryptjs'), session = require('express-session'), MySQLStore = require('express-mysql-session')(session), path = require('path'), crypto = require('crypto'), nodemailer = require('nodemailer');
const app = express(); app.set('trust proxy', 1); app.use(express.json({ limit: '3mb' })); app.use(express.urlencoded({ extended: true }));
const dbOpts = { host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'campusfind' };
const pool = mysql.createPool({ ...dbOpts, waitForConnections: true, connectionLimit: 10 });
const store = new MySQLStore({ ...dbOpts, clearExpired: true, checkExpirationInterval: 900000, expiration: 86400000 });
app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-long-random-secret', resave: false, saveUninitialized: false, store, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 86400000 } }));
app.use(express.static(path.join(__dirname, 'public')));

const collegeEmail = e => /^[^@\s]+@sastra\.ac\.in$/i.test(e || '');
// Email transport is enabled only after SMTP settings are added to the private .env file.
const mailReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
const mailer = mailReady ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE || 'false') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
async function sendEmail({ to, subject, text, html }) {
    if (!mailer) { console.warn(`[EMAIL NOT SENT: SMTP not configured] to=${to} subject=${subject}`); return { sent: false, reason: 'smtp_not_configured' }; } try {
        const info = await mailer.sendMail({
            from: process.env.MAIL_FROM,
            to,
            subject,
            text,
            html
        });


        console.log('EMAIL DEBUG:', {
            to,
            subject,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response
        });

        return {
            sent: true,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response
        };
    } catch (e) { console.error('Email delivery failed:', e.message); return { sent: false, reason: 'send_failed' }; }
}
function matchEmailHtml(name, category, location) { const esc = v => String(v || '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c])); return `<div style="font-family:Arial,sans-serif;background:#f5f2eb;padding:28px;color:#17233b"><div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e7e0d4"><div style="padding:24px 28px;background:#17233b;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#ffb49d">CAMPUSFIND</div><h1 style="margin:10px 0 0;font-size:26px">Good news — a possible match was found!</h1></div><div style="padding:28px"><p>Hello,</p><p>Someone has reported an item that may match the item you reported as lost.</p><div style="background:#f7f4ef;border-radius:12px;padding:16px;margin:20px 0"><p><b>Item:</b> ${esc(name)}</p><p><b>Category:</b> ${esc(category)}</p><p><b>Found near:</b> ${esc(location)}</p><p><b>Status:</b> Possible match — please verify</p></div><p>Sign in to CampusFind and review the details. If it belongs to you, submit a claim with identifying details. Please wait for admin approval before collecting it.</p><p><b>Collection point after approval:</b> College Admin Office</p><p style="margin-top:28px">Thanks,<br><b>CampusFind Team</b></p></div></div></div>`; }
const auth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Please sign in.' });
const admin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' });
// Save user activity in the database
async function logActivity(
    userId,
    activityType,
    description,
    itemId = null,
    claimId = null
) {
    await pool.execute(
        `INSERT INTO activity_history
        (user_id, activity_type, description, related_item_id, related_claim_id)
        VALUES (?, ?, ?, ?, ?)`,
        [userId, activityType, description, itemId, claimId]
    );
}
async function notify(userId, itemId, kind, message) { await pool.execute('INSERT INTO notifications(item_id,user_id,kind,message) VALUES(?,?,?,?)', [itemId, userId, kind, message]); }

app.post('/api/register', async (req, res) => { try { let { name, regno, email, password } = req.body; email = (email || '').trim().toLowerCase(); if (!name || !regno || !collegeEmail(email) || !password || password.length < 8) return res.status(400).json({ error: 'Enter all details, a valid @sastra.ac.in email and password (8+ characters).' }); let hash = await bcrypt.hash(password, 12); let [r] = await pool.execute('INSERT INTO users(name,regno,email,password_hash,role) VALUES(?,?,?,?,\'student\')', [name.trim(), regno.trim(), email, hash]); req.session.user = { id: r.insertId, name: name.trim(), regno: regno.trim(), email, role: 'student' }; res.json({ user: req.session.user }); } catch (e) { res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: e.code === 'ER_DUP_ENTRY' ? 'Email or registration number already exists.' : 'Registration failed.' }); } });
app.post('/api/login', async (req, res) => { try { let email = (req.body.email || '').trim().toLowerCase(), password = req.body.password || ''; let [rows] = await pool.execute('SELECT id,name,regno,email,password_hash,role FROM users WHERE email=?', [email]); if (!rows.length || !await bcrypt.compare(password, rows[0].password_hash)) return res.status(401).json({ error: 'Invalid email or password.' }); let u = rows[0]; req.session.user = { id: u.id, name: u.name, regno: u.regno, email: u.email, role: u.role };await logActivity(
    u.id,
    'login',
    'You logged in successfully.'
); res.json({ user: req.session.user }); } catch (e) { res.status(500).json({ error: 'Login failed.' }); } });
// Admin-only login
app.post('/api/admin/login', async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        const [rows] = await pool.execute(
            'SELECT id, name, regno, email, password_hash, role FROM users WHERE email = ? AND role = ?',
            [email, 'admin']
        );

        if (
            !rows.length ||
            !await bcrypt.compare(password, rows[0].password_hash)
        ) {
            return res.status(401).json({
                error: 'Invalid admin email or password.'
            });
        }

        const u = rows[0];

        req.session.user = {
            id: u.id,
            name: u.name,
            regno: u.regno,
            email: u.email,
            role: u.role
        };

        res.json({
            user: req.session.user,
            message: 'Admin login successful.'
        });

    } catch (e) {
        console.error('Admin login error:', e);

        res.status(500).json({
            error: 'Admin login failed.'
        });
    }
});
app.post('/api/logout', async (req, res) => {
    try {
        const user = req.session.user;

        // Save logout activity before destroying the session
        if (user) {
            await logActivity(
                user.id,
                'logout',
                'You logged out successfully.'
            );
        }

        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({
                    error: 'Logout failed.'
                });
            }

            res.json({ ok: true });
        });
    } catch (error) {
        console.error('Logout activity error:', error);
        res.status(500).json({
            error: 'Could not save logout activity.'
        });
    }
});

app.get('/api/me', (req, res) =>
    res.json({ user: req.session.user || null })
); app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.get('/api/items', async (req, res) => { let [rows] = await pool.execute("SELECT i.*,u.name owner,u.email owner_email FROM items i JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC"); res.json(rows) });
app.post('/api/items', auth, async (req, res) => { try { let { kind, name, category, location, date, time, description, photo, finder } = req.body; if (!['lost', 'found'].includes(kind) || !name || !category || !location || !date || !description) return res.status(400).json({ error: 'Complete required item details.' });console.log('Received time value:', time); if (time) {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const period = match[3].toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        time = `${String(hours).padStart(2, '0')}:${minutes}:00`;
    }
}

console.log('Converted time value:', time);let [r] = await pool.execute('INSERT INTO items(user_id,kind,name,category,location,item_date,item_time,description,photo,finder,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [req.session.user.id, kind, name, category, location, date, time || null, description, photo || null, finder || null, kind]);await logActivity(
    req.session.user.id,
    kind === 'lost' ? 'report_lost' : 'report_found',
    `You reported a ${kind} item: ${name}.`,
    r.insertId
); if (kind === 'lost') { await pool.execute("INSERT INTO notifications(item_id,user_id,kind,message) SELECT ?,id,'campus_lost',? FROM users WHERE id<>?", [r.insertId, `A new lost-item report was posted: ${name} (${category}), last seen at ${location}. Check CampusFind if you have information.`, req.session.user.id]); } else { await notify(req.session.user.id, r.insertId, 'thanks', `Thank you for helping the campus community! Please hand the ${name} to the College Admin Office.`); let [lost] = await pool.execute("SELECT i.id,i.user_id,i.name,i.category,u.email,u.name AS owner_name FROM items i JOIN users u ON u.id=i.user_id WHERE i.kind='lost' AND i.status='lost' AND LOWER(TRIM(i.name))=LOWER(TRIM(?)) AND LOWER(TRIM(i.category))=LOWER(TRIM(?)) AND i.user_id<>?", [name, category, req.session.user.id]); console.log('Matching lost items:', lost.length); for (const x of lost) { const notice = `A possibly matching item (${name}) was found at ${location}. Sign in to review the details and submit a claim if it is yours.`; await notify(x.user_id, r.insertId, 'match', notice); const emailResult = await sendEmail({ to: x.email, subject: `CampusFind: Your lost ${x.name} may have been found`, text: `Hello ${x.owner_name},\n\nGood news! An item matching your lost report may have been found.\nItem: ${name}\nCategory: ${category}\nReported found near: ${location}\n\nPlease sign in to CampusFind to verify the details and submit a claim if it belongs to you. Wait for admin approval before collecting it.\nCollection point after approval: College Admin Office\n\nCampusFind Team`, html: matchEmailHtml(name, category, location) }); console.log('Email result:', x.email, emailResult); } } res.json({ id: r.insertId, message: 'Report saved.', emailNotificationsEnabled: !!mailer }); } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save item.' }) } });
app.get('/api/notifications', auth, async (req, res) => { let [rows] = await pool.execute('SELECT n.*,i.name item_name,i.kind item_kind FROM notifications n JOIN items i ON i.id=n.item_id WHERE n.user_id=? ORDER BY n.sent_at DESC LIMIT 100', [req.session.user.id]); res.json(rows) });
app.patch('/api/notifications/:id/read', auth, async (req, res) => { await pool.execute('UPDATE notifications SET read_at=NOW() WHERE id=? AND user_id=?', [req.params.id, req.session.user.id]); res.json({ message: 'Notification marked as read.' }) });
app.post('/api/claims', auth, async (req, res) => { try { let { itemId, details } = req.body; if (!details || !itemId) return res.status(400).json({ error: 'Item and verification details are required.' }); let [it] = await pool.execute("SELECT id,name,user_id FROM items WHERE id=? AND kind='found' AND status='found'", [itemId]); if (!it.length || it[0].user_id === req.session.user.id) return res.status(400).json({ error: 'This item cannot be claimed.' });
    

const [claimResult] = await pool.execute(
    "INSERT INTO claims(item_id,claimant_id,details,status) VALUES(?,?,?,'pending')",
    [itemId, req.session.user.id, details]
);

await logActivity(
    req.session.user.id,
    'claim_submitted',
    `You submitted a claim for ${it[0].name}.`,
    it[0].id,
    claimResult.insertId
); res.json({ message: 'Claim submitted for admin review.' }); } catch (e) { res.status(500).json({ error: 'Claim submission failed.' }) } });
app.get('/api/claims', auth, async (req, res) => { let q = req.session.user.role === 'admin' ? 'SELECT c.*,i.name item_name,u.name claimant,u.email FROM claims c JOIN items i ON i.id=c.item_id JOIN users u ON u.id=c.claimant_id ORDER BY c.created_at DESC' : 'SELECT c.*,i.name item_name FROM claims c JOIN items i ON i.id=c.item_id WHERE c.claimant_id=? ORDER BY c.created_at DESC'; let [rows] = req.session.user.role === 'admin' ? await pool.execute(q) : await pool.execute(q, [req.session.user.id]); res.json(rows) });
app.patch('/api/claims/:id', auth, admin, async (req, res) => { try { let status = req.body.status; if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid decision.' }); let [rows] = await pool.execute('SELECT c.id,c.claimant_id,c.item_id,i.name,u.email FROM claims c JOIN items i ON i.id=c.item_id JOIN users u ON u.id=c.claimant_id WHERE c.id=?', [req.params.id]); if (!rows.length) return res.status(404).json({ error: 'Claim not found.' }); let c = rows[0]; await pool.execute('UPDATE claims SET status=?,reviewed_at=NOW(),reviewed_by=? WHERE id=?', [status, req.session.user.id, c.id]);await logActivity(
    c.claimant_id,
    status === 'approved' ? 'claim_approved' : 'claim_rejected',
    status === 'approved'
        ? `Your claim for ${c.name} was approved by the admin.`
        : `Your claim for ${c.name} was rejected by the admin.`,
    c.item_id,
    c.id
); if (status === 'approved') await pool.execute("UPDATE items SET status='claimed' WHERE id=?", [c.item_id]); const claimMessage = status === 'approved' ? `Your claim for ${c.name} has been approved. Collect it from the College Admin Office with your Campus ID for verification.` : `Your claim for ${c.name} was not approved. Please contact the College Admin Office for assistance.`; await notify(c.claimant_id, c.item_id, status === 'approved' ? 'claim_approved' : 'claim_rejected', claimMessage); await sendEmail({ to: c.email, subject: status === 'approved' ? `CampusFind: Claim approved for ${c.name}` : `CampusFind: Claim update for ${c.name}`, text: `Hello,\n\n${claimMessage}\n\nCampusFind Team`, html: `<div style="font-family:Arial,sans-serif;padding:24px;color:#17233b"><h2>CampusFind claim update</h2><p>${claimMessage}</p><p>CampusFind Team</p></div>` }); res.json({ message: 'Claim updated; in-app notice created and email attempted.' }); } catch (e) { res.status(500).json({ error: 'Could not update claim.' }) } });
app.get('/api/admin/items', auth, admin, async (req, res) => { let [r] = await pool.execute('SELECT i.*,u.name owner,u.email FROM items i JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC'); res.json(r) });
app.patch('/api/admin/items/:id/collected', auth, admin, async (req, res) => { let [rows] = await pool.execute("SELECT id,user_id,name FROM items WHERE id=? AND status='claimed'", [req.params.id]); if (!rows.length) return res.status(404).json({ error: 'Approved item not found.' }); let it = rows[0]; await pool.execute("UPDATE items SET status='collected' WHERE id=?", [it.id]);await logActivity(
    it.user_id,
    'item_collected',
    `Your item "${it.name}" was marked as collected.`,
    it.id
); await notify(it.user_id, it.id, 'collected', `Your ${it.name} has been marked collected. Thank you for using CampusFind.`); res.json({ message: 'Item marked collected.' }) });
app.post('/api/email/test', auth, async (req, res) => { if (!mailer) return res.status(503).json({ ok: false, error: 'Email is not configured yet. Add SMTP settings to .env and restart the server.' }); const result = await sendEmail({ to: req.session.user.email, subject: 'CampusFind email setup test', text: 'Your CampusFind email configuration is working. This is a test email.', html: '<div style="font-family:Arial,sans-serif;padding:24px"><h2>CampusFind email test</h2><p>Your email configuration is working. This is a test email.</p></div>' }); res.status(result.sent ? 200 : 502).json({ ok: result.sent, message: result.sent ? 'Test email sent. Check your inbox and spam folder.' : 'Could not send test email. Check SMTP settings and server logs.' }); });
app.get('/api/health', async (req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }) } catch (e) { res.status(500).json({ ok: false, database: 'disconnected' }) } });
// Get activity history for the logged-in user
app.get('/api/history', auth, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, activity_type, description,
                    related_item_id, related_claim_id, created_at
             FROM activity_history
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 200`,
            [req.session.user.id]
        );

        res.json(rows);
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            error: 'Could not load activity history.'
        });
    }
});
const port = +(process.env.PORT || 3000); app.listen(port, () => console.log(`CampusFind backend: http://localhost:${port}`));
