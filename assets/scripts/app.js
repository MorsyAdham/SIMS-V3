// ==================== CONFIGURATION ====================
const SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            persistSession: false,   // 🚫 do NOT restore last session
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
);

// 2️⃣ Force logout on every page load (refresh)
window.addEventListener("load", () => {
    sessionStorage.removeItem('sims_user');
});

// ==================== USER MANAGEMENT ====================
const MASTER_ADMIN = "adhammorsy2311@gmail.com";

let USER_CREDENTIALS = {
    "adhammorsy2311@gmail.com": { password: "admin123", role: "admin" },
    "adham.ahmed@hanwhaegypt.com": { password: "admin123", role: "admin" },
    "Mohamed_aref@hanwhaegypt.com": { password: "bigboss1977", role: "admin" },
    "test@gmail.com": { password: "1234", role: "viewer" },
};

function loadUserCredentials() {
    const stored = localStorage.getItem('sims_user_credentials');
    if (stored) {
        try {
            USER_CREDENTIALS = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to load user credentials:', e);
        }
    }
}

function saveUserCredentials() {
    localStorage.setItem('sims_user_credentials', JSON.stringify(USER_CREDENTIALS));
}

loadUserCredentials();

const EXPECTED_COLS = [
    'id', 'shipment', 'NO', 'ContainerNum', 'BoxNum', 'Container',
    'BoxName', 'ItemCount', 'Kits', 'Factory', 'REMARKS',
    'CompletionDate', 'updated_at', 'Discrepancies'
];

// ==================== STATE MANAGEMENT ====================
const appState = {
    currentUser: null,
    currentRole: 'viewer',
    isAuthenticated: false,
    files: {},
    activeKey: null,
    charts: { progress: null, container: null, daily: null },
    activeTable: 'inspection_boxes'
};

// Table options
const tableOptions = [
    { key: 'inspection_boxes', name: 'NOV 2025' },
    { key: 'jan_2026_inspection_boxes', name: 'JAN 2026' }
];

// ==================== DOM ELEMENTS ====================
const elements = {
    dashboard: document.getElementById('dashboard'),
    userEmail: document.getElementById('userEmail'),
    userRole: document.getElementById('userRole'),
    logoutBtn: document.getElementById('logoutBtn'),
    filesSelect: document.getElementById('filesSelect'),
    fileInput: document.getElementById('fileInput'),
    uploadLabel: document.getElementById('uploadLabel'),
    refreshBtn: document.getElementById('refreshBtn'),
    exportBtn: document.getElementById('exportBtn'),
    viewAuditBtn: document.getElementById('viewAuditBtn'),
    shipmentFilter: document.getElementById('shipmentFilter'),
    factoryFilter: document.getElementById('factoryFilter'),
    containerFilter: document.getElementById('containerFilter'),
    statusFilter: document.getElementById('statusFilter'),
    searchInput: document.getElementById('searchInput'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    summaryWrap: document.getElementById('summaryWrap'),
    rowsCount: document.getElementById('rowsCount'),
    multipackCard: document.getElementById('multipackCard'),
    normalPackCard: document.getElementById('normalPackCard'),
    multipackCount: document.getElementById('multipackCount'),
    normalCount: document.getElementById('normalCount'),
    bulkActionsSection: document.getElementById('bulkActionsSection'),
    applyRemark: document.getElementById('applyRemark'),
    applyAllBtn: document.getElementById('applyAllBtn'),
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    auditModal: document.getElementById('auditModal'),
    closeAuditModal: document.getElementById('closeAuditModal'),
    auditLogContent: document.getElementById('auditLogContent'),
    auditDateFrom: document.getElementById('auditDateFrom'),
    auditDateTo: document.getElementById('auditDateTo'),
    auditUserFilter: document.getElementById('auditUserFilter'),
    filterAuditBtn: document.getElementById('filterAuditBtn')
};

// ==================== MULTIPACK / NORMAL CARD CLICK LISTENERS ====================
elements.multipackCard.addEventListener('click', () => {
    elements.statusFilter.value = 'all'; // reset status filter
    const rows = getFilteredRows().filter(r => Number(r.ItemCount ?? 0) > 1);
    renderTable(rows); // render only multipacks
});

elements.normalPackCard.addEventListener('click', () => {
    elements.statusFilter.value = 'all'; // reset status filter
    const rows = getFilteredRows().filter(r => Number(r.ItemCount ?? 0) <= 1);
    renderTable(rows); // render only normal packs
});

// ==================== AUTHENTICATION ====================
function checkAuthentication() {
    const storedUser = sessionStorage.getItem('sims_user');
    if (!storedUser) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        const userData = JSON.parse(storedUser);
        const email = userData.email;

        if (!USER_CREDENTIALS[email]) {
            alert('Your email is not authorized.');
            sessionStorage.removeItem('sims_user');
            window.location.href = 'login.html';
            return false;
        }

        appState.currentUser = { email };
        appState.currentRole = USER_CREDENTIALS[email].role;
        appState.isAuthenticated = true;

        updateUIForUser();

        logAudit({
            userEmail: email,
            action: 'USER_LOGIN',
            details: `User ${email} logged in successfully`
        });

        return true;
    } catch (err) {
        console.error('Auth error:', err);
        sessionStorage.removeItem('sims_user');
        window.location.href = 'login.html';
        return false;
    }
}

