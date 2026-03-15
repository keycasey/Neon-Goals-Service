# DSPy Pipeline

This worker-side package provides the offline DSPy/GEPA workflow for Neon Goals:

- extract visible chat history from Postgres
- convert it into train/dev JSONL datasets
- seed redirect training examples
- define DSPy signatures for overview, specialists, goal view, proposals, and redirect judging
- save versioned prompt bundle artifacts for later runtime loading

## Commands

```bash
cd worker
python -m dspy_pipeline.cli extract
python -m dspy_pipeline.cli baseline
python -m dspy_pipeline.cli optimize --dry-run
python -m dspy_pipeline.cli bundle-stub --bundle-name baseline
```

## Environment

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `MLFLOW_TRACKING_URI` (optional)
- `DSPY_ARTIFACT_DIR` (optional)
- `DSPY_PROMPT_BUNDLE_DIR` (optional)
- `DSPY_STUDENT_MODEL` (optional)
- `DSPY_JUDGE_MODEL` (optional)
- `DSPY_TEACHER_MODEL` (optional)
