"""Persistent fixture HTTP server for manual CLI testing.

Run from the project root:
    PYTHONPATH=. python -m backend.scripts.fixture_server [port]

Serves the same 5-page synthetic site as smoke_local.py on the requested port
(default 8765) so that real network-shaped CLI workflows can hit it.

Stays foreground until Ctrl-C.
"""
from __future__ import annotations

import http.server
import socketserver
import sys

if __name__ == "__main__" and len(sys.argv) > 1:
    port = int(sys.argv[1])
else:
    port = 8765

# Reuse the fixture dictionary by spawning it as a child process would add
# complexity; just import the smoke test's pages.
sys.path.insert(0, ".")
from backend.scripts.smoke_local import PAGES  # noqa: E402


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        body = PAGES.get(path)
        if body is None:
            body = "<html><body><h1>404</h1</body</html>"
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args, **_kwargs):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
print(f"[fixture] serving on http://127.0.0.1:{port}/")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n[fixture] shutting down")
finally:
    httpd.shutdown()
