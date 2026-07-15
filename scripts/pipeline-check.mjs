#!/usr/bin/env node
/**
 * pipeline-check.mjs — Skill_Master Pipeline Monitor
 *
 * PIPELINE.md tablosunu okur; Departman=Skill_Master AND Durum=IN_PROGRESS
 * olan satırları bulup stdout'a yazar. Görev yoksa sessiz çıkar.
 *
 * Kullanım:
 *   node scripts/pipeline-check.mjs
 *
 * Claude Code UserPromptSubmit hook olarak çalışır —
 * çıktı her oturumda Claude'a otomatik inject edilir.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = resolve(__dirname, '..', 'PIPELINE.md');

if (!existsSync(PIPELINE_PATH)) {
  process.exit(0); // PIPELINE.md yoksa sessiz çık
}

const content = readFileSync(PIPELINE_PATH, 'utf8');

// Markdown tablo satırlarını parse et
// Format: | ID | Departman | Açıklama | Durum | Not |
// (separator satırı |---|---| vb. atlanır)
const TABLE_ROW = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|(?:\s*([^|]*?)\s*\|)?/;

const tasks = [];

for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) continue;
  if (/^\|[-\s|]+\|$/.test(trimmed)) continue; // separator

  const m = trimmed.match(TABLE_ROW);
  if (!m) continue;

  const [, id, department, description, status] = m;

  if (
    department.trim() === 'Skill_Master' &&
    status.trim() === 'IN_PROGRESS'
  ) {
    tasks.push({
      id:          id.trim(),
      description: description.trim().replace(/\*\*/g, ''), // bold işaretlerini kaldır
      status:      status.trim(),
    });
  }
}

if (tasks.length === 0) {
  process.exit(0); // Görev yok, sessiz çık
}

// Görev(ler) bulundu — Claude'a inject edilecek mesajı yaz
const lines = [
  `[PIPELINE] Skill_Master için bekleyen görev${tasks.length > 1 ? 'ler' : ''}:`,
];

for (const t of tasks) {
  lines.push(`  • ${t.id} — ${t.description}`);
}

lines.push('');
lines.push('Bu görev(leri) sırayla çalıştır. Her biri tamamlandığında PIPELINE.md\'deki');
lines.push('ilgili satırın Durum sütununu IN_PROGRESS → DONE olarak güncelle,');
lines.push('Not sütununa "Skill_Master | ' + new Date().toISOString().slice(0, 10) + '" ekle.');

process.stdout.write(lines.join('\n') + '\n');
