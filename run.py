from app import create_app
import sys
import os

# Ensure unbuffered output for real-time logging
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

app = create_app()


if __name__ == "__main__":
    # Respect FLASK_ENV config via app factory; enable reloader in development
    app.run(host="0.0.0.0", port=5000, debug=app.config.get("DEBUG", False))

