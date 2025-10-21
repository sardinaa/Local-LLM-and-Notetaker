// Mobile Debug Script - Run this in browser console
console.log('=== MOBILE DEBUG INFO ===');

// Check container
const container = document.querySelector('.container');
console.log('Container:', {
    exists: !!container,
    display: container ? getComputedStyle(container).display : null,
    height: container ? getComputedStyle(container).height : null
});

// Check mobile header
const mobileHeader = document.querySelector('.mobile-header');
console.log('Mobile Header:', {
    exists: !!mobileHeader,
    display: mobileHeader ? getComputedStyle(mobileHeader).display : null,
    height: mobileHeader ? getComputedStyle(mobileHeader).height : null
});

// Check content
const content = document.querySelector('.content');
console.log('Content:', {
    exists: !!content,
    display: content ? getComputedStyle(content).display : null,
    position: content ? getComputedStyle(content).position : null,
    height: content ? getComputedStyle(content).height : null,
    background: content ? getComputedStyle(content).background : null,
    overflow: content ? getComputedStyle(content).overflow : null
});

// Check dynamic tabs
const dynamicTabs = document.querySelector('.dynamic-tabs');
console.log('Dynamic Tabs:', {
    exists: !!dynamicTabs,
    display: dynamicTabs ? getComputedStyle(dynamicTabs).display : null,
    height: dynamicTabs ? getComputedStyle(dynamicTabs).height : null
});

// Check all sections
const sections = ['notesSection', 'chatSection', 'tasksSection', 'jobsSection', 'agentsSection', 'tagsSection', 'calendarSection', 'shoppingSection'];
sections.forEach(id => {
    const section = document.getElementById(id);
    if (section) {
        const styles = getComputedStyle(section);
        console.log(`Section #${id}:`, {
            exists: true,
            hasIsHidden: section.classList.contains('is-hidden'),
            display: styles.display,
            position: styles.position,
            top: styles.top,
            left: styles.left,
            width: styles.width,
            height: styles.height,
            background: styles.background,
            zIndex: styles.zIndex,
            visibility: styles.visibility,
            opacity: styles.opacity
        });
        
        // Check if it has any child elements
        console.log(`  Children of #${id}:`, section.children.length);
        if (section.children.length > 0) {
            Array.from(section.children).forEach((child, idx) => {
                const childStyles = getComputedStyle(child);
                console.log(`    Child ${idx} (${child.className || child.tagName}):`, {
                    display: childStyles.display,
                    height: childStyles.height,
                    visibility: childStyles.visibility
                });
            });
        }
    } else {
        console.log(`Section #${id}: NOT FOUND`);
    }
});

console.log('=== END DEBUG INFO ===');
