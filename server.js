const express = require('express');
const cors = require('cors');
const { Octokit } = require('@octokit/rest');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ========== READ FROM ENVIRONMENT VARIABLES (SECURE) ==========
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'cityfix1';
const GITHUB_REPO = process.env.GITHUB_REPO || 'cityfix-data';
const DATA_FILE_PATH = 'data.json';

if (!GITHUB_TOKEN) {
    console.error('ERROR: GITHUB_TOKEN environment variable not set!');
    process.exit(1);
}
// ================================================================

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function readData() {
    try {
        const response = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: DATA_FILE_PATH
        });
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.status === 404) {
            const defaultData = { complaints: [], nextId: 1, lastResetDate: new Date().toISOString() };
            await writeData(defaultData);
            return defaultData;
        }
        throw error;
    }
}

async function writeData(data) {
    try {
        let sha = null;
        try {
            const response = await octokit.repos.getContent({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                path: DATA_FILE_PATH
            });
            sha = response.data.sha;
        } catch (e) {}

        const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: DATA_FILE_PATH,
            message: 'Update complaints data',
            content: content,
            sha: sha
        });
    } catch (error) {
        console.error('Error writing to GitHub:', error);
        throw error;
    }
}

app.get('/api/complaints', async (req, res) => {
    try {
        const data = await readData();
        res.json(data.complaints);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

app.get('/api/counter', async (req, res) => {
    try {
        const data = await readData();
        res.json({ nextId: data.nextId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read counter' });
    }
});

app.post('/api/reset-counter', async (req, res) => {
    try {
        const data = await readData();
        const { newStartId } = req.body;
        
        const newId = parseInt(newStartId);
        if (isNaN(newId) || newId < 1) {
            return res.status(400).json({ error: 'Invalid ID. Must be a positive number.' });
        }
        
        data.nextId = newId;
        data.lastResetDate = new Date().toISOString();
        await writeData(data);
        
        res.json({ 
            success: true, 
            nextId: data.nextId,
            message: `Counter reset to CFX-${String(newId).padStart(3, '0')}`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset counter' });
    }
});

app.delete('/api/complaints/all', async (req, res) => {
    try {
        const data = await readData();
        data.complaints = [];
        await writeData(data);
        res.json({ success: true, message: 'All complaints deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete complaints' });
    }
});

app.delete('/api/complaint/:id', async (req, res) => {
    try {
        const data = await readData();
        const complaintId = req.params.id;
        const complaintIndex = data.complaints.findIndex(c => c.id === complaintId);
        
        if (complaintIndex === -1) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        data.complaints.splice(complaintIndex, 1);
        await writeData(data);
        
        res.json({ success: true, message: `Complaint ${complaintId} deleted` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete complaint' });
    }
});

app.post('/api/my-complaints', async (req, res) => {
    try {
        const { deviceToken } = req.body;
        const data = await readData();
        const userComplaints = data.complaints.filter(c => c.deviceToken === deviceToken);
        res.json(userComplaints);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get complaints' });
    }
});

app.get('/api/complaint/:id/:token', async (req, res) => {
    try {
        const data = await readData();
        const complaint = data.complaints.find(c => c.id === req.params.id);
        
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        
        if (complaint.privateToken !== req.params.token) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json(complaint);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get complaint' });
    }
});

app.post('/api/complaints', async (req, res) => {
    try {
        const data = await readData();
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
        await writeData(data);
        
        res.json({ 
            id: newComplaint.id,
            complaintNumber: nextId,
            privateToken: privateToken,
            deviceToken: deviceToken
        });
    } catch (error) {
        console.error('Submit error:', error);
        res.status(500).json({ error: 'Failed to submit complaint' });
    }
});

app.post('/api/update-status', async (req, res) => {
    try {
        const { id, status } = req.body;
        const data = await readData();
        const complaint = data.complaints.find(c => c.id === id);
        
        if (complaint) {
            complaint.status = status;
            complaint.updatedAt = new Date().toISOString();
            await writeData(data);
            res.json({ success: true, complaint });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
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
    console.log(`Data will be saved to GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}`);
});