FairMatch AI
AI-Based Smart Allocation Engine for the PM Internship Scheme
A policy-aware hybrid recommendation system that automates student-to-internship matching for government internship schemes — combining skill-based filtering, historical placement patterns, and fairness scoring into a single explainable pipeline.

What It Does
Manual internship allocation is slow, inconsistent, and prone to bias. Coordinators read hundreds of student profiles, browse internship listings, and attempt to match them by hand — a process that takes weeks and cannot scale.
FairMatch AI eliminates this. Given a student's skills, background, and profile, the system computes a ranked list of best-fit internships using a three-layer hybrid recommendation engine. Every recommendation is fully explainable — the student knows exactly why they were matched, and the admin can audit every allocation decision.

Recommendation Engine
This is the core of the system. Three independent scoring layers feed into a single weighted formula.
Layer 1 — Content-Based Filtering (50%)
Measures how well a student's skills match an internship's requirements using cosine similarity on TF-IDF weighted skill vectors.
Both the student profile and internship requirements are encoded as TF-IDF vectors. The dot product of these vectors divided by their magnitudes produces a similarity score between 0 and 1.
Why TF-IDF over binary matching? Rare, specialized skills (WebRTC, Alembic) carry more weight than common ones (HTML, Git). TF-IDF handles this naturally without manual weighting.
Layer 2 — Collaborative Filtering (30%)
Identifies students similar to the current applicant based on historical application and selection patterns. Uses sklearn's NearestNeighbors with cosine distance on a student-internship interaction matrix.
If students with a similar profile to yours were successfully placed at certain companies, those companies are likely good fits for you too.
Cold start handling: When a student has no application history, the collaborative weight is redistributed to the content layer so ranking quality remains stable.
Layer 3 — Affirmative Action Scoring (20%)
The policy-aware layer. Adjusts the final score based on scheme guidelines:
ConditionScore AdjustmentRural/aspirational district+0.30 boostSC/ST category+0.30 boostOBC category+0.15 boostFirst-time applicant+0.25 boostInternship capacity > 80% filled−0.20 penalty
Final affirmative score is clamped between 0.0 and 1.0.
Final Score Formula
Final Score = (0.50 × Content Score) + (0.30 × Collaborative Score) + (0.20 × Affirmative Score)
Every recommendation returns a per-component score breakdown — every allocation is fully explainable.

Features
Student Portal

JWT authentication with email OTP verification
Profile builder — skills, education, location, social category, district
Resume upload (PDF) with automatic skill extraction
Recommendation dashboard — ranked internship cards with match score breakdown
Explainability panel — matched skills, missing skills, per-component score reasoning
Policy boost indicator — shows when affirmative scoring applied and why
Application submission and status tracking
Manual recommendation refresh

Admin Portal

Analytics dashboard — placement rates, category distribution, rural coverage, capacity utilization
Student directory with filters — category, district, rural status, previous internship
Internship management — create, edit, deactivate listings
Bulk allocation — runs recommendation engine for all unmatched students in one pass
Threshold-based bulk action — select/reject/review applications by score range with dry-run preview
Application detail view — full AI match reasoning before making a decision
Manual allocation override — assign student to specific internship
Demo reset — clears pending allocations for fresh demonstration
Audit log — every allocation decision recorded with timestamp


Tech Stack
LayerTechnologyFrontendNext.js 15, TypeScript, Tailwind CSS, ShadCN UI, Recharts, Framer MotionBackendFastAPI, Python, UvicornML Enginescikit-learn (TF-IDF, NearestNeighbors), NumPy, pandas, joblibDatabasePostgreSQL, SQLAlchemy ORM, Alembic migrationsAuthJWT (python-jose), bcrypt, OTP email verificationResume Parsingpdfplumber

Architecture
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

Database Schema
TablePurposeusersIdentity, role, OTP, verification statusstudentsProfile, skills, district, category, rural statusinternshipsListings, required skills, seats, sectorapplicationsStudent-internship pairs, status, score snapshotrecommendationsCached recommendation results with 24hr freshnessaudit_logsImmutable record of every allocation decision

Project Structure
Fairmatch-AI/
├── backend/
│   ├── alembic/              # Database migrations
│   ├── app/
│   │   ├── api/v1/endpoints/ # auth, students, internships,
│   │   │                     # recommend, applications, admin
│   │   ├── core/             # config, security, JWT
│   │   ├── db/               # database, base, session
│   │   ├── ml/               # vectorizer, content_filter,
│   │   │                     # collaborative_filter, affirmative,
│   │   │                     # engine, data_generator
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   └── services/         # auth, email, recommendation
│   └── requirements.txt
└── frontend/
    └── src/
        ├── app/              # login, register, verify-otp,
        │                     # dashboard, explore, applications,
        │                     # profile/setup, admin
        ├── components/
        │   ├── forms/        # login, register, profile forms
        │   ├── internship/   # card, match-score-ring,
        │   │                 # skill-tag, explanation-panel
        │   ├── layout/       # navbar, sidebar
        │   └── ui/           # shadcn components
        └── lib/              # api, auth, types, utils

