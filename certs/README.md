# Backend certificates (not committed)

TiDB Cloud Starter requires TLS for public endpoint connections. Download the
TiDB Cloud CA certificate and save it here as:

```text
backend/certs/isrgrootx1.pem
```

Runtime configuration in `backend/.env` should point to this file:

```env
DB_SSL=true
DB_SSL_CA_PATH=./certs/isrgrootx1.pem
```

For Vercel or another deployment platform, use `DB_SSL_CA` with the PEM text
instead of committing a certificate file.

Notes:

- Run backend commands from the `backend/` directory so the relative path resolves.
- Never commit `.pem` files — certificates in this directory are ignored by Git.
- Never paste certificate contents into chat, docs, logs, or source files.
- `ca.pem` may exist as the legacy Aiven CA during migration history; do not use it for TiDB connections.
