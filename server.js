const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ 
        complaints: [], 
        nextId: 1,           // Never resets unless admin does it
        lastResetDate: new Date().toISOString()
    }, null, 2));
}

function readData() {
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all complaints (for admin dashboard)
app.get('/api/complaints', (req, res) => {
    const data = readData();
    res.json(data.complaints);
});

// Get current counter value (for admin)
app.get('/api/counter', (req, res) => {
    const data = readData();
    res.json({ nextId: data.nextId });
});

// Reset counter (admin only)
app.post('/api/reset-counter', (req, res) => {
    const data = readData();
    const { newStartId } = req.body;
    
    // Validate: must be a positive number
    const newId = parseInt(newStartId);
    if (isNaN(newId) || newId < 1) {
        return res.status(400).json({ error: 'Invalid ID. Must be a positive number.' });
    }
    
    data.nextId = newId;
    data.lastResetDate = new Date().toISOString();
    writeData(data);
    
    res.json({ 
        success: true, 
        nextId: data.nextId,
        message: `Counter reset to CFX-${String(newId).padStart(3, '0')}`
    });
});

// Get single complaint with PRIVATE TOKEN verification
app.get('/api/complaint/:id/:token', (req, res) => {
    const data = readData();
    const complaint = data.complaints.find(c => c.id === req.params.id);
    
    if (!complaint) {
        return res.status(404).json({ error: 'Complaint not found' });
    }
    
    // Verify private token
    if (complaint.privateToken !== req.params.token) {
        return res.status(403).json({ error: 'Access denied. This is not your complaint.' });
    }
    
    res.json(complaint);
});

// Submit complaint - generates unique token and sequential ID
app.post('/api/complaints', (req, res) => {
    const data = readData();
    const nextId = data.nextId || 1;
    const paddedId = String(nextId).padStart(3, '0');
    
    // Generate unique private token (random string)
    const privateToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const newComplaint = {
        id: `CFX-${paddedId}`,
        complaintNumber: nextId,  // Store the numeric ID for reference
        privateToken: privateToken,
        name: req.body.name || 'Anonymous',
        category: req.body.category,
        description: req.body.description,
        location: req.body.location,
        photo: req.body.photo || '',
        status: 'Pending',
        priority: calculatePriority(req.body.category, req.body.description),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    data.complaints.unshift(newComplaint);
    data.nextId = nextId + 1;  // NEVER RESETS unless admin does it
    writeData(data);
    
    // Return BOTH id and private token to the user
    res.json({ 
        id: newComplaint.id,
        complaintNumber: nextId,
        privateToken: privateToken,
        message: "Save this to track your complaint"
    });
});

// Update status (admin only)
app.post('/api/update-status', (req, res) => {
    const { id, status } = req.body;
    const data = readData();
    const complaint = data.complaints.find(c => c.id === id);
    
    if (complaint) {
        complaint.status = status;
        complaint.updatedAt = new Date().toISOString();
        writeData(data);
        res.json({ success: true, complaint });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

function calculatePriority(category, description) {
    const critical = ['danger', 'collapse', 'emergency', 'severe', 'manhole', 'hazard', 'injury', 'fire', 'flood'];
    const high = ['leak', 'blocked', 'overflow', 'stray', 'animal', 'pollution', 'dark', 'broken'];
    const lower = description.toLowerCase();
    if (critical.some(k => lower.includes(k))) return 'Critical';
    if (high.some(k => lower.includes(k))) return 'High';
    return 'Normal';
}

app.listen(PORT, () => {
    console.log(`CityFix API running on port ${PORT}`);
    console.log(`Next ID will be: CFX-${String(readData().nextId).padStart(3, '0')}`);
});