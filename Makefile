.PHONY: help install dev run build preview lint format test

help: ## Print command description list
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Download project dependencies
	npm install

dev: ## Start application in development mode
	npm run dev

run: ## Start application in development mode (alias for dev)
	npm run dev

build: ## Compile static application build
	npm run build

preview: ## Preview production build locally
	npm run preview

lint: ## Run strict static analysis checks
	npm run lint

format: ## Run automatic code formatting
	npm run format

test: ## Execute automated test suite
	npm run lint
