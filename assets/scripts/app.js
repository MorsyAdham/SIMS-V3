// ==================== CONFIGURATION ====================
const SUPABASE_URL = "https://biqwfqkuhebxcfucangt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcXdmcWt1aGVieGNmdWNhbmd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzM5NzQsImV4cCI6MjA4MTk0OTk3NH0.QkASAl8yzXfxVq0b0FdkXHTOpblldr2prCnImpV8ml8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Expected columns for data normalization
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
    charts: {
        progress: null,
        container: null,
        daily: null
    }
};

// ==================== DOM ELEMENTS ====================
const elements = {
    // Main sections
    dashboard: document.getElementById('dashboard'),

    // User info
    userEmail: document.getElementById('userEmail'),
    userRole: document.getElementById('userRole'),
    logoutBtn: document.getElementById('logoutBtn'),

    // File management
    filesSelect: document.getElementById('filesSelect'),
    fileInput: document.getElementById('fileInput'),
    uploadLabel: document.getElementById('uploadLabel'),
    refreshBtn: document.getElementById('refreshBtn'),
    exportBtn: document.getElementById('exportBtn'),
    viewAuditBtn: document.getElementById('viewAuditBtn'),

    // Filters
    shipmentFilter: document.getElementById('shipmentFilter'),
    factoryFilter: document.getElementById('factoryFilter'),
    containerFilter: document.getElementById('containerFilter'),
    statusFilter: document.getElementById('statusFilter'),
    searchInput: document.getElementById('searchInput'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),

    // Summary
    summaryWrap: document.getElementById('summaryWrap'),
    rowsCount: document.getElementById('rowsCount'),
    multipackCard: document.getElementById('multipackCard'),
    normalPackCard: document.getElementById('normalPackCard'),
    multipackCount: document.getElementById('multipackCount'),
    normalCount: document.getElementById('normalCount'),

    // Bulk actions
    bulkActionsSection: document.getElementById('bulkActionsSection'),
    applyRemark: document.getElementById('applyRemark'),
    applyAllBtn: document.getElementById('applyAllBtn'),

    // Table
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),

    // Modals
    auditModal: document.getElementById('auditModal'),
    closeAuditModal: document.getElementById('closeAuditModal'),
    auditLogContent: document.getElementById('auditLogContent'),
    auditDateFrom: document.getElementById('auditDateFrom'),
    auditDateTo: document.getElementById('auditDateTo'),
    auditUserFilter: document.getElementById('auditUserFilter'),
    filterAuditBtn: document.getElementById('filterAuditBtn')
};

// ==================== AUTHENTICATION ====================
async function checkAuthentication() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session?.user) {
        window.location.href = 'login.html';
        return false;
    }

    appState.currentUser = session.user;
    appState.isAuthenticated = true;

    await checkUserRole(session.user);
    updateUIForUser();

    return true;
}

async function checkUserRole(user) {
    try {
        const { data, error } = await supabaseClient
            .from('user_roles')
            .select('role, approved')
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            console.error('Error fetching role:', error);
            appState.currentRole = 'viewer';
            return;
        }

        if (!data.approved) {
            alert('Your account is pending approval. Please contact an administrator.');
            await supabaseClient.auth.signOut();
            window.location.href = 'login.html';
            return;
        }

        appState.currentRole = data.role || 'viewer';
    } catch (error) {
        console.error('Error checking role:', error);
        appState.currentRole = 'viewer';
    }
}

function updateUIForUser() {
    const user = appState.currentUser;
    const role = appState.currentRole;

    elements.userEmail.textContent = user.email;
    elements.userRole.textContent = role.toUpperCase();
    elements.userRole.className = `role-badge ${role}`;

    // Show/hide admin-only features
    const isAdmin = role === 'admin';

    if (elements.bulkActionsSection) {
        elements.bulkActionsSection.style.display = isAdmin ? 'block' : 'none';
    }

    if (elements.uploadLabel) {
        elements.uploadLabel.style.display = isAdmin ? 'flex' : 'none';
    }

    // Enable/disable form elements
    if (elements.fileInput) elements.fileInput.disabled = !isAdmin;
    if (elements.applyAllBtn) elements.applyAllBtn.disabled = !isAdmin;
}

