# FairMatch AI
### AI-Based Smart Allocation Engine for the PM Internship Scheme

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql)
![scikit-learn](https://img.shields.io/badge/scikit--learn-1.4-F7931E?logo=scikit-learn)
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

Measures how well a student's skills match an internship's requirements using cosine similarity on TF-IDF weighted skill vectors.

Both the student profile and internship requirements are encoded as TF-IDF vectors. The dot product of these vectors divided by their magnitudes produces a similarity score between 0 and 1.

> Why TF-IDF over binary matching? Rare, specialized skills (WebRTC, Alembic) carry more weight than common ones (HTML, Git). TF-IDF handles this naturally without manual weighting.

### Layer 2 — Collaborative Filtering (30%)

Identifies students similar to the current applicant based on historical application and selection patterns. Uses sklearn's `NearestNeighbors` with cosine distance on a student-internship interaction matrix.

If students with a similar profile to yours were successfully placed at certain companies, those companies are likely good fits for you too.

> **Cold start handling:** When a student has no application history, the collaborative weight is redistributed to the content layer so ranking quality remains stable.

### Layer 3 — Affirmative Action Scoring (20%)

The policy-aware layer. Adjusts the final score based on scheme guidelines:

| Condition | Score Adjustment |
|-----------|-----------------|
| Rural/aspirational district | +0.30 boost |
| SC/ST category | +0.30 boost |
| OBC category | +0.15 boost |
| First-time applicant | +0.25 boost |
| Internship capacity > 80% filled | −0.20 penalty |

Final affirmative score is clamped between 0.0 and 1.0.

### Final Score Formula

```
Final Score = (0.50 × Content Score) + (0.30 × Collaborative Score) + (0.20 × Affirmative Score)
```

Every recommendation returns a per-component score breakdown — every allocation is fully explainable.

---

## Features

### Student Portal
- JWT authentication with email OTP verification
- Profile builder — skills, education, location, social category, district
- Resume upload (PDF) with automatic skill extraction via `pdfplumber`
- Recommendation dashboard — ranked internship cards with match score breakdown
- Explainability panel — matched skills, missing skills, per-component score reasoning
- Policy boost indicator — shows when affirmative scoring applied and why
- Application submission and status tracking
- Manual recommendation refresh

### Admin Portal
- Analytics dashboard — placement rates, category distribution, rural coverage, capacity utilization
- Student directory with filters — category, district, rural status, previous internship
- Internship management — create, edit, deactivate listings
- Bulk allocation — runs recommendation engine for all unmatched students in one pass
- Threshold-based bulk action — select/reject/review applications by score range with dry-run preview
- Application detail view — full AI match reasoning before making a decision
- Manual allocation override — assign student to specific internship
- Demo reset — clears pending allocations for fresh demonstration
- Audit log — every allocation decision recorded with timestamp

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, ShadCN UI, Recharts, Framer Motion |
| Backend | FastAPI, Python 3.12, Uvicorn |
| ML Engine | scikit-learn (TF-IDF, NearestNeighbors), NumPy, pandas, joblib |
| Database | PostgreSQL, SQLAlchemy ORM, Alembic migrations |
| Auth | JWT (python-jose), bcrypt, OTP email verification |
| Resume Parsing | pdfplumber |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Next.js 15 Frontend               │
│   (TypeScript, Tailwind, ShadCN, Recharts)  │
└────────────────────┬────────────────────────┘
                     │ REST API (JWT Bearer)
┌────────────────────▼────────────────────────┐
│              FastAPI Backend                │
│  /auth  /students  /internships             │
│  /recommend  /applications  /admin          │
└──────┬──────────────────────────┬───────────┘
       │                          │
┌──────▼──────┐          ┌────────▼────────────┐
│ PostgreSQL  │          │    ML Engine        │
│ SQLAlchemy  │          │  Content Filter     │
│  Alembic    │          │  Collab Filter      │
│             │          │  Affirmative Scorer │
└─────────────┘          └─────────────────────┘
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Identity, role, OTP, verification status |
| `students` | Profile, skills, district, category, rural status |
| `internships` | Listings, required skills, seats, sector |
| `applications` | Student-internship pairs, status, score snapshot |
| `recommendations` | Cached recommendation results with 24hr freshness |
| `audit_logs` | Immutable record of every allocation decision |

---

## Project Structure

```
Fairmatch-AI/
├── backend/
│   ├── alembic/                  # Database migrations
│   ├── app/
│   │   ├── api/v1/endpoints/     # auth, students, internships,
│   │   │                         # recommend, applications, admin
│   │   ├── core/                 # config, security, JWT
│   │   ├── db/                   # database, base, session
│   │   ├── ml/                   # vectorizer, content_filter,
│   │   │                         # collaborative_filter, affirmative,
│   │   │                         # engine, data_generator
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic schemas
│   │   └── services/             # auth, email, recommendation
│   └── requirements.txt
└── frontend/
    └── src/
        ├── app/                  # login, register, verify-otp,
        │                         # dashboard, explore, applications,
        │                         # profile/setup, admin
        ├── components/
        │   ├── forms/            # login, register, profile forms
        │   ├── internship/       # card, match-score-ring,
        │   │                     # skill-tag, explanation-panel
        │   ├── layout/           # navbar, sidebar
        │   └── ui/               # shadcn components
        └── lib/                  # api, auth, types, utils
```

---

## API Reference

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new account | Public |
| POST | `/auth/verify-otp` | Verify OTP | Public |
| POST | `/auth/login` | Login, returns JWT | Public |
| GET | `/auth/me` | Get current user | Student/Admin |

### Students
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/students/profile` | Create profile | Student |
| GET | `/students/profile` | Get own profile | Student |
| PUT | `/students/profile` | Update profile | Student |
| POST | `/students/resume` | Upload PDF, extract skills | Student |

### Internships
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/internships/` | List active internships | Student |
| GET | `/internships/{id}` | Get internship detail | Student |
| POST | `/internships/` | Create internship | Admin |
| PUT | `/internships/{id}` | Update internship | Admin |
| DELETE | `/internships/{id}` | Soft delete | Admin |

### Recommendations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/recommend/{student_id}` | Get top-N recommendations | Student |
| GET | `/recommend/{student_id}/explain/{internship_id}` | Explain match | Student |
| POST | `/recommend/retrain` | Retrain ML models | Admin |
| POST | `/recommend/batch` | Batch generate for all students | Admin |

### Applications
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/applications/` | Submit application | Student |
| GET | `/applications/my` | Get own applications | Student |
| PUT | `/applications/{id}/status` | Update status | Admin |

### Admin
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/admin/analytics` | Dashboard metrics | Admin |
| GET | `/admin/students` | List students with filters | Admin |
| GET | `/admin/allocations` | Recent allocations | Admin |
| POST | `/admin/allocate` | Bulk allocate unmatched students | Admin |
| POST | `/admin/bulk-action` | Threshold-based bulk status update | Admin |
| POST | `/admin/demo-reset` | Clear pending allocations | Admin |
| POST | `/admin/allocations/override` | Manual student-internship assignment | Admin |

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
# Edit .env with your PostgreSQL credentials and secret key

alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API base: `http://localhost:8000/api/v1`
- Swagger docs: `http://localhost:8000/docs`

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

Generates 500 students, 100 internships, and 3 months of simulated application history with realistic skill distributions and demographic data.

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
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SECRET_KEY` | JWT signing key | Yes |
| `ALGORITHM` | JWT algorithm (HS256) | Yes |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | Yes |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | Yes |
| `OTP_EXPIRE_MINUTES` | OTP validity window | Yes |
| `SMTP_HOST` | Email server host | No* |
| `SMTP_PORT` | Email server port | No* |
| `SMTP_USER` | Email account | No* |
| `SMTP_PASSWORD` | Email password | No* |
| `CONTENT_WEIGHT` | Content layer weight (default: 0.50) | No |
| `COLLABORATIVE_WEIGHT` | Collaborative layer weight (default: 0.30) | No |
| `AFFIRMATIVE_WEIGHT` | Affirmative layer weight (default: 0.20) | No |

> *If `SMTP_USER` is not set, OTP prints to console in dev mode.

---

## Engineering Decisions Worth Knowing

**Hybrid recommendation over pure ML** — A pure content-based system ignores historical placement patterns. A pure collaborative filter fails new students. Combining both with a configurable weight system gives the best of both, with graceful degradation when one layer has no data.

**Affirmative scoring as first-class concern** — Rather than bolting fairness on as an afterthought, the policy layer is a fully weighted component of the final score. This mirrors how real government allocation systems work and ensures the engine is accountable by design.

**Recommendation persistence with 24hr caching** — Running the ML engine on every page load would be prohibitively slow at scale. Recommendations are computed once, stored in the database, and reused for 24 hours. Profile updates and resume uploads automatically invalidate the cache.

**Status transition enforcement** — Application statuses follow strict allowed transitions (Pending → Under Review → Selected/Rejected). The backend rejects invalid transitions with HTTP 400. This prevents data integrity issues and mirrors real hiring workflow constraints.

**Threshold-based bulk action with dry-run** — Admin can preview exactly how many students would be affected by a score threshold before committing. Seat limits are enforced — no internship can be over-selected. This makes bulk decisions auditable and reversible before execution.

---

## Deployment

- Backend: Deploy on [Render](https://render.com) as a web service
- Frontend: Deploy on [Vercel](https://vercel.com)
- Ensure `CORS` origins in `main.py` include your production frontend URL
- Set all environment variables in your hosting provider's dashboard

---

## Author

**Rashmi Ranjan Badajena**  
[GitHub](https://github.com/rashCoded) · [LinkedIn](https://linkedin.com/in/rashmi-ranjan-badajena) · rashmiranjanbadajena.it@gmail.com

---

*Built to make fair allocation scalable.*
