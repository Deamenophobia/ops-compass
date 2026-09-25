"""Small non-trading workload for a deployment/rollback exercise."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({'service': 'ops-compass-sandbox', 'revision': os.environ['REVISION']}).encode()
        self.send_response(200 if self.path == '/health' else 404)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
