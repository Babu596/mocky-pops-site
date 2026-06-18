from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_admin, require_customer, require_franchise_owner
from app.core.security import hash_password
from app.db.session import get_db
from app.models import (
    BulkOrder,
    BulkOrderStatus,
    Franchise,
    FranchiseStatus,
    GiftCard,
    GiftCardTransaction,
    LoyaltyAccount,
    Order,
    Outlet,
    OutletStatus,
    Reward,
    Royalty,
    RoyaltyStatus,
    Staff,
    User,
    UserRole,
)
from app.schemas.phase4 import (
    BulkOrderCreate,
    BulkOrderRead,
    BulkOrderUpdate,
    FranchiseApplicationCreate,
    FranchiseDashboard,
    FranchiseDecision,
    FranchiseRead,
    GiftCardCreate,
    GiftCardRead,
    GiftCardRedeem,
    GiftCardTransactionRead,
    LoyaltyRead,
    OutletCreate,
    OutletPerformance,
    OutletRead,
    OutletUpdate,
    RewardRedeem,
    RoyaltyRead,
    StaffCreate,
    StaffRead,
)
from app.services.notifications import queue_notification


router = APIRouter(prefix="/business", tags=["phase-4"])


def now_like(value: datetime) -> datetime:
    return datetime.now(value.tzinfo) if value.tzinfo else datetime.now()


def franchise_to_read(franchise: Franchise) -> FranchiseRead:
    return FranchiseRead(
        id=franchise.id,
        franchise_code=franchise.franchise_code,
        applicant_name=franchise.applicant_name,
        phone=franchise.phone,
        email=franchise.email,
        location=franchise.location,
        investment_details=franchise.investment_details,
        experience_details=franchise.experience_details,
        document_url=franchise.document_url,
        status=franchise.status.value,
        owner_user_id=franchise.owner_user_id,
        created_at=franchise.created_at,
    )


def outlet_to_read(outlet: Outlet) -> OutletRead:
    return OutletRead(
        id=outlet.id,
        franchise_id=outlet.franchise_id,
        name=outlet.name,
        address=outlet.address,
        contact_number=outlet.contact_number,
        manager=outlet.manager,
        operating_hours=outlet.operating_hours,
        location=outlet.location,
        status=outlet.status.value,
    )


def royalty_to_read(royalty: Royalty) -> RoyaltyRead:
    return RoyaltyRead(
        id=royalty.id,
        franchise_id=royalty.franchise_id,
        month=royalty.month,
        revenue=float(royalty.revenue),
        commission_rate=float(royalty.commission_rate),
        royalty_amount=float(royalty.royalty_amount),
        invoice_number=royalty.invoice_number,
        status=royalty.status.value,
        paid_at=royalty.paid_at,
    )


def gift_card_to_read(card: GiftCard) -> GiftCardRead:
    return GiftCardRead(
        code=card.code,
        recipient_email=card.recipient_email,
        message=card.message,
        initial_amount=float(card.initial_amount),
        balance=float(card.balance),
        expires_at=card.expires_at,
        is_active=card.is_active,
    )


def bulk_order_to_read(order: BulkOrder) -> BulkOrderRead:
    return BulkOrderRead(
        id=order.id,
        customer_name=order.customer_name,
        phone=order.phone,
        email=order.email,
        event_type=order.event_type,
        event_date=order.event_date,
        guest_count=order.guest_count,
        location=order.location,
        package_preference=order.package_preference,
        notes=order.notes,
        quoted_amount=float(order.quoted_amount) if order.quoted_amount is not None else None,
        status=order.status.value,
        created_at=order.created_at,
    )


def ensure_loyalty_account(db: Session, user: User) -> LoyaltyAccount:
    account = db.query(LoyaltyAccount).filter(LoyaltyAccount.user_id == user.id).first()
    if account:
        return account
    account = LoyaltyAccount(user_id=user.id, referral_code=f"MP{user.id}{uuid4().hex[:6].upper()}")
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def update_tier(account: LoyaltyAccount) -> None:
    if account.points >= 2000:
        account.tier = "Premium"
    elif account.points >= 1000:
        account.tier = "Gold"
    elif account.points >= 400:
        account.tier = "Silver"
    else:
        account.tier = "Bronze"


