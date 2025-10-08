"""
TagsRepository: Handles all tag management, hierarchy, relations, and note associations.

Tables managed:
- tags: Tag definitions with hierarchy
- note_tags: Note-to-tag associations
- task_tags: Task-to-tag associations  
- job_tags: Job-to-tag associations
- tag_relations: Tag relationships (related tags)
- tag_dependencies: Tag dependencies (parent/child via multi-parent support)
"""

import logging
import sqlite3
import json
import re
from typing import Dict, Any, List, Optional
from .base import BaseRepository


def _normalize_name(s: str) -> str:
    """Normalize tag name for consistency and uniqueness checks."""
    if s is None:
        return ''
    # Normalize whitespace and case for uniqueness
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _slugify(s: str) -> str:
    """Convert string to URL-friendly slug, preserving hierarchical slashes."""
    s = (s or '').strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    # Preserve forward slashes for hierarchical tags
    s = re.sub(r"[^a-z0-9\-/]", "", s)
    s = re.sub(r"-+", "-", s).strip('-')
    return s or 'tag'


class TagsRepository(BaseRepository):
    """Repository for tag management and hierarchy."""

    def __init__(self, db_path: str):
        """
        Initialize the TagsRepository.

        Args:
            db_path: Path to the SQLite database file.
        """
        super().__init__(db_path)
        self.logger = logging.getLogger(__name__)

    # =========================
    # Tag CRUD operations
    # =========================

    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict]:
        """
        List tags with optional filtering and usage statistics.

        Args:
            q: Search query for name or aliases.
            limit: Maximum number of results.
            include_usage: If True, include usage count from note_tags.
            parent_id: Filter by parent ('root' for top-level, None for all, ID for specific parent).

        Returns:
            List of tag dictionaries with parsed aliases and sections.
        """
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                where: List[str] = []
                if q:
                    params.extend([f"%{q}%", f"%{q}%"])
                    where.append('(lower(name) LIKE lower(?) OR lower(COALESCE(aliases, "")) LIKE lower(?))')
                if parent_id is None:
                    pass
                elif parent_id == 'root':
                    where.append('parent_id IS NULL')
                else:
                    where.append('parent_id = ?')
                    params.append(parent_id)
                sql = 'SELECT * FROM tags'
                if where:
                    sql += ' WHERE ' + ' AND '.join(where)
                sql += ' ORDER BY name COLLATE NOCASE LIMIT ?'
                params.append(limit)
                cur = conn.execute(sql, params)
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                    if t.get('sections'):
                        try:
                            t['sections'] = json.loads(t['sections'])
                        except Exception:
                            t['sections'] = []
                if include_usage and tags:
                    ids = [t['id'] for t in tags]
                    qmarks = ','.join('?' for _ in ids)
                    cur = conn.execute(f'SELECT tag_id, COUNT(*) as cnt FROM note_tags WHERE tag_id IN ({qmarks}) GROUP BY tag_id', ids)
                    usage = {row['tag_id']: row['cnt'] for row in cur.fetchall()}
                    for t in tags:
                        t['usage'] = usage.get(t['id'], 0)
                return tags
        except sqlite3.Error as e:
            self.logger.error(f"Error listing tags: {e}")
            return []

    def get_tag(self, tag_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single tag by ID.

        Args:
            tag_id: ID of the tag to retrieve.

        Returns:
            Tag dictionary with parsed aliases and sections, or None if not found.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                row = cur.fetchone()
                if not row:
                    return None
                tag = dict(row)
                if tag.get('aliases'):
                    try:
                        tag['aliases'] = json.loads(tag['aliases'])
                    except Exception:
                        tag['aliases'] = []
                if tag.get('sections'):
                    try:
                        tag['sections'] = json.loads(tag['sections'])
                    except Exception:
                        tag['sections'] = []
                return tag
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag: {e}")
            return None

    def create_tag(self, tag: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Create a new tag with automatic slug generation and parent handling.

        Args:
            tag: Tag data including name, color, icon, description, parentId, aliases, etc.

        Returns:
            The created tag, or existing tag if name/alias already exists, or None if failed.
        """
        try:
            with self.get_connection() as conn:
                name = _normalize_name(tag.get('name', ''))
                if not name:
                    return None
                existing = self._get_tag_by_name_or_alias(conn, name)
                if existing:
                    return existing
                aliases = tag.get('aliases') or []
                if isinstance(aliases, str):
                    aliases = [aliases]
                # Normalize aliases
                aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                # Ensure aliases don't conflict with existing names
                for a in aliases:
                    if self._get_tag_by_name_or_alias(conn, a):
                        # Skip conflicting alias
                        aliases = [x for x in aliases if x != a]
                
                tag_id = tag.get('id') or name  # default stable id if provided else name; caller may pass ULID
                
                # Handle parent path and construct full slug
                parent_path = tag.get('parentPath', '').strip()
                parent_id = tag.get('parentId') or tag.get('parent_id')
                
                if parent_path and not parent_id:
                    # Find parent tag by slug or name
                    cur = conn.execute('SELECT id FROM tags WHERE slug = ? OR name = ?', (parent_path, parent_path))
                    parent_row = cur.fetchone()
                    if parent_row:
                        parent_id = parent_row['id']
                    else:
                        # If parent doesn't exist, create it as a root tag
                        parent_tag_id = _slugify(parent_path)
                        parent_slug = self._ensure_unique_slug(conn, parent_path)
                        conn.execute('''
                            INSERT INTO tags (id, name, slug, color)
                            VALUES (?, ?, ?, ?)
                        ''', (parent_tag_id, parent_path, parent_slug, 'default'))
                        parent_id = parent_tag_id
                
                if parent_path:
                    # Construct full slug: parentPath/tagName
                    full_slug = f"{parent_path.rstrip('/')}/{name}"
                else:
                    # Root level tag, just use the name
                    full_slug = name
                
                # Use provided slug or the constructed full slug
                slug = tag.get('slug') or full_slug
                slug = self._ensure_unique_slug(conn, slug)
                
                color = tag.get('color') or 'default'
                icon = tag.get('icon')
                description = tag.get('description')
                
                conn.execute('''
                    INSERT INTO tags (id, name, slug, color, icon, description, parent_id, aliases)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (tag_id, name, slug, color, icon, description, parent_id, json.dumps(aliases) if aliases else None))
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                row = cur.fetchone()
                return dict(row) if row else None
        except sqlite3.Error as e:
            self.logger.error(f"Error creating tag: {e}")
            return None

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Update an existing tag.

        Args:
            tag_id: ID of the tag to update.
            patch: Dictionary of fields to update (name, slug, color, icon, description, parentPath, aliases, etc.).

        Returns:
            The updated tag, or None if update failed.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                orig = cur.fetchone()
                if not orig:
                    return None
                updates: List[str] = []
                values: List[Any] = []
                if 'name' in patch and patch['name']:
                    name = _normalize_name(patch['name'])
                    # Check conflicts
                    cur = conn.execute('SELECT id FROM tags WHERE lower(name)=lower(?) AND id != ?', (name, tag_id))
                    if cur.fetchone():
                        # If conflict, ignore name change
                        pass
                    else:
                        updates.append('name = ?')
                        values.append(name)
                        # also refresh slug if not provided and we have a parent path
                        if 'slug' not in patch:
                            parent_path = patch.get('parentPath', '').strip()
                            if parent_path:
                                new_slug = f"{parent_path.rstrip('/')}/{name}"
                            else:
                                new_slug = name
                            new_slug = self._ensure_unique_slug(conn, new_slug, current_id=tag_id)
                            updates.append('slug = ?')
                            values.append(new_slug)
                
                # Handle parentPath separately from slug
                if 'parentPath' in patch:
                    parent_path = patch.get('parentPath', '').strip()
                    current_name = patch.get('name', orig['name'])
                    
                    # Find or create parent tag
                    parent_id = None
                    if parent_path:
                        cur = conn.execute('SELECT id FROM tags WHERE slug = ? OR name = ?', (parent_path, parent_path))
                        parent_row = cur.fetchone()
                        if parent_row:
                            parent_id = parent_row['id']
                        else:
                            # If parent doesn't exist, create it as a root tag
                            parent_tag_id = _slugify(parent_path)
                            parent_slug = self._ensure_unique_slug(conn, parent_path)
                            conn.execute('''
                                INSERT INTO tags (id, name, slug, color)
                                VALUES (?, ?, ?, ?)
                            ''', (parent_tag_id, parent_path, parent_slug, 'default'))
                            parent_id = parent_tag_id
                    
                    # Update parent_id
                    updates.append('parent_id = ?')
                    values.append(parent_id)
                    
                    # Update slug based on parent path
                    if parent_path:
                        new_slug = f"{parent_path.rstrip('/')}/{current_name}"
                    else:
                        new_slug = current_name
                    new_slug = self._ensure_unique_slug(conn, new_slug, current_id=tag_id)
                    updates.append('slug = ?')
                    values.append(new_slug)
                elif 'slug' in patch and patch['slug']:
                    updates.append('slug = ?')
                    values.append(self._ensure_unique_slug(conn, patch['slug'], current_id=tag_id))
                for key in ('color', 'icon', 'description'):
                    if key in patch:
                        updates.append(f'{key} = ?')
                        values.append(patch[key])
                if 'sections' in patch:
                    sections = patch.get('sections')
                    if sections is not None and not isinstance(sections, str):
                        try:
                            sections = json.dumps(sections)
                        except Exception:
                            sections = None
                    updates.append('sections = ?')
                    values.append(sections)
                if 'parentId' in patch or 'parent_id' in patch:
                    parent_id = patch.get('parentId', patch.get('parent_id'))
                    updates.append('parent_id = ?')
                    values.append(parent_id)
                if 'aliases' in patch:
                    aliases = patch.get('aliases') or []
                    if isinstance(aliases, str):
                        aliases = [aliases]
                    aliases = [_normalize_name(a) for a in aliases if _normalize_name(a)]
                    updates.append('aliases = ?')
                    values.append(json.dumps(aliases) if aliases else None)
                if not updates:
                    return dict(orig)
                values.append(tag_id)
                conn.execute(f'UPDATE tags SET {", ".join(updates)} WHERE id = ?', values)
                conn.commit()
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                return dict(cur.fetchone())
        except sqlite3.Error as e:
            self.logger.error(f"Error updating tag: {e}")
            return None

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        """
        Delete a tag with optional cascade and force options.

        Args:
            tag_id: ID of the tag to delete.
            cascade: If True, orphan children (set parent_id to NULL) instead of blocking.
            force: If True, remove all note associations before deleting.

        Returns:
            Dictionary with 'deleted' status and optional 'has_children', 'in_use', 'error' fields.
        """
        try:
            with self.get_connection() as conn:
                # Children check
                cur = conn.execute('SELECT COUNT(*) as c FROM tags WHERE parent_id = ?', (tag_id,))
                has_children = (cur.fetchone()['c'] or 0) > 0
                # Usage check
                cur = conn.execute('SELECT COUNT(*) as c FROM note_tags WHERE tag_id = ?', (tag_id,))
                in_use = (cur.fetchone()['c'] or 0) > 0
                if (has_children and not cascade) or (in_use and not force):
                    return { 'deleted': False, 'has_children': has_children, 'in_use': in_use }
                if cascade:
                    conn.execute('UPDATE tags SET parent_id = NULL WHERE parent_id = ?', (tag_id,))
                if force:
                    conn.execute('DELETE FROM note_tags WHERE tag_id = ?', (tag_id,))
                conn.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
                conn.commit()
                return { 'deleted': True }
        except sqlite3.Error as e:
            self.logger.error(f"Error deleting tag: {e}")
            return { 'deleted': False, 'error': str(e) }

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        """
        Merge multiple source tags into a target tag.

        Args:
            source_ids: List of source tag IDs to merge.
            target_id: Target tag ID to merge into.

        Returns:
            Dictionary with 'merged' status, 'target_id', 'sources_deleted', or 'error'.
        """
        try:
            with self.get_connection() as conn:
                # Ensure target exists
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (target_id,))
                target = cur.fetchone()
                if not target:
                    return { 'merged': False, 'error': 'target_not_found' }
                # Re-point note_tags
                qmarks = ','.join('?' for _ in source_ids)
                if source_ids:
                    conn.execute(f'UPDATE OR IGNORE note_tags SET tag_id = ? WHERE tag_id IN ({qmarks})', [target_id, *source_ids])
                    # Delete potential duplicates after OR IGNORE
                    conn.execute(f'DELETE FROM note_tags WHERE tag_id IN ({qmarks}) AND note_id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)', [*source_ids, target_id])
                # Merge aliases: add source names and aliases
                names = []
                aliases: List[str] = []
                for sid in source_ids:
                    cur = conn.execute('SELECT name, aliases FROM tags WHERE id = ?', (sid,))
                    r = cur.fetchone()
                    if r:
                        names.append(r['name'])
                        try:
                            al = json.loads(r['aliases']) if r['aliases'] else []
                        except Exception:
                            al = []
                        aliases.extend(al)
                try:
                    t_aliases = json.loads(target['aliases']) if target['aliases'] else []
                except Exception:
                    t_aliases = []
                merged_aliases = list({ _normalize_name(a) for a in (t_aliases + aliases + names) if _normalize_name(a) and _normalize_name(a).lower() != target['name'].lower() })
                conn.execute('UPDATE tags SET aliases = ? WHERE id = ?', (json.dumps(merged_aliases) if merged_aliases else None, target_id))
                # Delete sources
                if source_ids:
                    conn.execute(f'DELETE FROM tags WHERE id IN ({qmarks})', source_ids)
                conn.commit()
                return { 'merged': True, 'target_id': target_id, 'sources_deleted': source_ids }
        except sqlite3.Error as e:
            self.logger.error(f"Error merging tags: {e}")
            return { 'merged': False, 'error': str(e) }

    # =========================
    # Note-Tag Associations
    # =========================

    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        """
        Assign tags to a note (additive, includes parent tags automatically).

        Args:
            note_id: ID of the note.
            tag_ids: List of tag IDs to assign.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Expand with parent tags automatically
                expanded: List[str] = self._expand_with_parent_tags(conn, tag_ids)
                for tid in expanded:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error assigning tags to note: {e}")
            return False

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        """
        Replace all tags for a note (clears existing, then assigns new tags).

        Args:
            note_id: ID of the note.
            tag_ids: List of tag IDs to assign.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM note_tags WHERE note_id = ?', (note_id,))
                expanded: List[str] = self._expand_with_parent_tags(conn, tag_ids)
                for tid in expanded:
                    conn.execute('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', (note_id, tid))
                    conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (tid,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error replacing note tags: {e}")
            return False

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        """
        Get all tags associated with a note.

        Args:
            note_id: ID of the note.

        Returns:
            List of tag dictionaries.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('''
                    SELECT t.* FROM tags t
                    JOIN note_tags nt ON nt.tag_id = t.id
                    WHERE nt.note_id = ?
                    ORDER BY t.name COLLATE NOCASE
                ''', (note_id,))
                tags = [dict(row) for row in cur.fetchall()]
                for t in tags:
                    if t.get('aliases'):
                        try:
                            t['aliases'] = json.loads(t['aliases'])
                        except Exception:
                            t['aliases'] = []
                return tags
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tags for note: {e}")
            return []

    def search_notes_by_tags(self, any_of: List[str] = None, all_of: List[str] = None, none_of: List[str] = None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        """
        Search for notes by tag criteria.

        Args:
            any_of: Note must have at least one of these tags.
            all_of: Note must have all of these tags.
            none_of: Note must not have any of these tags.
            limit: Maximum number of results.
            cursor: Pagination cursor (not currently used).

        Returns:
            List of note IDs matching the criteria.
        """
        any_of = any_of or []
        all_of = all_of or []
        none_of = none_of or []
        try:
            with self.get_connection() as conn:
                params: List[Any] = []
                base = 'SELECT n.id FROM notes n'
                if any_of:
                    qmarks = ','.join('?' for _ in any_of)
                    base += f' WHERE EXISTS (SELECT 1 FROM note_tags nt1 WHERE nt1.note_id = n.id AND nt1.tag_id IN ({qmarks}))'
                    params.extend(any_of)
                if all_of:
                    for i, tid in enumerate(all_of):
                        base += f' AND EXISTS (SELECT 1 FROM note_tags ntA{i} WHERE ntA{i}.note_id = n.id AND ntA{i}.tag_id = ? )'
                        params.append(tid)
                if none_of:
                    qmarks = ','.join('?' for _ in none_of)
                    base += f' AND NOT EXISTS (SELECT 1 FROM note_tags ntN WHERE ntN.note_id = n.id AND ntN.tag_id IN ({qmarks}))'
                    params.extend(none_of)
                base += ' ORDER BY n.updated_at DESC LIMIT ?'
                params.append(limit)
                cur = conn.execute(base, params)
                return [row['id'] for row in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error searching notes by tags: {e}")
            return []

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        """
        Get comprehensive dashboard data for a tag.

        Args:
            tag_id: ID of the tag.

        Returns:
            Dictionary with tag info, usage stats, relations, etc.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                t = cur.fetchone()
                if not t:
                    return {}
                tag = dict(t)
                
                # Usage count
                cur = conn.execute('SELECT COUNT(*) as cnt FROM note_tags WHERE tag_id = ?', (tag_id,))
                usage = cur.fetchone()['cnt']
                
                # Siblings and children
                pid = tag.get('parent_id')
                siblings = []
                if pid:
                    cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? AND id != ?', (pid, tag_id))
                    siblings = [dict(r) for r in cur.fetchall()]
                
                cur = conn.execute('SELECT * FROM tags WHERE parent_id = ?', (tag_id,))
                children = [dict(r) for r in cur.fetchall()]
                
                # Relations
                cur = conn.execute('SELECT related_tag_id FROM tag_relations WHERE tag_id = ?', (tag_id,))
                related_ids = [r['related_tag_id'] for r in cur.fetchall()]
                
                # Dependencies
                cur = conn.execute('SELECT depends_on_tag_id FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                depends_on = [r['depends_on_tag_id'] for r in cur.fetchall()]
                
                tag['usage_count'] = usage
                tag['siblings'] = siblings
                tag['children'] = children
                tag['related'] = related_ids
                tag['depends_on'] = depends_on
                
                return tag
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag dashboard: {e}")
            return {}

    # =========================
    # Tag Relations
    # =========================

    def get_tag_relations(self, tag_id: str) -> List[str]:
        """
        Get all related tag IDs for a tag.

        Args:
            tag_id: ID of the tag.

        Returns:
            List of related tag IDs.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT related_tag_id FROM tag_relations WHERE tag_id = ?', (tag_id,))
                return [r['related_tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag relations: {e}")
            return []

    def set_tag_relations(self, tag_id: str, related_ids: List[str]) -> bool:
        """
        Set all related tags for a tag (replaces existing, creates symmetric relations).

        Args:
            tag_id: ID of the tag.
            related_ids: List of related tag IDs.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tag_relations WHERE tag_id = ?', (tag_id,))
                for rid in related_ids:
                    if rid == tag_id:
                        continue
                    conn.execute('INSERT OR IGNORE INTO tag_relations (tag_id, related_tag_id) VALUES (?,?)', (tag_id, rid))
                    # Ensure symmetric relation for convenience
                    conn.execute('INSERT OR IGNORE INTO tag_relations (tag_id, related_tag_id) VALUES (?,?)', (rid, tag_id))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error setting tag relations: {e}")
            return False

    # =========================
    # Tag Dependencies
    # =========================

    def get_tag_dependencies(self, tag_id: str) -> List[str]:
        """
        Get all tag IDs that this tag depends on.

        Args:
            tag_id: ID of the tag.

        Returns:
            List of dependency tag IDs.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT depends_on_tag_id FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                return [r['depends_on_tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag dependencies: {e}")
            return []

    def set_tag_dependencies(self, tag_id: str, depends_ids: List[str]) -> bool:
        """
        Set all dependencies for a tag (replaces existing).

        Args:
            tag_id: ID of the tag.
            depends_ids: List of dependency tag IDs.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                for did in depends_ids:
                    if did == tag_id:
                        continue
                    conn.execute('INSERT OR IGNORE INTO tag_dependencies (tag_id, depends_on_tag_id) VALUES (?,?)', (tag_id, did))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error setting tag dependencies: {e}")
            return False

    # =========================
    # Multi-Parent Tag Support
    # =========================

    def get_tag_parents(self, tag_id: str) -> List[str]:
        """
        Get all parent IDs for a tag (multi-parent support via dependencies).

        Args:
            tag_id: ID of the tag.

        Returns:
            List of parent tag IDs.
        """
        try:
            with self.get_connection() as conn:
                # Use tag_dependencies to store parent relationships
                # depends_on_tag_id represents parent tags
                cur = conn.execute('SELECT depends_on_tag_id FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                return [r['depends_on_tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag parents: {e}")
            return []

    def add_tag_parent(self, tag_id: str, parent_id: str) -> bool:
        """
        Add a parent to a tag (for multi-parent support, checks for cycles).

        Args:
            tag_id: ID of the tag.
            parent_id: ID of the parent tag to add.

        Returns:
            True if successful, False if cycle detected or failed.
        """
        try:
            with self.get_connection() as conn:
                if tag_id == parent_id:
                    return False
                # Check for cycles
                if self._would_create_cycle(conn, tag_id, parent_id):
                    self.logger.warning(f"Adding parent {parent_id} to {tag_id} would create a cycle")
                    return False
                conn.execute('INSERT OR IGNORE INTO tag_dependencies (tag_id, depends_on_tag_id) VALUES (?,?)', (tag_id, parent_id))
                conn.execute('UPDATE tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (parent_id,))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error adding tag parent: {e}")
            return False

    def remove_tag_parent(self, tag_id: str, parent_id: str) -> bool:
        """
        Remove a parent from a tag (for multi-parent support).

        Args:
            tag_id: ID of the tag.
            parent_id: ID of the parent tag to remove.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                conn.execute('DELETE FROM tag_dependencies WHERE tag_id = ? AND depends_on_tag_id = ?', (tag_id, parent_id))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error removing tag parent: {e}")
            return False

    def set_tag_parents(self, tag_id: str, parent_ids: List[str]) -> bool:
        """
        Set all parents for a tag (replaces existing parents, checks for cycles).

        Args:
            tag_id: ID of the tag.
            parent_ids: List of parent tag IDs.

        Returns:
            True if successful, False otherwise.
        """
        try:
            with self.get_connection() as conn:
                # Clear existing parents
                conn.execute('DELETE FROM tag_dependencies WHERE tag_id = ?', (tag_id,))
                # Add new parents
                for parent_id in parent_ids:
                    if parent_id == tag_id:
                        continue
                    # Check for cycles
                    if self._would_create_cycle(conn, tag_id, parent_id):
                        self.logger.warning(f"Skipping parent {parent_id} for {tag_id} - would create cycle")
                        continue
                    conn.execute('INSERT OR IGNORE INTO tag_dependencies (tag_id, depends_on_tag_id) VALUES (?,?)', (tag_id, parent_id))
                conn.commit()
                return True
        except sqlite3.Error as e:
            self.logger.error(f"Error setting tag parents: {e}")
            return False

    def get_tag_children(self, tag_id: str) -> List[str]:
        """
        Get all direct children of a tag (tags that have this tag as a parent).

        Args:
            tag_id: ID of the tag.

        Returns:
            List of child tag IDs.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT tag_id FROM tag_dependencies WHERE depends_on_tag_id = ?', (tag_id,))
                return [r['tag_id'] for r in cur.fetchall()]
        except sqlite3.Error as e:
            self.logger.error(f"Error getting tag children: {e}")
            return []

    # =========================
    # Tag Dashboard
    # =========================

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        """
        Get comprehensive dashboard data for a tag.

        Args:
            tag_id: ID of the tag.

        Returns:
            Dictionary with tag, usage, siblings, children, coTags, recentNotes.
        """
        try:
            with self.get_connection() as conn:
                cur = conn.execute('SELECT * FROM tags WHERE id = ?', (tag_id,))
                t = cur.fetchone()
                if not t:
                    return {}
                tag = dict(t)
                # usage
                cur = conn.execute('SELECT COUNT(*) as cnt FROM note_tags WHERE tag_id = ?', (tag_id,))
                usage = cur.fetchone()['cnt']
                # siblings and children
                pid = tag.get('parent_id')
                siblings = []
                if pid:
                    cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? AND id != ? ORDER BY name COLLATE NOCASE', (pid, tag_id))
                    siblings = [dict(r) for r in cur.fetchall()]
                cur = conn.execute('SELECT * FROM tags WHERE parent_id = ? ORDER BY name COLLATE NOCASE', (tag_id,))
                children = [dict(r) for r in cur.fetchall()]
                # recent notes
                cur = conn.execute('''
                    SELECT n.id, n.name, n.updated_at FROM notes n
                    JOIN note_tags nt ON nt.note_id = n.id
                    WHERE nt.tag_id = ? ORDER BY n.updated_at DESC LIMIT 50
                ''', (tag_id,))
                recent_notes = [dict(r) for r in cur.fetchall()]
                # co-occurring tags (simple co-count)
                cur = conn.execute('''
                    SELECT nt2.tag_id as tag_id, COUNT(*) as cnt
                    FROM note_tags nt1
                    JOIN note_tags nt2 ON nt1.note_id = nt2.note_id AND nt2.tag_id != nt1.tag_id
                    WHERE nt1.tag_id = ?
                    GROUP BY nt2.tag_id
                    ORDER BY cnt DESC LIMIT 10
                ''', (tag_id,))
                co_ids = [r['tag_id'] for r in cur.fetchall()]
                co_tags = []
                if co_ids:
                    qmarks = ','.join('?' for _ in co_ids)
                    cur = conn.execute(f'SELECT * FROM tags WHERE id IN ({qmarks})', co_ids)
                    co_tags = [dict(r) for r in cur.fetchall()]
                return {
                    'tag': tag,
                    'usage': usage,
                    'siblings': siblings,
                    'children': children,
                    'coTags': co_tags,
                    'recentNotes': recent_notes,
                }
        except sqlite3.Error as e:
            self.logger.error(f"Error building tag dashboard: {e}")
            return {}

    # =========================
    # Helper Methods
    # =========================

    def _expand_with_parent_tags(self, conn: sqlite3.Connection, tag_ids: List[str]) -> List[str]:
        """
        Expand a list of tag IDs to include all parent tags up the hierarchy.

        Args:
            conn: Database connection.
            tag_ids: List of tag IDs to expand.

        Returns:
            Expanded list including all parent tags.
        """
        seen = set(tag_ids)
        to_process = list(tag_ids)
        while to_process:
            tid = to_process.pop()
            cur = conn.execute('SELECT parent_id FROM tags WHERE id = ?', (tid,))
            row = cur.fetchone()
            if row and row['parent_id'] and row['parent_id'] not in seen:
                seen.add(row['parent_id'])
                to_process.append(row['parent_id'])
        return list(seen)

    def _get_tag_by_name_or_alias(self, conn: sqlite3.Connection, name: str) -> Optional[Dict]:
        """
        Find a tag by name or alias (case-insensitive).

        Args:
            conn: Database connection.
            name: Name or alias to search for.

        Returns:
            Tag dictionary if found, None otherwise.
        """
        norm = _normalize_name(name)
        if not norm:
            return None
        cur = conn.execute('SELECT * FROM tags WHERE lower(name) = lower(?)', (norm,))
        row = cur.fetchone()
        if row:
            return dict(row)
        # Search in aliases JSON (stored as simple JSON array of strings)
        # SQLite json_each exists if JSON1 is enabled; fallback to LIKE search then verify in Python
        try:
            cur = conn.execute('''
                SELECT t.* FROM tags t, json_each(t.aliases)
                WHERE lower(json_each.value) = lower(?)
            ''', (norm,))
            row = cur.fetchone()
            return dict(row) if row else None
        except sqlite3.Error:
            # Fallback: scan
            cur = conn.execute('SELECT * FROM tags WHERE aliases IS NOT NULL')
            for r in cur.fetchall():
                try:
                    aliases = json.loads(r['aliases']) if r['aliases'] else []
                except Exception:
                    aliases = []
                if any(a.lower() == norm.lower() for a in aliases):
                    return dict(r)
            return None

    def _ensure_unique_slug(self, conn: sqlite3.Connection, base: str, current_id: Optional[str] = None) -> str:
        """
        Ensure a slug is unique by appending numbers if needed.

        Args:
            conn: Database connection.
            base: Base slug string.
            current_id: Optional current tag ID (for updates, to exclude self).

        Returns:
            Unique slug string.
        """
        slug = _slugify(base)
        candidate = slug or 'tag'
        i = 1
        while True:
            if current_id:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ? AND id != ?', (candidate, current_id))
            else:
                cur = conn.execute('SELECT id FROM tags WHERE slug = ?', (candidate,))
            if cur.fetchone() is None:
                return candidate
            i += 1
            candidate = f"{slug}-{i}"

    def _would_create_cycle(self, conn: sqlite3.Connection, tag_id: str, new_parent_id: str) -> bool:
        """
        Check if adding a parent would create a cycle in the tag hierarchy.

        Args:
            conn: Database connection.
            tag_id: ID of the tag.
            new_parent_id: ID of the proposed parent.

        Returns:
            True if cycle would be created, False otherwise.
        """
        # BFS to check if tag_id is an ancestor of new_parent_id
        visited = set()
        queue = [new_parent_id]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            if current == tag_id:
                return True  # Cycle detected
            visited.add(current)
            # Get all parents of current
            cur = conn.execute('SELECT depends_on_tag_id FROM tag_dependencies WHERE tag_id = ?', (current,))
            for row in cur.fetchall():
                parent = row['depends_on_tag_id']
                if parent not in visited:
                    queue.append(parent)
        return False

