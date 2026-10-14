import express from 'express';
import { db } from '../db/database.js';

const router = express.Router();

router.get('/', (req, res) => {
  db.all('SELECT value, label, description FROM strategies ORDER BY label COLLATE NOCASE', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch strategies' });
    res.json({ strategies: rows });
  });
});

router.post('/', (req, res) => {
  const value = String(req.body.value || '').trim();
  const label = String(req.body.label || '').trim();
  const description = String(req.body.description || '').trim();

  if (!value || !label) return res.status(400).json({ error: 'value and label are required' });

  db.run(
    'INSERT INTO strategies (value, label, description) VALUES (?, ?, ?)',
    [value, label, description],
    function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Strategy value already exists' });
        return res.status(500).json({ error: 'Failed to create strategy' });
      }
      res.status(201).json({ strategy: { value, label, description } });
    }
  );
});

router.delete('/:value', (req, res) => {
  db.run('DELETE FROM strategies WHERE value = ?', [req.params.value], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete strategy' });
    if (!this.changes) return res.status(404).json({ error: 'Strategy not found' });
    res.json({ success: true });
  });
});

export default router;