export function toggleFilterMenu(tm, open) {
  const menu = tm.taskFilterMenu;
  const btn = tm.taskFilterBtn;
  if (!menu || !btn) return;
  const willOpen = typeof open === 'boolean' ? open : menu.classList.contains('is-hidden');
  menu.classList.toggle('is-hidden', !willOpen);
  btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen) {
    const first = menu.querySelector('.filter-option');
    if (first) first.focus();
  }
}

export function initFilterMenu(tm) {
  const wire = (container, key, dataAttr) => {
    if (!container) return;
    container.querySelectorAll('.filter-option').forEach((el) => {
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => {
        const val = el.dataset[dataAttr];
        tm.viewSettings[key] = val;
        try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
        updateMenuState(tm);
        if (typeof tm.render === 'function') tm.render();
        else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
        // Close the details panel when changing the view
        if (typeof tm.hidePanel === 'function') tm.hidePanel();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(container.querySelectorAll('.filter-option'));
          const idx = items.indexOf(el);
          const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[next].focus();
        } else if (e.key === 'Escape') {
          toggleFilterMenu(tm, false);
        }
      });
    });
  };

  wire(tm.groupByOptions, 'groupBy', 'group');
  wire(tm.sortByOptions, 'sortBy', 'sort');

  if (tm.sortOrderToggle) {
    tm.sortOrderToggle.addEventListener('click', () => {
      tm.viewSettings.sortOrder = tm.viewSettings.sortOrder === 'asc' ? 'desc' : 'asc';
      try { localStorage.setItem('task.view', JSON.stringify(tm.viewSettings)); } catch {}
      updateMenuState(tm);
      if (typeof tm.render === 'function') tm.render();
      else if (typeof tm.renderTaskView === 'function') tm.renderTaskView();
      if (typeof tm.hidePanel === 'function') tm.hidePanel();
    });
  }
}

export function updateMenuState(tm) {
  const { groupByOptions, sortByOptions, sortOrderToggle, viewSettings } = tm;
  if (groupByOptions) {
    groupByOptions.querySelectorAll('.filter-option').forEach((el) => {
      const checked = el.dataset.group === viewSettings.groupBy;
      el.setAttribute('aria-checked', checked ? 'true' : 'false');
    });
  }
  if (sortByOptions) {
    sortByOptions.querySelectorAll('.filter-option').forEach((el) => {
      const checked = el.dataset.sort === viewSettings.sortBy;
      el.setAttribute('aria-checked', checked ? 'true' : 'false');
    });
  }
  if (sortOrderToggle) {
    sortOrderToggle.setAttribute('data-order', viewSettings.sortOrder);
  }
}

// View-specific task filtering functions
export function filterTasksForView(tasks, viewId, viewData = null) {
  if (!tasks || !Array.isArray(tasks)) return [];

  switch (viewId) {
    case 'today':
      return filterTodayTasks(tasks);
    
    case 'next7days':
      return filterNext7DaysTasks(tasks);
    
    case 'inbox':
      return filterInboxTasks(tasks);
    
    case 'eisenhower':
      // Eisenhower view uses quadrants, not filtered list
      return tasks;
    
    default:
      if (viewId.startsWith('list:')) {
        const tagName = viewId.substring(5);
        return filterTasksByTag(tasks, tagName);
      }
      return tasks;
  }
}

export function filterTodayTasks(tasks) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  return tasks.filter(task => {
    if (task.status === 'completed') return false;
    
    if (!task.due_date) return false;
    
    const taskDate = task.due_date.split('T')[0]; // Extract YYYY-MM-DD
    return taskDate === today;
  });
}

export function filterNext7DaysTasks(tasks) {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 7);
  
  const todayStr = today.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  return tasks.filter(task => {
    if (task.status === 'completed') return false;
    
    if (!task.due_date) return false;
    
    const taskDate = task.due_date.split('T')[0];
    return taskDate >= todayStr && taskDate <= endDateStr;
  });
}

export function filterInboxTasks(tasks) {
  return tasks.filter(task => {
    if (task.status === 'completed') return false;
    
    // Task is in inbox if it has no tags
    const tags = task.tags || [];
    return tags.length === 0;
  });
}

export function filterTasksByTag(tasks, tagName) {
  return tasks.filter(task => {
    if (task.status === 'completed') return false;
    
    const tags = task.tags || [];
    return tags.some(tag => {
      const name = typeof tag === 'object' ? tag.name : tag;
      return name === tagName;
    });
  });
}

// Group filtered tasks for display
export function groupTasksForView(tasks, viewId, groupBy = 'date') {
  switch (viewId) {
    case 'today':
      return groupTodayTasks(tasks, groupBy);
    
    case 'next7days':
      return groupNext7DaysTasks(tasks, groupBy);
    
    case 'inbox':
      return groupInboxTasks(tasks, groupBy);
    
    default:
      if (viewId.startsWith('list:')) {
        return groupListTasks(tasks, groupBy);
      }
      return groupTasksByDate(tasks); // Default grouping
  }
}

