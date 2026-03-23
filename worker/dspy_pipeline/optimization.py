from __future__ import annotations

import inspect
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .commands import extract_commands


def _require_dspy() -> Any:
    try:
        import aiohttp  # type: ignore

        if not hasattr(aiohttp, "ConnectionTimeoutError"):
            class ConnectionTimeoutError(aiohttp.ServerTimeoutError):
                pass

            aiohttp.ConnectionTimeoutError = ConnectionTimeoutError  # type: ignore[attr-defined]

        if not hasattr(aiohttp, "SocketTimeoutError"):
            class SocketTimeoutError(aiohttp.ServerTimeoutError):
                pass

            aiohttp.SocketTimeoutError = SocketTimeoutError  # type: ignore[attr-defined]

        import dspy  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "DSPy is not installed in the worker environment. Install worker dependencies first."
        ) from exc
    return dspy


def build_dspy_examples(records: list[dict[str, Any]]) -> list[Any]:
    dspy = _require_dspy()
    examples: list[Any] = []
    for record in records:
        payload = {
            "conversation_context": record.get("assistant_text", ""),
            "goal_context": record.get("assistant_text", ""),
            "current_chat_type": record.get("chat_type", ""),
            "user_message": record["user_message"],
            "assistant_reply": record.get("assistant_text", ""),
            "commands": json.dumps(record.get("commands", [])),
            "redirect_target": record.get("redirect_target", ""),
            "target": record.get("redirect_target", ""),
            "redirect_proposal": json.dumps(record.get("redirect_proposal") or {}),
            "goal_intent": record.get("goal_intent", ""),
            "matched_goal_id": record.get("matched_goal_id", ""),
            "matched_goal_title": record.get("matched_goal_title", ""),
            "target_category": record.get("target_category", ""),
            "tool_scope": json.dumps(record.get("tool_scope") or []),
            "feedback": json.dumps(record.get("feedback") or {}),
            "assistant_metadata": json.dumps(record.get("assistant_metadata") or {}),
        }

        if hasattr(dspy, "Example"):
            example = dspy.Example(**payload)
            if hasattr(example, "with_inputs"):
                example = example.with_inputs(
                    "conversation_context",
                    "goal_context",
                    "current_chat_type",
                    "user_message",
                    "assistant_metadata",
                )
            examples.append(example)
    return examples


def configure_dspy_models(config: Any) -> Any:
    dspy = _require_dspy()
    lm_cls = getattr(dspy, "LM", None)
    if lm_cls is None:
        raise RuntimeError("Installed DSPy version does not expose LM.")

    if not config.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for live DSPy optimization.")

    lm = lm_cls(config.student_model, api_key=config.openai_api_key)
    if hasattr(dspy, "configure"):
        dspy.configure(lm=lm)
    return dspy


def redirect_metric(example: Any, prediction: Any, trace: Any = None) -> float:
    expected_redirect = getattr(example, "redirect_target", "") or ""
    predicted_redirect = (
        getattr(prediction, "target", "")
        or getattr(prediction, "redirect_target", "")
        or ""
    )
    if expected_redirect == predicted_redirect:
        return 1.0
    if not expected_redirect and not predicted_redirect:
        return 1.0
    return 0.0


def evaluate_redirect_predictions(records: list[dict[str, Any]], predictions: list[dict[str, Any]]) -> dict[str, float]:
    total = max(len(records), 1)
    exact_redirect_matches = 0
    command_presence_matches = 0
    for record, prediction in zip(records, predictions):
        predicted_redirect = prediction.get("redirect_target")
        if predicted_redirect == record.get("redirect_target"):
            exact_redirect_matches += 1

        expected_has_commands = bool(record.get("commands"))
        predicted_has_commands = bool(extract_commands(prediction.get("assistant_reply", "")))
        if expected_has_commands == predicted_has_commands:
            command_presence_matches += 1

    return {
        "redirect_exact_match": exact_redirect_matches / total,
        "command_presence_match": command_presence_matches / total,
    }


def optimize_with_gepa(
    program: Any,
    trainset: list[Any],
    devset: list[Any],
    metric: Any,
    *,
    max_rounds: int,
    teacher_model: str,
    judge_model: str,
) -> Any:
    dspy = _require_dspy()
    teleprompt_module = getattr(dspy, "teleprompt", dspy)
    gepa_cls = getattr(teleprompt_module, "GEPA", None)
    if gepa_cls is None:
        raise RuntimeError("Installed DSPy version does not expose GEPA.")

    optimizer = gepa_cls(
        metric=metric,
        max_rounds=max_rounds,
        teacher_model=teacher_model,
        judge_model=judge_model,
    )

    compile_signature = inspect.signature(optimizer.compile)
    compile_kwargs: dict[str, Any] = {}
    for candidate_name, value in (
        ("student", program),
        ("program", program),
        ("trainset", trainset),
        ("devset", devset),
        ("valset", devset),
    ):
        if candidate_name in compile_signature.parameters:
            compile_kwargs[candidate_name] = value

    return optimizer.compile(**compile_kwargs)


def save_prompt_bundle(
    output_dir: Path,
    bundle_name: str,
    *,
    prompts: dict[str, Any],
    metrics: dict[str, Any],
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = output_dir / f"{timestamp}-{bundle_name}.json"
    payload = {
        "bundleName": bundle_name,
        "createdAt": timestamp,
        "prompts": prompts,
        "metrics": metrics,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return path


def start_mlflow_run(tracking_uri: str, run_name: str) -> None:
    import mlflow

    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment("neon-goals-dspy")
    mlflow.start_run(run_name=run_name)
