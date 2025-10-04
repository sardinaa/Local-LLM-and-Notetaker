/**
 * Force-Directed Graph Visualization for Tag Hierarchy
 * Features:
 * - Interactive force-directed layout
 * - Node sizing by usage count
 * - Color coding by category
 * - Search and highlight
 * - Zoom and pan controls
 * - Interactive tooltips
 * - Layout switching
 */

export default class TagGraphView {
    constructor(tagsManager) {
        this.tagsManager = tagsManager;
        this.svg = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.transform = null;
        this.selectedNode = null;
        this.hoveredNode = null;
        this.searchHighlight = new Set();
        this.categoryColors = this.initCategoryColors();
        
        // Track active filter states
        this.activeFilters = {
            category: null,
            hierarchy: null
        };
    }

    initCategoryColors() {
        return {
            'default': '#6366f1',
            'food': '#ef4444',
            'tech': '#3b82f6',
            'work': '#8b5cf6',
            'personal': '#ec4899',
            'travel': '#14b8a6',
            'health': '#10b981',
            'finance': '#f59e0b',
            'education': '#06b6d4',
            'entertainment': '#f43f5e'
        };
    }

    getTagColor(tag) {
        // First, try to use the tag's custom color
        if (tag.color && tag.color !== 'default' && tag.color.startsWith('#')) {
            return tag.color;
        }
        
        // If the color is a named color, try to map it
        const colorMap = {
            'red': '#ef4444',
            'blue': '#3b82f6',
            'green': '#10b981',
            'yellow': '#f59e0b',
            'purple': '#8b5cf6',
            'pink': '#ec4899',
            'indigo': '#6366f1',
            'teal': '#14b8a6',
            'cyan': '#06b6d4',
            'orange': '#f97316',
            'lime': '#84cc16',
            'emerald': '#10b981',
            'sky': '#0ea5e9',
            'violet': '#8b5cf6',
            'fuchsia': '#d946ef',
            'rose': '#f43f5e'
        };
        
        if (tag.color && colorMap[tag.color.toLowerCase()]) {
            return colorMap[tag.color.toLowerCase()];
        }
        
        // Fall back to category color
        return this.getCategoryColor(tag.category);
    }

    async init() {
        console.log('Initializing Tag Graph View...');
        this.setupContainer();
        this.setupControls();
        await this.loadGraphData();
        this.createForceSimulation();
        this.render();
    }

