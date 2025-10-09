// 🔍 Web Search Complete Diagnostic
// Copy-paste this entire script into your browser console

console.log('='.repeat(60));
console.log('🔍 WEB SEARCH DIAGNOSTIC');
console.log('='.repeat(60));

// ==================== STEP 1: Check Bundle & Modules ====================
console.log('\n📦 STEP 1: Checking if bundle and modules are loaded...');
const bundleLoaded = typeof ChatBundle !== 'undefined';
const useChatModules = window.__USE_CHAT_MODULES__;
const forceSearchFn = typeof window.shouldForceWebSearch === 'function';
const sourceManager = !!window.sourceDisplayManager;
const chatModules = window.ChatModules;

console.log('   ✓ ChatBundle loaded:', bundleLoaded);
console.log('   ✓ __USE_CHAT_MODULES__ flag:', useChatModules);
console.log('   ✓ shouldForceWebSearch() function:', forceSearchFn);
console.log('   ✓ sourceDisplayManager:', sourceManager);
console.log('   ✓ ChatModules object:', !!chatModules);

if (chatModules) {
    console.log('     - webSearch module:', !!chatModules.webSearch);
    console.log('     - sourceDisplay module:', !!chatModules.sourceDisplay);
    console.log('     - controller module:', !!chatModules.controller);
    console.log('     - ui module:', !!chatModules.ui);
}

// ==================== STEP 2: Check Toggle Button ====================
console.log('\n🔘 STEP 2: Checking toggle button...');
const toggleBtn = document.getElementById('webSearchToggleBtn');
console.log('   ✓ Button element:', !!toggleBtn);

if (toggleBtn) {
    const styles = window.getComputedStyle(toggleBtn);
    const visible = styles.display !== 'none' && styles.visibility !== 'hidden';
    console.log('   ✓ Button visible:', visible);
    console.log('   ✓ Button classes:', toggleBtn.className);
    console.log('   ✓ Button inner HTML:', toggleBtn.innerHTML);
} else {
    console.log('   ❌ Toggle button NOT FOUND in DOM!');
    console.log('   💡 Modules may not have initialized.');
}

// ==================== STEP 3: Check Current Toggle State ====================
console.log('\n🎚️  STEP 3: Checking current toggle state...');
if (forceSearchFn) {
    const isActive = window.shouldForceWebSearch();
    console.log('   ✓ Force search currently active:', isActive);
    if (toggleBtn) {
        console.log('   ✓ Button has "active" class:', toggleBtn.classList.contains('active'));
    }
} else {
    console.log('   ❌ shouldForceWebSearch() function not available!');
}

// ==================== STEP 4: Test Toggle Activation ====================
console.log('\n🔄 STEP 4: Testing toggle activation...');
if (toggleBtn && forceSearchFn) {
    console.log('   → Clicking toggle button...');
    toggleBtn.click();
    
    setTimeout(() => {
        const isActiveNow = window.shouldForceWebSearch();
        console.log('   ✓ Toggle state after click:', isActiveNow);
        console.log('   ✓ Button class after click:', toggleBtn.className);
        
        if (isActiveNow) {
            console.log('   ✅ TOGGLE WORKS! Button is now active.');
        } else {
            console.log('   ❌ TOGGLE FAILED! Button clicked but state is still false.');
        }
    }, 100);
} else {
    console.log('   ⏭️  Skipping (button or function not available)');
}

// ==================== STEP 5: Check Controller ====================
console.log('\n🎮 STEP 5: Checking message controller...');
if (chatModules && chatModules.controller) {
    console.log('   ✓ Controller available:', true);
    console.log('   ✓ sendMessage function:', typeof chatModules.controller.sendMessage === 'function');
} else if (window.ChatModules && window.ChatModules.controller) {
    console.log('   ✓ Controller available (via window):', true);
} else {
    console.log('   ❌ Controller NOT FOUND!');
}

// ==================== STEP 6: Check Last Chat Message ====================
console.log('\n💬 STEP 6: Checking last bot message for sources...');
const allMessages = document.querySelectorAll('.message.bot');
if (allMessages.length > 0) {
    const lastBotMsg = allMessages[allMessages.length - 1];
    const sourcesBtn = lastBotMsg.querySelector('.sources-btn');
    const sourcesContainer = lastBotMsg.querySelector('.sources-container');
    
    console.log('   ✓ Last bot message found:', true);
    console.log('   ✓ Has sources button:', !!sourcesBtn);
    console.log('   ✓ Has sources container:', !!sourcesContainer);
    
    if (sourcesBtn) {
        console.log('   ✓ Sources button text:', sourcesBtn.textContent);
    }
} else {
    console.log('   ℹ️  No bot messages found yet.');
}

// ==================== STEP 7: Check Flask API Endpoint ====================
console.log('\n🌐 STEP 7: Testing API endpoint...');
fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        prompt: 'test',
        stream: false,
        force_search: true,
        chat_id: 'diagnostic-test',
        model: 'default'
    })
})
.then(res => {
    console.log('   ✓ API response status:', res.status, res.statusText);
    console.log('   ✓ API endpoint is reachable');
    return res.text();
})
.then(text => {
    console.log('   ✓ Response preview:', text.substring(0, 100) + '...');
})
.catch(err => {
    console.log('   ❌ API request failed:', err.message);
});

// ==================== STEP 8: Summary ====================
setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(60));
    
    const checks = {
        'Bundle loaded': bundleLoaded,
        'Modules flag set': useChatModules,
        'Force search function': forceSearchFn,
        'Source manager': sourceManager,
        'ChatModules object': !!chatModules,
        'Toggle button exists': !!toggleBtn,
    };
    
    let passed = 0;
    let total = Object.keys(checks).length;
    
    for (const [check, result] of Object.entries(checks)) {
        const icon = result ? '✅' : '❌';
        console.log(`${icon} ${check}: ${result}`);
        if (result) passed++;
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log(`Score: ${passed}/${total} checks passed`);
    
    if (passed === total) {
        console.log('\n✅ All basic checks passed!');
        console.log('💡 Now try:\n');
        console.log('   1. Click the 🌐 toggle button in the UI');
        console.log('   2. Send a message');
        console.log('   3. Check backend logs for "Web search ENABLED"');
        console.log('   4. Look for sources button after response\n');
    } else {
        console.log('\n⚠️  Some checks failed. Review the output above.');
        console.log('💡 Common issues:');
        console.log('   - Bundle not loaded: Check /static/dist/chat.js in Network tab');
        console.log('   - Toggle button missing: Modules didn\'t initialize');
        console.log('   - Functions undefined: JavaScript errors during init\n');
    }
    
    console.log('='.repeat(60));
}, 1500);
