# Import all the models, so that Base has them before being
# imported by Alembic
from app.db.database import Base  # noqa
from app.models.user import User  # noqa
from app.models.student import Student  # noqa
from app.models.internship import Internship  # noqa
from app.models.application import Application  # noqa
from app.models.audit_log import AuditLog  # noqa
from app.models.recommendation import Recommendation  # noqa
