# Improved Web Search System Documentation

## Overview

The LLM Notetaker now features a significantly improved web search system that addresses quality, transparency, and user control issues. The system combines automatic search detection with manual override capabilities while providing clear source attribution.

## Key Improvements

### 1. Source Quality Filtering
- **Quality Scoring**: Each web source is scored from 0.0 to 1.0 based on domain reputation, content quality, and reliability indicators
- **Domain Filtering**: Prioritizes high-quality domains (Wikipedia, academic institutions, reputable news sources) and filters out low-quality sources
- **Content Validation**: Ensures minimum word count and quality indicators in content
- **Clickbait Detection**: Automatically filters out sources with clickbait-style titles and content

### 2. Transparent Source Attribution
- **Visible Sources**: All web search sources are clearly displayed to users in a dedicated sources section
- **Source Details**: Each source shows title, URL, and quality rating
- **Clickable Links**: Users can directly access the original sources with external link indicators
- **Quality Indicators**: Visual quality badges (High, Medium, Low) help users assess source reliability

### 3. Improved Search Accuracy
- **Refined Triggers**: More specific search trigger patterns reduce false positives
- **Context-Aware**: Better detection of queries that actually need current information
- **Time-Sensitive Detection**: Enhanced recognition of time-sensitive queries requiring recent data

### 4. Better User Experience
- **Quality Feedback**: Shows average quality score of found sources
- **Manual Override**: Globe button in plus menu allows forcing web search for any query
- **Search Status**: Clear indicators show when web search is active or forced
- **Mobile Responsive**: Source display optimized for all screen sizes

## How It Works

### Automatic Search Detection
The system automatically triggers web search when it detects:
- Time-sensitive terms (latest, recent, today, 2024, 2025)
- Current events keywords (news, breaking, headlines)
- Market/financial queries (stock price, market data)
- Weather and real-time data requests
- Recent research and discoveries
- Question patterns asking about current information

### Source Quality Assessment
Each source is evaluated based on:
- **Domain Reputation**: Higher scores for educational, government, and reputable news sites
- **Content Quality**: Word count, presence of quality indicators, structured content
- **Reliability Indicators**: Research terms, peer-reviewed content, academic language
- **Clickbait Detection**: Penalizes sensational headlines and clickbait patterns

Quality levels:
- **High (0.7-1.0)**: Wikipedia, academic institutions, major news outlets, government sites
- **Medium (0.4-0.7)**: General news sites, technical blogs, corporate sites
- **Low (0.0-0.4)**: Social media, forums, questionable sources (filtered out)

### Source Display
Sources are presented to users with:
- Clean, organized layout in a dedicated section
- Title, URL, and quality rating for each source
- Hover effects and visual feedback
- Direct links to original sources
- Mobile-responsive design

## Technical Implementation

### Backend Changes
- **search_pipeline.py**: Added quality scoring, domain filtering, and content validation
- **chat_history_manager.py**: Improved search triggers and source formatting for LLM context
- Enhanced error handling and logging for better debugging

### Frontend Changes
- **sourceDisplay.js**: New module for parsing and displaying sources
- **styles.css**: Added comprehensive styling for source sections
- **chat.js**: Integration with source display system
- Real-time source processing as messages are received

### Quality Metrics
- Sources must meet minimum quality threshold (0.3/1.0 by default)
- Results sorted by quality score (highest first)
- Average quality displayed to users
- Comprehensive logging for monitoring and debugging

## Usage Examples

### Automatic Search (High Quality Results)
**Query**: "What's the latest news about artificial intelligence in 2025?"
**Result**: Automatically searches and finds 3-5 high-quality sources from reputable tech news sites, displays with quality indicators and clickable links.

### Manual Override
**Action**: Click globe button in plus menu → ask any question
**Result**: Forces web search even for general queries, useful for getting current perspectives on any topic.

### Source Quality Display
Each source shows:
```
📰 "AI Breakthrough Announced by OpenAI" [High]
   https://techcrunch.com/2025/01/15/ai-breakthrough
   
🔗 "New Language Model Released" [Medium]  
   https://example-news.com/ai-news
```

## Configuration

### Adjustable Parameters
- **min_quality_score**: Minimum quality threshold (default: 0.3)
- **max_results**: Maximum number of sources to retrieve (default: 5)
- **min_words**: Minimum content length (default: 120 words)

### Customization Options
- Search trigger patterns can be modified in `chat_history_manager.py`
- Quality scoring criteria can be adjusted in `search_pipeline.py`
- Source display styling can be customized in `styles.css`

## Best Practices

### For Users
1. **Review Sources**: Always check the sources section to verify information
2. **Quality Awareness**: Pay attention to quality indicators when evaluating information
3. **Manual Override**: Use the globe button for topics that need current perspectives
4. **Source Verification**: Click through to original sources for detailed information

### For Developers
1. **Monitor Quality**: Regularly review search quality and adjust thresholds as needed
2. **Update Triggers**: Keep search trigger patterns current with user needs
3. **Domain Maintenance**: Update high/low quality domain lists periodically
4. **Error Handling**: Monitor logs for search failures and quality issues

## Troubleshooting

### Common Issues
- **No Sources Found**: Search terms may be too generic or not time-sensitive
- **Low Quality Sources**: May need to adjust quality thresholds or domain lists
- **Too Many Searches**: Search triggers may be too broad, review patterns
- **Missing Sources Display**: Check that sourceDisplay.js is loaded and working

### Debug Information
- Search activity logged in console and server logs
- Quality scores visible in source display
- Search trigger patterns logged when activated
- Error messages for failed searches or parsing issues

## Future Enhancements

### Planned Improvements
- User-customizable source preferences
- Source credibility scoring based on user feedback
- Integration with academic databases and APIs
- Caching for frequently searched topics
- Source diversity algorithms to avoid echo chambers

This improved web search system provides users with reliable, transparent, and high-quality information while maintaining ease of use and clear source attribution.
