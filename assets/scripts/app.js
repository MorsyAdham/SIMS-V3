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

let allUsers = [];

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
    charts: { progress: null, container: null, factory: null, daily: null },
    summaryMode: 'boxes',
    pendingShipmentUpload: null
};

// ==================== MULTI-SELECT FILTERS ====================
const filterState = {
    shipment: new Set(['all']),
    factory: new Set(['all']),
    container: new Set(['all']),
    status: new Set(['all']),
    boxType: new Set(['all'])
};

const filterOptions = {
    shipment: [],
    factory: [],
    container: [],
    status: [
        { value: 'Military Inspection (Done)', label: 'Military Inspection (Done)' },
        { value: 'Pre-Inspection', label: 'Pre-Inspection' },
        { value: 'Not Started', label: 'Not Started' },
        { value: 'Remaining', label: 'Remaining' }
    ],
    boxType: [
        { value: 'normal', label: 'Normal' },
        { value: 'multi', label: 'Multi-pack' }
    ]
};

const filterConfig = {
    factory: { btn: 'factoryFilterBtn', menu: 'factoryFilterMenu' },
    container: { btn: 'containerFilterBtn', menu: 'containerFilterMenu' },
    status: { btn: 'statusFilterBtn', menu: 'statusFilterMenu' },
    boxType: { btn: 'boxTypeFilterBtn', menu: 'boxTypeFilterMenu' }
};

