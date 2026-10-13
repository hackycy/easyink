#!/usr/bin/env python3
"""Validate the lightweight Goal Loop control plane."""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

RUNBOOK_SCHEMA = "goal-loop/runbook-v2"
HISTORY_SCHEMA = "goal-loop/history-v2"
BASELINE_SCHEMA = "goal-loop/contract-baseline-v2"
PROMPT_SCHEMA = "goal-loop/prompt-v3"
TRANSACTION_SCHEMA = "goal-loop/transaction-v2"

REQUIRED_GATE_HEADINGS = (
    "Purpose", "Inputs", "Objective", "Scope boundary", "Constraints",
    "Slice policy", "Verification", "Evidence rule", "Stop conditions", "Exit conditions",
)
STATE_RULES = (
    "`implementation-plan.md` 是 Gate 合同唯一来源；runbook 只保存当前执行状态和最新 checkpoint。",
    "`goal/contract-baseline.json` 声明合同输入集合及内容哈希；合同输入漂移时停止执行。",
    "每个已激活 Gate 只有一个 `goal/history/G<n>.md`；history 仅用于追溯，不参与默认状态重放。",
    "一次只允许唯一 `active` 或 `blocked` Gate；`blocked` 只对应计划声明的 Stop condition。",
    "所有运行态修改使用 goal-loop control script 并携带当前 runbook Revision；陈旧 Revision 的写入必须拒绝。",
    "稳定 slice 替换 runbook checkpoint；Gate 保持 `active`，后续 Goal 从 checkpoint 恢复。",
    "人工验收 pending 时 Gate 保持 `active`；当前 Goal 结束且不轮询，只在收到对应 acceptance id 的明确结果后继续。",
    "Gate 通过时只激活直接后继；最后一个 Gate 通过后 effort complete。",
)
ALLOWED_EVENT_TYPES = {
    "initialized", "slice", "checkpoint", "verification", "failure", "blocked", "resumed",
    "manual-handoff", "manual-result", "gate-passed", "contract-revised",
}
EMPTY_MARKERS = {"none", "无", "—", "-", ""}


@dataclass(frozen=True)
class VerificationCheck:
    id: str
    kind: str
    description: str
    inputs: tuple[str, ...]


@dataclass(frozen=True)
class Gate:
    number: int
    name: str
    exits: list[str]
    checks: dict[str, VerificationCheck] = field(default_factory=dict)
    evidence_rules: dict[str, tuple[str, ...]] = field(default_factory=dict)
    stop_conditions: dict[str, str] = field(default_factory=dict)
    body: str = ""

    @property
    def id(self) -> str:
        return f"G{self.number}"

    @property
    def label(self) -> str:
        return f"{self.id}: {self.name}"


@dataclass(frozen=True)
class Plan:
    gates: list[Gate]
    contract_sources: list[str]


@dataclass
class LedgerRow:
    gate: str
    status: str
    depends_on: str
    plan_contract: str
    history: str
    history_head: str
    unlock_evidence: str


@dataclass
class Event:
    event_id: str
    event_type: str
    fields: dict[str, str]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_repo_root(effort: Path) -> Path:
    effort = effort.resolve()
    for parent in [effort, *effort.parents]:
        if (parent / ".git").exists():
            return parent
    return effort