// ==================== AUDIT LOGGING ====================
async function logAudit(action, details) {
    try {
        const auditEntry = {
            user_id: appState.currentUser.id,
            user_email: appState.currentUser.email,
            action: action,
            details: details,
            timestamp: new Date().toISOString()
        };

        await supabaseClient.from('audit_log').insert(auditEntry);
        console.log('Audit logged:', action);
    } catch (error) {
        console.error('Failed to log audit:', error);
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
                    ${log.details ? `<br><small>${log.details}</small>` : ''}
                </div>
            </div>
        `;
    }).join('');

    elements.auditLogContent.innerHTML = html;
}

// ==================== DATA LOADING ====================
async function loadFromSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('inspection_boxes')
            .select('*')
            .order('ContainerNum', { ascending: true })
            .order('BoxNum', { ascending: true });

        if (error) {
            console.error('Supabase fetch failed:', error);
            alert('Failed to load data from Supabase');
            return;
        }

        if (!data || data.length === 0) {
            console.warn('No data found in Supabase');
            return;
        }

        const normalizedRows = data.map(row => {
            const out = {};
            EXPECTED_COLS.forEach(col => {
                out[col] = row[col] ?? '';
            });
            return out;
        });

        const key = 'supabase_data';
        appState.files[key] = {
            name: 'Inspection Data',
            workbook: null,
            sheetName: 'inspection_boxes',
            rows: normalizedRows,
            columns: EXPECTED_COLS.slice()
        };

        // Update files select
        elements.filesSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = 'Inspection Data';
        elements.filesSelect.appendChild(opt);

        setActiveFile(key);

        console.log(`✅ Loaded ${normalizedRows.length} rows from Supabase`);

        await logAudit('DATA_LOAD', `Loaded ${normalizedRows.length} records from database`);
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load inspection data. Please try refreshing the page.');
    }
}

// ==================== DATA UPDATES ====================
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
            .from('inspection_boxes')
            .update(payload)
            .eq('id', row.id);

        if (error) throw error;

        // Log the audit trail
        await logAudit('DATA_UPDATE',
            `Updated ${fieldChanged || 'field'} for Box ${row.BoxNum} in Container ${row.ContainerNum}`
        );

        console.log(`✅ Updated row id=${row.id}`);
        return true;
    } catch (error) {
        console.error('Update failed:', error);
        alert('Failed to save changes to database');
        return false;
    }
}

// Continued in Part 2...
// Continued from Part 1...

// ==================== UTILITY FUNCTIONS ====================
function normalizeKey(str) {
    return String(str || '')
        .trim()
        .replace(/\u00A0/g, '')
        .replace(/[^\w]/g, '')
        .toLowerCase();
}

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
        // Shipment
        const sA = String(a.shipment ?? '').trim();
        const sB = String(b.shipment ?? '').trim();
        const sCmp = sA.localeCompare(sB);
        if (sCmp !== 0) return sCmp;

        // Container (numeric)
        const cA = parseInt(a.ContainerNum, 10);
        const cB = parseInt(b.ContainerNum, 10);
        if (!isNaN(cA) && !isNaN(cB) && cA !== cB) return cA - cB;

        // BoxNum parsing
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

    // Build header
    const trh = document.createElement('tr');
    cols.forEach(c => {
        if (c === 'id') return; // Skip ID column
        const th = document.createElement('th');
        th.textContent = c;
        trh.appendChild(th);
    });
    elements.tableHead.appendChild(trh);

    // Build body
    rows.forEach(r => {
        const tr = document.createElement('tr');

        cols.forEach(c => {
            if (c === 'id') return; // Skip ID column

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

                // Color coding
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
                        renderFilteredAndLive();
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

function updateMultipackNormalCounts(rows) {
    let multi = 0, normal = 0;

    rows.forEach(r => {
        const ic = Number(r.ItemCount ?? 0) || 0;
        if (ic > 1) multi++;
        else normal++;
    });

    elements.multipackCount.textContent = multi;
    elements.normalCount.textContent = normal;
}

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

    // Bar Chart
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

    // Donut Chart
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

    // Daily Progress Chart
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

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Logout
    elements.logoutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    // Refresh data
    elements.refreshBtn.addEventListener('click', async () => {
        await loadFromSupabase();
    });

    // Export
    elements.exportBtn.addEventListener('click', () => {
        if (!appState.activeKey) {
            alert('No active file to export');
            return;
        }
        exportWorkbookWithAnalytics(appState.activeKey);
    });

    // Filters
    elements.shipmentFilter.addEventListener('change', renderFilteredAndLive);
    elements.factoryFilter.addEventListener('change', renderFilteredAndLive);
    elements.containerFilter.addEventListener('change', renderFilteredAndLive);
    elements.statusFilter.addEventListener('change', renderFilteredAndLive);
    elements.searchInput.addEventListener('input', renderFilteredAndLive);

    // Clear filters
    elements.clearFiltersBtn.addEventListener('click', () => {
        elements.shipmentFilter.value = 'all';
        elements.factoryFilter.value = 'all';
        elements.containerFilter.value = 'all';
        elements.statusFilter.value = 'all';
        elements.searchInput.value = '';
        renderFilteredAndLive();
    });

    // Multipack/normal filters
    elements.multipackCard.addEventListener('click', () => filterByItemCount(true));
    elements.normalPackCard.addEventListener('click', () => filterByItemCount(false));

    // Bulk actions
    if (elements.applyAllBtn) {
        elements.applyAllBtn.addEventListener('click', async () => {
            const val = elements.applyRemark.value;
            await applyBulkRemark(val);
        });
    }

    // Audit log
    elements.viewAuditBtn.addEventListener('click', () => {
        elements.auditModal.classList.add('active');
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

    // Click outside modal to close
    window.addEventListener('click', (e) => {
        if (e.target === elements.auditModal) {
            elements.auditModal.classList.remove('active');
        }
    });
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

async function applyBulkRemark(value) {
    if (!appState.activeKey) return;

    const allRows = appState.files[appState.activeKey].rows || [];
    const today = new Date().toISOString().split('T')[0];

    let count = 0;

    for (const row of allRows) {
        row.REMARKS = value;

        if (value.toLowerCase() === 'done') {
            row.CompletionDate = row.CompletionDate || today;
        } else {
            row.CompletionDate = '';
        }

        await updateRowInSupabase(row, 'REMARKS (Bulk)');
        count++;
    }

    await logAudit('BULK_UPDATE', `Applied "${value}" to ${count} rows`);
    renderFilteredAndLive();
}

function exportWorkbookWithAnalytics(key) {
    // Export logic similar to original but with improved structure
    // Placeholder - implementation would be similar to original
    alert('Export functionality - to be implemented');
}

// ==================== INITIALIZATION ====================
async function init() {
    const authenticated = await checkAuthentication();
    if (!authenticated) return;

    setupEventListeners();
    await loadFromSupabase();

    console.log('Application initialized successfully');
}

// Start the application
init();