from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user, require_admin, require_customer
from app.db.session import get_db
from app.models import ChatMessage, CustomerPreference, User
from app.schemas.ai import (
    BusinessAssistantResponse,
    ChatMessageRead,
    ChatRequest,
    ChatResponse,
    InventoryResponse,
    MarketingRequest,
    MarketingResponse,
    PreferenceUpdate,
    RecommendationResponse,
)
from app.services.ai import business_assistant, build_recommendations, chatbot_answer, inventory_predictions, marketing_ideas


router = APIRouter(prefix="/ai", tags=["ai"])


def chat_message_to_read(message: ChatMessage) -> ChatMessageRead:
    return ChatMessageRead(role=message.role, message=message.message, created_at=message.created_at)


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ChatResponse:
    answer, suggestions, history = chatbot_answer(db, payload.message, payload.session_id, current_user)
    return ChatResponse(
        answer=answer,
        session_id=payload.session_id,
        suggestions=suggestions,
        history=[chat_message_to_read(item) for item in history],
    )


@router.get("/chat/history/{session_id}", response_model=list[ChatMessageRead])
def chat_history(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[ChatMessageRead]:
    from app.services.ai import recent_chat_history

    return [chat_message_to_read(item) for item in recent_chat_history(db, session_id, current_user)]


@router.get("/recommendations", response_model=RecommendationResponse)
def recommendations(
    weather: str | None = None,
    time_of_day: str | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> RecommendationResponse:
    return build_recommendations(db, current_user, weather, time_of_day)


@router.put("/preferences", status_code=204)
def update_preferences(
    payload: PreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_customer),
) -> None:
    preference = db.query(CustomerPreference).filter(CustomerPreference.user_id == current_user.id).first()
    if not preference:
        preference = CustomerPreference(user_id=current_user.id)
        db.add(preference)
    preference.preferred_categories = payload.preferred_categories
    preference.favourite_ingredients = payload.favourite_ingredients
    preference.avoided_ingredients = payload.avoided_ingredients
    preference.sweetness = payload.sweetness
    db.commit()


@router.get("/business-assistant", response_model=BusinessAssistantResponse)
def owner_business_assistant(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> BusinessAssistantResponse:
    return business_assistant(db)


@router.get("/inventory", response_model=InventoryResponse)
def inventory(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> InventoryResponse:
    return inventory_predictions(db)


@router.post("/marketing", response_model=MarketingResponse)
def marketing(
    payload: MarketingRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> MarketingResponse:
    return marketing_ideas(db, payload.goal, payload.channel)
