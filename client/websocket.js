class WebSocketClient {
    constructor(canvas, cursorCanvas) {
        this.canvas = canvas;
        this.cursorCanvas = cursorCanvas;
        this.socket = null;
        this.userId = this.generateUserId();
        this.username = '';
        this.userColor = '';
        this.connected = false;
        this.latencyCheckInterval = null;
        this.lastPingTime = 0;
        this.lastCursorSend = 0;
        this.lastHistory = [];
    }
    
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    
    setUsername(name) {
        this.username = name || 'Anonymous';
    }
    
    connect() {
        // Connect to WebSocket server
        this.socket = io({
            transports: ['websocket', 'polling']
        });
        
        // Connection established
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.connected = true;
        });
        
        // Connection lost
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.connected = false;
        });
        
        // Connection error
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });
        
        // Receive assigned color from server
        this.socket.on('color-assigned', (data) => {
            this.userColor = data.color;
            
            // Set the canvas drawing color to user's assigned color
            this.canvas.setColor(this.userColor);
            
            // Update the color picker to show assigned color
            const colorPicker = document.getElementById('colorPicker');
            if (colorPicker) {
                colorPicker.value = this.userColor;
            }
            
            console.log('🎨 Assigned color:', this.userColor);
        });
        
        // Receive drawing data from other users (brush strokes)
        this.socket.on('draw-line', (data) => {
            if (data.userId !== this.userId) {
                this.canvas.drawRemoteData(data);
            }
        });
        
        // Accept shapes from all users (not filtering by userId)
        this.socket.on('draw-shape', (data) => {
            console.log('📐 Shape event received from:', data.userId, 'tool:', data.tool);
                
            // ✅ Draw the shape regardless of who sent it
            // The server already handles sending to all clients
            if (!this.canvas.shapes.find(s => s.id === data.id)) {
                console.log('📐 Drawing shape on canvas');
                this.canvas.drawRemoteShape(data);
                this.canvas.shapes.push(data);
            } else {
                console.log('📐 Shape already exists, skipping');
            }
        });
        
        // Receive text drawing
        this.socket.on('draw-text', (data) => {
            if (data.userId !== this.userId) {
                this.canvas.drawRemoteText(data);
                this.canvas.textBoxes.push(data);
            }
        });
        
        // ✅ FIX: Receive text edit - broadcast to all clients
        this.socket.on('text-edit', (data) => {
            console.log('✏️ Text edit received:', data.id);
            // Find and update text in local canvas
            const textBox = this.canvas.textBoxes.find(t => t.id === data.id);
            if (textBox) {
                textBox.text = data.text;
                // Redraw only the text area
                this.canvas.redrawText(textBox);
                console.log('✏️ Text updated on canvas');
            }
        });
        
        // ✅ FIX: Receive text delete - broadcast to all clients
        this.socket.on('text-delete', (data) => {
            console.log('🗑️ Text delete received:', data.id);
            const index = this.canvas.textBoxes.findIndex(t => t.id === data.id);
            if (index > -1) {
                const textBox = this.canvas.textBoxes[index];
                // Clear the text area
                this.canvas.clearTextArea(textBox);
                this.canvas.textBoxes.splice(index, 1);
                console.log('🗑️ Text deleted from canvas');
            }
        });
        
        // Receive cursor positions
        this.socket.on('cursor-move', (data) => {
            if (data.userId !== this.userId) {
                this.cursorCanvas.updateCursor(
                    data.userId, 
                    data.x, 
                    data.y, 
                    data.color, 
                    data.username
                );
            }
        });
        
        // Receive history update (for undo/redo)
        this.socket.on('history-update', (data) => {
            this.lastHistory = data.history || [];
            this.canvas.redrawFromHistory(this.lastHistory);
        });
        
        // Receive canvas clear
        this.socket.on('canvas-cleared', () => {
            this.canvas.clear();
        });
        
        // Receive user list
        this.socket.on('user-list', (users) => {
            this.updateUserList(users);
        });
        
        // User disconnected
        this.socket.on('user-left', (data) => {
            this.cursorCanvas.removeCursor(data.userId);
            this.canvas.clearRemoteBuffer(data.userId);
            console.log('👋 User left:', data.username);
        });
        
        // Latency response
        this.socket.on('pong', () => {
            const latency = Date.now() - this.lastPingTime;
            const latencyElement = document.getElementById('latency');
            if (latencyElement) {
                latencyElement.textContent = `Latency: ${latency}ms`;
            }
        });
        
        // Initial state
        this.socket.on('initial-state', (data) => {
            if (data.history && Array.isArray(data.history)) {
                this.lastHistory = data.history;
                this.canvas.redrawFromHistory(this.lastHistory);
            }
        });
    }
    
    joinCanvas(username) {
        if (!this.connected) {
            console.warn('Not connected yet, waiting...');
            setTimeout(() => this.joinCanvas(username), 100);
            return;
        }
        
        this.setUsername(username);
        this.socket.emit('user-join', {
            userId: this.userId,
            username: this.username
        });
        this.startLatencyCheck();
        console.log('👤 Joined canvas as:', this.username);
    }
    
    sendDrawData(data) {
        if (!this.connected) return;
        
        // Send drawing data immediately for smooth drawing
        this.socket.emit('draw-line', {
            ...data,
            userId: this.userId,
            username: this.username,
            color: data.tool === 'eraser' ? '#FFFFFF' : data.color
        });
    }
    
    sendShapeData(data) {
        if (!this.connected) return;
        
        console.log('📐 Sending shape:', data.tool);
        this.socket.emit('draw-shape', {
            ...data,
            userId: this.userId,
            username: this.username
        });
    }
    
    sendTextData(data) {
        if (!this.connected) return;
        
        this.socket.emit('draw-text', {
            ...data,
            userId: this.userId,
            username: this.username
        });
    }
    
    sendTextEditData(data) {
        if (!this.connected) return;
        
        console.log('✏️ Sending text edit:', data.id);
        this.socket.emit('text-edit', {
            ...data,
            userId: this.userId,
            username: this.username
        });
    }
    
    sendTextDelete(textId) {
        if (!this.connected) return;
        
        console.log('🗑️ Sending text delete:', textId);
        this.socket.emit('text-delete', {
            id: textId,
            userId: this.userId,
            username: this.username
        });
    }
    
    sendCompletePath(path) {
        if (!this.connected || path.length === 0) return;
        
        this.socket.emit('path-complete', {
            userId: this.userId,
            username: this.username,
            points: path,
            timestamp: Date.now()
        });
        
        // Clear own buffer after path is complete
        if (this.canvas && typeof this.canvas.clearRemoteBuffer === 'function') {
            this.canvas.clearRemoteBuffer(this.userId);
        }
    }
    
    sendCursorPosition(x, y) {
        if (!this.connected) return;
        
        // Throttle cursor updates to 50ms intervals
        const now = Date.now();
        if (now - this.lastCursorSend < 50) {
            return;
        }
        
        this.lastCursorSend = now;
        this.socket.emit('cursor-move', {
            userId: this.userId,
            username: this.username,
            x: x,
            y: y,
            color: this.userColor
        });
    }
    
    updateColor(newColor) {
        if (!this.connected) return;
        
        this.userColor = newColor;
        this.socket.emit('user-color-update', {
            userId: this.userId,
            color: newColor
        });
    }
    
    sendUndo() {
        if (!this.connected) return;
        
        this.socket.emit('undo', { 
            userId: this.userId 
        });
    }
    
    sendRedo() {
        if (!this.connected) return;
        
        this.socket.emit('redo', { 
            userId: this.userId 
        });
    }
    
    sendClear() {
        if (!this.connected) return;
        
        this.socket.emit('clear-canvas', { 
            userId: this.userId 
        });
    }
    
    updateUserList(users) {
        const usersList = document.getElementById('usersList');
        const userCount = document.getElementById('userCount');
        const onlineCount = document.getElementById('onlineCount');
        
        if (!usersList || !userCount || !onlineCount) {
            console.warn('User list elements not found in DOM');
            return;
        }
        
        // Clear existing list
        usersList.innerHTML = '';
        
        // Convert to array - handle Map, Array, or Object
        let userArray;
        if (users instanceof Map) {
            userArray = Array.from(users.values());
        } else if (Array.isArray(users)) {
            userArray = users;
        } else if (typeof users === 'object' && users !== null) {
            userArray = Object.values(users);
        } else {
            console.warn('Invalid users data type:', typeof users);
            return;
        }
        
        console.log('📋 Updating user list:', userArray.length, 'users');
        
        // Create badge for each user
        userArray.forEach(user => {
            if (!user || !user.userId) {
                console.warn('Invalid user object:', user);
                return;
            }
            
            const badge = document.createElement('div');
            badge.className = 'user-badge';
            
            // Highlight current user
            if (user.userId === this.userId) {
                badge.classList.add('current-user');
            }
            
            const userName = user.username || 'Anonymous';
            const userColor = user.color || '#000000';
            const isCurrentUser = user.userId === this.userId;
            
            badge.innerHTML = `
                <div class="user-color" style="background-color: ${userColor}"></div>
                <span class="user-name">${userName}${isCurrentUser ? ' (You)' : ''}</span>
            `;
            
            usersList.appendChild(badge);
        });
        
        // Update counts
        const count = userArray.length;
        userCount.textContent = `Users: ${count}`;
        onlineCount.textContent = count;
        
        console.log(`✅ Updated: ${count} users online`);
    }
    
    startLatencyCheck() {
        // Clear any existing interval
        if (this.latencyCheckInterval) {
            clearInterval(this.latencyCheckInterval);
        }
        
        this.latencyCheckInterval = setInterval(() => {
            if (this.connected) {
                this.lastPingTime = Date.now();
                this.socket.emit('ping');
            }
        }, 3000);
    }
    
    disconnect() {
        // Clean up
        if (this.latencyCheckInterval) {
            clearInterval(this.latencyCheckInterval);
        }
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.connected = false;
        console.log('🔌 Disconnected');
    }
}