// Open Audit Modal
function openAuditModal() {
    if (appState.currentUser.email !== MASTER_ADMIN) {
        alert('Access denied. Only Master Admin can view the audit log.');
        return;
    }
    elements.auditModal.style.display = 'flex'; // must be flex for centering
    loadAuditLog();
}

// Close Audit Modal
elements.closeAuditModal.addEventListener('click', () => {
    elements.auditModal.style.display = 'none';
});

// Optional: close if click outside modal content
window.addEventListener('click', (e) => {
    if (e.target === elements.auditModal) {
        elements.auditModal.style.display = 'none';
    }
});

function getFilteredRows() {
    if (!appState.activeKey) return [];

    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    const fShipment = elements.shipmentFilter.value || 'all';
    const fFactory = elements.factoryFilter.value || 'all';
    const fContainer = elements.containerFilter.value || 'all';
    const fStatus = elements.statusFilter.value || 'all';
    const q = (elements.searchInput.value || '').trim().toLowerCase();

    return allRows.filter(r => {
        if (fShipment !== 'all' && String(r.shipment ?? '') !== fShipment) return false;
        if (fFactory !== 'all' && String(r.Factory ?? '') !== fFactory) return false;
        if (fContainer !== 'all' && String(r.ContainerNum ?? '') !== fContainer) return false;

        if (fStatus !== 'all') {
            const status = classifyStatus(r.REMARKS);
            if (fStatus === 'Finished' && status !== 'Completed') return false;
            if (fStatus === 'In Progress' && status !== 'In Progress') return false;
            if (fStatus === 'Not Started' && status !== 'Not Started') return false;
            if (fStatus === 'Remaining' && status === 'Completed') return false;
        }

        if (q) {
            const hay = Object.values(r).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });
}

function updateUIForUser() {
    const email = appState.currentUser.email;
    const role = appState.currentRole;

    elements.userEmail.textContent = email;
    elements.userRole.textContent = role.toUpperCase();
    elements.userRole.className = `role-badge ${role}`;

    const isAdmin = role === 'admin';

    if (elements.bulkActionsSection) {
        elements.bulkActionsSection.style.display = isAdmin ? 'block' : 'none';
    }

    if (elements.uploadLabel) {
        elements.uploadLabel.style.display = isAdmin ? 'flex' : 'none';
    }

    if (elements.fileInput) elements.fileInput.disabled = !isAdmin;
    if (elements.applyAllBtn) elements.applyAllBtn.disabled = !isAdmin;

    if (email === MASTER_ADMIN) {
        addUserManagementButton();
    }
}

// ==================== USER MANAGEMENT UI ====================
function addUserManagementButton() {
    const existingBtn = document.getElementById('manageUsersBtn');
    if (existingBtn) return;

    const btn = document.createElement('button');
    btn.id = 'manageUsersBtn';
    btn.className = 'btn btn-secondary';
    btn.textContent = '👥 Manage Users';
    btn.style.marginLeft = '10px';

    const actionRight = document.querySelector('.action-right');
    if (actionRight) {
        actionRight.appendChild(btn);
    }

    btn.addEventListener('click', showUserManagement);
}

function showUserManagement() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>👥 User Management</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 10px;">Add New User</h3>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                        <input type="email" id="newUserEmail" placeholder="Email address" style="flex: 1; min-width: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                        <input type="password" id="newUserPassword" placeholder="Password" style="flex: 1; min-width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                        <select id="newUserRole" style="padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button onclick="addNewUser()" class="btn btn-primary" style="width: auto; margin: 0;">Add User</button>
                    </div>
                </div>
                <h3 style="margin-bottom: 10px;">Current Users</h3>
                <div id="usersList" style="max-height: 400px; overflow-y: auto;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    renderUsersList();
}

function renderUsersList() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    const html = Object.entries(USER_CREDENTIALS).map(([email, userData]) => {
        const isMaster = email === MASTER_ADMIN;
        return `
            <div class="user-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <strong>${email}</strong>
                    <br>
                    <span style="color: #6b7280; font-size: 13px;">Role: ${userData.role.toUpperCase()}</span>
                    ${isMaster ? '<span style="color: #667eea; font-size: 13px;"> (Master Admin)</span>' : ''}
                    <br>
                    <span style="color: #9ca3af; font-size: 12px;">Password: ${userData.password}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${!isMaster ? `
                        <input type="password" id="pwd_${email.replace(/[^a-zA-Z0-9]/g, '_')}" placeholder="New password" 
                            style="padding: 6px; border: 1px solid #ddd; border-radius: 6px; width: 120px;">
                        <button onclick="changeUserPassword('${email}')" class="btn" 
                            style="background: #667eea; color: white; width: auto; margin: 0; padding: 6px 12px;">
                            Change Password
                        </button>
                        <select onchange="changeUserRole('${email}', this.value)" 
                            style="padding: 6px; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="viewer" ${userData.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                            <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        <button onclick="removeUser('${email}')" class="btn" 
                            style="background: #ef4444; color: white; width: auto; margin: 0; padding: 6px 12px;">
                            Remove
                        </button>
                    ` : '<span style="color: #6b7280; font-size: 13px;">Cannot be modified</span>'}
                </div>
            </div>
        `;
    }).join('');

    usersList.innerHTML = html || '<p style="color: #6b7280;">No users found</p>';
}

