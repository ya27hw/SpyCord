import argparse
import threading
from pathlib import Path

from log_viewer import create_server
from monitor import create_client


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run the Discord guild monitor and live log viewer together."
    )
    parser.add_argument("-t", "--token", required=True, help="Discord bot token")
    parser.add_argument(
        "-g",
        "--guild-id",
        dest="guild_id",
        type=int,
        required=True,
        help="Guild ID to monitor",
    )
    parser.add_argument(
        "-l",
        "--log-file",
        default="logs/messages.log",
        help="Path to the shared log file",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for the web viewer")
    parser.add_argument("--port", type=int, default=8765, help="Port for the web viewer")
    parser.add_argument(
        "--limit",
        type=int,
        default=250,
        help="Maximum number of messages shown in the selected channel",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    log_path = Path(args.log_file).resolve()

    server = create_server(args.host, args.port, log_path, args.limit)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print(f"Viewer running at http://{args.host}:{args.port}")
    print(f"Writing and reading logs from: {log_path}")

    client = create_client(args.guild_id, str(log_path))

    try:
        client.run(args.token)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
