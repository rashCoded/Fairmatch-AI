import random
from datetime import datetime

from faker import Faker
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.database import SessionLocal
from app.models.application import Application  # noqa: F401
from app.models.internship import Internship
from app.models.student import Student
from app.models.user import User, UserRole

TECH_SKILLS = [
    "Python",
    "Java",
    "C++",
    "JavaScript",
    "TypeScript",
    "SQL",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "FastAPI",
    "Django",
    "Flask",
    "React",
    "Node.js",
    "Git",
    "Linux",
    "Data Structures",
    "Algorithms",
    "Machine Learning",
    "Deep Learning",
    "Pandas",
    "NumPy",
    "scikit-learn",
    "TensorFlow",
]

RURAL_DISTRICTS = [
    ("Nabarangpur", "Odisha"),
    ("Malkangiri", "Odisha"),
    ("Nuapada", "Odisha"),
    ("Kandhamal", "Odisha"),
    ("Rayagada", "Odisha"),
    ("Kalahandi", "Odisha"),
    ("Sonepur", "Odisha"),
    ("Mayurbhanj", "Odisha"),
    ("Koraput", "Odisha"),
    ("Balangir", "Odisha"),
    ("Dindori", "Madhya Pradesh"),
    ("Bastar", "Chhattisgarh"),
    ("Gadchiroli", "Maharashtra"),
    ("West Singhbhum", "Jharkhand"),
    ("Dhemaji", "Assam"),
]

URBAN_DISTRICTS = [
    ("Bhubaneswar", "Odisha"),
    ("Cuttack", "Odisha"),
    ("Berhampur", "Odisha"),
    ("Rourkela", "Odisha"),
    ("Pune", "Maharashtra"),
    ("Bengaluru Urban", "Karnataka"),
    ("Hyderabad", "Telangana"),
    ("Chennai", "Tamil Nadu"),
    ("Kolkata", "West Bengal"),
    ("Ahmedabad", "Gujarat"),
    ("Noida", "Uttar Pradesh"),
    ("Gurugram", "Haryana"),
    ("Indore", "Madhya Pradesh"),
    ("Jaipur", "Rajasthan"),
    ("Visakhapatnam", "Andhra Pradesh"),
]

SOCIAL_CATEGORIES = ["GEN", "OBC", "SC", "ST"]
SOCIAL_CATEGORY_WEIGHTS = [0.40, 0.30, 0.20, 0.10]

DEGREES = ["B.Tech", "B.E.", "BCA"]
BRANCHES = [
    "Computer Science",
    "Information Technology",
    "Electronics and Communication",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Data Science",
    "Artificial Intelligence",
]

COLLEGES = [
    "GIET University",
    "NIT Rourkela",
    "KIIT University",
    "VSSUT Burla",
    "IIT Bhubaneswar",
    "IIIT Bhubaneswar",
    "CV Raman Global University",
    "Silicon University",
    "Parala Maharaja Engineering College",
    "OUTR Bhubaneswar",
]

SECTORS = [
    "Software Development",
    "Data Science",
    "Cybersecurity",
    "Cloud Computing",
    "Web Development",
    "Mobile Development",
    "DevOps",
    "AI/ML",
]

INTERNSHIP_TITLES = {
    "Software Development": [
        "Backend Developer Intern",
        "Full Stack Developer Intern",
        "API Engineering Intern",
    ],
    "Data Science": [
        "Data Analyst Intern",
        "Data Science Intern",
        "Business Intelligence Intern",
    ],
    "Cybersecurity": [
        "Security Analyst Intern",
        "SOC Intern",
        "Application Security Intern",
    ],
    "Cloud Computing": [
        "Cloud Engineer Intern",
        "Cloud Operations Intern",
        "Cloud Platform Intern",
    ],
    "Web Development": [
        "Frontend Developer Intern",
        "React Developer Intern",
        "Web Platform Intern",
    ],
    "Mobile Development": [
        "Android Developer Intern",
        "iOS Developer Intern",
        "Cross-Platform App Intern",
    ],
    "DevOps": [
        "DevOps Intern",
        "Site Reliability Intern",
        "CI/CD Intern",
    ],
    "AI/ML": [
        "Machine Learning Intern",
        "NLP Intern",
        "Computer Vision Intern",
    ],
}


