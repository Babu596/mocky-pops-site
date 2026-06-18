from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, get_optional_user, require_admin
from app.db.session import get_db
from app.models import Order, OrderItem, OrderStatus, PaymentStatus, User, UserRole
from app.schemas.order import OrderCreate, OrderRead, OrderStatusUpdate, order_to_read
from app.services.orders import create_order
from app.services.notifications import queue_notification


router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def place_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> OrderRead:
    order = create_order(db, payload, current_user)
    return order_to_read(order)


@router.get("", response_model=list[OrderRead])
def view_order_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrderRead]:
    query = (
        db.query(Order)
        .options(
            joinedload(Order.address),
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payment),
        )
        .order_by(Order.created_at.desc())
    )

    if current_user.role != UserRole.admin:
        query = query.filter(Order.user_id == current_user.id)

    return [order_to_read(order) for order in query.all()]


@router.patch("/{order_number}/status", response_model=OrderRead)
def update_order_status(
    order_number: str,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> OrderRead:
    status_aliases = {
        "pending": OrderStatus.placed,
        "placed": OrderStatus.placed,
        "confirmed": OrderStatus.accepted,
        "accepted": OrderStatus.accepted,
        "preparing": OrderStatus.preparing,
        "ready": OrderStatus.ready,
        "out_for_delivery": OrderStatus.out_for_delivery,
        "out for delivery": OrderStatus.out_for_delivery,
        "completed": OrderStatus.delivered,
        "delivered": OrderStatus.delivered,
        "cancelled": OrderStatus.cancelled,
    }
    next_status = status_aliases.get(payload.status.strip().lower().replace("-", "_"))
    if not next_status:
        allowed = "Pending, Confirmed, Preparing, Ready, Out for delivery, Completed, Cancelled"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status. Use: {allowed}")

    order = db.query(Order).filter(Order.order_number == order_number).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    order.status = next_status
    db.commit()
    db.refresh(order)
    if order.user_id:
        queue_notification(db, "Order status updated", f"Your order {order.order_number} is now {order.status.value}.", user_id=order.user_id)
    return order_to_read(order)


@router.patch("/{order_number}/cancel", response_model=OrderRead)
def cancel_order(
    order_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrderRead:
    query = db.query(Order).filter(Order.order_number == order_number)
    if current_user.role != UserRole.admin:
        query = query.filter(Order.user_id == current_user.id)

    order = query.first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.status in {OrderStatus.out_for_delivery, OrderStatus.delivered, OrderStatus.cancelled}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This order can no longer be cancelled")

    order.status = OrderStatus.cancelled
    if order.payment:
        order.payment.status = PaymentStatus.refunded if order.payment.status == PaymentStatus.paid else order.payment.status
    db.commit()
    db.refresh(order)
    return order_to_read(order)
