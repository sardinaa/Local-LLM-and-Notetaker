#!/usr/bin/env python3
"""
Chat Agent System - Usage Examples

Demonstrates how to use the new modular chat agent system.
"""

import os
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from services.agents import ChatAgentFacade


def example_1_basic_document_qa():
    """Example 1: Basic document Q&A"""
    print("\n" + "="*60)
    print("EXAMPLE 1: Basic Document Q&A")
    print("="*60)
    
    # Initialize facade
    facade = ChatAgentFacade(
        ollama_url="http://127.0.0.1:11434",
        default_model="llama3.2:3b"
    )
    
    chat_id = "demo_chat_1"
    
    # Add a document
    print("\n1. Adding document to chat agent...")
    # You would provide a real file path here
    # result = facade.add_document(
    #     chat_id=chat_id,
    #     file_path="/path/to/document.pdf",
    #     filename="document.pdf"
    # )
    # print(f"   ✓ Added {result['chunks_added']} chunks")
    print("   (Skipped - provide real file path)")
    
    # Query the document
    print("\n2. Querying the document...")
    # result = facade.query(
    #     chat_id=chat_id,
    #     query="What is the main topic of this document?",
    #     conversation_history=[]
    # )
    # print(f"   Response: {result['response']}")
    # print(f"   Sources: {result['num_sources']}")
    print("   (Skipped - no document added)")
    
    # Get stats
    print("\n3. Getting agent statistics...")
    stats = facade.get_stats(chat_id)
    print(f"   Agent exists: {stats['agent_exists']}")
    print(f"   Documents: {stats['doc_count']}")
    print(f"   URLs: {stats['url_count']}")
    print(f"   Total chunks: {stats['total_chunks']}")


def example_2_conversation_memory():
    """Example 2: Conversation with memory"""
    print("\n" + "="*60)
    print("EXAMPLE 2: Conversation with Memory")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_2"
    
    # Simulate a conversation
    conversation_history = [
        {"sender": "user", "text": "What is machine learning?"},
        {"sender": "bot", "text": "Machine learning is a subset of AI..."},
        {"sender": "user", "text": "What are its applications?"},
        {"sender": "bot", "text": "ML has many applications including..."},
    ]
    
    print("\n1. Conversation history:")
    for msg in conversation_history:
        role = "👤 User" if msg['sender'] == 'user' else "🤖 Bot"
        print(f"   {role}: {msg['text'][:50]}...")
    
    print("\n2. Asking follow-up question with memory...")
    # result = facade.query(
    #     chat_id=chat_id,
    #     query="Can you elaborate on the first application you mentioned?",
    #     conversation_history=conversation_history
    # )
    # print(f"   Response: {result['response']}")
    print("   (Demo - memory context would be included in prompt)")


def example_3_url_ingestion():
    """Example 3: URL ingestion"""
    print("\n" + "="*60)
    print("EXAMPLE 3: URL Ingestion")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_3"
    
    print("\n1. Adding URL to knowledge base...")
    # result = facade.add_url(
    #     chat_id=chat_id,
    #     url="https://en.wikipedia.org/wiki/Artificial_intelligence"
    # )
    # print(f"   ✓ Added {result['chunks_added']} chunks from URL")
    print("   (Skipped - requires network and UnstructuredURLLoader)")
    
    print("\n2. Querying URL content...")
    # result = facade.query(
    #     chat_id=chat_id,
    #     query="What is artificial intelligence according to the article?"
    # )
    # print(f"   Response: {result['response']}")
    print("   (Skipped - no URL added)")


def example_4_streaming_response():
    """Example 4: Streaming response"""
    print("\n" + "="*60)
    print("EXAMPLE 4: Streaming Response")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_4"
    
    print("\n1. Streaming query response...")
    print("   Response: ", end='', flush=True)
    
    # for chunk in facade.query_stream(
    #     chat_id=chat_id,
    #     query="Explain quantum computing in simple terms",
    #     conversation_history=[]
    # ):
    #     print(chunk, end='', flush=True)
    
    print("(Demo - would stream response here)")
    print()


def example_5_multi_document_search():
    """Example 5: Multi-document search with hybrid retrieval"""
    print("\n" + "="*60)
    print("EXAMPLE 5: Multi-Document Hybrid Search")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_5"
    
    print("\n1. Adding multiple documents...")
    documents = [
        "research_paper_1.pdf",
        "notes.txt",
        "presentation.pptx"
    ]
    
    for doc in documents:
        print(f"   - {doc}")
    print("   (Demo - would add actual files)")
    
    print("\n2. Performing hybrid search across all documents...")
    # result = facade.query(
    #     chat_id=chat_id,
    #     query="What are the common themes across these documents?",
    #     conversation_history=[]
    # )
    # print(f"\n   Found relevant info from {result['num_sources']} sources")
    # for source in result['sources']:
    #     print(f"   - {source['source']} ({source['source_type']})")
    print("   (Demo - hybrid search would combine semantic + keyword)")


