#!/usr/bin/env python3
"""
Performance testing script for LLM-Notetaker data storage improvements
Compares the old JSON-based system with the new SQLite-based system
"""

import time
import json
import os
import tempfile
import random
import string
from typing import List, Dict
from data_service import DataService

def generate_test_data(num_nodes: int = 1000) -> Dict:
    """Generate test data for performance testing."""
    def random_string(length=10):
        return ''.join(random.choices(string.ascii_letters, k=length))
    
    def create_node(node_id, name, node_type, parent_id=None):
        return {
            'id': str(node_id),
            'name': name,
            'type': node_type,
            'parent_id': parent_id,
            'content': {
                'blocks': [
                    {'type': 'paragraph', 'data': {'text': random_string(100)}}
                    for _ in range(random.randint(1, 5))
                ]
            } if node_type == 'note' else {'messages': [
                {'text': random_string(50), 'sender': 'user'},
                {'text': random_string(100), 'sender': 'bot'}
            ]} if node_type == 'chat' else None,
            'children': []
        }
    
    nodes = []
    
    # Create root folders
    for i in range(10):
        folder = create_node(i, f"Folder {i}", "folder")
        
        # Add notes and chats to each folder
        for j in range(num_nodes // 20):
            note_id = i * 1000 + j
            note = create_node(note_id, f"Note {note_id}", "note", str(i))
            folder['children'].append(note)
            
            if j % 3 == 0:  # Every third item is a chat
                chat_id = i * 1000 + j + 500
                chat = create_node(chat_id, f"Chat {chat_id}", "chat", str(i))
                folder['children'].append(chat)
        
        nodes.append(folder)
    
    return nodes

class JSONStorage:
    """Simple JSON-based storage for comparison."""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.data = []
    
    def save_data(self, data: List[Dict]):
        with open(self.file_path, 'w') as f:
            json.dump(data, f)
    
    def load_data(self) -> List[Dict]:
        if os.path.exists(self.file_path):
            with open(self.file_path, 'r') as f:
                return json.load(f)
        return []
    
    def find_node(self, node_id: str, nodes: List[Dict] = None) -> Dict:
        if nodes is None:
            nodes = self.load_data()
        
        for node in nodes:
            if node['id'] == node_id:
                return node
            if 'children' in node:
                result = self.find_node(node_id, node['children'])
                if result:
                    return result
        return None
    
    def update_node(self, node_id: str, updates: Dict):
        data = self.load_data()
        
        def update_recursive(nodes):
            for node in nodes:
                if node['id'] == node_id:
                    node.update(updates)
                    return True
                if 'children' in node:
                    if update_recursive(node['children']):
                        return True
            return False
        
        if update_recursive(data):
            self.save_data(data)

def benchmark_operation(name: str, operation, *args, **kwargs):
    """Benchmark a single operation."""
    start_time = time.time()
    result = operation(*args, **kwargs)
    end_time = time.time()
    duration = end_time - start_time
    print(f"{name}: {duration:.4f} seconds")
    return result, duration

def run_performance_tests():
    """Run comprehensive performance tests."""
    print("=== LLM-Notetaker Performance Tests ===\n")
    
    # Generate test data
    print("Generating test data...")
    test_data = generate_test_data(500)  # 500 nodes for testing
    total_nodes = sum(1 + len(node.get('children', [])) for node in test_data)
    print(f"Generated {total_nodes} total nodes\n")
    
    # Setup test databases
    with tempfile.TemporaryDirectory() as temp_dir:
        json_file = os.path.join(temp_dir, 'test.json')
        sqlite_db = os.path.join(temp_dir, 'test.db')
        
        # Initialize storage systems
        json_storage = JSONStorage(json_file)
        sqlite_storage = DataService(sqlite_db)
        
        print("=== Initial Data Loading ===")
        
        # Test JSON loading
        json_storage.save_data(test_data)
        _, json_load_time = benchmark_operation(
            "JSON load time", json_storage.load_data
        )
        
        # Test SQLite loading
        def populate_sqlite():
            def add_nodes(nodes, parent_id=None):
                for node in nodes:
                    sqlite_storage.create_node(
                        node['id'], node['name'], node['type'], parent_id
                    )
                    if node['type'] == 'note' and node.get('content'):
                        sqlite_storage.db.save_note_content(node['id'], node['content'])
                    elif node['type'] == 'chat' and node.get('content'):
                        sqlite_storage.db.save_chat_messages(
                            node['id'], node['content']['messages']
                        )
                    
                    if 'children' in node:
                        add_nodes(node['children'], node['id'])
            
            add_nodes(test_data)
        
        _, sqlite_load_time = benchmark_operation(
            "SQLite populate time", populate_sqlite
        )
        
        print("\n=== Data Retrieval Tests ===")
        
        # Test full tree retrieval
        _, json_tree_time = benchmark_operation(
            "JSON full tree retrieval", json_storage.load_data
        )
        
        _, sqlite_tree_time = benchmark_operation(
            "SQLite full tree retrieval", sqlite_storage.get_tree
        )
        
        print("\n=== Search Tests ===")
        
        # Test node finding
        test_node_id = test_data[0]['children'][0]['id'] if test_data[0]['children'] else test_data[0]['id']
        
        _, json_find_time = benchmark_operation(
            "JSON node search", json_storage.find_node, test_node_id
        )
        
        _, sqlite_find_time = benchmark_operation(
            "SQLite node search", sqlite_storage.db.get_node, test_node_id
        )
        
        print("\n=== Update Tests ===")
        
        # Test node updates
        updates = {'name': 'Updated Node Name'}
        
        _, json_update_time = benchmark_operation(
            "JSON node update", json_storage.update_node, test_node_id, updates
        )
        
        _, sqlite_update_time = benchmark_operation(
            "SQLite node update", sqlite_storage.update_node, test_node_id, **updates
        )
        
        print("\n=== Cache Performance Tests ===")
        
        # Test cached retrieval (SQLite only)
        _, sqlite_cached_time1 = benchmark_operation(
            "SQLite cached tree (1st call)", sqlite_storage.get_tree
        )
        
        _, sqlite_cached_time2 = benchmark_operation(
            "SQLite cached tree (2nd call)", sqlite_storage.get_tree
        )
        
        print("\n=== Memory Usage Tests ===")
        
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_before = process.memory_info().rss / 1024 / 1024  # MB
        
        # Load large dataset multiple times
        for i in range(10):
            json_storage.load_data()
        
        memory_after_json = process.memory_info().rss / 1024 / 1024  # MB
        
        for i in range(10):
            sqlite_storage.get_tree()
        
        memory_after_sqlite = process.memory_info().rss / 1024 / 1024  # MB
        
        print(f"Memory usage baseline: {memory_before:.1f} MB")
        print(f"Memory after JSON operations: {memory_after_json:.1f} MB (+{memory_after_json - memory_before:.1f} MB)")
        print(f"Memory after SQLite operations: {memory_after_sqlite:.1f} MB (+{memory_after_sqlite - memory_before:.1f} MB)")
        
        print("\n=== Performance Summary ===")
        print(f"Data loading: SQLite vs JSON = {sqlite_load_time/json_load_time:.2f}x")
        print(f"Tree retrieval: SQLite vs JSON = {sqlite_tree_time/json_tree_time:.2f}x")
        print(f"Node search: SQLite vs JSON = {sqlite_find_time/json_find_time:.2f}x")
        print(f"Node update: SQLite vs JSON = {sqlite_update_time/json_update_time:.2f}x")
        print(f"Cache effectiveness: {sqlite_cached_time1/sqlite_cached_time2:.2f}x speedup")
        
        print("\n=== Additional Features (SQLite only) ===")
        
        # Test search functionality
        _, search_time = benchmark_operation(
            "Content search", sqlite_storage.search_content, "Note"
        )
        
        # Test statistics
        _, stats_time = benchmark_operation(
            "Statistics generation", sqlite_storage.get_statistics
        )
        
        # Test recent items
        _, recent_time = benchmark_operation(
            "Recent items retrieval", sqlite_storage.get_recent_items, 10
        )
        
        print(f"\nNew features performance:")
        print(f"Content search: {search_time:.4f} seconds")
        print(f"Statistics: {stats_time:.4f} seconds")
        print(f"Recent items: {recent_time:.4f} seconds")

if __name__ == '__main__':
    try:
        run_performance_tests()
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install required packages: pip install psutil")
    except Exception as e:
        print(f"Error running tests: {e}")
        import traceback
        traceback.print_exc()
