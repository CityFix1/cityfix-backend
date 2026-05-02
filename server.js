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
    fs.writeFileSync(DATA_FILE, JSON.stringify({ complaints: [], nextId: 1 }, null, 2));
}

function readData() {
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all complaints (for admin dashboard only - no token check)
app.get('/api/complaints', (req, res) => {
    const data = readData();
    res.json(data.complaints);
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

// Submit complaint - generates unique token
app.post('/api/complaints', (req, res) => {
    const data = readData();
    const nextId = data.nextId || 1;
    const paddedId = String(nextId).padStart(3, '0');
    
    // Generate unique private token (random string)
    const privateToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const newComplaint = {
        id: `CFX-${paddedId}`,
        privateToken: privateToken,  // Secret token for this complaint
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
    data.nextId = nextId + 1;
    writeData(data);
    
    // Return BOTH id and private token to the user
    res.json({ 
        id: newComplaint.id,
        privateToken: privateToken,
        message: "Save this private token to track your complaint"
    });
});

// Update status (admin only - no token check)
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
});