function escapeHtmlAttr(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderMultiSelectMenu(key) {
    const cfg = filterConfig[key];
    const menu = elements[cfg.menu];
    if (!menu) return;
    const options = filterOptions[key];
    const selected = filterState[key];

    // Drop selections that no longer exist in the current option set
    const validValues = new Set(options.map(o => o.value));
    for (const v of [...selected]) {
        if (v !== 'all' && !validValues.has(v)) selected.delete(v);
    }
    if (selected.size === 0) selected.add('all');

    const allChecked = selected.has('all');
    menu.innerHTML = `
        <label class="ms-option ms-option-all">
            <input type="checkbox" data-value="all" ${allChecked ? 'checked' : ''} />
            <span>All</span>
        </label>
        <div class="ms-option-divider"></div>
        ${options.map(o => `
            <label class="ms-option">
                <input type="checkbox" data-value="${escapeHtmlAttr(o.value)}" ${(!allChecked && selected.has(o.value)) ? 'checked' : ''} />
                <span>${escapeHtmlAttr(o.label)}</span>
            </label>
        `).join('')}
    `;

    updateMultiSelectButtonLabel(key);
}

function updateMultiSelectButtonLabel(key) {
    const cfg = filterConfig[key];
    const btn = elements[cfg.btn];
    if (!btn) return;
    const selected = filterState[key];
    const options = filterOptions[key];

    if (selected.has('all') || selected.size === 0) {
        btn.textContent = 'All';
        return;
    }
    if (selected.size === 1) {
        const v = [...selected][0];
        const opt = options.find(o => o.value === v);
        btn.textContent = opt ? opt.label : v;
        return;
    }
    btn.textContent = `${selected.size} selected`;
}

function handleMultiSelectMenuChange(key, e) {
    const target = e.target;
    if (!target.matches('input[type="checkbox"]')) return;
    const value = target.dataset.value;
    const selected = filterState[key];

    if (value === 'all') {
        selected.clear();
        selected.add('all');
    } else {
        selected.delete('all');
        if (target.checked) selected.add(value);
        else selected.delete(value);
        if (selected.size === 0) selected.add('all');
    }

    renderMultiSelectMenu(key);
    renderFilteredAndLive();
}

function toggleMultiSelectMenu(key) {
    const cfg = filterConfig[key];
    const menu = elements[cfg.menu];
    const shouldOpen = menu.hidden;
    Object.keys(filterConfig).forEach(k => {
        elements[filterConfig[k].menu].hidden = true;
    });
    menu.hidden = !shouldOpen;
}

function resetMultiSelectFilters() {
    Object.keys(filterConfig).forEach(key => {
        filterState[key] = new Set(['all']);
        renderMultiSelectMenu(key);
    });
}

function matchesMultiSet(selected, rawValue) {
    if (!selected || selected.size === 0 || selected.has('all')) return true;
    return selected.has(String(rawValue ?? '').trim());
}

function matchesStatusMultiSet(selected, row) {
    if (!selected || selected.size === 0 || selected.has('all')) return true;
    const status = classifyStatus(row.REMARKS);
    for (const v of selected) {
        if (v === 'Remaining') {
            if (status !== 'Military Inspection (Done)') return true;
            continue;
        }
        if (v === status) return true;
    }
    return false;
}

function matchesBoxTypeMultiSet(selected, row) {
    if (!selected || selected.size === 0 || selected.has('all')) return true;
    for (const v of selected) {
        if (matchesBoxTypeFilter(row, v)) return true;
    }
    return false;
}

function applyActiveFilters(rows) {
    const q = (elements.searchInput.value || '').trim().toLowerCase();

    return rows.filter(r => {
        if (!matchesMultiSet(filterState.shipment, r.shipment)) return false;
        if (!matchesMultiSet(filterState.factory, r.Factory)) return false;
        if (!matchesMultiSet(filterState.container, r.ContainerNum)) return false;
        if (!matchesBoxTypeMultiSet(filterState.boxType, r)) return false;
        if (!matchesStatusMultiSet(filterState.status, r)) return false;

        if (q) {
            const hay = Object.values(r).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }

        return true;
    });
}

// Single consolidated Supabase table backing every shipment
const MAIN_TABLE = 'inspection_boxes';
const SELECTED_SHIPMENT_KEY = 'sims_selected_shipment';

// ==================== DOM ELEMENTS ====================
const elements = {
    dashboard: document.getElementById('dashboard'),
    userEmail: document.getElementById('userEmail'),
    userRole: document.getElementById('userRole'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    filesSelect: document.getElementById('filesSelect'),
    fileInput: document.getElementById('fileInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    uploadDropdown: document.getElementById('uploadDropdown'),
    uploadMenu: document.getElementById('uploadMenu'),
    uploadMenuHint: document.getElementById('uploadMenuHint'),
    viewLocalFileOption: document.getElementById('viewLocalFileOption'),
    uploadNewShipmentOption: document.getElementById('uploadNewShipmentOption'),
    uploadShipmentModal: document.getElementById('uploadShipmentModal'),
    closeUploadShipmentModal: document.getElementById('closeUploadShipmentModal'),
    uploadShipmentName: document.getElementById('uploadShipmentName'),
    downloadShipmentTemplateBtn: document.getElementById('downloadShipmentTemplateBtn'),
    uploadShipmentFileInput: document.getElementById('uploadShipmentFileInput'),
    uploadShipmentStepForm: document.getElementById('uploadShipmentStepForm'),
    uploadShipmentStepReview: document.getElementById('uploadShipmentStepReview'),
    uploadShipmentSummary: document.getElementById('uploadShipmentSummary'),
    uploadShipmentDetails: document.getElementById('uploadShipmentDetails'),
    uploadShipmentBackBtn: document.getElementById('uploadShipmentBackBtn'),
    uploadShipmentConfirmBtn: document.getElementById('uploadShipmentConfirmBtn'),
    uploadShipmentStepDone: document.getElementById('uploadShipmentStepDone'),
    uploadShipmentDoneMessage: document.getElementById('uploadShipmentDoneMessage'),
    exportBtn: document.getElementById('exportBtn'),
    exportDropdown: document.getElementById('exportDropdown'),
    exportMenu: document.getElementById('exportMenu'),
    exportMenuHint: document.getElementById('exportMenuHint'),
    viewAuditBtn: document.getElementById('viewAuditBtn'),
    factoryFilterBtn: document.getElementById('factoryFilterBtn'),
    factoryFilterMenu: document.getElementById('factoryFilterMenu'),
    containerFilterBtn: document.getElementById('containerFilterBtn'),
    containerFilterMenu: document.getElementById('containerFilterMenu'),
    statusFilterBtn: document.getElementById('statusFilterBtn'),
    statusFilterMenu: document.getElementById('statusFilterMenu'),
    boxTypeFilterBtn: document.getElementById('boxTypeFilterBtn'),
    boxTypeFilterMenu: document.getElementById('boxTypeFilterMenu'),
    searchInput: document.getElementById('searchInput'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    showBoxSummaryBtn: document.getElementById('showBoxSummaryBtn'),
    showContainerSummaryBtn: document.getElementById('showContainerSummaryBtn'),
    summaryWrap: document.getElementById('summaryWrap'),
    containerSummaryWrap: document.getElementById('containerSummaryWrap'),
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
    auditActionFilter: document.getElementById('auditActionFilter'),
    auditTableFilter: document.getElementById('auditTableFilter'),
    auditSearchInput: document.getElementById('auditSearchInput'),
    filterAuditBtn: document.getElementById('filterAuditBtn')
};

// ==================== AUTHENTICATION ====================
function checkAuthentication() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (!storedUser) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        const userData = JSON.parse(storedUser);
        if (!userData?.email || !userData?.role) {
            throw new Error('Invalid session payload');
        }

        appState.currentUser = {
            id: userData.id || null,
            email: userData.email
        };
        appState.currentRole = userData.role;
        appState.isAuthenticated = true;

        updateUIForUser();

        return true;
    } catch (err) {
        console.error('Auth error:', err);
        sessionStorage.removeItem('currentUser');
        window.location.href = 'login.html';
        return false;
    }
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isMasterAdmin(role = appState.currentRole) {
    return role === 'master_admin';
}

function isAdminRole(role = appState.currentRole) {
    return role === 'admin' || role === 'master_admin';
}

function formatRoleLabel(role) {
    return String(role || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getStoredTheme() {
    const storedTheme = localStorage.getItem('sims_theme');
    return storedTheme === 'dark' ? 'dark' : 'light';
}

function updateThemeToggleLabel(theme) {
    if (!elements.themeToggleBtn) return;
    const isDark = theme === 'dark';
    elements.themeToggleBtn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    elements.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
}

function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', normalizedTheme);
    localStorage.setItem('sims_theme', normalizedTheme);
    updateThemeToggleLabel(normalizedTheme);
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

async function fetchUsers() {
    if (!isMasterAdmin()) return [];

    try {
        const { data, error } = await supabaseClient
            .from('sims_users')
            .select('id, email, role, password_plain, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allUsers = data || [];
        return allUsers;
    } catch (error) {
        console.error('Failed to fetch users:', error);
        allUsers = [];
        return [];
    }
}

// Open Audit Modal
function openAuditModal() {
    if (!isMasterAdmin()) {
        alert('Access denied. Only Master Admin can view the audit log.');
        return;
    }
    elements.auditModal.classList.add('active');
    buildAuditUserFilter();
    buildAuditActionFilter();
    buildAuditTableFilter();
    loadAuditLogs();
}

// Close Audit Modal
elements.closeAuditModal.addEventListener('click', () => {
    elements.auditModal.classList.remove('active');
});

// Optional: close if click outside modal content
window.addEventListener('click', (e) => {
    if (e.target === elements.auditModal) {
        elements.auditModal.classList.remove('active');
    }
});

function getFilteredRows() {
    if (!appState.activeKey) return [];

    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    return applyActiveFilters(allRows);
}

function updateUIForUser() {
    const email = appState.currentUser.email;
    const role = appState.currentRole;
    const roleLabel = formatRoleLabel(role);

    elements.userEmail.textContent = email;
    elements.userRole.innerHTML = `<span class="role-badge-text">${roleLabel}</span>`;
    elements.userRole.className = `role-badge ${role}`;

    const isAdmin = isAdminRole(role);

    if (elements.bulkActionsSection) {
        elements.bulkActionsSection.style.display = isAdmin ? 'block' : 'none';
    }

    if (elements.uploadDropdown) {
        elements.uploadDropdown.style.display = isAdmin ? 'inline-block' : 'none';
    }

    if (elements.fileInput) elements.fileInput.disabled = !isAdmin;
    if (elements.applyAllBtn) elements.applyAllBtn.disabled = !isAdmin;

    if (isMasterAdmin(role)) {
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

async function showUserManagement() {
    await fetchUsers();
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
                            <option value="master_admin">Master Admin</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
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

    const html = allUsers.map(user => {
        const isCurrentUser = user.id === appState.currentUser?.id;
        const isMaster = user.role === 'master_admin';
        return `
            <div class="user-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <strong>${user.email}</strong>
                    <br>
                    <span style="color: #6b7280; font-size: 13px;">Role: ${formatRoleLabel(user.role)}</span>
                    ${isMaster ? '<span style="color: #667eea; font-size: 13px;"> (Master Admin)</span>' : ''}
                    <br>
                    <span style="color: #9ca3af; font-size: 12px;">Password: ${user.password_plain || ''}</span>
                    <br>
                    <span style="color: #9ca3af; font-size: 12px;">Created: ${new Date(user.created_at).toLocaleString()}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${!isMaster ? `
                        <button onclick="changeUserPassword('${user.id}')" class="btn" 
                            style="background: #667eea; color: white; width: auto; margin: 0; padding: 6px 12px;">
                            Reset Password
                        </button>
                        <select onchange="changeUserRole('${user.id}', this.value)" 
                            style="padding: 6px; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="">Change Role...</option>
                            <option value="master_admin" ${user.role === 'master_admin' ? 'disabled' : ''}>Master Admin</option>
                            <option value="admin" ${user.role === 'admin' ? 'disabled' : ''}>Admin</option>
                            <option value="viewer" ${user.role === 'viewer' ? 'disabled' : ''}>Viewer</option>
                        </select>
                        ${!isCurrentUser ? `
                        <button onclick="removeUser('${user.id}')" class="btn" 
                            style="background: #ef4444; color: white; width: auto; margin: 0; padding: 6px 12px;">
                            Remove
                        </button>` : ''}
                    ` : '<span style="color: #6b7280; font-size: 13px;">Cannot be modified</span>'}
                </div>
            </div>
        `;
    }).join('');

    usersList.innerHTML = html || '<p style="color: #6b7280;">No users found</p>';
}

window.addNewUser = async function () {
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

    if (!password || password.length < 6) {
        alert('Please enter a password (minimum 6 characters)');
        return;
    }

    if (allUsers.some(user => user.email.toLowerCase() === email)) {
        alert('User already exists');
        return;
    }

    try {
        const passwordHash = await hashPassword(password);
        const { error } = await supabaseClient
            .from('sims_users')
            .insert([{
                email,
                password_hash: passwordHash,
                password_plain: password,
                role
            }]);

        if (error) throw error;

        await logAudit({
            userId: appState.currentUser?.id || null,
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'USER_ADDED',
            details: `Added user ${email} with role ${role}`
        });

        emailInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'viewer';
        await fetchUsers();
        renderUsersList();
    } catch (error) {
        console.error('Failed to add user:', error);
        alert('Failed to add user');
    }
};

window.changeUserPassword = async function (userId) {
    const targetUser = allUsers.find(user => user.id === userId);
    if (!targetUser) return;

    const newPassword = prompt(`Enter a new password for ${targetUser.email} (minimum 6 characters):`);
    if (!newPassword || newPassword.trim().length < 6) {
        alert('Please enter a valid password (minimum 6 characters)');
        return;
    }

    try {
        const passwordHash = await hashPassword(newPassword.trim());
        const { error } = await supabaseClient
            .from('sims_users')
            .update({
                password_hash: passwordHash,
                password_plain: newPassword.trim()
            })
            .eq('id', userId);

        if (error) throw error;

        await logAudit({
            userId: appState.currentUser?.id || null,
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'USER_PASSWORD_CHANGED',
            details: `Changed password for ${targetUser.email}`
        });

        alert('Password updated successfully');
    } catch (error) {
        console.error('Failed to change password:', error);
        alert('Failed to change password');
    }
};

window.changeUserRole = async function (userId, newRole) {
    const targetUser = allUsers.find(user => user.id === userId);
    if (!targetUser || !newRole) return;

    if (targetUser.role === 'master_admin') {
        alert('Cannot change master admin role');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('sims_users')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) throw error;

        await logAudit({
            userId: appState.currentUser?.id || null,
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'USER_ROLE_CHANGED',
            details: `Changed ${targetUser.email} role to ${newRole}`
        });

        await fetchUsers();
        renderUsersList();
    } catch (error) {
        console.error('Failed to change role:', error);
        alert('Failed to change role');
    }
};

window.removeUser = async function (userId) {
    const targetUser = allUsers.find(user => user.id === userId);
    if (!targetUser) return;

    if (targetUser.role === 'master_admin') {
        alert('Cannot remove master admin');
        return;
    }

    if (!confirm(`Are you sure you want to remove ${targetUser.email}?`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('sims_users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        await logAudit({
            userId: appState.currentUser?.id || null,
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'USER_REMOVED',
            details: `Removed user ${targetUser.email}`
        });

        await fetchUsers();
        renderUsersList();
    } catch (error) {
        console.error('Failed to remove user:', error);
        alert('Failed to remove user');
    }
};

// ==================== AUDIT LOGGING ====================
async function logAudit({
    userId = null,
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
        user_id: userId,
        user_email: userEmail,
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
            .limit(200);

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

        if (filters.action && filters.action !== 'all') {
            query = query.eq('action', filters.action);
        }

        if (filters.table && filters.table !== 'all') {
            if (filters.table === '__none__') {
                query = query.is('table_name', null);
            } else {
                query = query.eq('table_name', filters.table);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        let filteredLogs = data || [];

        if (filters.search) {
            const searchNeedle = filters.search.trim().toLowerCase();
            filteredLogs = filteredLogs.filter(log => {
                const haystack = [
                    log.user_email,
                    log.action,
                    log.table_name,
                    log.details,
                    log.ip_address
                ].join(' ').toLowerCase();
                return haystack.includes(searchNeedle);
            });
        }

        displayAuditLogs(filteredLogs);
    } catch (error) {
        console.error('Failed to load audit logs:', error);
        elements.auditLogContent.innerHTML = '<p class="error-text">Failed to load audit logs</p>';
    }
}

function buildAuditUserFilter() {
    if (!elements.auditUserFilter) return;

    const users = [...new Set(allUsers.map(user => user.email))].sort();
    const options = ['<option value="all">All Users</option>']
        .concat(users.map(u => `<option value="${u}">${u}</option>`))
        .join('');

    elements.auditUserFilter.innerHTML = options;
}

function buildAuditActionFilter() {
    if (!elements.auditActionFilter) return;

    const actionOptions = [
        'USER_LOGIN',
        'USER_LOGIN_FAILED',
        'USER_LOGOUT',
        'USER_ADDED',
        'USER_PASSWORD_CHANGED',
        'USER_ROLE_CHANGED',
        'USER_REMOVED',
        'DATA_UPDATE',
        'DATA_EXPORT',
        'BULK_UPDATE',
        'FILE_UPLOADED'
    ];

    elements.auditActionFilter.innerHTML = ['<option value="all">All Actions</option>']
        .concat(actionOptions.map(action => `<option value="${action}">${action}</option>`))
        .join('');
}

async function buildAuditTableFilter() {
    if (!elements.auditTableFilter) return;

    const tableNames = new Set([MAIN_TABLE]);

    try {
        const { data, error } = await supabaseClient
            .from('audit_log')
            .select('table_name')
            .order('timestamp', { ascending: false })
            .limit(1000);

        if (error) throw error;
        (data || []).forEach(row => {
            if (row.table_name) tableNames.add(row.table_name);
        });
    } catch (error) {
        console.error('Failed to load audit table names:', error);
    }

    const sortedNames = [...tableNames].sort((a, b) => a.localeCompare(b));

    elements.auditTableFilter.innerHTML = ['<option value="all">All Tables</option>']
        .concat(sortedNames.map(tableName => `<option value="${tableName}">${tableName}</option>`))
        .concat('<option value="__none__">No Table</option>')
        .join('');
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
        const rows = await loadAllFromSupabase(MAIN_TABLE);

        const normalizedRows = rows.map(row => {
            const out = {};
            EXPECTED_COLS.forEach(col => {
                out[col] = row[col] ?? '';
            });
            return out;
        });

        const key = MAIN_TABLE;
        appState.files[key] = {
            name: 'Live Shipment Data',
            workbook: null,
            sheetName: key,
            rows: normalizedRows,
            columns: EXPECTED_COLS.slice()
        };

        buildShipmentFilter();
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
            .from(MAIN_TABLE)
            .update(payload)
            .eq('id', row.id);

        if (error) throw error;

        // ✅ ONLY audit the actual update
        await logAudit({
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'DATA_UPDATE',
            details: `Updated ${fieldChanged || 'field'} for Box ${row.BoxNum} in Container ${row.ContainerNum}`,
            tableName: MAIN_TABLE
        });

        console.log(`✅ Updated row id=${row.id} in ${MAIN_TABLE}`);
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

function applyRemarkStyle(select, val) {
    const v = String(val).toLowerCase();
    if (v === 'done') {
        select.style.backgroundColor = '#d1fae5';
        select.style.color = '#065f46';
    } else if (v === 'in progress') {
        select.style.backgroundColor = '#fef3c7';
        select.style.color = '#92400e';
    } else {
        select.style.backgroundColor = '';
        select.style.color = '';
    }
}

function classifyStatus(remarks) {
    const rem = String(remarks ?? '').trim().toLowerCase();
    if (/done/i.test(rem)) return 'Military Inspection (Done)';
    if (/in\s*progress/i.test(rem)) return 'Pre-Inspection';
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

    // Previewing a locally uploaded file shows that file's own rows in full;
    // a shipment picked earlier from the live dataset must not carry over
    // and silently filter them out.
    if (key !== MAIN_TABLE) {
        filterState.shipment = new Set(['all']);
    }

    buildFactoryFilter();
    buildContainerFilter();
    populateFilesSelectOptions();
    renderFilteredAndLive();
}

// Builds the list of shipments from the live dataset only (never from a
// locally previewed file), so the dropdown always offers every real
// shipment regardless of what's currently being viewed. Defaults to the
// most recently added shipment (highest row id = most recently inserted,
// whether from the original migration or a later "Upload New Shipment").
function buildShipmentFilter() {
    const liveRows = appState.files[MAIN_TABLE]?.rows || [];
    const latestIdByShipment = new Map();

    liveRows.forEach(r => {
        const v = String(r.shipment ?? '').trim();
        if (!v) return;
        const id = Number(r.id) || 0;
        if (!latestIdByShipment.has(v) || id > latestIdByShipment.get(v)) {
            latestIdByShipment.set(v, id);
        }
    });

    const shipments = [...latestIdByShipment.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value]) => value);

    filterOptions.shipment = shipments.map(s => ({ value: s, label: s }));

    if (shipments.length > 0) {
        const stored = localStorage.getItem(SELECTED_SHIPMENT_KEY);
        const defaultShipment = (stored && shipments.includes(stored)) ? stored : shipments[0];
        filterState.shipment = new Set([defaultShipment]);
    }

    populateFilesSelectOptions();
}

// The "Shipment" dropdown (in the Active File slot) lists every real
// shipment from the live dataset, plus any locally uploaded preview files
// appended after them.
function populateFilesSelectOptions() {
    if (!elements.filesSelect) return;

    const shipmentOptions = filterOptions.shipment
        .map(o => `<option value="${escapeHtmlAttr(o.value)}">${escapeHtmlAttr(o.label)}</option>`)
        .join('');

    const localFileOptions = Object.keys(appState.files)
        .filter(key => key !== MAIN_TABLE)
        .map(key => `<option value="${escapeHtmlAttr(key)}">${escapeHtmlAttr(appState.files[key].name)}</option>`)
        .join('');

    elements.filesSelect.innerHTML = shipmentOptions + localFileOptions;

    if (appState.activeKey !== MAIN_TABLE && appState.files[appState.activeKey]) {
        elements.filesSelect.value = appState.activeKey;
    } else {
        const current = [...filterState.shipment].find(v => v !== 'all');
        if (current) elements.filesSelect.value = current;
    }
}

function buildFactoryFilter() {
    if (!appState.activeKey) return;
    const set = new Set();
    appState.files[appState.activeKey].rows.forEach(r => {
        const v = String(r.Factory ?? '').trim();
        if (v) set.add(v);
    });
    filterOptions.factory = [...set].sort().map(f => ({ value: f, label: f }));
    renderMultiSelectMenu('factory');
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
    filterOptions.container = containerArray.map(c => ({ value: c.original, label: c.original }));
    renderMultiSelectMenu('container');
}

function renderFilteredAndLive() {
    if (!appState.isAuthenticated || !appState.activeKey) return;
    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    const filtered = applyActiveFilters(allRows);

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
    const isAdmin = isAdminRole(appState.currentRole);

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

                const options = [
                    { value: '', label: '--' },
                    { value: 'Done', label: 'Military Inspection (Done)' },
                    { value: 'In Progress', label: 'Pre-Inspection' }
                ];
                options.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt.value;
                    el.textContent = opt.label;
                    if ((r[c] ?? '').toLowerCase() === opt.value.toLowerCase()) el.selected = true;
                    select.appendChild(el);
                });

                const val = (r[c] ?? '').toLowerCase();
                applyRemarkStyle(select, val);

                select.addEventListener('change', async () => {
                    const newVal = select.value;
                    const today = new Date().toISOString().split('T')[0];

                    r.REMARKS = newVal;

                    if (newVal.toLowerCase() === 'done') {
                        r.CompletionDate = r.CompletionDate || today;
                    } else if (newVal.toLowerCase() !== 'in progress') {
                        r.CompletionDate = '';
                    }

                    applyRemarkStyle(select, newVal);

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
        if (s === 'Military Inspection (Done)') completed++;
        else if (s === 'Pre-Inspection') inProgress++;
        else notStarted++;
    });

    const remaining = inProgress + notStarted;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    const preInspPercent = total === 0 ? 0 : Math.round(((inProgress + completed) / total) * 100);

    elements.summaryWrap.innerHTML = `
        <div class="card">
            <strong>Total Boxes</strong>
            <div class="big">${total}</div>
            <div class="muted">All inspections</div>
        </div>
        <div class="card">
            <strong>Pre-Inspection</strong>
            <div class="big" style="color: var(--warning)">${inProgress + completed}</div>
            <div class="muted">${preInspPercent}% gone through pre-inspection</div>
        </div>
        <div class="card">
            <strong>Remaining</strong>
            <div class="big" style="color: var(--primary)">${remaining}</div>
            <div class="muted">To complete</div>
        </div>
        <div class="card">
            <strong>Military Inspection (Done)</strong>
            <div class="big" style="color: var(--success)">${completed}</div>
            <div class="muted">${percent}% completed</div>
        </div>
    `;

    renderContainerSummary(rows);
    updateSummaryView();
}

function getContainerMetrics(rows) {
    const byContainer = {};

    rows.forEach(r => {
        const containerNum = String(r.ContainerNum ?? '').trim();
        if (!containerNum) return;

        if (!byContainer[containerNum]) {
            byContainer[containerNum] = {
                total: 0,
                completed: 0,
                inProgress: 0,
                notStarted: 0
            };
        }

        const status = classifyStatus(r.REMARKS);
        byContainer[containerNum].total++;

        if (status === 'Military Inspection (Done)') byContainer[containerNum].completed++;
        else if (status === 'Pre-Inspection') byContainer[containerNum].inProgress++;
        else byContainer[containerNum].notStarted++;
    });

    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;

    Object.values(byContainer).forEach(container => {
        if (container.total > 0 && container.completed === container.total) {
            completed++;
        } else if (container.notStarted === container.total) {
            notStarted++;
        } else {
            inProgress++;
        }
    });

    const total = Object.keys(byContainer).length;
    const remaining = inProgress + notStarted;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    return { total, completed, inProgress, notStarted, remaining, percent };
}

function renderContainerSummary(rows) {
    if (!elements.containerSummaryWrap) return;

    const metrics = getContainerMetrics(rows);

    elements.containerSummaryWrap.innerHTML = `
        <div class="card">
            <strong>Total Containers</strong>
            <div class="big">${metrics.total}</div>
            <div class="muted">Unique containers in view</div>
        </div>
        <div class="card">
            <strong>Pre-Inspection Containers</strong>
            <div class="big" style="color: var(--warning)">${metrics.inProgress}</div>
            <div class="muted">Partially inspected</div>
        </div>
        <div class="card">
            <strong>Remaining Containers</strong>
            <div class="big" style="color: var(--primary)">${metrics.remaining}</div>
            <div class="muted">Not fully complete</div>
        </div>
        <div class="card">
            <strong>Military Inspection (Done)</strong>
            <div class="big" style="color: var(--success)">${metrics.completed}</div>
            <div class="muted">${metrics.percent}% fully complete</div>
        </div>
    `;
}

function updateSummaryView() {
    const showBoxes = appState.summaryMode === 'boxes';

    if (elements.summaryWrap) {
        elements.summaryWrap.style.display = showBoxes ? 'grid' : 'none';
    }

    if (elements.containerSummaryWrap) {
        elements.containerSummaryWrap.style.display = showBoxes ? 'none' : 'grid';
    }

    if (elements.showBoxSummaryBtn) {
        elements.showBoxSummaryBtn.classList.toggle('active', showBoxes);
        elements.showBoxSummaryBtn.setAttribute('aria-pressed', String(showBoxes));
    }

    if (elements.showContainerSummaryBtn) {
        elements.showContainerSummaryBtn.classList.toggle('active', !showBoxes);
        elements.showContainerSummaryBtn.setAttribute('aria-pressed', String(!showBoxes));
    }
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

function matchesBoxTypeFilter(row, filterValue) {
    if (filterValue === 'all') return true;

    const itemCount = Number(row.ItemCount ?? 0) || 0;

    if (filterValue === 'multi') return itemCount > 1;
    if (filterValue === 'normal') return itemCount <= 1;

    return true;
}

function sortContainerLabels(labels) {
    return [...labels].sort((a, b) => {
        const aText = String(a ?? '').trim();
        const bText = String(b ?? '').trim();
        const aNum = Number(aText);
        const bNum = Number(bText);
        const aIsNumeric = aText !== '' && Number.isFinite(aNum);
        const bIsNumeric = bText !== '' && Number.isFinite(bNum);

        if (aIsNumeric && bIsNumeric) return aNum - bNum;
        if (aIsNumeric) return -1;
        if (bIsNumeric) return 1;
        return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
    });
}

// Rendering charts and other functions continue in Part 3...
// Continued from Part 2...

// ==================== CHARTS ====================
function renderCharts(rows) {
    const byContainer = {};
    const byFactory = {};

    rows.forEach(r => {
        const cont = String(r.ContainerNum ?? 'NA');
        if (!byContainer[cont]) byContainer[cont] = { total: 0, finished: 0, inProgress: 0 };
        byContainer[cont].total++;
        const s = classifyStatus(r.REMARKS);
        if (s === 'Military Inspection (Done)') byContainer[cont].finished++;
        else if (s === 'Pre-Inspection') byContainer[cont].inProgress++;

        const factory = String(r.Factory ?? 'Unknown').trim() || 'Unknown';
        if (!byFactory[factory]) byFactory[factory] = { total: 0, finished: 0, inProgress: 0 };
        byFactory[factory].total++;
        if (s === 'Military Inspection (Done)') byFactory[factory].finished++;
        else if (s === 'Pre-Inspection') byFactory[factory].inProgress++;
    });

    const labels = sortContainerLabels(Object.keys(byContainer));
    const finishedData = labels.map(l => byContainer[l].finished);
    const preInspData = labels.map(l => byContainer[l].inProgress);
    const remainingData = labels.map(l => byContainer[l].total - byContainer[l].finished - byContainer[l].inProgress);

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            datalabels: {
                display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                color: '#fff',
                font: { weight: '600', size: 11 },
                anchor: 'center',
                align: 'center',
                formatter: (value) => value > 0 ? value : null,
                textShadowColor: 'rgba(0,0,0,0.3)',
                textShadowBlur: 3,
            }
        },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
    };

    const ctxBar = document.getElementById('boxesByContainerChart')?.getContext('2d');
    if (ctxBar) {
        if (appState.charts.container) appState.charts.container.destroy();
        appState.charts.container = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Military Inspection (Done)', data: finishedData, backgroundColor: '#10b981' },
                    { label: 'Pre-Inspection', data: preInspData, backgroundColor: '#f59e0b' },
                    { label: 'Remaining', data: remainingData, backgroundColor: '#cbd5e1' }
                ]
            },
            options: barOptions
        });
    }

    const factoryLabels = Object.keys(byFactory).sort();
    const factoryFinishedData = factoryLabels.map(l => byFactory[l].finished);
    const factoryPreInspData = factoryLabels.map(l => byFactory[l].inProgress);
    const factoryRemainingData = factoryLabels.map(l => byFactory[l].total - byFactory[l].finished - byFactory[l].inProgress);

    const ctxFactory = document.getElementById('boxesByFactoryChart')?.getContext('2d');
    if (ctxFactory) {
        if (appState.charts.factory) appState.charts.factory.destroy();
        appState.charts.factory = new Chart(ctxFactory, {
            type: 'bar',
            data: {
                labels: factoryLabels,
                datasets: [
                    { label: 'Military Inspection (Done)', data: factoryFinishedData, backgroundColor: '#10b981' },
                    { label: 'Pre-Inspection', data: factoryPreInspData, backgroundColor: '#f59e0b' },
                    { label: 'Remaining', data: factoryRemainingData, backgroundColor: '#cbd5e1' }
                ]
            },
            options: barOptions
        });
    }

    const totals = labels.reduce((acc, l) => {
        acc.total += byContainer[l].total;
        acc.finished += byContainer[l].finished;
        acc.inProgress += byContainer[l].inProgress;
        return acc;
    }, { total: 0, finished: 0, inProgress: 0 });

    const totalRemaining = Math.max(0, totals.total - totals.finished - totals.inProgress);

    const ctxDonut = document.getElementById('progressChart')?.getContext('2d');
    if (ctxDonut) {
        if (appState.charts.progress) appState.charts.progress.destroy();
        appState.charts.progress = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['Military Inspection (Done)', 'Pre-Inspection', 'Remaining'],
                datasets: [{
                    data: [totals.finished, totals.inProgress, totalRemaining],
                    backgroundColor: ['#10b981', '#f59e0b', '#cbd5e1']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                        color: '#fff',
                        font: { weight: '700', size: 13 },
                        textAlign: 'center',
                        formatter: (value, ctx) => {
                            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round(value / total * 100) : 0;
                            return `${value}\n${pct}%`;
                        },
                        textShadowColor: 'rgba(0,0,0,0.35)',
                        textShadowBlur: 4,
                    }
                },
                cutout: '60%'
            },
            plugins: [ChartDataLabels]
        });
    }

    // Daily chart: track both Pre-Inspection (by updated_at) and Military Inspection Done (by CompletionDate)
    const byDateDone = {};
    const byDatePreInsp = {};

    rows.forEach(r => {
        const s = classifyStatus(r.REMARKS);
        if (s === 'Military Inspection (Done)' && r.CompletionDate) {
            const date = String(r.CompletionDate).trim();
            if (date) {
                byDateDone[date] = (byDateDone[date] || 0) + 1;
                // Done boxes also went through pre-inspection — count them cumulatively
                byDatePreInsp[date] = (byDatePreInsp[date] || 0) + 1;
            }
        }
        if (s === 'Pre-Inspection' && r.updated_at) {
            const date = String(r.updated_at).substring(0, 10);
            if (date) byDatePreInsp[date] = (byDatePreInsp[date] || 0) + 1;
        }
    });

    const allDates = [...new Set([...Object.keys(byDateDone), ...Object.keys(byDatePreInsp)])].sort();
    const doneValues = allDates.map(d => byDateDone[d] || 0);
    const preInspValues = allDates.map(d => byDatePreInsp[d] || 0);

    const ctxDaily = document.getElementById('dailyProgressChart')?.getContext('2d');
    if (ctxDaily) {
        if (appState.charts.daily) appState.charts.daily.destroy();
        appState.charts.daily = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: [
                    {
                        label: 'Military Inspection (Done)',
                        data: doneValues,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 4
                    },
                    {
                        label: 'Pre-Inspection',
                        data: preInspValues,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: { display: false }
                },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }
}

