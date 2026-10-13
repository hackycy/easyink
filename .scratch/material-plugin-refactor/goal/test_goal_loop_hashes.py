"""Regression coverage for Goal Loop checks across checkout line endings."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import goal_loop_ctl as ctl
import validate_goal_loop as v


def checkout_bytes(data: bytes, style: str) -> bytes:
    data = data.replace(b"\r\n", b"\n")
    if style == "crlf":
        return data.replace(b"\n", b"\r\n")
    if style == "mixed":
        return b"".join(
            line.replace(b"\n", b"\r\n") if index % 2 else line
            for index, line in enumerate(data.splitlines(keepends=True))
        )
    return data


class ContentHashTests(unittest.TestCase):
    def test_utf8_line_endings_are_equivalent(self):
        data = "合同与来源\nsecond line\nlast line\n".encode("utf-8")
        for style in ("lf", "crlf", "mixed"):
            with self.subTest(style=style):
                self.assertEqual(v.content_sha256_bytes(checkout_bytes(data, style)), v.sha256_bytes(data))

    def test_other_text_changes_still_change_hash(self):
        data = b"first line\nlast line\n"
        for changed in (b"changed line\nlast line\n", data.replace(b" ", b"  "), data.rstrip(b"\n"), b"\xef\xbb\xbf" + data):
            with self.subTest(changed=changed):
                self.assertNotEqual(v.content_sha256_bytes(data), v.content_sha256_bytes(changed))

    def test_binary_hashes_remain_exact(self):
        for data in (b"binary\0\r\ncontent", b"\xff\xfe\r\ncontent"):
            with self.subTest(data=data):
                self.assertEqual(v.content_sha256_bytes(data), v.sha256_bytes(data))
                self.assertNotEqual(v.content_sha256_bytes(data), v.content_sha256_bytes(data.replace(b"\r\n", b"\n")))

    def test_transaction_hashes_remain_exact(self):
        self.assertNotEqual(v.sha256_bytes(b"line\n"), v.sha256_bytes(b"line\r\n"))

    def test_evidence_ignores_only_text_line_endings(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            text = root / "source.ts"
            binary = root / "asset.bin"
            text.write_bytes(b"export const value = 1;\nsecond line\n")
            binary.write_bytes(b"\0resource\r\n")
            check = v.VerificationCheck("D1", "Directed", "regression", ("*.ts", "*.bin"))
            original = v.evidence_fingerprint(root, check)
            self.assertEqual(original[1:], (2, []))
            text.write_bytes(checkout_bytes(text.read_bytes(), "mixed"))
            self.assertEqual(v.evidence_fingerprint(root, check), original)
            text.write_bytes(text.read_bytes().replace(b"value = 1", b"value = 2"))
            self.assertNotEqual(v.evidence_fingerprint(root, check), original)
            text.write_bytes(b"export const value = 1;\nsecond line\n")
            binary.write_bytes(b"\0resource\n")
            self.assertNotEqual(v.evidence_fingerprint(root, check), original)


class CheckoutValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / ".git").mkdir()
        source_effort = Path(__file__).resolve().parents[1]
        source_root = v.find_repo_root(source_effort)
        self.effort = self.root / source_effort.relative_to(source_root)
        manifest_path = source_effort / "goal/contract-baseline.json"
        self.contract_paths = [entry["path"] for entry in json.loads(manifest_path.read_text(encoding="utf-8"))["files"]]
        paths = [source_root / relative for relative in self.contract_paths]
        paths.extend(path for path in (source_effort / "goal").rglob("*") if path.suffix in {".md", ".json"})
        self.originals = {}
        for source in paths:
            target = self.root / source.relative_to(source_root)
            target.parent.mkdir(parents=True, exist_ok=True)
            self.originals[target] = source.read_bytes()
            target.write_bytes(self.originals[target])

    def test_context_and_baseline_survive_checkout_conversion(self):
        expected_manifest = ctl.baseline_bytes(self.root, self.contract_paths)
        expected_output = None
        for style in ("lf", "crlf", "mixed"):
            with self.subTest(style=style):
                for path, data in self.originals.items():
                    path.write_bytes(checkout_bytes(data, style))
                self.assertEqual(v.validate(self.effort), [])
                self.assertEqual(ctl.baseline_bytes(self.root, self.contract_paths), expected_manifest)
                result = subprocess.run(
                    [sys.executable, "-X", "utf8", str(Path(ctl.__file__).resolve()), "context", str(self.effort)],
                    capture_output=True, text=True, encoding="utf-8", check=False,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("Validation: OK", result.stdout)
                if expected_output is None:
                    expected_output = result.stdout
                self.assertEqual(result.stdout, expected_output)

    def test_real_contract_drift_is_still_rejected(self):
        source = next(relative for relative in self.contract_paths if relative != v.repo_relative(self.effort / "implementation-plan.md", self.root))
        target = self.root / source
        target.write_bytes(checkout_bytes(target.read_bytes(), "crlf") + "\r\n实际合同变更\r\n".encode("utf-8"))
        errors = v.validate(self.effort)
        self.assertTrue(any("contract input drift detected" in error and source in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