window.addNewUser = function () {
    const emailInput = document.getElementById('newUserEmail');
    const passwordInput = document.getElementById('newUserPassword');
    const roleSelect = document.getElementById('newUserRole');

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Please enter a valid email address');
        return;
    }

    if (!password || password.length < 4) {
        alert('Please enter a password (minimum 4 characters)');
        return;
    }

    if (USER_CREDENTIALS[email]) {
        alert('User already exists');
        return;
    }

    USER_CREDENTIALS[email] = { password: password, role: role };
    saveUserCredentials();
    logAudit({
        userEmail: appState.currentUser?.email || 'UNKNOWN',
        action: 'USER_ADDED',
        details: `Added user ${email} with role ${role}`
    });

    emailInput.value = '';
    passwordInput.value = '';
    renderUsersList();
};

window.changeUserPassword = function (email) {
    const inputId = 'pwd_' + email.replace(/[^a-zA-Z0-9]/g, '_');
    const passwordInput = document.getElementById(inputId);

    if (!passwordInput) return;

    const newPassword = passwordInput.value.trim();

    if (!newPassword || newPassword.length < 4) {
        alert('Please enter a valid password (minimum 4 characters)');
        return;
    }

    USER_CREDENTIALS[email].password = newPassword;
    saveUserCredentials();
    logAudit({
        userEmail: appState.currentUser?.email || 'UNKNOWN',
        action: 'USER_PASSWORD_CHANGED',
        details: `Changed password for ${email}`
    });

    passwordInput.value = '';
    renderUsersList();
    alert('Password updated successfully');
};

window.changeUserRole = function (email, newRole) {
    if (email === MASTER_ADMIN) {
        alert('Cannot change master admin role');
        return;
    }

    USER_CREDENTIALS[email].role = newRole;
    saveUserCredentials();
    logAudit({
        userEmail: appState.currentUser?.email || 'UNKNOWN',
        action: 'USER_ROLE_CHANGED',
        details: `Changed ${email} role to ${newRole}`
    });
    renderUsersList();
};

window.removeUser = function (email) {
    if (email === MASTER_ADMIN) {
        alert('Cannot remove master admin');
        return;
    }

    if (!confirm(`Are you sure you want to remove ${email}?`)) {
        return;
    }

    delete USER_CREDENTIALS[email];
    saveUserCredentials();
    logAudit({
        userEmail: appState.currentUser?.email || 'UNKNOWN',
        action: 'USER_REMOVED',
        details: `Removed user ${email}`
    });

    renderUsersList();
};

// ==================== AUDIT LOGGING ====================
async function logAudit({
    userEmail,
    action,
    details,
    tableName = null,
    ipAddress = null,
    userAgent = navigator.userAgent
}) {
    if (!userEmail) {
        console.error('❌ Audit log skipped: userEmail is required');
        return;
    }

    const payload = {
        user_id: null,              // no auth
        user_email: userEmail,      // REAL USER EMAIL
        action,
        details,
        table_name: tableName,
        ip_address: ipAddress,
        user_agent: userAgent
    };

    const { error } = await supabaseClient
        .from('audit_log')
        .insert(payload);

    if (error) {
        console.error('❌ Audit log failed:', error);
    } else {
        console.log('🧾 Audit logged:', action, 'by', userEmail);
    }
}


async function loadAuditLogs(filters = {}) {
    try {
        let query = supabaseClient
            .from('audit_log')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100);

        if (filters.dateFrom) {
            query = query.gte('timestamp', filters.dateFrom);
        }

        if (filters.dateTo) {
            const endDate = new Date(filters.dateTo);
            endDate.setHours(23, 59, 59, 999);
            query = query.lte('timestamp', endDate.toISOString());
        }

        if (filters.user && filters.user !== 'all') {
            query = query.eq('user_email', filters.user);
        }

        const { data, error } = await query;

        if (error) throw error;

        displayAuditLogs(data || []);
    } catch (error) {
        console.error('Failed to load audit logs:', error);
        elements.auditLogContent.innerHTML = '<p class="error-text">Failed to load audit logs</p>';
    }
}

function buildAuditUserFilter() {
    if (!elements.auditUserFilter) return;

    const users = Object.keys(USER_CREDENTIALS).sort();
    const options = ['<option value="all">All Users</option>']
        .concat(users.map(u => `<option value="${u}">${u}</option>`))
        .join('');

    elements.auditUserFilter.innerHTML = options;
}

function displayAuditLogs(logs) {
    if (logs.length === 0) {
        elements.auditLogContent.innerHTML = '<p class="muted">No audit logs found</p>';
        return;
    }

    const html = logs.map(log => {
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleString();

        return `
            <div class="audit-entry">
                <div class="audit-header">
                    <span class="audit-user">${log.user_email}</span>
                    <span class="audit-time">${formattedDate}</span>
                </div>
                <div class="audit-details">
                    <strong>${log.action}</strong>
                    <br>
                    <small>
                        Table: <b>${log.table_name || 'N/A'}</b><br>
                        ${log.details || ''}
                    </small>
                </div>
            </div>
        `;
    }).join('');

    elements.auditLogContent.innerHTML = html;
}

