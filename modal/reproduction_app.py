from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import modal
import requests
from fastapi import Header, HTTPException


APP_NAME = os.getenv("REPRODUCTION_MODAL_APP_NAME", "scholarflow-reproduction")
RUNNER_SECRET_NAME = os.getenv(
    "REPRODUCTION_MODAL_SECRET_NAME", "scholarflow-reproduction-secrets"
)
RUNNER_SECRET = os.getenv("REPRODUCTION_MODAL_SHARED_SECRET", "")
CALLBACK_ATTEMPTS = max(1, int(os.getenv("REPRODUCTION_CALLBACK_ATTEMPTS", "5")))
CALLBACK_TIMEOUT_SECONDS = max(
    1, int(os.getenv("REPRODUCTION_CALLBACK_TIMEOUT_SECONDS", "30"))
)
CALLBACK_RETRY_DELAY_SECONDS = max(
    0.25, float(os.getenv("REPRODUCTION_CALLBACK_RETRY_DELAY_SECONDS", "1.5"))
)
LOG_BATCH_SIZE = max(1, int(os.getenv("REPRODUCTION_LOG_BATCH_SIZE", "12")))
LOG_BATCH_INTERVAL_SECONDS = max(
    0.25, float(os.getenv("REPRODUCTION_LOG_BATCH_INTERVAL_SECONDS", "1.0"))
)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("fastapi>=0.115.0", "requests>=2.32.0")
)
app = modal.App(
    APP_NAME,
    secrets=[modal.Secret.from_name(RUNNER_SECRET_NAME)],
)


def _require_secret(provided_secret: str | None) -> None:
    if not RUNNER_SECRET or provided_secret != RUNNER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _post_callback(
    callback: dict[str, Any],
    payload: dict[str, Any],
    *,
    tolerate_failure: bool = False,
    attempts: int = CALLBACK_ATTEMPTS,
) -> bool:
    last_error: Exception | None = None

    for attempt in range(1, max(1, attempts) + 1):
        try:
            response = requests.post(
                callback["url"],
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-scholarflow-callback-secret": callback["secret"],
                },
                timeout=CALLBACK_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return True
        except requests.RequestException as exc:
            last_error = exc
            print(
                "Callback delivery failed"
                f" (attempt {attempt}/{max(1, attempts)}) for payload type"
                f" {payload.get('type')}: {exc}",
                flush=True,
            )
            if attempt < max(1, attempts):
                time.sleep(CALLBACK_RETRY_DELAY_SECONDS * attempt)

    if tolerate_failure:
        print(
            "Dropping non-critical callback after repeated delivery failures for"
            f" payload type {payload.get('type')}: {last_error}",
            flush=True,
        )
        return False

    assert last_error is not None
    raise last_error


def _flush_log_buffer(
    callback: dict[str, Any],
    runner_job_id: str,
    phase: str,
    current_command: str,
    buffer: list[str],
) -> None:
    if not buffer:
        return

    _post_callback(
        callback,
        {
            "type": "log_chunk",
            "runnerBackend": "modal",
            "runnerJobId": runner_job_id,
            "phase": phase,
            "kind": "runner_output",
            "message": "\n".join(buffer)[:4000],
            "currentCommand": current_command,
        },
        tolerate_failure=True,
    )
    buffer.clear()


def _materialize_bundle(bundle: dict[str, Any], workdir: Path) -> Path:
    bundle_dir = workdir / "bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)

    for file_spec in bundle.get("files", []):
        relative_path = Path(file_spec["path"])
        target_path = bundle_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(file_spec["content"])

    return bundle_dir


