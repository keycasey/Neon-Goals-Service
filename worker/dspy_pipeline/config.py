from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class DSPyConfig:
    database_url: str
    openai_api_key: str
    mlflow_tracking_uri: str
    artifact_dir: Path
    prompt_bundle_dir: Path
    train_ratio: float = 0.8
    max_gepa_rounds: int = 5
    student_model: str = "openai/gpt-4o-mini"
    judge_model: str = "openai/gpt-4.1"
    teacher_model: str = "openai/gpt-4o"

    @classmethod
    def from_env(cls) -> "DSPyConfig":
        worker_dir = Path(__file__).resolve().parent.parent
        artifact_dir = Path(
            os.getenv("DSPY_ARTIFACT_DIR", str(worker_dir / "data" / "dspy"))
        ).resolve()
        prompt_bundle_dir = Path(
            os.getenv("DSPY_PROMPT_BUNDLE_DIR", str(artifact_dir / "prompt_bundles"))
        ).resolve()
        return cls(
            database_url=os.getenv("DATABASE_URL", ""),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            mlflow_tracking_uri=os.getenv(
                "MLFLOW_TRACKING_URI",
                str((artifact_dir / "mlruns").resolve()),
            ),
            artifact_dir=artifact_dir,
            prompt_bundle_dir=prompt_bundle_dir,
            train_ratio=float(os.getenv("DSPY_TRAIN_RATIO", "0.8")),
            max_gepa_rounds=int(os.getenv("DSPY_GEPA_MAX_ROUNDS", "5")),
            student_model=os.getenv("DSPY_STUDENT_MODEL", "openai/gpt-4o-mini"),
            judge_model=os.getenv("DSPY_JUDGE_MODEL", "openai/gpt-4.1"),
            teacher_model=os.getenv("DSPY_TEACHER_MODEL", "openai/gpt-4o"),
        )

    def ensure_dirs(self) -> None:
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self.prompt_bundle_dir.mkdir(parents=True, exist_ok=True)

