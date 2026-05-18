#!/usr/bin/env node
/**
 * Skill Singularity Compiler — Phase 42
 *
 * Reads all functional skill files from must-b-skills/ (commands, agents,
 * hooks, SKILL.md) and compiles them into a single embedded JSON bundle at
 * src/core/embedded-skills.json.
 *
 * Explicitly excluded:
 *   - demo.gif, LICENSE.md, README.md, CHANGELOG.md, SECURITY.md
 *   - .github/, .vscode/, .devcontainer/, examples/, scripts/, Script/
 *   - Any binary / non-UTF8 file
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SKILLS_BASE = path.join(ROOT, 'must-b-skills');
const OUT_FILE    = path.join(ROOT, 'src', 'core', 'embedded-skills.json');

// ── Blocklists ──────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  '.github', '.vscode', '.devcontainer',
  'examples', 'scripts', 'Script', 'node_modules',
  'references', 'hooks-handlers',   // docs-only
]);

const SKIP_FILES = new Set([
  'README.md', 'CHANGELOG.md', 'SECURITY.md', 'LICENSE.md',
  'LICENSE', 'LICENSE.txt', 'demo.gif',
]);

const ALLOWED_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt']);

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name) {
  return name
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const PLUGIN_EMOJIS = {
  'agent-sdk-dev':             '🤖',
  'claude-opus-4-5-migration': '⬆️',
  'code-review':               '🔍',
  'commit-commands':           '📦',
  'explanatory-output-style':  '📝',
  'feature-dev':               '🚀',
  'frontend-design':           '🎨',
  'hookify':                   '🪝',
  'learning-output-style':     '📚',
  'finance-core':              '📈',
  'os-tools':                  '🖥️',
  'plugin-dev':                '🔌',
  'pr-review-toolkit':         '🔎',
  'ralph-wiggum':              '🎭',
  'security-guidance':         '🔒',
  'global':                    '🌐',
};

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { name: '', description: '', argumentHint: '', allowedTools: [], body: content };

  const fm   = match[1];
  const body = match[2] ?? '';

  let name = '';
  const np = fm.match(/^name:\s*(.+)$/m);
  if (np) name = np[1].trim().replace(/^["']|["']$/g, '');

  let description = '';
  const dq = fm.match(/^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m);
  if (dq) {
    description = dq[1].replace(/\\"/g, '"');
  } else {
    const dp = fm.match(/^description:\s*(.+)$/m);
    if (dp) description = dp[1].trim().replace(/^["']|["']$/g, '');
  }

  let argumentHint = '';
  const ah = fm.match(/^argument-hint:\s*(.+)$/m);
  if (ah) argumentHint = ah[1].trim().replace(/^["'\[]|["'\]]$/g, '');

  let allowedTools = [];
  const atLine = fm.match(/^allowed-tools:\s*([\s\S]*?)(?=\n\S|$)/m);
  if (atLine) {
    const raw = atLine[1].trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allowedTools = parsed.map(String);
      } catch {
        allowedTools = raw.replace(/^\[|\]$/g, '').split(',')
          .map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      }
    } else {
      allowedTools = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return { name, description, argumentHint, allowedTools, body };
}

function buildEntry(filePath, fileName, pluginName, idPrefix, extraTags) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return null; }

  const { name: fmName, description, argumentHint, allowedTools, body } = parseFrontmatter(content);
  const fileSlug    = slugify(fileName);
  const id          = `${idPrefix}-${fileSlug}`;
  const emoji       = PLUGIN_EMOJIS[pluginName] ?? '🔧';
  const displayName = fmName || fileSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return {
    id,
    name:         displayName,
    description:  description || displayName,
    emoji,
    tags:         ['imported', 'claude-code', pluginName, ...extraTags],
    pluginName,
    commandFile:  fileName,
    allowedTools,
    argumentHint,
    promptBody:   body,
    hasScripts:   false,
    requires:     {},
  };
}

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadDir(dir, pluginName, idPrefix, extraTags) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (!entry.name.endsWith('.md')) continue;
    const skill = buildEntry(path.join(dir, entry.name), entry.name, pluginName, idPrefix, extraTags);
    if (skill) skills.push(skill);
  }
  return skills;
}

function loadSkillsRecursive(skillsDir, pluginName) {
  if (!fs.existsSync(skillsDir)) return [];
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        const rel     = path.relative(skillsDir, path.join(dir, entry.name));
        const relSlug = rel.replace(/[\\/]/g, '-').replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        const skill   = buildEntry(
          path.join(dir, entry.name),
          entry.name,
          pluginName,
          `cc-${slugify(pluginName)}-skill-${relSlug}`,
          ['skill'],
        );
        if (skill) {
          skill.id = `cc-${slugify(pluginName)}-skill-${relSlug}`;
          results.push(skill);
        }
      }
    }
  }

  walk(skillsDir);
  return results;
}

function loadHooks(hooksDir, pluginName) {
  if (!fs.existsSync(hooksDir)) return [];
  const entries = fs.readdirSync(hooksDir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name))) continue;
    const skill = buildEntry(
      path.join(hooksDir, entry.name),
      entry.name,
      pluginName,
      `cc-${slugify(pluginName)}-hook`,
      ['hook'],
    );
    if (skill) skills.push(skill);
  }
  return skills;
}

// ── Main scan ────────────────────────────────────────────────────────────────

function scan() {
  if (!fs.existsSync(SKILLS_BASE)) {
    console.error(`[bundle-skills] ERROR: must-b-skills/ not found at ${SKILLS_BASE}`);
    process.exit(1);
  }

  const all = [];

  // Global .claude/commands/
  const globalCmds = path.join(SKILLS_BASE, '.claude', 'commands');
  all.push(...loadDir(globalCmds, 'global', 'cc-global', ['command', 'global']));

  // Per-plugin
  const pluginsRoot = path.join(SKILLS_BASE, 'plugins');
  if (fs.existsSync(pluginsRoot)) {
    for (const entry of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const pluginDir  = path.join(pluginsRoot, entry.name);
      const pluginName = entry.name;
      const pSlug      = slugify(pluginName);

      all.push(...loadDir(path.join(pluginDir, 'commands'), pluginName, `cc-${pSlug}`, ['command']));
      all.push(...loadDir(path.join(pluginDir, 'agents'),   pluginName, `cc-${pSlug}-agent`, ['agent']));
      all.push(...loadSkillsRecursive(path.join(pluginDir, 'skills'), pluginName));
      all.push(...loadHooks(path.join(pluginDir, 'hooks'), pluginName));
    }
  }

  // Deduplicate by id
  const seen   = new Set();
  const deduped = all.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  deduped.sort((a, b) => a.id.localeCompare(b.id));
  return deduped;
}

// ── Write output ─────────────────────────────────────────────────────────────

const skills  = scan();
const bundle  = {
  version:     '1.71.4',
  generatedAt: new Date().toISOString(),
  count:        skills.length,
  skills,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2), 'utf8');

console.log(`[bundle-skills] ✓ Compiled ${skills.length} skills → ${path.relative(ROOT, OUT_FILE)}`);
