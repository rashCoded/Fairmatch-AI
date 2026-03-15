from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.internship import Internship
from app.models.user import User, UserRole
from app.schemas.internship import InternshipCreate, InternshipResponse, InternshipUpdate
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/internships", tags=["internships"])


def _require_admin(current_user: User) -> None:
	if current_user.role != UserRole.ADMIN:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Admin role required",
		)


@router.post("/", response_model=InternshipResponse, status_code=status.HTTP_201_CREATED)
def create_internship(
	payload: InternshipCreate,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> InternshipResponse:
	_require_admin(current_user)

	data = payload.model_dump()
	if data["filled_seats"] > data["total_seats"]:
		raise HTTPException(status_code=400, detail="filled_seats cannot exceed total_seats")

	internship = Internship(**data)
	db.add(internship)
	db.commit()
	db.refresh(internship)
	return InternshipResponse.model_validate(internship)


@router.get("/", response_model=list[InternshipResponse])
def list_active_internships(
	skip: int = Query(default=0, ge=0),
	limit: int = Query(default=10, ge=1, le=100),
	sector: str | None = Query(default=None),
	state: str | None = Query(default=None),
	db: Session = Depends(get_db),
) -> list[InternshipResponse]:
	query = db.query(Internship).filter(Internship.is_active.is_(True))

	if sector:
		query = query.filter(Internship.sector.ilike(sector))
	if state:
		query = query.filter(Internship.state.ilike(state))

	internships = query.offset(skip).limit(limit).all()
	return [InternshipResponse.model_validate(internship) for internship in internships]


@router.get("/{id}", response_model=InternshipResponse)
def get_internship_detail(id: int, db: Session = Depends(get_db)) -> InternshipResponse:
	internship = (
		db.query(Internship)
		.filter(Internship.id == id, Internship.is_active.is_(True))
		.first()
	)
	if not internship:
		raise HTTPException(status_code=404, detail="Internship not found")

	return InternshipResponse.model_validate(internship)


@router.put("/{id}", response_model=InternshipResponse)
def update_internship(
	id: int,
	payload: InternshipUpdate,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> InternshipResponse:
	_require_admin(current_user)

	internship = db.query(Internship).filter(Internship.id == id).first()
	if not internship:
		raise HTTPException(status_code=404, detail="Internship not found")

	update_data = payload.model_dump(exclude_unset=True)

	new_total_seats = update_data.get("total_seats", internship.total_seats)
	new_filled_seats = update_data.get("filled_seats", internship.filled_seats)
	if new_filled_seats > new_total_seats:
		raise HTTPException(status_code=400, detail="filled_seats cannot exceed total_seats")

	for field, value in update_data.items():
		setattr(internship, field, value)

	db.add(internship)
	db.commit()
	db.refresh(internship)
	return InternshipResponse.model_validate(internship)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def soft_delete_internship(
	id: int,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> Response:
	_require_admin(current_user)

	internship = db.query(Internship).filter(Internship.id == id).first()
	if not internship:
		raise HTTPException(status_code=404, detail="Internship not found")

	internship.is_active = False
	db.add(internship)
	db.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)
