"""Shopping list repository - owns all shopping ingredient data access logic."""

from __future__ import annotations

import logging
import uuid
from typing import Dict, List, Optional

from .base import BaseRepository


class ShoppingRepository(BaseRepository):
    """Repository for shopping list management with independent SQL logic."""

    def _ensure_table_exists(self, conn) -> None:
        """Ensure shopping_ingredients table exists (for backwards compatibility)."""
        cursor = conn.cursor()
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='shopping_ingredients'
        """)
        if cursor.fetchone():
            return
        
        # Create table if it doesn't exist
        conn.execute('''
            CREATE TABLE IF NOT EXISTS shopping_ingredients (
                id TEXT PRIMARY KEY,
                ingredient_name TEXT NOT NULL,
                recipe_name TEXT,
                quantity TEXT,
                unit TEXT,
                checked INTEGER DEFAULT 0,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes
        conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_ingredient_name ON shopping_ingredients(ingredient_name)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_recipe_name ON shopping_ingredients(recipe_name)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_checked ON shopping_ingredients(checked)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_shopping_ingredients_added_at ON shopping_ingredients(added_at)')
        
        # Create trigger for timestamps
        conn.execute('''
            CREATE TRIGGER IF NOT EXISTS update_shopping_ingredients_timestamp 
            AFTER UPDATE ON shopping_ingredients
            BEGIN
                UPDATE shopping_ingredients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
        ''')

    def add_ingredient(self, ingredient_name: str, recipe_name: Optional[str] = None,
                      quantity: Optional[str] = None, unit: Optional[str] = None) -> Optional[str]:
        """Add an ingredient to the shopping list.
        
        Args:
            ingredient_name: Name of the ingredient (required)
            recipe_name: Name of the recipe this ingredient is for
            quantity: Quantity needed (e.g., "2", "1/2")
            unit: Unit of measurement (e.g., "cups", "tbsp")
            
        Returns:
            Ingredient ID if successful, None otherwise
        """
        try:
            ingredient_id = str(uuid.uuid4())
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                conn.execute('''
                    INSERT INTO shopping_ingredients (id, ingredient_name, recipe_name, quantity, unit)
                    VALUES (?, ?, ?, ?, ?)
                ''', (ingredient_id, ingredient_name.strip(), recipe_name, quantity, unit))
                
                return ingredient_id
        except Exception as e:
            logging.error(f"Error adding shopping ingredient: {e}")
            return None

    def add_ingredients_batch(self, ingredients: List[Dict]) -> List[str]:
        """Add multiple ingredients to the shopping list in a single transaction.
        
        Args:
            ingredients: List of ingredient dicts with keys: ingredient_name, recipe_name, quantity, unit
            
        Returns:
            List of created ingredient IDs
        """
        try:
            ingredient_ids = []
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                for ingredient in ingredients:
                    ingredient_id = str(uuid.uuid4())
                    conn.execute('''
                        INSERT INTO shopping_ingredients (id, ingredient_name, recipe_name, quantity, unit)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (
                        ingredient_id,
                        ingredient.get('ingredient_name', '').strip(),
                        ingredient.get('recipe_name'),
                        ingredient.get('quantity'),
                        ingredient.get('unit')
                    ))
                    ingredient_ids.append(ingredient_id)
                
                return ingredient_ids
        except Exception as e:
            logging.error(f"Error adding shopping ingredients batch: {e}")
            return []

    def get_ingredients(self) -> List[Dict]:
        """Get all shopping ingredients ordered by checked status and date.
        
        Returns:
            List of ingredient dicts
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                cursor = conn.execute('''
                    SELECT id, ingredient_name, recipe_name, quantity, unit, checked, added_at, updated_at
                    FROM shopping_ingredients
                    ORDER BY checked ASC, added_at DESC
                ''')
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logging.error(f"Error getting shopping ingredients: {e}")
            return []

    def get_ingredients_aggregated(self) -> List[Dict]:
        """Get ingredients aggregated by name and unit, summing quantities.
        
        Useful for combining duplicate ingredients from multiple recipes.
        
        Returns:
            List of aggregated ingredient dicts
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                cursor = conn.execute('''
                    SELECT 
                        MIN(id) as id,
                        ingredient_name,
                        'Multiple Recipes' as recipe_name,
                        COALESCE(SUM(CAST(quantity AS REAL)), 0) as quantity,
                        unit,
                        MIN(CASE WHEN checked = 0 THEN 0 ELSE 1 END) as checked,
                        MIN(added_at) as added_at,
                        MAX(updated_at) as updated_at,
                        COUNT(*) as recipe_count,
                        GROUP_CONCAT(DISTINCT recipe_name) as recipes
                    FROM shopping_ingredients
                    GROUP BY LOWER(ingredient_name), LOWER(unit)
                    ORDER BY checked ASC, added_at DESC
                ''')
                
                results = []
                for row in cursor.fetchall():
                    row_dict = dict(row)
                    # If ingredient appears in only one recipe, use that recipe name
                    if row_dict['recipe_count'] == 1:
                        recipes = row_dict['recipes'].split(',') if row_dict['recipes'] else []
                        row_dict['recipe_name'] = recipes[0] if recipes else 'Unknown Recipe'
                    # Clean up the result
                    row_dict.pop('recipe_count', None)
                    row_dict.pop('recipes', None)
                    results.append(row_dict)
                
                return results
        except Exception as e:
            logging.error(f"Error getting aggregated shopping ingredients: {e}")
            return []

    def get_ingredients_by_recipe(self) -> Dict[str, List[Dict]]:
        """Get shopping ingredients grouped by recipe name.
        
        Returns:
            Dict mapping recipe names to lists of ingredients
        """
        try:
            ingredients = self.get_ingredients()
            grouped: Dict[str, List[Dict]] = {}
            
            for ingredient in ingredients:
                recipe_name = ingredient.get('recipe_name') or 'Other Ingredients'
                if recipe_name not in grouped:
                    grouped[recipe_name] = []
                grouped[recipe_name].append(ingredient)
            
            return grouped
        except Exception as e:
            logging.error(f"Error grouping shopping ingredients by recipe: {e}")
            return {}

    def update_checked(self, ingredient_id: str, checked: bool) -> bool:
        """Update the checked/completed status of an ingredient.
        
        Args:
            ingredient_id: ID of the ingredient to update
            checked: True if checked/completed, False otherwise
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                cursor = conn.execute('''
                    UPDATE shopping_ingredients
                    SET checked = ?
                    WHERE id = ?
                ''', (1 if checked else 0, ingredient_id))
                
                return cursor.rowcount > 0
        except Exception as e:
            logging.error(f"Error updating shopping ingredient checked status: {e}")
            return False

    def delete_ingredient(self, ingredient_id: str) -> bool:
        """Delete a shopping ingredient.
        
        Args:
            ingredient_id: ID of the ingredient to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                cursor = conn.execute('''
                    DELETE FROM shopping_ingredients
                    WHERE id = ?
                ''', (ingredient_id,))
                
                return cursor.rowcount > 0
        except Exception as e:
            logging.error(f"Error deleting shopping ingredient: {e}")
            return False

    def clear_ingredients(self, recipe_name: Optional[str] = None, checked_only: bool = False) -> int:
        """Clear shopping ingredients with optional filters.
        
        Args:
            recipe_name: If provided, only clear ingredients from this recipe
            checked_only: If True, only clear checked/completed ingredients
            
        Returns:
            Number of ingredients deleted
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                if recipe_name:
                    if checked_only:
                        cursor = conn.execute('''
                            DELETE FROM shopping_ingredients
                            WHERE recipe_name = ? AND checked = 1
                        ''', (recipe_name,))
                    else:
                        cursor = conn.execute('''
                            DELETE FROM shopping_ingredients
                            WHERE recipe_name = ?
                        ''', (recipe_name,))
                else:
                    if checked_only:
                        cursor = conn.execute('''
                            DELETE FROM shopping_ingredients
                            WHERE checked = 1
                        ''')
                    else:
                        cursor = conn.execute('DELETE FROM shopping_ingredients')
                
                return cursor.rowcount
        except Exception as e:
            logging.error(f"Error clearing shopping ingredients: {e}")
            return 0

    def get_summary(self) -> Dict:
        """Get shopping list summary statistics.
        
        Returns:
            Dict with keys: total_ingredients, checked_ingredients, 
                           unchecked_ingredients, unique_recipes
        """
        try:
            with self.get_connection() as conn:
                self._ensure_table_exists(conn)
                
                cursor = conn.execute('''
                    SELECT 
                        COUNT(*) as total_ingredients,
                        COALESCE(SUM(CASE WHEN checked = 1 THEN 1 ELSE 0 END), 0) as checked_ingredients,
                        COUNT(DISTINCT recipe_name) as unique_recipes
                    FROM shopping_ingredients
                ''')
                
                result = dict(cursor.fetchone())
                result['unchecked_ingredients'] = result['total_ingredients'] - result['checked_ingredients']
                return result
        except Exception as e:
            logging.error(f"Error getting shopping summary: {e}")
            return {
                'total_ingredients': 0,
                'checked_ingredients': 0,
                'unchecked_ingredients': 0,
                'unique_recipes': 0
            }