    setupContainer() {
        const container = document.getElementById('tagsGraphContainer');
        if (!container) {
            console.error('Graph container not found');
            return;
        }

        // Clear existing content
        container.innerHTML = '';

        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('class', 'tags-graph-svg');

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.transform = event.transform;
                svg.select('.graph-container').attr('transform', event.transform);
            });

        svg.call(zoom);

        // Create container group
        this.container = svg.append('g')
            .attr('class', 'graph-container');

        // Create arrow markers for edges
        svg.append('defs').selectAll('marker')
            .data(['default', 'highlighted', 'selected'])
            .enter()
            .append('marker')
            .attr('id', d => `arrow-${d}`)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', d => {
                if (d === 'highlighted') return '#f59e0b';
                if (d === 'selected') return '#6366f1';
                return '#94a3b8';
            });

        // Create links group
        this.linksGroup = this.container.append('g').attr('class', 'links');

        // Create nodes group
        this.nodesGroup = this.container.append('g').attr('class', 'nodes');

        // Create labels group
        this.labelsGroup = this.container.append('g').attr('class', 'labels');

        this.svg = svg;
    }

    setupControls() {
        // Hook into the main search bar (tags search input)
        const mainSearchInput = document.getElementById('tagsSearchInput');
        if (mainSearchInput) {
            // Store reference to handle search from main input
            this.searchHandler = (e) => {
                this.handleGraphSearch(e.target.value);
            };
            mainSearchInput.addEventListener('input', this.searchHandler);
        }

        // Hook into the main category filter
        const categoryFilter = document.getElementById('tagsCategoryFilter');
        if (categoryFilter) {
            this.categoryFilterHandler = (e) => {
                this.handleCategoryFilter(e.target.value);
            };
            categoryFilter.addEventListener('change', this.categoryFilterHandler);
        }

        // Hook into the main hierarchy filter
        const hierarchyFilter = document.getElementById('tagsHierarchyFilter');
        if (hierarchyFilter) {
            this.hierarchyFilterHandler = (e) => {
                this.handleHierarchyFilter(e.target.value);
            };
            hierarchyFilter.addEventListener('change', this.hierarchyFilterHandler);
        }

        // Reset zoom button
        const resetZoomBtn = document.getElementById('graphResetZoom');
        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => {
                this.resetZoom();
            });
        }

        // Layout controls
        const layoutSelect = document.getElementById('graphLayoutSelect');
        if (layoutSelect) {
            layoutSelect.addEventListener('change', (e) => {
                this.changeLayout(e.target.value);
            });
        }

        // Strength controls
        const strengthSlider = document.getElementById('graphStrengthSlider');
        const strengthValue = document.getElementById('graphStrengthValue');
        if (strengthSlider) {
            strengthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.updateForceStrength(value);
                
                // Update label
                if (strengthValue) {
                    if (value < 250) strengthValue.textContent = 'Very Tight';
                    else if (value < 350) strengthValue.textContent = 'Tight';
                    else if (value < 450) strengthValue.textContent = 'Medium';
                    else if (value < 550) strengthValue.textContent = 'Loose';
                    else strengthValue.textContent = 'Very Loose';
                }
            });
        }

        // Toggle labels
        const toggleLabelsBtn = document.getElementById('graphToggleLabels');
        if (toggleLabelsBtn) {
            toggleLabelsBtn.addEventListener('click', () => {
                this.toggleLabels();
            });
        }
    }

    async loadGraphData() {
        // Get all tags from the manager
        const tags = Array.from(this.tagsManager.tags.values());

        // Create nodes
        this.nodes = tags.map(tag => ({
            id: tag.id,
            label: tag.name,
            slug: tag.slug,
            description: tag.description || '',
            usage: tag.usageCount || 0,
            category: tag.category || 'default',
            color: this.getTagColor(tag),
            parentIds: tag.parentIds || [],
            children: tag.children || [],
            x: Math.random() * 800,
            y: Math.random() * 600
        }));

        // Create links from parent-child relationships
        this.links = [];
        this.nodes.forEach(node => {
            // Use multi-parent relationships
            if (node.parentIds && node.parentIds.length > 0) {
                node.parentIds.forEach(parentId => {
                    this.links.push({
                        source: parentId,
                        target: node.id,
                        type: 'parent'
                    });
                });
            }
        });

        console.log(`Loaded ${this.nodes.length} nodes and ${this.links.length} links`);
    }

    getCategoryColor(category) {
        return this.categoryColors[category] || this.categoryColors['default'];
    }

    getNodeRadius(usage) {
        // Size nodes based on usage count (min: 8, max: 30)
        const minRadius = 8;
        const maxRadius = 30;
        const maxUsage = Math.max(...this.nodes.map(n => n.usage), 1);
        return minRadius + ((usage / maxUsage) * (maxRadius - minRadius));
    }

    createForceSimulation() {
        const width = document.getElementById('tagsGraphContainer').clientWidth;
        const height = document.getElementById('tagsGraphContainer').clientHeight;

        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(100)
                .strength(0.5))
            .force('charge', d3.forceManyBody()
                .strength(-300)
                .distanceMax(600))
            .force('center', d3.forceCenter(width / 2, height / 2)
                .strength(0.05)) // Weak centering to prevent drift
            .force('collision', d3.forceCollide()
                .radius(d => this.getNodeRadius(d.usage) + 10)
                .strength(0.7))
            .force('x', d3.forceX(width / 2).strength(0.02)) // Very weak X positioning
            .force('y', d3.forceY(height / 2).strength(0.02)) // Very weak Y positioning
            .alphaDecay(0.02) // Slower cooling for smoother settling
            .velocityDecay(0.4) // Medium friction
            .on('tick', () => this.tick());

        console.log('Force simulation created');
    }

    render() {
        // Render links
        const link = this.linksGroup.selectAll('line')
            .data(this.links)
            .join('line')
            .attr('class', 'graph-link')
            .attr('stroke', '#cbd5e1')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', 'url(#arrow-default)');

        // Render nodes
        const node = this.nodesGroup.selectAll('g')
            .data(this.nodes)
            .join('g')
            .attr('class', 'graph-node')
            .call(this.drag());

        // Add circles to nodes
        node.append('circle')
            .attr('r', d => this.getNodeRadius(d.usage))
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('class', 'node-circle')
            .style('cursor', 'pointer');

        // Add usage count badge
        node.filter(d => d.usage > 0)
            .append('circle')
            .attr('r', 10)
            .attr('cx', d => this.getNodeRadius(d.usage) * 0.6)
            .attr('cy', d => -this.getNodeRadius(d.usage) * 0.6)
            .attr('fill', '#1e293b')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('class', 'usage-badge');

        node.filter(d => d.usage > 0)
            .append('text')
            .attr('x', d => this.getNodeRadius(d.usage) * 0.6)
            .attr('y', d => -this.getNodeRadius(d.usage) * 0.6)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#fff')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .attr('class', 'usage-text')
            .text(d => d.usage);

        // Add labels
        const label = this.labelsGroup.selectAll('text')
            .data(this.nodes)
            .join('text')
            .attr('class', 'graph-label')
            .attr('text-anchor', 'middle')
            .attr('dy', d => this.getNodeRadius(d.usage) + 15)
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .attr('fill', '#1e293b')
            .attr('pointer-events', 'none')
            .text(d => d.label);

        // Add tooltips
        node.on('mouseenter', (event, d) => this.showTooltip(event, d))
            .on('mouseleave', () => this.hideTooltip())
            .on('click', (event, d) => this.handleNodeClick(event, d));

        // Highlight on hover
        node.on('mouseenter', (event, d) => {
            this.hoveredNode = d;
            this.highlightConnections(d);
        })
        .on('mouseleave', () => {
            this.hoveredNode = null;
            this.clearHighlights();
        });

        this.link = link;
        this.node = node;
        this.label = label;
    }

    tick() {
        // Update link positions
        if (this.link) {
            this.link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
        }

        // Update node positions
        if (this.node) {
            this.node.attr('transform', d => `translate(${d.x},${d.y})`);
        }

        // Update label positions
        if (this.label) {
            this.label
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        }
    }

    drag() {
        function dragstarted(event, d) {
            if (!event.active) this.simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) this.simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        return d3.drag()
            .on('start', dragstarted.bind(this))
            .on('drag', dragged.bind(this))
            .on('end', dragended.bind(this));
    }

    highlightConnections(node) {
        const connectedNodeIds = new Set();
        
        // Find connected nodes
        this.links.forEach(link => {
            if (link.source.id === node.id) {
                connectedNodeIds.add(link.target.id);
            }
            if (link.target.id === node.id) {
                connectedNodeIds.add(link.source.id);
            }
        });

        // Highlight connected nodes
        this.node.selectAll('.node-circle')
            .attr('opacity', d => {
                if (d.id === node.id) return 1;
                if (connectedNodeIds.has(d.id)) return 1;
                return 0.2;
            })
            .attr('stroke-width', d => {
                if (d.id === node.id) return 4;
                if (connectedNodeIds.has(d.id)) return 3;
                return 2;
            });

        // Highlight connected links
        this.link
            .attr('stroke-opacity', d => {
                if (d.source.id === node.id || d.target.id === node.id) return 1;
                return 0.1;
            })
            .attr('stroke-width', d => {
                if (d.source.id === node.id || d.target.id === node.id) return 3;
                return 2;
            })
            .attr('stroke', d => {
                if (d.source.id === node.id || d.target.id === node.id) return '#f59e0b';
                return '#cbd5e1';
            })
            .attr('marker-end', d => {
                if (d.source.id === node.id || d.target.id === node.id) return 'url(#arrow-highlighted)';
                return 'url(#arrow-default)';
            });

        // Highlight labels
        this.label
            .attr('opacity', d => {
                if (d.id === node.id) return 1;
                if (connectedNodeIds.has(d.id)) return 1;
                return 0.2;
            })
            .attr('font-weight', d => {
                if (d.id === node.id) return 'bold';
                if (connectedNodeIds.has(d.id)) return '600';
                return '400';
            });
    }

    clearHighlights() {
        // Check if we have active filters or search highlights
        if (this.activeFilters.category || this.activeFilters.hierarchy) {
            // Restore the active filter view
            this.applyFilters();
        } else if (this.searchHighlight.size > 0) {
            // Maintain search highlights
            this.applySearchHighlight();
        } else {
            // No filters or highlights active - reset to default view
            this.node.selectAll('.node-circle')
                .attr('opacity', 1)
                .attr('stroke-width', 2)
                .attr('stroke', '#fff'); // Reset stroke color to white

            this.link
                .attr('stroke-opacity', 0.6)
                .attr('stroke-width', 2)
                .attr('stroke', '#cbd5e1')
                .attr('marker-end', 'url(#arrow-default)');

            this.label
                .attr('opacity', 1)
                .attr('font-weight', '600');
        }
    }

    showTooltip(event, node) {
        const tooltip = document.getElementById('graphTooltip');
        if (!tooltip) {
            // Create tooltip if it doesn't exist
            const tooltipDiv = document.createElement('div');
            tooltipDiv.id = 'graphTooltip';
            tooltipDiv.className = 'graph-tooltip';
            document.body.appendChild(tooltipDiv);
        }

        const tooltipEl = document.getElementById('graphTooltip');
        
        const parentNames = node.parentIds
            .map(pid => this.nodes.find(n => n.id === pid)?.label)
            .filter(Boolean)
            .join(', ');

        const childrenCount = node.children?.length || 0;

        tooltipEl.innerHTML = `
            <div class="tooltip-header">
                <strong>${node.label}</strong>
                ${node.category !== 'default' ? `<span class="tooltip-category">${node.category}</span>` : ''}
            </div>
            ${node.description ? `<div class="tooltip-description">${node.description}</div>` : ''}
            <div class="tooltip-stats">
                <div class="tooltip-stat">
                    <i class="fas fa-file-alt"></i>
                    <span>${node.usage} note${node.usage !== 1 ? 's' : ''}</span>
                </div>
                ${parentNames ? `
                    <div class="tooltip-stat">
                        <i class="fas fa-layer-group"></i>
                        <span>Parents: ${parentNames}</span>
                    </div>
                ` : ''}
                ${childrenCount > 0 ? `
                    <div class="tooltip-stat">
                        <i class="fas fa-sitemap"></i>
                        <span>${childrenCount} child${childrenCount !== 1 ? 'ren' : ''}</span>
                    </div>
                ` : ''}
            </div>
        `;

        tooltipEl.style.display = 'block';
        tooltipEl.style.left = (event.pageX + 10) + 'px';
        tooltipEl.style.top = (event.pageY + 10) + 'px';
    }

    hideTooltip() {
        const tooltip = document.getElementById('graphTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    handleNodeClick(event, node) {
        event.stopPropagation();
        
        // Deselect previous
        if (this.selectedNode) {
            this.node.filter(d => d.id === this.selectedNode.id)
                .selectAll('.node-circle')
                .attr('stroke', '#fff')
                .attr('stroke-width', 2);
        }

        // Select new
        this.selectedNode = node;
        this.node.filter(d => d.id === node.id)
            .selectAll('.node-circle')
            .attr('stroke', '#6366f1')
            .attr('stroke-width', 4);

        // Show tag details
        if (this.tagsManager && typeof this.tagsManager.showTagDetails === 'function') {
            this.tagsManager.showTagDetails(node.id);
        }
    }

    handleGraphSearch(query) {
        this.searchHighlight.clear();

        if (!query.trim()) {
            this.clearHighlights();
            return;
        }

        const lowerQuery = query.toLowerCase();

        // Find matching nodes
        this.nodes.forEach(node => {
            if (node.label.toLowerCase().includes(lowerQuery) ||
                node.description.toLowerCase().includes(lowerQuery) ||
                node.slug.toLowerCase().includes(lowerQuery)) {
                this.searchHighlight.add(node.id);
            }
        });

        this.applySearchHighlight();
    }

    applySearchHighlight() {
        if (this.searchHighlight.size === 0) {
            this.clearHighlights();
            return;
        }

        // Highlight matching nodes
        this.node.selectAll('.node-circle')
            .attr('opacity', d => this.searchHighlight.has(d.id) ? 1 : 0.2)
            .attr('stroke-width', d => this.searchHighlight.has(d.id) ? 4 : 2)
            .attr('stroke', d => this.searchHighlight.has(d.id) ? '#f59e0b' : '#fff');

        // Fade non-matching links
        this.link
            .attr('stroke-opacity', d => {
                if (this.searchHighlight.has(d.source.id) || this.searchHighlight.has(d.target.id)) return 0.6;
                return 0.1;
            });

        // Highlight matching labels
        this.label
            .attr('opacity', d => this.searchHighlight.has(d.id) ? 1 : 0.2)
            .attr('font-weight', d => this.searchHighlight.has(d.id) ? 'bold' : '400');

        // Center on first match
        if (this.searchHighlight.size > 0) {
            const firstMatch = this.nodes.find(n => this.searchHighlight.has(n.id));
            if (firstMatch) {
                this.centerOnNode(firstMatch);
            }
        }
    }

    handleCategoryFilter(category) {
        // Clear search highlight first
        this.searchHighlight.clear();
        
        // Track the active category filter (don't clear hierarchy)
        this.activeFilters.category = category || null;

        if (!category || category === '') {
            // Clear category filter
            this.activeFilters.category = null;
        }

        // Apply combined filters
        this.applyFilters();
    }

    handleHierarchyFilter(filterValue) {
        // Clear search highlight first
        this.searchHighlight.clear();
        
        // Track the active hierarchy filter (don't clear category)
        this.activeFilters.hierarchy = filterValue || null;

        if (!filterValue || filterValue === '') {
            // Clear hierarchy filter
            this.activeFilters.hierarchy = null;
        }

        // Apply combined filters
        this.applyFilters();
    }

    applyFilters() {
        // Determine which nodes match the active filters
        let matchingNodes = new Set();
        
        // Check if we have any active filters
        const hasFilters = this.activeFilters.category || this.activeFilters.hierarchy;
        
        if (!hasFilters) {
            // No active filters - show everything
            this.node.selectAll('.node-circle')
                .attr('opacity', 1)
                .attr('stroke-width', 2)
                .attr('stroke', '#fff'); // Reset stroke color to white

            this.link
                .attr('stroke-opacity', 0.6);

            this.label
                .attr('opacity', 1)
                .attr('font-weight', '600');
            return;
        }
        
        // Build sets for each filter type
        let categoryMatches = null;
        let hierarchyMatches = null;
        
        if (this.activeFilters.category) {
            categoryMatches = new Set();
            this.nodes.forEach(node => {
                if (node.category === this.activeFilters.category) {
                    categoryMatches.add(node.id);
                }
            });
        }
        
        if (this.activeFilters.hierarchy === 'parents') {
            hierarchyMatches = new Set();
            this.nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                    hierarchyMatches.add(node.id);
                }
            });
        } else if (this.activeFilters.hierarchy === 'children') {
            hierarchyMatches = new Set();
            this.nodes.forEach(node => {
                if (node.parentIds && node.parentIds.length > 0) {
                    hierarchyMatches.add(node.id);
                }
            });
        }
        
        // Combine filters with AND logic
        if (categoryMatches && hierarchyMatches) {
            // Both filters active - node must match BOTH
            this.nodes.forEach(node => {
                if (categoryMatches.has(node.id) && hierarchyMatches.has(node.id)) {
                    matchingNodes.add(node.id);
                }
            });
        } else if (categoryMatches) {
            // Only category filter
            matchingNodes = categoryMatches;
        } else if (hierarchyMatches) {
            // Only hierarchy filter
            matchingNodes = hierarchyMatches;
        }

        // Apply the filter visualization
        this.node.selectAll('.node-circle')
            .attr('opacity', d => matchingNodes.has(d.id) ? 1 : 0.15)
            .attr('stroke-width', d => matchingNodes.has(d.id) ? 3 : 2)
            .attr('stroke', '#fff'); // Reset stroke color to white

        // Filter links - highlight links connected to matching nodes
        this.link
            .attr('stroke-opacity', d => {
                const sourceMatches = matchingNodes.has(d.source.id);
                const targetMatches = matchingNodes.has(d.target.id);
                if (sourceMatches && targetMatches) return 0.6;
                if (sourceMatches || targetMatches) return 0.2;
                return 0.05;
            });

        // Filter labels
        this.label
            .attr('opacity', d => matchingNodes.has(d.id) ? 1 : 0.15)
            .attr('font-weight', d => matchingNodes.has(d.id) ? '600' : '400');
    }

    centerOnNode(node) {
        const width = document.getElementById('tagsGraphContainer').clientWidth;
        const height = document.getElementById('tagsGraphContainer').clientHeight;

        const scale = this.transform?.k || 1;
        const x = width / 2 - node.x * scale;
        const y = height / 2 - node.y * scale;

        this.svg.transition()
            .duration(750)
            .call(
                d3.zoom().transform,
                d3.zoomIdentity.translate(x, y).scale(scale)
            );
    }

    resetZoom() {
        this.svg.transition()
            .duration(750)
            .call(
                d3.zoom().transform,
                d3.zoomIdentity
            );
    }

    changeLayout(layout) {
        // Stop current simulation
        this.simulation.stop();

        // Apply new layout
        switch (layout) {
            case 'force':
                // Clear any fixed positions from previous layouts
                this.nodes.forEach(node => {
                    node.fx = null;
                    node.fy = null;
                });
                this.createForceSimulation();
                break;
            case 'radial':
                this.applyRadialLayout();
                break;
            case 'hierarchical':
                this.applyHierarchicalLayout();
                break;
            case 'circular':
                this.applyCircularLayout();
                break;
        }

        // Restart simulation
        this.simulation.alpha(1).restart();
    }

    applyRadialLayout() {
        // Find root nodes (no parents)
        const roots = this.nodes.filter(n => !n.parentIds || n.parentIds.length === 0);
        
        const width = document.getElementById('tagsGraphContainer').clientWidth;
        const height = document.getElementById('tagsGraphContainer').clientHeight;
        const centerX = width / 2;
        const centerY = height / 2;

        // Place roots in center
        roots.forEach((node, i) => {
            const angle = (i / roots.length) * 2 * Math.PI;
            node.fx = centerX + Math.cos(angle) * 50;
            node.fy = centerY + Math.sin(angle) * 50;
        });

        // Place children in rings
        const visited = new Set(roots.map(n => n.id));
        let currentLevel = roots;
        let radius = 150;

        while (currentLevel.length > 0) {
            const nextLevel = [];
            
            currentLevel.forEach(parent => {
                const children = this.nodes.filter(n => 
                    n.parentIds?.includes(parent.id) && !visited.has(n.id)
                );

                children.forEach((child, i) => {
                    const angle = ((i + Math.random()) / children.length) * 2 * Math.PI;
                    child.fx = centerX + Math.cos(angle) * radius;
                    child.fy = centerY + Math.sin(angle) * radius;
                    visited.add(child.id);
                    nextLevel.push(child);
                });
            });

            currentLevel = nextLevel;
            radius += 150;
        }

        // Update simulation forces
        this.simulation
            .force('charge', d3.forceManyBody().strength(-100))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(50));
    }

    applyHierarchicalLayout() {
        const width = document.getElementById('tagsGraphContainer').clientWidth;
        const height = document.getElementById('tagsGraphContainer').clientHeight;

        // Create hierarchy
        const roots = this.nodes.filter(n => !n.parentIds || n.parentIds.length === 0);
        
        // Assign levels using BFS
        const levels = new Map();
        const queue = roots.map(n => ({ node: n, level: 0 }));
        const visited = new Set();

        while (queue.length > 0) {
            const { node, level } = queue.shift();
            if (visited.has(node.id)) continue;
            
            visited.add(node.id);
            
            if (!levels.has(level)) {
                levels.set(level, []);
            }
            levels.get(level).push(node);

            // Add children to queue
            this.nodes.forEach(child => {
                if (child.parentIds?.includes(node.id) && !visited.has(child.id)) {
                    queue.push({ node: child, level: level + 1 });
                }
            });
        }

        // Position nodes by level
        const levelHeight = height / (levels.size + 1);
        
        levels.forEach((nodesInLevel, level) => {
            const levelWidth = width / (nodesInLevel.length + 1);
            nodesInLevel.forEach((node, i) => {
                node.fx = levelWidth * (i + 1);
                node.fy = levelHeight * (level + 1);
            });
        });

        // Update simulation forces
        this.simulation
            .force('charge', d3.forceManyBody().strength(-50))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(100));
    }

    applyCircularLayout() {
        const width = document.getElementById('tagsGraphContainer').clientWidth;
        const height = document.getElementById('tagsGraphContainer').clientHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.4;

        this.nodes.forEach((node, i) => {
            const angle = (i / this.nodes.length) * 2 * Math.PI;
            node.fx = centerX + Math.cos(angle) * radius;
            node.fy = centerY + Math.sin(angle) * radius;
        });

        // Update simulation forces
        this.simulation
            .force('charge', d3.forceManyBody().strength(-50))
            .force('link', d3.forceLink(this.links).id(d => d.id).distance(50));
    }

    updateForceStrength(value) {
        const strength = -value;
        // Adjust link distance proportionally - higher repulsion = longer links
        const linkDistance = Math.max(50, value * 0.3);
        // Adjust link strength inversely - higher repulsion = stronger links to hold together
        const linkStrength = Math.min(1, 150 / value);
        
        this.simulation
            .force('charge', d3.forceManyBody()
                .strength(strength)
                .distanceMax(value * 2))
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(linkDistance)
                .strength(linkStrength))
            .force('center', d3.forceCenter(
                document.getElementById('tagsGraphContainer').clientWidth / 2,
                document.getElementById('tagsGraphContainer').clientHeight / 2
            ).strength(0.05)) // Add weak centering force to prevent drift
            .alpha(0.5) // Higher alpha for more movement
            .alphaTarget(0.3) // Keep simulation warm
            .restart();
            
        // Cool down after a bit
        setTimeout(() => {
            this.simulation.alphaTarget(0);
        }, 1000);
    }

    filterByCategory(category) {
        if (!category || category === 'all') {
            this.node.style('display', 'block');
            this.label.style('display', 'block');
            return;
        }

        this.node.style('display', d => d.category === category ? 'block' : 'none');
        this.label.style('display', d => d.category === category ? 'block' : 'none');
    }

    toggleLabels() {
        const currentDisplay = this.label.style('display');
        const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
        this.label.style('display', newDisplay);
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }
        
        // Remove search handler from main search input
        const mainSearchInput = document.getElementById('tagsSearchInput');
        if (mainSearchInput && this.searchHandler) {
            mainSearchInput.removeEventListener('input', this.searchHandler);
        }
        
        // Remove category filter handler
        const categoryFilter = document.getElementById('tagsCategoryFilter');
        if (categoryFilter && this.categoryFilterHandler) {
            categoryFilter.removeEventListener('change', this.categoryFilterHandler);
        }
        
        // Remove hierarchy filter handler
        const hierarchyFilter = document.getElementById('tagsHierarchyFilter');
        if (hierarchyFilter && this.hierarchyFilterHandler) {
            hierarchyFilter.removeEventListener('change', this.hierarchyFilterHandler);
        }
        
        const tooltip = document.getElementById('graphTooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
}
