# Mocky Pops Deployment Checklist

## Environment

- Set `ENVIRONMENT=production`.
- Replace `SECRET_KEY` with a long random secret.
- Use managed PostgreSQL and update `DATABASE_URL`.
- Set `BACKEND_CORS_ORIGINS` to production domains only.
- Configure email, SMS and push providers.
- Configure `SENTRY_DSN` or another error tracker.

## Database

- Create PostgreSQL database.
- Run the API once to create tables for the current prototype.
- Use Alembic for production schema changes:

```powershell
cd backend
..\.venv\Scripts\alembic.exe revision --autogenerate -m "production baseline"
..\.venv\Scripts\alembic.exe upgrade head
```

- Before high-volume production, disable automatic schema creation after the first migration baseline.
- Back up database daily.

## Security

- Serve API behind HTTPS.
- Keep admin pages behind strong credentials.
- Rotate secrets before launch.
- Keep upload size limits enabled.
- Review CORS origins.
- Use production rate limit settings.

## Deployment

- Build with `docker compose build`.
- Run with `docker compose up -d`.
- Point domain DNS to the cloud server or load balancer.
- Terminate TLS using a reverse proxy or managed platform.
- Mount persistent storage for uploaded product images.

## Monitoring

- Check `/health`.
- Check `/health/db`.
- Monitor API logs.
- Add uptime monitoring for `/health`.
- Add database CPU/storage alerts.
- Add error tracking alerts.

## Final Smoke Test

Run:

```powershell
cd backend
..\.venv\Scripts\python.exe -m scripts.smoke_test
```

Manually verify:

- customer registration and login
- admin login
- product management
- cart and checkout
- order status update
- delivery dashboard
- franchise application and approval
- gift card purchase and checkout redemption
- loyalty page
- AI chatbot and admin BI
