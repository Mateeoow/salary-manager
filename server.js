const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'salary-manager.db'));

db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS salary_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL CHECK(amount >= 0),
    pay_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salary_record_id INTEGER NOT NULL REFERENCES salary_records(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL CHECK(amount >= 0),
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultCategories = ['Groceries', 'Rent', 'Utilities', 'Fare', 'Savings'];
const insertDefault = db.prepare('INSERT OR IGNORE INTO categories (name, is_default) VALUES (?, 1)');
for (const category of defaultCategories) insertDefault.run(category);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function numeric(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error(`${fieldName} must be a non-negative number.`);
    error.status = 400;
    throw error;
  }
  return Math.round(parsed * 100) / 100;
}

function requiredText(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!text) {
    const error = new Error(`${fieldName} is required.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function getCategories() {
  return db.prepare(`
    SELECT id, name, is_default AS isDefault
    FROM categories
    ORDER BY is_default DESC, name COLLATE NOCASE
  `).all();
}

function getSalaryRecords() {
  return db.prepare(`
    SELECT
      s.id,
      s.amount,
      s.pay_date AS payDate,
      s.notes,
      COALESCE(SUM(d.amount), 0) AS totalDeductions,
      s.amount - COALESCE(SUM(d.amount), 0) AS remaining
    FROM salary_records s
    LEFT JOIN deductions d ON d.salary_record_id = s.id
    GROUP BY s.id
    ORDER BY s.pay_date DESC, s.id DESC
  `).all();
}

function getSalary(id) {
  return db.prepare(`
    SELECT id, amount, pay_date AS payDate, notes
    FROM salary_records
    WHERE id = ?
  `).get(id);
}

function getDeductions(salaryId) {
  return db.prepare(`
    SELECT
      d.id,
      d.amount,
      d.description,
      d.category_id AS categoryId,
      c.name AS categoryName
    FROM deductions d
    JOIN categories c ON c.id = d.category_id
    WHERE d.salary_record_id = ?
    ORDER BY d.id DESC
  `).all(salaryId);
}

app.get('/api/bootstrap', (_req, res) => {
  res.json({ categories: getCategories(), salaries: getSalaryRecords() });
});

app.get('/api/salaries/:id', (req, res) => {
  const salary = getSalary(Number(req.params.id));
  if (!salary) return res.status(404).json({ error: 'Salary record not found.' });
  res.json({ ...salary, deductions: getDeductions(salary.id) });
});

app.post('/api/salaries', (req, res, next) => {
  try {
    const amount = numeric(req.body.amount, 'Salary');
    const payDate = requiredText(req.body.payDate, 'Pay date');
    const result = db.prepare('INSERT INTO salary_records (amount, pay_date, notes) VALUES (?, ?, ?)')
      .run(amount, payDate, String(req.body.notes ?? '').trim());
    res.status(201).json(getSalary(result.lastInsertRowid));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/salaries/:id', (req, res) => {
  const result = db.prepare('DELETE FROM salary_records WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Salary record not found.' });
  res.status(204).end();
});

app.post('/api/salaries/:id/deductions', (req, res, next) => {
  try {
    const salaryId = Number(req.params.id);
    if (!getSalary(salaryId)) return res.status(404).json({ error: 'Salary record not found.' });
    const categoryId = Number(req.body.categoryId);
    if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
      return res.status(400).json({ error: 'Please select a valid category.' });
    }
    const amount = numeric(req.body.amount, 'Deduction');
    const result = db.prepare(`
      INSERT INTO deductions (salary_record_id, category_id, amount, description)
      VALUES (?, ?, ?, ?)
    `).run(salaryId, categoryId, amount, String(req.body.description ?? '').trim());
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/deductions/:id', (req, res) => {
  const result = db.prepare('DELETE FROM deductions WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Deduction not found.' });
  res.status(204).end();
});

app.post('/api/categories', (req, res, next) => {
  try {
    const name = requiredText(req.body.name, 'Category name');
    if (name.length > 40) return res.status(400).json({ error: 'Category names must be 40 characters or fewer.' });
    const result = db.prepare('INSERT INTO categories (name, is_default) VALUES (?, 0)').run(name);
    res.status(201).json({ id: result.lastInsertRowid, name, isDefault: 0 });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That category already exists.' });
    next(error);
  }
});

app.delete('/api/categories/:id', (req, res, next) => {
  try {
    const category = db.prepare('SELECT is_default AS isDefault FROM categories WHERE id = ?').get(Number(req.params.id));
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    if (category.isDefault) return res.status(400).json({ error: 'Default categories cannot be removed.' });
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    if (String(error.message).includes('FOREIGN KEY')) return res.status(400).json({ error: 'This category is used by an expense and cannot be removed.' });
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' });
});

app.listen(port, () => {
  console.log(`Salary Manager is running at http://localhost:${port}`);
});
