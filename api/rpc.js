// Vercel serverless function: same-origin proxy from the landing page to Apps Script.
// Env vars (Vercel -> Settings -> Environment Variables): GAS_URL, VERCEL_API_SECRET

const ALLOWED = new Set([
  'getChatbotReply',
  'getLandingPageContent',
  'submitLeadFromUi',
  'submitScheduleFromUi',
  'logAnalyticsEvent',
  'trackEvent',
]);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const GAS_URL = process.env.GAS_URL;
  const SECRET = process.env.VERCEL_API_SECRET;
  if (!GAS_URL || !SECRET) {
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body.fn !== 'string' || !ALLOWED.has(body.fn)) {
    return res.status(400).json({ ok: false, error: 'Not allowed' });
  }
  const args = Array.isArray(body.args) ? body.args : [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  try {
    const upstream = await fetch(GAS_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rpc', apiSecret: SECRET, fn: body.fn, args }),
      signal: controller.signal,
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      return res.status(502).json({ ok: false, error: 'Bad response from Apps Script' });
    }
    return res.status(200).json(data);
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return res.status(504).json({ ok: false, error: timedOut ? 'Apps Script timed out' : 'Upstream error' });
  } finally {
    clearTimeout(timer);
  }
};