def _emit_artifact_matches(
    workspace_dir: Path,
    output_contracts: list[dict[str, Any]],
    callback: dict[str, Any],
    runner_job_id: str,
) -> None:
    seen_paths: set[str] = set()

    for contract in output_contracts:
        path_hint = contract.get("pathHint") or ""
        for pattern in [part.strip() for part in path_hint.split("|") if part.strip()]:
            for match in workspace_dir.rglob(pattern):
                if not match.is_file():
                    continue

                relative = str(match.relative_to(workspace_dir))
                if relative in seen_paths:
                    continue
                seen_paths.add(relative)

                preview = None
                try:
                    if match.suffix.lower() in {".txt", ".json", ".csv", ".md", ".log"}:
                        preview = match.read_text(errors="ignore")[:4000]
                except Exception:
                    preview = None

                _post_callback(
                    callback,
                    {
                        "type": "artifact_ready",
                        "runnerBackend": "modal",
                        "runnerJobId": runner_job_id,
                        "artifactType": contract.get("type", "artifact"),
                        "uri": f"modal://{runner_job_id}/{relative}",
                        "metadata": json.dumps(
                            {
                                "relativePath": relative,
                                "description": contract.get("description"),
                                "preview": preview,
                            }
                        ),
                    },
                    tolerate_failure=True,
                )


def _emit_metrics_from_line(
    line: str, metric_rules: list[dict[str, Any]], callback: dict[str, Any], runner_job_id: str
) -> None:
    for rule in metric_rules:
        regex = rule.get("regex")
        if not regex:
            continue

        try:
            match = re.search(regex, line, flags=re.IGNORECASE)
        except re.error:
            continue

        if not match:
            continue

        try:
            value = float(match.group(1))
        except (IndexError, ValueError):
            continue

        _post_callback(
            callback,
            {
                "type": "metric_update",
                "runnerBackend": "modal",
                "runnerJobId": runner_job_id,
                "metricName": rule.get("metricName", "metric"),
                "value": value,
                "source": line[:500],
            },
            tolerate_failure=True,
        )


