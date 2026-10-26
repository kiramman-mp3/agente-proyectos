"""Cliente de modelos de IA (OpenRouter o Gemini, ambos con API compatible con OpenAI) que devuelve JSON."""
import json
import logging
import re
import time

import httpx

from .config import settings
from .security import get_secret

# proveedor -> (endpoint de chat completions, nombre de la credencial cifrada)
PROVIDERS = {
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "openrouter_api_key"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini_api_key"),
}


log = logging.getLogger("agente.llm")


class LLMError(RuntimeError):
    pass


def _extract_json(text: str):
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = min((i for i in (text.find("{"), text.find("[")) if i != -1), default=-1)
    end = max(text.rfind("}"), text.rfind("]"))
    if start != -1 and end > start:
        return json.loads(text[start:end + 1])
    raise json.JSONDecodeError("No se encontró JSON", text, 0)


RETRY_STATUSES = {429, 500, 502, 503, 504}
RETRY_DELAYS = (5, 20, 60)  # segundos
FAST_RETRY_DELAYS = (3,)    # cuando hay proveedor de respaldo


def _post_with_retry(provider: str, url: str, headers: dict, body: dict, delays: tuple = RETRY_DELAYS) -> httpx.Response:
    """Reintenta ante límites de cuota (429) o saturación temporal del proveedor (5xx)."""
    for delay in (*delays, None):
        try:
            r = httpx.post(url, headers=headers, json=body, timeout=180)
        except httpx.HTTPError as e:
            if delay is None:
                raise LLMError(f"Error de red con {provider}: {e}") from e
        else:
            if r.status_code not in RETRY_STATUSES or delay is None:
                return r
        time.sleep(delay)
    raise AssertionError("inalcanzable")


def _provider_request(provider: str, max_tokens: int) -> tuple[str, dict, dict, int]:
    """Endpoint, cabeceras, parámetros extra y tope de tokens del proveedor indicado."""
    if provider not in PROVIDERS:
        raise LLMError(f"Proveedor de IA '{provider}' no válido; opciones: {', '.join(PROVIDERS)}")
    url, secret_name = PROVIDERS[provider]
    headers = {"Authorization": f"Bearer {get_secret(secret_name)}"}
    extra = {}
    if provider == "openrouter":
        headers.update({"HTTP-Referer": "https://github.com/agente-seguimiento-proyectos",
                        "X-Title": "Agente Seguimiento Proyectos UTA"})
    else:
        # En Gemini el razonamiento interno consume tokens de salida: se limita y se deja margen.
        extra = {"reasoning_effort": "low"}
        max_tokens += 2048
    return url, headers, extra, max_tokens


def _completion(provider: str, body: dict, headers: dict, url: str, delays: tuple) -> str:
    r = _post_with_retry(provider, url, headers, body, delays)
    if r.status_code != 200:
        raise LLMError(f"{provider} respondió {r.status_code}: {r.text[:300]}")
    data = r.json()
    if "choices" not in data:
        raise LLMError(f"Respuesta inesperada de {provider}: {str(data)[:300]}")
    return data["choices"][0]["message"].get("content") or ""


def _text_with(provider: str, model: str, system: str, history: list[dict], temperature: float, max_tokens: int,
               delays: tuple) -> str:
    url, headers, extra, max_tokens = _provider_request(provider, max_tokens)
    body = {"model": model, "messages": [{"role": "system", "content": system}, *history],
            "temperature": temperature, "max_tokens": max_tokens, **extra}
    content = _completion(provider, body, headers, url, delays).strip()
    if not content:
        raise LLMError(f"{provider} devolvió una respuesta vacía")
    return content


def _json_with(provider: str, model: str, system: str, user: str, temperature: float, max_tokens: int, delays: tuple):
    url, headers, extra, max_tokens = _provider_request(provider, max_tokens)
    messages = [
        {"role": "system", "content": system + "\n\nResponde ÚNICAMENTE con JSON válido, sin texto adicional."},
        {"role": "user", "content": user},
    ]
    last_error = None
    for _ in range(2):
        body = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens, **extra}
        content = _completion(provider, body, headers, url, delays)
        try:
            return _extract_json(content)
        except json.JSONDecodeError as e:
            last_error = e
            messages += [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "Tu respuesta no era JSON válido. Devuelve solo el JSON solicitado."},
            ]
    raise LLMError(f"El modelo {model} no devolvió JSON válido: {last_error}")


def _with_fallback(model: str, call):
    """Ejecuta `call(provider, model, delays)` con el proveedor principal y, si falla, con el de respaldo."""
    primary, backup = settings.llm_provider, settings.llm_fallback_provider
    if not backup or backup == primary:
        return call(primary, model, RETRY_DELAYS)
    try:
        # Con respaldo disponible no vale la pena esperar minutos de reintentos en el principal.
        return call(primary, model, FAST_RETRY_DELAYS)
    except (LLMError, RuntimeError) as e:  # RuntimeError: falta la credencial del proveedor
        log.warning("Proveedor de IA '%s' falló (%s); se usa el respaldo '%s'", primary, e, backup)
        backup_model = settings.fallback_model(model)
        if not backup_model:
            raise LLMError(f"{e} (y no hay modelo de respaldo configurado para '{backup}')") from e
        try:
            return call(backup, backup_model, RETRY_DELAYS)
        except (LLMError, RuntimeError) as e2:
            raise LLMError(f"Fallaron '{primary}' ({e}) y el respaldo '{backup}' ({e2})") from e2


def chat_text(model: str, system: str, history: list[dict], temperature: float = 0.3, max_tokens: int = 900) -> str:
    """Conversación en texto libre: `history` son mensajes {role: user|assistant, content}."""
    return _with_fallback(model, lambda prov, m, delays: _text_with(prov, m, system, history, temperature, max_tokens, delays))


def chat_json(model: str, system: str, user: str, temperature: float = 0.2, max_tokens: int = 4000):
    """Envía un prompt y devuelve el JSON parseado. Reintenta una vez si la respuesta no es JSON válido."""
    return _with_fallback(model, lambda prov, m, delays: _json_with(prov, m, system, user, temperature, max_tokens, delays))
