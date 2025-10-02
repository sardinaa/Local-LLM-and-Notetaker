(function initRouterNamespace(window) {
  if (!window) {
    return;
  }

  /**
   * Lightweight application router that synchronizes URL query parameters with UI state.
   * Supports section-based routing using the `section` query parameter and arbitrary
   * additional parameters that route handlers can consume.
   */
  class AppRouter {
    constructor(options = {}) {
      this.routes = new Map();
      this.listeners = new Set();
      this.currentRoute = null;
      this.defaultSection = options.defaultSection || 'notes';
      this.isInitialized = false;

      this.handlePopState = this.handlePopState.bind(this);
    }

    registerRoute(section, handler) {
      if (!section || typeof handler !== 'function') {
        console.warn('AppRouter.registerRoute called with invalid arguments', section);
        return;
      }
      this.routes.set(section, handler);
    }

    unregisterRoute(section) {
      this.routes.delete(section);
    }

    onRouteChange(listener) {
      if (typeof listener === 'function') {
        this.listeners.add(listener);
      }
      return () => this.listeners.delete(listener);
    }

    offRouteChange(listener) {
      this.listeners.delete(listener);
    }

    start() {
      if (this.isInitialized) {
        return;
      }
      this.isInitialized = true;
      window.addEventListener('popstate', this.handlePopState);
      const route = this.parseURL(window.location);
      // Keep history state in sync with parsed route on first load
      this.replaceHistoryState(route, { source: 'initial' });
      this.handleRoute(route, { source: 'initial', pushHistory: false, fromPopState: false });
    }

    stop() {
      window.removeEventListener('popstate', this.handlePopState);
      this.isInitialized = false;
    }

    navigateTo(routeInput, options = {}) {
      const route = this.normalizeRoute(routeInput);
      const { pushHistory = true, replace = false, state = {}, source = 'navigate' } = options;

      const url = this.buildURL(route);
      if (pushHistory && window.history) {
        const historyState = { ...(state || {}), section: route.section, params: route.params };
        if (replace) {
          window.history.replaceState(historyState, '', url);
        } else {
          window.history.pushState(historyState, '', url);
        }
      }

      this.handleRoute(route, { source, pushHistory, fromPopState: false, state });
    }

    replaceHistoryState(route, metadata = {}) {
      if (!window.history) {
        return;
      }
      const normalized = this.normalizeRoute(route);
      const url = this.buildURL(normalized);
      const historyState = { section: normalized.section, params: normalized.params, ...(metadata.state || {}) };
      window.history.replaceState(historyState, '', url);
    }

    parseURL(locationLike) {
      const locationObj = locationLike || window.location;
      const url = locationObj instanceof URL ? locationObj : new URL(locationObj.href || String(locationObj), window.location.origin);
      const params = {};
      const query = url.searchParams;

      // Infer section for backward compatibility if not explicitly provided
      const rawSection = query.get('section') || this.inferLegacySection(query) || this.defaultSection;
      const section = (rawSection || this.defaultSection || 'notes').toLowerCase();

      query.forEach((value, key) => {
        if (key === 'section') {
          return;
        }
        params[key] = value;
      });

      return { section, params, url };
    }

    inferLegacySection(searchParams) {
      if (!searchParams) {
        return null;
      }
      if (searchParams.has('view')) {
        // Legacy tasks routes used ?view=...
        return 'tasks';
      }
      return null;
    }

    normalizeRoute(routeInput) {
      if (!routeInput) {
        return { section: this.defaultSection, params: {} };
      }

      if (typeof routeInput === 'string') {
        return { section: routeInput.toLowerCase(), params: {} };
      }

      const { section, params } = routeInput;
      const normalizedSection = (section || this.defaultSection || 'notes').toLowerCase();
      const normalizedParams = {};

      if (params && typeof params === 'object') {
        Object.keys(params).forEach((key) => {
          const value = params[key];
          if (value !== undefined && value !== null && value !== '') {
            normalizedParams[key] = String(value);
          }
        });
      }

      return { section: normalizedSection, params: normalizedParams };
    }

    buildURL(routeInput) {
      const route = this.normalizeRoute(routeInput);
      const url = new URL(window.location.pathname, window.location.origin);

      if (route.section && route.section !== this.defaultSection) {
        url.searchParams.set('section', route.section);
      } else {
        url.searchParams.delete('section');
      }

      // Clear existing params before setting new ones
      Array.from(url.searchParams.keys()).forEach((key) => {
        if (key !== 'section') {
          url.searchParams.delete(key);
        }
      });

      Object.entries(route.params || {}).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      return url.toString();
    }

    handlePopState(event) {
      const route = this.parseURL(window.location);
      this.handleRoute(route, { source: 'popstate', pushHistory: false, fromPopState: true, state: event?.state || {} });
    }

    handleRoute(routeInput, metadata = {}) {
      const route = this.normalizeRoute(routeInput);
      const handler = this.routes.get(route.section) || this.routes.get('*');

      if (!handler) {
        console.warn(`No route handler registered for section "${route.section}"`);
        return;
      }

      this.currentRoute = route;

      try {
        handler(route, metadata);
      } catch (error) {
        console.error(`Error handling route ${route.section}`, error);
      }

      this.emit(route, metadata);
    }

    emit(route, metadata) {
      this.listeners.forEach((listener) => {
        try {
          listener(route, metadata);
        } catch (error) {
          console.error('AppRouter listener failed', error);
        }
      });
    }

    getCurrentRoute() {
      return this.currentRoute;
    }
  }

  window.AppRouter = AppRouter;
})(window);
