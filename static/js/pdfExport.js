class PdfExporter {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const exportPdfButton = document.getElementById('exportPdf');
        if (exportPdfButton) {
            exportPdfButton.addEventListener('click', this.exportCurrentNote.bind(this));
        }
    }

    async exportCurrentNote() {
        // Check if there's an active note
        if (!window.editorInstance || !window.editorInstance.currentNoteId) {
            alert('Please select a note to export.');
            return;
        }

        try {
            // Show loading indicator
            this.showExportStatus('Preparing export...');
            
            // Get note data
            const noteId = window.editorInstance.currentNoteId;
            const noteTitle = document.getElementById('note-title-display').textContent || 'Note';
            
            // Get editor content
            const editorData = await window.editorInstance.getData();
            
            // Create PDF using jsPDF directly
            const pdf = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            // Set document properties
            pdf.setProperties({
                title: noteTitle,
                creator: 'Notes Web App',
                author: 'User'
            });
            
            // Add title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(24);
            pdf.text(noteTitle, 20, 20);
            
            // Current Y position for content
            let yPos = 30;
            
            // Process each block for direct PDF content addition
            if (editorData && editorData.blocks && editorData.blocks.length > 0) {
                this.showExportStatus('Processing content...');
                
                for (let i = 0; i < editorData.blocks.length; i++) {
                    const block = editorData.blocks[i];
                    yPos = await this.addBlockToPdf(pdf, block, yPos);
                    
                    // Check if we need a new page
                    if (yPos > 270) {
                        pdf.addPage();
                        yPos = 20;
                    }
                }
            } else {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(12);
                pdf.text('This note has no content.', 20, yPos);
            }
            
            // Save the PDF
            this.showExportStatus('Generating PDF...');
            const filename = `${noteTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
            pdf.save(filename);
            
            this.showExportStatus('Export complete!', 'success');
            
            // Hide status after a delay
            setTimeout(() => {
                this.hideExportStatus();
            }, 3000);
        } catch (error) {
            console.error('PDF export failed:', error);
            this.showExportStatus('Export failed. Please try again.', 'error');
            
            // Hide error after a delay
            setTimeout(() => {
                this.hideExportStatus();
            }, 3000);
        }
    }
    
    async addBlockToPdf(pdf, block, yPos) {
        if (!block || !block.type) return yPos;
        
        // Add spacing between blocks
        yPos += 5;
        
        switch (block.type) {
            case 'header':
                const headerLevel = block.data.level || 2;
                // Font size based on header level
                const fontSize = headerLevel === 1 ? 20 : 
                                 headerLevel === 2 ? 18 : 
                                 headerLevel === 3 ? 16 : 
                                 headerLevel === 4 ? 14 : 12;
                
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(fontSize);
                
                // Handle text wrapping for headers
                const headerText = this.stripHtml(block.data.text || '');
                const splitHeaderText = pdf.splitTextToSize(headerText, 170);
                pdf.text(splitHeaderText, 20, yPos);
                
                // Move position based on number of lines
                yPos += 7 * splitHeaderText.length;
                break;
                
            case 'paragraph':
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(12);
                
                // Convert HTML content to plain text
                const paragraphText = this.stripHtml(block.data.text || '');
                const splitText = pdf.splitTextToSize(paragraphText, 170);
                pdf.text(splitText, 20, yPos);
                
                // Move position based on text height
                yPos += 5 * splitText.length;
                break;
                
            case 'list':
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(12);
                
                const items = block.data.items || [];
                const listMarker = block.data.style === 'ordered' ? (idx) => `${idx + 1}. ` : () => '• ';
                
                for (let i = 0; i < items.length; i++) {
                    const marker = listMarker(i);
                    
                    // Handle different list item formats
                    let itemText;
                    if (typeof items[i] === 'string') {
                        itemText = this.stripHtml(items[i]);
                    } else if (typeof items[i] === 'object') {
                        if (items[i].hasOwnProperty('content')) {
                            itemText = this.stripHtml(items[i].content);
                        } else if (items[i].hasOwnProperty('text')) {
                            itemText = this.stripHtml(items[i].text);
                        } else {
                            itemText = this.stripHtml(JSON.stringify(items[i]));
                        }
                    } else {
                        itemText = String(items[i]);
                    }
                    
                    const splitItem = pdf.splitTextToSize(itemText, 160);
                    
                    pdf.text(marker, 20, yPos);
                    pdf.text(splitItem, 25, yPos);
                    
                    yPos += 5 * splitItem.length + 2;
                    
                    // Check if we need a new page
                    if (yPos > 270 && i < items.length - 1) {
                        pdf.addPage();
                        yPos = 20;
                    }
                }
                break;
                
            case 'checklist':
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(12);
                
                const checkItems = block.data.items || [];
                
                for (let i = 0; i < checkItems.length; i++) {
                    let itemText;
                    let isChecked = false;
                    
                    if (typeof checkItems[i] === 'string') {
                        itemText = this.stripHtml(checkItems[i]);
                    } else if (typeof checkItems[i] === 'object') {
                        if (checkItems[i].hasOwnProperty('text')) {
                            itemText = this.stripHtml(checkItems[i].text);
                        } else {
                            itemText = this.stripHtml(JSON.stringify(checkItems[i]));
                        }
                        isChecked = checkItems[i].checked === true;
                    }
                    
                    const checkboxMarker = isChecked ? '☑ ' : '☐ ';
                    const splitItem = pdf.splitTextToSize(itemText, 160);
                    
                    pdf.text(checkboxMarker, 20, yPos);
                    pdf.text(splitItem, 25, yPos);
                    
                    yPos += 5 * splitItem.length + 2;
                    
                    if (yPos > 270 && i < checkItems.length - 1) {
                        pdf.addPage();
                        yPos = 20;
                    }
                }
                break;
                
            case 'code':
                pdf.setFont('courier', 'normal');
                pdf.setFontSize(10);
                
                // Draw code block background
                pdf.setDrawColor(200, 200, 200);
                pdf.setFillColor(246, 248, 250);
                
                const codeText = block.data.code || '';
                const codeLines = codeText.split('\n');
                
                // Calculate height of code block for background rectangle
                const lineHeight = 5;
                const codeHeight = lineHeight * codeLines.length + 6;
                
                // Draw background rectangle
                pdf.rect(18, yPos - 4, 174, codeHeight, 'F');
                
                // Add optional language identifier
                if (block.data.language) {
                    pdf.setFont('courier', 'bold');
                    pdf.setFontSize(8);
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(block.data.language.toUpperCase(), 20, yPos - 1);
                    yPos += 3;
                }
                
                // Reset text color and font for code content
                pdf.setTextColor(0, 0, 0);
                pdf.setFont('courier', 'normal');
                pdf.setFontSize(10);
                
                for (let i = 0; i < codeLines.length; i++) {
                    const line = codeLines[i];
                    pdf.text(line, 20, yPos);
                    yPos += lineHeight;
                    
                    // Check if we need a new page
                    if (yPos > 270 && i < codeLines.length - 1) {
                        pdf.addPage();
                        yPos = 20;
                    }
                }
                
                // Add extra space after code block
                yPos += 3;
                
                // Reset font after code block
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(12);
                break;
                
            case 'quote':
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(12);
                
                // Draw quote line
                pdf.setDrawColor(200, 200, 200);
                pdf.setFillColor(200, 200, 200);
                
                const quoteText = this.stripHtml(block.data.text || '');
                const splitQuote = pdf.splitTextToSize(quoteText, 160);
                
                // Calculate height for quote line
                const quoteHeight = 5 * splitQuote.length;
                
                // Draw quote line
                pdf.rect(18, yPos - 3, 2, quoteHeight + 3, 'F');
                
                pdf.text(splitQuote, 25, yPos);
                
                yPos += quoteHeight;
                
                // Add caption/attribution if available
                if (block.data.caption) {
                    yPos += 3;
                    const attribution = this.stripHtml(block.data.caption);
                    pdf.text(`— ${attribution}`, 25, yPos);
                    yPos += 5;
                }
                
                // Reset font after quote
                pdf.setFont('helvetica', 'normal');
                break;
                
            case 'table':
                if (block.data && block.data.content) {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(10);
                    
                    const table = block.data.content;
                    const colWidth = 170 / (table[0]?.length || 1);
                    const rowHeight = 7;
                    
                    // Draw table header if withHeadings is true
                    let startRow = 0;
                    if (block.data.withHeadings && table.length > 0) {
                        pdf.setFont('helvetica', 'bold');
                        for (let j = 0; j < table[0].length; j++) {
                            const cellText = this.stripHtml(table[0][j] || '');
                            const cellX = 20 + j * colWidth;
                            pdf.text(cellText, cellX, yPos);
                        }
                        yPos += rowHeight;
                        startRow = 1;
                        
                        // Add header underline
                        pdf.setDrawColor(200, 200, 200);
                        pdf.line(20, yPos - 2, 190, yPos - 2);
                        pdf.setFont('helvetica', 'normal');
                    }
                    
                    // Draw table content
                    for (let i = startRow; i < table.length; i++) {
                        for (let j = 0; j < table[i].length; j++) {
                            const cellText = this.stripHtml(table[i][j] || '');
                            const cellX = 20 + j * colWidth;
                            pdf.text(cellText, cellX, yPos);
                        }
                        yPos += rowHeight;
                        
                        // Add light row separator
                        if (i < table.length - 1) {
                            pdf.setDrawColor(230, 230, 230);
                            pdf.line(20, yPos - 2, 190, yPos - 2);
                        }
                        
                        if (yPos > 270 && i < table.length - 1) {
                            pdf.addPage();
                            yPos = 20;
                        }
                    }
                }
                break;
                
            case 'image':
                if (block.data.url) {
                    try {
                        const caption = block.data.caption || '';
                        
                        // Load image and add to PDF
                        const imgData = await this.loadImage(block.data.url);
                        if (imgData) {
                            // Calculate image dimensions to fit in PDF
                            const maxWidth = 160;
                            const imgProps = pdf.getImageProperties(imgData);
                            const imgWidth = Math.min(maxWidth, imgProps.width);
                            const imgHeight = imgProps.height * imgWidth / imgProps.width;
                            
                            // Check if we need a new page
                            if (yPos + imgHeight + 15 > 280) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            // Add image
                            pdf.addImage(imgData, 'JPEG', 20, yPos, imgWidth, imgHeight);
                            
                            yPos += imgHeight + 5;
                            
                            // Add caption if exists
                            if (caption) {
                                pdf.setFont('helvetica', 'italic');
                                pdf.setFontSize(10);
                                pdf.text(caption, 20, yPos);
                                yPos += 7;
                            }
                        }
                    } catch (error) {
                        console.error('Error adding image to PDF:', error);
                        pdf.text(`[Failed to load image: ${block.data.url}]`, 20, yPos);
                        yPos += 7;
                    }
                }
                break;
                
            case 'delimiter':
                yPos += 5;
                pdf.setDrawColor(200, 200, 200);
                pdf.line(70, yPos, 140, yPos);
                yPos += 10;
                break;
                
            default:
                try {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(12);
                    
                    // Try to extract and display any text content from the block data
                    let blockContent = '';
                    if (typeof block.data === 'object') {
                        if (block.data.text) {
                            blockContent = this.stripHtml(block.data.text);
                        } else if (block.data.content) {
                            blockContent = this.stripHtml(block.data.content);
                        } else {
                            blockContent = `[${block.type} block]`;
                        }
                    } else {
                        blockContent = `[${block.type} block]`;
                    }
                    
                    const splitContent = pdf.splitTextToSize(blockContent, 170);
                    pdf.text(splitContent, 20, yPos);
                    yPos += 5 * splitContent.length;
                } catch (err) {
                    console.error('Error processing block:', err);
                    pdf.text(`[Unsupported block: ${block.type}]`, 20, yPos);
                    yPos += 7;
                }
        }
        
        return yPos + 5; // Add spacing after block
    }
    
    // Helper to load an image as base64 for PDF
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, img.width, img.height);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg');
                    resolve(dataUrl);
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = (error) => {
                reject(error);
            };
            
            img.src = url;
        });
    }
    
    // Helper to remove HTML tags with better handling
    stripHtml(html) {
        if (!html) return '';
        
        // Handle non-string inputs
        if (typeof html !== 'string') {
            try {
                return String(html);
            } catch (e) {
                return '';
            }
        }
        
        try {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Replace <br> and </p> tags with newlines before extracting text
            const brs = temp.querySelectorAll('br');
            for (let i = 0; i < brs.length; i++) {
                brs[i].replaceWith(document.createTextNode('\n'));
            }
            
            // Replace paragraph ends with newlines
            const paragraphs = temp.querySelectorAll('p');
            for (let i = 0; i < paragraphs.length; i++) {
                paragraphs[i].appendChild(document.createTextNode('\n'));
            }
            
            return temp.textContent || temp.innerText || '';
        } catch (e) {
            console.error('Error stripping HTML:', e);
            return html.replace(/<[^>]*>/g, ''); // Fallback to regex
        }
    }
    
    showExportStatus(message, type = 'info') {
        // Check if status element exists, create if not
        let statusElement = document.getElementById('export-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'export-status';
            statusElement.style.position = 'fixed';
            statusElement.style.bottom = '20px';
            statusElement.style.right = '20px';
            statusElement.style.padding = '10px 20px';
            statusElement.style.borderRadius = '4px';
            statusElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            statusElement.style.zIndex = '1000';
            document.body.appendChild(statusElement);
        }
        
        // Set style based on type
        switch (type) {
            case 'success':
                statusElement.style.backgroundColor = '#d4edda';
                statusElement.style.color = '#155724';
                break;
            case 'error':
                statusElement.style.backgroundColor = '#f8d7da';
                statusElement.style.color = '#721c24';
                break;
            default:
                statusElement.style.backgroundColor = '#e7f5ff';
                statusElement.style.color = '#0a58ca';
        }
        
        // Set message and show
        statusElement.textContent = message;
        statusElement.style.display = 'block';
    }
    
    hideExportStatus() {
        const statusElement = document.getElementById('export-status');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pdfExporter = new PdfExporter();
});
