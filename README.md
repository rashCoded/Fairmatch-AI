# FairMatch AI
### AI-Based Smart Allocation Engine for the PM Internship Scheme

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-1.4.2-F7931E?logo=scikit-learn&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

A policy-aware hybrid recommendation system that automates student-to-internship matching for government internship schemes — combining skill-based filtering, historical placement patterns, and fairness scoring into a single explainable pipeline.

---

## What It Does

Manual internship allocation is slow, inconsistent, and prone to bias. Coordinators read hundreds of student profiles, browse internship listings, and attempt to match them by hand — a process that takes weeks and cannot scale.

FairMatch AI eliminates this. Given a student's skills, background, and profile, the system computes a ranked list of best-fit internships using a three-layer hybrid recommendation engine. Every recommendation is fully explainable — the student knows exactly why they were matched, and the admin can audit every allocation decision.

---

## Recommendation Engine

This is the core of the system. Three independent scoring layers feed into a single weighted formula.

### Layer 1 — Content-Based Filtering (50%)

Measures how well a student's skills match an internship's requirements using cosine similarity on TF-IDF weighted skill vectors. Both the student profile and internship requirements are encoded as TF-IDF vectors. The dot product of these vectors divided by their magnitudes produces a similarity score between 0 and 1.

> **Why TF-IDF over binary matching?** Rare, specialized skills (WebRTC, Alembic) carry more weight than common ones (HTML, Git). TF-IDF handles this naturally without manual weighting.

### Layer 2 — Collaborative Filtering (30%)

Identifies students similar to the current applicant based on historical application and selection patterns. Uses `sklearn.NearestNeighbors` with cosine distance on a student-internship interaction matrix. Interaction scores: `selected = 1.0`, all other statuses = `0.5`.

> **Cold start handling:** When a student has no application history, the collaborative weight (`0.30`) is redistributed to the content layer so ranking quality remains stable: `w_content = 0.80`, `w_collab = 0`.

### Layer 3 — Affirmative Action Scoring (20%)

The policy-aware layer. Adjusts the final score based on scheme guidelines:

| Condition | Score Adjustment |
|-----------|-----------------|
| Rural / aspirational district | +0.30 boost |
| SC / ST category | +0.30 boost |
| OBC category | +0.15 boost |
| First-time applicant | +0.25 boost |
| Internship capacity > 80% filled | −0.20 penalty |

Final affirmative score is clamped between `0.0` and `1.0`.

### Final Score Formula

```
Final Score = (0.50 × Content Score) + (0.30 × Collaborative Score) + (0.20 × Affirmative Score)
```

Weights are configurable via environment variables. Every recommendation returns a full per-component breakdown — every allocation is explainable.

---

## Features

### Student Portal
- JWT authentication with email OTP verification
- Profile builder — skills, education, location, social category, district
- Resume upload (PDF) with automatic skill extraction via `pdfplumber`
- Recommendation dashboard — ranked internship cards with animated match score rings
- Explainability panel — matched skills, missing skills, per-component score reasoning
- Policy boost indicator — shows when affirmative scoring applied and why
- Application submission and real-time status tracking
- Manual recommendation refresh with force recompute

### Admin Portal
- Analytics dashboard — placement rates, category distribution, rural coverage, capacity utilization
- Student directory with filters — category, district, rural status, previous internship
- Internship management — create, edit, deactivate listings
- Bulk allocation — runs recommendation engine for all unmatched students in one pass
- Threshold-based bulk action — select/reject/review applications by score range with dry-run preview and seat limits
- Application detail view — full AI match reasoning before making a decision
- Manual allocation override — assign student to specific internship with seat validation
- Demo reset — clears pending allocations while preserving confirmed placements
- Audit log — every allocation decision recorded immutably with timestamp

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js, TypeScript, Tailwind CSS, ShadCN UI | 16.1.6 / 5 / 4 |
| Animations | Framer Motion | 12.37.0 |
| Charts | Recharts | 3.8.0 |
| HTTP Client | Axios | 1.13.6 |
| Backend | FastAPI, Uvicorn | 0.111.0 / 0.29.0 |
| ML Engine | scikit-learn, NumPy, pandas, joblib | 1.4.2 / 1.26.4 / 2.2.2 / 1.4.2 |
| Database | PostgreSQL, SQLAlchemy ORM, Alembic | 17 / 2.0.30 / 1.13.1 |
| Auth | python-jose, bcrypt, passlib | 3.3.0 / 3.2.2 / 1.7.4 |
| Resume Parsing | pdfplumber | 0.11.4 |
| Validation | Pydantic, pydantic-settings | 2.7.1 / 2.2.1 |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│             Next.js 16 Frontend                 │
│   (TypeScript, Tailwind, ShadCN, Recharts,      │
│    Framer Motion, Radix UI)                     │
└──────────────────────┬──────────────────────────┘
                       │ REST API (JWT Bearer)
