"""Vercel entry point: the whole Django app runs as one Python serverless function (see vercel.json)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.wsgi import application as app  # noqa: E402
