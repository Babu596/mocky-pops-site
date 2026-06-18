from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_customer
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models import CustomerAddress, User
from app.schemas.customer import AddressCreate, AddressRead, AddressUpdate, PasswordChange, ProfileRead, ProfileUpdate


router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/me", response_model=ProfileRead)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileRead:
    user = db.query(User).options(joinedload(User.addresses)).filter(User.id == current_user.id).first()
    return ProfileRead(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role.value,
        is_active=user.is_active,
        addresses=user.addresses,
    )


@router.patch("/me", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> ProfileRead:
    update_data = payload.model_dump(exclude_unset=True)
    if "email" in update_data:
        existing = db.query(User).filter(User.email == update_data["email"], User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    if "phone" in update_data and update_data["phone"]:
        existing = db.query(User).filter(User.phone == update_data["phone"], User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone number is already registered")

    for field, value in update_data.items():
        setattr(current_user, field, value)
    db.commit()
    return get_profile(db, current_user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> None:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.get("/me/addresses", response_model=list[AddressRead])
def list_addresses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> list[CustomerAddress]:
    return db.query(CustomerAddress).filter(CustomerAddress.user_id == current_user.id).order_by(CustomerAddress.id.desc()).all()


@router.post("/me/addresses", response_model=AddressRead, status_code=status.HTTP_201_CREATED)
def add_address(
    payload: AddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CustomerAddress:
    address = CustomerAddress(user_id=current_user.id, **payload.model_dump())
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@router.patch("/me/addresses/{address_id}", response_model=AddressRead)
def update_address(
    address_id: int,
    payload: AddressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CustomerAddress:
    address = db.query(CustomerAddress).filter(CustomerAddress.id == address_id, CustomerAddress.user_id == current_user.id).first()
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(address, field, value)
    db.commit()
    db.refresh(address)
    return address


@router.delete("/me/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> None:
    address = db.query(CustomerAddress).filter(CustomerAddress.id == address_id, CustomerAddress.user_id == current_user.id).first()
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found")
    db.delete(address)
    db.commit()