┌──────────────────────▼──────────────────────────┐
│               FastAPI Backend                   │
│  /auth  /students  /internships                 │
│  /recommend  /applications  /admin              │
└──────┬────────────────────────────┬─────────────┘
       │                            │
┌──────▼──────┐            ┌────────▼──────────────┐
│ PostgreSQL  │            │      ML Engine        │
│ SQLAlchemy  │            │  SkillVectorizer      │
│  Alembic    │            │  ContentFilter        │
│ 6 tables    │            │  CollaborativeFilter  │
│ 3 migrations│            │  AffirmativeScorer    │
└─────────────┘            └───────────────────────┘
```

---

## Database Schema

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | id, email, hashed_password, role, is_verified, otp_code | Identity and auth |
| `students` | user_id FK, skills ARRAY, district, social_category, is_rural, has_previous_internship | Student profile |
| `internships` | required_skills ARRAY, total_seats, filled_seats, is_active, sector | Internship listings |
| `applications` | student_id FK, internship_id FK, status enum, content_score, collaborative_score, affirmative_score, final_score | Applications with score snapshot |
| `recommendations` | student_id FK, internship_id FK, scores, matched_skills, missing_skills, is_active, generated_at | 24hr recommendation cache |
| `audit_logs` | action, entity_type, entity_id, performed_by FK, details JSON, created_at | Immutable allocation audit trail |

**Application status transitions:**
```
PENDING → UNDER_REVIEW → SELECTED (locked)
PENDING → REJECTED
UNDER_REVIEW → REJECTED
REJECTED → UNDER_REVIEW
```

---

## Project Structure

```
Fairmatch-AI/
├── backend/
│   ├── alembic/
│   │   └── versions/
│   │       ├── fd3a6327b878_initial_schema.py
│   │       ├── 6b39fb59d352_add_audit_log_table.py
│   │       └── a1d9f7c2b3e4_add_recommendations_table.py
│   ├── app/
│   │   ├── api/v1/endpoints/
│   │   │   ├── auth.py
│   │   │   ├── students.py
│   │   │   ├── internships.py
│   │   │   ├── applications.py
│   │   │   ├── recommend.py
│   │   │   └── admin.py
│   │   ├── core/             # config.py, security.py
│   │   ├── db/               # database.py, base.py
│   │   ├── ml/
│   │   │   ├── vectorizer.py
│   │   │   ├── content_filter.py
│   │   │   ├── collaborative_filter.py
│   │   │   ├── affirmative.py
│   │   │   ├── engine.py
│   │   │   └── data_generator.py
│   │   ├── models/           # user, student, internship, application,
│   │   │                     # recommendation, audit_log
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # auth_service, email_service,
│   │                         # recommendation_service
│   └── requirements.txt
└── frontend/
    └── src/
        ├── app/
        │   ├── login/
        │   ├── register/
        │   ├── verify-otp/
        │   ├── profile/setup/
        │   ├── dashboard/
        │   ├── explore/
        │   ├── applications/
        │   └── admin/
        │       └── manage-internships/
        ├── components/
        │   ├── forms/         # login-form, register-form, profile-form
        │   ├── internship/    # internship-card, match-score-ring,
        │   │                  # skill-tag, explanation-panel
        │   ├── layout/        # navbar, sidebar
        │   └── ui/            # shadcn primitives
        └── lib/               # api.ts, auth.ts, types.ts, utils.ts
```

---

## API Reference

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register new account | Public |
| POST | `/api/v1/auth/verify-otp` | Verify email OTP | Public |
| POST | `/api/v1/auth/login` | Login, returns JWT pair | Public |
| GET | `/api/v1/auth/me` | Get current user | Any |

### Students
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/students/profile` | Create profile | Student |
| GET | `/api/v1/students/profile` | Get own profile | Student |
| PUT | `/api/v1/students/profile` | Update profile + invalidate recommendation cache | Student |
| POST | `/api/v1/students/resume` | Upload PDF, extract and merge skills | Student |

### Internships
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/internships/` | List active internships | Public |
| GET | `/api/v1/internships/{id}` | Get internship detail | Public |
| POST | `/api/v1/internships/` | Create internship | Admin |
| PUT | `/api/v1/internships/{id}` | Update internship | Admin |
| DELETE | `/api/v1/internships/{id}` | Soft delete | Admin |

### Recommendations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/recommend/{student_id}` | Get top-N recommendations (cached 24hr) | Student/Admin |
| GET | `/api/v1/recommend/{student_id}/explain/{internship_id}` | Explain single match | Student/Admin |
| POST | `/api/v1/recommend/retrain` | Retrain ML models, clear cache | Admin |
| POST | `/api/v1/recommend/batch` | Batch generate for all students | Admin |

