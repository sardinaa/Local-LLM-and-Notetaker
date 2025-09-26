"""Repository layer encapsulating database operations per domain.

During the migration, repositories can delegate to the existing
DatabaseManager to avoid moving SQL all at once.
"""

