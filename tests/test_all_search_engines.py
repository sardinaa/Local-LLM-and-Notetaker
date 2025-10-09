#!/usr/bin/env python3
"""
Comprehensive test for all 6 FREE search engines.
Tests each engine individually and measures performance.
"""

import asyncio
import sys
import os
import time
from typing import Dict, List, Tuple

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.integrations.search_engines.multi_engine import MultiEngineSearch
from app.config.search_config import SearchConfig
from app.utils.search_status import print_search_config, get_search_status

# Import individual search engines
from app.integrations.search_pipeline import search_and_scrape as search_duckduckgo
from app.integrations.search_engines.qwant import search_qwant
from app.integrations.search_engines.brave_search import search_brave
from app.integrations.search_engines.mojeek import search_mojeek
from app.integrations.search_engines.searxng import search_searxng
from app.integrations.search_engines.yacy import search_yacy


async def test_engine(
    name: str,
    search_func,
    query: str,
    *args,
    **kwargs
) -> Tuple[str, bool, int, float, str]:
    """
    Test a single search engine.
    
    Returns:
        Tuple of (engine_name, success, result_count, time_taken, error_message)
    """
    print(f"\n{'='*60}")
    print(f"Testing {name.upper()}")
    print(f"{'='*60}")
    print(f"Query: {query}")
    
    start_time = time.time()
    
    try:
        results = await search_func(query, *args, **kwargs)
        time_taken = time.time() - start_time
        
        if results:
            print(f"✓ SUCCESS: Found {len(results)} results in {time_taken:.2f}s")
            
            # Show first 2 results
            for i, result in enumerate(results[:2], 1):
                print(f"\n{i}. {result.get('title', 'Untitled')}")
                print(f"   URL: {result.get('url', 'N/A')}")
                snippet = result.get('text', '')[:100]
                print(f"   Snippet: {snippet}...")
            
            return (name, True, len(results), time_taken, "")
        else:
            time_taken = time.time() - start_time
            print(f"✗ FAILED: No results returned in {time_taken:.2f}s")
            return (name, False, 0, time_taken, "No results")
    
    except Exception as e:
        time_taken = time.time() - start_time
        error_msg = str(e)
        print(f"✗ ERROR: {error_msg}")
        return (name, False, 0, time_taken, error_msg)


