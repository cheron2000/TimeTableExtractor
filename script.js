// ============================================
// Configuration
// ============================================
const API_BASE = 'http://localhost:8000';

// ============================================
// State Management
// ============================================
const state = {
    sessionId: null,
    teachers: [],
    divisions: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    batches: {},
    currentSchedule: null,
    facultyMap: {}
};

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeUpload();
    initializeFilters();
    loadFacultyMap();
    checkExistingSession();
});

// ============================================
// Navigation
// ============================================
function initializeNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewName = btn.dataset.view;
            switchView(viewName);
            
            // Update active nav button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Quick navigation buttons
    document.getElementById('view-schedule-btn')?.addEventListener('click', () => {
        switchView('view');
        document.querySelector('[data-view="view"]').click();
    });

    document.getElementById('goto-upload-btn')?.addEventListener('click', () => {
        switchView('upload');
        document.querySelector('[data-view="upload"]').click();
    });
}

function switchView(viewName) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(`${viewName}-view`) || 
                       document.getElementById(`${viewName}-schedule`);
    if (targetView) {
        targetView.classList.add('active');
    }
}

// ============================================
// Upload Functionality
// ============================================
function initializeUpload() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');

    // Click to browse
    browseBtn.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('click', (e) => {
        if (e.target !== browseBtn) {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
}

async function handleFileUpload(file) {
    // Validate file type
    const validTypes = ['.xlsx', '.xlsm'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(fileExt)) {
        showToast('Invalid file type. Please upload .xlsx or .xlsm files.', 'error');
        return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('File too large. Maximum size is 10MB.', 'error');
        return;
    }

    // Show progress
    document.getElementById('upload-zone').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'block';
    
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                progressFill.style.width = `${progress}%`;
            }
        }, 100);

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        const data = await response.json();
        
        // Store session
        state.sessionId = data.session_id;
        state.teachers = data.teachers || [];
        localStorage.setItem('timetable_session', data.session_id);

        // Show success
        setTimeout(() => {
            document.getElementById('upload-progress').style.display = 'none';
            document.getElementById('upload-success').style.display = 'block';
            displayFileInfo(data);
            showToast('File uploaded successfully!', 'success');
        }, 500);

    } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message || 'Upload failed. Please try again.', 'error');
        
        // Reset upload zone
        document.getElementById('upload-progress').style.display = 'none';
        document.getElementById('upload-zone').style.display = 'block';
    }
}

function displayFileInfo(data) {
    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = `
        <div class="file-info-item">
            <span class="file-info-label">Filename:</span>
            <span class="file-info-value">${data.filename}</span>
        </div>
        <div class="file-info-item">
            <span class="file-info-label">Rows:</span>
            <span class="file-info-value">${data.rows}</span>
        </div>
        <div class="file-info-item">
            <span class="file-info-label">Columns:</span>
            <span class="file-info-value">${data.cols}</span>
        </div>
        <div class="file-info-item">
            <span class="file-info-label">Teachers Found:</span>
            <span class="file-info-value">${data.teachers.length}</span>
        </div>
        <div class="file-info-item">
            <span class="file-info-label">Divisions:</span>
            <span class="file-info-value">${data.divisions.join(', ')}</span>
        </div>
    `;
}

// ============================================
// Filter Controls
// ============================================
function initializeFilters() {
    const viewTypeSelect = document.getElementById('view-type');
    const loadBtn = document.getElementById('load-schedule-btn');
    const clearSessionBtn = document.getElementById('clear-session-btn');

    viewTypeSelect.addEventListener('change', handleViewTypeChange);
    loadBtn.addEventListener('click', loadSchedule);
    clearSessionBtn?.addEventListener('click', clearSession);

    // Teacher select
    document.getElementById('teacher-select')?.addEventListener('change', validateFilters);
    
    // Division select
    document.getElementById('division-select')?.addEventListener('change', validateFilters);
    
    // Batch selects
    document.getElementById('batch-division-select')?.addEventListener('change', (e) => {
        populateBatchNames(e.target.value);
        validateFilters();
    });
    document.getElementById('batch-name-select')?.addEventListener('change', validateFilters);
}

