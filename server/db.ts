import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function openDb(file = process.env.DB_FILE ?? "server/data/app.db"): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

// Every tenant table carries workspace_id (constitution C9).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, name TEXT NOT NULL, industry TEXT, website TEXT, website_host TEXT,
  city TEXT, country TEXT, phone TEXT, email TEXT, source TEXT, stage TEXT NOT NULL DEFAULT 'Discovered',
  deal_value REAL NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', canvas_notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]', owner TEXT, do_not_contact INTEGER NOT NULL DEFAULT 0, lost_reason TEXT, won_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_leads_ws ON leads(workspace_id);
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, kind TEXT NOT NULL, statement TEXT NOT NULL,
  source_url TEXT, observed_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'verified');
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, run_id INTEGER, json TEXT NOT NULL,
  opportunity_score REAL NOT NULL, research_confidence REAL NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  short_message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, approved_at TEXT, sent_at TEXT);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, sentiment TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER, title TEXT NOT NULL, due_date TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  to_stage TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, agent TEXT NOT NULL, lead_id INTEGER, status TEXT NOT NULL,
  model TEXT, prompt_version TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, name TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT '', price_range TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, lead_id INTEGER NOT NULL, sections TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', industries TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '');
`;

export const nowIso = () => new Date().toISOString();
export const todayStr = () => new Date().toISOString().slice(0, 10);
