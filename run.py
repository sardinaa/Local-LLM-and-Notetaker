from app import create_app


app = create_app()


if __name__ == "__main__":
    # Respect FLASK_ENV config via app factory; enable reloader in development
    app.run(host="0.0.0.0", port=5000, debug=app.config.get("DEBUG", False))

