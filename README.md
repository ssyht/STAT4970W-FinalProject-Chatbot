# Hallucination Explorer

A browser-based interactive tool built for **STAT 4970W** at the University of Missouri-Columbia. It lets instructors and students explore how LLM hallucination rates shift across the six conditions of a 3 × 2 factorial experiment — varying context level (NC / PC / FC) and prompt specificity (General / Specific) — and see live risk scores derived from the study's logistic regression model.

---

## What it does

- Select a **context level** and **prompt specificity** before each message
- Submit a statistical prompt and receive a simulated LLM response for that condition
- See a **hallucination risk score** (%) and a one-line **verdict** explaining why the current condition produces that risk
- Track session stats: prompts sent, responses flagged, and running average risk
- Use **sample prompts** drawn directly from the study's prompt bank (NC reporting, FC reporting, FC calculation)
- Toggle the scoring panel off for a **predict-before-reveal** classroom exercise

---

## Experimental conditions

The risk scores map directly to the logistic regression model from the paper:

$$\hat{\pi}(c, s) = \frac{1}{1 + e^{-(\hat{\beta}_0 + \hat{\beta}_1 c + \hat{\beta}_2 s)}}$$

with simulated coefficients $\hat{\beta}_0 = 1.4$, $\hat{\beta}_1 = -0.9$, $\hat{\beta}_2 = -0.7$.

| Condition     | Risk  | Level    |
|---------------|-------|----------|
| NC + General  | 78%   | High     |
| NC + Specific | 55%   | Moderate |
| PC + General  | 51%   | Moderate |
| PC + Specific | 34%   | Moderate |
| FC + General  | 24%   | Low      |
| FC + Specific | 14%   | Low      |

---

## Project structure

```
hallucination-explorer/
├── index.html          # Main UI — self-contained, no build step needed
├── img/
│   └── hallucination_explorer_ui.png   # Screenshot used in the paper figure
└── README.md
```

---

## Getting started

No install, no dependencies, no build step. Everything is self-contained in `index.html`.

**Option 1 — open locally:**
```bash
git clone https://github.com/ssyht/hallucination-explorer.git
cd hallucination-explorer
open index.html
```

**Option 2 — serve locally** (recommended to avoid any browser CORS quirks):
```bash
cd hallucination-explorer
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

---

## Classroom usage

The tool is designed around a **predict-before-reveal** exercise:

1. The instructor selects a condition (e.g., NC + General) without telling students
2. Students read the prompt and predict: *will the model hallucinate?*
3. The instructor sends the prompt with the **scoring panel hidden** (toggle off)
4. Students see the response and commit to a verdict
5. The instructor reveals the risk score and discusses why that condition produces that outcome

Working through all six conditions in order (NC → PC → FC, General then Specific at each level) takes roughly 20–25 minutes and covers the full factorial design interactively.

---

## Connecting to a live LLM

By default the tool returns condition-matched placeholder responses. To wire it to a real LLM:

1. Obtain an API key from your LLM provider (e.g., OpenAI)
2. In `index.html`, locate the `replyMap` object in the `<script>` block
3. Replace the static reply strings with a `fetch()` call to your provider's completions endpoint, passing the prompt text and any system instruction appropriate to the condition

```js
async function getLLMReply(prompt, condition) {
  const systemMsg = condition.spec === 's'
    ? 'Report only information derivable from the provided data. Do not fabricate values.'
    : 'Summarize or interpret the following statistical prompt.';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${YOUR_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      temperature: 0,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}
```

When real experimental data are collected, the hardcoded risk scores will also be replaced with empirically fitted values from the finalized logistic regression model.

---

## Authors

Sanjit Subhash, Colin Arbuckle, Derek Dembinsky, Adrian Cantrell  

---

## Related

- Paper: *Data Ethics for AI Workflows: How Context and Prompt Specificity Affect LLM Hallucination in Scientific Settings*
- Dataset: RAGTruth (Niu et al., 2023) — used in prior hallucination analysis by this team
- GitHub: [ssyht](https://github.com/ssyht)
