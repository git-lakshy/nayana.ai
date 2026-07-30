"""agents.py — kept minimal after v1 legacy removal.

Only `is_api_configured` remains; it is used by test_runner.py to decide
whether Gemini ADK question generation is available.
"""
import os

# Gemini / Vertex key presence check
_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("VERTEX_API_KEY")


def is_api_configured() -> bool:
    """Return True if a Gemini/Vertex API key is present in the environment."""
    return bool(_API_KEY)
