#!/usr/bin/env python3
"""Lightweight Goal Loop control-plane CLI."""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

import validate_goal_loop as v

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None

CHECKPOINT_ORDER = (
    "Gate", "History", "History head", "Last completed slice", "Current slice", "Checks",
    "Satisfied exits", "Manual acceptance", "Blocker", "Risks", "Next action", "Contract revision",
)
CONTEXT_PAGE_CHARS = 4000


def today() -> str:
    return dt.date.today().isoformat()


def die(message: str) -> "NoReturn":
    raise SystemExit(f"ERROR: {message}")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temp.write_bytes(data)
    os.replace(temp, path)


@contextlib.contextmanager
def control_lock(effort: Path):
    lock_path = effort / "goal" / ".goal-loop.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def journal_path(effort: Path) -> Path:
    return effort / "goal" / ".goal-loop-transaction.json"


def encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def decode(value: str) -> bytes:
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except Exception as exc:
        die(f"transaction journal contains invalid base64: {exc}")


def safe_target(effort: Path, raw: str) -> Path:
    if Path(raw).is_absolute() or raw.startswith("../") or "/../" in raw.replace("\\", "/"):
        die(f"transaction journal path is unsafe: {raw}")
    path = (effort / raw).resolve()
    try:
        path.relative_to(effort.resolve())
    except ValueError:
        die(f"transaction journal path escapes effort directory: {raw}")
    return path


def commit_transaction(effort: Path, writes: dict[Path, bytes], *, operation: str) -> None:
    effort = effort.resolve()
    path = journal_path(effort)
    if path.exists():
        die("a pending transaction exists; run recover first")
    files = []
    for target, after in sorted(writes.items(), key=lambda item: str(item[0])):
        before_exists = target.exists()
        before = target.read_bytes() if before_exists else b""
        files.append({
            "path": target.resolve().relative_to(effort).as_posix(),
            "before_exists": before_exists,
            "before_sha256": v.sha256_bytes(before),
            "after_sha256": v.sha256_bytes(after),
            "before_b64": encode(before),
            "after_b64": encode(after),
        })
    journal = {"schema": v.TRANSACTION_SCHEMA, "operation": operation, "files": files}
    atomic_write(path, (json.dumps(journal, indent=2, sort_keys=True) + "\n").encode())
    try:
        for item in files:
            atomic_write(effort / item["path"], decode(item["after_b64"]))
        errors = v.validate(effort, allow_baseline_drift=operation == "revise-contract", allow_pending_transaction=True)
        if errors:
            raise RuntimeError("; ".join(errors))
    except Exception:
        for item in reversed(files):
            target = effort / item["path"]
            if item["before_exists"]:
                atomic_write(target, decode(item["before_b64"]))
            elif target.exists():
                target.unlink()
        path.unlink(missing_ok=True)
        raise
    path.unlink(missing_ok=True)


def recover(effort: Path) -> None:
    path = journal_path(effort.resolve())
    if not path.exists():
        print("OK: no pending goal-loop transaction")
        return
    try:
        journal = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die(f"transaction journal is not valid JSON: {exc}")
    if journal.get("schema") != v.TRANSACTION_SCHEMA or not isinstance(journal.get("files"), list):
        die("transaction journal schema is not recognized")
    prepared = []
    for item in journal["files"]:
        target = safe_target(effort, item.get("path", ""))
        before, after = decode(item.get("before_b64", "")), decode(item.get("after_b64", ""))
        if v.sha256_bytes(before) != item.get("before_sha256") or v.sha256_bytes(after) != item.get("after_sha256"):
            die(f"transaction journal bytes hash mismatch: {item.get('path')}")
        prepared.append((item, target, before, after))
    for _, target, _, after in prepared:
        atomic_write(target, after)
    if not v.validate(effort, allow_pending_transaction=True):
        path.unlink()
        print(f"OK: recovered transaction '{journal.get('operation', 'unknown')}'")
        return
    for item, target, before, _ in reversed(prepared):
        if item.get("before_exists"):
            atomic_write(target, before)
        elif target.exists():
            target.unlink()
    if v.validate(effort, allow_pending_transaction=True):
        die("transaction target and original state are both invalid; journal retained")
    path.unlink()
    die("transaction target did not validate; original control-plane state was restored")


