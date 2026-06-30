require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '..', 'code.html'));
});

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, RECIPIENT_NUMBER, PORT } = process.env;

function buildMessage(r) {
  return '*ITR FILING CONFIRMATION — AY ' + r.ay + '*\n'
    + '*Shravan Kumar B & Co., Chartered Accountants*\n'
    + '────────────────────────────\n'
    + '*Submission ID:* ' + r.id + '\n'
    + '*Date & Time:* ' + r.date + ' at ' + r.time + '\n\n'
    + '*Taxpayer Details*\n'
    + '• Name: ' + r.name + '\n'
    + '• Mobile: ' + r.mobile + '\n\n'
    + '*Questionnaire Responses*\n'
    + '1️⃣ Director in any company? → *' + r.q1 + '*\n'
    + '2️⃣ Partner in any firm? → *' + r.q2 + '*\n'
    + '3️⃣ Old Regime in AY 2025-26? → *' + r.q3 + '*\n'
    + '4️⃣ All provisions explained? → *' + r.q4 + '*\n'
    + '5️⃣ OTP consent given? → *' + r.q5 + '*\n'
    + '6️⃣ Computation verified? → *' + r.q6 + '*\n\n'
    + '*Consent Declarations*\n'
    + '✅ Declaration read and accepted in full\n'
    + '✅ Authorised SKBCO to file ITR for AY ' + r.ay + '\n'
    + '✅ OTP consent given for e-verification\n\n'
    + '_Digitally recorded via SKBCO Client Portal on ' + r.date + ' at ' + r.time + '_';
}

app.post('/api/send-whatsapp', async (req, res) => {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !RECIPIENT_NUMBER) {
    return res.status(500).json({ ok: false, error: 'Server is missing WhatsApp API configuration. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and RECIPIENT_NUMBER in server/.env' });
  }

  const r = req.body;
  const required = ['id', 'name', 'mobile', 'date', 'time', 'ay', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
  for (const k of required) {
    if (!r || r[k] === undefined || r[k] === null) {
      return res.status(400).json({ ok: false, error: 'Missing field: ' + k });
    }
  }

  try {
    const resp = await fetch(
      'https://graph.facebook.com/v20.0/' + WHATSAPP_PHONE_NUMBER_ID + '/messages',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + WHATSAPP_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: RECIPIENT_NUMBER,
          type: 'text',
          text: { body: buildMessage(r) }
        })
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      console.error('WhatsApp API error:', data);
      return res.status(resp.status).json({ ok: false, error: data });
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error('Failed to send WhatsApp message:', err);
    res.status(500).json({ ok: false, error: 'Failed to reach WhatsApp API' });
  }
});

const port = PORT || 3000;
app.listen(port, () => console.log('SKBCO WhatsApp server running on http://localhost:' + port));