// ==================== DATA LOADING ====================
async function loadFromSupabase() {
    try {
        const rows = await loadAllFromSupabase(appState.activeTable);

        const normalizedRows = rows.map(row => {
            const out = {};
            EXPECTED_COLS.forEach(col => {
                out[col] = row[col] ?? '';
            });
            return out;
        });

        const key = appState.activeTable;
        appState.files[key] = {
            name: tableOptions.find(t => t.key === key)?.name || key,
            workbook: null,
            sheetName: key,
            rows: normalizedRows,
            columns: EXPECTED_COLS.slice()
        };

        setActiveFile(key);

        console.log(`✅ Loaded ${normalizedRows.length} rows from table: ${key}`);

    } catch (error) {
        console.error('Error loading data from Supabase:', error);
        alert('Failed to load inspection data. Please refresh the page.');
    }
}

async function loadAllFromSupabase(tableName) {
    const allRows = [];
    const batchSize = 1000;
    let from = 0;
    let to = batchSize - 1;

    while (true) {
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .order('ContainerNum', { ascending: true })
            .order('BoxNum', { ascending: true })
            .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);

        if (data.length < batchSize) break;
        from += batchSize;
        to += batchSize;
    }

    return allRows;
}

// ==================== DATA UPDATES - FIXED & SAFE ====================
async function updateRowInSupabase(row, fieldChanged) {
    if (!row.id) {
        console.error('Missing row.id, cannot update');
        return false;
    }

    try {
        const payload = {
            shipment: row.shipment,
            NO: row.NO,
            ContainerNum: row.ContainerNum,
            BoxNum: row.BoxNum,
            Container: row.Container,
            BoxName: row.BoxName,
            ItemCount: row.ItemCount,
            Kits: row.Kits,
            Factory: row.Factory,
            REMARKS: row.REMARKS,
            CompletionDate: row.CompletionDate || null,
            updated_at: new Date().toISOString(),
            Discrepancies: row.Discrepancies
        };

        const { error } = await supabaseClient
            .from(appState.activeTable)
            .update(payload)
            .eq('id', row.id);

        if (error) throw error;

        // ✅ ONLY audit the actual update
        await logAudit({
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'DATA_UPDATE',
            details: `Updated ${fieldChanged || 'field'} for Box ${row.BoxNum} in Container ${row.ContainerNum}`,
            tableName: appState.activeTable
        });

        console.log(`✅ Updated row id=${row.id} in ${appState.activeTable}`);
        return true;

    } catch (error) {
        console.error('❌ Update failed:', error);
        alert('Failed to save changes to database');
        return false;
    }
}

// Continued in next artifact...
// Continued from Part 1...

// ==================== UTILITY FUNCTIONS ====================
function isCompleted(remarks) {
    if (!remarks) return false;
    return /done/i.test(String(remarks));
}

function classifyStatus(remarks) {
    const rem = String(remarks ?? '').trim().toLowerCase();
    if (/done/i.test(rem)) return 'Completed';
    if (/in\s*progress/i.test(rem)) return 'In Progress';
    if (rem === '' || /^(n\/a|na|not started)$/i.test(rem)) return 'Not Started';
    return 'Not Started';
}

function sortRowsByShipmentAndContainer(rows) {
    return rows.sort((a, b) => {
        const sA = String(a.shipment ?? '').trim();
        const sB = String(b.shipment ?? '').trim();
        const sCmp = sA.localeCompare(sB);
        if (sCmp !== 0) return sCmp;

        const cA = parseInt(a.ContainerNum, 10);
        const cB = parseInt(b.ContainerNum, 10);
        if (!isNaN(cA) && !isNaN(cB) && cA !== cB) return cA - cB;

        const parseBox = (v) => {
            if (!v) return [Infinity, Infinity];
            const parts = String(v).split('-');
            return [
                parseInt(parts[0], 10) || Infinity,
                parseInt(parts[1], 10) || Infinity
            ];
        };

        const [bA1, bA2] = parseBox(a.BoxNum);
        const [bB1, bB2] = parseBox(b.BoxNum);

        if (bA1 !== bB1) return bA1 - bB1;
        return bA2 - bB2;
    });
}

function nowTimestampForName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

// ==================== FILTERING & RENDERING ====================
function setActiveFile(key) {
    if (!appState.files[key]) return;

    appState.activeKey = key;
    elements.filesSelect.value = key;

    buildShipmentFilter();
    buildFactoryFilter();
    buildContainerFilter();
    renderFilteredAndLive();
}

function buildShipmentFilter() {
    if (!appState.activeKey) return;
    const set = new Set();
    appState.files[appState.activeKey].rows.forEach(r => {
        const v = String(r.shipment ?? '').trim();
        if (v) set.add(v);
    });
    const opts = ['<option value="all">All</option>']
        .concat([...set].sort().map(s => `<option value="${s}">${s}</option>`))
        .join('');
    elements.shipmentFilter.innerHTML = opts;
}

