const sqlite3 = require('sqlite3').verbose();

// Connect to the database file
const db = new sqlite3.Database('./crm.db', (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
        console.log("Connected to the SQLite database.");
    }
});

// Initialize tables
db.serialize(() => {
    // 1. Create USERS Table (Existing)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT,
        email TEXT UNIQUE, 
        password TEXT
    )`);

    // 2. Create NOTES Table (New)
    // This links notes to specific users via 'user_id'
    db.run(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log("Database initialized: Users and Notes tables are ready.");
});

module.exports = db;