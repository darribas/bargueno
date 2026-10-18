VENV ?= .venv
PY := $(VENV)/bin/python
JUPYTER := $(VENV)/bin/jupyter

.PHONY: setup build serve test clean

setup:
	python3 -m venv $(VENV)
	$(PY) -m pip install -r requirements.txt

build:
	cd lite && ../$(JUPYTER) lite build
	$(PY) scripts/postbuild.py dist

serve:
	$(PY) -m http.server 8000 --directory dist

test:
	npx playwright test

clean:
	rm -rf dist lite/.jupyterlite.doit.db
