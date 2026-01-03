// ==========================================
// 1. UTILS & HELPERS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    const color = type === 'success' ? '#10b981' : '#ef4444';
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icon}" style="color: ${color}; font-size: 1.1rem;"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
}

function getLeadScore(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash % 99) + 1;
}

function getAvatar(name, style = 'initials') {
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${name}&backgroundColor=1e1b4b,4338ca,6366f1&textColor=ffffff`;
}

function updateAvatarDisplay(name, style) {
    const url = getAvatar(name, style);
    const companyAvatar = document.getElementById('companyAvatar');
    const settingsAvatar = document.getElementById('settingsAvatar');
    if (companyAvatar) companyAvatar.src = url;
    if (settingsAvatar) settingsAvatar.src = url;
}

function formatMoney(amount) {
    return '₹' + amount.toLocaleString('en-IN');
}

// ==========================================
// 2. AUTH & INIT
// ==========================================
const token = localStorage.getItem('token');
if (!token) window.location.replace('/login.html');

// INIT
const savedName = localStorage.getItem('companyName') || "My Workspace";
const savedStyle = localStorage.getItem('avatarStyle') || "initials";
updateAvatarDisplay(savedName, savedStyle);
if(document.getElementById('orgBrand')) document.getElementById('orgBrand').innerText = savedName;

let allLeads = []; 
let myChart = null; 
let currentView = 'overview'; 
let draggedItemId = null;
let statusChartInstance = null;

// ==========================================
// 3. LOGIC & EVENTS
// ==========================================
document.getElementById('logoutBtn').onclick = () => {
    localStorage.clear();
    window.location.replace('/'); 
};

// Modals
const modal = document.getElementById('leadModal');
document.getElementById('openModal').onclick = () => modal.classList.remove('hidden');
function closeModal() { modal.classList.add('hidden'); }

const deleteModal = document.getElementById('deleteModal');
let leadIdToDelete = null;
function closeDeleteModal() { deleteModal.classList.add('hidden'); leadIdToDelete = null; }

// --- VIEW SWITCHING ---
window.switchView = (viewName) => {
    currentView = viewName;
    
    // 1. Get all main views
    const overviewView = document.getElementById('overviewView');
    const notesView = document.getElementById('notesView');
    const settingsView = document.getElementById('settingsView');
    
    // 2. Hide all views
    if(overviewView) overviewView.classList.add('hidden');
    if(notesView) notesView.classList.add('hidden');
    if(settingsView) settingsView.classList.add('hidden');

    // 3. Reset Sidebar Button Styles
    const btnOverview = document.getElementById('btnOverviewLink');
    const btnNotes = document.getElementById('btnNotesLink');
    const btnSettings = document.getElementById('btnSettingsLink');

    const resetBtn = (btn) => {
        if(btn) {
            btn.style.background = 'transparent';
            btn.style.borderLeft = '3px solid transparent';
            btn.style.color = 'var(--text-dim)';
        }
    };
    resetBtn(btnOverview);
    resetBtn(btnNotes);
    resetBtn(btnSettings);

    // 4. Handle Specific Views
    if (viewName === 'overview' || viewName === 'list' || viewName === 'board') {
        // Show Overview
        if(overviewView) overviewView.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = "Executive Command Center";
        
        // Highlight Sidebar
        if(btnOverview) {
            btnOverview.style.background = 'linear-gradient(90deg, rgba(99,102,241,0.1), transparent)';
            btnOverview.style.borderLeft = '3px solid var(--primary)';
            btnOverview.style.color = 'white';
        }

        // Handle List vs Board Sub-view
        const listView = document.getElementById('listView');
        const boardView = document.getElementById('boardView');
        const btnList = document.getElementById('btnList');
        const btnBoard = document.getElementById('btnBoard');

        if (viewName === 'board') {
            listView.classList.add('hidden');
            boardView.classList.remove('hidden');
            btnList.style.background = 'transparent'; btnList.style.color = '#94a3b8';
            btnBoard.style.background = 'var(--primary)'; btnBoard.style.color = 'white';
            renderBoard(allLeads);
        } else {
            // Default to List
            listView.classList.remove('hidden');
            boardView.classList.add('hidden');
            btnList.style.background = 'var(--primary)'; btnList.style.color = 'white';
            btnBoard.style.background = 'transparent'; btnBoard.style.color = '#94a3b8';
            renderTable(allLeads);
        }
    } 
    else if (viewName === 'notes') {
        // Show Notes
        if(notesView) notesView.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = "Notes & Ideas";

        // Highlight Sidebar
        if(btnNotes) {
            btnNotes.style.background = 'linear-gradient(90deg, rgba(99,102,241,0.1), transparent)';
            btnNotes.style.borderLeft = '3px solid var(--primary)';
            btnNotes.style.color = 'white';
        }
        
        loadNotes(); // Load data
    }
    else if (viewName === 'settings') {
        // Show Settings
        if(settingsView) settingsView.classList.remove('hidden');
        document.getElementById('pageTitle').innerText = "Account Settings";
        
        // Highlight Sidebar
        if(btnSettings) {
            btnSettings.style.background = 'linear-gradient(90deg, rgba(99,102,241,0.1), transparent)';
            btnSettings.style.borderLeft = '3px solid var(--primary)';
            btnSettings.style.color = 'white';
        }

        // Load Settings Data
        document.getElementById('companyNameInput').value = localStorage.getItem('companyName') || "My Workspace";
    }
};

// --- SETTINGS LISTENERS ---
const settingsOrgForm = document.getElementById('settingsOrgForm');
if(settingsOrgForm) {
    settingsOrgForm.onsubmit = async (e) => {
        e.preventDefault();
        const newName = document.getElementById('companyNameInput').value;
        const newStyle = document.getElementById('avatarStyleSelect') ? document.getElementById('avatarStyleSelect').value : 'initials';

        try {
            const res = await fetch('/api/settings/company', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ newName })
            });

            if(res.ok) {
                localStorage.setItem('companyName', newName);
                localStorage.setItem('avatarStyle', newStyle);
                document.getElementById('orgBrand').innerText = newName;
                updateAvatarDisplay(newName, newStyle);
                showToast("Profile Updated!", "success");
            }
        } catch(err) { showToast("Error updating profile", "error"); }
    };
}

// --- DATA FETCHING ---
async function loadLeads() {
    try {
        const res = await fetch('/api/leads', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401) { window.location.replace('/login.html'); return; }
        allLeads = await res.json(); 
        renderDashboard(allLeads);
    } catch (err) { console.error(err); }
}

function renderDashboard(leads) {
    const total = leads.length;
    const won = leads.filter(l => l.status === 'Won').length;
    let actualRevenue = 0, potentialRevenue = 0;

    leads.forEach(l => {
        const score = getLeadScore(l.email);
        let value = (score >= 80) ? 1000000 : (score >= 50 ? 500000 : 100000);
        if (l.status !== 'Lost') potentialRevenue += value;
        if (l.status === 'Won') actualRevenue += value;
    });

    document.getElementById('totalCount').innerText = total;
    document.getElementById('wonCount').innerText = won;
    document.getElementById('revenueCount').innerText = formatMoney(actualRevenue);
    document.getElementById('pipelineValue').innerText = formatMoney(potentialRevenue);
    if(document.getElementById('totalLeadsDisplay')) document.getElementById('totalLeadsDisplay').innerText = total;

    // Only render table/board if we are in the Overview View
    const overviewView = document.getElementById('overviewView');
    if (overviewView && !overviewView.classList.contains('hidden')) {
        if (currentView === 'board') renderBoard(leads);
        else renderTable(leads);
    }

    updateChart(leads);
    loadAnalytics(); 
}

// --- RENDERING ---
function renderTable(leads) {
    const tbody = document.getElementById('leadTableBody');
    const getColor = (s) => { if(s === 'Won') return '#10b981'; if(s === 'Lost') return '#ef4444'; if(s === 'Contacted') return '#f59e0b'; return '#818cf8'; };
    if (leads.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">No leads found.</td></tr>`; return; }

    tbody.innerHTML = leads.map(l => {
        const score = getLeadScore(l.email);
        const scoreBadge = (score >= 80) ? `<span style="color:#ef4444;">🔥 ${score}</span>` : (score >= 50 ? `<span style="color:#f59e0b;">⚡ ${score}</span>` : `<span style="color:#94a3b8;">❄️ ${score}</span>`);
        return `<tr><td style="display:flex; gap:10px;"><img src="${getAvatar(l.first_name)}" style="width:30px; border-radius:50%;"><b>${l.first_name}</b></td><td style="color:#94a3b8">${l.email}</td><td>${scoreBadge}</td><td><select onchange="window.updateStatus(${l.id}, this.value)" style="background:rgba(255,255,255,0.05); color:${getColor(l.status)}; border:1px solid ${getColor(l.status)}; padding:4px;"><option value="New" ${l.status==='New'?'selected':''}>New</option><option value="Contacted" ${l.status==='Contacted'?'selected':''}>Contacted</option><option value="Won" ${l.status==='Won'?'selected':''}>Won</option><option value="Lost" ${l.status==='Lost'?'selected':''}>Lost</option></select></td><td><button onclick="window.triggerDelete(${l.id})" style="color:#ef4444; background:none; border:none;"><i class="fas fa-trash"></i></button></td></tr>`;
    }).join('');
}

