from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Notification, User
from app.schemas.notification import NotificationCreate, NotificationRead
from app.services.notifications import NotificationService


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_my_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Notification]:
    return (
        db.query(Notification)
        .filter((Notification.user_id == current_user.id) | (Notification.audience == current_user.role.value))
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification or (notification.user_id and notification.user_id != current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("", response_model=NotificationRead, status_code=status.HTTP_201_CREATED)
def create_admin_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Notification:
    return NotificationService(db).queue(payload)
