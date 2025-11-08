class DrawingState {
    constructor() {
        this.history = [];
        this.redoStack = [];
        this.maxHistorySize = 1000;
    }
    
    addPath(pathData) {
        this.history.push({
            ...pathData,
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'path'
        });
        
        this.redoStack = [];
        
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        return true;
    }
    
    addShape(shapeData) {
        this.history.push({
            ...shapeData,
            id: shapeData.id || this.generateId(),
            timestamp: Date.now(),
            type: 'shape'
        });
        
        this.redoStack = [];
        
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        console.log('📐 Shape added to history:', shapeData.tool);
        return true;
    }
    
    addText(textData) {
        this.history.push({
            ...textData,
            tool: 'text',
            id: textData.id || this.generateId(),
            timestamp: Date.now(),
            type: 'text'
        });
        
        this.redoStack = [];
        
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        console.log('📝 Text added to history');
        return true;
    }
    
    updateText(textData) {
        // Find and update text in history
        const item = this.history.find(h => h.id === textData.id);
        if (item && item.tool === 'text') {
            item.text = textData.text;
            console.log('✏️ Text updated in history');
            return true;
        }
        return false;
    }

    deleteText(textId) {
    const index = this.history.findIndex(h => h.id === textId);
    if (index > -1 && this.history[index].tool === 'text') {
        this.history.splice(index, 1);
        console.log('🗑️ Text deleted from history');
        return true;
    }
        return false;
    }

    
    undo() {
        if (this.history.length === 0) {
            return false;
        }
        
        const lastAction = this.history.pop();
        this.redoStack.push(lastAction);
        
        console.log('↶ Undo performed');
        return true;
    }
    
    redo() {
        if (this.redoStack.length === 0) {
            return false;
        }
        
        const action = this.redoStack.pop();
        this.history.push(action);
        
        console.log('↷ Redo performed');
        return true;
    }
    
    clear() {
        this.history = [];
        this.redoStack = [];
        console.log('🗑️ Canvas cleared');
    }
    
    getHistory() {
        return this.history;
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

module.exports = DrawingState;