function renderBoard(leads) {
    const statuses = ['New', 'Contacted', 'Won', 'Lost'];
    const colors = {'New':'white', 'Contacted':'orange', 'Won':'#10b981', 'Lost':'#ef4444'};
    const boardContainer = document.getElementById('boardView');
    
    boardContainer.innerHTML = statuses.map(status => {
        const colLeads = leads.filter(l => l.status === status);
        return `<div class="kanban-col" ondragover="window.allowDrop(event)" ondrop="window.drop(event, '${status}')"><div class="kanban-header"><span style="color:${colors[status]}">${status}</span><span>${colLeads.length}</span></div>${colLeads.map(l => `<div class="kanban-card" draggable="true" ondragstart="window.dragStart(event, ${l.id})"><b>${l.first_name}</b><br><small>${l.email}</small></div>`).join('')}</div>`;
    }).join('');
}

// --- ACTIONS & CHARTS ---
document.getElementById('leadForm').onsubmit = async (e) => {
    e.preventDefault();
    await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ firstName: document.getElementById('fname').value, email: document.getElementById('lmail').value }) });
    closeModal(); document.getElementById('leadForm').reset(); loadLeads();
};

window.updateStatus = async (id, newStatus) => {
    const res = await fetch(`/api/leads/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ status: newStatus }) });
    if (res.ok) {
        await loadLeads(); showToast(`Updated to ${newStatus}`);
        if (typeof confetti !== 'undefined') {
            if (newStatus === 'Won') {
                const duration = 2000; const end = Date.now() + duration;
                (function frame() {
                    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
                    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
                    if (Date.now() < end) requestAnimationFrame(frame);
                }());
            } else if (newStatus === 'Contacted') {
                confetti({ particleCount: 80, spread: 100, origin: { y: 1 }, startVelocity: 60 });
            }
        }
    }
};

window.triggerDelete = (id) => { leadIdToDelete = id; deleteModal.classList.remove('hidden'); };
window.confirmDelete = async () => { await fetch(`/api/leads/${leadIdToDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); closeDeleteModal(); loadLeads(); };

function updateChart(leads) {
    const ctx = document.getElementById('pipelineChart').getContext('2d');
    if (myChart) myChart.destroy();

    const sortedLeads = [...leads].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const labels = sortedLeads.map(l => {
        const d = new Date(l.created_at);
        return `${d.getDate()}/${d.getMonth()+1}`;
    });
    const dataPoints = sortedLeads.map((_, i) => i + 1);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Leads',
                data: dataPoints,
                borderColor: '#6366f1',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
                    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
                    return gradient;
                },
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: true, ticks: { color: '#64748b' }, grid: { display: false } }, y: { display: false } }
        }
    });
}