function buildFactoryFilter() {
    if (!appState.activeKey) return;
    const set = new Set();
    appState.files[appState.activeKey].rows.forEach(r => {
        const v = String(r.Factory ?? '').trim();
        if (v) set.add(v);
    });
    const opts = ['<option value="all">All</option>']
        .concat([...set].sort().map(f => `<option value="${f}">${f}</option>`))
        .join('');
    elements.factoryFilter.innerHTML = opts;
}

function buildContainerFilter() {
    if (!appState.activeKey) return;
    const set = new Set();
    appState.files[appState.activeKey].rows.forEach(r => {
        const v = String(r.ContainerNum ?? '').trim();
        if (v) set.add(v);
    });
    const containerArray = Array.from(set).map(c => {
        const n = parseInt(c, 10);
        return { original: c, number: isNaN(n) ? Infinity : n };
    });
    containerArray.sort((a, b) => a.number - b.number);
    const opts = ['<option value="all">All</option>']
        .concat(containerArray.map(c => `<option value="${c.original}">${c.original}</option>`))
        .join('');
    elements.containerFilter.innerHTML = opts;
}

function renderFilteredAndLive() {
    if (!appState.isAuthenticated || !appState.activeKey) return;
    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    const fShipment = elements.shipmentFilter.value || 'all';
    const fFactory = elements.factoryFilter.value || 'all';
    const fContainer = elements.containerFilter.value || 'all';
    const fStatus = elements.statusFilter.value || 'all';
    const q = (elements.searchInput.value || '').trim().toLowerCase();

    const filtered = allRows.filter(r => {
        if (fShipment !== 'all' && String(r.shipment ?? '') !== fShipment) return false;
        if (fFactory !== 'all' && String(r.Factory ?? '') !== fFactory) return false;
        if (fContainer !== 'all' && String(r.ContainerNum ?? '') !== fContainer) return false;

        if (fStatus !== 'all') {
            const status = classifyStatus(r.REMARKS);
            if (fStatus === 'Finished' && status !== 'Completed') return false;
            if (fStatus === 'In Progress' && status !== 'In Progress') return false;
            if (fStatus === 'Not Started' && status !== 'Not Started') return false;
            if (fStatus === 'Remaining' && status === 'Completed') return false;
        }

        if (q) {
            const hay = Object.values(r).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });

    renderTable(filtered);
    renderSummary(filtered);
    renderCharts(filtered);
    updateMultipackNormalCounts(filtered);
    elements.rowsCount.textContent = filtered.length;
}

function renderTable(rows) {
    elements.tableHead.innerHTML = '';
    elements.tableBody.innerHTML = '';

    if (!appState.activeKey) return;

    const cols = appState.files[appState.activeKey].columns || EXPECTED_COLS;
    const isAdmin = appState.currentRole === 'admin';

    const trh = document.createElement('tr');
    cols.forEach(c => {
        if (c === 'id') return;
        const th = document.createElement('th');
        th.textContent = c;
        trh.appendChild(th);
    });
    elements.tableHead.appendChild(trh);

    rows.forEach(r => {
        const tr = document.createElement('tr');

        cols.forEach(c => {
            if (c === 'id') return;

            const td = document.createElement('td');

            if (c === 'REMARKS') {
                const select = document.createElement('select');
                select.disabled = !isAdmin;

                const options = ['', 'Done', 'In Progress'];
                options.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt;
                    el.textContent = opt;
                    if ((r[c] ?? '').toLowerCase() === opt.toLowerCase()) el.selected = true;
                    select.appendChild(el);
                });

                const val = (r[c] ?? '').toLowerCase();
                if (val === 'done') select.style.backgroundColor = '#d1fae5';
                else if (val === 'in progress') select.style.backgroundColor = '#fef3c7';

                select.addEventListener('change', async () => {
                    const newVal = select.value;
                    const today = new Date().toISOString().split('T')[0];

                    r.REMARKS = newVal;

                    if (newVal.toLowerCase() === 'done') {
                        r.CompletionDate = r.CompletionDate || today;
                        select.style.backgroundColor = '#d1fae5';
                    } else if (newVal.toLowerCase() === 'in progress') {
                        select.style.backgroundColor = '#fef3c7';
                    } else {
                        r.CompletionDate = '';
                        select.style.backgroundColor = '';
                    }

                    await updateRowInSupabase(r, 'REMARKS');
                    renderFilteredAndLive();
                });

                td.appendChild(select);
            } else if (c === 'CompletionDate') {
                const input = document.createElement('input');
                input.type = 'date';
                input.value = (r[c] ?? '').trim();
                input.disabled = !isAdmin;

                input.addEventListener('change', async () => {
                    r[c] = input.value;
                    await updateRowInSupabase(r, 'CompletionDate');
                    renderFilteredAndLive();
                });

                td.appendChild(input);
            } else {
                td.contentEditable = isAdmin;
                td.spellcheck = false;
                td.textContent = r[c] ?? '';

                let debounceTimer = null;

                td.addEventListener('input', () => {
                    r[c] = td.textContent;

                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        await updateRowInSupabase(r, c);
                        // Don't re-render to avoid losing focus
                    }, 1000);
                });
            }

            tr.appendChild(td);
        });

        elements.tableBody.appendChild(tr);
    });
}

