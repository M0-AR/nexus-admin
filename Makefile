.PHONY: up down logs reset seed psql redis-cli backend-dev frontend-dev migrate build

# ── Full stack ────────────────────────────────────────────────────────────────
up:            ## Build & start everything
	docker compose up --build -d

down:          ## Stop everything
	docker compose down

logs:          ## Tail all logs
	docker compose logs -f --tail=100

reset:         ## Nuke volumes and start fresh (destroys data)
	docker compose down -v
	docker compose up --build -d

# ── Data ──────────────────────────────────────────────────────────────────────
seed:          ## Re-run the demo seed inside the backend container
	docker compose exec backend node dist/scripts/seed.js

psql:          ## psql shell as the DB owner
	docker compose exec postgres psql -U $${POSTGRES_USER:-nexus_owner} -d $${POSTGRES_DB:-nexus}

redis-cli:     ## redis shell
	docker compose exec redis redis-cli

# ── Local development (without docker for the app processes) ─────────────────
backend-dev:   ## Backend dev server with hot reload (needs docker postgres+redis)
	cd backend && npm run dev

frontend-dev:  ## Frontend dev server
	cd frontend && npm run dev

migrate:       ## Create a new migration locally
	cd backend && npm run migrate:dev

build:         ## Type-check + build both apps locally
	cd backend && npm run build
	cd frontend && npm run build
