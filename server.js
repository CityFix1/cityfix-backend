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

// Get all complaints
app.get('/api/complaints', (req, res) => {
    const data = readData();
    res.json(data.complaints);
});

// Get single complaint
app.get('/api/complaint/:id', (req, res) => {
    const data = readData();
    const complaint = data.complaints.find(c => c.id === req.params.id);
    complaint ? res.json(complaint) : res.status(404).json({ error: 'Not found' });
});

// Submit complaint
app.post('/api/complaints', (req, res) => {
    const data = readData();
    const nextId = data.nextId || 1;
    const paddedId = String(nextId).padStart(3, '0');
    
    const newComplaint = {
        id: `CFX-${paddedId}`,
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
    res.json(newComplaint);
});

// Update status
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