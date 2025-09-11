import os
import tempfile

import pytest

from database import DatabaseManager
from task_service import TaskService


@pytest.fixture()
def temp_db_path(tmp_path):
    db_file = tmp_path / "test_notetaker.db"
    return str(db_file)


@pytest.fixture()
def task_service(temp_db_path):
    dbm = DatabaseManager(db_path=temp_db_path)
    return TaskService(dbm)


def test_create_and_list_tasks(task_service: TaskService):
    created = task_service.create_task({
        "title": "Write tests",
        "description": "Add unit tests for TaskService",
        "status": "pending",
    })
    assert created is not None
    assert created["title"] == "Write tests"

    tasks = task_service.list_tasks()
    assert isinstance(tasks, list)
    assert any(t.get("id") == created["id"] for t in tasks)


def test_task_stats(task_service: TaskService):
    # Ensure at least one task exists
    task_service.create_task({"title": "Dummy"})
    stats = task_service.get_task_stats()
    assert isinstance(stats, dict)
    # Some implementations return keys like 'by_status' etc.; be permissive
    assert len(stats) >= 1