def _run_process(
    cwd: Path,
    argv: list[str],
    *,
    phase: str,
    timeout_seconds: int,
    callback: dict[str, Any],
    runner_job_id: str,
    metric_rules: list[dict[str, Any]],
) -> list[str]:
    cwd.mkdir(parents=True, exist_ok=True)
    current_command = " ".join(argv)

    _post_callback(
        callback,
        {
            "type": "heartbeat",
            "runnerBackend": "modal",
            "runnerJobId": runner_job_id,
            "currentCommand": current_command,
        },
        tolerate_failure=True,
    )

    process = subprocess.Popen(
        argv,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    recent_lines: list[str] = []
    callback_buffer: list[str] = []
    last_flush_at = time.monotonic()
    assert process.stdout is not None
    for raw_line in process.stdout:
        line = raw_line.rstrip()
        if not line:
            continue

        recent_lines.append(line)
        recent_lines = recent_lines[-80:]
        callback_buffer.append(line[:800])
        now = time.monotonic()
        if (
            len(callback_buffer) >= LOG_BATCH_SIZE
            or now - last_flush_at >= LOG_BATCH_INTERVAL_SECONDS
        ):
            _flush_log_buffer(
                callback, runner_job_id, phase, current_command, callback_buffer
            )
            last_flush_at = now
        _emit_metrics_from_line(line, metric_rules, callback, runner_job_id)

    _flush_log_buffer(callback, runner_job_id, phase, current_command, callback_buffer)

    return_code = process.wait(timeout=timeout_seconds)
    if return_code != 0:
        raise RuntimeError(
            f"Command failed with exit code {return_code}: {' '.join(argv)}\n"
            + "\n".join(recent_lines[-20:])
        )

    return recent_lines


def _run_execution(payload: dict[str, Any], runner_job_id: str) -> None:
    spec = payload["executionSpec"]
    callback = payload["callback"]
    recent_lines: list[str] = []

    try:
        _post_callback(
            callback,
            {
                "type": "job_started",
                "runnerBackend": "modal",
                "runnerJobId": runner_job_id,
                "currentCommand": None,
            },
            tolerate_failure=True,
        )

        with tempfile.TemporaryDirectory(prefix="scholarflow-repro-") as temp_dir:
            workdir = Path(temp_dir)
            bundle_dir = _materialize_bundle(spec["bundle"], workdir)
            bundle_working_directory = bundle_dir / spec["bundle"].get("workingDirectory", ".")

            requirements_path = bundle_dir / "requirements.txt"
            requirements_text = (
                requirements_path.read_text().strip() if requirements_path.exists() else ""
            )
            if requirements_text and any(
                line.strip() and not line.lstrip().startswith("#")
                for line in requirements_text.splitlines()
            ):
                recent_lines.extend(
                    _run_process(
                        bundle_dir,
                        list(spec["bundle"].get("installCommand", []))
                        or ["python", "-m", "pip", "install", "-r", "requirements.txt"],
                        phase="install",
                        timeout_seconds=1800,
                        callback=callback,
                        runner_job_id=runner_job_id,
                        metric_rules=spec.get("metricRules", []),
                    )
                )
                recent_lines = recent_lines[-120:]

            entrypoint = spec["bundle"]["entrypoint"]
            recent_lines.extend(
                _run_process(
                    bundle_working_directory,
                    ["python", entrypoint],
                    phase="run_bundle",
                    timeout_seconds=int(spec["timeouts"].get("jobSeconds", 3600)),
                    callback=callback,
                    runner_job_id=runner_job_id,
                    metric_rules=spec.get("metricRules", []),
                )
            )
            recent_lines = recent_lines[-120:]

            _emit_artifact_matches(
                bundle_dir,
                spec.get("outputContracts", []),
                callback,
                runner_job_id,
            )

            _post_callback(
                callback,
                {
                    "type": "artifact_ready",
                    "runnerBackend": "modal",
                    "runnerJobId": runner_job_id,
                    "artifactType": "runner_manifest",
                    "uri": f"modal://{runner_job_id}/runner-manifest",
                    "metadata": json.dumps(
                        {
                            "repoUrl": (spec.get("repo") or {}).get("url"),
                            "repoRef": (spec.get("repo") or {}).get("ref"),
                            "bundleStrategy": spec["bundle"]["strategy"],
                            "entrypoint": entrypoint,
                            "files": [
                                file_spec["path"] for file_spec in spec["bundle"].get("files", [])
                            ],
                        }
                    ),
                },
                tolerate_failure=True,
            )

            _post_callback(
                callback,
                {
                    "type": "job_succeeded",
                    "runnerBackend": "modal",
                    "runnerJobId": runner_job_id,
                    "resultSummary": "\n".join(recent_lines[-30:])
                    or "Execution completed successfully.",
                },
                attempts=max(CALLBACK_ATTEMPTS, 8),
            )
    except Exception as exc:
        error_summary = str(exc)
        try:
            _post_callback(
                callback,
                {
                    "type": "job_failed",
                    "runnerBackend": "modal",
                    "runnerJobId": runner_job_id,
                    "error": error_summary,
                    "resultSummary": "\n".join(recent_lines[-30:]) or None,
                },
                attempts=max(CALLBACK_ATTEMPTS, 8),
            )
        except Exception as callback_error:
            print(
                "Unable to deliver terminal job_failed callback:"
                f" {callback_error}",
                flush=True,
            )
        raise


@app.function(image=image, cpu=4, timeout=3600)
def run_small(payload: dict[str, Any], runner_job_id: str) -> None:
    _run_execution(payload, runner_job_id)


@app.function(image=image, gpu="T4", timeout=14400)
def run_standard(payload: dict[str, Any], runner_job_id: str) -> None:
    _run_execution(payload, runner_job_id)


@app.function(image=image, gpu="A10G", timeout=43200)
def run_extended(payload: dict[str, Any], runner_job_id: str) -> None:
    _run_execution(payload, runner_job_id)


def _spawn_worker(payload: dict[str, Any]):
    tier = payload["executionSpec"]["environment"]["computeTier"]
    if tier == "small":
        return run_small.spawn(payload, payload["runnerJobId"])
    if tier == "extended":
        return run_extended.spawn(payload, payload["runnerJobId"])
    return run_standard.spawn(payload, payload["runnerJobId"])


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def submit(payload: dict[str, Any], x_scholarflow_runner_secret: str = Header(default="")):
    _require_secret(x_scholarflow_runner_secret)

    runner_job_id = str(uuid.uuid4())
    payload = {
        **payload,
        "runnerJobId": runner_job_id,
    }
    _spawn_worker(payload)

    return {"runnerJobId": runner_job_id, "status": "queued"}


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def cancel(payload: dict[str, Any], x_scholarflow_runner_secret: str = Header(default="")):
    _require_secret(x_scholarflow_runner_secret)

    raise HTTPException(
        status_code=501,
        detail="Runner cancellation is not implemented in this v1 Modal worker.",
    )
