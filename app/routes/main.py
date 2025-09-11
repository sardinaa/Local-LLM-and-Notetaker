from flask import Blueprint, render_template, send_from_directory


main_bp = Blueprint("main", __name__)


@main_bp.get("/")
def index():
    return render_template("index.html")


@main_bp.get("/mobile-test")
def mobile_test():
    return send_from_directory(".", "mobile-test.html")