async def test_all_engines(query: str = "Python async programming"):
    """Test all 6 free search engines."""
    
    print("\n" + "="*70)
    print(" "*15 + "🔍 TESTING ALL 6 FREE SEARCH ENGINES")
    print("="*70)
    print(f"\nTest Query: '{query}'")
    print(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = []
    
    # Test 1: DuckDuckGo (always available)
    result = await test_engine(
        "DuckDuckGo",
        search_duckduckgo,
        query,
        max_results=3,
        min_results=1,
        min_words=50,
        min_quality_score=0.3,
        adaptive=True
    )
    results.append(result)
    await asyncio.sleep(1)  # Be nice to APIs
    
    # Test 2: Qwant (FREE, no API key!)
    result = await test_engine(
        "Qwant",
        search_qwant,
        query,
        count=3
    )
    results.append(result)
    await asyncio.sleep(1)
    
    # Test 3: Brave (if configured)
    if SearchConfig.BRAVE_API_KEY:
        result = await test_engine(
            "Brave",
            search_brave,
            query,
            api_key=SearchConfig.BRAVE_API_KEY,
            count=3
        )
        results.append(result)
        await asyncio.sleep(1)
    else:
        print(f"\n{'='*60}")
        print("Skipping BRAVE (not configured)")
        print(f"{'='*60}")
        print("To enable: export BRAVE_API_KEY='your-key'")
        print("Get free key: https://brave.com/search/api/")
        results.append(("Brave", False, 0, 0, "Not configured"))
    
    # Test 4: Mojeek (if configured)
    if SearchConfig.MOJEEK_API_KEY:
        result = await test_engine(
            "Mojeek",
            search_mojeek,
            query,
            api_key=SearchConfig.MOJEEK_API_KEY,
            count=3
        )
        results.append(result)
        await asyncio.sleep(1)
    else:
        print(f"\n{'='*60}")
        print("Skipping MOJEEK (not configured)")
        print(f"{'='*60}")
        print("To enable: export MOJEEK_API_KEY='your-key'")
        print("Get free key: https://www.mojeek.com/services/api/signup/")
        results.append(("Mojeek", False, 0, 0, "Not configured"))
    
    # Test 5: SearXNG (if configured)
    if SearchConfig.SEARXNG_URL:
        result = await test_engine(
            "SearXNG",
            search_searxng,
            query,
            instance_url=SearchConfig.SEARXNG_URL,
            count=3
        )
        results.append(result)
        await asyncio.sleep(1)
    else:
        print(f"\n{'='*60}")
        print("Skipping SEARXNG (not configured)")
        print(f"{'='*60}")
        print("To enable: docker run -d -p 8080:8080 searxng/searxng")
        print("Then: export SEARXNG_URL='http://localhost:8080'")
        results.append(("SearXNG", False, 0, 0, "Not configured"))
    
    # Test 6: YaCy (if configured)
    if SearchConfig.YACY_URL:
        result = await test_engine(
            "YaCy",
            search_yacy,
            query,
            instance_url=SearchConfig.YACY_URL,
            count=3
        )
        results.append(result)
    else:
        print(f"\n{'='*60}")
        print("Skipping YACY (not configured)")
        print(f"{'='*60}")
        print("To enable: docker run -d -p 8090:8090 yacy/yacy_search_server")
        print("Then: export YACY_URL='http://localhost:8090'")
        results.append(("YaCy", False, 0, 0, "Not configured"))
    
    return results


async def test_multi_engine(query: str = "latest AI news"):
    """Test the multi-engine search with automatic fallback."""
    
    print("\n" + "="*70)
    print(" "*15 + "🔄 TESTING MULTI-ENGINE FALLBACK")
    print("="*70)
    print(f"\nQuery: '{query}'")
    
    searcher = MultiEngineSearch(
        brave_api_key=SearchConfig.BRAVE_API_KEY,
        mojeek_api_key=SearchConfig.MOJEEK_API_KEY,
        searxng_url=SearchConfig.SEARXNG_URL,
        yacy_url=SearchConfig.YACY_URL,
        enable_qwant=SearchConfig.ENABLE_QWANT,
        enable_fallback=True
    )
    
    start_time = time.time()
    results, engine_used = await searcher.search(query, max_results=3)
    time_taken = time.time() - start_time
    
    print(f"\n✓ Multi-engine search completed in {time_taken:.2f}s")
    print(f"✓ Engine used: {engine_used.upper()}")
    print(f"✓ Results found: {len(results)}")
    
    if results:
        print("\nTop 3 Results:")
        for i, result in enumerate(results[:3], 1):
            print(f"\n{i}. {result.get('title', 'Untitled')}")
            print(f"   URL: {result.get('url', 'N/A')}")
            print(f"   Engine: {result.get('search_engine', 'unknown')}")
    
    return len(results) > 0


async def test_parallel_search(query: str = "machine learning"):
    """Test parallel search across all configured engines."""
    
    print("\n" + "="*70)
    print(" "*15 + "⚡ TESTING PARALLEL SEARCH")
    print("="*70)
    print(f"\nQuery: '{query}'")
    print("Querying all engines simultaneously...")
    
    searcher = MultiEngineSearch(
        brave_api_key=SearchConfig.BRAVE_API_KEY,
        mojeek_api_key=SearchConfig.MOJEEK_API_KEY,
        searxng_url=SearchConfig.SEARXNG_URL,
        yacy_url=SearchConfig.YACY_URL,
        enable_qwant=SearchConfig.ENABLE_QWANT
    )
    
    start_time = time.time()
    results_by_engine = await searcher.parallel_search(query, max_results=2)
    time_taken = time.time() - start_time
    
    print(f"\n✓ Parallel search completed in {time_taken:.2f}s")
    print("\nResults by engine:")
    
    total_results = 0
    for engine_name, results in results_by_engine.items():
        status = "✓" if results else "✗"
        print(f"{status} {engine_name.upper()}: {len(results)} results")
        total_results += len(results)
    
    # Merge results
    merged = searcher.merge_results(results_by_engine, max_results=5)
    print(f"\n✓ Merged to {len(merged)} unique results")
    
    return len(merged) > 0


def print_summary(results: List[Tuple[str, bool, int, float, str]]):
    """Print a summary of all test results."""
    
    print("\n" + "="*70)
    print(" "*25 + "📊 TEST SUMMARY")
    print("="*70)
    
    # Table header
    print(f"\n{'Engine':<15} {'Status':<12} {'Results':<10} {'Time':<12} {'Notes'}")
    print("-" * 70)
    
    # Table rows
    total_working = 0
    total_results = 0
    total_time = 0
    
    for name, success, count, time_taken, error in results:
        status = "✓ WORKING" if success else "✗ FAILED"
        time_str = f"{time_taken:.2f}s" if time_taken > 0 else "N/A"
        notes = error if error else "OK"
        
        print(f"{name:<15} {status:<12} {count:<10} {time_str:<12} {notes[:30]}")
        
        if success:
            total_working += 1
            total_results += count
            total_time += time_taken
    
    print("-" * 70)
    print(f"\n✓ {total_working}/{len(results)} engines working WITHOUT any setup")
    print(f"✓ {total_results} total results found")
    if total_working > 0:
        print(f"✓ Average time: {total_time/total_working:.2f}s per engine")
    
    # Recommendations
    print("\n" + "="*70)
    print(" "*25 + "💡 THE REALITY")
    print("="*70)
    
    working_engines = [name for name, success, _, _, _ in results if success]
    not_configured = [name for name, success, _, _, error in results if error == "Not configured"]
    
    print(f"\n🎯 TRUTH: Only {len(working_engines)} engine(s) work WITHOUT any setup:")
    if working_engines:
        for name in working_engines:
            print(f"   ✅ {name} - Working now, no configuration needed")
    
    print(f"\n⚙️  {len(not_configured)} engines REQUIRE setup (but are FREE):")
    if not_configured:
        print("\n   Get FREE API keys (5 minutes each):")
        for name in not_configured:
            if name == "Brave":
                print("   1. Brave (2,000/month) → https://brave.com/search/api/")
            elif name == "Mojeek":
                print("   2. Mojeek (1,000/month) → https://www.mojeek.com/services/api/signup/")
        
        print("\n   Self-host with Docker (15-20 minutes each):")
        for name in not_configured:
            if name == "SearXNG":
                print("   3. SearXNG (unlimited) → docker run -d -p 8080:8080 searxng/searxng")
            elif name == "YaCy":
                print("   4. YaCy (unlimited) → docker run -d -p 8090:8090 yacy/yacy_search_server")
    
    failed_not_configured = [name for name, success, _, _, error in results 
                            if not success and error != "Not configured"]
    if failed_not_configured:
        print(f"\n❌ {len(failed_not_configured)} engines DON'T WORK reliably:")
        for name in failed_not_configured:
            if name == "Qwant":
                print(f"   • {name} - API blocked, not recommended")
    
    print("\n" + "="*70)
    print(" "*22 + "🎯 RECOMMENDATION")
    print("="*70)
    
    if total_working >= 1:
        print(f"\n✅ Your system IS WORKING with {total_working} engine(s)!")
        print("\n   Good for now: Use DuckDuckGo (already working)")
        print("\n   Better reliability: Add Brave + Mojeek API keys (5 min)")
        print("   → This gives you 3 engines + 3,000 searches/month")
        print("\n   Maximum privacy: Add SearXNG (15 min Docker setup)")
        print("   → Unlimited searches, complete privacy")
        
        print("\n📖 Read REALISTIC_SEARCH_GUIDE.md for honest comparison")
    else:
        print("\n❌ No engines working - check internet connection")


async def main():
    """Run all tests."""
    
    print("\n" + "="*70)
    print(" "*10 + "🧪 COMPREHENSIVE FREE SEARCH ENGINE TEST SUITE")
    print("="*70)
    
    # Show current configuration
    print_search_config()
    
    # Test each engine individually
    print("\n" + "="*70)
    print(" "*20 + "PHASE 1: INDIVIDUAL ENGINE TESTS")
    print("="*70)
    
    results = await test_all_engines()
    
    # Test multi-engine fallback
    print("\n" + "="*70)
    print(" "*20 + "PHASE 2: ADVANCED FEATURES")
    print("="*70)
    
    try:
        await test_multi_engine()
    except Exception as e:
        print(f"\n✗ Multi-engine test failed: {e}")
    
    await asyncio.sleep(2)
    
    try:
        await test_parallel_search()
    except Exception as e:
        print(f"\n✗ Parallel search test failed: {e}")
    
    # Print summary
    print_summary(results)
    
    # Final message
    print("\n" + "="*70)
    print(" "*25 + "🎊 TESTS COMPLETE")
    print("="*70)
    print("\n💰 Total cost for all 6 engines: $0.00 (FREE forever!)")
    print("\n📚 Documentation:")
    print("   • 6_FREE_SEARCH_ENGINES.md - Quick reference")
    print("   • docs/MORE_FREE_SEARCH_ENGINES.md - Additional engines")
    print("   • docs/setup/WEB_SEARCH_SETUP.md - Complete guide")
    print("\n" + "="*70 + "\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user.")
    except Exception as e:
        print(f"\n\n❌ Error running tests: {e}")
        import traceback
        traceback.print_exc()