function handleViewTypeChange(e) {
    const viewType = e.target.value;
    
    // Hide all filter groups
    document.getElementById('teacher-select-group').style.display = 'none';
    document.getElementById('division-select-group').style.display = 'none';
    document.getElementById('batch-select-group').style.display = 'none';
    document.getElementById('batch-name-group').style.display = 'none';

    // Show relevant filter group
    if (viewType === 'teacher') {
        document.getElementById('teacher-select-group').style.display = 'block';
        populateTeachers();
    } else if (viewType === 'division') {
        document.getElementById('division-select-group').style.display = 'block';
        populateDivisions();
    } else if (viewType === 'batch') {
        document.getElementById('batch-select-group').style.display = 'block';
        document.getElementById('batch-name-group').style.display = 'block';
        populateBatchDivisions();
    }

    validateFilters();
}

function validateFilters() {
    const viewType = document.getElementById('view-type').value;
    const loadBtn = document.getElementById('load-schedule-btn');
    let isValid = false;

    if (viewType === 'teacher') {
        isValid = document.getElementById('teacher-select').value !== '';
    } else if (viewType === 'division') {
        isValid = document.getElementById('division-select').value !== '';
    } else if (viewType === 'batch') {
        isValid = document.getElementById('batch-division-select').value !== '' &&
                  document.getElementById('batch-name-select').value !== '';
    }

    loadBtn.disabled = !isValid || !state.sessionId;
}

