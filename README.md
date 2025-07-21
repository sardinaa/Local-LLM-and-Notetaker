# LLM-Notetaker

An intelligent note-taking application that combines traditional note management with AI-powered chat capabilities and advanced features like audio transcription, text-to-speech, and RAG (Retrieval-Augmented Generation) integration.

![Python](https://img.shields.io/badge/python-v3.8+-blue.svg)
![Flask](https://img.shields.io/badge/flask-web%20framework-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🚀 Features

### 📝 Note Management
- **Hierarchical Organization**: Create folders and organize notes in a tree structure
- **Rich Text Editor**: EditorJS-powered editor with support for headers, lists, code blocks, quotes, and images
- **Real-time Saving**: Auto-save functionality to prevent data loss
- **Multiple Export Formats**: Export notes as PDF, Markdown, or JSON

### 💬 AI-Powered Chat
- **LLM Integration**: Chat with local language models via Ollama
- **Chat History**: Persistent conversation history with organized folder structure
- **Context-Aware**: Maintains conversation context across sessions

### 🎯 Flashcards System
- **Interactive Learning**: Create and manage flashcards for study purposes
- **Organized Collections**: Group flashcards by topics or subjects

### 🧠 RAG (Retrieval-Augmented Generation)
- **Document Integration**: Upload and index various document formats (PDF, Word, PowerPoint, CSV, Text)
- **Intelligent Retrieval**: Query your documents using natural language
- **Vector Search**: ChromaDB-powered semantic search across your knowledge base
- **Context Enhancement**: Augment chat responses with relevant document excerpts

### 🎙️ Audio Features
- **Speech-to-Text**: Transcribe audio using OpenAI Whisper
- **Text-to-Speech**: Generate natural speech using Kokoro TTS with multiple voice options
- **Voice Control**: Record and transcribe audio directly in the interface

### 📱 User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dynamic Tabs**: Multi-tab interface for efficient workflow
- **Drag & Drop**: Easy file uploads and organization
- **Dark Theme**: Eye-friendly dark interface

## 🛠️ Installation

### Prerequisites
- Python 3.8 or higher
- [Ollama](https://ollama.ai/) for local LLM support

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/sardinaa/LLM-Notetaker.git
   cd LLM-Notetaker
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv notetaker
   source notetaker/bin/activate  # On Windows: notetaker\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install flask
   pip install openai-whisper
   pip install kokoro>=0.8.4 soundfile
   pip install langchain
   pip install langchain-community
   pip install langchain-ollama
   pip install chromadb
   pip install pypdf
   pip install python-docx
   pip install python-pptx
   pip install pandas
   pip install unstructured
   ```

4. **Set up Ollama**
   - Install Ollama from [https://ollama.ai/](https://ollama.ai/)
   - Pull required models:
     ```bash
     ollama pull mistral:latest
     ollama pull nomic-embed-text
     ```

5. **Run the application**
   ```bash
   python app.py
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## 📋 Usage

### Getting Started
1. **Create a Note**: Click the "Create Note" button in the sidebar to start writing
2. **Organize with Folders**: Use "Create Folder" to organize your notes hierarchically
3. **Chat with AI**: Switch to the Chat tab to start conversations with the LLM
4. **Upload Documents**: Use the RAG features to upload and query your documents
5. **Study with Flashcards**: Create flashcard collections for active learning

### Key Features

#### Note Taking
- Use the rich text editor to write formatted notes
- Organize notes in folders for better structure
- Export notes in multiple formats
- Use drag-and-drop for easy file organization

#### AI Chat
- Ask questions and get intelligent responses
- Upload documents to enhance chat context
- Maintain conversation history across sessions
- Create separate chat conversations for different topics

#### Document RAG
- Upload PDFs, Word docs, PowerPoint, CSV files
- Ask questions about your uploaded documents
- Get contextual answers with source references
- Build a searchable knowledge base

#### Audio Features
- Click the microphone icon to record audio
- Automatic transcription using Whisper
- Text-to-speech with natural voices
- Multiple language and voice options

## 🏗️ Architecture

The application is built with a modular architecture:

- **`app.py`**: Main Flask application and routing
- **`data_service.py`**: High-level data management with caching
- **`database.py`**: SQLite database operations
- **`chat_history_manager.py`**: Chat conversation management
- **`rag_manager.py`**: Document indexing and retrieval system
- **`static/js/`**: Frontend JavaScript modules
- **`templates/`**: HTML templates

### Database Schema
- **Notes**: Hierarchical note storage with metadata
- **Chats**: Conversation threads and message history
- **Flashcards**: Study materials with progress tracking
- **Documents**: RAG document metadata and indexing

## 🔧 Configuration

### Environment Variables
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://127.0.0.1:11434)
- `DATABASE_PATH`: SQLite database path (default: instance/notetaker.db)

### Model Configuration
Edit the model settings in `app.py` and `rag_manager.py`:
- Change LLM model: Modify `model_name` parameter
- Change embedding model: Modify `embedding_model` parameter
- Adjust chunk sizes and retrieval parameters

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) for local LLM support
- [OpenAI Whisper](https://github.com/openai/whisper) for speech recognition
- [Kokoro](https://github.com/synthspeech/kokoro) for text-to-speech
- [LangChain](https://langchain.com/) for RAG implementation
- [ChromaDB](https://www.trychroma.com/) for vector storage
- [EditorJS](https://editorjs.io/) for the rich text editor

## 🐛 Issues & Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/sardinaa/LLM-Notetaker/issues) page
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

## 🔮 Future Plans

- [ ] Multi-user support with authentication
- [ ] Cloud synchronization
- [ ] Plugin system for extensions
- [ ] Advanced search and filtering
- [ ] Import from other note-taking apps
- [ ] Collaborative editing features
- [ ] Mobile app development