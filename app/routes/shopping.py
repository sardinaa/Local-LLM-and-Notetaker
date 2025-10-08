from flask import Blueprint, request, jsonify, render_template, current_app
from typing import Dict, List, Optional
import logging

shopping_bp = Blueprint('shopping', __name__)


def get_shopping_repo():
    """Get the shopping repository from current app."""
    return getattr(current_app, "shopping_repo", None)


def get_data_service():
    """Get the data service from current app (fallback for legacy code)."""
    return getattr(current_app, "data_service", None)

@shopping_bp.route('/shopping', methods=['GET'])
def get_shopping_list():
    """Get shopping list ingredients."""
    try:
        shopping_repo = get_shopping_repo()
        if not shopping_repo:
            # Fallback to legacy data service
            data_service = get_data_service()
            if not data_service:
                return jsonify({'error': 'Shopping service not available'}), 503
            db = data_service.db
        else:
            db = shopping_repo
        
        view_type = request.args.get('view', 'all')  # 'all' or 'by_recipe'
        
        if view_type == 'by_recipe':
            ingredients = db.get_ingredients_by_recipe() if shopping_repo else db.get_shopping_ingredients_by_recipe()
        else:
            ingredients = db.get_ingredients_aggregated() if shopping_repo else db.get_shopping_ingredients_aggregated()
        
        summary = db.get_summary() if shopping_repo else db.get_shopping_summary()
        
        return jsonify({
            'ingredients': ingredients,
            'summary': summary,
            'view_type': view_type
        })
    
    except Exception as e:
        logging.error(f"Error getting shopping list: {e}")
        return jsonify({'error': 'Failed to get shopping list'}), 500

@shopping_bp.route('/shopping', methods=['POST'])
def add_shopping_ingredient():
    """Add ingredient(s) to shopping list."""
    try:
        data = request.get_json()
        shopping_repo = get_shopping_repo()
        if not shopping_repo:
            # Fallback to legacy data service
            data_service = get_data_service()
            if not data_service:
                return jsonify({'error': 'Shopping service not available'}), 503
            db = data_service.db
        else:
            db = shopping_repo
        
        if 'ingredients' in data and isinstance(data['ingredients'], list):
            # Batch add ingredients
            ingredient_ids = db.add_ingredients_batch(data['ingredients']) if shopping_repo else db.add_shopping_ingredients_batch(data['ingredients'])
            return jsonify({
                'success': True,
                'ingredient_ids': ingredient_ids,
                'count': len(ingredient_ids)
            })
        else:
            # Add single ingredient
            ingredient_id = db.add_ingredient(
                ingredient_name=data.get('ingredient_name', ''),
                recipe_name=data.get('recipe_name'),
                quantity=data.get('quantity'),
                unit=data.get('unit')
            ) if shopping_repo else db.add_shopping_ingredient(
                ingredient_name=data.get('ingredient_name', ''),
                recipe_name=data.get('recipe_name'),
                quantity=data.get('quantity'),
                unit=data.get('unit')
            )
            
            if ingredient_id:
                return jsonify({
                    'success': True,
                    'ingredient_id': ingredient_id
                })
            else:
                return jsonify({'error': 'Failed to add ingredient'}), 500
                
    except Exception as e:
        logging.error(f"Error adding shopping ingredient: {e}")
        return jsonify({'error': 'Failed to add ingredient'}), 500

@shopping_bp.route('/shopping/<ingredient_id>', methods=['PATCH'])
def update_shopping_ingredient(ingredient_id: str):
    """Update shopping ingredient (e.g., check/uncheck)."""
    try:
        data = request.get_json()
        shopping_repo = get_shopping_repo()
        if not shopping_repo:
            # Fallback to legacy data service
            data_service = get_data_service()
            if not data_service:
                return jsonify({'error': 'Shopping service not available'}), 503
            db = data_service.db
        else:
            db = shopping_repo
        
        if 'checked' in data:
            success = db.update_checked(ingredient_id, data['checked']) if shopping_repo else db.update_shopping_ingredient_checked(ingredient_id, data['checked'])
            if success:
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Ingredient not found'}), 404
        else:
            return jsonify({'error': 'No valid update data provided'}), 400
            
    except Exception as e:
        logging.error(f"Error updating shopping ingredient: {e}")
        return jsonify({'error': 'Failed to update ingredient'}), 500

@shopping_bp.route('/shopping/<ingredient_id>', methods=['DELETE'])
def delete_shopping_ingredient(ingredient_id: str):
    """Delete shopping ingredient."""
    try:
        shopping_repo = get_shopping_repo()
        if not shopping_repo:
            # Fallback to legacy data service
            data_service = get_data_service()
            if not data_service:
                return jsonify({'error': 'Shopping service not available'}), 503
            db = data_service.db
        else:
            db = shopping_repo
        
        success = db.delete_ingredient(ingredient_id) if shopping_repo else db.delete_shopping_ingredient(ingredient_id)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Ingredient not found'}), 404
            
    except Exception as e:
        logging.error(f"Error deleting shopping ingredient: {e}")
        return jsonify({'error': 'Failed to delete ingredient'}), 500

@shopping_bp.route('/shopping/clear', methods=['POST'])
def clear_shopping_list():
    """Clear shopping list ingredients."""
    try:
        data = request.get_json() or {}
        shopping_repo = get_shopping_repo()
        if not shopping_repo:
            # Fallback to legacy data service
            data_service = get_data_service()
            if not data_service:
                return jsonify({'error': 'Shopping service not available'}), 503
            db = data_service.db
        else:
            db = shopping_repo
        
        recipe_name = data.get('recipe_name')
        checked_only = data.get('checked_only', False)
        
        cleared_count = db.clear_ingredients(recipe_name, checked_only) if shopping_repo else db.clear_shopping_ingredients(recipe_name, checked_only)
        
        return jsonify({
            'success': True,
            'cleared_count': cleared_count
        })
        
    except Exception as e:
        logging.error(f"Error clearing shopping list: {e}")
        return jsonify({'error': 'Failed to clear shopping list'}), 500

@shopping_bp.route('/shopping/summary', methods=['GET'])
def get_shopping_summary():
    """Get shopping list summary statistics."""
    try:
        data_service = get_data_service()
        if not data_service:
            return jsonify({'error': 'Data service not available'}), 503
        
        db = data_service.db
        summary = db.get_shopping_summary()
        return jsonify(summary)
        
    except Exception as e:
        logging.error(f"Error getting shopping summary: {e}")
        return jsonify({'error': 'Failed to get shopping summary'}), 500