async function loadAnalytics() {
    const ctx = document.getElementById('statusChart').getContext('2d');
    try {
        const res = await fetch('/api/analytics', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (statusChartInstance) statusChartInstance.destroy();

        statusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.counts,
                    backgroundColor: ['#00d2d3', '#5f27cd', '#1dd1a1', '#ff6b6b'],
                    borderColor: '#1e1b4b', borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '75%',
                plugins: { legend: { position: 'right', labels: { color: 'white', usePointStyle: true } } },
                onClick: (e, els) => {
                    if (els.length > 0) {
                        const label = data.labels[els[0].index];
                        let status = (label === 'Fresh (New)' || label === 'New') ? 'New' : (label === 'Chewing (Active)' || label === 'Contacted') ? 'Contacted' : (label === 'Stuck (Won)' || label === 'Won') ? 'Won' : 'Lost';
                        renderDashboard(allLeads.filter(l => l.status === status));
                    }
                }
            }
        });
    } catch (e) { console.error(e); }
}

// Drag & Drop
window.dragStart = (e, id) => { draggedItemId = id; };
window.allowDrop = (e) => e.preventDefault();
window.drop = (e, status) => { e.preventDefault(); window.updateStatus(draggedItemId, status); };

// Start the app
loadLeads();

// ==========================================
// 4. NOTES FUNCTIONALITY (Updated with Token)
// ==========================================

