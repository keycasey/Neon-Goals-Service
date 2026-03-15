# Neon Goals Prompt Workspace

This folder is the offline prompt workspace for Neon Goals.

It exists to support two separate concerns:

- define the prompt surface in a DSPy-shaped way
- generate a Nest-consumable prompt bundle JSON artifact

The Nest app remains the runtime. It reads the generated bundle and falls back to handwritten TypeScript prompts only if no bundle is available.

## Layout

- `pyproject.toml`: `uv` project metadata and Python dependencies
- `neon_prompts/specs.py`: structured prompt specifications and output contracts
- `neon_prompts/signatures.py`: DSPy-style signature definitions for each prompt surface
- `neon_prompts/generator.py`: bundle generator for Nest
- `neon_prompts/cli.py`: CLI entrypoint
- `generated/nest-prompts.json`: generated artifact consumed by Nest

## Commands

From repo root:

```bash
bun run prompts:generate
```

From this directory:

```bash
uv run python -m neon_prompts.cli generate
```

## Bundle Loading

By default, Nest will look for:

`prompts/generated/nest-prompts.json`

You can override that with:

`DSPY_PROMPT_BUNDLE_PATH=/abs/path/to/bundle.json`

## Notes

- The generator is intentionally deterministic.
- The first phase uses DSPy-style prompt specs and runtime artifacts, not live DSPy inference in Nest.
- Later optimization phases can update the generated bundle contents without requiring a TypeScript refactor.
