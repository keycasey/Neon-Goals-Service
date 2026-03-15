from __future__ import annotations

import argparse
from pathlib import Path

from .generator import write_bundle


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Nest prompt bundles for Neon Goals.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate the Nest prompt bundle.")
    generate_parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "generated" / "nest-prompts.json"),
        help="Output bundle path.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "generate":
        output_path = write_bundle(Path(args.output).resolve())
        print(output_path)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
