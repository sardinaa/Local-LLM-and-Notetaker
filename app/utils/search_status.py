"""
Search engine status and configuration utilities.
"""

from app.config.search_config import SearchConfig
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


def get_search_status() -> Dict[str, Any]:
    """
    Get the current status of all search engines.
    
    Returns:
        Dictionary with search engine configuration and status
    """
    available_engines = SearchConfig.get_available_engines()
    
    status = {
        "configured_engines": available_engines,
        "primary_engine": SearchConfig.PRIMARY_ENGINE,
        "fallback_enabled": SearchConfig.ENABLE_FALLBACK,
        "engines": {
            "duckduckgo": {
                "status": "available",
                "cost": "free",
                "description": "Always available, no API key required"
            }
        },
        "config": {
            "min_results": SearchConfig.MIN_RESULTS,
            "max_results": SearchConfig.MAX_RESULTS,
            "min_quality_score": SearchConfig.MIN_QUALITY_SCORE,
            "concurrent_requests": SearchConfig.CONCURRENT_REQUESTS
        }
    }
    
    # Qwant status
    if SearchConfig.ENABLE_QWANT:
        status["engines"]["qwant"] = {
            "status": "enabled",
            "cost": "free (unlimited)",
            "description": "European privacy-focused search, no API key needed!"
        }
    else:
        status["engines"]["qwant"] = {
            "status": "disabled",
            "cost": "free (unlimited)",
            "description": "Set ENABLE_QWANT=true to enable",
            "setup": "export ENABLE_QWANT=true"
        }
    
    # Brave status
    if SearchConfig.BRAVE_API_KEY:
        status["engines"]["brave"] = {
            "status": "configured",
            "cost": "free (2,000 queries/month)",
            "description": "High-quality independent search"
        }
    else:
        status["engines"]["brave"] = {
            "status": "not_configured",
            "cost": "free (2,000 queries/month)",
            "description": "Sign up at https://brave.com/search/api/",
            "setup": "Set BRAVE_API_KEY environment variable"
        }
    
    # Mojeek status
    if SearchConfig.MOJEEK_API_KEY:
        status["engines"]["mojeek"] = {
            "status": "configured",
            "cost": "free (1,000 queries/month)",
            "description": "Independent search index"
        }
    else:
        status["engines"]["mojeek"] = {
            "status": "not_configured",
            "cost": "free (1,000 queries/month)",
            "description": "Sign up at https://www.mojeek.com/services/api/signup/",
            "setup": "Set MOJEEK_API_KEY environment variable"
        }
    
    # SearXNG status
    if SearchConfig.SEARXNG_URL:
        status["engines"]["searxng"] = {
            "status": "configured",
            "cost": "free (unlimited)",
            "description": f"Self-hosted at {SearchConfig.SEARXNG_URL}"
        }
    else:
        status["engines"]["searxng"] = {
            "status": "not_configured",
            "cost": "free (unlimited)",
            "description": "Self-hosted privacy-focused metasearch",
            "setup": "docker run -d -p 8080:8080 searxng/searxng"
        }
    
    # YaCy status
    if SearchConfig.YACY_URL:
        status["engines"]["yacy"] = {
            "status": "configured",
            "cost": "free (unlimited)",
            "description": f"P2P search at {SearchConfig.YACY_URL}"
        }
    else:
        status["engines"]["yacy"] = {
            "status": "not_configured",
            "cost": "free (unlimited)",
            "description": "Self-hosted P2P decentralized search",
            "setup": "docker run -d -p 8090:8090 yacy/yacy_search_server"
        }
    
    # Domain whitelist
    if SearchConfig.DOMAIN_FILTER_LIST:
        status["domain_filtering"] = {
            "enabled": True,
            "whitelist": SearchConfig.DOMAIN_FILTER_LIST
        }
    else:
        status["domain_filtering"] = {
            "enabled": False,
            "description": "All domains allowed"
        }
    
    return status


def get_search_recommendations() -> list[str]:
    """
    Get recommendations for improving search configuration.
    
    Returns:
        List of recommendation strings
    """
    recommendations = []
    
    if not SearchConfig.BRAVE_API_KEY:
        recommendations.append(
            "Consider adding Brave Search API (free 2,000 queries/month) for higher quality results. "
            "Sign up at https://brave.com/search/api/ and set BRAVE_API_KEY environment variable."
        )
    
    if not SearchConfig.SEARXNG_URL:
        recommendations.append(
            "Consider self-hosting SearXNG for unlimited free searches with maximum privacy. "
            "Run: docker run -d -p 8080:8080 searxng/searxng"
        )
    
    if not SearchConfig.ENABLE_FALLBACK:
        recommendations.append(
            "Enable search fallback (ENABLE_SEARCH_FALLBACK=true) for better reliability."
        )
    
    if not SearchConfig.DOMAIN_FILTER_LIST:
        recommendations.append(
            "Consider setting SEARCH_DOMAIN_FILTER_LIST to filter results to trusted domains."
        )
    
    if not recommendations:
        recommendations.append("Your search configuration is optimal! All free enhancements are enabled.")
    
    return recommendations


def print_search_config():
    """Print current search configuration to console."""
    status = get_search_status()
    
    print("\n" + "="*60)
    print("🔍 WEB SEARCH CONFIGURATION")
    print("="*60)
    
    print(f"\nPrimary Engine: {status['primary_engine']}")
    print(f"Fallback Enabled: {status['fallback_enabled']}")
    print(f"Configured Engines: {', '.join(status['configured_engines'])}")
    
    print("\n" + "-"*60)
    print("ENGINES STATUS:")
    print("-"*60)
    
    for engine_name, engine_info in status['engines'].items():
        emoji = "✓" if engine_info['status'] in ['available', 'configured'] else "○"
        print(f"\n{emoji} {engine_name.upper()}")
        print(f"   Status: {engine_info['status']}")
        print(f"   Cost: {engine_info['cost']}")
        print(f"   {engine_info['description']}")
        
        if 'setup' in engine_info:
            print(f"   Setup: {engine_info['setup']}")
    
    print("\n" + "-"*60)
    print("CONFIGURATION:")
    print("-"*60)
    for key, value in status['config'].items():
        print(f"  {key}: {value}")
    
    if status['domain_filtering']['enabled']:
        print(f"\nDomain Filtering: ENABLED")
        print(f"  Whitelist: {', '.join(status['domain_filtering']['whitelist'])}")
    else:
        print(f"\nDomain Filtering: DISABLED")
    
    print("\n" + "-"*60)
    print("RECOMMENDATIONS:")
    print("-"*60)
    
    recommendations = get_search_recommendations()
    for i, rec in enumerate(recommendations, 1):
        print(f"\n{i}. {rec}")
    
    print("\n" + "="*60)
    print("All search engines listed above are 100% FREE to use!")
    print("="*60 + "\n")


if __name__ == "__main__":
    # Print configuration when run directly
    print_search_config()