> Query params: `top_n` (1–200, default 5), `force` (bool — bypasses 24hr cache)

### Applications
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/applications/` | Submit application | Student |
| GET | `/api/v1/applications/my` | Get own applications | Student |
| PUT | `/api/v1/applications/{id}/status` | Update status (enforces transition rules) | Admin |

### Admin
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/admin/analytics` | Full dashboard metrics | Admin |
| GET | `/api/v1/admin/students` | Student directory with filters | Admin |
| GET | `/api/v1/admin/students/{id}/applications` | Student application detail with scores | Admin |
| GET | `/api/v1/admin/internships` | All internships including inactive | Admin |
| GET | `/api/v1/admin/allocations` | Recent 20 allocations | Admin |
| POST | `/api/v1/admin/allocate` | Bulk allocate unmatched students | Admin |
| POST | `/api/v1/admin/allocations/override` | Manual student-internship assignment | Admin |
| POST | `/api/v1/admin/bulk-action` | Threshold bulk action with dry-run preview | Admin |
| POST | `/api/v1/admin/demo-reset` | Clear pending allocations, preserve confirmed | Admin |

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 14+

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY at minimum

alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: `http://localhost:8000/api/v1`
- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: `http://localhost:3000`

### Seed Synthetic Data

```bash
cd backend
python -m app.ml.data_generator
```

Generates 500 students, 100 internships, and 3 months of simulated application history. Student distributions: 55% rural, social categories (GEN 40% / OBC 30% / SC 20% / ST 10%), 35% with prior internship experience. Seeded with `random.seed(42)` for reproducibility.

### Create Admin Account

```bash
cd backend
python -c "
from app.db.database import SessionLocal
from app.services.auth_service import create_admin_user
db = SessionLocal()
create_admin_user(db, 'admin@fairmatch.ai', 'Admin@12345')
db.close()
"
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Full PostgreSQL DSN | Yes |
| `SECRET_KEY` | JWT signing secret | Yes |
| `ALGORITHM` | JWT algorithm — `HS256` | Yes |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | Yes |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | Yes |
| `OTP_EXPIRE_MINUTES` | OTP validity window | Yes |
| `SMTP_HOST` | Email server host | No* |
| `SMTP_PORT` | Email server port | No* |
| `SMTP_USER` | Sending email address | No* |
| `SMTP_PASSWORD` | Email password | No* |
| `EMAILS_FROM_EMAIL` | From address in emails | No* |
| `CONTENT_WEIGHT` | Content layer weight (default: `0.50`) | No |
| `COLLABORATIVE_WEIGHT` | Collaborative layer weight (default: `0.30`) | No |
| `AFFIRMATIVE_WEIGHT` | Affirmative layer weight (default: `0.20`) | No |

> *If `SMTP_USER` is not set, OTP codes print to console in dev mode.

---

## Engineering Decisions

**Hybrid ranking with configurable weights** — Content, collaborative, and affirmative scores are independently computed and blended using env-driven weights. Shifting the weights in `.env` changes the engine's behavior without touching code.

**Affirmative scoring as first-class concern** — The policy layer is a fully weighted component of the final score, not a post-processing adjustment. This mirrors how real government allocation systems work and makes fairness auditable by design.

**Recommendation persistence with 24hr caching** — Recommendations are computed once, stored in a dedicated `recommendations` table, and reused for 24 hours. Profile updates and resume uploads automatically invalidate the cache. `force=true` bypasses the cache on demand.

**Status transition state machine** — Application statuses follow strict allowed transitions enforced at the backend. Invalid transitions return `HTTP 400`. Once `SELECTED`, a status is permanently locked.

**Seat capacity enforcement at every write path** — Seat limits are checked independently at application creation, status transitions, manual override, and bulk action. No internship can be over-allocated regardless of entry point.

**Threshold bulk action with dry-run** — Admin previews exactly how many students a score threshold would affect before committing. Preview returns affected counts, skipped-due-to-seats counts, and a 10-record sample.

---

## Checks

```bash
# Backend syntax
cd backend && python -m compileall app

# Frontend production build
cd frontend && npm run build
```

---

## Deployment

- Backend: [Render](https://render.com) — deploy as a Python web service
- Frontend: [Vercel](https://vercel.com) — connect GitHub repo, auto-deploy
- Update `BACKEND_CORS_ORIGINS` in `.env` to include your production frontend URL
- Set all environment variables in your hosting provider's dashboard

---

## Author

**Rashmi Ranjan Badajena**  
[GitHub](https://github.com/rashCoded) · [LinkedIn](https://linkedin.com/in/rashmiranjan-badajena) · rashmiranjanbadajena.it@gmail.com

---

*Built to make fair allocation scalable.*