def _random_district_profile() -> tuple[str, str, bool]:
    if random.random() < 0.55:
        district, state = random.choice(RURAL_DISTRICTS)
        return district, state, True

    district, state = random.choice(URBAN_DISTRICTS)
    return district, state, False


def _random_student_skills() -> list[str]:
    return random.sample(TECH_SKILLS, k=random.randint(4, 10))


def _random_internship_skills() -> list[str]:
    return random.sample(TECH_SKILLS, k=random.randint(3, 6))


def generate_students(session: Session, faker: Faker, count: int = 500) -> int:
    run_tag = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    password_hash = get_password_hash("Student@123")

    users: list[User] = []
    profile_payloads: list[dict] = []

    for i in range(count):
        first_name = faker.first_name()
        last_name = faker.last_name()
        email_local = f"{first_name}.{last_name}.{run_tag}.{i}".lower().replace(" ", "")
        email_local = "".join(
            ch for ch in email_local if ch.isalnum() or ch in {".", "_", "-"}
        )
        email = f"{email_local}@fairmatch.ai"

        user = User(
            email=email,
            hashed_password=password_hash,
            role=UserRole.STUDENT,
            is_verified=True,
            is_active=True,
            otp_code=None,
            otp_expires_at=None,
        )
        users.append(user)

        district, state, is_rural = _random_district_profile()
        profile_payloads.append(
            {
                "full_name": f"{first_name} {last_name}",
                "phone": faker.numerify("##########"),
                "college": random.choice(COLLEGES),
                "degree": random.choice(DEGREES),
                "branch": random.choice(BRANCHES),
                "graduation_year": random.choice([2024, 2025, 2026, 2027]),
                "cgpa": round(random.uniform(5.5, 9.8), 2),
                "skills": _random_student_skills(),
                "district": district,
                "state": state,
                "is_rural": is_rural,
                "social_category": random.choices(
                    SOCIAL_CATEGORIES, weights=SOCIAL_CATEGORY_WEIGHTS, k=1
                )[0],
                "has_previous_internship": random.random() < 0.35,
                "resume_path": f"resumes/student_{run_tag}_{i}.pdf",
            }
        )

    session.add_all(users)
    session.flush()

    students: list[Student] = []
    for user, profile in zip(users, profile_payloads):
        students.append(Student(user_id=user.id, **profile))

    session.add_all(students)
    return len(students)


def generate_internships(session: Session, faker: Faker, count: int = 100) -> int:
    internships: list[Internship] = []

    for _ in range(count):
        sector = random.choice(SECTORS)
        title = random.choice(INTERNSHIP_TITLES[sector])
        location, state = random.choice(URBAN_DISTRICTS)

        total_seats = random.randint(3, 25)
        filled_seats = random.randint(0, int(total_seats * 0.7))
        stipend = float(random.choice([5000, 7000, 10000, 12000, 15000, 20000]))

        internships.append(
            Internship(
                title=title,
                company=faker.company(),
                sector=sector,
                location=location,
                state=state,
                required_skills=_random_internship_skills(),
                description=(
                    f"{title} role in {sector}. "
                    f"Work on live projects under experienced mentors."
                ),
                duration_months=random.randint(2, 6),
                stipend=stipend,
                total_seats=total_seats,
                filled_seats=filled_seats,
                is_active=True,
            )
        )

    session.add_all(internships)
    return len(internships)


def main() -> None:
    random.seed(42)
    Faker.seed(42)
    faker = Faker("en_IN")

    session = SessionLocal()
    try:
        student_count = generate_students(session=session, faker=faker, count=500)
        internship_count = generate_internships(session=session, faker=faker, count=100)

        session.commit()

        print("Data generation complete.")
        print(f"Inserted students: {student_count}")
        print(f"Inserted internships: {internship_count}")
    except Exception as exc:
        session.rollback()
        print(f"Data generation failed: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
