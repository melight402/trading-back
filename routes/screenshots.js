import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsPath = process.env.SCREENSHOTS_PATH || path.join(__dirname, '../data/screenshots');

if (!fs.existsSync(screenshotsPath)) {
  fs.mkdirSync(screenshotsPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, screenshotsPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}_${Math.random().toString(36).substring(7)}.png`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const router = express.Router();

router.post('/upload', upload.single('screenshot'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    filename: req.file.filename,
    path: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(screenshotsPath, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }

  res.sendFile(filePath);
});

export default router;