// ==================== CHART ACTIONS ====================
window.copyChart = function (canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.toBlob(blob => {
        if (!blob) return;
        try {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            showToast('Chart copied to clipboard');
        } catch {
            showToast('Copy failed — try right-clicking the chart instead');
        }
    });
};

window.fullscreenChart = function (chartKey, title) {
    const chart = appState.charts[chartKey];
    if (!chart) return;

    const overlay = document.createElement('div');
    overlay.className = 'chart-fullscreen-overlay';
    overlay.innerHTML = `
        <div class="chart-fullscreen-inner">
            <div class="chart-fullscreen-title">${title || ''}</div>
            <button class="chart-fullscreen-close" title="Close">✕</button>
            <div class="chart-fullscreen-canvas-wrap">
                <canvas id="fullscreenCanvas"></canvas>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const fsCanvas = document.getElementById('fullscreenCanvas');
    new Chart(fsCanvas, {
        type: chart.config.type,
        data: JSON.parse(JSON.stringify(chart.config.data)),
        options: { ...chart.config.options, responsive: true, maintainAspectRatio: false },
        plugins: [ChartDataLabels]
    });

    overlay.querySelector('.chart-fullscreen-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
};

window.copyOverview = function () {
    const wrapId = appState.summaryMode === 'containers' ? 'containerSummaryWrap' : 'summaryWrap';
    const wrap = document.getElementById(wrapId);
    if (!wrap || !wrap.children.length) { showToast('No overview data to copy'); return; }

    if (typeof html2canvas !== 'function') { showToast('Screenshot library not loaded yet, try again'); return; }

    html2canvas(wrap, { scale: 2, useCORS: true, backgroundColor: getComputedStyle(document.body).getPropertyValue('--card').trim() || '#ffffff', logging: false })
        .then(canvas => {
            const dataUrl = canvas.toDataURL('image/png');

            // Build preview modal
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';

            const img = document.createElement('img');
            img.src = dataUrl;
            img.style.cssText = 'max-width:88vw;max-height:72vh;border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,0.6);display:block;';

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:12px;align-items:center;';

            const hint = document.createElement('span');
            hint.style.cssText = 'color:#cbd5e1;font-size:13px;';
            hint.textContent = 'Right-click → "Copy Image" to paste in reports';

            const copyBtn = document.createElement('button');
            copyBtn.textContent = '⧉ Copy to Clipboard';
            copyBtn.style.cssText = 'background:#667eea;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;';
            copyBtn.addEventListener('click', () => {
                canvas.toBlob(blob => {
                    if (!blob) return;
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        .then(() => { hint.textContent = '✓ Copied to clipboard!'; copyBtn.textContent = '✓ Copied'; })
                        .catch(() => { hint.textContent = 'Clipboard blocked — right-click the image instead'; });
                });
            });

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕ Close';
            closeBtn.style.cssText = 'background:none;color:#94a3b8;border:1px solid #334155;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;';
            closeBtn.addEventListener('click', () => overlay.remove());

            btnRow.append(copyBtn, closeBtn, hint);
            overlay.append(img, btnRow);
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            document.body.appendChild(overlay);

            // Silently try clipboard API (works on HTTPS)
            canvas.toBlob(blob => {
                if (!blob || !navigator.clipboard?.write) return;
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    .then(() => { hint.textContent = '✓ Already copied to clipboard — or right-click image to copy again'; })
                    .catch(() => {});
            });
        })
        .catch(() => showToast('Screenshot failed'));
};

function showToast(msg) {
    const existing = document.getElementById('simsToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'simsToast';
    toast.textContent = msg;
    Object.assign(toast.style, {
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: '8px',
        fontSize: '14px', zIndex: '9999', opacity: '1', transition: 'opacity 0.4s'
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2200);
}

const EXCEL_REPORT_THEME = {
    titleFill: "1f4e78",
    headerFill: "2f6ea5",
    accentFill: "dceaf7",
    summaryFill: "d7eadf",
    altRowFill: "f7fbff",
    border: "c8d6e5",
    textDark: "1f2933",
    textLight: "ffffff"
};
const EXPORT_EXCLUDED_COLS = new Set(["id", "shipment"]);
const EXPORT_TYPE_OPTIONS = {
    data_summary: { fileSuffix: "data_summary", sheetName: "Data" },
    remaining: { fileSuffix: "remaining", sheetName: "Remaining" },
    in_progress: { fileSuffix: "in_progress", sheetName: "In_Progress" },
    completed: { fileSuffix: "completed", sheetName: "Completed" },
    not_started: { fileSuffix: "not_started", sheetName: "Not_Started" },
    discrepancies: { fileSuffix: "discrepancies", sheetName: "Discrepancies" }
};

const EXPORT_TYPE_LABELS = {
    data_summary: 'Data Summary',
    remaining: 'Remaining',
    in_progress: 'Pre-Inspection',
    completed: 'Military Inspection (Done)',
    not_started: 'Not Started',
    discrepancies: 'Discrepancies'
};

function applyCellStyle(ws, address, style) {
    if (!ws[address]) return;
    ws[address].s = { ...(ws[address].s || {}), ...style };
}

function estimateColumnWidth(value) {
    if (value === null || value === undefined) return 10;
    return String(value).trim().length + 2;
}

function autoFitWorksheetColumns(ws, rows, keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;

    ws["!cols"] = keys.map(key => {
        let maxWidth = String(key).length + 4;
        rows.forEach(row => {
            maxWidth = Math.max(maxWidth, estimateColumnWidth(row?.[key]));
        });

        return { wch: Math.min(Math.max(maxWidth, 12), 28) };
    });
}

function styleTableWorksheet(ws, options = {}) {
    if (!ws["!ref"]) return;

    const {
        dataRows = [],
        keys = [],
        headerRowIndex = 0,
        freezeCell = null,
        totalLabel = "ALL",
        totalColumnKey = keys[0]
    } = options;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    const headerStyle = {
        font: { bold: true, color: { rgb: EXCEL_REPORT_THEME.textLight } },
        fill: { fgColor: { rgb: EXCEL_REPORT_THEME.headerFill } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            bottom: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            left: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            right: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } }
        }
    };
    const bodyBorder = {
        border: {
            top: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            bottom: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            left: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } },
            right: { style: "thin", color: { rgb: EXCEL_REPORT_THEME.border } }
        },
        alignment: { vertical: "center", wrapText: true }
    };
    const altRowStyle = {
        fill: { fgColor: { rgb: EXCEL_REPORT_THEME.altRowFill } }
    };
    const totalRowStyle = {
        font: { bold: true, color: { rgb: EXCEL_REPORT_THEME.textDark } },
        fill: { fgColor: { rgb: EXCEL_REPORT_THEME.summaryFill } }
    };

    for (let col = range.s.c; col <= range.e.c; col++) {
        const address = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
        applyCellStyle(ws, address, headerStyle);
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex <= range.e.r; rowIndex++) {
        const dataIndex = rowIndex - headerRowIndex - 1;
        const rowData = dataRows[dataIndex] || {};
        const isAlternating = dataIndex % 2 === 1;
        const isTotalRow = rowData?.[totalColumnKey] === totalLabel;

        for (let col = range.s.c; col <= range.e.c; col++) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
            applyCellStyle(ws, address, bodyBorder);

            if (isAlternating) {
                applyCellStyle(ws, address, altRowStyle);
            }

            if (isTotalRow) {
                applyCellStyle(ws, address, totalRowStyle);
            }
        }
    }

    ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: headerRowIndex, c: range.s.c },
            e: { r: range.e.r, c: range.e.c }
        })
    };

    if (freezeCell) {
        ws["!freeze"] = { xSplit: freezeCell.c, ySplit: freezeCell.r, topLeftCell: XLSX.utils.encode_cell(freezeCell), activePane: "bottomRight", state: "frozen" };
    }

    autoFitWorksheetColumns(ws, dataRows, keys);
}

function normalizeReportText(value) {
    return String(value ?? '').trim();
}

function hasDiscrepancy(value) {
    const text = normalizeReportText(value).toLowerCase();
    return text !== '' && text !== 'n/a' && text !== 'na' && text !== 'none';
}

function getOrderedFactoryValues(rows, preferredOrder = []) {
    const seen = new Set();
    const values = [];

    preferredOrder.forEach(value => {
        const exists = rows.some(row => normalizeReportText(row.Factory) === value);
        if (exists && !seen.has(value)) {
            seen.add(value);
            values.push(value);
        }
    });

    rows
        .map(row => normalizeReportText(row.Factory) || 'UNKNOWN')
        .sort((a, b) => a.localeCompare(b))
        .forEach(value => {
            if (!seen.has(value)) {
                seen.add(value);
                values.push(value);
            }
        });

    return values;
}

function getContainerDestinationMap(rows) {
    const containerFactoryCounts = {};

    rows.forEach(row => {
        const containerNum = normalizeReportText(row.ContainerNum);
        const factory = normalizeReportText(row.Factory) || 'UNKNOWN';
        if (!containerNum) return;

        if (!containerFactoryCounts[containerNum]) {
            containerFactoryCounts[containerNum] = {};
        }

        containerFactoryCounts[containerNum][factory] = (containerFactoryCounts[containerNum][factory] || 0) + 1;
    });

    const destinationMap = {};
    Object.entries(containerFactoryCounts).forEach(([containerNum, counts]) => {
        const destination = Object.entries(counts)
            .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0].localeCompare(b[0]);
            })[0]?.[0] || 'UNKNOWN';

        destinationMap[containerNum] = destination;
    });

    return destinationMap;
}

function resolveTransportDestination(row, containerDestinationMap = {}) {
    const shipmentDestination = normalizeReportText(row.shipment);
    if (shipmentDestination) return shipmentDestination;
    return '';
}

function buildExportDataRows(rows, baseColumns, options = {}) {
    const {
        extraColumns = [],
        containerDestinationMap = {}
    } = options;

    return rows.map(row => {
        const out = {};

        baseColumns.forEach(column => {
            out[column] = row[column] ?? "";
        });

        Object.keys(row).forEach(key => {
            if (!EXPECTED_COLS.includes(key) && !EXPORT_EXCLUDED_COLS.has(key)) {
                out[key] = row[key];
            }
        });

        extraColumns.forEach(column => {
            if (column === 'Status') {
                out.Status = classifyStatus(row.REMARKS);
            } else if (column === 'Destination') {
                out.Destination = resolveTransportDestination(row, containerDestinationMap);
            } else if (column === 'InternalTransportRoute') {
                const destination = resolveTransportDestination(row, containerDestinationMap);
                const factory = normalizeReportText(row.Factory) || 'UNKNOWN';
                out.InternalTransportRoute = destination && destination !== factory ? `${destination} -> ${factory}` : '';
            }
        });

        return out;
    });
}

function buildStyledRowsSheet(rows, columns, options = {}) {
    const ws = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([columns]);
    styleTableWorksheet(ws, {
        dataRows: rows,
        keys: columns,
        headerRowIndex: 0,
        freezeCell: { r: 1, c: 0 },
        totalLabel: options.totalLabel || "__NO_TOTAL__",
        totalColumnKey: options.totalColumnKey || columns[0]
    });
    return ws;
}

function buildStyledAnalyticsSheet(rows) {
    const byContainer = {};

    rows.forEach(r => {
        const cont = String(r.ContainerNum ?? "NA");
        if (!byContainer[cont]) byContainer[cont] = { total: 0, finished: 0, inProgress: 0 };
        byContainer[cont].total++;
        const s = classifyStatus(r.REMARKS);
        if (s === 'Military Inspection (Done)') byContainer[cont].finished++;
        else if (s === 'Pre-Inspection') byContainer[cont].inProgress++;
    });

    const out = [];
    let total = 0;
    let finished = 0;
    let inProgress = 0;

    sortContainerLabels(Object.keys(byContainer)).forEach(cont => {
        const v = byContainer[cont];
        const remaining = v.total - v.finished - v.inProgress;
        const cumulativePreInsp = v.inProgress + v.finished;
        const pctDone = v.total === 0 ? 0 : Math.round((v.finished / v.total) * 100);
        const pctPreInsp = v.total === 0 ? 0 : Math.round((cumulativePreInsp / v.total) * 100);

        out.push({
            Container: cont,
            TotalBoxes: v.total,
            'Pre-Inspection': cumulativePreInsp,
            'Pre-Insp %': `${pctPreInsp}%`,
            Remaining: remaining,
            'Remaining %': `${v.total === 0 ? 0 : Math.round((remaining / v.total) * 100)}%`,
            'Military Inspection (Done)': v.finished,
            'Done %': `${pctDone}%`
        });

        total += v.total;
        finished += v.finished;
        inProgress += v.inProgress;
    });

    const pctAll = total === 0 ? 0 : Math.round((finished / total) * 100);
    const cumulativePreInspAll = inProgress + finished;
    const pctPreAll = total === 0 ? 0 : Math.round((cumulativePreInspAll / total) * 100);
    const totalRemaining = total - finished - inProgress;
    out.push({
        Container: "ALL",
        TotalBoxes: total,
        'Pre-Inspection': cumulativePreInspAll,
        'Pre-Insp %': `${pctPreAll}%`,
        Remaining: totalRemaining,
        'Remaining %': `${total === 0 ? 0 : Math.round((totalRemaining / total) * 100)}%`,
        'Military Inspection (Done)': finished,
        'Done %': `${pctAll}%`
    });

    const keys = ["Container", "TotalBoxes", "Pre-Inspection", "Pre-Insp %", "Remaining", "Remaining %", "Military Inspection (Done)", "Done %"];
    const ws = XLSX.utils.json_to_sheet(out);
    styleTableWorksheet(ws, {
        dataRows: out,
        keys,
        headerRowIndex: 0,
        freezeCell: { r: 1, c: 0 },
        totalLabel: "ALL",
        totalColumnKey: "Container"
    });
    return ws;
}

function buildStyledSummarySheet(rows, factoryOrder) {
    const summaryData = [];
    let allTotal = 0;
    let allFinished = 0;
    let allInProgress = 0;

    factoryOrder.forEach(fac => {
        const filtered = rows.filter(r => (normalizeReportText(r.Factory) || 'UNKNOWN') === fac);
        if (filtered.length === 0) return;

        const total = filtered.length;
        const finished = filtered.filter(r => classifyStatus(r.REMARKS) === 'Military Inspection (Done)').length;
        const inProgress = filtered.filter(r => classifyStatus(r.REMARKS) === 'Pre-Inspection').length;
        const cumulativePreInsp = inProgress + finished;
        const pctDone = total === 0 ? 0 : Math.round((finished / total) * 100);
        const pctPreInsp = total === 0 ? 0 : Math.round((cumulativePreInsp / total) * 100);

        const remaining = total - finished - inProgress;
        summaryData.push({
            Factory: fac,
            TotalBoxes: total,
            'Pre-Inspection': cumulativePreInsp,
            'Pre-Insp %': `${pctPreInsp}%`,
            Remaining: remaining,
            'Remaining %': `${total === 0 ? 0 : Math.round((remaining / total) * 100)}%`,
            'Military Inspection (Done)': finished,
            'Done %': `${pctDone}%`
        });

        allTotal += total;
        allFinished += finished;
        allInProgress += inProgress;
    });

    const pctAll = allTotal === 0 ? 0 : Math.round((allFinished / allTotal) * 100);
    const allCumulativePreInsp = allInProgress + allFinished;
    const pctPreAll = allTotal === 0 ? 0 : Math.round((allCumulativePreInsp / allTotal) * 100);
    const allRemaining = allTotal - allFinished - allInProgress;
    summaryData.push({
        Factory: "ALL",
        TotalBoxes: allTotal,
        'Pre-Inspection': allCumulativePreInsp,
        'Pre-Insp %': `${pctPreAll}%`,
        Remaining: allRemaining,
        'Remaining %': `${allTotal === 0 ? 0 : Math.round((allRemaining / allTotal) * 100)}%`,
        'Military Inspection (Done)': allFinished,
        'Done %': `${pctAll}%`
    });

    const keys = ["Factory", "TotalBoxes", "Pre-Inspection", "Pre-Insp %", "Remaining", "Remaining %", "Military Inspection (Done)", "Done %"];

    const ws = XLSX.utils.json_to_sheet(summaryData, { origin: "A3" });
    ws["A1"] = { t: "s", v: "Shipment Inspection Summary" };
    ws["A2"] = { t: "s", v: `Generated: ${new Date().toLocaleString()}` };
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: keys.length - 1 } }];

    applyCellStyle(ws, "A1", {
        font: { bold: true, sz: 16, color: { rgb: EXCEL_REPORT_THEME.textLight } },
        fill: { fgColor: { rgb: EXCEL_REPORT_THEME.titleFill } },
        alignment: { horizontal: "center", vertical: "center" }
    });
    applyCellStyle(ws, "A2", {
        font: { italic: true, color: { rgb: EXCEL_REPORT_THEME.textDark } },
        fill: { fgColor: { rgb: EXCEL_REPORT_THEME.accentFill } }
    });

    styleTableWorksheet(ws, {
        dataRows: summaryData,
        keys,
        headerRowIndex: 2,
        freezeCell: { r: 3, c: 0 },
        totalLabel: "ALL",
        totalColumnKey: "Factory"
    });
    return ws;
}

// ==================== EXPORT FUNCTION - FIXED ====================
function exportWorkbookWithAnalytics(selectedExportType = 'data_summary') {
    if (!appState.activeKey || !appState.files[appState.activeKey]) {
        alert('No data to export');
        return;
    }

    const entry = appState.files[appState.activeKey];
    const exportConfig = EXPORT_TYPE_OPTIONS[selectedExportType] || EXPORT_TYPE_OPTIONS.data_summary;
    const exportColumns = EXPECTED_COLS.filter(col => !EXPORT_EXCLUDED_COLS.has(col));
    const preferredFactoryOrder = ["F200", "F100", "AIO"];
    const orderedFactories = getOrderedFactoryValues(entry.rows, preferredFactoryOrder);
    const containerDestinationMap = getContainerDestinationMap(entry.rows);

    // Data Sheet
    const dataRows = buildExportDataRows(entry.rows, exportColumns, {
        containerDestinationMap
    });
    const dataColumns = [...exportColumns];
    const wsData = buildStyledRowsSheet(dataRows, dataColumns);

    const wsAnalytics = buildStyledAnalyticsSheet(entry.rows);
    const wsSummary = buildStyledSummarySheet(entry.rows, orderedFactories);

    const remainingRows = entry.rows.filter(row => classifyStatus(row.REMARKS) !== 'Military Inspection (Done)');
    const inProgressRows = entry.rows.filter(row => classifyStatus(row.REMARKS) === 'Pre-Inspection');
    const completedRows = entry.rows.filter(row => classifyStatus(row.REMARKS) === 'Military Inspection (Done)');
    const notStartedRows = entry.rows.filter(row => classifyStatus(row.REMARKS) === 'Not Started');
    const discrepancyRows = entry.rows.filter(row => hasDiscrepancy(row.Discrepancies));
    const reportDefinitions = {
        data_summary: {
            sheetName: "Data",
            rows: entry.rows,
            extraColumns: []
        },
        remaining: {
            sheetName: "Remaining",
            rows: remainingRows,
            extraColumns: ["Status"]
        },
        in_progress: {
            sheetName: "In_Progress",
            rows: inProgressRows,
            extraColumns: ["Status"]
        },
        completed: {
            sheetName: "Completed",
            rows: completedRows,
            extraColumns: ["Status"]
        },
        not_started: {
            sheetName: "Not_Started",
            rows: notStartedRows,
            extraColumns: ["Status"]
        },
        discrepancies: {
            sheetName: "Discrepancies",
            rows: discrepancyRows,
            extraColumns: ["Status"]
        }
    };

    // Build Workbook
    const wb = XLSX.utils.book_new();
    if (selectedExportType === 'data_summary') {
        XLSX.utils.book_append_sheet(wb, wsData, "Data");
        XLSX.utils.book_append_sheet(wb, wsAnalytics, "Analytics");
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        orderedFactories.forEach(fac => {
            const filtered = entry.rows.filter(r => (normalizeReportText(r.Factory) || 'UNKNOWN') === fac);
            const ws = buildStyledAnalyticsSheet(filtered);
            const safe = `Analytics_${fac}`.replace(/[^A-Za-z0-9_]/g, "");
            XLSX.utils.book_append_sheet(wb, ws, safe);
        });
    } else {
        const selectedReport = reportDefinitions[selectedExportType];
        const reportRows = buildExportDataRows(selectedReport.rows, exportColumns, {
            extraColumns: selectedReport.extraColumns,
            containerDestinationMap
        });
        const reportColumns = [...exportColumns, ...selectedReport.extraColumns];
        const ws = buildStyledRowsSheet(reportRows, reportColumns);
        XLSX.utils.book_append_sheet(wb, ws, selectedReport.sheetName);
    }

    // Save File
    const outName = `${entry.name.replace(/\s+/g, '_')}_${exportConfig.fileSuffix}_${nowTimestampForName()}.xlsx`;
    XLSX.writeFile(wb, outName);

    const exportLabel = EXPORT_TYPE_LABELS[selectedExportType] || selectedExportType;

    logAudit({
        userEmail: appState.currentUser?.email || 'UNKNOWN',
        action: 'DATA_EXPORT',
        details: `Exported "${exportLabel}" report with ${entry.rows.length} records (${outName})`,
        tableName: appState.activeKey
    });
}

function toggleExportMenu(forceOpen = null) {
    if (!elements.exportMenu || !elements.exportBtn) return;

    const shouldOpen = forceOpen === null ? elements.exportMenu.hidden : forceOpen;
    elements.exportMenu.hidden = !shouldOpen;
    elements.exportBtn.setAttribute('aria-expanded', String(shouldOpen));
}

function toggleUploadMenu(forceOpen = null) {
    if (!elements.uploadMenu || !elements.uploadBtn) return;

    const shouldOpen = forceOpen === null ? elements.uploadMenu.hidden : forceOpen;
    elements.uploadMenu.hidden = !shouldOpen;
    elements.uploadBtn.setAttribute('aria-expanded', String(shouldOpen));
}

// ==================== UPLOAD NEW SHIPMENT ====================
const SHIPMENT_TEMPLATE_COLUMNS = ['NO', 'ContainerNum', 'BoxNum', 'Container', 'BoxName', 'ItemCount', 'Kits', 'Factory'];
const SHIPMENT_MANIFEST_COMPARE_FIELDS = ['NO', 'Container', 'BoxName', 'ItemCount', 'Kits', 'Factory'];
const SHIPMENT_NUMERIC_FIELDS = new Set(['NO', 'ItemCount']);

function shipmentBoxKey(containerNum, boxNum) {
    return `${String(containerNum ?? '').trim()}|${String(boxNum ?? '').trim()}`;
}

function downloadShipmentTemplate() {
    const ws = buildStyledRowsSheet([], SHIPMENT_TEMPLATE_COLUMNS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'SIMS_Shipment_Upload_Template.xlsx');
}

function openUploadShipmentModal() {
    if (!elements.uploadShipmentModal) return;
    resetUploadShipmentModal();
    elements.uploadShipmentModal.classList.add('active');
}

function closeUploadShipmentModalFn() {
    if (!elements.uploadShipmentModal) return;
    elements.uploadShipmentModal.classList.remove('active');
}

function resetUploadShipmentModal() {
    if (elements.uploadShipmentName) elements.uploadShipmentName.value = '';
    if (elements.uploadShipmentFileInput) elements.uploadShipmentFileInput.value = '';
    if (elements.uploadShipmentStepForm) elements.uploadShipmentStepForm.hidden = false;
    if (elements.uploadShipmentStepReview) elements.uploadShipmentStepReview.hidden = true;
    if (elements.uploadShipmentStepDone) elements.uploadShipmentStepDone.hidden = true;
    appState.pendingShipmentUpload = null;
}

async function handleUploadShipmentFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const shipmentName = (elements.uploadShipmentName.value || '').trim();
    if (!shipmentName) {
        alert('Please enter a shipment name first.');
        elements.uploadShipmentFileInput.value = '';
        return;
    }

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const uploadedRows = rawRows
            .map(row => {
                const out = { shipment: shipmentName };
                SHIPMENT_TEMPLATE_COLUMNS.forEach(col => {
                    const raw = row[col] ?? '';
                    out[col] = SHIPMENT_NUMERIC_FIELDS.has(col) ? (Number(raw) || 0) : String(raw).trim();
                });
                return out;
            })
            .filter(row => String(row.ContainerNum).trim() && String(row.BoxNum).trim());

        const { data: existingRows, error } = await supabaseClient
            .from(MAIN_TABLE)
            .select('*')
            .eq('shipment', shipmentName);

        if (error) throw error;

        const existingByKey = new Map();
        (existingRows || []).forEach(r => {
            existingByKey.set(shipmentBoxKey(r.ContainerNum, r.BoxNum), r);
        });

        const newRows = [];
        const changedRows = [];
        let unchangedCount = 0;

        uploadedRows.forEach(row => {
            const key = shipmentBoxKey(row.ContainerNum, row.BoxNum);
            const existing = existingByKey.get(key);

            if (!existing) {
                newRows.push(row);
                return;
            }

            const changes = SHIPMENT_MANIFEST_COMPARE_FIELDS.filter(field => {
                return String(row[field] ?? '').trim() !== String(existing[field] ?? '').trim();
            });

            if (changes.length === 0) {
                unchangedCount++;
            } else {
                changedRows.push({ row, existing, changes });
            }
        });

        appState.pendingShipmentUpload = { shipmentName, allRows: uploadedRows, newRows, changedRows, unchangedCount };
        renderUploadShipmentReview();
    } catch (err) {
        console.error('Failed to parse shipment file:', err);
        alert('❌ Failed to read the file. Make sure it matches the template.');
    } finally {
        elements.uploadShipmentFileInput.value = '';
    }
}

function renderUploadShipmentReview() {
    const pending = appState.pendingShipmentUpload;
    if (!pending) return;

    elements.uploadShipmentStepForm.hidden = true;
    elements.uploadShipmentStepReview.hidden = false;

    const totalBoxes = pending.allRows.length;
    const totalContainers = new Set(pending.allRows.map(r => String(r.ContainerNum ?? '').trim())).size;

    const factoryCounts = new Map();
    pending.allRows.forEach(r => {
        const factory = String(r.Factory ?? '').trim() || 'UNKNOWN';
        factoryCounts.set(factory, (factoryCounts.get(factory) || 0) + 1);
    });
    const factoryBreakdownHtml = [...factoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([factory, count]) => `<li>${escapeHtmlAttr(factory)}: ${count}</li>`)
        .join('');

    elements.uploadShipmentSummary.innerHTML = `
        <p><strong>${escapeHtmlAttr(pending.shipmentName)}</strong></p>
        <p>${totalBoxes} box(es) total across ${totalContainers} container(s) in this file.</p>
        <ul class="upload-shipment-factory-breakdown">${factoryBreakdownHtml}</ul>
        <p>${pending.newRows.length} new box(es), ${pending.changedRows.length} changed box(es), ${pending.unchangedCount} unchanged box(es).</p>
        <p class="muted">Inspection status (Remarks, Completion Date, Discrepancies) is never modified by an upload.</p>
    `;

    const newRowsHtml = pending.newRows.length
        ? `<h4>New Boxes (${pending.newRows.length})</h4><ul>${pending.newRows.map(r =>
            `<li>Container ${escapeHtmlAttr(r.ContainerNum)} / Box ${escapeHtmlAttr(r.BoxNum)} — ${escapeHtmlAttr(r.BoxName)}</li>`
        ).join('')}</ul>`
        : '';

    const changedRowsHtml = pending.changedRows.length
        ? `<h4>Changed Boxes (${pending.changedRows.length})</h4><ul>${pending.changedRows.map(c =>
            `<li>Container ${escapeHtmlAttr(c.existing.ContainerNum)} / Box ${escapeHtmlAttr(c.existing.BoxNum)}: ${c.changes.map(field =>
                `${field} "${escapeHtmlAttr(c.existing[field])}" → "${escapeHtmlAttr(c.row[field])}"`
            ).join(', ')}</li>`
        ).join('')}</ul>`
        : '';

    elements.uploadShipmentDetails.innerHTML = (newRowsHtml + changedRowsHtml)
        || '<p class="muted">No new or changed boxes — nothing to save.</p>';
}

async function confirmUploadShipment() {
    const pending = appState.pendingShipmentUpload;
    if (!pending) return;

    if (pending.newRows.length === 0 && pending.changedRows.length === 0) {
        closeUploadShipmentModalFn();
        return;
    }

    elements.uploadShipmentConfirmBtn.disabled = true;

    try {
        if (pending.newRows.length > 0) {
            const insertPayload = pending.newRows.map(row => ({
                shipment: row.shipment,
                NO: row.NO,
                ContainerNum: row.ContainerNum,
                BoxNum: row.BoxNum,
                Container: row.Container,
                BoxName: row.BoxName,
                ItemCount: row.ItemCount,
                Kits: row.Kits,
                Factory: row.Factory,
                REMARKS: '',
                CompletionDate: null,
                Discrepancies: '',
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabaseClient.from(MAIN_TABLE).insert(insertPayload);
            if (error) throw error;
        }

        for (const { row, existing } of pending.changedRows) {
            const { error } = await supabaseClient
                .from(MAIN_TABLE)
                .update({
                    NO: row.NO,
                    Container: row.Container,
                    BoxName: row.BoxName,
                    ItemCount: row.ItemCount,
                    Kits: row.Kits,
                    Factory: row.Factory,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        }

        await logAudit({
            userEmail: appState.currentUser?.email || 'UNKNOWN',
            action: 'SHIPMENT_UPLOAD',
            details: `Shipment "${pending.shipmentName}": ${pending.newRows.length} new, ${pending.changedRows.length} updated, ${pending.unchangedCount} unchanged`,
            tableName: MAIN_TABLE
        });

        elements.uploadShipmentStepReview.hidden = true;
        elements.uploadShipmentStepDone.hidden = false;
        elements.uploadShipmentDoneMessage.textContent =
            `✅ Shipment "${pending.shipmentName}" saved: ${pending.newRows.length} new, ${pending.changedRows.length} updated.`;

        await loadFromSupabase();
        filterState.shipment = new Set([pending.shipmentName]);
        localStorage.setItem(SELECTED_SHIPMENT_KEY, pending.shipmentName);
        populateFilesSelectOptions();
        renderFilteredAndLive();

        appState.pendingShipmentUpload = null;
    } catch (err) {
        console.error('Shipment upload failed:', err);
        alert('❌ Failed to save shipment changes to the database.');
    } finally {
        elements.uploadShipmentConfirmBtn.disabled = false;
    }
}

async function applyBulkRemark(value) {
    if (!value) return alert("Please select a remark to apply");

    // Treat the special __CLEAR__ value as empty
    const remarkValue = value === '__CLEAR__' ? '' : value;

    if (!appState.activeKey) return;

    const allRows = appState.files[appState.activeKey].rows || [];
    sortRowsByShipmentAndContainer(allRows);

    const filtered = applyActiveFilters(allRows);

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
        tableName: appState.activeKey
    });

    elements.bulkRemarkSelect.value = ''; // reset dropdown
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    elements.logoutBtn.addEventListener('click', () => {
        if (appState.currentUser) {
            logAudit({
                userId: appState.currentUser.id,
                userEmail: appState.currentUser.email,
                action: 'USER_LOGOUT',
                details: `User ${appState.currentUser.email} logged out`
            });
        }
        sessionStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    });

    elements.refreshBtn.addEventListener('click', async () => {
        await loadFromSupabase();
    });

    elements.exportBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleExportMenu();
    });

    elements.exportMenu.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('mouseenter', () => {
            if (elements.exportMenuHint) {
                elements.exportMenuHint.textContent = option.dataset.description || 'Export selected report.';
            }
        });

        option.addEventListener('focus', () => {
            if (elements.exportMenuHint) {
                elements.exportMenuHint.textContent = option.dataset.description || 'Export selected report.';
            }
        });

        option.addEventListener('click', () => {
            toggleExportMenu(false);
            exportWorkbookWithAnalytics(option.dataset.exportType || 'data_summary');
        });
    });

    if (elements.exportMenu) {
        elements.exportMenu.addEventListener('mouseleave', () => {
            if (elements.exportMenuHint) {
                elements.exportMenuHint.textContent = 'Hover an option to see what the export will contain.';
            }
        });
    }

    document.addEventListener('click', (event) => {
        if (!elements.exportDropdown?.contains(event.target)) {
            toggleExportMenu(false);
        }
    });

    elements.uploadBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleUploadMenu();
    });

    elements.uploadMenu.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('mouseenter', () => {
            if (elements.uploadMenuHint) {
                elements.uploadMenuHint.textContent = option.dataset.description || '';
            }
        });
        option.addEventListener('focus', () => {
            if (elements.uploadMenuHint) {
                elements.uploadMenuHint.textContent = option.dataset.description || '';
            }
        });
    });

    if (elements.uploadMenu) {
        elements.uploadMenu.addEventListener('mouseleave', () => {
            if (elements.uploadMenuHint) {
                elements.uploadMenuHint.textContent = 'Hover an option to see what it does.';
            }
        });
    }

    elements.viewLocalFileOption.addEventListener('click', () => {
        toggleUploadMenu(false);
        elements.fileInput.click();
    });

    elements.uploadNewShipmentOption.addEventListener('click', () => {
        toggleUploadMenu(false);
        openUploadShipmentModal();
    });

    document.addEventListener('click', (event) => {
        if (!elements.uploadDropdown?.contains(event.target)) {
            toggleUploadMenu(false);
        }
    });

    elements.closeUploadShipmentModal.addEventListener('click', closeUploadShipmentModalFn);

    window.addEventListener('click', (e) => {
        if (e.target === elements.uploadShipmentModal) {
            closeUploadShipmentModalFn();
        }
    });

    elements.downloadShipmentTemplateBtn.addEventListener('click', downloadShipmentTemplate);
    elements.uploadShipmentFileInput.addEventListener('change', handleUploadShipmentFileSelected);

    elements.uploadShipmentBackBtn.addEventListener('click', () => {
        appState.pendingShipmentUpload = null;
        elements.uploadShipmentStepReview.hidden = true;
        elements.uploadShipmentStepForm.hidden = false;
    });

    elements.uploadShipmentConfirmBtn.addEventListener('click', confirmUploadShipment);

    elements.searchInput.addEventListener('input', renderFilteredAndLive);

    renderMultiSelectMenu('status');
    renderMultiSelectMenu('boxType');

    Object.keys(filterConfig).forEach(key => {
        const cfg = filterConfig[key];
        elements[cfg.btn].addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMultiSelectMenu(key);
        });
        elements[cfg.menu].addEventListener('change', (e) => handleMultiSelectMenuChange(key, e));
    });

    document.addEventListener('click', (e) => {
        Object.keys(filterConfig).forEach(key => {
            const cfg = filterConfig[key];
            if (!elements[cfg.btn].contains(e.target) && !elements[cfg.menu].contains(e.target)) {
                elements[cfg.menu].hidden = true;
            }
        });
    });

    if (elements.showBoxSummaryBtn) {
        elements.showBoxSummaryBtn.addEventListener('click', () => {
            appState.summaryMode = 'boxes';
            updateSummaryView();
        });
    }

    if (elements.showContainerSummaryBtn) {
        elements.showContainerSummaryBtn.addEventListener('click', () => {
            appState.summaryMode = 'containers';
            updateSummaryView();
        });
    }

    elements.clearFiltersBtn.addEventListener('click', () => {
        resetMultiSelectFilters();
        elements.searchInput.value = '';
        renderFilteredAndLive();
    });

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

    const copyOverviewBtn = document.getElementById('copyOverviewBtn');
    if (copyOverviewBtn) {
        copyOverviewBtn.addEventListener('click', copyOverview);
    }

    elements.viewAuditBtn.addEventListener('click', openAuditModal);

    elements.closeAuditModal.addEventListener('click', () => {
        elements.auditModal.classList.remove('active');
    });

    elements.filterAuditBtn.addEventListener('click', () => {
        loadAuditLogs({
            dateFrom: elements.auditDateFrom.value,
            dateTo: elements.auditDateTo.value,
            user: elements.auditUserFilter.value,
            action: elements.auditActionFilter.value,
            table: elements.auditTableFilter.value,
            search: elements.auditSearchInput.value
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === elements.auditModal) {
            elements.auditModal.classList.remove('active');
        }
    });

    elements.filesSelect.addEventListener('change', () => {
        const value = elements.filesSelect.value;
        if (!value) return;

        if (appState.files[value]) {
            // A previously uploaded local preview file
            setActiveFile(value);
            return;
        }

        // One of the live shipments
        appState.activeKey = MAIN_TABLE;
        filterState.shipment = new Set([value]);
        localStorage.setItem(SELECTED_SHIPMENT_KEY, value);
        buildFactoryFilter();
        buildContainerFilter();
        renderFilteredAndLive();
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

            // Set uploaded file as active (also adds it to the dropdown)
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
    applyTheme(getStoredTheme());

    if (!checkAuthentication()) return;

    elements.viewAuditBtn.style.display = isMasterAdmin() ? 'inline-flex' : 'none';

    setupEventListeners();
    buildAuditActionFilter();
    buildAuditTableFilter();
    await Promise.all([
        loadFromSupabase(),
        isMasterAdmin() ? fetchUsers() : Promise.resolve([])
    ]);

    console.log('✅ Application initialized for:', appState.currentUser.email);
    console.log('✅ Role:', appState.currentRole);
}

// Start the application

init();