function renderSummary(rows) {
    const total = rows.length;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;

    rows.forEach(r => {
        const s = classifyStatus(r.REMARKS);
        if (s === 'Completed') completed++;
        else if (s === 'In Progress') inProgress++;
        else notStarted++;
    });

    const remaining = inProgress + notStarted;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    elements.summaryWrap.innerHTML = `
        <div class="card">
            <strong>Total Boxes</strong>
            <div class="big">${total}</div>
            <div class="muted">All inspections</div>
        </div>
        <div class="card">
            <strong>Completed</strong>
            <div class="big" style="color: var(--success)">${completed}</div>
            <div class="muted">${percent}% finished</div>
        </div>
        <div class="card">
            <strong>In Progress</strong>
            <div class="big" style="color: var(--warning)">${inProgress}</div>
            <div class="muted">Under inspection</div>
        </div>
        <div class="card">
            <strong>Not Started</strong>
            <div class="big">${notStarted}</div>
            <div class="muted">Pending</div>
        </div>
        <div class="card">
            <strong>Remaining</strong>
            <div class="big" style="color: var(--primary)">${remaining}</div>
            <div class="muted">To complete</div>
        </div>
    `;
}

function updateMultipackNormalCounts() {
    const rows = getFilteredRows(); // ✅ Use filtered rows
    let multi = 0, normal = 0;

    rows.forEach(r => {
        const ic = Number(r.ItemCount ?? 0) || 0;
        if (ic > 1) multi++;
        else normal++;
    });

    elements.multipackCount.textContent = multi;
    elements.normalCount.textContent = normal;
}

// Rendering charts and other functions continue in Part 3...
// Continued from Part 2...

