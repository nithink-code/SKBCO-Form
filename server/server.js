require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '..', 'code.html'));
});

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, RECIPIENT_NUMBER, PORT } = process.env;

// ── PDF GENERATION ──
function buildPdf(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text('Shravan kumar B and Co, Chartered Accountants', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#555').text('Mangaluru | Kasaragod | office.skbco@gmail.com', { align: 'center' });
    doc.moveDown(0.8);
    doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text('ITR FILING CONFIRMATION REPORT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Assessment Year: ' + r.ay + '  |  Financial Year: ' + r.fy, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    doc.fontSize(10).font('Helvetica-Bold').text('Submission ID: ', { continued: true }).font('Helvetica').text(r.id);
    doc.font('Helvetica-Bold').text('Date & Time: ', { continued: true }).font('Helvetica').text(r.date + ' at ' + r.time);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Taxpayer Details');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text('Full Name: ' + r.name);
    doc.text('Mobile Number: ' + r.mobile);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Questionnaire Responses');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    const qs = [
      ['Q1. Were you a Director in any company during FY 2025-26?', r.q1],
      ['Q2. Were you a Partner in any firm during FY 2025-26?', r.q2],
      ['Q3. Were you under Old Regime in AY 2025-26?', r.q3],
      ['Q4. Were all provisions explained by your Tax Professional?', r.q4],
      ['Q5. Do you consent to OTP and authorise SKBCO to file ITR?', r.q5],
      ['Q6. Have you verified the Tax Computation?', r.q6]
    ];
    qs.forEach(([q, a]) => {
      doc.font('Helvetica').text(q);
      doc.font('Helvetica-Bold').text('Answer: ' + a);
      doc.moveDown(0.3);
    });

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).text('Consent Declarations');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text('[YES] I have read and understood the declaration in full.');
    doc.text('[YES] I authorise SKBCO to file my ITR for AY ' + r.ay + '.');
    doc.text('[YES] I consent to OTP for e-verification.');
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(10).text('Authorised by: ' + r.name);
    doc.font('Helvetica').text('Date: ' + r.date + ' at ' + r.time);
    doc.text('Submission ID: ' + r.id);

    doc.end();
  });
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
    // 1. Generate the PDF report
    const pdfBuffer = await buildPdf(r);
    const filename = 'SKBCO_ITR_Confirmation_' + String(r.name).replace(/\s+/g, '_') + '_AY' + r.ay + '.pdf';

    // 2. Upload the PDF to WhatsApp so we get a media id
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);

    const uploadResp = await fetch(
      'https://graph.facebook.com/v20.0/' + WHATSAPP_PHONE_NUMBER_ID + '/media',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + WHATSAPP_TOKEN },
        body: form
      }
    );
    const uploadData = await uploadResp.json();
    if (!uploadResp.ok || !uploadData.id) {
      console.error('WhatsApp media upload error:', uploadData);
      return res.status(uploadResp.status || 500).json({ ok: false, error: uploadData });
    }

    // 3. Send the uploaded PDF as a document message
    const sendResp = await fetch(
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
          type: 'document',
          document: {
            id: uploadData.id,
            filename: filename,
            caption: 'ITR Filing Confirmation — ' + r.name + ' (AY ' + r.ay + ', ID: ' + r.id + ')'
          }
        })
      }
    );

    const sendData = await sendResp.json();
    if (!sendResp.ok) {
      console.error('WhatsApp API error:', sendData);
      return res.status(sendResp.status).json({ ok: false, error: sendData });
    }

    res.json({ ok: true, data: sendData });
  } catch (err) {
    console.error('Failed to send WhatsApp document:', err);
    res.status(500).json({ ok: false, error: 'Failed to reach WhatsApp API' });
  }
});

const port = PORT || 3000;
app.listen(port, () => console.log('SKBCO WhatsApp server listening on http://localhost:' + port));
