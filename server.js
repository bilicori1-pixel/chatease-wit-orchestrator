import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const WIT_API = "https://api.wit.ai";
const V = "20240101";

async function witFetch(path, token, options = {}) {
  const res = await fetch(`${WIT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : {};
}

async function ensureIntent(serverToken, name) {
  try {
    await witFetch(`/intents?v=${V}`, serverToken, {
      method: "POST",
      body: JSON.stringify({ name })
    });
  } catch (e) {
    // ignore if exists
  }
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/train", async (req, res) => {
  try {
    const {
      appId,
      serverToken,
      language = "he",
      intents = [],
      utterances = [],
      responses = {}
    } = req.body;

    if (!appId || !serverToken) {
      return res.status(400).json({ error: "Missing appId/serverToken" });
    }

    for (const intent of intents) {
      await ensureIntent(serverToken, intent);
    }

    const batch = utterances.map(u => ({
      text: u.text,
      intent: u.intent,
      entities: [],
      traits: []
    }));

    if (batch.length > 0) {
      await witFetch(`/utterances?v=${V}`, serverToken, {
        method: "POST",
        body: JSON.stringify(batch)
      });
    }

    try {
      await witFetch(`/apps/${appId}/train?v=${V}`, serverToken, { method: "POST" });
    } catch (e) {
      // ok if not enabled
    }

    return res.json({
      ok: true,
      appId,
      language,
      intentsAdded: intents.length,
      utterancesAdded: utterances.length,
      responsesSaved: Object.keys(responses).length
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/test", async (req, res) => {
  try {
    const { serverToken, sentences = [] } = req.body;
    if (!serverToken) return res.status(400).json({ error: "Missing serverToken" });

    const out = [];
    for (const s of sentences) {
      const j = await witFetch(`/message?v=${V}&q=${encodeURIComponent(s)}`, serverToken);
      const top = (j.intents && j.intents[0]) ? j.intents[0] : { name: null, confidence: 0 };
      out.push({ sentence: s, intent: top.name, confidence: top.confidence });
    }
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ChatEase Orchestrator running on ${port}`));
