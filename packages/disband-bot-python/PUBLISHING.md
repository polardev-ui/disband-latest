# Publishing `disband-bot` to PyPI

Publish the Python bot client (`packages/disband-bot-python`) from your terminal.

## Prerequisites

- Python 3.9+
- PyPI account and an API token (https://pypi.org/manage/account/token/)
- Build tools:

```bash
python3 -m pip install --upgrade build twine
```

## Publish a release

```bash
cd packages/disband-bot-python

# 1) Clean old artifacts
rm -rf dist build *.egg-info

# 2) (optional) bump version in pyproject.toml and disband_bot/__init__.py
#    A version can only be uploaded once.

# 3) Build
python3 -m build

# 4) Optional: upload to TestPyPI first
# python3 -m twine upload --repository testpypi dist/*

# 5) Upload to PyPI
python3 -m twine upload dist/*
```

When prompted: username `__token__`, password your PyPI API token (including the
`pypi-` prefix).

## Verify

```bash
pip install --upgrade disband-bot
python3 -c "import disband_bot; print(disband_bot.__version__)"
```

## Notes

- Runtime dependencies: none (standard library only).
- The package name on PyPI is `disband-bot` (import: `disband_bot`).
- For CI, use `pypa/gh-action-pypi-publish` or `twine` with `TWINE_USERNAME=__token__` and `TWINE_PASSWORD`.
