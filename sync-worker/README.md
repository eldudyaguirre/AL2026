# AL2026 Sync Worker

Worker de Windows para mantener una copia de PostgreSQL local en PostgreSQL de Railway.

## Flujo

`PostgreSQL local -> worker -> PostgreSQL Railway`

La sincronización inicial trabaja con una fotografía consistente de:

- `compras`
- `comprasnv`
- `proveedores`

Cada ciclo toma los datos locales y los reemplaza en Railway dentro de una sola transacción. La API de Railway puede consultar las tres tablas localmente en Railway, sin pasar por Tailscale.

## Configuración

Definir estas variables en el servidor local:

```text
LOCAL_DATABASE_URL=postgresql://...
RAILWAY_DATABASE_URL=postgresql://...
RAILWAY_DATABASE_SSL=true
SYNC_TABLES=compras,comprasnv,proveedores
SYNC_INTERVAL_MS=5000
SYNC_BATCH_SIZE=200
```

`RAILWAY_DATABASE_URL` debe ser la conexión pública/TCP de PostgreSQL de Railway cuando el worker se ejecuta fuera de Railway. Railway documenta que la conexión externa de PostgreSQL se obtiene habilitando Public Networking/TCP Proxy y que se expone mediante `DATABASE_PUBLIC_URL`.

## Ejecución

Desde la raíz del proyecto:

```text
npm install
npm run sync
```

El worker mostrará algo parecido a:

```text
[SYNC] Tablas: compras, comprasnv, proveedores
[SYNC] Intervalo: 5000 ms
[SYNC] Lote: 200 filas
[SYNC] OK compras=2942, comprasnv=14, proveedores=233 en ... ms
```

## Importante

Esta primera versión es deliberadamente simple y segura para las tablas actuales. No modifica la base local. Si la estructura local y la de Railway no coincide, el worker detiene ese ciclo y no intenta alterar automáticamente la estructura de Railway.

La sincronización incremental por cambios (INSERT/UPDATE/DELETE) se puede implementar después de validar que la copia inicial funciona correctamente.
