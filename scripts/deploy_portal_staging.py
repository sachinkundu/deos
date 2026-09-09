"""Deploy a clean main-contained commit to the fixed staging portal."""

import sys

from portal_release import deploy

if __name__ == "__main__":
    if len(sys.argv) != 1:
        raise SystemExit("This command accepts no arguments")
    deploy("staging")
