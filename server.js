const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
const SECRET_KEY = process.env.JWT_SECRET || 'gumm-crm-secure-key';

// --- DATABASE CONNECTION ---
// --- DATABASE CONNECTION ---
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'Sasank@2003',
    database: process.env.DB_NAME || 'test', // TiDB usually calls the default DB 'test'
    port: process.env.DB_PORT || 4000,       // Added Port (Required for Cloud)
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {                                    // Added SSL (Required for Cloud)
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

// --- MIDDLEWARE (Protects Routes) ---
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access Denied" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = user; // This attaches 'id' and 'org_id' to the request
        next();
    });
};

// ==========================================
// ROUTES
// ==========================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    const { companyName, email, password } = req.body;
    try {
        const [orgResult] = await db.execute('INSERT INTO organizations (name) VALUES (?)', [companyName]);
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO users (org_id, email, password) VALUES (?, ?, ?)', 
            [orgResult.insertId, email, hashedPassword]);

        res.status(201).json({ message: "Registration successful!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed. Email might already exist." });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Invalid credentials" });

        const [orgs] = await db.execute('SELECT name FROM organizations WHERE id = ?', [user.org_id]);
        
        // Include user ID in token for Notes mapping
        const token = jwt.sign({ id: user.id, org_id: user.org_id }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, companyName: orgs[0].name });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Login failed" });
    }
});


// GET LEADS
app.get('/api/leads', authMiddleware, async (req, res) => {
    try {
        const [leads] = await db.execute('SELECT * FROM leads WHERE org_id = ? ORDER BY created_at DESC', [req.user.org_id]);
        res.json(leads);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
});

// CREATE LEAD
app.post('/api/leads', authMiddleware, async (req, res) => {
    const { firstName, email } = req.body;
    try {
        await db.execute('INSERT INTO leads (org_id, first_name, email) VALUES (?, ?, ?)', 
            [req.user.org_id, firstName, email]);
        res.status(201).json({ message: "Lead saved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE STATUS
app.put('/api/leads/:id/status', authMiddleware, async (req, res) => {
    const { status } = req.body;
    try {
        await db.execute('UPDATE leads SET status = ? WHERE id = ? AND org_id = ?', 
            [status, req.params.id, req.user.org_id]);
        res.json({ message: "Status updated" });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

// DELETE LEAD
app.delete('/api/leads/:id', authMiddleware, async (req, res) => {
    try {
        await db.execute('DELETE FROM leads WHERE id = ? AND org_id = ?', 
            [req.params.id, req.user.org_id]);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// GET ANALYTICS
app.get('/api/analytics', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT status, COUNT(*) as count FROM leads WHERE org_id = ? GROUP BY status', [req.user.org_id]);
        const labels = rows.map(r => r.status);
        const counts = rows.map(r => r.count);
        res.json({ labels, counts });
    } catch (err) {
        res.status(500).json({ error: "Analytics error" });
    }
});

// SETTINGS: UPDATE COMPANY NAME
app.put('/api/settings/company', authMiddleware, async (req, res) => {
    const { newName } = req.body;
    try {
        await db.execute('UPDATE organizations SET name = ? WHERE id = ?', [newName, req.user.org_id]);
        res.json({ message: "Updated" });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

// SETTINGS: CHANGE PASSWORD
app.put('/api/settings/password', authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) return res.status(400).json({ error: "Both fields required" });

    try {
        const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: "User not found" });

        const match = await bcrypt.compare(oldPassword, users[0].password);
        if (!match) return res.status(401).json({ error: "Incorrect old password" });

        const newHash = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);
        
        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// ==========================================
// NOTES ROUTES (Now using MySQL & JWT)
// ==========================================

// 1. Get Notes
app.get('/notes', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id; // Got from JWT token
        const [rows] = await db.execute("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC", [userId]);
        res.json(rows);
    } catch (err) {
        console.error("Get Notes Error:", err);
        res.status(500).json({ error: "Failed to fetch notes" });
    }
});

// 2. Add Note
app.post('/notes', authMiddleware, async (req, res) => {
    const { content } = req.body;
    const userId = req.user.id;

    if (!content) return res.status(400).json({ error: "Content is required" });

    try {
        const [result] = await db.execute("INSERT INTO notes (user_id, content) VALUES (?, ?)", [userId, content]);
        res.json({ id: result.insertId, content, created_at: new Date() });
    } catch (err) {
        console.error("Add Note Error:", err);
        res.status(500).json({ error: "Failed to save note" });
    }
});

// 3. Delete Note
app.delete('/notes/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const noteId = req.params.id;

    try {
        await db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [noteId, userId]);
        res.json({ message: "Deleted" });
    } catch (err) {
        console.error("Delete Note Error:", err);
        res.status(500).json({ error: "Failed to delete note" });
    }
});

// --- HANDLE SETTINGS UPDATE (Paste this ABOVE app.listen) ---
app.put('/api/settings', async (req, res) => {
    // 1. Check if user is logged in
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // 2. Verify who the user is
        const decoded = jwt.verify(token, SECRET_KEY);
        const userId = decoded.id;

        // 3. Get the new data from the form
        const { first_name, last_name, phone, job_title } = req.body;

        // 4. Update the database
        await db.query(
            'UPDATE users SET first_name = ?, last_name = ?, phone = ?, job_title = ? WHERE id = ?',
            [first_name, last_name, phone, job_title, userId]
        );

        res.json({ message: "Profile updated successfully!" });
    } catch (err) {
        console.error("Settings Update Error:", err);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

// --- SERVER START ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});