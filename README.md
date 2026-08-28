# AL2026 API

API inicial para probar la conexión entre Railway y PostgreSQL mediante Tailscale + Railtail.

## Endpoints

- `GET /` — verifica que la API está funcionando.
- `GET /db` — prueba la conexión a PostgreSQL y devuelve información básica del servidor.
- `GET /health` — verifica API y base de datos.

## Variables de entorno

Se puede usar `DATABASE_URL` o las variables individuales `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

Para Railway + Railtail, la conexión se configurará posteriormente usando el dominio privado de Railtail.
