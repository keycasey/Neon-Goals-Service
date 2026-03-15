from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .specs import PROMPT_SPECS, PromptSpec, serialize_specs
from .signatures import serialize_signature_specs


def _load_model_registry() -> dict[str, Any]:
    registry_path = Path(__file__).resolve().parent.parent / "generated" / "ai-models.json"
    if not registry_path.exists():
        return {
            "defaultModelId": "gpt-5-nano",
            "models": [
                {
                    "id": "gpt-5-nano",
                    "label": "GPT-5 Nano",
                    "provider": "openai",
                    "apiModel": "gpt-5-nano",
                    "enabled": True,
                    "supportsStreaming": True,
                }
            ],
        }

    return json.loads(registry_path.read_text(encoding="utf-8"))


def _render_section(title: str, lines: tuple[str, ...]) -> list[str]:
    if not lines:
        return []
    section = [f"## {title}", ""]
    section.extend(f"- {line}" for line in lines)
    section.append("")
    return section


def _render_output_contract(spec: PromptSpec) -> list[str]:
    if not spec.output_contract:
        return []
    section = ["## Output Contract", ""]
    for field in spec.output_contract:
        section.append(f"- `{field.name}`: {field.description}")
    section.append("")
    return section


def render_prompt(spec: PromptSpec) -> str:
    lines = [
        f"You are the {spec.role}.",
        "",
        spec.objective,
        "",
    ]
    lines.extend(_render_section("Principles", spec.principles))
    lines.extend(_render_section("Workflow", spec.workflow))
    lines.extend(_render_output_contract(spec))
    if spec.commands:
        lines.append("## Command Surface")
        lines.append("")
        lines.extend(f"- {command}" for command in spec.commands)
        lines.append("")
    lines.extend(_render_section("Rules", spec.rules))
    if spec.placeholders:
        lines.append("## Runtime Placeholders")
        lines.append("")
        lines.extend(f"- `{{{{{placeholder}}}}}`" for placeholder in spec.placeholders)
        lines.append("")
    return "\n".join(lines).strip()


def build_bundle() -> dict[str, Any]:
    expert = PROMPT_SPECS["expert"]
    overview = PROMPT_SPECS["overview"]
    specialists = PROMPT_SPECS["specialists"]
    goal_view = PROMPT_SPECS["goalView"]
    registry = _load_model_registry()

    prompt_surface = {
        "expert": {
            "prompt": render_prompt(expert),
        },
        "overview": {
            "prompt": render_prompt(overview),
        },
        "specialists": {
            key: {"prompt": render_prompt(spec)}
            for key, spec in specialists.variants.items()
        },
        "goalView": {
            key: {"prompt": render_prompt(spec)}
            for key, spec in goal_view.variants.items()
        },
    }

    return {
        "bundleName": "dspy-prompt-surface-v1",
        "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "defaultModelId": registry.get("defaultModelId", "gpt-5-nano"),
        "generator": {
            "source": "prompts/neon_prompts",
            "formatVersion": 1,
        },
        "availableModels": registry.get("models", []),
        "specs": serialize_specs(),
        "signatures": serialize_signature_specs(),
        "prompts": prompt_surface,
        "models": {
            model["id"]: {
                "meta": model,
                "prompts": prompt_surface,
            }
            for model in registry.get("models", [])
            if model.get("enabled", True)
        },
    }


def write_bundle(output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bundle = build_bundle()
    output_path.write_text(json.dumps(bundle, indent=2, sort_keys=True), encoding="utf-8")
    return output_path