// ==================== CHARTS ====================
function renderCharts(rows) {
    const byContainer = {};

    rows.forEach(r => {
        const cont = String(r.ContainerNum ?? 'NA');
        if (!byContainer[cont]) byContainer[cont] = { total: 0, finished: 0 };
        byContainer[cont].total++;
        if (isCompleted(r.REMARKS)) byContainer[cont].finished++;
    });

    const labels = Object.keys(byContainer).sort();
    const finishedData = labels.map(l => byContainer[l].finished);
    const remainingData = labels.map(l => byContainer[l].total - byContainer[l].finished);

    const ctxBar = document.getElementById('boxesByContainerChart')?.getContext('2d');
    if (ctxBar) {
        if (appState.charts.container) appState.charts.container.destroy();
        appState.charts.container = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Finished', data: finishedData, backgroundColor: '#10b981' },
                    { label: 'Remaining', data: remainingData, backgroundColor: '#f59e0b' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }

    const totals = labels.reduce((acc, l) => {
        acc.total += byContainer[l].total;
        acc.finished += byContainer[l].finished;
        return acc;
    }, { total: 0, finished: 0 });

    const totalRemaining = Math.max(0, totals.total - totals.finished);

    const ctxDonut = document.getElementById('progressChart')?.getContext('2d');
    if (ctxDonut) {
        if (appState.charts.progress) appState.charts.progress.destroy();
        appState.charts.progress = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['Finished', 'Remaining'],
                datasets: [{
                    data: [totals.finished, totalRemaining],
                    backgroundColor: ['#10b981', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 16 },
                        formatter: (value) => value === 0 ? null : value
                    }
                },
                cutout: '60%'
            },
            plugins: [ChartDataLabels]
        });
    }

    const byDate = {};
    rows.forEach(r => {
        if (isCompleted(r.REMARKS) && r.CompletionDate) {
            const date = String(r.CompletionDate).trim();
            if (!byDate[date]) byDate[date] = 0;
            byDate[date]++;
        }
    });

    const dailyLabels = Object.keys(byDate).sort();
    const dailyValues = dailyLabels.map(d => byDate[d]);

    const ctxDaily = document.getElementById('dailyProgressChart')?.getContext('2d');
    if (ctxDaily) {
        if (appState.charts.daily) appState.charts.daily.destroy();
        appState.charts.daily = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: dailyLabels,
                datasets: [{
                    label: 'Completed per Day',
                    data: dailyValues,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

// ==================== EXPORT FUNCTION - FIXED ====================
function exportWorkbookWithAnalytics() {
    if (!appState.activeKey || !appState.files[appState.activeKey]) {
        alert('No data to export');
        return;
    }

    const entry = appState.files[appState.activeKey];

    // Data Sheet
    const dataRows = entry.rows.map(r => {
        const out = {};
        EXPECTED_COLS.forEach(c => out[c] = r[c] ?? "");
        Object.keys(r).forEach(k => { if (!EXPECTED_COLS.includes(k)) out[k] = r[k]; });
        return out;
    });
    const wsData = XLSX.utils.json_to_sheet(dataRows);

    // Analytics Builder
    function buildAnalytics(rows) {
        const byContainer = {};

        rows.forEach(r => {
            const cont = String(r.ContainerNum ?? "NA");
            if (!byContainer[cont]) byContainer[cont] = { total: 0, finished: 0 };
            byContainer[cont].total++;
            if (isCompleted(r.REMARKS)) byContainer[cont].finished++;
        });

        const out = [];
        let total = 0, finished = 0;

        Object.keys(byContainer).sort().forEach(cont => {
            const v = byContainer[cont];
            const remaining = v.total - v.finished;
            const pct = v.total === 0 ? 0 : Math.round((v.finished / v.total) * 100);

            out.push({
                Container: cont,
                TotalBoxes: v.total,
                Finished: v.finished,
                Remaining: remaining,
                CompletionPercent: pct + "%"
            });

            total += v.total;
            finished += v.finished;
        });

        const pctAll = total === 0 ? 0 : Math.round((finished / total) * 100);
        out.push({
            Container: "ALL",
            TotalBoxes: total,
            Finished: finished,
            Remaining: total - finished,
            CompletionPercent: pctAll + "%"
        });

        return XLSX.utils.json_to_sheet(out);
    }

    const wsAnalytics = buildAnalytics(entry.rows);

    const factoryOrder = ["F200", "F100", "AIO"];
    const factories = [...new Set(entry.rows.map(r => r.Factory || "UNKNOWN"))];

    // Summary Sheet
    function buildSummarySheet() {
        const summaryData = [];
        let allTotal = 0, allFinished = 0;

        factoryOrder.forEach(fac => {
            const filtered = entry.rows.filter(r => r.Factory === fac);
            if (filtered.length === 0) return;

            const total = filtered.length;
            const finished = filtered.filter(r => isCompleted(r.REMARKS)).length;
            const pct = total === 0 ? 0 : Math.round((finished / total) * 100);

            summaryData.push({
                Factory: fac,
                TotalBoxes: total,
                Completed: finished,
                Remaining: total - finished,
                CompletionPercent: pct + "%"
            });

            allTotal += total;
            allFinished += finished;
        });

        const pctAll = allTotal === 0 ? 0 : Math.round((allFinished / allTotal) * 100);
        summaryData.push({
            Factory: "ALL",
            TotalBoxes: allTotal,
            Completed: allFinished,
            Remaining: allTotal - allFinished,
            CompletionPercent: pctAll + "%"
        });

        const ws = XLSX.utils.json_to_sheet(summaryData, { origin: "A2" });
        ws["A1"] = { t: "s", v: "Shipment Inspection Summary" };
        ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
        ws["!cols"] = [
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }
        ];

        return ws;
    }

    const wsSummary = buildSummarySheet();

    // Build Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsData, "Data");
    XLSX.utils.book_append_sheet(wb, wsAnalytics, "Analytics");

    factories.forEach(fac => {
        const filtered = entry.rows.filter(r => r.Factory === fac);
        const ws = buildAnalytics(filtered);
        const safe = `Analytics_${fac}`.replace(/[^A-Za-z0-9_]/g, "");
        XLSX.utils.book_append_sheet(wb, ws, safe);
    });

    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Save File
    const outName = `${entry.name.replace(/\s+/g, '_')}_${nowTimestampForName()}.xlsx`;
    XLSX.writeFile(wb, outName);

    logAudit(
        'DATA_EXPORT',
        `Exported ${entry.rows.length} records`,
        appState.activeTable
    );
}

async function applyBulkRemark(value) {
    if (!value) return alert("Please select a remark to apply");

    // Treat the special __CLEAR__ value as empty
    const remarkValue = value === '__CLEAR__' ? '' : value;

    if (!appState.activeKey) return;

    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    const fShipment = elements.shipmentFilter.value || 'all';
    const fFactory = elements.factoryFilter.value || 'all';
    const fContainer = elements.containerFilter.value || 'all';
    const fStatus = elements.statusFilter.value || 'all';
    const q = (elements.searchInput.value || '').trim().toLowerCase();

    const filtered = allRows.filter(r => {
        if (fShipment !== 'all' && String(r.shipment ?? '') !== fShipment) return false;
        if (fFactory !== 'all' && String(r.Factory ?? '') !== fFactory) return false;
        if (fContainer !== 'all' && String(r.ContainerNum ?? '') !== fContainer) return false;

        if (fStatus !== 'all') {
            const status = classifyStatus(r.REMARKS);
            if (fStatus === 'Finished' && status !== 'Completed') return false;
            if (fStatus === 'In Progress' && status !== 'In Progress') return false;
            if (fStatus === 'Not Started' && status !== 'Not Started') return false;
            if (fStatus === 'Remaining' && status === 'Completed') return false;
        }

        if (q) {
            const hay = Object.values(r).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });

    if (filtered.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    let count = 0;

    for (const row of filtered) {
        row.REMARKS = remarkValue;

        if (remarkValue.toLowerCase() === 'done') {
            row.CompletionDate = row.CompletionDate || today;
        } else {
            row.CompletionDate = '';
        }

        count++;
    }

    renderFilteredAndLive();

    await Promise.all(filtered.map(r => updateRowInSupabase(r, 'REMARKS (Bulk)')));

    await logAudit({
        userEmail: appState.currentUser.email,
        action: 'BULK_UPDATE',
        details: `Applied "${remarkValue || 'Cleared'}" to ${count} filtered rows`,
        tableName: appState.activeTable
    });

    elements.bulkRemarkSelect.value = ''; // reset dropdown
}

function filterByItemCount(isMulti) {
    if (!appState.activeKey) return;

    const allRows = appState.files[appState.activeKey].rows || [];
    const filtered = allRows.filter(r => {
        const ic = Number(r.ItemCount ?? 0) || 0;
        return isMulti ? ic > 1 : ic === 1;
    });

    renderTable(filtered);
    renderSummary(filtered);
    renderCharts(filtered);
    updateMultipackNormalCounts(filtered);
    elements.rowsCount.textContent = filtered.length;
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    elements.logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('sims_user'); // ✅ per-tab logout
        window.location.href = 'login.html';
    });

    elements.refreshBtn.addEventListener('click', async () => {
        await loadFromSupabase();
    });

    // FIX: Export function
    elements.exportBtn.addEventListener('click', () => {
        exportWorkbookWithAnalytics();
    });

    elements.shipmentFilter.addEventListener('change', renderFilteredAndLive);
    elements.factoryFilter.addEventListener('change', renderFilteredAndLive);
    elements.containerFilter.addEventListener('change', renderFilteredAndLive);
    elements.statusFilter.addEventListener('change', renderFilteredAndLive);
    elements.searchInput.addEventListener('input', renderFilteredAndLive);

    elements.clearFiltersBtn.addEventListener('click', () => {
        elements.shipmentFilter.value = 'all';
        elements.factoryFilter.value = 'all';
        elements.containerFilter.value = 'all';
        elements.statusFilter.value = 'all';
        elements.searchInput.value = '';
        renderFilteredAndLive();
    });

    elements.multipackCard.addEventListener('click', () => filterByItemCount(true));
    elements.normalPackCard.addEventListener('click', () => filterByItemCount(false));

    if (elements.applyAllBtn) {
        elements.applyAllBtn.addEventListener('click', async () => {
            const val = elements.applyRemark.value;
            if (!val) {
                alert('Please select a remark to apply');
                return;
            }
            if (confirm(`Apply "${val}" to all filtered rows?`)) {
                await applyBulkRemark(val);
            }
        });
    }

    elements.viewAuditBtn.addEventListener('click', () => {
        elements.auditModal.classList.add('active');

        // Populate user filter
        buildAuditUserFilter();

        // Load logs initially
        loadAuditLogs();
    });

    elements.closeAuditModal.addEventListener('click', () => {
        elements.auditModal.classList.remove('active');
    });

    elements.filterAuditBtn.addEventListener('click', () => {
        loadAuditLogs({
            dateFrom: elements.auditDateFrom.value,
            dateTo: elements.auditDateTo.value,
            user: elements.auditUserFilter.value
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === elements.auditModal) {
            elements.auditModal.classList.remove('active');
        }
    });

    // FIX: Table selector event listener
    elements.filesSelect.addEventListener('change', async () => {
        appState.activeTable = elements.filesSelect.value;
        await loadFromSupabase();
    });

    elements.filesSelect.addEventListener('change', () => {
        const key = elements.filesSelect.value;
        if (key && appState.files[key]) {
            setActiveFile(key);
        }
    });

    elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            // Normalize columns
            const normalizedRows = rows.map(row => {
                const out = {};
                EXPECTED_COLS.forEach(col => {
                    out[col] = row[col] ?? '';
                });
                return out;
            });

            // Use the file name as the key
            const key = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_');

            appState.files[key] = {
                name: file.name,
                workbook,
                sheetName,
                rows: normalizedRows,
                columns: EXPECTED_COLS.slice()
            };

            // Add to dropdown
            const option = document.createElement('option');
            option.value = key;
            option.textContent = file.name;
            elements.filesSelect.appendChild(option);

            // Set uploaded file as active
            setActiveFile(key);

            logAudit({
                userEmail: appState.currentUser?.email || 'UNKNOWN',
                action: 'FILE_UPLOADED',
                details: `Uploaded file: ${file.name}`,
                tableName: key
            });

            alert(`✅ File "${file.name}" uploaded successfully!`);
        } catch (err) {
            console.error('File upload failed:', err);
            alert('❌ Failed to upload file. Make sure it is a valid Excel file.');
        } finally {
            elements.fileInput.value = ''; // reset input
        }
    });
}

// ==================== INITIALIZATION ====================
async function init() {
    if (!checkAuthentication()) return;

    // Only show Audit Log button if user is master admin
    if (appState.currentUser.email !== MASTER_ADMIN) {
        elements.viewAuditBtn.style.display = 'none'; // hide the button completely
    } else {
        // Add click listener for master admin
        elements.viewAuditBtn.addEventListener('click', () => {
            openAuditModal(); // function that opens audit modal
        });
    }

    // Populate table dropdown
    elements.filesSelect.innerHTML = tableOptions
        .map(t => `<option value="${t.key}">${t.name}</option>`)
        .join('');

    elements.filesSelect.value = appState.activeTable;

    setupEventListeners();
    await loadFromSupabase();

    console.log('✅ Application initialized for:', appState.currentUser.email);
    console.log('✅ Role:', appState.currentRole);
    console.log('✅ Active table:', appState.activeTable);
}

// Start the application

init();
