const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ 
        complaints: [], 
        nextId: 1,
        lastResetDate: new Date().toISOString()
    }, null, 2));
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

app.get('/api/counter', (req, res) => {
    const data = readData();
    res.json({ nextId: data.nextId });
});

app.post('/api/reset-counter', (req, res) => {
    const data = readData();
    const { newStartId } = req.body;
    const newId = parseInt(newStartId);
    if (isNaN(newId) || newId < 1) {
        return res.status(400).json({ error: 'Invalid ID. Must be a positive number.' });
    }
    data.nextId = newId;
    data.lastResetDate = new Date().toISOString();
    writeData(data);
    res.json({ success: true, nextId: data.nextId, message: `Counter reset to CFX-${String(newId).padStart(3, '0')}` });
});

app.delete('/api/complaint/:id', (req, res) => {
    const data = readData();
    const complaintId = req.params.id;
    const complaintIndex = data.complaints.findIndex(c => c.id === complaintId);
    if (complaintIndex === -1) {
        return res.status(404).json({ error: 'Complaint not found' });
    }
    data.complaints.splice(complaintIndex, 1);
    writeData(data);
    res.json({ success: true, message: `Complaint ${complaintId} deleted` });
});

app.delete('/api/complaints/all', (req, res) => {
    const data = readData();
    data.complaints = [];
    writeData(data);
    res.json({ success: true, message: 'All complaints deleted' });
});

app.post('/api/my-complaints', (req, res) => {
    const { deviceToken } = req.body;
    const data = readData();
    const userComplaints = data.complaints.filter(c => c.deviceToken === deviceToken);
    res.json(userComplaints);
});

app.get('/api/complaint/:id/:token', (req, res) => {
    const data = readData();
    const complaint = data.complaints.find(c => c.id === req.params.id);
    if (!complaint) {
        return res.status(404).json({ error: 'Complaint not found' });
    }
    if (complaint.privateToken !== req.params.token) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.json(complaint);
});

// Submit complaint with phone number
app.post('/api/complaints', (req, res) => {
    const data = readData();
    const nextId = data.nextId || 1;
    const paddedId = String(nextId).padStart(3, '0');
    const privateToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let deviceToken = req.body.deviceToken;
    if (!deviceToken) {
        deviceToken = Math.random().toString(36).substring(2, 20) + Math.random().toString(36).substring(2, 20);
    }
    
    const newComplaint = {
        id: `CFX-${paddedId}`,
        complaintNumber: nextId,
        privateToken: privateToken,
        deviceToken: deviceToken,
        name: req.body.name || 'Anonymous',
        phone: req.body.phone || '',
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
    res.json({ id: newComplaint.id, complaintNumber: nextId, privateToken: privateToken, deviceToken: deviceToken });
});

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
    const data = readData();
    console.log(`Next ID will be: CFX-${String(data.nextId).padStart(3, '0')}`);
});