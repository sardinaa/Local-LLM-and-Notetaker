# Automatic Web Search Feature

This LLM-Notetaker application includes intelligent web search functionality that automatically determines when to search the web for current information and includes a manual override option for forced web searches.

## How It Works

The system operates in two modes:

### 1. Automatic Detection
The system automatically detects when your questions require current or recent information by analyzing your input for:

#### Search Triggers
- **Time-sensitive keywords**: latest, recent, new, current, today, 2024, 2025, trending, updated, now
- **News and events**: news, events, breaking, what's happening, what's new
- **Financial data**: market, prices, rates, stock, economy
- **Research updates**: research, study, findings, discovery, breakthrough
- **Product releases**: released, launched, announced, published
- **Current data requests**: weather, forecast, prices

#### Question Patterns
- "What's the latest news about...?"
- "Current stock prices for..."
- "What happened today...?"
- "Recent research on..."
- "When will [product] be released?"
- "Where can I buy..." (for current availability)

### 2. Manual Override
You can force web search for any query using the globe button in the plus menu:

1. **Click the plus (+) button** next to the chat input
2. **Click the globe icon** to enable forced web search
3. **Send your message** - it will search the web regardless of content
4. **Auto-disable** - the forced search automatically disables after use or 30 seconds

## Features

### Smart Integration
- **Dual Mode Operation**: Automatic detection + manual override
- **Visual Feedback**: Button glows when force search is enabled
- **Status Indicators**: Shows when searches are in progress
- **Search Type Display**: Distinguishes between auto and manual searches

### User Experience
- **Non-intrusive**: Automatic detection works transparently
- **Quick Access**: Manual override is just two clicks away
- **Clear Indicators**: Visual cues show search status and type
- **Auto-reset**: Manual override automatically disables after use

### Advanced Search Pipeline
- **DuckDuckGo Integration**: Uses DuckDuckGo for web searches
- **Content Extraction**: Trafilatura for clean, readable text
- **Concurrent Processing**: Fetches multiple sources simultaneously
- **Smart Filtering**: Minimum content length and relevance checking

## User Interface

### Status Indicator
- **Location**: Bottom-right corner of the screen
- **Shows**: "Auto web search" with hover tooltip
- **Tooltip**: Explains both automatic and manual search options

### Manual Override Button
- **Location**: Plus menu in chat input area
- **States**: 
  - Normal: Globe icon, grey color
  - Active: Globe icon, blue color with glow effect
  - Tooltip: Shows current state and instructions

### Search Notifications
- **Auto Search**: Blue notification showing "Auto web search: [query]"
- **Manual Search**: Orange notification showing "Manual web search: [query]"
- **Duration**: 3 seconds, slides in from right

## Examples

### Automatic Web Search Triggers
These queries will automatically search the web:
- "What's the latest news about AI in 2025?"
- "Current Bitcoin price"
- "Recent COVID-19 updates"
- "New iPhone features 2025"
- "Today's weather forecast"

### Manual Override Use Cases
Use manual override for queries that normally wouldn't trigger search:
- "Python programming best practices" (to get latest trends)
- "Machine learning tutorials" (to find recent resources)
- "Cooking recipes for pasta" (to get current popular recipes)
- "Book recommendations" (to find trending books)

### General Knowledge (No Search)
These queries use general knowledge without searching:
- "What is photosynthesis?"
- "How does gravity work?"
- "Explain the French Revolution"
- "What are the primary colors?"

## Technical Implementation

### Backend
- **Search Pipeline**: Uses DuckDuckGo search with content extraction
- **Content Processing**: Trafilatura for readable text extraction
- **Async Processing**: Concurrent fetching of multiple sources
- **Smart Filtering**: Minimum content length and relevance checking

### Frontend
- **Status Indicators**: Visual feedback for search activity
- **Responsive Design**: Works on mobile and desktop
- **Minimal UI**: Non-intrusive integration

## Dependencies

```bash
# Core web search dependencies
duckduckgo-search>=5.0.0
trafilatura>=1.6.0
httpx>=0.25.0
tenacity>=8.2.0
```

## Configuration

Web search can be enabled/disabled in the ChatHistoryManager:

```python
chat_manager = ChatHistoryManager(
    enable_web_search=True,  # Enable automatic web search
    max_messages=20
)
```

## Examples

### Queries That Trigger Web Search
- "What's the latest news about AI in 2025?"
- "Current Bitcoin price"
- "Recent COVID-19 updates"
- "New iPhone features 2025"
- "Today's weather forecast"

### Queries That Don't Trigger Web Search  
- "What is Python programming?"
- "How does photosynthesis work?"
- "Explain machine learning"
- "Help with math homework"
- "Historical facts about World War II"

## Privacy and Performance

- **No data storage**: Search queries and results are not permanently stored
- **Efficient caching**: Recent searches may be temporarily cached
- **Respectful crawling**: Follows robots.txt and implements delays
- **Content limits**: Results are truncated to prevent context overflow

## Troubleshooting

If web search isn't working:

1. Check that all dependencies are installed
2. Verify internet connectivity
3. Check the console for any error messages
4. Ensure Ollama is running for AI responses

The system gracefully falls back to general knowledge if web search fails.
