const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const DrawingState = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../client')));

const drawingState = new DrawingState();
const users = new Map();
const usedColors = new Set();

function generateUniqueColor() {
    const colorPalette = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F39C12', '#E74C3C',
        '#9B59B6', '#3498DB', '#1ABC9C', '#2ECC71', '#F1C40F',
        '#E67E22', '#E91E63', '#00BCD4', '#8BC34A', '#FF5722',
        '#607D8B', '#795548', '#FF9800', '#CDDC39', '#673AB7'
    ];
    
    for (let color of colorPalette) {
        if (!usedColors.has(color)) {
            usedColors.add(color);
            return color;
        }
    }
    
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    usedColors.add(randomColor);
    return randomColor;
}

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    socket.on('user-join', (data) => {
        const userColor = generateUniqueColor();
        
        users.set(socket.id, {
            userId: data.userId,
            username: data.username || 'Anonymous',
            color: userColor,
            socketId: socket.id
        });
        
        socket.emit('color-assigned', { color: userColor });
        socket.emit('initial-state', {
            history: drawingState.getHistory()
        });
        
        const userArray = Array.from(users.values());
        io.emit('user-list', userArray);
        
        console.log(`${data.username} joined with color ${userColor}. Total users: ${users.size}`);
    });
    
    socket.on('user-color-update', (data) => {
        const user = users.get(socket.id);
        if (user) {
            usedColors.delete(user.color);
            user.color = data.color;
            usedColors.add(data.color);
            
            const userArray = Array.from(users.values());
            io.emit('user-list', userArray);
        }
    });
    
    // ✅ BRUSH/LINE DRAWING - broadcast to others only
    socket.on('draw-line', (data) => {
        socket.broadcast.emit('draw-line', data);
    });
    
    // ✅ FIX: SHAPES - broadcast to ALL clients (including sender)
    socket.on('draw-shape', (data) => {
        console.log('📐 Shape received on server:', data.tool, 'from', data.userId);
        // Broadcast to ALL clients including the sender
        io.emit('draw-shape', data);
        // Save to history
        drawingState.addShape(data);
        console.log('✅ Shape saved to history and broadcast to all');
    });
    
    // ✅ TEXT - broadcast to ALL clients (including sender)
    socket.on('draw-text', (data) => {
        console.log('📝 Text received on server from', data.userId);
        // Broadcast to ALL clients including the sender
        io.emit('draw-text', data);
        drawingState.addText(data);
        console.log('✅ Text saved to history and broadcast to all');
    });
    
    // ✅ TEXT EDIT - broadcast to ALL clients (including sender)
    socket.on('text-edit', (data) => {
        console.log('✏️ Text edit received on server:', data.id);
        // Broadcast to ALL clients including the sender
        io.emit('text-edit', data);
        drawingState.updateText(data);
        console.log('✅ Text edit broadcast to all');
    });
    
    // ✅ TEXT DELETE - broadcast to ALL clients (including sender)
    socket.on('text-delete', (data) => {
        console.log('🗑️ Text delete received on server:', data.id);
        // Broadcast to ALL clients including the sender
        io.emit('text-delete', data);
        drawingState.deleteText(data.id);
        console.log('✅ Text delete broadcast to all');
    });
    
    socket.on('path-complete', (data) => {
        drawingState.addPath(data);
    });
    
    socket.on('cursor-move', (data) => {
        socket.broadcast.emit('cursor-move', data);
    });
    
    socket.on('undo', () => {
        const success = drawingState.undo();
        if (success) {
            // Broadcast to ALL clients
            io.emit('history-update', {
                history: drawingState.getHistory()
            });
            console.log('↶ Undo executed and broadcast to all');
        }
    });
    
    socket.on('redo', () => {
        const success = drawingState.redo();
        if (success) {
            // Broadcast to ALL clients
            io.emit('history-update', {
                history: drawingState.getHistory()
            });
            console.log('↷ Redo executed and broadcast to all');
        }
    });
    
    socket.on('clear-canvas', () => {
        drawingState.clear();
        // Broadcast to ALL clients
        io.emit('canvas-cleared');
        io.emit('history-update', {
            history: []
        });
        console.log('🗑️ Canvas cleared and broadcast to all');
    });
    
    socket.on('ping', () => {
        socket.emit('pong');
    });
    
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        
        if (user) {
            usedColors.delete(user.color);
            users.delete(socket.id);
            io.emit('user-left', { userId: user.userId, username: user.username });
            
            const userArray = Array.from(users.values());
            io.emit('user-list', userArray);
            
            console.log(`${user.username} left. Total users: ${users.size}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Open multiple browser tabs to test collaboration`);
});
