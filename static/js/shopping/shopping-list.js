class ShoppingListManager {
  constructor() {
    this.container = null;
    this.ingredients = [];
    this.viewMode = 'all'; // 'all' or 'by_recipe'
    this.isVisible = false;
    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Listen for shopping events
    document.addEventListener('shopping:add', (e) => {
      this.refresh();
    });

    document.addEventListener('shopping:open', () => {
      this.show();
    });
  }

  async createUI() {
    if (this.container) return this.container;

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'shopping-list-container';
    this.container.innerHTML = `
      <div class="shopping-list-header">
        <div class="shopping-list-title">
          <i class="fas fa-shopping-cart shopping-icon"></i>
          <span>Shopping List</span>
        </div>
        <div class="shopping-list-actions">
          <button class="shopping-clear-btn" title="Clear all ingredients">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      
      <div class="shopping-quick-add-layout">
        <div class="quick-add-container" style="padding: 8px 12px; position: relative;">
          <div class="quick-add-input-container" style="margin-bottom: 0;">
            <input
              type="text"
              id="quickShoppingInput"
              placeholder="+ Add Ingredient (e.g., 2 cups flour, 1 lb chicken)"
              class="quick-task-input"
              aria-label="Quick add ingredient"
            >
          </div>
        </div>
      </div>
      
      <div class="shopping-list-filters">
        <div class="shopping-filter-pills">
          <button class="shopping-pill active" data-view="all">All Ingredients</button>
          <button class="shopping-pill" data-view="by_recipe">By Recipe</button>
        </div>
      </div>
      
      <div class="shopping-list-content">
        <div class="shopping-list-loading">
          <i class="fas fa-spinner fa-spin"></i>
          Loading shopping list...
        </div>
      </div>
    `;

    this.bindUIEvents();
    return this.container;
  }

  bindUIEvents() {
    if (!this.container) return;

    // Quick add input
    const quickInput = this.container.querySelector('#quickShoppingInput');
    if (quickInput && !quickInput.dataset.bound) {
      quickInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await this.handleQuickAdd();
        }
      });
      quickInput.dataset.bound = '1';
    }

    // Clear button
    const clearBtn = this.container.querySelector('.shopping-clear-btn');
    clearBtn?.addEventListener('click', () => this.handleClearAll());

    // Filter pills
    const pills = this.container.querySelectorAll('.shopping-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', async (e) => {
        const view = e.target.dataset.view;
        await this.setViewMode(view);
      });
    });
  }

  async setViewMode(mode) {
    this.viewMode = mode;
    
    // Update pill active state
    const pills = this.container.querySelectorAll('.shopping-pill');
    pills.forEach(pill => {
      pill.classList.toggle('active', pill.dataset.view === mode);
    });

    // Refresh data with new view mode
    await this.refresh();
  }

  async show() {
    if (!this.container) {
      await this.createUI();
    }

    // Add shopping list to shopping root container  
    const shoppingRoot = document.getElementById('shoppingRoot');
    if (!shoppingRoot) return;

    // Clear existing content and add shopping list
    shoppingRoot.innerHTML = '';
    shoppingRoot.appendChild(this.container);
    
    this.isVisible = true;
    await this.refresh();
  }

  hide() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.isVisible = false;
  }

  async refresh() {
    if (!this.isVisible || !this.container) return;

    try {
      const response = await fetch(`/api/shopping?view=${this.viewMode}`);
      if (!response.ok) throw new Error('Failed to fetch shopping list');

      const data = await response.json();
      this.ingredients = data.ingredients;
      this.summary = data.summary;

      this.renderContent();
    } catch (error) {
      console.error('Error refreshing shopping list:', error);
      this.showError('Failed to load shopping list');
    }
  }

  renderContent() {
    if (!this.container) return;

    const contentEl = this.container.querySelector('.shopping-list-content');
    if (!contentEl) return;

    if (this.viewMode === 'by_recipe') {
      this.renderByRecipe(contentEl);
    } else {
      this.renderAll(contentEl);
    }
  }

  renderAll(contentEl) {
    if (!Array.isArray(this.ingredients) || this.ingredients.length === 0) {
      contentEl.innerHTML = `
        <div class="shopping-list-empty">
          <i class="fas fa-shopping-basket"></i>
          <p>Your shopping list is empty</p>
          <small>Add ingredients from recipes using the compose menu</small>
        </div>
      `;
      return;
    }

    const groupedIngredients = this.groupSimilarIngredients(this.ingredients);

    contentEl.innerHTML = `
      <div class="shopping-list-items">
        ${Object.entries(groupedIngredients).map(([name, items]) => {
          const totalQuantity = this.calculateTotalQuantity(items);
          const isChecked = items.every(item => item.checked);
          const itemId = items[0].id; // Use first item's ID for checking/unchecking
          
          return `
            <div class="shopping-item ${isChecked ? 'checked' : ''}" data-ingredient-id="${itemId}">
              <label class="shopping-item-checkbox">
                <input type="checkbox" ${isChecked ? 'checked' : ''}>
                <span class="checkmark"></span>
              </label>
              <div class="shopping-item-content">
                <div class="shopping-item-name">${this.escapeHtml(name)}</div>
                <div class="shopping-item-details">
                  ${totalQuantity ? `<span class="quantity">${totalQuantity}</span>` : ''}
                  ${items.length > 1 ? `<span class="recipe-count">from ${items.length} recipe(s)</span>` : ''}
                  ${items[0].recipe_name ? `<span class="recipe-name">${this.escapeHtml(items[0].recipe_name)}</span>` : ''}
                </div>
              </div>
              <button class="shopping-item-delete" title="Remove ingredient">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindItemEvents(contentEl);
  }

  renderByRecipe(contentEl) {
    if (typeof this.ingredients !== 'object' || Object.keys(this.ingredients).length === 0) {
      contentEl.innerHTML = `
        <div class="shopping-list-empty">
          <i class="fas fa-shopping-basket"></i>
          <p>Your shopping list is empty</p>
          <small>Add ingredients from recipes using the compose menu</small>
        </div>
      `;
      return;
    }

    // Create EditorJS-like toggle blocks for each recipe
    contentEl.innerHTML = `
      <div class="shopping-recipe-blocks">
        ${Object.entries(this.ingredients).map(([recipeName, items]) => `
          <div class="shopping-recipe-block">
            <div class="shopping-recipe-header" data-recipe="${this.escapeHtml(recipeName)}">
              <i class="fas fa-chevron-down toggle-arrow"></i>
              <span class="recipe-title">${this.escapeHtml(recipeName)}</span>
              <span class="recipe-count">(${items.length} ingredient${items.length !== 1 ? 's' : ''})</span>
              <button class="recipe-clear-btn" title="Clear this recipe">
                <i class="fas fa-trash"></i>
              </button>
            </div>
            <div class="shopping-recipe-content">
              ${items.map(item => `
                <div class="shopping-item ${item.checked ? 'checked' : ''}" data-ingredient-id="${item.id}">
                  <label class="shopping-item-checkbox">
                    <input type="checkbox" ${item.checked ? 'checked' : ''}>
                    <span class="checkmark"></span>
                  </label>
                  <div class="shopping-item-content">
                    <div class="shopping-item-name">${this.escapeHtml(item.ingredient_name)}</div>
                    ${item.quantity || item.unit ? `
                      <div class="shopping-item-details">
                        <span class="quantity">${item.quantity || ''}${item.unit ? ' ' + item.unit : ''}</span>
                      </div>
                    ` : ''}
                  </div>
                  <button class="shopping-item-delete" title="Remove ingredient">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    this.bindRecipeEvents(contentEl);
    this.bindItemEvents(contentEl);
  }

  bindItemEvents(contentEl) {
    // Checkbox events
    const checkboxes = contentEl.querySelectorAll('.shopping-item-checkbox input');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const item = e.target.closest('.shopping-item');
        const ingredientId = item.dataset.ingredientId;
        this.toggleIngredient(ingredientId, e.target.checked);
      });
    });

    // Delete events
    const deleteButtons = contentEl.querySelectorAll('.shopping-item-delete');
    deleteButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.shopping-item');
        const ingredientId = item.dataset.ingredientId;
        this.deleteIngredient(ingredientId);
      });
    });
  }

  bindRecipeEvents(contentEl) {
    // Toggle recipe blocks
    const headers = contentEl.querySelectorAll('.shopping-recipe-header');
    headers.forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.recipe-clear-btn')) return;
        
        const block = header.closest('.shopping-recipe-block');
        const content = block.querySelector('.shopping-recipe-content');
        const arrow = header.querySelector('.toggle-arrow');
        
        const isExpanded = !content.classList.contains('collapsed');
        content.classList.toggle('collapsed', isExpanded);
        arrow.style.transform = isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    });

    // Clear recipe buttons
    const clearBtns = contentEl.querySelectorAll('.recipe-clear-btn');
    clearBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const recipeName = e.target.closest('.shopping-recipe-header').dataset.recipe;
        this.clearRecipe(recipeName);
      });
    });
  }

  groupSimilarIngredients(ingredients) {
    const grouped = {};
    ingredients.forEach(item => {
      const name = item.ingredient_name.toLowerCase();
      if (!grouped[name]) {
        grouped[name] = [];
      }
      grouped[name].push(item);
    });
    return grouped;
  }

  calculateTotalQuantity(items) {
    // Simple quantity aggregation - can be enhanced
    const quantities = items.filter(item => item.quantity).map(item => item.quantity);
    if (quantities.length === 0) return '';
    
    // If all quantities are numbers, sum them
    const numbers = quantities.map(q => parseFloat(q)).filter(n => !isNaN(n));
    if (numbers.length === quantities.length && numbers.length > 0) {
      const total = numbers.reduce((a, b) => a + b, 0);
      const unit = items.find(item => item.unit)?.unit || '';
      return `${total}${unit ? ' ' + unit : ''}`;
    }
    
    // Otherwise, just show the first quantity
    return quantities[0];
  }

  async toggleIngredient(ingredientId, checked) {
    try {
      const response = await fetch(`/api/shopping/${ingredientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked })
      });

      if (!response.ok) throw new Error('Failed to update ingredient');
      
      // Update UI
      const item = document.querySelector(`[data-ingredient-id="${ingredientId}"]`);
      if (item) {
        item.classList.toggle('checked', checked);
      }

    } catch (error) {
      console.error('Error toggling ingredient:', error);
      // Revert checkbox state
      const checkbox = document.querySelector(`[data-ingredient-id="${ingredientId}"] input[type="checkbox"]`);
      if (checkbox) checkbox.checked = !checked;
    }
  }

  async deleteIngredient(ingredientId) {
    try {
      const response = await fetch(`/api/shopping/${ingredientId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete ingredient');

      // Remove from UI
      const item = document.querySelector(`[data-ingredient-id="${ingredientId}"]`);
      if (item) {
        item.remove();
      }

      // Refresh if empty
      await this.refresh();

    } catch (error) {
      console.error('Error deleting ingredient:', error);
      alert('Failed to remove ingredient');
    }
  }

  async clearRecipe(recipeName) {
    if (!confirm(`Remove all ingredients from "${recipeName}"?`)) return;

    try {
      const response = await fetch('/api/shopping/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_name: recipeName })
      });

      if (!response.ok) throw new Error('Failed to clear recipe');

      await this.refresh();

    } catch (error) {
      console.error('Error clearing recipe:', error);
      alert('Failed to clear recipe');
    }
  }

  async handleClearAll() {
    if (!confirm('Clear the entire shopping list?')) return;

    try {
      const response = await fetch('/api/shopping/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) throw new Error('Failed to clear shopping list');

      await this.refresh();

    } catch (error) {
      console.error('Error clearing shopping list:', error);
      alert('Failed to clear shopping list');
    }
  }

  async handleQuickAdd() {
    const input = this.container?.querySelector('#quickShoppingInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    try {
      // Parse the input text - simple format: "quantity unit ingredient"
      // Examples: "2 cups flour", "1 lb chicken", "eggs", "3 tomatoes"
      const parsed = this.parseIngredientText(text);
      
      const response = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          recipe_name: 'Manual Entry'
        })
      });

      if (!response.ok) throw new Error('Failed to add ingredient');

      // Clear input and refresh list
      input.value = '';
      await this.refresh();

      // Show success feedback
      this.showSuccessToast('Ingredient added!');

    } catch (error) {
      console.error('Error adding ingredient:', error);
      alert('Failed to add ingredient');
    }
  }

  parseIngredientText(text) {
    // Simple parser for ingredient text
    // Matches patterns like "2 cups flour", "1 lb chicken", "eggs", "3 tomatoes"
    
    // Common units to detect
    const units = ['cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
                   'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams',
                   'kg', 'kilogram', 'kilograms', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
                   'piece', 'pieces', 'slice', 'slices', 'clove', 'cloves', 'can', 'cans', 'package', 'packages'];
    
    // Try to match: quantity + optional unit + name
    const match = text.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s+(.+)$/);
    
    if (match) {
      const [, quantity, rest] = match;
      
      // Check if the first word of rest is a unit
      const words = rest.trim().split(/\s+/);
      const firstWord = words[0].toLowerCase();
      
      if (units.includes(firstWord)) {
        // Has a unit
        return {
          quantity: quantity,
          unit: words[0],
          name: words.slice(1).join(' ')
        };
      } else {
        // No unit, everything else is the name
        return {
          quantity: quantity,
          unit: null,
          name: rest.trim()
        };
      }
    }
    
    // If no quantity found, treat entire text as ingredient name
    return {
      quantity: null,
      unit: null,
      name: text
    };
  }

  showSuccessToast(message) {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'shopping-toast success';
    toast.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>${this.escapeHtml(message)}</span>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 2 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  showError(message) {
    const contentEl = this.container?.querySelector('.shopping-list-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="shopping-list-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize shopping list manager
window.shoppingListManager = new ShoppingListManager();