@router.post("/franchise/applications", response_model=FranchiseRead, status_code=status.HTTP_201_CREATED)
def create_franchise_application(payload: FranchiseApplicationCreate, db: Session = Depends(get_db)) -> FranchiseRead:
    franchise = Franchise(**payload.model_dump(), status=FranchiseStatus.pending)
    db.add(franchise)
    db.commit()
    db.refresh(franchise)
    queue_notification(db, "New franchise request", f"{franchise.applicant_name} applied for {franchise.location}.", audience="admin")
    return franchise_to_read(franchise)


@router.get("/franchise/applications", response_model=list[FranchiseRead])
def list_franchise_applications(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[FranchiseRead]:
    rows = db.query(Franchise).order_by(Franchise.created_at.desc()).all()
    return [franchise_to_read(row) for row in rows]


@router.patch("/franchise/applications/{franchise_id}/decision", response_model=FranchiseRead)
def decide_franchise_application(
    franchise_id: int,
    payload: FranchiseDecision,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> FranchiseRead:
    franchise = db.query(Franchise).filter(Franchise.id == franchise_id).first()
    if not franchise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Franchise application not found")

    franchise.status = FranchiseStatus(payload.status)
    if franchise.status == FranchiseStatus.approved:
        franchise.franchise_code = franchise.franchise_code or f"MPF-{franchise.id:04d}"
        owner = db.query(User).filter(User.email == franchise.email).first()
        if not owner:
            owner = User(
                name=franchise.applicant_name,
                email=franchise.email,
                phone=franchise.phone,
                hashed_password=hash_password(payload.owner_password or f"Mocky@{franchise.id:04d}"),
                role=UserRole.franchise_owner,
            )
            db.add(owner)
            db.flush()
        else:
            owner.role = UserRole.franchise_owner
        franchise.owner_user_id = owner.id
    db.commit()
    db.refresh(franchise)
    return franchise_to_read(franchise)


@router.get("/franchise/dashboard", response_model=FranchiseDashboard)
def franchise_dashboard(db: Session = Depends(get_db), owner: User = Depends(require_franchise_owner)) -> FranchiseDashboard:
    franchise = db.query(Franchise).filter(Franchise.owner_user_id == owner.id).first()
    if not franchise:
        return FranchiseDashboard(franchise=None, outlets=[], royalties=[], performance=[])
    outlets = db.query(Outlet).filter(Outlet.franchise_id == franchise.id).order_by(Outlet.name).all()
    royalties = db.query(Royalty).filter(Royalty.franchise_id == franchise.id).order_by(Royalty.month.desc()).all()
    performance = [
        OutletPerformance(outlet=outlet_to_read(outlet), orders=0, revenue=0.0, customers=0)
        for outlet in outlets
    ]
    return FranchiseDashboard(
        franchise=franchise_to_read(franchise),
        outlets=[outlet_to_read(outlet) for outlet in outlets],
        royalties=[royalty_to_read(royalty) for royalty in royalties],
        performance=performance,
    )


@router.get("/outlets", response_model=list[OutletRead])
def list_outlets(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[OutletRead]:
    return [outlet_to_read(outlet) for outlet in db.query(Outlet).order_by(Outlet.name).all()]


@router.post("/outlets", response_model=OutletRead, status_code=status.HTTP_201_CREATED)
def create_outlet(payload: OutletCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> OutletRead:
    if payload.franchise_id and not db.query(Franchise).filter(Franchise.id == payload.franchise_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Franchise not found")
    outlet = Outlet(**payload.model_dump())
    db.add(outlet)
    db.commit()
    db.refresh(outlet)
    return outlet_to_read(outlet)


@router.patch("/outlets/{outlet_id}", response_model=OutletRead)
def update_outlet(outlet_id: int, payload: OutletUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> OutletRead:
    outlet = db.query(Outlet).filter(Outlet.id == outlet_id).first()
    if not outlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outlet not found")
    data = payload.model_dump()
    data["status"] = OutletStatus(data["status"])
    for field, value in data.items():
        setattr(outlet, field, value)
    db.commit()
    db.refresh(outlet)
    return outlet_to_read(outlet)


@router.post("/staff", response_model=StaffRead, status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffCreate, db: Session = Depends(get_db), owner: User = Depends(require_franchise_owner)) -> StaffRead:
    franchise = db.query(Franchise).filter(Franchise.owner_user_id == owner.id).first()
    if not franchise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Franchise not found")
    outlet = db.query(Outlet).filter(Outlet.id == payload.outlet_id, Outlet.franchise_id == franchise.id).first()
    if not outlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outlet not found")
    staff = Staff(**payload.model_dump())
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return StaffRead(id=staff.id, outlet_id=staff.outlet_id, name=staff.name, phone=staff.phone, role=staff.role, is_active=staff.is_active)


@router.get("/royalties", response_model=list[RoyaltyRead])
def list_royalties(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[RoyaltyRead]:
    return [royalty_to_read(row) for row in db.query(Royalty).order_by(Royalty.created_at.desc()).all()]


@router.post("/royalties/calculate", response_model=list[RoyaltyRead])
def calculate_royalties(month: str, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[RoyaltyRead]:
    franchises = db.query(Franchise).filter(Franchise.status == FranchiseStatus.approved).all()
    generated = []
    for franchise in franchises:
        revenue = Decimal("0.00")
        rate = Decimal("8.00")
        amount = (revenue * rate / Decimal("100")).quantize(Decimal("0.01"))
        royalty = db.query(Royalty).filter(Royalty.franchise_id == franchise.id, Royalty.month == month).first()
        if not royalty:
            royalty = Royalty(franchise_id=franchise.id, month=month, invoice_number=f"INV-{franchise.id}-{month}")
            db.add(royalty)
        royalty.revenue = revenue
        royalty.commission_rate = rate
        royalty.royalty_amount = amount
        generated.append(royalty)
    db.commit()
    return [royalty_to_read(row) for row in generated]


@router.patch("/royalties/{royalty_id}/paid", response_model=RoyaltyRead)
def mark_royalty_paid(royalty_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> RoyaltyRead:
    royalty = db.query(Royalty).filter(Royalty.id == royalty_id).first()
    if not royalty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Royalty not found")
    royalty.status = RoyaltyStatus.paid
    royalty.paid_at = datetime.now()
    db.commit()
    db.refresh(royalty)
    return royalty_to_read(royalty)


@router.post("/gift-cards", response_model=GiftCardRead, status_code=status.HTTP_201_CREATED)
def buy_gift_card(payload: GiftCardCreate, db: Session = Depends(get_db), user: User = Depends(require_customer)) -> GiftCardRead:
    card = GiftCard(
        code=f"MPGC-{uuid4().hex[:10].upper()}",
        buyer_user_id=user.id,
        recipient_email=payload.recipient_email,
        message=payload.message,
        initial_amount=payload.amount,
        balance=payload.amount,
        expires_at=datetime.now() + timedelta(days=365),
    )
    db.add(card)
    db.flush()
    db.add(GiftCardTransaction(gift_card_id=card.id, amount=payload.amount, transaction_type="purchase"))
    db.commit()
    db.refresh(card)
    return gift_card_to_read(card)


@router.get("/gift-cards/{code}", response_model=GiftCardRead)
def get_gift_card(code: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> GiftCardRead:
    card = db.query(GiftCard).filter(GiftCard.code == code).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gift card not found")
    return gift_card_to_read(card)


@router.post("/gift-cards/redeem", response_model=GiftCardRead)
def redeem_gift_card(payload: GiftCardRedeem, db: Session = Depends(get_db), _: User = Depends(require_customer)) -> GiftCardRead:
    card = db.query(GiftCard).filter(GiftCard.code == payload.code, GiftCard.is_active.is_(True)).first()
    if not card or card.expires_at < now_like(card.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gift card is invalid or expired")
    if card.balance < payload.amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient gift card balance")
    card.balance -= payload.amount
    db.add(GiftCardTransaction(gift_card_id=card.id, amount=payload.amount, transaction_type="redeem"))
    db.commit()
    db.refresh(card)
    return gift_card_to_read(card)


@router.get("/gift-cards/{code}/transactions", response_model=list[GiftCardTransactionRead])
def gift_card_transactions(code: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[GiftCardTransactionRead]:
    card = db.query(GiftCard).filter(GiftCard.code == code).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gift card not found")
    return [
        GiftCardTransactionRead(amount=float(row.amount), transaction_type=row.transaction_type, created_at=row.created_at)
        for row in card.transactions
    ]


@router.get("/loyalty/me", response_model=LoyaltyRead)
def get_loyalty(db: Session = Depends(get_db), user: User = Depends(require_customer)) -> LoyaltyRead:
    account = ensure_loyalty_account(db, user)
    order_total = db.query(func.coalesce(func.sum(Order.total), 0)).filter(Order.user_id == user.id).scalar() or Decimal("0")
    earned_points = int(Decimal(order_total) // Decimal("10"))
    if earned_points > account.points:
        account.points = earned_points
        update_tier(account)
        db.commit()
    rewards = [
        {"title": reward.title, "points_cost": reward.points_cost, "coupon_code": reward.coupon_code, "is_redeemed": reward.is_redeemed}
        for reward in account.rewards
    ]
    return LoyaltyRead(points=account.points, tier=account.tier, referral_code=account.referral_code, rewards=rewards)


@router.post("/loyalty/redeem", response_model=LoyaltyRead)
def redeem_reward(payload: RewardRedeem, db: Session = Depends(get_db), user: User = Depends(require_customer)) -> LoyaltyRead:
    account = ensure_loyalty_account(db, user)
    if account.points < payload.points_cost:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough loyalty points")
    account.points -= payload.points_cost
    update_tier(account)
    db.add(
        Reward(
            loyalty_account_id=account.id,
            title=payload.title,
            points_cost=payload.points_cost,
            coupon_code=f"LOYAL{uuid4().hex[:6].upper()}",
            is_redeemed=True,
        )
    )
    db.commit()
    db.refresh(account)
    return get_loyalty(db, user)


@router.post("/bulk-orders", response_model=BulkOrderRead, status_code=status.HTTP_201_CREATED)
def create_bulk_order(
    payload: BulkOrderCreate,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> BulkOrderRead:
    order = BulkOrder(user_id=user.id if user else None, **payload.model_dump())
    db.add(order)
    db.commit()
    db.refresh(order)
    return bulk_order_to_read(order)


@router.get("/bulk-orders", response_model=list[BulkOrderRead])
def list_bulk_orders(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[BulkOrderRead]:
    return [bulk_order_to_read(row) for row in db.query(BulkOrder).order_by(BulkOrder.created_at.desc()).all()]


@router.patch("/bulk-orders/{bulk_order_id}", response_model=BulkOrderRead)
def update_bulk_order(
    bulk_order_id: int,
    payload: BulkOrderUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> BulkOrderRead:
    order = db.query(BulkOrder).filter(BulkOrder.id == bulk_order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bulk order not found")
    order.status = BulkOrderStatus(payload.status)
    order.quoted_amount = payload.quoted_amount
    db.commit()
    db.refresh(order)
    return bulk_order_to_read(order)


@router.get("/reports/admin")
def admin_reports(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    return {
        "franchise_sales": 0,
        "outlet_count": db.query(func.count(Outlet.id)).scalar() or 0,
        "franchise_count": db.query(func.count(Franchise.id)).scalar() or 0,
        "bulk_enquiries": db.query(func.count(BulkOrder.id)).scalar() or 0,
        "gift_cards_sold": db.query(func.count(GiftCard.id)).scalar() or 0,
    }
