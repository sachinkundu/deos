"""Print only current deployment and canary observations from a saved read-back."""
import json
import sys
from pathlib import Path

status = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "deployments": status["deployments"],
    "containers": status["containers"],
    "run": status["run"],
    "latest_attempt": status["implementation_attempts"][:1],
    "latest_try": status["implementation_tries"][:1],
    "recovered_input": status["recovered_input"],
    "resource_recoveries": status.get("resource_recoveries", []),
    "progress": status["task_progress"][:1],
    "implementation": status["implementation"],
}, indent=2))
