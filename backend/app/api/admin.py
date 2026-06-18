from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_admin
from app.core.config import get_settings
from app.db.session import get_db
from app.models import Category, Order, OrderItem, OrderStatus, Product, User, UserRole
from app.schemas.admin import AdminDashboard, PopularProduct, SalesPoint
from app.schemas.order import OrderRead, order_to_read
from app.schemas.product import CategoryCreate, CategoryRead, ProductCreate, ProductRead, ProductUpdate, product_to_read


router = APIRouter(prefix="/admin", tags=["admin"])

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
PUBLIC_UPLOAD_PREFIX = "/static/uploads"

STATUS_ALIASES = {
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


def get_category_or_404(db: Session, slug: str) -> Category:
    category = db.query(Category).filter(Category.slug == slug).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category does not exist")
    return category


def get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.query(Product).options(joinedload(Product.category)).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


def parse_status(value: str) -> OrderStatus:
    normalized = value.strip().lower().replace("-", "_")
    next_status = STATUS_ALIASES.get(normalized)
    if next_status:
        return next_status

    allowed = "Pending, Confirmed, Preparing, Ready, Out for delivery, Completed, Cancelled"
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status. Use: {allowed}")


@router.get("/dashboard", response_model=AdminDashboard)
def get_dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminDashboard:
    now = datetime.now()
    today_start = datetime.combine(now.date(), time.min)
    tomorrow_start = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=6)

    total_orders = db.query(func.count(Order.id)).scalar() or 0
    total_revenue = db.query(func.coalesce(func.sum(Order.total), 0)).scalar() or Decimal("0")
    todays_sales = (
        db.query(func.coalesce(func.sum(Order.total), 0))
        .filter(Order.created_at >= today_start, Order.created_at < tomorrow_start)
        .scalar()
        or Decimal("0")
    )
    total_customers = db.query(func.count(User.id)).filter(User.role == UserRole.customer).scalar() or 0

    popular_rows = (
        db.query(
            Product.slug,
            OrderItem.product_name,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("units_sold"),
            func.coalesce(func.sum(OrderItem.line_total), 0).label("revenue"),
        )
        .join(Product, Product.id == OrderItem.product_id)
        .group_by(Product.slug, OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    )
    popular_products = [
        PopularProduct(
            product_id=row.slug,
            name=row.product_name,
            units_sold=int(row.units_sold or 0),
            revenue=float(row.revenue or 0),
        )
        for row in popular_rows
    ]

    recent_orders = (
        db.query(Order)
        .options(
            joinedload(Order.address),
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payment),
        )
        .order_by(Order.created_at.desc())
        .limit(8)
        .all()
    )

    sales_rows = (
        db.query(
            func.date(Order.created_at).label("day"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .filter(Order.created_at >= week_start)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )
    sales_by_date = {str(row.day): row for row in sales_rows}
    sales_analytics = []
    for offset in range(7):
        day = (week_start + timedelta(days=offset)).date()
        row = sales_by_date.get(str(day))
        sales_analytics.append(
            SalesPoint(
                date=day.isoformat(),
                orders=int(row.orders if row else 0),
                revenue=float(row.revenue if row else 0),
            )
        )

    products = db.query(Product).options(joinedload(Product.category)).order_by(Product.name).all()

    return AdminDashboard(
        total_orders=total_orders,
        todays_sales=float(todays_sales),
        total_revenue=float(total_revenue),
        total_customers=total_customers,
        popular_products=popular_products,
        recent_orders=[order_to_read(order) for order in recent_orders],
        sales_analytics=sales_analytics,
        products=[product_to_read(product) for product in products],
    )


@router.get("/products", response_model=list[ProductRead])
def list_products(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[ProductRead]:
    products = db.query(Product).options(joinedload(Product.category)).order_by(Product.name).all()
    return [product_to_read(product) for product in products]


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> ProductRead:
    category = get_category_or_404(db, payload.category_slug)

    if db.query(Product).filter(Product.slug == payload.slug).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product slug already exists")

    product = Product(
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        image_url=payload.image_url,
        rating=payload.rating,
        ingredients=payload.ingredients,
        customizations=payload.customizations,
        is_available=payload.is_available,
        category_id=category.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product_to_read(product)


@router.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> ProductRead:
    product = get_product_or_404(db, product_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "category_slug" in update_data:
        product.category = get_category_or_404(db, update_data.pop("category_slug"))

    if "slug" in update_data:
        existing = db.query(Product).filter(Product.slug == update_data["slug"], Product.id != product.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product slug already exists")

    for field, value in update_data.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product_to_read(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    product = get_product_or_404(db, product_id)
    if product.order_items:
        product.is_available = False
        db.commit()
        return

    db.delete(product)
    db.commit()


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[Category]:
    return db.query(Category).order_by(Category.name).all()


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Category:
    if db.query(Category).filter(Category.slug == payload.slug).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category slug already exists")
    category = Category(slug=payload.slug, name=payload.name, is_active=payload.is_active)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int,
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Category:
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    existing = db.query(Category).filter(Category.slug == payload.slug, Category.id != category.id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category slug already exists")

    category.slug = payload.slug
    category.name = payload.name
    category.is_active = payload.is_active
    db.commit()
    db.refresh(category)
    return category


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
def upload_product_image(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
) -> dict[str, str]:
    settings = get_settings()
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload an image file")

    suffix = Path(file.filename or "").suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Supported image formats: JPG, PNG, WEBP")
    filename = f"{uuid4().hex}{suffix}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / filename

    contents = file.file.read()
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large")

    with target.open("wb") as buffer:
        buffer.write(contents)

    return {"image_url": f"{PUBLIC_UPLOAD_PREFIX}/{filename}"}


@router.get("/orders", response_model=list[OrderRead])
def list_orders(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[OrderRead]:
    orders = (
        db.query(Order)
        .options(
            joinedload(Order.address),
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payment),
        )
        .order_by(Order.created_at.desc())
        .all()
    )
    return [order_to_read(order) for order in orders]


@router.patch("/orders/{order_number}/status", response_model=OrderRead)
def update_order_status(
    order_number: str,
    payload: dict[str, str],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> OrderRead:
    order = (
        db.query(Order)
        .options(
            joinedload(Order.address),
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.payment),
        )
        .filter(Order.order_number == order_number)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    order.status = parse_status(payload.get("status", ""))
    db.commit()
    db.refresh(order)
    return order_to_read(order)
