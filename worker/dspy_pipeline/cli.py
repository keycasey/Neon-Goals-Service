from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .config import DSPyConfig
from .dataset import build_examples_from_rows, deterministic_split, read_jsonl, write_jsonl
from .db import fetch_chat_rows
from .optimization import (
    build_dspy_examples,
    configure_dspy_models,
    optimize_with_gepa,
    redirect_metric,
    save_prompt_bundle,
)


def _load_seed_examples(seed_path: Path) -> list[dict[str, Any]]:
    return read_jsonl(seed_path)


def cmd_extract(args: argparse.Namespace) -> int:
    config = DSPyConfig.from_env()
    config.ensure_dirs()

    rows = fetch_chat_rows(config.database_url)
    examples = build_examples_from_rows(rows)
    train, dev = deterministic_split(examples, config.train_ratio)

    seed_examples = _load_seed_examples(Path(args.redirect_seed_path))
    redirect_train = [example.to_dict() for example in train if example.redirect_target]
    redirect_train.extend(seed_examples)

    write_jsonl(config.artifact_dir / "train.jsonl", train)
    write_jsonl(config.artifact_dir / "dev.jsonl", dev)
    write_jsonl(config.artifact_dir / "redirect_train.jsonl", redirect_train)

    summary = {
        "train_examples": len(train),
        "dev_examples": len(dev),
        "redirect_examples": len(redirect_train),
    }
    (config.artifact_dir / "dataset_summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def cmd_bundle_stub(args: argparse.Namespace) -> int:
    config = DSPyConfig.from_env()
    config.ensure_dirs()
    prompts = {
        "overview": {"source": "dspy", "signature": "OverviewSignature"},
        "items": {"source": "dspy", "signature": "ItemsSignature"},
        "finances": {"source": "dspy", "signature": "FinancesSignature"},
        "actions": {"source": "dspy", "signature": "ActionsSignature"},
        "goalView": {"source": "dspy", "signature": "GoalViewSignature"},
        "proposal": {"source": "dspy", "signature": "ProposalSignature"},
        "redirectJudge": {"source": "dspy", "signature": "RedirectJudgeSignature"},
    }
    metrics = {"status": "stub", "note": args.note}
    path = save_prompt_bundle(config.prompt_bundle_dir, args.bundle_name, prompts=prompts, metrics=metrics)
    print(str(path))
    return 0


def cmd_baseline(args: argparse.Namespace) -> int:
    config = DSPyConfig.from_env()
    config.ensure_dirs()
    records = read_jsonl(config.artifact_dir / "dev.jsonl")

    chat_type_counts: dict[str, int] = {}
    redirect_count = 0
    command_count = 0
    for record in records:
        chat_type = record.get("chat_type", "unknown")
        chat_type_counts[chat_type] = chat_type_counts.get(chat_type, 0) + 1
        if record.get("redirect_target"):
            redirect_count += 1
        if record.get("commands"):
            command_count += 1

    metrics = {
        "dev_examples": len(records),
        "redirect_examples": redirect_count,
        "command_examples": command_count,
        "chat_type_counts": chat_type_counts,
    }

    output_path = config.artifact_dir / "baseline_metrics.json"
    output_path.write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(metrics, indent=2, sort_keys=True))
    return 0


def cmd_optimize(args: argparse.Namespace) -> int:
    config = DSPyConfig.from_env()
    config.ensure_dirs()
    train_records = read_jsonl(config.artifact_dir / "redirect_train.jsonl")
    dev_records = read_jsonl(config.artifact_dir / "dev.jsonl")

    metrics: dict[str, Any] = {
        "train_examples": len(train_records),
        "dev_examples": len(dev_records),
        "mode": "dry-run" if args.dry_run else "live",
    }

    prompts: dict[str, Any] = {
        "overview": {
            "signature": "OverviewSignature",
            "responseMetadataFields": [
                "redirect_proposal",
                "goal_intent",
                "matched_goal_id",
                "matched_goal_title",
                "target_category",
                "tool_scope",
            ],
        },
        "specialists": {
            "items": {
                "signature": "ItemsSignature",
                "responseMetadataFields": [
                    "redirect_proposal",
                    "goal_intent",
                    "matched_goal_id",
                    "matched_goal_title",
                    "target_category",
                    "tool_scope",
                ],
            },
            "finances": {
                "signature": "FinancesSignature",
                "responseMetadataFields": [
                    "redirect_proposal",
                    "goal_intent",
                    "matched_goal_id",
                    "matched_goal_title",
                    "target_category",
                    "tool_scope",
                ],
            },
            "actions": {
                "signature": "ActionsSignature",
                "responseMetadataFields": [
                    "redirect_proposal",
                    "goal_intent",
                    "matched_goal_id",
                    "matched_goal_title",
                    "target_category",
                    "tool_scope",
                ],
            },
        },
        "goalView": {
            "signature": "GoalViewSignature",
            "responseMetadataFields": [
                "redirect_proposal",
                "goal_intent",
                "matched_goal_id",
                "matched_goal_title",
                "target_category",
                "tool_scope",
            ],
        },
        "proposal": {"signature": "ProposalSignature"},
        "redirectJudge": {"signature": "RedirectJudgeSignature"},
    }

    if not args.dry_run:
        try:
            dspy = configure_dspy_models(config)
            from .signatures import build_programs, build_signatures

            signatures = build_signatures(dspy)
            programs = build_programs(dspy, signatures)
            redirect_trainset = build_dspy_examples(train_records)
            redirect_devset = build_dspy_examples(dev_records)
            optimized_program = optimize_with_gepa(
                programs["redirect_judge"],
                redirect_trainset,
                redirect_devset,
                redirect_metric,
                max_rounds=config.max_gepa_rounds,
                teacher_model=config.teacher_model,
                judge_model=config.judge_model,
            )
            metrics["optimizationStatus"] = "compiled"
            metrics["optimizedProgramType"] = type(optimized_program).__name__
        except Exception as exc:
            metrics["optimizationStatus"] = "blocked"
            metrics["error"] = str(exc)
    else:
        metrics["optimizationStatus"] = "dry-run"

    bundle_path = save_prompt_bundle(
        config.prompt_bundle_dir,
        args.bundle_name,
        prompts=prompts,
        metrics=metrics,
    )
    print(str(bundle_path))
    print(json.dumps(metrics, indent=2, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DSPy tooling for Neon Goals")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser("extract", help="Extract chat-history datasets")
    extract_parser.add_argument(
        "--redirect-seed-path",
        default=str(Path(__file__).resolve().parent.parent / "data" / "dspy" / "redirect_seed_examples.jsonl"),
    )
    extract_parser.set_defaults(func=cmd_extract)

    bundle_parser = subparsers.add_parser("bundle-stub", help="Write a versioned prompt bundle stub")
    bundle_parser.add_argument("--bundle-name", default="initial-dspy-bundle")
    bundle_parser.add_argument("--note", default="Generated without running DSPy optimization.")
    bundle_parser.set_defaults(func=cmd_bundle_stub)

    baseline_parser = subparsers.add_parser("baseline", help="Write baseline dataset metrics")
    baseline_parser.set_defaults(func=cmd_baseline)

    optimize_parser = subparsers.add_parser("optimize", help="Dry-run or execute DSPy GEPA optimization")
    optimize_parser.add_argument("--bundle-name", default="gepa-optimized")
    optimize_parser.add_argument("--dry-run", action="store_true")
    optimize_parser.set_defaults(func=cmd_optimize)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
