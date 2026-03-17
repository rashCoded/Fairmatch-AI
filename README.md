# FairMatch AI

AI-Based Smart Allocation Engine for the PM Internship Scheme.

This project automates student-to-internship matching using a hybrid recommendation engine that combines:

- Content-based skill matching (TF-IDF + cosine similarity)
- Collaborative filtering (historical interaction patterns)
- Affirmative action scoring (policy-aware fairness layer)

The system is built as a full-stack application with FastAPI + PostgreSQL on the backend and Next.js + TypeScript on the frontend.

## Why This Project Matters

Manual internship allocation is slow, inconsistent, and hard to scale. FairMatch AI addresses this by:

- Generating explainable ranked recommendations for each student
- Improving matching quality through hybrid ML scoring
- Supporting policy-aware prioritization for underserved applicants
- Giving admins a dashboard for analytics, filters, and bulk allocation

## Core Features

### Student Portal

- JWT-based auth with email OTP verification
- Profile creation and update
- Resume upload (PDF) with automatic skill extraction
- Internship exploration and recommendation dashboard
- Recommendation explainability panel
- Application submission and status tracking

### Admin Portal

- Internship management endpoints (create, update, soft-delete)
- Student directory with filters (category, rural/urban, district, etc.)
- Bulk allocation flow for unmatched students
- Recommendation batch generation endpoint
- Analytics dashboard with charts and summary cards
- Audit log generation during allocation

### Recommendation Engine

- Hybrid score with configurable weights
- Model persistence using joblib
- Cached recommendation rows in database
- Retrain endpoint with stale-cache invalidation
- Cold-start handling when collaborative signals are unavailable

## Architecture

| Layer | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16, TypeScript, Tailwind, Recharts | Student/admin UI |
| Backend API | FastAPI, Uvicorn | REST APIs, auth, orchestration |
| ML Engine | scikit-learn, NumPy, pandas, joblib | Content + collaborative + affirmative scoring |
| Database | PostgreSQL, SQLAlchemy, Alembic | Persistent storage and migrations |
| Auth | JWT, python-jose, bcrypt | Role-based stateless auth |

## Recommendation Formula

Default weighted score:

$$
	ext{Final Score} = 0.50 \times \text{Content Score} + 0.30 \times \text{Collaborative Score} + 0.20 \times \text{Affirmative Score}
$$

In cold-start scenarios (no collaborative history), the collaborative portion is redistributed to content so ranking quality remains stable.

## Project Structure

```text
Fairmatch-AI/
	backend/
		alembic/
		app/
			api/v1/endpoints/
			core/
			db/
			ml/
			models/
			schemas/
			services/
		requirements.txt
	frontend/
		src/
			app/
			components/
			lib/
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- npm 10+
- PostgreSQL 14+ (tested with 16)

## Local Setup

### 1) Clone and enter project

```bash
git clone <your-repo-url>
cd Fairmatch-AI
```

### 2) Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Update backend .env values for your PostgreSQL instance.

Run migrations:

```bash
alembic upgrade head
```

Start backend server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- API base: http://localhost:8000/api/v1
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

### 3) Frontend setup

```bash
cd ../frontend
npm install
npm run dev
```

Frontend URL:

- App: http://localhost:3000

## Environment Variables

Backend .env keys (from backend/.env.example):

- PROJECT_NAME
- POSTGRES_SERVER
- POSTGRES_USER
- POSTGRES_PASSWORD
- POSTGRES_DB
- POSTGRES_PORT
- DATABASE_URL (optional full DSN)
- SECRET_KEY
- ALGORITHM
- ACCESS_TOKEN_EXPIRE_MINUTES
- REFRESH_TOKEN_EXPIRE_DAYS
- OTP_EXPIRE_MINUTES
- SMTP_TLS
- SMTP_PORT
- SMTP_HOST
- SMTP_USER
- SMTP_PASSWORD
- EMAILS_FROM_EMAIL
- EMAILS_FROM_NAME
- CONTENT_WEIGHT
- COLLABORATIVE_WEIGHT
- AFFIRMATIVE_WEIGHT

## Optional: Seed Synthetic Data

Generate realistic sample students, internships, and historical applications:

```bash
cd backend
python -m app.ml.data_generator
```

## Creating an Admin User

There is no public admin signup endpoint. Use a one-time script:

```bash
cd backend
python -c "from app.db.database import SessionLocal; from app.services.auth_service import create_admin_user; db=SessionLocal(); create_admin_user(db, 'admin@fairmatch.ai', 'Admin@12345'); db.close()"
```

## API Overview

Base prefix: /api/v1

### Auth

- POST /auth/register
- POST /auth/verify-otp
- POST /auth/login
- GET /auth/me

### Students

- POST /students/profile
- GET /students/profile
- PUT /students/profile
- POST /students/resume
- GET /students/{id} (admin)
- GET /students (admin)

### Internships

- GET /internships
- GET /internships/{id}
- POST /internships (admin)
- PUT /internships/{id} (admin)
- DELETE /internships/{id} (admin, soft delete)

### Recommendations

- GET /recommend/{student_id}
- GET /recommend/{student_id}/explain/{internship_id}
- POST /recommend/batch (admin)
- POST /recommend/retrain (admin)

### Applications

- POST /applications
- GET /applications/my

### Admin

- GET /admin/analytics
- GET /admin/students
- GET /admin/students/{student_id}
- GET /admin/internships
- POST /admin/internships
- PUT /admin/internships/{internship_id}
- POST /admin/allocate

## Recommendation Pipeline (High-Level)

1. Student profile skills are vectorized against internship requirements.
2. Content-based similarity scores are computed for active internships.
3. Collaborative score is computed from historical application outcomes.
4. Affirmative score applies policy-aware boosts and balancing.
5. Weighted final score ranks internships.
6. Top-N recommendations are stored and reused until stale.

## Explainability

Each recommendation carries:

- Matched skills
- Missing skills
- Content score
- Collaborative score
- Affirmative score
- Final blended score

This supports transparency for students and auditability for administrators.

## Testing and Checks

Backend syntax check:

```bash
cd backend
python -m compileall app
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Deployment Notes

- Backend can be deployed on Render or any container-ready host.
- Frontend can be deployed on Vercel.
- Ensure CORS origins and API base URL are aligned for production.

## License

This repository currently does not include a license file. Add one before public distribution.
