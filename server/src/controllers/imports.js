import { parse, importPreviewSchema, importCommitSchema } from '../validators/index.js';
import { previewImport, commitImport } from '../services/imports.js';

export async function preview(req, res) {
  res.json({ data: await previewImport(req.user.id, parse(importPreviewSchema, req.body)) });
}

export async function commit(req, res) {
  const result = await commitImport(req.user.id, parse(importCommitSchema, req.body));
  res.status(result.replayed ? 200 : 201).json({ data: result });
}