// ============================================
// Populate Dropdowns
// ============================================
async function populateTeachers() {
    if (!state.sessionId) return;

    try {
        const response = await fetch(`${API_BASE}/teachers/${state.sessionId}`);
        if (!response.ok) throw new Error('Failed to fetch teachers');

        const data = await response.json();
        const select = document.getElementById('teacher-select');
        
        select.innerHTML = '<option value="">Choose a teacher...</option>';
        data.teachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.code;
            option.textContent = `${teacher.display_name} (${teacher.code})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading teachers:', error);
        showToast('Failed to load teachers', 'error');
    }
}

function populateDivisions() {
    const select = document.getElementById('division-select');
    select.innerHTML = '<option value="">Choose a division...</option>';
    
    state.divisions.forEach(div => {
        const option = document.createElement('option');
        option.value = div;
        option.textContent = `Division ${div}`;
        select.appendChild(option);
    });
}

function populateBatchDivisions() {
    const select = document.getElementById('batch-division-select');
    select.innerHTML = '<option value="">Choose division...</option>';
    
    state.divisions.forEach(div => {
        const option = document.createElement('option');
        option.value = div;
        option.textContent = `Division ${div}`;
        select.appendChild(option);
    });
}

function populateBatchNames(division) {
    const select = document.getElementById('batch-name-select');
    select.innerHTML = '<option value="">Choose batch...</option>';
    
    if (!division) return;

    // Generate batch names (A1, A2, A3, etc.)
    for (let i = 1; i <= 3; i++) {
        const option = document.createElement('option');
        const batchName = `${division}${i}`;
        option.value = batchName;
        option.textContent = `Batch ${batchName}`;
        select.appendChild(option);
    }
}

// ============================================
// Load Schedule
// ============================================
async function loadSchedule() {
    if (!state.sessionId) {
        showToast('Please upload a timetable first', 'error');
        return;
    }

    const viewType = document.getElementById('view-type').value;
    let endpoint = '';
    let title = '';

    if (viewType === 'teacher') {
        const code = document.getElementById('teacher-select').value;
        endpoint = `${API_BASE}/timetable/teacher/${state.sessionId}/${code}`;
        const teacherName = document.getElementById('teacher-select').selectedOptions[0].textContent;
        title = teacherName;
    } else if (viewType === 'division') {
        const div = document.getElementById('division-select').value;
        endpoint = `${API_BASE}/timetable/division/${state.sessionId}/${div}`;
        title = `Division ${div}`;
    } else if (viewType === 'batch') {
        const div = document.getElementById('batch-division-select').value;
        const batch = document.getElementById('batch-name-select').value;
        endpoint = `${API_BASE}/timetable/batch/${state.sessionId}/${div}/${batch}`;
        title = `Batch ${batch}`;
    }

    showLoading(true);

    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Failed to load schedule');

        const data = await response.json();
        state.currentSchedule = data;
        
        renderTimetable(data, title);
        
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('timetable-container').style.display = 'block';
        
        showToast('Schedule loaded successfully', 'success');
    } catch (error) {
        console.error('Error loading schedule:', error);
        showToast('Failed to load schedule', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// Render Timetable
// ============================================
function renderTimetable(data, title) {
    document.getElementById('timetable-title').textContent = title;
    
    const table = document.getElementById('timetable');
    const days = data.fixed_days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const slots = data.slot_config || [];

    // Build header
    let html = '<thead><tr><th>Time</th>';
    days.forEach(day => {
        html += `<th>${getDayName(day)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Build rows
    slots.forEach(slot => {
        if (slot.type === 'break' || slot.type === 'lunch') {
            html += `<tr>`;
            html += `<td class="time-cell">${slot.label}</td>`;
            html += `<td colspan="${days.length}">`;
            html += `<div class="slot-content break">`;
            html += `<div class="slot-subject">${slot.label}</div>`;
            html += `</div></td></tr>`;
        } else {
            html += `<tr>`;
            html += `<td class="time-cell">${slot.label}</td>`;
            
            days.forEach(day => {
                const daySchedule = data.schedule[day];
                const slotEntries = daySchedule?.slots[slot.key] || [];
                
                html += `<td class="slot-cell">`;
                
                if (slotEntries.length === 0) {
                    html += `<div class="slot-content free">Free</div>`;
                } else {
                    slotEntries.forEach(entry => {
                        const type = entry.type || 'lec';
                        const span = entry.span || 1;
                        
                        html += `<div class="slot-content ${type}">`;
                        html += `<div class="slot-subject">${entry.subject || 'N/A'}</div>`;
                        
                        if (entry.faculty_codes && entry.faculty_codes.length > 0) {
                            const facultyNames = entry.faculty_codes
                                .map(code => state.facultyMap[code] || code)
                                .join(', ');
                            html += `<div class="slot-teacher"><i class="fas fa-user"></i> ${facultyNames}</div>`;
                        }
                        
                        if (entry.room) {
                            html += `<div class="slot-room"><i class="fas fa-door-open"></i> ${entry.room}</div>`;
                        }
                        
                        if (entry.class_div) {
                            html += `<div class="slot-room"><i class="fas fa-users"></i> ${entry.class_div}</div>`;
                        }
                        
                        if (span > 1) {
                            html += `<span class="slot-badge">${span}hr</span>`;
                        }
                        
                        html += `</div>`;
                    });
                }
                
                html += `</td>`;
            });
            
            html += `</tr>`;
        }
    });

    html += '</tbody>';
    table.innerHTML = html;
}

function getDayName(shortDay) {
    const dayMap = {
        'MON': 'Monday',
        'TUE': 'Tuesday',
        'WED': 'Wednesday',
        'THU': 'Thursday',
        'FRI': 'Friday',
        'SAT': 'Saturday',
        'SUN': 'Sunday'
    };
    return dayMap[shortDay] || shortDay;
}

// ============================================
// Export & Print
// ============================================
document.getElementById('export-btn')?.addEventListener('click', exportSchedule);
document.getElementById('print-btn')?.addEventListener('click', () => window.print());

function exportSchedule() {
    if (!state.currentSchedule) {
        showToast('No schedule to export', 'error');
        return;
    }

    const title = document.getElementById('timetable-title').textContent;
    const dataStr = JSON.stringify(state.currentSchedule, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_')}_schedule.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    showToast('Schedule exported successfully', 'success');
}

// ============================================
// Session Management
// ============================================
function checkExistingSession() {
    const sessionId = localStorage.getItem('timetable_session');
    if (sessionId) {
        state.sessionId = sessionId;
        document.getElementById('session-info')?.style.setProperty('display', 'flex');
        showToast('Previous session restored', 'info');
    }
}

async function clearSession() {
    if (!state.sessionId) return;

    try {
        await fetch(`${API_BASE}/session/${state.sessionId}`, {
            method: 'DELETE'
        });
        
        state.sessionId = null;
        state.teachers = [];
        state.currentSchedule = null;
        localStorage.removeItem('timetable_session');
        
        document.getElementById('session-info').style.display = 'none';
        document.getElementById('timetable-container').style.display = 'none';
        document.getElementById('empty-state').style.display = 'block';
        
        // Reset upload view
        document.getElementById('upload-success').style.display = 'none';
        document.getElementById('upload-zone').style.display = 'block';
        document.getElementById('file-input').value = '';
        
        showToast('Session cleared', 'success');
    } catch (error) {
        console.error('Error clearing session:', error);
        showToast('Failed to clear session', 'error');
    }
}

// ============================================
// Faculty Map
// ============================================
async function loadFacultyMap() {
    try {
        const response = await fetch(`${API_BASE}/faculty`);
        if (response.ok) {
            state.facultyMap = await response.json();
        }
    } catch (error) {
        console.error('Error loading faculty map:', error);
    }
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    const titles = {
        success: 'Success',
        error: 'Error',
        info: 'Info'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// Loading Overlay
// ============================================
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = show ? 'flex' : 'none';
}

// ============================================
// Utility Functions
// ============================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