def plan_title(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# ") and line.endswith(" Implementation Plan"):
            return line[2:-len(" Implementation Plan")]
    die("implementation-plan.md title must end with 'Implementation Plan'")


def parse_title(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# ") and line.endswith(" Goal Runbook"):
            return line[2:-len(" Goal Runbook")]
    die("runbook title is missing")


def baseline_bytes(repo_root: Path, paths: list[str]) -> bytes:
    files = []
    for rel in sorted(paths):
        target = repo_root / rel
        if not target.exists():
            die(f"contract source does not exist: {rel}")
        files.append({"path": rel, "sha256": v.sha256(target)})
    return (json.dumps({"schema": v.BASELINE_SCHEMA, "files": files}, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def render_event(event_id: str, event_type: str, fields: dict[str, str]) -> str:
    preferred = ("At", "Type", "Slice", "Files", "Check", "Outcome", "Evidence fingerprint", "Matched files", "Acceptance", "Stop condition", "Changed", "Result", "Risk", "Next")
    lines = [f"### {event_id} · {event_type}", ""]
    for key in (*preferred, *sorted(set(fields) - set(preferred))):
        if key in fields:
            lines.append(f"- {key}: {fields[key]}")
    return "\n".join(lines) + "\n"


def history_header(gate: v.Gate) -> str:
    return f"# {gate.label} History\n\nSchema: `{v.HISTORY_SCHEMA}`\nPlan contract: `implementation-plan.md` -> `{gate.label}`\n\n"


def next_event_id(history: str, gate: v.Gate) -> str:
    count = len(v.parse_history_text(history, gate, f"{gate.id}.md", []))
    return f"{gate.id}-E{count + 1:04d}"


def append_event(state: dict[str, object], event_type: str, fields: dict[str, str]) -> tuple[str, str]:
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    history = state["history_text"]  # type: ignore[assignment]
    event_id = next_event_id(history, gate)
    defaults = {"At": today(), "Type": event_type, "Slice": "none", "Result": "none", "Risk": "none", "Next": "none"}
    defaults.update(fields)
    rendered = history + ("\n" if history.endswith("\n") else "\n\n") + render_event(event_id, event_type, defaults)
    return rendered, event_id


def render_ledger(rows: list[v.LedgerRow]) -> str:
    lines = ["| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for row in rows:
        lines.append(f"| {row.gate} | {row.status} | {row.depends_on} | `{row.plan_contract}` | `{row.history}` | `{row.history_head}` | `{row.unlock_evidence}` |")
    return "\n".join(lines)


def render_checkpoint(checkpoint: dict[str, str]) -> str:
    return "\n".join(f"- {key}: `{checkpoint.get(key, 'none')}`" for key in CHECKPOINT_ORDER)


def render_runbook(title: str, revision: int, manifest_hash: str, rows: list[v.LedgerRow], checkpoint: dict[str, str]) -> str:
    return (f"# {title} Goal Runbook\n\nSchema: `{v.RUNBOOK_SCHEMA}`\nRevision: `{revision}`\n\n"
            "## Contract Baseline\n\n- Manifest: `goal/contract-baseline.json`\n"
            f"- Manifest SHA-256: `{manifest_hash}`\n\n## State Rules\n\n"
            + "\n".join(f"- {rule}" for rule in v.STATE_RULES) + "\n\n## Goal Ledger\n\n"
            + render_ledger(rows) + "\n\n## Current Checkpoint\n\n" + render_checkpoint(checkpoint) + "\n")


def current_prompt(effort: Path) -> bytes:
    repo_root = v.find_repo_root(effort)
    rel = v.repo_relative(effort, repo_root)
    template = Path(__file__).resolve().parents[1] / "references" / "goal-prompt-template.md"
    return (template.read_text(encoding="utf-8")
            .replace("{{EFFORT_PATH}}", rel)
            .replace("{{PYTHON}}", "python" if os.name == "nt" else "python3").encode())


def command_upgrade(args: argparse.Namespace) -> None:
    """Install the v3 entry point without changing execution state."""
    effort = args.effort
    errors = v.validate(effort)
    if errors:
        die("cannot upgrade: " + "; ".join(errors))
    goal = effort / "goal"
    revision = v.parse_revision((goal / "runbook.md").read_text(encoding="utf-8"), [])
    if revision != args.expected_revision:
        die(f"stale Revision: expected {args.expected_revision}, current {revision}")
    schema = v.prompt_schema((goal / "prompt.md").read_text(encoding="utf-8"))
    script_names = ("goal_loop_ctl.py", "validate_goal_loop.py")
    if schema == "goal-loop/prompt-v3":
        if not all((goal / name).is_file() for name in script_names):
            die("prompt-v3 entry is incomplete; restore its saved scripts")
        print(f"OK: prompt-v3 already installed; Revision {revision} unchanged")
        return
    if schema != "goal-loop/prompt-v2":
        die("upgrade requires goal-loop/prompt-v2")
    if (goal / "backup-v2").exists():
        die("goal/backup-v2 already exists; retained without overwriting")
    template = Path(__file__).resolve().parents[1] / "references/goal-prompt-template.md"
    if not template.is_file():
        die("run upgrade using the skill's scripts/goal_loop_ctl.py")
    writes = {goal / "prompt.md": current_prompt(effort)}
    for source in (Path(__file__).resolve(), Path(v.__file__).resolve()):
        writes[goal / source.name] = source.read_bytes()
    for target in list(writes):
        if target.exists():
            writes[goal / "backup-v2" / target.name] = target.read_bytes()
    commit_transaction(effort, writes, operation="upgrade-v2-to-v3")
    print(f"OK: upgraded prompt-v2 to prompt-v3; Revision {revision} unchanged; originals in goal/backup-v2")


def control(effort: Path, expected_revision: int, *, allow_drift: bool = False) -> dict[str, object]:
    errors = v.validate(effort, allow_baseline_drift=allow_drift)
    if errors:
        die("control plane is invalid: " + "; ".join(errors))
    runbook_path = effort / "goal" / "runbook.md"
    runbook = runbook_path.read_text(encoding="utf-8")
    parse_errors: list[str] = []
    revision = v.parse_revision(runbook, parse_errors)
    rows = v.parse_ledger(runbook, parse_errors)
    checkpoint = v.parse_checkpoint(runbook, parse_errors)
    plan_errors: list[str] = []
    plan = v.parse_plan((effort / "implementation-plan.md").read_text(encoding="utf-8"), plan_errors)
    if parse_errors or plan_errors:
        die("control plane parsing failed: " + "; ".join(parse_errors + plan_errors))
    if revision != expected_revision:
        die(f"stale Revision: expected {expected_revision}, current {revision}")
    current = [index for index, row in enumerate(rows) if row.status in {"active", "blocked"}]
    if len(current) != 1:
        die("mutation requires exactly one active or blocked Gate")
    index = current[0]
    gate = plan.gates[index]
    history_path = effort / rows[index].history
    return {"effort": effort, "runbook_path": runbook_path, "runbook": runbook, "title": parse_title(runbook), "revision": revision, "rows": rows, "checkpoint": checkpoint, "plan": plan, "index": index, "gate": gate, "history_path": history_path, "history_text": history_path.read_text(encoding="utf-8"), "repo_root": v.find_repo_root(effort), "manifest_hash": v.sha256(effort / "goal" / "contract-baseline.json")}


def write_state(state: dict[str, object], history: str, checkpoint: dict[str, str], *, operation: str, extra: dict[Path, bytes] | None = None) -> None:
    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    revision: int = state["revision"]  # type: ignore[assignment]
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    tail = v.tail_event(v.parse_history_text(history, gate, f"{gate.id}.md", []))
    if tail:
        rows[state["index"]].history_head = tail.event_id  # type: ignore[index]
    writes = {state["history_path"]: history.encode(), state["runbook_path"]: render_runbook(state["title"], revision + 1, state["manifest_hash"], rows, checkpoint).encode()}  # type: ignore[index]
    if extra:
        writes.update(extra)
    commit_transaction(state["effort"], writes, operation=operation)  # type: ignore[arg-type]
    print(f"OK: {operation}; Revision {revision + 1}")


def update_checkpoint(state: dict[str, object], history: str, event_id: str, *, checks: str | None = None, **changes: str) -> dict[str, str]:
    checkpoint = dict(state["checkpoint"])  # type: ignore[arg-type]
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    checkpoint.update({"Gate": gate.label, "History": f"goal/history/{gate.id}.md", "History head": event_id, "Next action": changes.pop("Next action", checkpoint.get("Next action", "continue")), "Contract revision": checkpoint.get("Contract revision", "none")})
    if checks is not None:
        checkpoint["Checks"] = checks
    checkpoint.update(changes)
    events = v.parse_history_text(history, gate, f"{gate.id}.md", [])
    latest = v.latest_check_events(events, gate)
    if checks is None:
        checks = v.check_summary(events, gate)
    checkpoint["Checks"] = checks
    satisfied = v.effective_satisfied_exits(events, gate)
    checkpoint["Satisfied exits"] = "all" if satisfied == set(gate.exits) else (", ".join(e for e in gate.exits if e in satisfied) or "none")
    return checkpoint


def command_bootstrap(args: argparse.Namespace) -> None:
    effort = args.effort.resolve()
    if v.old_runtime_present(effort):
        die("unsupported legacy runtime directory; existing files retained")
    plan_path = effort / "implementation-plan.md"
    if not plan_path.exists() or (effort / "goal" / "runbook.md").exists():
        die("implementation plan is missing or goal/runbook.md already exists")
    errors: list[str] = []
    plan = v.parse_plan(plan_path.read_text(encoding="utf-8"), errors)
    if errors or not plan.gates:
        die("implementation plan is invalid: " + "; ".join(errors))
    repo_root = v.find_repo_root(effort)
    manifest = baseline_bytes(repo_root, sorted({v.repo_relative(plan_path, repo_root), *plan.contract_sources}))
    first = plan.gates[0]
    init_fields = {"At": args.at or today(), "Type": "initialized", "Slice": "none", "Result": "Gate activated; implementation has not started.", "Risk": "none", "Next": "select the first slice from the Gate contract"}
    history = history_header(first) + "\n" + render_event("G0-E0001", "initialized", init_fields)
    rows: list[v.LedgerRow] = []
    for gate in plan.gates:
        if gate.number == 0:
            rows.append(v.LedgerRow(gate.label, "active", "none", f"implementation-plan.md -> {gate.label}", f"goal/history/{gate.id}.md", "G0-E0001", "no predecessor"))
        else:
            rows.append(v.LedgerRow(gate.label, "planned", f"G{gate.number - 1}", f"implementation-plan.md -> {gate.label}", "—", "—", f"G{gate.number - 1} pending"))
    checkpoint = {"Gate": first.label, "History": "goal/history/G0.md", "History head": "G0-E0001", "Last completed slice": "none", "Current slice": "none", "Checks": "none", "Satisfied exits": "none", "Manual acceptance": "none", "Blocker": "none", "Risks": "none", "Next action": "select the first slice from the Gate contract", "Contract revision": "initial"}
    prompt = current_prompt(effort)
    writes = {effort / "goal" / "contract-baseline.json": manifest, effort / "goal" / "runbook.md": render_runbook(plan_title(plan_path.read_text(encoding="utf-8")), 0, v.sha256_bytes(manifest), rows, checkpoint).encode(), effort / "goal" / "prompt.md": prompt, effort / "goal" / "history" / "G0.md": history.encode()}
    # Pin the executable pair with the prompt; normal execution needs no skill installation.
    for source in (Path(__file__).resolve(), Path(v.__file__).resolve()):
        writes[effort / "goal" / source.name] = source.read_bytes()
    commit_transaction(effort, writes, operation="bootstrap")
    print("OK: bootstrap; Revision 0")


def ensure_active(state: dict[str, object], command: str) -> None:
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die(f"{command} requires an active Gate")
    if state["checkpoint"].get("Manual acceptance") != "none":  # type: ignore[index]
        die(f"{command} is not allowed while manual acceptance is pending")


def check_for(state: dict[str, object], check_id: str, kind: str) -> v.VerificationCheck:
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    check = gate.checks.get(check_id)
    if check is None or check.kind != kind:
        die(f"{check_id} is not a declared {kind} check for {gate.id}")
    return check


def command_record(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    ensure_active(state, "record")
    event_type = args.kind
    if event_type not in {"slice", "checkpoint", "failure"}:
        die("record --kind must be slice, checkpoint, or failure")
    fields = {"At": args.at or today(), "Slice": args.slice, "Files": args.files, "Changed": args.changed, "Result": args.result, "Risk": args.risk, "Next": args.next_action}
    history, event_id = append_event(state, event_type, fields)
    checkpoint = update_checkpoint(state, history, event_id, **{"Last completed slice": args.last_completed_slice, "Current slice": args.current_slice, "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation=f"record-{event_type}")


def command_check_start(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    ensure_active(state, "check start")
    check = check_for(state, args.check, args.kind)
    fingerprint, count, missing = v.evidence_fingerprint(state["repo_root"], check)  # type: ignore[arg-type]
    if missing and args.kind != "Manual acceptance":
        die(f"check inputs match no files: {missing}")
    fields = {"At": args.at or today(), "Check": check.id, "Outcome": "started", "Evidence fingerprint": fingerprint, "Matched files": str(count), "Result": args.result, "Next": args.next_action}
    history, event_id = append_event(state, "manual-handoff" if args.kind == "Manual acceptance" else "verification", fields)
    manual = f"pending {state['gate'].id}-{check.id}" if args.kind == "Manual acceptance" else "none"  # type: ignore[index]
    checkpoint = update_checkpoint(state, history, event_id, **{"Manual acceptance": manual, "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation=f"check-start-{check.id}")
    if manual != "none":
        print(f"Acceptance: {state['gate'].id}-{check.id}")  # type: ignore[index]


def command_check_finish(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die("check finish requires an active Gate")
    check = check_for(state, args.check, args.kind)
    acceptance = f"{state['gate'].id}-{check.id}"  # type: ignore[index]
    if args.kind == "Manual acceptance":
        expected = state["checkpoint"].get("Manual acceptance")  # type: ignore[index]
        if expected != f"pending {acceptance}" or args.acceptance != acceptance:
            die(f"checkpoint expects '{expected}' and acceptance '{acceptance}'")
    fingerprint, count, missing = v.evidence_fingerprint(state["repo_root"], check)  # type: ignore[arg-type]
    fields = {"At": args.at or today(), "Check": check.id, "Acceptance": acceptance, "Outcome": args.outcome, "Evidence fingerprint": fingerprint, "Matched files": str(count), "Result": args.result, "Next": args.next_action}
    history, event_id = append_event(state, "manual-result" if args.kind == "Manual acceptance" else "verification", fields)
    checkpoint = update_checkpoint(state, history, event_id, **{"Manual acceptance": "none", "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation="check-finish")


def command_check_run(args: argparse.Namespace) -> int:
    state = control(args.effort, args.expected_revision)
    ensure_active(state, "check run")
    check = check_for(state, args.check, "Repository")
    started_fingerprint, started_count, missing = v.evidence_fingerprint(state["repo_root"], check)  # type: ignore[arg-type]
    if missing:
        die(f"check inputs match no files: {missing}")
    command = check.description
    completed = None
    try:
        popen_kwargs: dict[str, object] = {
            "cwd": state["repo_root"], "shell": True, "stdout": subprocess.PIPE, "stderr": subprocess.PIPE,
        }
        if os.name != "nt":
            popen_kwargs["start_new_session"] = True
        process = subprocess.Popen(command, **popen_kwargs)  # type: ignore[arg-type]
        try:
            stdout, stderr = process.communicate(timeout=args.timeout)
            completed = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            outcome = "pass" if process.returncode == 0 else "fail"
            exit_code = str(process.returncode)
            result = f"exit code {process.returncode}"
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True, check=False)
            else:
                os.killpg(process.pid, 9)
            stdout, stderr = process.communicate()
            completed = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            outcome, exit_code, result = "timed-out", "timeout", "repository check timed out"
    except KeyboardInterrupt:
        if completed is None and 'process' in locals():
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True, check=False)
            else:
                os.killpg(process.pid, 2)
            process.communicate()
        outcome, exit_code, result = "interrupted", "interrupted", "repository check interrupted"
    end_fingerprint, end_count, end_missing = v.evidence_fingerprint(state["repo_root"], check)  # type: ignore[arg-type]
    output_parts = []
    if isinstance(completed, subprocess.CompletedProcess):
        output_parts = [(completed.stdout or b"")[-4096:], (completed.stderr or b"")[-4096:]]
    if outcome == "pass" and (started_fingerprint != end_fingerprint or started_count != end_count or end_missing):
        outcome, result = "fail", "evidence fingerprint changed during check"
    fields = {"At": args.at or today(), "Check": check.id, "Outcome": outcome, "Exit code": exit_code, "Evidence fingerprint": end_fingerprint, "Matched files": str(end_count), "Result": result, "Next": args.next_action}
    history, event_id = append_event(state, "verification", fields)
    checkpoint = update_checkpoint(state, history, event_id, **{"Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation=f"check-run-{check.id}")
    for output in output_parts:
        if output:
            stream = sys.stdout.buffer if output is output_parts[0] else sys.stderr.buffer
            stream.write(output)
            if not output.endswith(b"\n"):
                stream.write(b"\n")
    return 0 if outcome == "pass" else 2


def command_check_cancel(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "active":
        die("check cancel requires an active Gate")
    check = check_for(state, args.check, args.kind)
    history, event_id = append_event(state, "failure", {"At": args.at or today(), "Check": check.id, "Outcome": "cancelled", "Result": args.result, "Next": args.next_action})
    checkpoint = update_checkpoint(state, history, event_id, **{"Manual acceptance": "none", "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation=f"check-cancel-{check.id}")


def command_block(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    ensure_active(state, "block")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    if args.condition not in gate.stop_conditions:
        die(f"unknown Stop condition {args.condition}; declared: {sorted(gate.stop_conditions)}")
    blocker = f"{args.condition}: {gate.stop_conditions[args.condition]}" + (f"; {args.details}" if args.details else "")
    history, event_id = append_event(state, "blocked", {"At": args.at or today(), "Stop condition": args.condition, "Result": blocker, "Next": args.next_action, "Risk": args.risk})
    state["rows"][state["index"]].status = "blocked"  # type: ignore[index]
    checkpoint = update_checkpoint(state, history, event_id, **{"Blocker": blocker, "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation="block")


def command_resume(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    row: v.LedgerRow = state["rows"][state["index"]]  # type: ignore[index]
    if row.status != "blocked":
        die("resume requires a blocked Gate")
    history, event_id = append_event(state, "resumed", {"At": args.at or today(), "Result": args.result, "Next": args.next_action, "Risk": args.risk})
    row.status = "active"
    checkpoint = update_checkpoint(state, history, event_id, **{"Blocker": "none", "Next action": args.next_action, "Risks": args.risk})
    write_state(state, history, checkpoint, operation="resume")


def command_pass_gate(args: argparse.Namespace) -> None:
    state = control(args.effort, args.expected_revision)
    ensure_active(state, "pass-gate")
    gate: v.Gate = state["gate"]  # type: ignore[assignment]
    checkpoint: dict[str, str] = state["checkpoint"]  # type: ignore[assignment]
    if checkpoint.get("Manual acceptance") != "none":
        die("cannot pass Gate while manual acceptance is pending")
    errors: list[str] = []
    events = v.parse_history_text(state["history_text"], gate, f"{gate.id}.md", errors)  # type: ignore[arg-type]
    latest = v.latest_check_events(events, gate)
    stale = v.stale_checks(state["repo_root"], gate, events)  # type: ignore[arg-type]
    missing = []
    for exit_id, required in gate.evidence_rules.items():
        for check_id in required:
            event = latest.get(check_id)
            if not event or event.fields.get("Outcome") != "pass" or check_id in stale:
                missing.append(f"{exit_id}:{check_id}")
    if missing:
        die("cannot pass Gate; checks incomplete or stale: " + ", ".join(missing))
    refs = "; ".join(f"{exit_id}=" + ",".join(f"{cid}@{latest[cid].event_id}" for cid in reqs) for exit_id, reqs in gate.evidence_rules.items())
    history, event_id = append_event(state, "gate-passed", {"At": args.at or today(), "Exit evidence": refs, "Result": args.result, "Next": "effort complete"})
    index: int = state["index"]  # type: ignore[assignment]
    current: v.LedgerRow = state["rows"][index]  # type: ignore[index]
    current.status = "passed"
    current.history_head = event_id
    current.unlock_evidence = f"{gate.id}@{event_id}"
    if index + 1 < len(state["plan"].gates):  # type: ignore[index]
        successor: v.Gate = state["plan"].gates[index + 1]  # type: ignore[index]
        successor_history = history_header(successor) + "\n" + render_event(f"{successor.id}-E0001", "initialized", {"At": args.at or today(), "Type": "initialized", "Slice": "none", "Result": "Gate activated; implementation has not started.", "Risk": "none", "Next": "select the first slice from the Gate contract"})
        successor_row: v.LedgerRow = state["rows"][index + 1]  # type: ignore[index]
        successor_row.status, successor_row.history, successor_row.history_head, successor_row.unlock_evidence = "active", f"goal/history/{successor.id}.md", f"{successor.id}-E0001", current.unlock_evidence
        checkpoint = {"Gate": successor.label, "History": successor_row.history, "History head": f"{successor.id}-E0001", "Last completed slice": "none", "Current slice": "none", "Checks": "none", "Satisfied exits": "none", "Manual acceptance": "none", "Blocker": "none", "Risks": "none", "Next action": "select the first slice from the Gate contract", "Contract revision": checkpoint.get("Contract revision", "initial")}
        write_state(state, history, checkpoint, operation="pass-gate", extra={state["effort"] / successor_row.history: successor_history.encode()})  # type: ignore[index]
    else:
        checkpoint = {"Gate": "none", "History": "none", "History head": event_id, "Last completed slice": "none", "Current slice": "none", "Checks": "all pass", "Satisfied exits": "all", "Manual acceptance": "none", "Blocker": "none", "Risks": "none", "Next action": "effort complete", "Contract revision": checkpoint.get("Contract revision", "initial")}
        write_state(state, history, checkpoint, operation="pass-gate")


def command_revise_contract(args: argparse.Namespace) -> None:
    effort = args.effort.resolve()
    candidate_path = args.plan or effort / "implementation-plan.md"
    candidate = candidate_path.read_text(encoding="utf-8")
    errors: list[str] = []
    plan = v.parse_plan(candidate, errors)
    if errors:
        die("candidate plan is invalid: " + "; ".join(errors))
    if not args.preview_digest and args.expected_revision is None:
        digest = v.sha256_bytes(candidate.encode())
        print(json.dumps({"mode": args.mode, "digest": digest, "gates": [gate.label for gate in plan.gates]}, ensure_ascii=False, indent=2))
        return
    if args.expected_revision is None:
        die("commit requires --expected-revision")
    state = control(effort, args.expected_revision, allow_drift=True)
    if args.preview_digest and args.preview_digest != v.sha256_bytes(candidate.encode()):
        die("preview digest does not match candidate plan")
    if args.mode not in {"equivalent", "revalidate"}:
        die("revise-contract mode must be equivalent or revalidate")
    if not args.preview_digest:
        die("commit requires --preview-digest")
    effort: Path = state["effort"]  # type: ignore[assignment]
    repo_root: Path = state["repo_root"]  # type: ignore[assignment]
    plan_path = effort / "implementation-plan.md"
    manifest = baseline_bytes(repo_root, sorted({v.repo_relative(plan_path, repo_root), *plan.contract_sources}))
    manifest_data = json.loads(manifest.decode("utf-8"))
    plan_rel = v.repo_relative(plan_path, repo_root)
    for entry in manifest_data["files"]:
        if entry["path"] == plan_rel:
            entry["sha256"] = v.sha256_bytes(candidate.encode())
    manifest = (json.dumps(manifest_data, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    rows: list[v.LedgerRow] = state["rows"]  # type: ignore[assignment]
    if args.mode == "revalidate":
        first = next((i for i, row in enumerate(rows) if row.status != "passed"), 0)
        for index in range(first, len(rows)):
            rows[index].status = "active" if index == first else "planned"
            rows[index].history = f"goal/history/G{index}.md" if index == first else "—"
            rows[index].history_head = f"G{index}-E0001" if index == first else "—"
        gate = plan.gates[first]
        history = history_header(gate) + "\n" + render_event(f"G{first}-E0001", "initialized", {"At": today(), "Type": "initialized", "Slice": "none", "Result": "Gate reactivated after contract revision.", "Risk": "none", "Next": "review revised contract"})
        checkpoint = {"Gate": gate.label, "History": f"goal/history/{gate.id}.md", "History head": f"{gate.id}-E0001", "Last completed slice": "none", "Current slice": "none", "Checks": "none", "Satisfied exits": "none", "Manual acceptance": "none", "Blocker": "none", "Risks": "none", "Next action": "review revised contract", "Contract revision": args.reason}
        extra = {effort / "implementation-plan.md": candidate.encode(), effort / "goal" / "contract-baseline.json": manifest, effort / "goal" / "history" / f"G{first}.md": history.encode()}
        revised_state = {**state, "rows": rows, "plan": plan, "index": first, "gate": gate, "manifest_hash": v.sha256_bytes(manifest), "history_path": effort / rows[first].history, "history_text": history}
        write_state(revised_state, history, checkpoint, operation="revise-contract", extra=extra)
    else:
        extra = {effort / "implementation-plan.md": candidate.encode(), effort / "goal" / "contract-baseline.json": manifest}
        state["manifest_hash"] = v.sha256_bytes(manifest)
        write_state(state, state["history_text"], {**state["checkpoint"], "Contract revision": args.reason}, operation="revise-contract", extra=extra)  # type: ignore[arg-type]


def current_view(effort: Path) -> tuple[str, str]:
    """Render validated live state without exposing history or implementation details."""
    text = (effort / "goal" / "runbook.md").read_text(encoding="utf-8")
    revision = v.parse_revision(text, [])
    checkpoint = v.parse_checkpoint(text, [])
    rows = v.parse_ledger(text, [])
    plan_text = (effort / "implementation-plan.md").read_text(encoding="utf-8")
    plan = v.parse_plan(plan_text, [])
    gate = next((gate for gate in plan.gates if gate.label == checkpoint.get("Gate")), None)
    row = next((row for row in rows if row.gate == checkpoint.get("Gate")), None)
    stale = "none"
    if gate:
        events = v.parse_history(effort / checkpoint["History"], gate, [])
        stale_map = v.stale_checks(v.find_repo_root(effort), gate, events)
        stale = ", ".join(f"{check}: stale ({reason})" for check, reason in stale_map.items()) or "none"
    summary = (f"Validation: OK (transaction, baseline, runbook, history)\nRevision: {revision}\n"
               f"State: {row.status if row else 'complete'}\nGate: {checkpoint.get('Gate')}\n"
               f"Manual acceptance: {checkpoint.get('Manual acceptance')}\n"
               f"Satisfied exits: {checkpoint.get('Satisfied exits')}\n"
               f"Next action: {checkpoint.get('Next action')}\nStale checks: {stale}")
    if gate is None:
        return summary, "Effort complete"
    context = (f"Checkpoint:\n{v.section(text, 'Current Checkpoint') or ''}\n"
               f"Plan rules:\n{v.section(plan_text, 'Non-Negotiable Rules') or ''}\n"
               "Contract Sources (read relevant sources on demand):\n"
               + "\n".join(f"- {source}" for source in plan.contract_sources)
               + f"\n\nCurrent Gate contract:\n{gate.body}")
    return summary, context


def command_status(args: argparse.Namespace) -> int:
    errors = v.validate(args.effort)
    if errors:
        print("ERROR: " + "; ".join(errors))
        return 1
    summary, _ = current_view(args.effort)
    print(summary)
    return 0


def print_context_page(text: str, offset: int) -> None:
    if offset < 0 or (offset and offset >= len(text)):
        die("context offset is outside the current view; read context from offset 0")
    end = min(offset + CONTEXT_PAGE_CHARS, len(text))
    print(f"Context characters {offset}:{end} of {len(text)}")
    print("--- context ---")
    print(text[offset:end])
    print("--- end context ---")
    print(f"Next page: context --offset {end} (same effort)" if end < len(text) else "Context complete")


def command_context(args: argparse.Namespace) -> int:
    errors = v.validate(args.effort)
    if errors:
        print_context_page("ERROR: " + "\nERROR: ".join(errors), args.offset)
        return 1
    summary, context = current_view(args.effort)
    # Every page identifies its revision so callers can detect concurrent changes.
    revision = v.parse_revision((args.effort / "goal" / "runbook.md").read_text(encoding="utf-8"), [])
    print(f"Revision: {revision}")
    print_context_page(summary + "\n\n" + context, args.offset)
    return 0


def add_mutation(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--expected-revision", type=int, required=True)
    parser.add_argument("--at")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("bootstrap"); p.add_argument("effort", type=Path); p.add_argument("--at"); p.set_defaults(func=command_bootstrap)
    p = sub.add_parser("upgrade", help="install prompt-v3 and local scripts while preserving v2 execution state"); p.add_argument("effort", type=Path); p.add_argument("--expected-revision", type=int, required=True); p.set_defaults(func=command_upgrade)
    p = sub.add_parser("recover"); p.add_argument("effort", type=Path); p.set_defaults(func=lambda args: recover(args.effort))
    p = sub.add_parser("status"); p.add_argument("effort", type=Path); p.set_defaults(func=command_status)
    p = sub.add_parser("context"); p.add_argument("effort", type=Path); p.add_argument("--offset", type=int, default=0, help="character offset for the next bounded context page"); p.set_defaults(func=command_context)
    p = sub.add_parser("validate"); p.add_argument("effort", type=Path); p.set_defaults(func=lambda args: print("OK: goal-loop artifacts are valid") if not v.validate(args.effort) else die("; ".join(v.validate(args.effort))))
    p = sub.add_parser("record"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--kind", choices=["slice", "checkpoint", "failure"], required=True); p.add_argument("--slice", default="none"); p.add_argument("--files", default="none"); p.add_argument("--changed", default="none"); p.add_argument("--result", required=True); p.add_argument("--risk", default="none"); p.add_argument("--next-action", required=True); p.add_argument("--last-completed-slice", default="none"); p.add_argument("--current-slice", default="none"); p.set_defaults(func=command_record)
    check = sub.add_parser("check"); check_sub = check.add_subparsers(dest="check_command", required=True)
    p = check_sub.add_parser("start"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--kind", choices=["Directed", "Manual acceptance"], required=True); p.add_argument("--check", required=True); p.add_argument("--result", required=True); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_check_start)
    p = check_sub.add_parser("finish"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--kind", choices=["Directed", "Manual acceptance"], required=True); p.add_argument("--check", required=True); p.add_argument("--acceptance", default="none"); p.add_argument("--outcome", choices=["pass", "fail"], required=True); p.add_argument("--result", required=True); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_check_finish)
    p = check_sub.add_parser("run"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--check", required=True); p.add_argument("--timeout", type=float, default=None); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_check_run)
    p = check_sub.add_parser("cancel"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--kind", choices=["Directed", "Manual acceptance", "Repository"], required=True); p.add_argument("--check", required=True); p.add_argument("--result", required=True); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_check_cancel)
    p = sub.add_parser("block"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--condition", required=True); p.add_argument("--details"); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_block)
    p = sub.add_parser("resume"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--result", required=True); p.add_argument("--next-action", required=True); p.add_argument("--risk", default="none"); p.set_defaults(func=command_resume)
    p = sub.add_parser("pass-gate"); p.add_argument("effort", type=Path); add_mutation(p); p.add_argument("--result", default="all declared checks are passing and fresh"); p.set_defaults(func=command_pass_gate)
    p = sub.add_parser("revise-contract"); p.add_argument("effort", type=Path); p.add_argument("--plan", type=Path); p.add_argument("--mode", choices=["equivalent", "revalidate"], default="revalidate"); p.add_argument("--reason", required=True); p.add_argument("--preview-digest"); p.add_argument("--preview", action="store_true"); p.add_argument("--expected-revision", type=int); p.set_defaults(func=command_revise_contract)
    return parser


def main() -> int:
    v.configure_stdio()
    args = build_parser().parse_args()
    effort = args.effort.resolve()
    with control_lock(effort):
        args.effort = effort
        try:
            return int(args.func(args) or 0)
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
