class DrawingCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        this.canvas.width = 1200;
        this.canvas.height = 600;
        
        // Drawing state
        this.isDrawing = false;
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.currentWidth = 5;
        this.waitingForTextLocation = false;
        this.pendingText = null;
        
        // For lines and shapes
        this.startX = 0;
        this.startY = 0;
        this.lastImageData = null;
        
        // Smooth line drawing
        this.points = [];
        this.currentPath = [];
        
        // Remote buffer
        this.remotePointBuffers = new Map();
        
        // Text boxes for editing and shapes tracking
        this.textBoxes = [];
        this.shapes = [];
        
        this.setupCanvas();
        this.attachEvents();
    }
    
    setupCanvas() {
        this.ctx.setLineDash([]);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }
    
    attachEvents() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    handleDoubleClick(e) {
        if (this.currentTool === 'text') {
            const pos = this.getMousePos(e);
            // Check if clicking on existing text
            for (let i = 0; i < this.textBoxes.length; i++) {
                const textBox = this.textBoxes[i];
                if (pos.x >= textBox.x - 50 && pos.x <= textBox.x + 200 &&
                    pos.y >= textBox.y - 20 && pos.y <= textBox.y + 20) {
                    this.editTextBox(i);
                    return;
                }
            }
            // Add new text at location
            this.addTextAtLocation(pos.x, pos.y);
        }
    }
    
    startDrawing(e) {
        // Handle text location selection
        if (this.currentTool === 'text' && this.waitingForTextLocation) {
            const pos = this.getMousePos(e);
            this.addTextAtLocation(pos.x, pos.y);
            return;
        }
        
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.startX = pos.x;
        this.startY = pos.y;
        this.points = [pos];
        
        if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
            this.lastImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
        
        this.currentPath = [{
            x: pos.x,
            y: pos.y,
            color: this.currentColor,
            width: this.currentWidth,
            tool: this.currentTool
        }];
    }
    
    draw(e) {
        if (!this.isDrawing) {
            const pos = this.getMousePos(e);
            if (window.wsClient) {
                window.wsClient.sendCursorPosition(pos.x, pos.y);
            }
            return;
        }
        
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.drawBrush(pos);
        } else if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
            this.drawShape(pos);
        }
    }
    
    drawBrush(pos) {
        this.points.push(pos);
        
        if (this.points.length > 2) {
            this.drawSmoothLine();
        }
        
        this.currentPath.push({
            x: pos.x,
            y: pos.y,
            color: this.currentColor,
            width: this.currentWidth,
            tool: this.currentTool
        });
        
        if (window.wsClient) {
            window.wsClient.sendDrawData({
                points: this.points.slice(-2),
                color: this.currentColor,
                width: this.currentWidth,
                tool: this.currentTool
            });
        }
    }
    
    drawShape(pos) {
        if (this.lastImageData) {
            this.ctx.putImageData(this.lastImageData, 0, 0);
        }
        
        this.ctx.setLineDash([]);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentWidth;
        this.ctx.fillStyle = 'transparent';
        
        const width = pos.x - this.startX;
        const height = pos.y - this.startY;
        
        if (this.currentTool === 'line') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
        } else if (this.currentTool === 'rectangle') {
            this.ctx.strokeRect(this.startX, this.startY, width, height);
        } else if (this.currentTool === 'circle') {
            const radius = Math.sqrt(width * width + height * height) / 2;
            this.ctx.beginPath();
            this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    drawSmoothLine() {
        const len = this.points.length;
        const p1 = this.points[len - 3];
        const p2 = this.points[len - 2];
        const p3 = this.points[len - 1];
        
        const midPoint1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const midPoint2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(midPoint1.x, midPoint1.y);
        this.ctx.quadraticCurveTo(p2.x, p2.y, midPoint2.x, midPoint2.y);
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor;
        this.ctx.lineWidth = this.currentWidth;
        this.ctx.stroke();
        this.ctx.closePath();
    }
    
    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
            const shapeData = {
                tool: this.currentTool,
                startX: this.startX,
                startY: this.startY,
                endX: this.points[this.points.length - 1]?.x || this.startX,
                endY: this.points[this.points.length - 1]?.y || this.startY,
                color: this.currentColor,
                width: this.currentWidth,
                id: this.generateId()
            };
            
            // Add to local shapes array
            this.shapes.push(shapeData);
            
            if (window.wsClient) {
                window.wsClient.sendShapeData(shapeData);
            }
        } else {
            if (window.wsClient && this.currentPath.length > 0) {
                window.wsClient.sendCompletePath(this.currentPath);
            }
        }
        
        this.currentPath = [];
        this.points = [];
        this.lastImageData = null;
    }
    
    addTextAtLocation(x, y) {
        const modal = document.getElementById('textModal');
        const input = document.getElementById('textInput');
        
        modal.style.display = 'flex';
        input.focus();
        input.value = '';
        
        const addText = () => {
            const text = input.value.trim();
            if (text) {
                const textData = {
                    text: text,
                    x: x,
                    y: y,
                    color: this.currentColor,
                    fontSize: 20,
                    id: this.generateId()
                };
                
                this.drawRemoteText(textData);
                this.textBoxes.push(textData);
                
                if (window.wsClient) {
                    window.wsClient.sendTextData(textData);
                }
                
                modal.style.display = 'none';
                this.waitingForTextLocation = false;
                this.pendingText = null;
            }
        };
        
        const confirmBtn = document.getElementById('textConfirmBtn');
        const cancelBtn = document.getElementById('textCancelBtn');
        const deleteBtn = document.getElementById('textDeleteBtn');
        
        // Remove old listeners
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        if (deleteBtn) deleteBtn.onclick = null;
        
        confirmBtn.textContent = 'Add Text';
        confirmBtn.onclick = addText;
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            this.waitingForTextLocation = false;
            this.pendingText = null;
        };
        
        // Hide delete button for new text
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                addText();
            }
        };
    }
    
    editTextBox(index) {
        const textBox = this.textBoxes[index];
        const modal = document.getElementById('textModal');
        const input = document.getElementById('textInput');
        
        modal.style.display = 'flex';
        input.value = textBox.text;
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newText = input.value.trim();
            if (newText) {
                textBox.text = newText;
                
                // ✅ FIX: Only redraw the text area
                this.redrawText(textBox);
                
                if (window.wsClient) {
                    window.wsClient.sendTextEditData({
                        id: textBox.id,
                        text: newText,
                        x: textBox.x,
                        y: textBox.y,
                        color: textBox.color,
                        fontSize: textBox.fontSize
                    });
                }
                
                modal.style.display = 'none';
            }
        };
        
        const confirmBtn = document.getElementById('textConfirmBtn');
        const cancelBtn = document.getElementById('textCancelBtn');
        const deleteBtn = document.getElementById('textDeleteBtn');
        
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        if (deleteBtn) deleteBtn.onclick = null;
        
        confirmBtn.textContent = 'Update';
        confirmBtn.onclick = saveEdit;
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };
        
        // Show delete button for existing text
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-block';
            deleteBtn.onclick = () => {
                const deletedBox = this.textBoxes[index];
                // Remove text from array
                this.textBoxes.splice(index, 1);
                
                // ✅ FIX: Only clear the text area
                this.clearTextArea(deletedBox);
                
                // Broadcast deletion
                if (window.wsClient) {
                    window.wsClient.sendTextDelete(deletedBox.id);
                }
                
                modal.style.display = 'none';
            };
        }
        
        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            }
        };
    }
    
    // ✅ Only redraw specific text
    redrawText(textBox) {
        // Clear only the text area
        const clearWidth = 250;
        const clearHeight = 30;
        this.ctx.clearRect(textBox.x - 50, textBox.y - 20, clearWidth, clearHeight);
        
        // Redraw the text
        this.ctx.font = `${textBox.fontSize}px Arial`;
        this.ctx.fillStyle = textBox.color;
        this.ctx.fillText(textBox.text, textBox.x, textBox.y);
    }
    
    // ✅ Clear only the text area
    clearTextArea(textBox) {
        const clearWidth = 250;
        const clearHeight = 30;
        this.ctx.clearRect(textBox.x - 50, textBox.y - 25, clearWidth, clearHeight);
    }
    
    drawRemoteData(data) {
        if (!data.points || data.points.length === 0) return;
        
        const userId = data.userId || 'default';
        
        if (!this.remotePointBuffers.has(userId)) {
            this.remotePointBuffers.set(userId, []);
        }
        
        const buffer = this.remotePointBuffers.get(userId);
        
        data.points.forEach(point => {
            buffer.push({
                x: point.x,
                y: point.y,
                color: data.color,
                width: data.width,
                tool: data.tool
            });
        });
        
        this.drawBufferedPoints(buffer, data);
        
        if (buffer.length > 3) {
            const keepPoints = buffer.slice(-3);
            this.remotePointBuffers.set(userId, keepPoints);
        }
    }
    
    drawBufferedPoints(buffer, data) {
        if (buffer.length < 2) return;
        
        this.ctx.setLineDash([]);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = data.tool === 'eraser' ? '#FFFFFF' : data.color;
        this.ctx.lineWidth = data.width;
        
        if (buffer.length === 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(buffer[0].x, buffer[0].y);
            this.ctx.lineTo(buffer[1].x, buffer[1].y);
            this.ctx.stroke();
            this.ctx.closePath();
        } else {
            this.ctx.beginPath();
            this.ctx.moveTo(buffer[0].x, buffer[0].y);
            
            for (let i = 0; i < buffer.length - 1; i++) {
                const currentPoint = buffer[i];
                const nextPoint = buffer[i + 1];
                
                const controlX = (currentPoint.x + nextPoint.x) / 2;
                const controlY = (currentPoint.y + nextPoint.y) / 2;
                
                this.ctx.quadraticCurveTo(
                    currentPoint.x, 
                    currentPoint.y, 
                    controlX, 
                    controlY
                );
            }
            
            const lastPoint = buffer[buffer.length - 1];
            this.ctx.lineTo(lastPoint.x, lastPoint.y);
            this.ctx.stroke();
            this.ctx.closePath();
        }
    }
    
    drawRemoteShape(data) {
        this.ctx.setLineDash([]);
        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = data.width;
        
        const width = data.endX - data.startX;
        const height = data.endY - data.startY;
        
        if (data.tool === 'line') {
            this.ctx.beginPath();
            this.ctx.moveTo(data.startX, data.startY);
            this.ctx.lineTo(data.endX, data.endY);
            this.ctx.stroke();
        } else if (data.tool === 'rectangle') {
            this.ctx.strokeRect(data.startX, data.startY, width, height);
        } else if (data.tool === 'circle') {
            const radius = Math.sqrt(width * width + height * height) / 2;
            this.ctx.beginPath();
            this.ctx.arc(data.startX, data.startY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    drawRemoteText(data) {
        this.ctx.font = `${data.fontSize}px Arial`;
        this.ctx.fillStyle = data.color;
        this.ctx.fillText(data.text, data.x, data.y);
    }
    
    clearRemoteBuffer(userId) {
        if (this.remotePointBuffers.has(userId)) {
            this.remotePointBuffers.delete(userId);
        }
    }
    
    drawPath(path) {
        if (!path || path.length === 0) return;
        
        this.ctx.setLineDash([]);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (path.length < 3) {
            for (let i = 1; i < path.length; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(path[i - 1].x, path[i - 1].y);
                this.ctx.lineTo(path[i].x, path[i].y);
                this.ctx.strokeStyle = path[i].tool === 'eraser' ? '#FFFFFF' : path[i].color;
                this.ctx.lineWidth = path[i].width;
                this.ctx.stroke();
                this.ctx.closePath();
            }
        } else {
            this.ctx.beginPath();
            this.ctx.moveTo(path[0].x, path[0].y);
            
            for (let i = 0; i < path.length - 1; i++) {
                const currentPoint = path[i];
                const nextPoint = path[i + 1];
                
                const controlX = (currentPoint.x + nextPoint.x) / 2;
                const controlY = (currentPoint.y + nextPoint.y) / 2;
                
                this.ctx.strokeStyle = currentPoint.tool === 'eraser' ? '#FFFFFF' : currentPoint.color;
                this.ctx.lineWidth = currentPoint.width;
                
                this.ctx.quadraticCurveTo(
                    currentPoint.x,
                    currentPoint.y,
                    controlX,
                    controlY
                );
            }
            
            const lastPoint = path[path.length - 1];
            this.ctx.lineTo(lastPoint.x, lastPoint.y);
            this.ctx.stroke();
            this.ctx.closePath();
        }
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.remotePointBuffers.clear();
        this.textBoxes = [];
        this.shapes = [];
    }
    
    redrawFromHistory(history) {
        this.clear();
        this.ctx.setLineDash([]);
        this.textBoxes = [];
        this.shapes = [];
        
        console.log('📊 Redrawing from history:', history.length, 'items');
        
        history.forEach(item => {
            if (item) {
                if (item.points) {
                    console.log('🖌️ Drawing path');
                    this.drawPath(item.points);
                } else if (item.tool === 'text') {
                    console.log('📝 Drawing text');
                    this.drawRemoteText(item);
                    // Avoid duplicates
                    if (!this.textBoxes.find(t => t.id === item.id)) {
                        this.textBoxes.push(item);
                    }
                } else if (['line', 'rectangle', 'circle'].includes(item.tool)) {
                    console.log('📐 Drawing shape:', item.tool);
                    this.drawRemoteShape(item);
                    // Avoid duplicates
                    if (!this.shapes.find(s => s.id === item.id)) {
                        this.shapes.push(item);
                    }
                }
            }
        });
    }
    
    setTool(tool) {
        this.currentTool = tool;
    }
    
    setColor(color) {
        this.currentColor = color;
    }
    
    setWidth(width) {
        this.currentWidth = width;
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

class CursorCanvas {
    constructor(canvasId, mainCanvas) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = mainCanvas.width;
        this.canvas.height = mainCanvas.height;
        this.cursors = new Map();
    }
    
    updateCursor(userId, x, y, color, username) {
        this.cursors.set(userId, { x, y, color, username, timestamp: Date.now() });
        this.render();
        
        setTimeout(() => {
            const cursor = this.cursors.get(userId);
            if (cursor && Date.now() - cursor.timestamp > 2000) {
                this.cursors.delete(userId);
                this.render();
            }
        }, 2000);
    }
    
    removeCursor(userId) {
        this.cursors.delete(userId);
        this.render();
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.cursors.forEach((cursor) => {
            this.ctx.beginPath();
            this.ctx.arc(cursor.x, cursor.y, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = cursor.color;
            this.ctx.fill();
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.closePath();
            
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.fillStyle = cursor.color;
            this.ctx.fillText(cursor.username, cursor.x + 12, cursor.y - 5);
        });
    }
}
