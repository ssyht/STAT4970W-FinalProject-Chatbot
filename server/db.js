/**
 * Simple JSON-based data store — no native dependencies.
 * Works on any Node.js version including v24.
 * Data persisted to db/data.json
 */
const fs   = require('fs');
const path = require('path');

const DB_DIR  = path.join(__dirname, '../db');
const DB_FILE = path.join(DB_DIR, 'data.json');

let store = {
  users:        [],
  sessions:     [],
  chat_history: []
};
let nextId = { users: 1, sessions: 1, chat_history: 1 };

function save() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify({ store, nextId }, null, 2));
}

function load() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      store  = data.store  || store;
      nextId = data.nextId || nextId;
    } catch (e) {
      console.warn('Could not parse db/data.json, starting fresh.');
    }
  }
}

async function initDB() {
  load();
  console.log('✅ Database initialized');
  return true;
}

function getDB() {
  return {
    prepare: (sql) => ({
      run: (...params) => {
        const now = new Date().toISOString();
        if (/INSERT INTO users/i.test(sql)) {
          const [name, pawprint] = params;
          store.users.push({ id: nextId.users++, name, pawprint, created_at: now, last_login: now });
          save(); return {};
        }
        if (/UPDATE users SET last_login/i.test(sql)) {
          const u = store.users.find(u => u.pawprint === params[0]);
          if (u) u.last_login = now;
          save(); return {};
        }
        if (/INSERT INTO sessions/i.test(sql)) {
          const [pawprint, session_token] = params;
          store.sessions.push({ id: nextId.sessions++, pawprint, session_token, created_at: now });
          save(); return {};
        }
        if (/INSERT INTO chat_history/i.test(sql)) {
          const [pawprint, role, content, context_level, prompt_specificity, hallucination_risk] = params;
          store.chat_history.push({ id: nextId.chat_history++, pawprint, role, content, context_level, prompt_specificity, hallucination_risk, created_at: now });
          save(); return {};
        }
        return {};
      },
      get: (...params) => {
        if (/FROM users WHERE pawprint/i.test(sql))
          return store.users.find(u => u.pawprint === params[0]) || undefined;
        if (/FROM sessions WHERE session_token/i.test(sql))
          return store.sessions.find(s => s.session_token === params[0]) || undefined;
        if (/COUNT\(\*\)/i.test(sql)) {
          const rows = store.chat_history.filter(r => r.pawprint === params[0] && r.role === 'assistant');
          const risks = rows.map(r => r.hallucination_risk || 0);
          return {
            total_messages: rows.length,
            high_risk:     rows.filter(r => (r.hallucination_risk||0) >= 65).length,
            moderate_risk: rows.filter(r => (r.hallucination_risk||0) >= 35 && (r.hallucination_risk||0) < 65).length,
            low_risk:      rows.filter(r => (r.hallucination_risk||0) < 35).length,
            avg_risk:      risks.length ? +(risks.reduce((a,b)=>a+b,0)/risks.length).toFixed(1) : null
          };
        }
        return undefined;
      },
      all: (...params) => {
        if (/FROM chat_history WHERE pawprint/i.test(sql))
          return store.chat_history
            .filter(r => r.pawprint === params[0])
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 50);
        return [];
      }
    })
  };
}

module.exports = { initDB, getDB };