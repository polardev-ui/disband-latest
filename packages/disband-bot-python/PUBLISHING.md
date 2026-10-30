# Publishing `disband-bot` to PyPI

This guide walks through building and uploading the Python bot client
(`packages/disband-bot-python`) to PyPI so users can `pip install disband-bot`.

## Prerequisites

- Python 3.9+ with `pip`
- A PyPI account (https://pypi.org/account/register/)
- An API token from https://pypi.org/manage/account/token/ (scope it to the
  `disband-bot` project once it exists)

## 1. Install build tools

```bash
python3 -m pip install --upgrade build twine
```

## 2. Bump the version

Edit `packages/disband-bot-python/pyproject.toml`:

```toml
[project]
name = "disband-bot"
version = "0.1.1"   # bump this
```

Also update the version string in `packages/disband-bot-python/disband_bot/__init__.py` if it
hardcodes one.

## 3. Build the distribution

```bash
cd packages/disband-bot-python
python3 -m build
```

This produces `dist/disband-bot-0.1.1.tar.gz` (sdist) and `dist/disband_bot-0.1.1-py3-none-any.whl`
(wheel) in the `dist/` folder.

## 4. Test on TestPyPI first (recommended)

```bash
python3 -m twine upload --repository testpypi dist/*
```

Then verify:

```bash
pip install --index-url https://test.pypi.org/simple/ --no-deps disband-bot
python3 -c "import disband_bot; print(disband_bot.__version__)"
```

## 5. Upload to PyPI

```bash
python3 -m twine upload dist/*
```

You'll be prompted for username (`__token__`) and password (your API token, including the
`pypi-` prefix).

## 6. Verify

```bash
pip install disband-bot
python3 -c "from disband_bot import Client; print('ok')"
```

## Automation (GitHub Actions)

Add a workflow (`.github/workflows/publish-python.yml`) that triggers on a tag like
`bot-py-v*`:

```yaml
name: Publish Python bot
on:
  push:
    tags: ['bot-py-v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.x' }
      - run: pip install build twine
      - run: cd packages/disband-bot-python && python -m build
      - uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: packages/disband-bot-python/dist/
          password: ${{ secrets.PYPI_API_TOKEN }}
```

Store the PyPI token as a repo secret named `PYPI_API_TOKEN`.

## Notes

- PyPI project names are globally unique. `disband-bot` is the intended name.
- Once uploaded, a version cannot be re-uploaded. Always bump the version.
- The package has zero runtime dependencies (stdlib only), so no `install_requires` is needed.
