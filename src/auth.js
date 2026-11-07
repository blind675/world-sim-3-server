'use strict';

const { timingSafeEqual } = require('node:crypto');

function requireControlToken(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const secret = process.env.CONTROL_API_TOKEN;
  if (!secret) return res.status(503).json({ error: 'control_auth_not_configured' });
  const header = req.get('authorization') || '';
  const supplied = /^Bearer (\S+)$/.exec(header)?.[1] || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

module.exports = { requireControlToken };
