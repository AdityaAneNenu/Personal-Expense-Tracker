import { getProfile } from '../services/auth.js';

export async function me(req, res) {
  res.json({ data: await getProfile(req.auth.uid) });
}
