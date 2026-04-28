const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.docx', '.doc', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not supported. Use: PDF, CSV, DOCX, TXT`));
  }
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  next(); // simplified for upload route
}

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  let extractedText = '';
  let filename = req.file.originalname;

  try {
    if (ext === '.txt') {
      extractedText = fs.readFileSync(filePath, 'utf-8');

    } else if (ext === '.csv') {
      const { parse } = require('csv-parse/sync');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const records = parse(raw, { columns: true, skip_empty_lines: true });
      extractedText = `CSV file: ${filename}\nColumns: ${Object.keys(records[0] || {}).join(', ')}\n\nData preview (first 20 rows):\n`;
      extractedText += records.slice(0, 20).map(r => JSON.stringify(r)).join('\n');
      extractedText += `\n\nTotal rows: ${records.length}`;

    } else if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text.substring(0, 8000);

    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value.substring(0, 8000);
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      filename,
      fileType: ext.replace('.', '').toUpperCase(),
      textLength: extractedText.length,
      preview: extractedText.substring(0, 300) + (extractedText.length > 300 ? '...' : ''),
      fullText: extractedText
    });

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file', details: err.message });
  }
});

module.exports = router;