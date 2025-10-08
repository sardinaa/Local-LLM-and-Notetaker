"""Generic JSON file loading utilities."""

import json
import os
from pathlib import Path
from typing import Dict, List, Union


def load_json(file_path: Union[str, Path]) -> Union[Dict, List]:
    """
    Load and parse a JSON file.
    
    Args:
        file_path: Path to the JSON file
        
    Returns:
        Parsed JSON data (dict or list)
        
    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file is not valid JSON
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_json_dir(dir_path: Union[str, Path]) -> List[Dict]:
    """
    Load all JSON files from a directory.
    
    Args:
        dir_path: Path to directory containing JSON files
        
    Returns:
        List of parsed JSON objects from all files
    """
    dir_path = Path(dir_path)
    data = []
    
    if not dir_path.exists():
        print(f"Warning: Directory not found: {dir_path}")
        return data
    
    for json_file in sorted(dir_path.glob('*.json')):
        try:
            item = load_json(json_file)
            data.append(item)
        except Exception as e:
            print(f"Error loading {json_file}: {e}")
    
    return data


def save_json(data: Union[Dict, List], file_path: Union[str, Path], indent: int = 2):
    """
    Save data to a JSON file.
    
    Args:
        data: Data to save
        file_path: Path to save to
        indent: JSON indentation level
    """
    file_path = Path(file_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)