async function loadNotes() {
    const container = document.getElementById('notesContainer');
    
    try {
        // ADDED AUTHORIZATION HEADER HERE
        const res = await fetch('/notes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const notes = await res.json();
        container.innerHTML = ''; 
        
        if (notes.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#94a3b8; margin-top:50px;">No notes yet. Start typing above!</div>';
            return;
        }

        notes.forEach(note => {
            const div = document.createElement('div');
            div.style.cssText = "background:rgba(255,255,255,0.05); padding:1.5rem; border-radius:12px; border:1px solid rgba(255,255,255,0.1); position:relative; display:flex; flex-direction:column; justify-content:space-between; height:150px; transition:0.2s;";
            
            div.onmouseover = function() { this.style.borderColor = 'var(--primary)'; this.style.transform = 'translateY(-3px)'; };
            div.onmouseout = function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; this.style.transform = 'translateY(0)'; };
            
            div.innerHTML = `
                <div style="color:#e2e8f0; font-size:1rem; overflow-y:auto; margin-bottom:10px;">${note.content}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                    <span style="font-size:0.75rem; color:#64748b;">${new Date(note.created_at).toLocaleDateString()}</span>
                    <button onclick="deleteNote(${note.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error("Error loading notes:", err);
    }
}

async function saveNote() {
    const input = document.getElementById('newNoteInput');
    const content = input.value.trim();
    
    if (!content) {
        showToast('Please type a note first!', 'error');
        return;
    }

    try {
        // ADDED AUTHORIZATION HEADER HERE
        const res = await fetch('/notes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ content })
        });
        
        if (res.ok) {
            input.value = ''; 
            loadNotes(); 
            showToast('Note saved successfully!');
        } else {
            showToast('Failed to save note', 'error');
        }
    } catch (err) {
        console.error("Error saving note:", err);
        showToast('Server error', 'error');
    }
}

async function deleteNote(id) {
    if(!confirm("Are you sure you want to delete this note?")) return;
    try {
        // ADDED AUTHORIZATION HEADER HERE
        const res = await fetch(`/notes/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if(res.ok) {
            loadNotes();
            showToast('Note deleted');
        }
    } catch(err) {
        console.error("Error deleting note:", err);
    }
}