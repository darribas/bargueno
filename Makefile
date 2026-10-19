VENV ?= .venv
PY := $(VENV)/bin/python
JUPYTER := $(VENV)/bin/jupyter

.PHONY: setup extension build serve test clean

setup:
	python3 -m venv $(VENV)
	$(PY) -m pip install -r requirements.txt
	cd extension && npm ci

# The Bargueño JupyterLab extension (TypeScript -> extension/labextension).
extension:
	cd extension && PATH="$(abspath $(VENV))/bin:$$PATH" npm run build

build: extension
	cd lite && ../$(JUPYTER) lite build
	$(PY) scripts/postbuild.py dist

serve:
	$(PY) -m http.server 8000 --directory dist

test:
	npx playwright test

clean:
	rm -rf dist lite/.jupyterlite.doit.db
	cd extension && npm run clean
