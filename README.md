# Salary Manager

A simple personal finance dashboard for tracking each salary and assigning deductions to categories such as groceries, rent, utilities, fare, and savings.

## Features

- Track multiple salary records by pay date
- Add deductions to a specific salary
- Default categories included automatically
- Add and remove custom categories
- See total salary, deductions, and remaining balance
- Persist data in a local SQLite database
- Responsive dashboard for desktop and mobile

## Run locally

Requires Node.js 22.5 or newer (the app uses Node's built-in SQLite support).

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The database file is created automatically at `data/salary-manager.db`.

## Suggested next steps

- Add user authentication for a multi-user version
- Add monthly charts and category totals
- Add edit buttons for salary and deduction records
- Deploy the API with a hosted PostgreSQL database such as Supabase
