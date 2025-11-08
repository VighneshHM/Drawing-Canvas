let canvas, cursorCanvas, wsClient;

document.addEventListener('DOMContentLoaded', () => {
    showNameModal();
});

function showNameModal() {
    const modal = document.getElementById('nameModal');
    const input = document.getElementById('usernameInput');
    const joinBtn = document.getElementById('joinBtn');
    
    modal.style.display = 'flex';
    input.focus();
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            joinCanvas();
        }
    });
    
    joinBtn.addEventListener('click', joinCanvas);
    
    function joinCanvas() {
        const username = input.value.trim();
        if (!username) {
            alert('Please enter your name!');
            return;
        }
        
        initializeApp(username);
        modal.style.display = 'none';
    }
}

function initializeApp(username) {
    canvas = new DrawingCanvas('mainCanvas');
    cursorCanvas = new CursorCanvas('cursorCanvas', canvas.canvas);
    
    wsClient = new WebSocketClient(canvas, cursorCanvas);
    window.wsClient = wsClient;
    
    wsClient.connect();
    
    setTimeout(() => {
        wsClient.joinCanvas(username);
    }, 500);
    
    setupToolbar();
}

function setupToolbar() {
    // Drawing tools
    document.getElementById('brushTool').addEventListener('click', () => {
        setActiveTool('brush');
        canvas.setTool('brush');
    });
    
    document.getElementById('eraserTool').addEventListener('click', () => {
        setActiveTool('eraser');
        canvas.setTool('eraser');
    });
    
    // Shape tools
    document.getElementById('lineTool').addEventListener('click', () => {
        setActiveTool('line');
        canvas.setTool('line');
    });
    
    document.getElementById('rectangleTool').addEventListener('click', () => {
        setActiveTool('rectangle');
        canvas.setTool('rectangle');
    });
    
    document.getElementById('circleTool').addEventListener('click', () => {
        setActiveTool('circle');
        canvas.setTool('circle');
    });
    
    // Text tool - FIXED (removed alert)
    document.getElementById('textTool').addEventListener('click', () => {
        setActiveTool('text');
        canvas.setTool('text');
        canvas.waitingForTextLocation = true;
        // Show message in UI instead of alert
        console.log('📝 Click on canvas to place text');
        showTextPlacementMessage();
    });

    // Add this new function
    function showTextPlacementMessage() {
        const message = document.createElement('div');
        message.textContent = '📝 Click on canvas where you want to place text';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #667eea;
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-weight: 600;
            z-index: 999;
            animation: slideDown 0.3s ease-out;
        `;

        document.body.appendChild(message);

        // Auto remove after 3 seconds
        setTimeout(() => {
            message.style.animation = 'slideUp 0.3s ease-out';
            setTimeout(() => message.remove(), 300);
        }, 3000);
    }

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
        @keyframes slideUp {
            from {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            to {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
        }
    `;
    document.head.appendChild(style);
        
    // Color picker
    document.getElementById('colorPicker').addEventListener('input', (e) => {
        const newColor = e.target.value;
        canvas.setColor(newColor);
        
        if (window.wsClient) {
            window.wsClient.updateColor(newColor);
        }
    });
    
    // Stroke width
    const strokeWidth = document.getElementById('strokeWidth');
    const widthValue = document.getElementById('widthValue');
    
    strokeWidth.addEventListener('input', (e) => {
        const width = parseInt(e.target.value);
        canvas.setWidth(width);
        widthValue.textContent = width;
    });
    
    // Undo button
    document.getElementById('undoBtn').addEventListener('click', () => {
        wsClient.sendUndo();
    });
    
    // Redo button
    document.getElementById('redoBtn').addEventListener('click', () => {
        wsClient.sendRedo();
    });
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the canvas for everyone?')) {
            wsClient.sendClear();
        }
    });
}

function setActiveTool(tool) {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const toolMap = {
        'brush': 'brushTool',
        'eraser': 'eraserTool',
        'line': 'lineTool',
        'rectangle': 'rectangleTool',
        'circle': 'circleTool',
        'text': 'textTool'
    };
    
    const btnId = toolMap[tool];
    if (btnId) {
        document.getElementById(btnId).classList.add('active');
    }
}

function showTextModal() {
    const modal = document.getElementById('textModal');
    const input = document.getElementById('textInput');
    const confirmBtn = document.getElementById('textConfirmBtn');
    const cancelBtn = document.getElementById('textCancelBtn');
    
    modal.style.display = 'flex';
    input.focus();
    input.value = '';
    
    const addText = () => {
        const text = input.value.trim();
        if (text) {
            const x = canvas.canvas.width / 2 - (text.length * 5);
            const y = canvas.canvas.height / 2;
            canvas.drawText(x, y, text, 20);
            modal.style.display = 'none';
            setActiveTool('brush');
            canvas.setTool('brush');
        }
    };
    
    confirmBtn.onclick = addText;
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
        setActiveTool('brush');
        canvas.setTool('brush');
    };
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addText();
        }
    });
}
