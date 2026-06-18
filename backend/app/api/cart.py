from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_customer
from app.db.session import get_db
from app.models import Cart, CartItem, Product, User
from app.schemas.cart import CartItemCreate, CartItemRead, CartItemUpdate, CartRead
from app.schemas.product import product_to_read


router = APIRouter(prefix="/cart", tags=["cart"])


def get_or_create_cart(db: Session, user: User) -> Cart:
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product).joinedload(Product.category))
        .filter(Cart.user_id == user.id)
        .first()
    )
    if cart:
        return cart

    cart = Cart(user_id=user.id)
    db.add(cart)
    db.commit()
    return get_or_create_cart(db, user)


def cart_to_read(cart: Cart) -> CartRead:
    subtotal = Decimal("0.00")
    items = []
    for item in cart.items:
        line_total = item.product.price * item.quantity
        subtotal += line_total
        items.append(
            CartItemRead(
                id=item.id,
                product=product_to_read(item.product),
                quantity=item.quantity,
                selected_options=item.selected_options or {},
                line_total=float(line_total),
            )
        )

    delivery_fee = Decimal("29.00") if subtotal else Decimal("0.00")
    taxes = (subtotal * Decimal("0.05")).quantize(Decimal("0.01"))
    discount = Decimal("0.00")
    return CartRead(
        items=items,
        subtotal=float(subtotal),
        delivery_fee=float(delivery_fee),
        taxes=float(taxes),
        discount=float(discount),
        total=float(subtotal + delivery_fee + taxes - discount),
    )


@router.get("", response_model=CartRead)
def read_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CartRead:
    return cart_to_read(get_or_create_cart(db, current_user))


@router.post("/items", response_model=CartRead, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    payload: CartItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CartRead:
    cart = get_or_create_cart(db, current_user)
    product = db.query(Product).filter(Product.slug == payload.product_id, Product.is_available.is_(True)).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product unavailable")

    existing_item = next(
        (
            item
            for item in cart.items
            if item.product_id == product.id and (item.selected_options or {}) == payload.options
        ),
        None,
    )
    if existing_item:
        existing_item.quantity += payload.quantity
    else:
        db.add(
            CartItem(
                cart_id=cart.id,
                product_id=product.id,
                quantity=payload.quantity,
                selected_options=payload.options,
            )
        )
    db.commit()
    return cart_to_read(get_or_create_cart(db, current_user))


@router.patch("/items/{item_id}", response_model=CartRead)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CartRead:
    cart = get_or_create_cart(db, current_user)
    item = next((cart_item for cart_item in cart.items if cart_item.id == item_id), None)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")
    item.quantity = payload.quantity
    db.commit()
    return cart_to_read(get_or_create_cart(db, current_user))


@router.delete("/items/{item_id}", response_model=CartRead)
def remove_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> CartRead:
    cart = get_or_create_cart(db, current_user)
    item = next((cart_item for cart_item in cart.items if cart_item.id == item_id), None)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return cart_to_read(get_or_create_cart(db, current_user))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> None:
    cart = get_or_create_cart(db, current_user)
    for item in list(cart.items):
        db.delete(item)
    db.commit()
