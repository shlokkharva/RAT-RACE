# Rat Racer BDQ — Vadodara & Remote IT Fresher Jobs + 111 Vadodara IT Companies Directory

A **100% free-to-host**, light-themed, mobile-responsive job automation tool, live dashboard, and optional Gmail alert platform built for **IT Freshers & Student Interns in Vadodara (and Verified Remote)** targeting:

- **Data Analyst** (SQL, Power BI, Tableau, Data Associate, Analytics)
- **UI/UX Design** (Figma, Product Design, Web/UI Design)
- **MERN Stack** (MongoDB, Express, React, Node.js)
- **Full-Stack Developer** (Web / Software Developer / Trainee)
- **Python Developer** (Python, Django, Flask, FastAPI, AI/ML)

---

## Key Features

- **Strict Freshers-Only & Anti-WFO Filtering:** Rejects 1.5+/2+ yr experienced roles, non-Vadodara WFO/hybrid jobs mislabeled as Remote, and expired/closed application pages (`404`, `"No longer accepting applications"`, past JSON-LD `validThrough`).
- **Glassdoor + Live Website & Physical Address Verification:** Every remote company must either be verified on Glassdoor OR have a live non-parked official website with a verified physical office address.
- **Direct Vadodara IT Company Careers & Internships:** Live visible-text verification of open Vadodara internship portals (**Trevita Infotech**, **MaMo Technolabs**, **Atyantik Technologies**, **Helios Solutions**, **Zignuts Technolab**) plus live ATS feeds (**Matrix Comsec**, **Maskoid Technologies**, **ABB**, **Mastercard**, **NielsenIQ**).
- **Complete Vadodara IT Companies Directory (`111` Companies):** Searchable by company name, Vadodara area (`Alkapuri`, `Gotri`, `Vasna-Bhayli`, `Akota`, `Manjalpur`, `Waghodia`, `Makarpura`, `Atladara`, `Karelibaug`, `Fatehgunj`, `Gorwa`), tier, and tech stack — with Careers, Glassdoor, and LinkedIn buttons.
- **Optional Gmail Alerts:** Users choose whether to opt in, pick their IT roles & location preference, pause/resume updates anytime, or click **Email Matching Jobs Now**.

---

## Hosting Pipeline on Vercel (Recommended — 100% Free)

### How the Pipeline Works
```text
GitHub Actions (fetch-jobs.yml)
  ├── Scans Vadodara company careers, LinkedIn, Internshala, Unstop, JSearch (Google Jobs)
  ├── Removes expired / WFO / fake remote listings & emails opted-in Gmail users
  └── Commits fresh docs/data/jobs.json to GitHub main
          │
          ▼  (Auto-triggers in ~15 seconds)
Vercel Production Deployment (vercel.json + api/*.js + docs/)
  ├── Serves fast light-themed mobile-responsive Dashboard from /docs
  ├── Runs Serverless APIs: /api/jobs, /api/refresh, /api/subscribe, /api/send-now, /api/report-expired
  └── Runs daily Vercel Cron (/api/cron)
```

### Step 1 — Push Your Project to GitHub
```bash
git init
git add .
git commit -m "Initial commit: Rat Racer BDQ Vadodara IT Fresher Portal"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/RAT-RACER-BDQ.git
git push -u origin main
```
*(Note: `.env` and `data/subscribers.json` are automatically ignored by `.gitignore` so your keys and user emails stay private.)*

### Step 2 — Import into Vercel (3 Clicks)
1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Click **Import** next to your `RAT-RACER-BDQ` repository.
3. Keep the defaults — **`vercel.json` automatically configures `outputDirectory: "docs"` and all `/api/*.js` Serverless Functions!**
4. Add **Environment Variables** in Vercel Project Settings:
   - `RAPIDAPI_KEY` — your RapidAPI JSearch key (pulls Google Jobs / Shine / Jooble / Naukri / Indeed)
   - `GMAIL_USER` — your sender Gmail address *(optional, for live Gmail alerts)*
   - `GMAIL_APP_PASSWORD` — 16-char Google App Password from https://myaccount.google.com/apppasswords
   - `DASHBOARD_URL` — `https://your-project.vercel.app`
   - `INCLUDE_REMOTE_INDIA` = `true`
   - `REQUIRE_GLASSDOOR_FOR_REMOTE` = `true`
5. Click **Deploy**! Your site goes live at `https://your-project.vercel.app`.

### Step 3 — Enable Automated Scheduled Syncing (GitHub Actions)
1. In your GitHub repo, go to **Settings → Secrets and variables → Actions**.
2. Add the same secrets (`RAPIDAPI_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ALERT_EMAIL_TO`, `DASHBOARD_URL`).
3. Go to **Actions → Fetch Vadodara IT Fresher Jobs → Run workflow**.
   - Every time GitHub Actions updates `docs/data/jobs.json`, **Vercel automatically redeploys your live dashboard**!

### Optional — Deploy Directly via CLI or GitHub Actions Workflow
- **Direct CLI deploy:**
  ```bash
  npx vercel login
  npx vercel --prod
  ```
- **GitHub Actions CI/CD deploy (`.github/workflows/deploy-vercel.yml`):**
  Runs `npm test` on every push to `main`, and if you add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub Secrets, deploys directly from GitHub Actions too.

---

## Local Development

```bash
npm install
npm test
npm run serve
```
Open `http://127.0.0.1:4173` (includes live 60-second dynamic auto-fetching + SSE push).
