"""Promote the reviewed SHA and deploy release from manual GitHub CI."""

import sys

from portal_release import deploy, promote

if __name__ == "__main__":
    if len(sys.argv) != 1:
        raise SystemExit("This command accepts no arguments")
    promote()
    deploy("production")
