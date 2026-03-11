import subprocess
import sys


def main() -> None:
    """Start the ARQ worker."""
    subprocess.run(
        [sys.executable, "-m", "arq", "worker.main.WorkerSettings"],
        check=True,
    )


if __name__ == "__main__":
    main()