API Reference
Auth
MethodEndpointDescriptionAuthPOST/auth/registerRegister new accountPublicPOST/auth/verify-otpVerify OTPPublicPOST/auth/loginLogin, returns JWTPublicGET/auth/meGet current userStudent/Admin
Students
MethodEndpointDescriptionAuthPOST/students/profileCreate profileStudentGET/students/profileGet own profileStudentPUT/students/profileUpdate profileStudentPOST/students/resumeUpload PDF, extract skillsStudent
Internships
MethodEndpointDescriptionAuthGET/internships/List active internshipsStudentGET/internships/{id}Get internship detailStudentPOST/internships/Create internshipAdminPUT/internships/{id}Update internshipAdminDELETE/internships/{id}Soft deleteAdmin
Recommendations
MethodEndpointDescriptionAuthGET/recommend/{student_id}Get top-N recommendationsStudentGET/recommend/{student_id}/explain/{internship_id}Explain matchStudentPOST/recommend/retrainRetrain ML modelsAdminPOST/recommend/batchBatch generate for all studentsAdmin
Applications
MethodEndpointDescriptionAuthPOST/applications/Submit applicationStudentGET/applications/myGet own applicationsStudentPUT/applications/{id}/statusUpdate statusAdmin
Admin
MethodEndpointDescriptionAuthGET/admin/analyticsDashboard metricsAdminGET/admin/studentsList students with filtersAdminGET/admin/allocationsRecent allocationsAdminPOST/admin/allocateBulk allocate unmatched studentsAdminPOST/admin/bulk-actionThreshold-based bulk status updateAdminPOST/admin/demo-resetClear pending allocationsAdminPOST/admin/allocations/overrideManual student-internship assignmentAdmin

Setup
Prerequisites

Python 3.11+
Node.js 20+
PostgreSQL 14+

Backend
bashcd backend
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
Backend: http://localhost:8000
Swagger docs: http://localhost:8000/docs
Frontend
bashcd frontend
npm install
npm run dev
Frontend: http://localhost:3000
Seed Synthetic Data
bashcd backend
python -m app.ml.data_generator
Generates 500 students, 100 internships, and 3 months of simulated application history with realistic skill distributions and demographic data.
Create Admin Account
bashcd backend
python -c "
from app.db.database import SessionLocal
from app.services.auth_service import create_admin_user
db = SessionLocal()
create_admin_user(db, 'admin@fairmatch.ai', 'Admin@12345')
db.close()
"

Environment Variables
VariableDescriptionRequiredDATABASE_URLPostgreSQL connection stringYesSECRET_KEYJWT signing keyYesALGORITHMJWT algorithm (HS256)YesACCESS_TOKEN_EXPIRE_MINUTESAccess token TTLYesREFRESH_TOKEN_EXPIRE_DAYSRefresh token TTLYesOTP_EXPIRE_MINUTESOTP validity windowYesSMTP_HOSTEmail server hostNo*SMTP_PORTEmail server portNo*SMTP_USEREmail accountNo*SMTP_PASSWORDEmail passwordNo*CONTENT_WEIGHTContent layer weight (0.50)NoCOLLABORATIVE_WEIGHTCollaborative layer weight (0.30)NoAFFIRMATIVE_WEIGHTAffirmative layer weight (0.20)No
*If SMTP_USER is not set, OTP prints to console in dev mode.

Engineering Decisions Worth Knowing
Hybrid recommendation over pure ML — A pure content-based system ignores historical placement patterns. A pure collaborative filter fails new students. Combining both with a configurable weight system gives the best of both, with graceful degradation when one layer has no data.
Affirmative scoring as first-class concern — Rather than bolting fairness on as an afterthought, the policy layer is a fully weighted component of the final score. This mirrors how real government allocation systems work and ensures the engine is accountable by design.
Recommendation persistence with 24hr caching — Running the ML engine on every page load would be prohibitively slow at scale. Recommendations are computed once, stored in the database, and reused for 24 hours. Profile updates and resume uploads automatically invalidate the cache.
Status transition enforcement — Application statuses follow strict allowed transitions (Pending → Under Review → Selected/Rejected). The backend rejects invalid transitions with HTTP 400. This prevents data integrity issues and mirrors real hiring workflow constraints.
Threshold-based bulk action with dry-run — Admin can preview exactly how many students would be affected by a score threshold before committing. Seat limits are enforced — no internship can be over-selected. This makes bulk decisions auditable and reversible before execution.

Deployment

Backend: Deploy on Render as a web service
Frontend: Deploy on Vercel
Ensure CORS origins in main.py include your production frontend URL
Set all environment variables in your hosting provider's dashboard


Author
Rashmi Ranjan Badajena
GitHub · LinkedIn · rashmiranjanbadajena.it@gmail.com

Built to make fair allocation scalable.
