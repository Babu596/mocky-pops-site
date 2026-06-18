from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_delivery_partner
from app.core.security import hash_password
from app.db.session import get_db
from app.models import DeliveryPartner, Order, OrderItem, OrderStatus, User, UserRole
from app.schemas.delivery import DeliveryOrdersRead, DeliveryPartnerCreate, DeliveryPartnerRead
from app.schemas.order import OrderRead, OrderStatusUpdate, order_to_read


router = APIRouter(prefix="/delivery", tags=["delivery"])


def delivery_order_query(db: Session):
    return db.query(Order).options(
        joinedload(Order.address),
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.payment),
    )


@router.post("/partners", response_model=DeliveryPartnerRead, status_code=status.HTTP_201_CREATED)
def register_delivery_partner(
    payload: DeliveryPartnerCreate,
    db: Session = Depends(get_db),
) -> DeliveryPartnerRead:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        role=UserRole.delivery_partner,
    )
    db.add(user)
    db.flush()
    partner = DeliveryPartner(user_id=user.id, vehicle_number=payload.vehicle_number)
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return DeliveryPartnerRead(
        id=partner.id,
        user_id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        vehicle_number=partner.vehicle_number,
        is_available=partner.is_available,
    )


@router.get("/orders", response_model=DeliveryOrdersRead)
def get_delivery_orders(
    db: Session = Depends(get_db),
    _: User = Depends(require_delivery_partner),
) -> DeliveryOrdersRead:
    assigned = (
        delivery_order_query(db)
        .filter(Order.status.in_([OrderStatus.ready, OrderStatus.out_for_delivery]))
        .order_by(Order.created_at.asc())
        .all()
    )
    history = (
        delivery_order_query(db)
        .filter(Order.status.in_([OrderStatus.delivered, OrderStatus.cancelled]))
        .order_by(Order.updated_at.desc())
        .limit(30)
        .all()
    )
    return DeliveryOrdersRead(
        assigned_orders=[order_to_read(order) for order in assigned],
        delivery_history=[order_to_read(order) for order in history],
    )


@router.patch("/orders/{order_number}/status", response_model=OrderRead)
def update_delivery_status(
    order_number: str,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_delivery_partner),
) -> OrderRead:
    allowed = {
        "out_for_delivery": OrderStatus.out_for_delivery,
        "out for delivery": OrderStatus.out_for_delivery,
        "delivered": OrderStatus.delivered,
        "cancelled": OrderStatus.cancelled,
    }
    next_status = allowed.get(payload.status.strip().lower().replace("-", "_"))
    if not next_status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use: Out for delivery, Delivered, Cancelled")

    order = delivery_order_query(db).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    order.status = next_status
    db.commit()
    db.refresh(order)
    return order_to_read(order)
