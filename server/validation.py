"""Execute the exact shared JavaScript domain rules without evaluating user code."""

import json
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent.parent


class DomainError(ValueError):
    pass


def run_rules(payload):
    try:
        process = subprocess.run(
            [os.environ.get("NODE_BINARY", "node"), str(ROOT / "server/domain-worker.mjs")],
            input=json.dumps(payload, ensure_ascii=False, allow_nan=False),
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=12,
            check=False,
        )
        result = json.loads(process.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise RuntimeError("Проверка серверных правил недоступна") from exc
    if process.returncode or not result.get("ok"):
        raise DomainError(str(result.get("error", "Некорректные данные"))[:1000])
    return result


def validate_state(state, previous=None, *, transition=False):
    payload = {"action": "transition" if transition else "validate", "state": state}
    if transition:
        payload["previous"] = previous
    return run_rules(payload).get("state", state)


def evaluate_state(state, device_input, price_id=None):
    return run_rules({"action": "evaluate", "state": state, "input": device_input, "priceId": price_id}).get("result")
