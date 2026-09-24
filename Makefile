NPM       := npm
BASE_PATH ?= /diurnus/

.DEFAULT_GOAL := help
.PHONY: help install dev build serve test check fmt clean

## instalacja zależności, gdy package.json lub lock są nowsze niż node_modules
## (lokalnie `npm install`, bo `npm ci` odmawia przy rozjechanym locku; CI używa `npm ci`)
node_modules: package.json package-lock.json
	@$(NPM) install
	@touch node_modules

install: node_modules  ## zainstaluj zależności

dev: node_modules      ## serwer deweloperski z HMR
	BASE_PATH=/ $(NPM) run dev

build: node_modules    ## produkcyjna budowa do dist/
	BASE_PATH=$(BASE_PATH) $(NPM) run build

serve: build           ## podgląd zbudowanej aplikacji
	BASE_PATH=$(BASE_PATH) $(NPM) run preview

test: node_modules     ## testy jednostkowe
	$(NPM) run test

check: node_modules    ## sprawdzenie typów i komponentów
	$(NPM) run check

fmt: node_modules      ## formatowanie
	$(NPM) run fmt

clean:                 ## usuń wyniki budowy i zależności
	rm -rf dist node_modules

help:                  ## ta lista
	@grep -hE '^[a-z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'
