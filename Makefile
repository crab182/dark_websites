# Everything runs locally — no CI service involved.
.PHONY: validate build linkcheck rag-sync weekly serve hook

validate:        ## check the database (schema, facets, unique ids/urls)
	python3 scripts/validate.py

build:           ## regenerate stats, digest, feed.xml, FINDS.md, README stats
	python3 scripts/build.py

linkcheck:       ## best-effort liveness check of every URL (needs network)
	python3 scripts/linkcheck.py

rag-sync:        ## push sites into the RAG stack (needs RAG_ADMIN_KEY; see README)
	python3 scripts/rag_sync.py

weekly:          ## the full weekly routine: validate + build + linkcheck + commit + push
	scripts/weekly.sh

serve:           ## preview the portal at http://localhost:8000
	python3 -m http.server 8000

hook:            ## install the git pre-commit hook (validates on every commit)
	ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
	@echo "pre-commit hook installed"
