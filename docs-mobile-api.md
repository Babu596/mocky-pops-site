# Mocky Pops Mobile API Guide

Base URL:

```text
https://api.mockypops.com/api
```

Use `Authorization: Bearer <token>` for protected endpoints.

## Customer App

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /products`
- `GET /products/{slug}`
- `GET /products/categories`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/{item_id}`
- `DELETE /cart/items/{item_id}`
- `POST /orders`
- `GET /orders`
- `PATCH /orders/{order_number}/cancel`
- `GET /customers/me`
- `PATCH /customers/me`
- `GET /customers/me/addresses`
- `POST /customers/me/addresses`
- `GET /business/loyalty/me`
- `POST /business/gift-cards`
- `GET /notifications`
- `PATCH /notifications/{notification_id}/read`
- `POST /ai/chat`
- `GET /ai/recommendations`

## Delivery App

- `POST /auth/login`
- `GET /delivery/orders`
- `PATCH /delivery/orders/{order_number}/status`
- `GET /notifications`

## Franchise App

- `POST /auth/login`
- `GET /business/franchise/dashboard`
- `POST /business/staff`
- `GET /notifications`

## Admin App

- `POST /auth/login`
- `GET /admin/dashboard`
- `GET /admin/orders`
- `PATCH /admin/orders/{order_number}/status`
- `GET /business/franchise/applications`
- `PATCH /business/franchise/applications/{id}/decision`
- `GET /business/outlets`
- `POST /business/outlets`
- `GET /business/reports/admin`
- `GET /ai/business-assistant`
- `GET /ai/inventory`
- `POST /ai/marketing`

## Mobile Structure Recommendation

Customer app:

- Auth
- Menu
- Product details
- Cart
- Checkout and payment
- Tracking
- Profile and addresses
- Loyalty and gift cards
- Notifications

Delivery app:

- Auth
- Assigned orders
- Customer address
- Navigation handoff
- Delivery status update
- Delivery history

Franchise app:

- Auth
- Dashboard
- Outlet sales
- Orders
- Inventory
- Staff
- Royalty records
