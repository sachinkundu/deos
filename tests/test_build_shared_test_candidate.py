"""Candidate output must be tied to a clean, exact source checkout."""

import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_shared_test_candidate import clean_commit


def git(root, *args):
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True,
                          text=True).stdout.strip()


def test_clean_candidate_requires_saved_commit_and_no_source_edit(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "config", "user.email", "test@example.com")
    git(tmp_path, "config", "user.name", "Test")
    file = tmp_path / "app.txt"
    file.write_text("saved")
    git(tmp_path, "add", "app.txt")
    git(tmp_path, "commit", "-qm", "saved")
    sha = git(tmp_path, "rev-parse", "HEAD")
    clean_commit(tmp_path, sha)
    with pytest.raises(ValueError, match="saved commit"):
        clean_commit(tmp_path, "0" * 40)
    file.write_text("changed")
    with pytest.raises(ValueError, match="source changes"):
        clean_commit(tmp_path, sha)
