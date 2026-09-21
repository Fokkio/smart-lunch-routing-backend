# Backend certificates (not committed)

Download the **Aiven MySQL CA certificate** from your Aiven service
overview page and save it here as:

```text
backend/certs/ca.pem
```

Notes:

- `backend/.env` points at it via `DB_SSL_CA_PATH=./certs/ca.pem`
  (run backend commands from the `backend/` directory).
- Never commit `ca.pem` — it is ignored by Git (only this README is tracked).
- Never paste certificate contents into chat, docs, or source files.