def example_6_agent_lifecycle():
    """Example 6: Agent lifecycle management"""
    print("\n" + "="*60)
    print("EXAMPLE 6: Agent Lifecycle Management")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_6"
    
    print("\n1. Creating agent...")
    agent = facade.get_or_create_agent(chat_id)
    print(f"   ✓ Created agent: {agent['agent_name']}")
    
    print("\n2. Checking agent existence...")
    stats = facade.get_stats(chat_id)
    print(f"   Agent exists: {stats['agent_exists']}")
    
    print("\n3. Listing documents...")
    docs = facade.list_documents(chat_id)
    print(f"   Documents in knowledge base: {len(docs)}")
    
    print("\n4. Deleting agent...")
    result = facade.delete_agent(chat_id)
    print(f"   ✓ Deleted: {result['success']}")
    
    print("\n5. Verifying deletion...")
    stats = facade.get_stats(chat_id)
    print(f"   Agent exists: {stats['agent_exists']}")


def example_7_error_handling():
    """Example 7: Error handling"""
    print("\n" + "="*60)
    print("EXAMPLE 7: Error Handling")
    print("="*60)
    
    facade = ChatAgentFacade()
    chat_id = "demo_chat_7"
    
    print("\n1. Attempting to add non-existent document...")
    result = facade.add_document(
        chat_id=chat_id,
        file_path="/non/existent/file.pdf",
        filename="file.pdf"
    )
    
    if not result['success']:
        print(f"   ✓ Error caught: {result['error'][:50]}...")
    
    print("\n2. Attempting to remove non-existent document...")
    result = facade.remove_document(chat_id, "nonexistent.pdf")
    
    if not result.get('success'):
        print(f"   ✓ Error handled gracefully")
    
    print("\n3. Querying empty knowledge base...")
    result = facade.query(
        chat_id=chat_id,
        query="What is X?",
        conversation_history=[]
    )
    
    if result.get('success'):
        print("   ✓ Returns response even with no documents")
        print(f"   Sources: {result['num_sources']}")


def example_8_modular_components():
    """Example 8: Using individual components"""
    print("\n" + "="*60)
    print("EXAMPLE 8: Using Individual Components")
    print("="*60)
    
    from services.agents.storage import AgentStorage
    from services.agents.vector_store import VectorStoreManager
    from services.agents.chat_agent import ChatAgentManager
    
    print("\n1. Direct storage access...")
    storage = AgentStorage()
    agents = storage.list_chat_agents()
    print(f"   Total chat agents: {len(agents)}")
    
    print("\n2. Direct vector store access...")
    vector_store_manager = VectorStoreManager()
    chat_id = "demo_chat_8"
    store = vector_store_manager.get_chat_store(chat_id)
    print(f"   ✓ Got vector store for chat: {chat_id}")
    
    print("\n3. Direct agent manager access...")
    agent_manager = ChatAgentManager(storage, vector_store_manager)
    config = agent_manager.get_or_create_agent(chat_id)
    print(f"   ✓ Got config: {config.name}")
    print(f"   Search strategy: {config.retrieval.search_strategy.value}")
    print(f"   Memory enabled: {config.memory.enabled}")


def main():
    """Run all examples"""
    print("\n" + "="*60)
    print("CHAT AGENT SYSTEM - USAGE EXAMPLES")
    print("="*60)
    
    examples = [
        example_1_basic_document_qa,
        example_2_conversation_memory,
        example_3_url_ingestion,
        example_4_streaming_response,
        example_5_multi_document_search,
        example_6_agent_lifecycle,
        example_7_error_handling,
        example_8_modular_components,
    ]
    
    print("\nAvailable examples:")
    for i, example in enumerate(examples, 1):
        print(f"  {i}. {example.__doc__.strip()}")
    
    print("\nRunning all examples...\n")
    
    for example in examples:
        try:
            example()
        except Exception as e:
            print(f"\n⚠️  Example failed: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*60)
    print("EXAMPLES COMPLETE")
    print("="*60)
    print("\nNote: Some examples are demonstrations and skip actual")
    print("API calls. For full functionality, provide real files")
    print("and ensure Ollama is running.")
    print("\n")


if __name__ == "__main__":
    main()
