const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDB } = require('../db');

// Login or register a Mizzou student
router.post('/login', (req, res) => {
  const { name, pawprint } = req.body;

  if (!name || !pawprint) {
    return res.status(400).json({ error: 'Name and pawprint are required.' });
  }

  // Sanitize pawprint: lowercase, alphanumeric only
  const cleanPawprint = pawprint.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const cleanName = name.trim();

  if (!cleanPawprint || cleanPawprint.length < 2) {
    return res.status(400).json({ error: 'Invalid pawprint format.' });
  }

  const db = getDB();

  // Upsert user
  const existing = db.prepare('SELECT * FROM users WHERE pawprint = ?').get(cleanPawprint);

  if (!existing) {
    db.prepare('INSERT INTO users (name, pawprint) VALUES (?, ?)').run(cleanName, cleanPawprint);
  } else {
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE pawprint = ?').run(cleanPawprint);
  }

  // Create session token
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (pawprint, session_token) VALUES (?, ?)').run(cleanPawprint, token);

  const user = db.prepare('SELECT * FROM users WHERE pawprint = ?').get(cleanPawprint);

  res.json({
    success: true,
    token,
    user: {
      name: user.name,
      pawprint: user.pawprint,
      isNew: !existing
    }
  });
});

// Validate session token
router.post('/validate', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ valid: false });

  const db = getDB();
  const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(token);

  if (!session) return res.status(401).json({ valid: false });

  const user = db.prepare('SELECT * FROM users WHERE pawprint = ?').get(session.pawprint);
  res.json({ valid: true, user: { name: user.name, pawprint: user.pawprint } });
});

module.exports = router;