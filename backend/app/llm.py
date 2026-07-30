"""LLM provider adapters.

Each adapter checks for its API key and exposes:
  name, model, is_configured() -> bool, complete(prompt, *, system=None) -> ProviderResult

ProviderResult carries answer text, latency_ms, citations, and error.
Adapters never raise — failures are stored as error rows.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import List, Optional, Protocol


@dataclass
class ProviderResult:
    provider: str
    model: str
    answer_text: str
    latency_ms: int
    citations: List[str] = field(default_factory=list)
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.answer_text)


class ProviderAdapter(Protocol):
    name: str
    model: str

    def is_configured(self) -> bool: ...
    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult: ...


# ----- shared helpers -----

def _missing_key(provider: str, var: str) -> ProviderResult:
    return ProviderResult(
        provider=provider,
        model="-",
        answer_text="",
        latency_ms=0,
        error=f"missing env var {var}",
    )


def _time_call(fn):
    """Wrap a backend call: returns (latency_ms, value-or-raise)."""
    t0 = time.perf_counter()
    try:
        v = fn()
        return int((time.perf_counter() - t0) * 1000), v, None
    except Exception as e:
        return int((time.perf_counter() - t0) * 1000), None, str(e)


# ----- Gemini (direct google-genai, not the ADK Runner) -----

class GeminiAdapter:
    name = "gemini"
    model = "gemini-2.5-flash"

    def is_configured(self) -> bool:
        return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))

    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult:
        if not self.is_configured():
            return _missing_key(self.name, "GEMINI_API_KEY")
        try:
            from google import genai
            key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
            client = genai.Client(api_key=key)
            full_prompt = f"{system}\n\n{prompt}" if system else prompt
            latency, response, err = _time_call(
                lambda: client.models.generate_content(
                    model=self.model, contents=full_prompt,
                )
            )
            if err is not None:
                return ProviderResult(self.name, self.model, "", latency, error=err)
            text = (getattr(response, "text", None) or "").strip()
            return ProviderResult(self.name, self.model, text, latency)
        except Exception as e:
            return ProviderResult(self.name, self.model, "", 0, error=f"setup: {e}")


# ----- OpenAI -----

class OpenAIAdapter:
    name = "openai"
    model = "gpt-4o-mini"

    def is_configured(self) -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult:
        if not self.is_configured():
            return _missing_key(self.name, "OPENAI_API_KEY")
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=30)
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            def _call():
                return client.chat.completions.create(model=self.model,
                                                       messages=messages)
            latency, resp, err = _time_call(_call)
            if err is not None:
                return ProviderResult(self.name, self.model, "", latency, error=err)
            choice = resp.choices[0]
            text = (choice.message.content or "").strip()
            return ProviderResult(self.name, self.model, text, latency)
        except Exception as e:
            return ProviderResult(self.name, self.model, "", 0, error=f"setup: {e}")


# ----- Anthropic Claude -----

class ClaudeAdapter:
    name = "claude"
    model = "claude-3-5-sonnet-latest"

    def is_configured(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult:
        if not self.is_configured():
            return _missing_key(self.name, "ANTHROPIC_API_KEY")
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"],
                                          timeout=30)
            kwargs = dict(model=self.model, max_tokens=1024,
                          messages=[{"role": "user", "content": prompt}])
            if system:
                kwargs["system"] = system

            def _call():
                return client.messages.create(**kwargs)
            latency, resp, err = _time_call(_call)
            if err is not None:
                return ProviderResult(self.name, self.model, "", latency, error=err)
            # Anthropic returns a list of content blocks
            parts = []
            for blk in (resp.content or []):
                if getattr(blk, "type", None) == "text":
                    parts.append(getattr(blk, "text", ""))
            text = "\n".join(parts).strip()
            return ProviderResult(self.name, self.model, text, latency)
        except Exception as e:
            return ProviderResult(self.name, self.model, "", 0, error=f"setup: {e}")


# ----- Perplexity (HTTP, OpenAI-shaped) -----

class PerplexityAdapter:
    name = "perplexity"
    model = "sonar"
    ENDPOINT = "https://api.perplexity.ai/chat/completions"

    def is_configured(self) -> bool:
        return bool(os.environ.get("PERPLEXITY_API_KEY"))

    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult:
        if not self.is_configured():
            return _missing_key(self.name, "PERPLEXITY_API_KEY")
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {os.environ['PERPLEXITY_API_KEY']}",
                "Content-Type": "application/json",
            }
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            payload = {"model": self.model, "messages": messages}

            def _call():
                return httpx.post(self.ENDPOINT, json=payload, headers=headers,
                                  timeout=30.0)
            latency, resp, err = _time_call(_call)
            if err is not None:
                return ProviderResult(self.name, self.model, "", latency, error=err)
            if resp.status_code >= 400:
                return ProviderResult(self.name, self.model, "", latency,
                                      error=f"http {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            choice = (data.get("choices") or [{}])[0]
            text = ((choice.get("message") or {}).get("content") or "").strip()
            citations = list(data.get("citations") or [])
            return ProviderResult(self.name, self.model, text, latency,
                                  citations=citations)
        except Exception as e:
            return ProviderResult(self.name, self.model, "", 0, error=f"setup: {e}")


# ----- DeepSeek (OpenAI-compatible, reuses openai SDK with a custom base_url) -----

class DeepSeekAdapter:
    name = "deepseek"
    model = "deepseek-chat"
    BASE_URL = "https://api.deepseek.com"

    def is_configured(self) -> bool:
        return bool(os.environ.get("DEEPSEEK_API_KEY"))

    def complete(self, prompt: str, *, system: Optional[str] = None) -> ProviderResult:
        if not self.is_configured():
            return _missing_key(self.name, "DEEPSEEK_API_KEY")
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.environ["DEEPSEEK_API_KEY"],
                            base_url=self.BASE_URL, timeout=30)
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            def _call():
                return client.chat.completions.create(model=self.model,
                                                       messages=messages)
            latency, resp, err = _time_call(_call)
            if err is not None:
                return ProviderResult(self.name, self.model, "", latency, error=err)
            choice = resp.choices[0]
            text = (choice.message.content or "").strip()
            return ProviderResult(self.name, self.model, text, latency)
        except Exception as e:
            return ProviderResult(self.name, self.model, "", 0, error=f"setup: {e}")


# ----- registry -----

ADAPTERS = [GeminiAdapter(), OpenAIAdapter(), ClaudeAdapter(),
            PerplexityAdapter(), DeepSeekAdapter()]


def available_adapters() -> List:
    """Return all configured API-key adapters. Empty list if no keys are set."""
    return [a for a in ADAPTERS if a.is_configured()]


def available_adapters_all() -> List:
    """Return all usable adapters: API-key adapters first, browser adapters as fallback.
    Returns empty list if neither is available."""
    api = available_adapters()
    if api:
        return api
    try:
        from backend.app.browser_adapter import available_browser_adapters
        browser = available_browser_adapters()
        if browser:
            return browser
    except Exception:
        pass
    return []


def key_status() -> dict:
    """Publisher map: env_var -> bool, and browser adapter status."""
    try:
        from backend.app.browser_adapter import all_session_status, is_browser_ready
        browser_ready = is_browser_ready()
        browser_sessions = all_session_status()
    except Exception:
        browser_ready = False
        browser_sessions = {}
    return {
        "GEMINI_API_KEY":     bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")),
        "OPENAI_API_KEY":     bool(os.environ.get("OPENAI_API_KEY")),
        "ANTHROPIC_API_KEY":  bool(os.environ.get("ANTHROPIC_API_KEY")),
        "PERPLEXITY_API_KEY": bool(os.environ.get("PERPLEXITY_API_KEY")),
        "DEEPSEEK_API_KEY":   bool(os.environ.get("DEEPSEEK_API_KEY")),
        "browser_puppeteer_ready": browser_ready,
        "browser_sessions": browser_sessions,
    }
