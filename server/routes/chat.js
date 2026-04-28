const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { getDB } = require('../db');

// Hallucination risk scores based on logistic regression from the paper
// π(c,s) = 1 / (1 + e^-(β0 + β1*c + β2*s))
// β0=1.4, β1=-0.9, β2=-0.7
function computeHallucinationRisk(contextLevel, isSpecific) {
  const beta0 = 1.4, beta1 = -0.9, beta2 = -0.7;
  const c = contextLevel; // 0=NC, 1=PC, 2=FC
  const s = isSpecific ? 1 : 0;
  const logOdds = beta0 + beta1 * c + beta2 * s;
  return Math.round((1 / (1 + Math.exp(-logOdds))) * 100);
}

function getRiskLabel(risk) {
  if (risk >= 65) return { label: 'High Risk', color: '#CF4500' };
  if (risk >= 35) return { label: 'Moderate Risk', color: '#F37338' };
  return { label: 'Low Risk', color: '#3A7D44' };
}

function buildSystemPrompt(contextLevel, isSpecific, uploadedContext) {
  let systemText = `You are an AI assistant in the Hallucination Explorer tool, built for STAT 4970W at the University of Missouri. 
Your role is to help users understand LLM hallucination in scientific and statistical settings.

You are currently operating under the following experimental condition:
- Context Level: ${contextLevel === 0 ? 'No Context (NC)' : contextLevel === 1 ? 'Partial Context (PC)' : 'Full Context (FC)'}
- Prompt Specificity: ${isSpecific ? 'Specific (S) — report only derivable information, avoid fabrication' : 'General (G) — summarize freely'}`;

  if (uploadedContext) {
    systemText += `\n\nUploaded document context:\n${uploadedContext.substring(0, 4000)}`;
  }

  if (contextLevel === 0) {
    systemText += `\n\nYou have NO background data provided. Answer based on general knowledge only. Be honest about uncertainty.`;
  } else if (contextLevel === 1) {
    systemText += `\n\nYou have PARTIAL context — study design is described but specific numerical results are not always given.`;
  } else {
    systemText += `\n\nYou have FULL context — complete statistical output is available. Derive answers directly from provided data.`;
  }

  if (isSpecific) {
    systemText += `\n\nIMPORTANT: Report ONLY information derivable from provided data. If a value is not in the context, say so explicitly. Do not fabricate statistics, p-values, or results.`;
  }

  return systemText;
}

// Middleware: validate token
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDB();
  const session = db.prepare('SELECT * FROM sessions WHERE session_token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });

  req.pawprint = session.pawprint;
  next();
}

// POST /api/chat/message
router.post('/message', authMiddleware, async (req, res) => {
  const { message, contextLevel = 0, isSpecific = false, conversationHistory = [], uploadedContext = null } = req.body;

  if (!message) return res.status(400).json({ error: 'Message is required' });

  const hallucinationRisk = computeHallucinationRisk(contextLevel, isSpecific);
  const riskInfo = getRiskLabel(hallucinationRisk);
  const systemPrompt = buildSystemPrompt(contextLevel, isSpecific, uploadedContext);

  // Build messages array for API
  const messages = [
    ...conversationHistory.slice(-10), // last 10 turns for context window
    { role: 'user', content: message }
  ];

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback demo mode if no API key
      const db = getDB();
      db.prepare(`INSERT INTO chat_history (pawprint, role, content, context_level, prompt_specificity, hallucination_risk) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(req.pawprint, 'user', message, String(contextLevel), isSpecific ? 'specific' : 'general', hallucinationRisk);

      const demoReply = `[DEMO MODE — Set ANTHROPIC_API_KEY in .env to enable AI responses]\n\nYour question: "${message}"\n\nCondition: ${contextLevel === 0 ? 'No Context' : contextLevel === 1 ? 'Partial Context' : 'Full Context'} + ${isSpecific ? 'Specific' : 'General'} prompt\nEstimated hallucination risk: ${hallucinationRisk}%`;

      db.prepare(`INSERT INTO chat_history (pawprint, role, content, context_level, prompt_specificity, hallucination_risk) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(req.pawprint, 'assistant', demoReply, String(contextLevel), isSpecific ? 'specific' : 'general', hallucinationRisk);

      return res.json({
        reply: demoReply,
        hallucinationRisk,
        riskLabel: riskInfo.label,
        riskColor: riskInfo.color,
        condition: { contextLevel, isSpecific }
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('API error:', data);
      return res.status(500).json({ error: 'AI service error', details: data.error?.message });
    }

    const reply = data.content?.[0]?.text || 'No response generated.';

    // Save to DB
    const db = getDB();
    db.prepare(`INSERT INTO chat_history (pawprint, role, content, context_level, prompt_specificity, hallucination_risk) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.pawprint, 'user', message, String(contextLevel), isSpecific ? 'specific' : 'general', hallucinationRisk);
    db.prepare(`INSERT INTO chat_history (pawprint, role, content, context_level, prompt_specificity, hallucination_risk) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.pawprint, 'assistant', reply, String(contextLevel), isSpecific ? 'specific' : 'general', hallucinationRisk);

    res.json({
      reply,
      hallucinationRisk,
      riskLabel: riskInfo.label,
      riskColor: riskInfo.color,
      condition: { contextLevel, isSpecific }
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// GET /api/chat/history
router.get('/history', authMiddleware, (req, res) => {
  const db = getDB();
  const history = db.prepare('SELECT * FROM chat_history WHERE pawprint = ? ORDER BY created_at DESC LIMIT 50').all(req.pawprint);
  res.json({ history });
});

// GET /api/chat/stats - session stats
router.get('/stats', authMiddleware, (req, res) => {
  const db = getDB();
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_messages,
      COUNT(CASE WHEN hallucination_risk >= 65 THEN 1 END) as high_risk,
      COUNT(CASE WHEN hallucination_risk >= 35 AND hallucination_risk < 65 THEN 1 END) as moderate_risk,
      COUNT(CASE WHEN hallucination_risk < 35 THEN 1 END) as low_risk,
      AVG(hallucination_risk) as avg_risk
    FROM chat_history WHERE pawprint = ? AND role = 'assistant'
  `).get(req.pawprint);
  res.json(stats);
});

module.exports = router;