def repo_relative(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def section(text: str, heading: str, level: int = 2) -> str | None:
    marker = "#" * level + " " + heading
    pattern = re.compile(rf"(?ms)^{re.escape(marker)}\s*\n(.*?)(?=^{re.escape('#' * level + ' ')}|\Z)")
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def parse_table_from_body(body: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in body.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            continue
        rows.append(cells)
    return rows


def parse_markdown_table(text: str, heading: str) -> list[list[str]]:
    return parse_table_from_body(section(text, heading) or "")


def unquote_code(value: str) -> str:
    value = value.strip()
    return value[1:-1] if value.startswith("`") and value.endswith("`") else value.replace("`", "")


def parse_input_patterns(value: str, errors: list[str], *, gate_id: str, check_id: str) -> tuple[str, ...]:
    if value.strip().lower() in EMPTY_MARKERS:
        return ()
    result: list[str] = []
    for part in value.replace("<br>", ",").replace("<br/>", ",").replace("<br />", ",").split(","):
        item = unquote_code(part.strip())
        if not item:
            continue
        path = item.replace("\\", "/")
        if Path(path).is_absolute() or path.startswith("../") or "/../" in path or path.startswith("goal/") or "/goal/" in path:
            errors.append(f"plan: {gate_id} check {check_id} Evidence inputs must be repository-relative and outside goal/: {item}")
        else:
            result.append(path)
    return tuple(result)


def _parse_verification_checks(gate_id: str, body: str, errors: list[str]) -> dict[str, VerificationCheck]:
    match = re.search(r"(?ms)^### Verification\s*\n(.*?)(?=^### |\Z)", body)
    checks: dict[str, VerificationCheck] = {}
    if not match:
        return checks
    for heading, prefix, description_header in (("Directed", "D", "Check"), ("Repository", "R", "Command"), ("Manual acceptance", "M", "Scenario")):
        sub = section(match.group(1), heading, 4) or ""
        rows = parse_table_from_body(sub)
        if not rows:
            continue
        expected = ["ID", description_header, "Evidence inputs"]
        if rows[0] != expected:
            errors.append(f"plan: {gate_id} Verification/{heading} table header must be {expected}; got {rows[0]}")
            continue
        for row in rows[1:]:
            if len(row) != 3:
                errors.append(f"plan: {gate_id} malformed Verification/{heading} row: {row}")
                continue
            check_id = unquote_code(row[0])
            if not re.fullmatch(rf"{prefix}\d+", check_id):
                errors.append(f"plan: {gate_id} {heading} check id is invalid: {check_id}")
                continue
            if check_id in checks:
                errors.append(f"plan: {gate_id} duplicate verification check id {check_id}")
                continue
            checks[check_id] = VerificationCheck(check_id, heading, unquote_code(row[1]).strip(), parse_input_patterns(row[2], errors, gate_id=gate_id, check_id=check_id))
    return checks


def _parse_stop_conditions(gate_id: str, body: str, errors: list[str]) -> dict[str, str]:
    match = re.search(r"(?ms)^### Stop conditions\s*\n(.*?)(?=^### |\Z)", body)
    raw = match.group(1).strip() if match else ""
    if raw.lower() in EMPTY_MARKERS or re.fullmatch(r"-\s*(?:无|none)\s*", raw, flags=re.I):
        return {}
    conditions: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip().startswith("-"):
            continue
        found = re.match(r"^-\s+`(SC\d+)`:\s+(.+)$", line.strip())
        if found:
            conditions[found.group(1)] = found.group(2).strip()
        else:
            errors.append(f"plan: {gate_id} Stop conditions must use `SC<n>` ids: {line.strip()}")
    if list(conditions) != [f"SC{i}" for i in range(1, len(conditions) + 1)]:
        errors.append(f"plan: {gate_id} Stop condition ids must be continuous from SC1")
    return conditions


def parse_plan(text: str, errors: list[str]) -> Plan:
    rows = parse_markdown_table(text, "Contract Sources")
    sources: list[str] = []
    if len(rows) < 2 or rows[0] != ["Path", "Role"]:
        errors.append("plan: Contract Sources table missing or invalid")
    else:
        for row in rows[1:]:
            if len(row) != 2:
                errors.append(f"plan: malformed Contract Sources row: {row}")
                continue
            path = unquote_code(row[0])
            if Path(path).is_absolute() or path.startswith("../") or "/../" in path or path.startswith("goal/"):
                errors.append(f"plan: Contract Sources path must be repository-relative and outside goal/: {path}")
            sources.append(path)
    if sources != sorted(sources):
        errors.append("plan: Contract Sources paths must be lexicographically sorted")
    if len(sources) != len(set(sources)):
        errors.append("plan: Contract Sources contains duplicate paths")

    matches = list(re.finditer(r"(?m)^## G(\d+): (.+?)\s*$", text))
    gates: list[Gate] = []
    for index, match in enumerate(matches):
        number, name = int(match.group(1)), match.group(2).strip()
        body = text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(text)]
        for heading in REQUIRED_GATE_HEADINGS:
            if not re.search(rf"(?m)^### {re.escape(heading)}\s*$", body):
                errors.append(f"plan: G{number} missing '### {heading}'")
        exit_match = re.search(r"(?ms)^### Exit conditions\s*\n(.*?)(?=^### |\Z)", body)
        exits = re.findall(r"(?m)^-\s+`(E\d+)`:\s+.+$", exit_match.group(1) if exit_match else "")
        if not exits or exits != [f"E{i}" for i in range(1, len(exits) + 1)]:
            errors.append(f"plan: G{number} Exit ids must be continuous from E1 and non-empty")
        checks = _parse_verification_checks(f"G{number}", body, errors)
        if not checks:
            errors.append(f"plan: G{number} must declare at least one Verification check")
        for prefix in "DRM":
            ids = [cid for cid in checks if cid.startswith(prefix)]
            if ids != [f"{prefix}{i}" for i in range(1, len(ids) + 1)]:
                errors.append(f"plan: G{number} {prefix} check ids must be continuous from {prefix}1")
        evidence_match = re.search(r"(?ms)^### Evidence rule\s*\n(.*?)(?=^### |\Z)", body)
        evidence_rows = parse_table_from_body(evidence_match.group(1) if evidence_match else "")
        rules: dict[str, tuple[str, ...]] = {}
        if not evidence_rows or evidence_rows[0] != ["Exit", "Required checks"]:
            errors.append(f"plan: G{number} Evidence rule table missing or invalid")
        else:
            for row in evidence_rows[1:]:
                if len(row) != 2:
                    errors.append(f"plan: G{number} malformed Evidence rule row: {row}")
                    continue
                exit_id = unquote_code(row[0])
                reqs = tuple(unquote_code(x.strip()) for x in row[1].replace("<br>", ",").split(",") if x.strip())
                if exit_id not in exits or not reqs or any(cid not in checks for cid in reqs):
                    errors.append(f"plan: G{number} Evidence rule has invalid checks for {exit_id}")
                rules[exit_id] = reqs
            if set(rules) != set(exits):
                errors.append(f"plan: G{number} Evidence rule must cover exactly {exits}")
            unused = [cid for cid in checks if not any(cid in reqs for reqs in rules.values())]
            if unused:
                errors.append(f"plan: G{number} verification checks are not referenced by any Exit: {unused}")
        gates.append(Gate(number, name, exits, checks, rules, _parse_stop_conditions(f"G{number}", body, errors), body.strip()))
    if [gate.number for gate in gates] != list(range(len(gates))):
        errors.append("plan: Gate numbers must be continuous from G0")
    expected_top = ["Contract Sources", "Source Decisions", "Outcome", "Non-Negotiable Rules", "Gate Overview", *[gate.label for gate in gates], "Definition Of Done", "Explicitly Out Of Scope"]
    if re.findall(r"(?m)^## (.+?)\s*$", text) != expected_top:
        errors.append("plan: top-level sections do not match required order")
    overview = parse_markdown_table(text, "Gate Overview")
    if len(overview) < 2 or overview[0] != ["Gate", "Name", "Unlock condition", "Outcome"]:
        errors.append("plan: Gate Overview table missing or invalid")
    elif [(unquote_code(row[0]), unquote_code(row[1])) for row in overview[1:] if len(row) >= 2] != [(gate.id, gate.name) for gate in gates]:
        errors.append("plan: Gate Overview rows do not match Gate detail headings")
    return Plan(gates, sources)


def parse_revision(runbook: str, errors: list[str]) -> int | None:
    match = re.search(r"(?m)^Revision:\s+`(\d+)`\s*$", runbook)
    if not match:
        errors.append("runbook: missing numeric Revision")
        return None
    return int(match.group(1))


def parse_contract_baseline(runbook: str, errors: list[str]) -> tuple[str, str]:
    values: dict[str, str] = {}
    for line in (section(runbook, "Contract Baseline") or "").splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    manifest, digest = values.get("Manifest", ""), values.get("Manifest SHA-256", "")
    if manifest != "goal/contract-baseline.json":
        errors.append("runbook: Contract Baseline Manifest must be goal/contract-baseline.json")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        errors.append("runbook: Contract Baseline Manifest SHA-256 must be 64 lowercase hex characters")
    return manifest, digest


def parse_state_rules(runbook: str, errors: list[str]) -> None:
    rules = [line[2:].strip() for line in (section(runbook, "State Rules") or "").splitlines() if line.strip().startswith("- ")]
    if rules != list(STATE_RULES):
        errors.append("runbook: State Rules do not match the required lightweight invariants")


def parse_ledger(runbook: str, errors: list[str]) -> list[LedgerRow]:
    rows = parse_markdown_table(runbook, "Goal Ledger")
    expected = ["Gate", "Status", "Depends on", "Plan contract", "History", "History head", "Unlock evidence"]
    if len(rows) < 2 or rows[0] != expected:
        errors.append("runbook: Goal Ledger table missing or invalid")
        return []
    result: list[LedgerRow] = []
    for row in rows[1:]:
        if len(row) != 7:
            errors.append(f"runbook: malformed Goal Ledger row: {row}")
        else:
            result.append(LedgerRow(*(unquote_code(cell) for cell in row)))
    return result


def parse_checkpoint(runbook: str, errors: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (section(runbook, "Current Checkpoint") or "").splitlines():
        match = re.match(r"^-\s+([^:]+):\s*(.+?)\s*$", line.strip())
        if match:
            values[match.group(1).strip()] = unquote_code(match.group(2).strip())
    required = ("Gate", "History", "History head", "Last completed slice", "Current slice", "Checks", "Satisfied exits", "Manual acceptance", "Blocker", "Risks", "Next action", "Contract revision")
    missing = [key for key in required if key not in values]
    if missing:
        errors.append(f"runbook: Current Checkpoint missing {missing}")
    return values


def parse_history_text(text: str, gate: Gate, source_name: str, errors: list[str]) -> dict[str, Event]:
    if f"Schema: `{HISTORY_SCHEMA}`" not in text:
        errors.append(f"history {source_name}: schema must be {HISTORY_SCHEMA}")
    events: dict[str, Event] = {}
    chunks = re.split(r"(?m)^### (G\d+-E\d{4}) · ([^\n]+)\s*$", text)[1:]
    for index in range(0, len(chunks), 3):
        event_id, event_type, body = chunks[index:index + 3]
        fields: dict[str, str] = {}
        for line in body.splitlines():
            match = re.match(r"^-\s+([^:]+):\s*(.*)$", line.strip())
            if match:
                fields[match.group(1).strip()] = unquote_code(match.group(2).strip())
        if event_id in events:
            errors.append(f"history {source_name}: duplicate event {event_id}")
        if event_type not in ALLOWED_EVENT_TYPES:
            errors.append(f"history {source_name}: unsupported event type {event_type}")
        for key in ("At", "Type", "Slice", "Result", "Next"):
            if key not in fields:
                errors.append(f"history {source_name}: {event_id} missing {key}")
        events[event_id] = Event(event_id, event_type, fields)
    expected = [f"{gate.id}-E{i:04d}" for i in range(1, len(events) + 1)]
    if list(events) != expected:
        errors.append(f"history {source_name}: event ids must be continuous")
    return events


def parse_history(path: Path, gate: Gate, errors: list[str]) -> dict[str, Event]:
    try:
        return parse_history_text(path.read_text(encoding="utf-8"), gate, path.name, errors)
    except FileNotFoundError:
        errors.append(f"history missing: {path}")
        return {}


def tail_event(events: dict[str, Event]) -> Event | None:
    return events[next(reversed(events))] if events else None


def expand_evidence_inputs(repo_root: Path, patterns: tuple[str, ...]) -> tuple[list[tuple[str, str]], list[str]]:
    matches: list[str] = []
    missing: list[str] = []
    for pattern in patterns:
        files = [Path(item) for item in glob.glob(str(repo_root / pattern), recursive=True) if Path(item).is_file()]
        if not files:
            missing.append(pattern)
        matches.extend(repo_relative(path, repo_root) for path in files)
    return [(path, sha256(repo_root / path)) for path in sorted(set(matches))], missing


def evidence_fingerprint(repo_root: Path, check: VerificationCheck) -> tuple[str, int, list[str]]:
    entries, missing = expand_evidence_inputs(repo_root, check.inputs)
    payload = "\n".join(f"{path} {digest}" for path, digest in entries).encode("utf-8")
    return sha256_bytes(payload), len(entries), missing


def latest_check_events(events: dict[str, Event], gate: Gate) -> dict[str, Event]:
    latest: dict[str, Event] = {}
    for event in events.values():
        check = event.fields.get("Check")
        if check in gate.checks and event.event_type in {"verification", "manual-result"}:
            latest[check] = event
    return latest


def check_summary(events: dict[str, Event], gate: Gate) -> str:
    latest = latest_check_events(events, gate)
    return ", ".join(f"{check_id}={event.fields.get('Outcome', 'unknown')}" for check_id, event in latest.items()) or "none"


def effective_satisfied_exits(events: dict[str, Event], gate: Gate) -> set[str]:
    latest = latest_check_events(events, gate)
    return {exit_id for exit_id, required in gate.evidence_rules.items() if all(latest.get(cid) and latest[cid].fields.get("Outcome") == "pass" for cid in required)}


def stale_checks(repo_root: Path, gate: Gate, events: dict[str, Event]) -> dict[str, str]:
    stale: dict[str, str] = {}
    for check_id, event in latest_check_events(events, gate).items():
        if event.fields.get("Outcome") != "pass":
            continue
        fingerprint, count, missing = evidence_fingerprint(repo_root, gate.checks[check_id])
        if missing or fingerprint != event.fields.get("Evidence fingerprint") or str(count) != event.fields.get("Matched files"):
            stale[check_id] = ", ".join(missing) if missing else "evidence fingerprint changed"
    return stale


def load_baseline_manifest(path: Path, errors: list[str]) -> dict[str, object] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        errors.append(f"baseline: cannot read manifest: {exc}")
        return None
    if data.get("schema") != BASELINE_SCHEMA or not isinstance(data.get("files"), list):
        errors.append(f"baseline: schema must be {BASELINE_SCHEMA} with files")
        return None
    return data


def validate_baseline(effort: Path, repo_root: Path, plan_path: Path, plan: Plan, runbook: str, errors: list[str], *, check_drift: bool = True) -> None:
    manifest_path = effort / "goal" / "contract-baseline.json"
    manifest = load_baseline_manifest(manifest_path, errors)
    if manifest is None:
        return
    entries = manifest["files"]
    actual = {item.get("path"): item.get("sha256") for item in entries if isinstance(item, dict)}
    plan_rel = repo_relative(plan_path, repo_root)
    expected = sorted({plan_rel, *plan.contract_sources})
    if sorted(actual) != expected:
        errors.append("baseline: file paths must exactly match implementation-plan.md and Contract Sources")
    if check_drift:
        drift = [rel for rel in expected if rel not in actual or not (repo_root / rel).exists() or actual[rel] != sha256(repo_root / rel)]
        if drift:
            errors.append("baseline: contract input drift detected: " + ", ".join(drift))
    _, digest = parse_contract_baseline(runbook, errors)
    if digest != sha256(manifest_path):
        errors.append("runbook: Contract Baseline Manifest SHA-256 does not match manifest")


def prompt_schema(text: str) -> str | None:
    match = re.search(r"(?m)^Prompt schema: `([^`]+)`$", text)
    return match.group(1) if match else None


def validate_prompt(effort: Path, errors: list[str]) -> None:
    try:
        text = (effort / "goal" / "prompt.md").read_text(encoding="utf-8")
    except FileNotFoundError:
        errors.append("prompt: goal/prompt.md is missing")
        return
    if prompt_schema(text) not in {"goal-loop/prompt-v2", PROMPT_SCHEMA}:
        errors.append(f"prompt: schema must be goal-loop/prompt-v2 or {PROMPT_SCHEMA}")
    for forbidden in ("goal/evidence", "verify-directed", "verify-repository", "reconcile-baseline", "event hash chain"):
        if forbidden in text.lower():
            errors.append(f"prompt: obsolete term is present: {forbidden}")
    required = ("不创建、修改或回滚 git commit", "代码提交和代码回退由用户", "只有合同声明的 stop condition")
    for phrase in required:
        if phrase.lower() not in text.lower():
            errors.append(f"prompt: required responsibility statement is missing: {phrase}")


def valid_ledger_shape(rows: list[LedgerRow]) -> bool:
    statuses = [row.status for row in rows]
    if any(status not in {"planned", "active", "blocked", "passed"} for status in statuses):
        return False
    if statuses.count("active") + statuses.count("blocked") > 1:
        return False
    current = next((index for index, status in enumerate(statuses) if status in {"active", "blocked"}), None)
    if current is None:
        return all(status == "passed" for status in statuses)
    return statuses[:current] == ["passed"] * current and statuses[current + 1:] == ["planned"] * (len(statuses) - current - 1)


def old_runtime_present(effort: Path) -> list[str]:
    return [name for name in ("commits", "objects", "spool", "state.json", "evidence") if (effort / "goal" / name).exists()]


def validate(effort: Path, *, allow_baseline_drift: bool = False, allow_pending_transaction: bool = False) -> list[str]:
    effort = effort.resolve()
    errors: list[str] = []
    old = old_runtime_present(effort)
    if old:
        errors.append("unsupported legacy runtime directory; existing files retained: " + ", ".join(old))
    goal = effort / "goal"
    if (goal / ".goal-loop-transaction.json").exists() and not allow_pending_transaction:
        errors.append("pending control-plane transaction exists; run recover")
    plan_path, runbook_path = effort / "implementation-plan.md", goal / "runbook.md"
    if not plan_path.exists() or not runbook_path.exists():
        return errors + ["missing implementation-plan.md or goal/runbook.md"]
    plan_errors: list[str] = []
    plan = parse_plan(plan_path.read_text(encoding="utf-8"), plan_errors)
    errors.extend(plan_errors)
    runbook = runbook_path.read_text(encoding="utf-8")
    if f"Schema: `{RUNBOOK_SCHEMA}`" not in runbook:
        errors.append(f"runbook: schema must be {RUNBOOK_SCHEMA}")
    revision_errors: list[str] = []
    parse_revision(runbook, revision_errors)
    errors.extend(revision_errors)
    parse_contract_baseline(runbook, errors)
    parse_state_rules(runbook, errors)
    rows = parse_ledger(runbook, errors)
    checkpoint = parse_checkpoint(runbook, errors)
    if rows and len(rows) != len(plan.gates) and not allow_baseline_drift:
        errors.append("runbook: Goal Ledger must contain exactly one row per plan Gate")
    if rows and not valid_ledger_shape(rows):
        errors.append("runbook: Goal Ledger state is not a linear Gate sequence")
    repo_root = find_repo_root(effort)
    if plan.gates:
        validate_baseline(effort, repo_root, plan_path, plan, runbook, errors, check_drift=not allow_baseline_drift)
    validate_prompt(effort, errors)
    active = [index for index, row in enumerate(rows) if row.status in {"active", "blocked"}]
    if len(active) > 1:
        errors.append("runbook: more than one active or blocked Gate")
    if active and rows[active[0]].gate != checkpoint.get("Gate"):
        errors.append("runbook: checkpoint Gate must equal the active Gate")
    for index, row in enumerate(rows):
        if index >= len(plan.gates) or row.gate != plan.gates[index].label:
            if allow_baseline_drift:
                continue
            errors.append(f"runbook: Ledger Gate row {index} does not match plan")
            continue
        if row.status in {"active", "blocked", "passed"}:
            if row.history in {"—", "none", ""}:
                errors.append(f"runbook: {row.gate} requires a history path")
                continue
            history_errors: list[str] = []
            events = parse_history(effort / row.history, plan.gates[index], history_errors)
            errors.extend(history_errors)
            tail = tail_event(events)
            if tail and row.history_head != tail.event_id:
                errors.append(f"runbook: {row.gate} History head must equal history tail event id")
            if row.status in {"active", "blocked"} and checkpoint.get("Checks") != check_summary(events, plan.gates[index]):
                errors.append(f"runbook: {row.gate} checkpoint Checks must match latest check results")
        elif row.history != "—" or row.history_head != "—":
            errors.append(f"runbook: planned Gate {row.gate} must not have history")
    if checkpoint.get("Gate") == "none" and rows and any(row.status != "passed" for row in rows):
        errors.append("runbook: completed checkpoint requires every Gate passed")
    return errors


def configure_stdio() -> None:
    # Pipe consumers use UTF-8 even when Windows defaults to a legacy code page.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def main() -> int:
    configure_stdio()
    parser = argparse.ArgumentParser()
    parser.add_argument("effort", type=Path)
    args = parser.parse_args()
    errors = validate(args.effort)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        return 1
    print("OK: goal-loop artifacts are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