export function groupTodayTasks(tasks, groupBy) {
  if (groupBy === 'priority') {
    return groupTasksByPriority(tasks);
  }
  
  // Group by time of day for today view
  const groups = {
    overdue: { title: 'Overdue', tasks: [] },
    morning: { title: 'Morning', tasks: [] },
    afternoon: { title: 'Afternoon', tasks: [] },
    evening: { title: 'Evening', tasks: [] },
    noTime: { title: 'All Day', tasks: [] }
  };
  
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  tasks.forEach(task => {
    if (!task.due_date) {
      groups.noTime.tasks.push(task);
      return;
    }
    
    const taskDate = task.due_date.split('T')[0];
    const taskTime = task.due_date.includes('T') ? task.due_date.split('T')[1] : null;
    
    // Check if overdue (past time today or previous day)
    if (taskDate < today || (taskDate === today && taskTime && new Date(task.due_date) < now)) {
      groups.overdue.tasks.push(task);
    } else if (!taskTime) {
      groups.noTime.tasks.push(task);
    } else {
      const hour = parseInt(taskTime.split(':')[0]);
      if (hour < 12) {
        groups.morning.tasks.push(task);
      } else if (hour < 17) {
        groups.afternoon.tasks.push(task);
      } else {
        groups.evening.tasks.push(task);
      }
    }
  });
  
  // Filter out empty groups
  return Object.entries(groups)
    .filter(([key, group]) => group.tasks.length > 0)
    .map(([key, group]) => group);
}

export function groupNext7DaysTasks(tasks, groupBy) {
  if (groupBy === 'priority') {
    return groupTasksByPriority(tasks);
  }
  
  // Group by day
  const groups = {
    today: { title: 'Today', tasks: [] },
    tomorrow: { title: 'Tomorrow', tasks: [] },
    thisWeek: { title: 'Next 7 Days', tasks: [] }
  };
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  tasks.forEach(task => {
    if (!task.due_date) {
      groups.thisWeek.tasks.push(task);
      return;
    }
    
    const taskDate = task.due_date.split('T')[0];
    
    if (taskDate === todayStr) {
      groups.today.tasks.push(task);
    } else if (taskDate === tomorrowStr) {
      groups.tomorrow.tasks.push(task);
    } else {
      groups.thisWeek.tasks.push(task);
    }
  });
  
  // Filter out empty groups
  return Object.entries(groups)
    .filter(([key, group]) => group.tasks.length > 0)
    .map(([key, group]) => group);
}

export function groupInboxTasks(tasks, groupBy) {
  if (groupBy === 'priority') {
    return groupTasksByPriority(tasks);
  }
  
  // Simple single group for inbox
  return [{
    title: 'Inbox Tasks',
    tasks: tasks
  }];
}

export function groupListTasks(tasks, groupBy) {
  if (groupBy === 'priority') {
    return groupTasksByPriority(tasks);
  } else if (groupBy === 'date') {
    return groupTasksByDate(tasks);
  }
  
  // Simple single group for tag lists
  return [{
    title: 'Tasks',
    tasks: tasks
  }];
}

export function groupTasksByDate(tasks) {
  const groups = {
    overdue: { title: 'Overdue', tasks: [] },
    today: { title: 'Today', tasks: [] },
    tomorrow: { title: 'Tomorrow', tasks: [] },
    thisWeek: { title: 'Next 7 Days', tasks: [] },
    later: { title: 'Later', tasks: [] },
    noDate: { title: 'No Date', tasks: [] }
  };
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const nextWeekStr = nextWeek.toISOString().split('T')[0];
  
  tasks.forEach(task => {
    if (!task.due_date) {
      groups.noDate.tasks.push(task);
      return;
    }
    
    const taskDate = task.due_date.split('T')[0];
    
    if (taskDate < todayStr) {
      groups.overdue.tasks.push(task);
    } else if (taskDate === todayStr) {
      groups.today.tasks.push(task);
    } else if (taskDate === tomorrowStr) {
      groups.tomorrow.tasks.push(task);
    } else if (taskDate <= nextWeekStr) {
      groups.thisWeek.tasks.push(task);
    } else {
      groups.later.tasks.push(task);
    }
  });
  
  // Filter out empty groups
  return Object.entries(groups)
    .filter(([key, group]) => group.tasks.length > 0)
    .map(([key, group]) => group);
}

export function groupTasksByPriority(tasks) {
  const priorityOrder = ['urgente', 'alta', 'media', 'baja', null];
  const priorityLabels = {
    'urgente': 'Urgent',
    'alta': 'High',
    'media': 'Medium', 
    'baja': 'Low',
    null: 'No Priority'
  };
  
  const groups = {};
  
  priorityOrder.forEach(priority => {
    const groupTasks = tasks.filter(task => 
      (task.priority || null) === priority
    );
    
    if (groupTasks.length > 0) {
      groups[priority] = {
        title: priorityLabels[priority],
        tasks: groupTasks
      };
    }
  });
  
  return Object.values(groups);
}
