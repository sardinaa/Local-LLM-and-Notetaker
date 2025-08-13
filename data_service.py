from typing import Dict, List, Optional, Any
import json
import time
from database import DatabaseManager
import logging

class DataService:
    """High-level data service with caching and improved abstractions."""
    
    def __init__(self, db_path: str = "instance/notetaker.db"):
        self.db = DatabaseManager(db_path)
        self._cache = {}
        self._cache_ttl = {}
        self.cache_duration = 300  # 5 minutes default TTL
    
    def _cache_key(self, *args) -> str:
        """Generate a cache key from arguments."""
        return "|".join(str(arg) for arg in args)
    
    def _is_cache_valid(self, key: str) -> bool:
        """Check if cache entry is still valid."""
        if key not in self._cache_ttl:
            return False
        return time.time() - self._cache_ttl[key] < self.cache_duration
    
    def _set_cache(self, key: str, value: Any):
        """Set a cache entry with timestamp."""
        self._cache[key] = value
        self._cache_ttl[key] = time.time()
    
    def _get_cache(self, key: str) -> Optional[Any]:
        """Get a cache entry if valid."""
        if self._is_cache_valid(key):
            return self._cache.get(key)
        return None
    
    def _invalidate_cache(self, pattern: str = None):
        """Invalidate cache entries matching a pattern."""
        if pattern is None:
            self._cache.clear()
            self._cache_ttl.clear()
        else:
            keys_to_remove = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_remove:
                self._cache.pop(key, None)
                self._cache_ttl.pop(key, None)
    
    def _cached_call(self, cache_key_prefix: str, func, *args, **kwargs):
        """Helper method for caching function results."""
        # Generate cache key
        cache_key = self._cache_key(cache_key_prefix, *args, *kwargs.values())
        
        # Try to get from cache
        cached_result = self._get_cache(cache_key)
        if cached_result is not None:
            return cached_result
        
        # Execute function and cache result
        result = func(*args, **kwargs)
        self._set_cache(cache_key, result)
        return result
    
    def get_tree(self) -> List[Dict]:
        """Get the complete tree structure with caching."""
        return self._cached_call("tree", self._get_tree_uncached)
    
    def _get_tree_uncached(self) -> List[Dict]:
        """Internal method to get tree without caching."""
        tree = self.db.get_tree()
        
        # Enrich nodes with content for better performance
        for node in self._flatten_tree(tree):
            if node['type'] == 'note':
                content = self.db.get_note_content(node['id'])
                if content:
                    node['content'] = content['content']
            elif node['type'] == 'chat':
                messages = self.db.get_chat_messages(node['id'])
                node['content'] = {'messages': messages}
        
        return tree
    
    def _flatten_tree(self, tree: List[Dict]) -> List[Dict]:
        """Flatten tree structure for easier processing."""
        nodes = []
        for node in tree:
            nodes.append(node)
            if 'children' in node:
                nodes.extend(self._flatten_tree(node['children']))
        return nodes
    
    def create_node(self, node_id: str, name: str, node_type: str, 
                   parent_id: Optional[str] = None, **kwargs) -> bool:
        """Create a new node and invalidate relevant caches."""
        success = self.db.create_node(node_id, name, node_type, parent_id, 
                                     kwargs.get('customization'))
        if success:
            self._invalidate_cache("tree")
            self._invalidate_cache("recent")
        return success
    
    def update_node(self, node_id: str, **kwargs) -> bool:
        """Update a node and invalidate relevant caches."""
        success = self.db.update_node(node_id, **kwargs)
        if success:
            self._invalidate_cache("tree")
            self._invalidate_cache("recent")
            self._invalidate_cache(f"node_{node_id}")
        return success
    
    def delete_node(self, node_id: str) -> bool:
        """Delete a node and invalidate relevant caches."""
        success = self.db.delete_node(node_id)
        if success:
            self._invalidate_cache()  # Clear all cache for safety
        return success
    
    def save_note(self, node_id: str, title: str, content: Any) -> bool:
        """Save note with both node title and content."""
        # Update node name
        node_success = self.db.update_node(node_id, name=title)
        
        # Ensure content is properly structured
        if isinstance(content, dict):
            content_dict = content
        else:
            # If content is not a dict, wrap it
            content_dict = {"content": content}
        
        # Save note content
        content_success = self.db.save_note_content(node_id, content_dict)
        
        if node_success and content_success:
            self._invalidate_cache("tree")
            self._invalidate_cache(f"note_{node_id}")
            return True
        return False
    
    def get_note(self, node_id: str) -> Optional[Dict]:
        """Get a complete note with metadata."""
        return self._cached_call("note", self._get_note_uncached, node_id)
    
    def _get_note_uncached(self, node_id: str) -> Optional[Dict]:
        """Internal method to get note without caching."""
        node = self.db.get_node(node_id)
        if not node or node['type'] != 'note':
            return None
        
        content_data = self.db.get_note_content(node_id)
        if content_data:
            node.update(content_data)
        
        return node
    
    def save_chat(self, node_id: str, messages: List[Dict]) -> bool:
        """Save chat messages."""
        success = self.db.save_chat_messages(node_id, messages)
        if success:
            self._invalidate_cache(f"chat_{node_id}")
            self._invalidate_cache("tree")
        return success
    
    def get_chat(self, node_id: str) -> Optional[Dict]:
        """Get a complete chat with messages."""
        return self._cached_call("chat", self._get_chat_uncached, node_id)
    
    def _get_chat_uncached(self, node_id: str) -> Optional[Dict]:
        """Internal method to get chat without caching."""
        node = self.db.get_node(node_id)
        if not node or node['type'] != 'chat':
            return None
        
        messages = self.db.get_chat_messages(node_id)
        node['content'] = {'messages': messages}
        
        return node

    def touch_chat(self, node_id: str) -> bool:
        """Mark a chat as recently used and invalidate caches."""
        success = self.db.touch_chat(node_id)
        if success:
            self._invalidate_cache("tree")
            self._invalidate_cache(f"chat_{node_id}")
        return success
    
    def search_content(self, query: str, content_type: str = 'all') -> List[Dict]:
        """Search content with caching."""
        return self._cached_call("search", self.db.search_content, query, content_type)
    
    def get_recent_items(self, limit: int = 10) -> List[Dict]:
        """Get recently updated items with caching."""
        return self._cached_call("recent", self.db.get_recent_items, limit)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get application statistics."""
        cache_key = self._cache_key("stats")
        cached_stats = self._get_cache(cache_key)
        if cached_stats:
            return cached_stats
        
        tree = self.get_tree()
        flat_nodes = self._flatten_tree(tree)
        
        stats = {
            'total_nodes': len(flat_nodes),
            'notes_count': len([n for n in flat_nodes if n['type'] == 'note']),
            'chats_count': len([n for n in flat_nodes if n['type'] == 'chat']),
            'folders_count': len([n for n in flat_nodes if n['type'] == 'folder']),
            'recent_activity': self.get_recent_items(5)
        }
        
        self._set_cache(cache_key, stats)
        return stats
    
    def export_data(self) -> Dict[str, Any]:
        """Export all data for backup purposes."""
        return {
            'tree': self.get_tree(),
            'timestamp': time.time(),
            'version': '2.0'
        }
    
    def import_data(self, data: Dict[str, Any]) -> bool:
        """Import data from backup."""
        try:
            # Clear existing data
            self._invalidate_cache()
            
            if 'tree' in data:
                # Process tree data
                tree = data['tree']
                for node in self._flatten_tree(tree):
                    self.create_node(
                        node['id'],
                        node['name'],
                        node['type'],
                        node.get('parent_id'),
                        customization=node.get('customization')
                    )
                    
                    # Save content based on type
                    if node['type'] == 'note' and 'content' in node:
                        self.db.save_note_content(node['id'], node['content'])
                    elif node['type'] == 'chat' and 'content' in node:
                        messages = node['content'].get('messages', [])
                        self.db.save_chat_messages(node['id'], messages)
            
            return True
        except Exception as e:
            logging.error(f"Error importing data: {e}")
            return False
    
    def migrate_from_json_files(self, tree_file: str, chats_file: str) -> bool:
        """Migrate from old JSON file format."""
        try:
            success = self.db.migrate_from_json(tree_file, chats_file)
            if success:
                self._invalidate_cache()  # Clear cache after migration
            return success
        except Exception as e:
            logging.error(f"Error during migration: {e}")
            return False
    
    def health_check(self) -> Dict[str, Any]:
        """Perform a health check on the data service."""
        try:
            # Test database connection
            test_tree = self.db.get_tree()
            
            # Test cache
            cache_working = len(self._cache) >= 0
            
            return {
                'database_connected': True,
                'cache_working': cache_working,
                'cache_entries': len(self._cache),
                'total_nodes': len(self._flatten_tree(test_tree)),
                'status': 'healthy'
            }
        except Exception as e:
            return {
                'database_connected': False,
                'cache_working': False,
                'error': str(e),
                'status': 'unhealthy'
            }
    
    def move_node(self, node_id: str, new_parent_id: Optional[str] = None, new_sort_order: Optional[int] = None) -> bool:
        """Move a node to a new parent and/or position."""
        success = self.db.move_node(node_id, new_parent_id, new_sort_order)
        if success:
            self._invalidate_cache("tree")
            self._invalidate_cache("recent")
            self._invalidate_cache(f"node_{node_id}")
        return success

    # =========================
    # Tag System - Service APIs
    # =========================
    def list_tags(self, q: Optional[str] = None, limit: int = 50, include_usage: bool = False, parent_id: Optional[str] = None) -> List[Dict]:
        return self.db.list_tags(q, limit, include_usage, parent_id)

    def create_tag(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        tag = self.db.create_tag(payload)
        # Invalidate caches touching tags if we later add caching
        return tag

    def update_tag(self, tag_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self.db.update_tag(tag_id, patch)

    def delete_tag(self, tag_id: str, cascade: bool = False, force: bool = False) -> Dict[str, Any]:
        return self.db.delete_tag(tag_id, cascade, force)

    def merge_tags(self, source_ids: List[str], target_id: str) -> Dict[str, Any]:
        return self.db.merge_tags(source_ids, target_id)

    def assign_tags_to_note(self, note_id: str, tag_ids: List[str]) -> bool:
        return self.db.assign_tags_to_note(note_id, tag_ids)

    def replace_note_tags(self, note_id: str, tag_ids: List[str]) -> bool:
        return self.db.replace_note_tags(note_id, tag_ids)

    def get_tags_for_note(self, note_id: str) -> List[Dict[str, Any]]:
        return self.db.get_tags_for_note(note_id)

    def search_notes_by_tags(self, any_of=None, all_of=None, none_of=None, limit: int = 50, cursor: Optional[str] = None) -> List[str]:
        return self.db.search_notes_by_tags(any_of, all_of, none_of, limit, cursor)

    def get_tag_dashboard(self, tag_id: str) -> Dict[str, Any]:
        return self.db.get_tag_dashboard(tag_id)
