class OcrManager {
    constructor(treeView, editorInstance) {
        this.treeView = treeView;
        this.editorInstance = editorInstance;
        this.modalManager = new ModalManager();
        this.isProcessing = false;
        
        // Initialize Tesseract
        this.worker = null;
        this.initTesseract();
        
        // Initialize PDF.js for document processing
        this.pdfjs = null;
        this.initPdfJs();
    }
    
    async initTesseract() {
        // Dynamically import Tesseract.js
        if (!window.Tesseract) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/tesseract.js@v2.1.0/dist/tesseract.min.js';
            script.async = true;
            
            // Wait for the script to load
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        
        // Initialize worker once Tesseract is loaded
        this.worker = window.Tesseract.createWorker();
        await this.worker.load();
        await this.worker.loadLanguage('eng');
        await this.worker.initialize('eng');
        console.log('Tesseract worker initialized');
    }
    
    async initPdfJs() {
        // Dynamically import PDF.js
        if (!window.pdfjsLib) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js';
            script.async = true;
            
            // Wait for the script to load
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            
            // Set worker source
            const workerScript = document.createElement('script');
            workerScript.innerText = `
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
                }
            `;
            document.head.appendChild(workerScript);
        }
        
        console.log('PDF.js initialized');
    }
    
    async processFile(file) {
        try {
            if (!this.worker) {
                await this.initTesseract();
            }
            
            this.showProgressModal("Processing file...");
            this.isProcessing = true;
            
            let extractedText = '';
            let blocks = [];
            
            // Process based on file type
            if (file.type === 'application/pdf') {
                // PDF processing
                await this.initPdfJs(); // Make sure PDF.js is loaded
                blocks = await this.processPdfDocument(file);
            } else if (file.type.startsWith('image/')) {
                // Image processing
                const result = await this.worker.recognize(file);
                extractedText = result.data.text;
                blocks = this.parseTextToBlocks(extractedText);
            } else {
                throw new Error('Unsupported file type');
            }
            
            // Create a new note with OCR results
            const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove file extension
            const fileType = file.type.startsWith('image/') ? 'Image' : 'Document';
            const noteName = `${fileName} (${fileType})`;
            
            this.createNoteWithOcrResults(noteName, blocks);
            
            this.isProcessing = false;
            this.closeProgressModal();
            
            return true;
        } catch (error) {
            console.error('OCR processing failed:', error);
            this.isProcessing = false;
            this.closeProgressModal();
            await this.modalManager.showConfirmationDialog({
                title: "OCR Failed",
                message: "Failed to process the file. Please try again with a different file or format.",
                confirmText: "OK",
                icon: "exclamation-triangle"
            });
            return false;
        }
    }
    
    async processPdfDocument(pdfFile) {
        // Update progress modal
        this.updateProgressModal("Loading PDF document...");
        
        // Read the PDF file
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const totalPages = pdf.numPages;
        let allBlocks = [];
        
        // Add a header block
        allBlocks.push({
            type: "header",
            data: {
                text: "OCR Extracted Text",
                level: 2
            }
        });
        
        // Add metadata block with timestamp
        const now = new Date();
        allBlocks.push({
            type: "paragraph",
            data: {
                text: `<i>Document with ${totalPages} pages processed on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}</i>`
            }
        });
        
        // Process each page
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            this.updateProgressModal(`Processing page ${pageNum} of ${totalPages}...`);
            
            // Get the page
            const page = await pdf.getPage(pageNum);
            
            // Get text directly from PDF.js
            const textContent = await page.getTextContent();
            let pageText = textContent.items.map(item => item.str).join(' ');
            
            // If the page has embedded text, use it
            if (pageText.trim().length > 0) {
                // Add page header
                allBlocks.push({
                    type: "header",
                    data: {
                        text: `Page ${pageNum}`,
                        level: 3
                    }
                });
                
                // Add page text
                const paragraphs = pageText.split(/\n\s*\n/);
                paragraphs.forEach(paragraph => {
                    if (paragraph.trim()) {
                        allBlocks.push({
                            type: "paragraph",
                            data: {
                                text: paragraph.trim()
                            }
                        });
                    }
                });
            } else {
                // If no embedded text, render page as image and use OCR
                try {
                    // Render PDF page to canvas
                    const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better OCR
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;
                    
                    // Convert canvas to image blob
                    const imageBlob = await new Promise(resolve => {
                        canvas.toBlob(resolve, 'image/png');
                    });
                    
                    // Use OCR on the rendered page
                    const result = await this.worker.recognize(imageBlob);
                    const pageOcrText = result.data.text;
                    
                    // Add page header
                    allBlocks.push({
                        type: "header",
                        data: {
                            text: `Page ${pageNum}`,
                            level: 3
                        }
                    });
                    
                    // Parse the OCR text
                    const paragraphs = pageOcrText.split(/\n\s*\n/);
                    paragraphs.forEach(paragraph => {
                        if (paragraph.trim()) {
                            allBlocks.push({
                                type: "paragraph",
                                data: {
                                    text: paragraph.trim()
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.error('Error processing PDF page', err);
                    allBlocks.push({
                        type: "paragraph",
                        data: {
                            text: `<i>Error extracting text from page ${pageNum}</i>`
                        }
                    });
                }
            }
        }
        
        return allBlocks;
    }
    
    updateProgressModal(message) {
        if (this.modalOverlay) {
            const messageElement = this.modalOverlay.querySelector('p');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }
    
    parseTextToBlocks(text) {
        const blocks = [];
        
        // Add a header block
        blocks.push({
            type: "header",
            data: {
                text: "OCR Extracted Text",
                level: 2
            }
        });
        
        // Process text into paragraphs
        const paragraphs = text.split(/\n\s*\n/);
        
        paragraphs.forEach(paragraph => {
            if (paragraph.trim()) {
                // Check if paragraph looks like a header (short, ends with colon, etc.)
                if (paragraph.length < 50 && /^[A-Z0-9\s]{5,50}$/.test(paragraph)) {
                    blocks.push({
                        type: "header",
                        data: {
                            text: paragraph.trim(),
                            level: 3
                        }
                    });
                } else {
                    blocks.push({
                        type: "paragraph",
                        data: {
                            text: paragraph.trim()
                        }
                    });
                }
            }
        });
        
        return blocks;
    }
    
    async createNoteWithOcrResults(noteName, blocks) {
        // Find selected folder or default to root
        const selectedId = this.treeView.selectedNode;
        const parentNode = selectedId ? this.treeView.findNodeById(this.treeView.nodes, selectedId) : null;
        const parentId = parentNode && parentNode.type === 'folder' ? selectedId : null;
        
        // Create a new note with OCR content
        const noteContent = { blocks: blocks };
        const newNodeId = this.treeView.addNode({
            name: noteName,
            type: 'note',
            content: noteContent
        }, parentId);
        
        // Select and display the new note
        const node = this.treeView.selectNode(newNodeId);
        document.getElementById('note-title-display').textContent = node.name;
        try {
            await this.editorInstance.render(node.content);
            this.editorInstance.setCurrentNote(newNodeId);
        } catch (error) {
            console.error('Error rendering OCR note content:', error);
        }
        
        // Save tree to backend
        this.saveTreeToBackend();
    }
    
    showProgressModal(message) {
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'ocr-modal-overlay';
        this.modalOverlay.innerHTML = `
            <div class="ocr-modal">
                <div class="ocr-spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        // Add styling
        const style = document.createElement('style');
        style.textContent = `
            .ocr-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            }
            .ocr-modal {
                background: white;
                padding: 30px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            }
            .ocr-spinner {
                border: 5px solid #f3f3f3;
                border-top: 5px solid #3498db;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                margin: 0 auto 20px;
                animation: ocr-spin 2s linear infinite;
            }
            @keyframes ocr-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.modalOverlay);
    }
    
    closeProgressModal() {
        if (this.modalOverlay) {
            document.body.removeChild(this.modalOverlay);
            this.modalOverlay = null;
        }
    }
    
    saveTreeToBackend() {
        fetch('/api/tree', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.treeView.nodes)
        }).catch(error => {
            console.error('Error saving tree:', error);
        });
    }
}

// Initialize OCR functionality
document.addEventListener('DOMContentLoaded', () => {
    // OCR will be initialized after treeView and editorInstance in app.js
    if (!window.initializeOcr) {
        window.initializeOcr = function(treeView, editorInstance) {
            window.ocrManager = new OcrManager(treeView, editorInstance);
            // OCR is now available through the Editor.js plus menu (block toolbar)
            // No longer adding OCR button to sidebar
        };
    }
});