"""
browser_adapter.py -- Python bridge to the Node.js Puppeteer LLM scraper.

Calls `node backend/browser/scraper.js --provider=<p> --question="<q>"`
as a child process and parses the JSON output.
"""
from __future__ import annotations

import json
import logging
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

_BROWSER_DIR = Path(__file__).parent.parent / "browser"
_SCRAPER = _BROWSER_DIR / "scraper.js"
_AUTH_SERVER = _BROWSER_DIR / "auth_server.js"
_SESSION_DIR = _BROWSER_DIR / "sessions"
_NODE = "node"


@dataclass
class BrowserResult:
    provider: str
    model: str
    answer_text: str
    latency_ms: int
    citations: List[str] = field(default_factory=list)
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return bool(self.answer_text) and not self.error


def _node_available() -> bool:
    try:
        subprocess.run([_NODE, "--version"], capture_output=True, timeout=5)
        return True
    except Exception:
        return False


def _puppeteer_installed() -> bool:
    return (_BROWSER_DIR / "node_modules" / "puppeteer").exists()


def is_browser_ready() -> bool:
    return _node_available() and _SCRAPER.exists() and _puppeteer_installed()


class BrowserAdapter:
    """Drives real browser sessions against actual AI chat UIs. No API keys needed."""

    def __init__(self, provider: str, timeout_s: int = 120):
        self.provider = provider
        self.timeout_s = timeout_s
        self.name = f"browser:{provider}"
        self.model = f"{provider}-web-ui"

    def is_configured(self) -> bool:
        return is_browser_ready()

    def session_status(self) -> dict:
        session_file = _SESSION_DIR / f"{self.provider}.json"
        if session_file.exists():
            try:
                data = json.loads(session_file.read_text())
                return {"authenticated": True, "savedAt": data.get("savedAt")}
            except Exception:
                pass
        no_auth_needed = {"chatgpt", "perplexity"}
        return {
            "authenticated": self.provider in no_auth_needed,
            "savedAt": None,
            "note": (
                "No session -- unauthenticated access will be attempted"
                if self.provider in no_auth_needed
                else "No session -- authenticate via POST /api/admin/llm-auth/start/" + self.provider
            ),
        }

    def complete(self, prompt: str, *, system: Optional[str] = None) -> BrowserResult:
        if not is_browser_ready():
            return BrowserResult(
                provider=self.name, model=self.model,
                answer_text="", latency_ms=0,
                error="Puppeteer not installed. Run: cd backend/browser && npm install && npm run install-browsers",
            )

        question = f"{system}\n\n{prompt}" if system else prompt
        t0 = time.perf_counter()

        try:
            proc = subprocess.run(
                [_NODE, str(_SCRAPER),
                 f"--provider={self.provider}",
                 f"--question={question}",
                 f"--timeout={self.timeout_s}"],
                capture_output=True, text=True,
                timeout=self.timeout_s + 30,
            )
        except subprocess.TimeoutExpired:
            latency = int((time.perf_counter() - t0) * 1000)
            return BrowserResult(provider=self.name, model=self.model,
                                 answer_text="", latency_ms=latency,
                                 error=f"Process timeout after {self.timeout_s}s")
        except Exception as e:
            latency = int((time.perf_counter() - t0) * 1000)
            return BrowserResult(provider=self.name, model=self.model,
                                 answer_text="", latency_ms=latency, error=str(e))

        latency = int((time.perf_counter() - t0) * 1000)
        if proc.stderr:
            logger.debug("browser:%s stderr: %s", self.provider, proc.stderr[:400])

        stdout = proc.stdout.strip()
        if not stdout:
            return BrowserResult(
                provider=self.name, model=self.model,
                answer_text="", latency_ms=latency,
                error=f"No output from scraper (exit={proc.returncode}). stderr: {proc.stderr[:200]}",
            )

        try:
            data = json.loads(stdout.splitlines()[-1])
        except json.JSONDecodeError:
            return BrowserResult(provider=self.name, model=self.model,
                                 answer_text="", latency_ms=latency,
                                 error=f"Invalid JSON: {stdout[:200]}")

        return BrowserResult(
            provider=self.name,
            model=self.model,
            answer_text=data.get("answer", ""),
            latency_ms=data.get("latency_ms", latency),
            citations=data.get("citations", []),
            error=data.get("error"),
        )


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def start_auth(provider: str, timeout_s: int = 300) -> dict:
    """Open a visible browser for the user to log in manually. Blocks until done."""
    if not _node_available():
        return {"ok": False, "error": "Node.js not found on PATH"}
    if not _puppeteer_installed():
        return {"ok": False, "error": "Puppeteer not installed. Run: cd backend/browser && npm install && npm run install-browsers"}

    try:
        result = subprocess.run(
            [_NODE, str(_AUTH_SERVER), f"--provider={provider}", f"--timeout={timeout_s}"],
            capture_output=True, text=True, timeout=timeout_s + 60,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Auth timed out after {timeout_s}s"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    stdout = result.stdout.strip()
    if not stdout:
        return {"ok": False, "error": f"No output. stderr: {result.stderr[:300]}"}
    try:
        return json.loads(stdout.splitlines()[-1])
    except Exception:
        return {"ok": False, "error": f"Bad JSON: {stdout[:200]}"}


def clear_auth(provider: str) -> dict:
    session_file = _SESSION_DIR / f"{provider}.json"
    if session_file.exists():
        session_file.unlink()
        return {"ok": True, "message": f"Session for {provider} cleared."}
    return {"ok": False, "message": f"No session found for {provider}."}


def all_session_status() -> dict:
    providers = ["chatgpt", "perplexity", "claude", "gemini", "grok"]
    return {p: BrowserAdapter(p).session_status() for p in providers}


def available_browser_adapters() -> list:
    if not is_browser_ready():
        return []
    no_auth_needed = {"chatgpt", "perplexity"}
    adapters = []
    for provider in ["chatgpt", "perplexity", "claude", "gemini", "grok"]:
        session_file = _SESSION_DIR / f"{provider}.json"
        if provider in no_auth_needed or session_file.exists():
            adapters.append(BrowserAdapter(provider))
    return adapters
