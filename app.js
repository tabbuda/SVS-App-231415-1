let isPaymentProcessing = false;

// NEW BACKEND URL (Provided by User)
const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbwfqrUsdMsp1KO6sXnA7v6WALGypfz7ffjWxvyEHhgzqQqtBJivh-JRHfzfDqoB6MgarA/exec";
const ALL_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

// Load Session Config
let currentSessionConfig = JSON.parse(localStorage.getItem('active_session')) || {
    name: "Current Session",
    url: DEFAULT_URL,
    isReadOnly: false
};

let API_URL = currentSessionConfig.url;
let IS_READ_ONLY = currentSessionConfig.isReadOnly;

// Database State
let db = { students: [], feeStructure: [], settings: {}, transactions: [] };

// App State
let currentClass = "";
let currentStudent = null;
let lastTransaction = null;
let chartInstance = null;
let pieChartInstance = null;

// Multi-Select Payment State
let selectedFeeItems = new Set(); // Stores IDs or Names of selected items

// ================= 2. UTILITY FUNCTIONS =================

function safeParse(v) { return v ? parseFloat(String(v).replace(/,/g, '')) || 0 : 0; }

function formatDate(isoDate) {
    if (!isoDate) return "-";
    let d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function triggerHaptic() { if (navigator.vibrate) navigator.vibrate(30); }

// ================= 3. NAVIGATION & UI =================

// 🔴 3. UPDATE NAV CLICK
function handleNavClick() {
    triggerHaptic();
    if (document.getElementById('screenClasses').classList.contains('active-screen')) {
        toggleMenu();
    } else {
        history.back();
    }
}

function toggleMenu() {
    triggerHaptic();
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.style.display = 'none';
    } else {
        sidebar.classList.add('open');
        overlay.style.display = 'block';
    }
}

// 🔴 4. UPDATE NAVIGATE TO (HISTORY LOGIC ADDED)
function navigateTo(screenId, addToHistory = true) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    let screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active-screen');

    let icon = document.getElementById('menuIcon');
    let search = document.getElementById('searchContainer');
    let title = document.getElementById('headerTitle');
    let syncBtn = document.getElementById('syncBtn');

    // Reset Floating Button
    hideFloatingButton();

    if (screenId === 'screenClasses') {
        icon.className = "fa-solid fa-bars";
        search.style.display = 'none';
        title.innerText = db.settings.School_Name || "Dashboard";
        syncBtn.style.display = 'flex';
    } else {
        icon.className = "fa-solid fa-arrow-left";
        syncBtn.style.display = 'none'; // Hide Sync on inner pages

        if (screenId === 'screenList') {
            search.style.display = 'block';
            title.innerText = "Class " + currentClass;
        } else if (screenId === 'screenWallet') {
            search.style.display = 'none';
            title.innerText = "Analytics & Wallet";
            loadWalletData();
        } else if (screenId === 'screenProfile') {
            search.style.display = 'none';
            title.innerText = "Student Profile";
        } else if (screenId === 'screenForm') {
            search.style.display = 'none';
            // Title already set
        } else {
            search.style.display = 'none';
        }
    }
    window.scrollTo(0, 0);

    // 🟢 IMPORTANT: Browser History me add karein
    if (addToHistory) {
        history.pushState({ screen: screenId }, screenId, "#" + screenId);
    }
}

function goBack() {
    if (document.getElementById('screenProfile').classList.contains('active-screen')) {
        navigateTo('screenList');
    } else if (document.getElementById('screenForm').classList.contains('active-screen')) {
        if (document.getElementById('editRollNo').value) navigateTo('screenProfile');
        else navigateTo('screenClasses');
    } else {
        navigateTo('screenClasses');
    }
}

function checkTheme() {
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
}

function toggleDarkMode() {
    triggerHaptic();
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    if (document.getElementById('screenWallet').classList.contains('active-screen')) loadWalletData();
}

// ================= 4. AUTH & INIT =================
// ================= 4. AUTH & INIT =================

window.onload = function () {
    // 🔴 1. यह नई लाइन है (History Set करने के लिए)
    history.replaceState({ screen: 'screenClasses' }, 'Home', '#home');

    loadLocalData();
    checkTheme();

    // Inject Styles for Checkboxes & Floating Button
    injectDynamicStyles();

    if (IS_READ_ONLY) {
        document.head.insertAdjacentHTML("beforeend", `<style>.edit-btn-card, .discount-link, #waiverSection, .btn-primary, .checkbox-container { display: none !important; }</style>`);
    }

    if (localStorage.getItem('isLoggedIn') === 'true') {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        showMainApp();
    }

    if (navigator.onLine) syncData(false);
};


// ================= HISTORY HANDLING (MOBILE BACK BUTTON FIX) =================

// 🔴 2. BACK BUTTON HANDLER (MOBILE FIX)
window.addEventListener('popstate', function (event) {
    // अगर कोई Modal खुला है तो उसे बंद करें
    if (document.getElementById('itemModal').classList.contains('open')) {
        closeItemModal();
        history.pushState(null, null, location.href); // State push wapas karein taaki app band na ho
        return;
    }
    if (document.getElementById('sessionModal').classList.contains('open')) {
        closeSessionModal();
        history.pushState(null, null, location.href);
        return;
    }
    if (document.getElementById('sidebar').classList.contains('open')) {
        toggleMenu();
        history.pushState(null, null, location.href);
        return;
    }

    // अगर स्क्रीन हिस्ट्री है, तो उस स्क्रीन पर जाएं
    if (event.state && event.state.screen) {
        navigateTo(event.state.screen, false); // false = history me add mat karo
    } else {
        // अगर होम पर हैं और फिर भी back दबाया, तो शायद user app band karna chahta hai
        // Lekin safety ke liye Home par hi rakhein
        navigateTo('screenClasses', false);
    }
});

function injectDynamicStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Custom Checkbox */
        .fee-checkbox {
            width: 22px; height: 22px; margin-right: 15px; accent-color: var(--primary);
            cursor: pointer; transform: scale(1.2);
        }
        /* Floating Action Button (FAB) */
        #fabPayContainer {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px);
            background: var(--text); color: white; padding: 15px 25px; border-radius: 50px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 15px;
            z-index: 1000; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            width: 90%; max-width: 350px; justify-content: space-between;
        }
        #fabPayContainer.visible { transform: translateX(-50%) translateY(0); }
        .fab-amount { font-size: 18px; font-weight: 700; }
        .fab-btn { background: var(--green); color: white; border: none; padding: 8px 20px; border-radius: 20px; font-weight: 700; cursor: pointer; }
        
        /* Dashboard Stats */
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .stat-box { background: var(--card-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--border); text-align: center; }
        .stat-val { font-size: 20px; font-weight: 700; margin-top: 5px; color: var(--primary); }
        .stat-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; }
    `;
    document.head.appendChild(style);

    // Create FAB Element
    const fab = document.createElement('div');
    fab.id = "fabPayContainer";
    fab.innerHTML = `
        <div style="display:flex; flex-direction:column">
            <span style="font-size:10px; opacity:0.8">TOTAL SELECTED</span>
            <span class="fab-amount" id="fabTotal">₹0</span>
        </div>
        <button class="fab-btn" onclick="openMultiItemPayment()">PAY NOW <i class="fa-solid fa-angle-right"></i></button>
    `;
    document.body.appendChild(fab);
}

function handleLogin() {
    triggerHaptic();
    let pin = document.getElementById('pinInput').value;
    if (pin.length < 4) return Swal.fire('Error', 'Enter 4 Digit PIN', 'warning');

    if (!navigator.onLine && localStorage.getItem('isLoggedIn') !== 'true') {
        return Swal.fire('Offline', 'Internet required for first Login', 'error');
    }

    document.getElementById('loadingText').style.display = 'block';

    fetch(API_URL + `?action=login&pin=${pin}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('isLoggedIn', 'true');
                showMainApp();
                syncData(true);
            } else {
                Swal.fire('Error', 'Wrong PIN', 'error');
            }
            document.getElementById('loadingText').style.display = 'none';
        })
        .catch(err => {
            document.getElementById('loadingText').style.display = 'none';
            if (localStorage.getItem('isLoggedIn') === 'true') showMainApp();
            else Swal.fire('Connection Error', 'Check Internet', 'error');
        });
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    loadLocalData();
    renderClassGrid();
}

function handleLogout() {
    triggerHaptic();
    localStorage.removeItem('isLoggedIn');
    location.reload();
}

// ================= 5. SYNC (OPTIMIZED) =================

function loadLocalData() {
    let raw = localStorage.getItem('schoolDB');
    if (raw) {
        db = JSON.parse(raw);
        if (db.settings && db.settings.School_Name) {
            document.getElementById('schoolNameDisplay').innerText = db.settings.School_Name;
            document.getElementById('headerTitle').innerText = db.settings.School_Name;
        }
    }
}

function updateStatus(status) {
    const btn = document.getElementById('syncBtn');
    if (!btn) return;
    if (status === 'online') {
        btn.className = 'nav-icon online';
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i>';
    } else if (status === 'offline') {
        btn.className = 'nav-icon offline';
        btn.innerHTML = '<i class="fa-solid fa-wifi-strong"></i>';
    } else if (status === 'syncing') {
        btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin-fast"></i>';
    }
}

async function syncData(isManual = false) {
    if (isManual) {
        triggerHaptic();
        Swal.fire({ title: 'Syncing...', didOpen: () => Swal.showLoading(), toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        updateStatus('syncing');
    }

    try {
        // CHANGE HERE: Agar Manual Sync hai to 'force=true' bhejo
        let url = API_URL + "?action=getAllData";
        if (isManual) url += "&force=true";

        let res = await fetch(url);
        let data = await res.json();

        if (data.status === 'success') {
            db = data;
            localStorage.setItem('schoolDB', JSON.stringify(db));

            // UI Refresh
            if (document.getElementById('screenClasses').classList.contains('active-screen')) renderClassGrid();
            if (document.getElementById('screenProfile').classList.contains('active-screen') && currentStudent) {
                let sID = currentStudent.RollNo || currentStudent.AdmNo;
                let updatedStd = db.students.find(s => (s.RollNo == sID || s.AdmNo == sID));
                if (updatedStd) loadProfile(updatedStd);
            }

            if (!IS_READ_ONLY) await processOfflineQueue();
            updateStatus('online');
            if (isManual) Swal.fire({ icon: 'success', title: 'Data Updated', toast: true, position: 'top', timer: 1500, showConfirmButton: false });
        }
    } catch (e) {
        updateStatus('offline');
        if (isManual) Swal.fire('Offline', 'Using Local Data', 'info');
    }
}

async function processOfflineQueue() {
    let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
    if (q.length === 0) return;
    updateStatus('syncing');
    let newQ = [];
    for (let item of q) {
        try {
            let response = await fetch(API_URL, {
                method: 'POST', body: JSON.stringify(item), redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
            let result = await response.json();
            if (result.status === 'success') {
                if (item.action === 'submitFee') lastTransaction = item;
            } else newQ.push(item);
        } catch (e) { newQ.push(item); }
    }
    localStorage.setItem('offlineQ', JSON.stringify(newQ));
    if (newQ.length === 0) { updateStatus('online'); syncData(false); }
    else updateStatus('offline');
}

// ================= 6. DASHBOARD & LISTS =================

function renderClassGrid() {
    let classes = [...new Set(db.feeStructure.map(f => f.Class))];
    const grid = document.getElementById('classGrid');
    grid.innerHTML = "";
    classes.forEach(cls => {
        let count = db.students.filter(s => s.Class == cls).length;
        let div = document.createElement('div');
        div.className = 'class-card';
        div.innerHTML = `<h3>${cls}</h3><p style="opacity:0.6; font-size:12px;">${count} Students</p>`;
        div.onclick = () => { triggerHaptic(); currentClass = cls; renderStudentList(cls); navigateTo('screenList'); };
        grid.appendChild(div);
    });
}

function renderStudentList(cls) {
    const list = db.students.filter(s => s.Class == cls);
    const container = document.getElementById('studentListContainer');
    container.innerHTML = "";
    if (list.length === 0) container.innerHTML = "<div style='text-align:center; padding:20px; opacity:0.6'>No Students Found</div>";

    list.forEach(std => {
        let displayID = std.RollNo || std.AdmNo || "N/A";
        let div = document.createElement('div');
        div.className = 'student-card';
        div.innerHTML = `
            <div style="display:flex; align-items:center;">
                <div class="avatar">${std.Name.charAt(0)}</div>
                <div><div style="font-weight:600;">${std.Name}</div><div style="font-size:12px; opacity:0.7;">${displayID} | F: ${std.FatherName}</div></div>
            </div>`;
        div.onclick = () => { triggerHaptic(); loadProfile(std); };
        container.appendChild(div);
    });
}

function filterList() {
    let query = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.student-card').forEach(c => {
        c.style.display = c.innerText.toLowerCase().includes(query) ? 'flex' : 'none';
    });
}

// ================= 7. PROFILE & FEE LOGIC (PREMIUM) =================

function loadProfile(student) {
    currentStudent = student;
    let sID = student.RollNo || student.AdmNo || "N/A";

    navigateTo('screenProfile');
    document.getElementById('pName').innerText = student.Name;
    document.getElementById('pDetails').innerText = `${student.FatherName} | ${student.Phone}`;
    document.getElementById('pClass').innerText = student.Class;
    document.getElementById('pRoll').innerText = "ID: " + sID;

    // Clear previous selection
    selectedFeeItems.clear();
    hideFloatingButton();

    // Filter Transactions
    let allTrans = db.transactions.filter(t => t.RollNo == sID || t.AdmNo == sID);
    let report = generateFeeReport(student, allTrans);
    document.getElementById('pTotalDue').innerText = "₹" + report.totalDue.toLocaleString('en-IN');

    renderCategorizedFees(report.items);
    switchTab('fees');
}

function generateFeeReport(student, transactions) {
    const rules = db.feeStructure.find(f => f.Class == student.Class);
    if (!rules) return { totalDue: 0, items: [] };

    // 1. Calculate Total Paid (Includes Local Offline Data)
    let totalCash = safeParse(student.TotalPaid || 0);
    let sID = student.RollNo || student.AdmNo;

    if (!IS_READ_ONLY) {
        let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
        q.forEach(x => {
            let tID = x.admNo || x.data?.RollNo;
            if (tID == sID && x.action == 'submitFee') {
                totalCash += safeParse(x.amount) + safeParse(x.discount);
            }
        });
    }

    let remainingMoney = totalCash;
    let items = [];

    // Helper to Create Item
    function addItem(id, name, amount, section, meta = {}) {
        let cost = safeParse(amount);
        let status = 'Unpaid', paidAmt = 0, dueAmt = cost;

        // Waterfall Logic ONLY for status calculation, not for payment enforcement
        if (cost === 0) { status = 'Paid'; dueAmt = 0; }
        else if (remainingMoney >= cost) {
            status = 'Paid'; paidAmt = cost; dueAmt = 0; remainingMoney -= cost;
        }
        else if (remainingMoney > 0) {
            status = 'Partial'; paidAmt = remainingMoney; dueAmt = cost - remainingMoney; remainingMoney = 0;
        }

        items.push({ id, name, amount: cost, section, status, due: dueAmt, paid: paidAmt, ...meta });
    }

    // 2. Generate All Fee Heads
    if (safeParse(student.OldDues) > 0) addItem("old_dues", "Old Dues", student.OldDues, "Arrears");
    addItem("adm_fee", "Admission Fee", rules.AdmnFee_Yearly, "Annual Fees");
    addItem("maint_fee", "Maintenance Fee", rules.MaintFee_Yearly, "Annual Fees");

    let e1 = parseInt(db.settings.Exam1_Month) || 9;
    let e2 = parseInt(db.settings.Exam2_Month) || 12;
    let e3 = parseInt(db.settings.Exam3_Month) || 3;

    // Transport Logic
    let vanStopIndex = 11;
    if (student.VanStopAfter === 'None') vanStopIndex = -1;
    else if (student.VanStopAfter && student.VanStopAfter !== 'Full') {
        let idx = ALL_MONTHS.indexOf(student.VanStopAfter);
        if (idx !== -1) vanStopIndex = idx;
    }

    ALL_MONTHS.forEach((m, i) => {
        let calMonth = i < 9 ? (i + 4) : (i - 8);
        let fee = safeParse(rules.Tuition_Monthly);
        if (i <= vanStopIndex) fee += safeParse(student.VanFee_Monthly);

        addItem(`fee_${m}`, `${m} Fee`, fee, "Monthly Fees", { monthIndex: i });

        if (calMonth === e1) addItem(`exam_1`, "Quarterly Exam", rules.Exam1_Fee, "Exam Fees");
        if (calMonth === e2) addItem(`exam_2`, "Half Yearly Exam", rules.Exam2_Fee, "Exam Fees");
        if (calMonth === e3) addItem(`exam_3`, "Annual Exam", rules.Exam3_Fee, "Exam Fees");
    });

    if (remainingMoney > 0) {
        items.push({ id: "credit", name: "Wallet Balance", amount: remainingMoney, section: "Advance Credit", status: "Credit", due: 0, paid: remainingMoney });
    }

    return { totalDue: items.reduce((s, i) => s + i.due, 0), items };
}

function renderCategorizedFees(items) {
    const container = document.getElementById('feeLists');
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; opacity:0.5;"><i class="fa-solid fa-folder-open" style="font-size:40px;"></i><br>No Fees Due</div>`;
        return;
    }

    let lastSection = "";

    items.forEach((item, index) => {
        if (item.section !== lastSection) {
            container.innerHTML += `<div class="category-header">${item.section}</div>`;
            lastSection = item.section;
        }

        let div = document.createElement('div');
        div.className = `modern-fee-card ${item.status.toLowerCase()}`;
        if (item.status === 'Credit') { div.style.borderLeft = "4px solid #00b894"; div.style.background = "#e3fcef"; }

        // Icon Logic
        let iconClass = 'fa-file-invoice-dollar';
        if (item.name.toLowerCase().includes('van')) iconClass = 'fa-bus';
        if (item.name.toLowerCase().includes('exam')) iconClass = 'fa-book-open';

        // Checkbox Logic (New Feature)
        let leftContent = "";
        if (item.status === 'Paid' || item.status === 'Credit') {
            leftContent = `<div class="fee-icon-circle"><i class="fa-solid fa-check"></i></div>`;
        } else {
            // Checkbox for Unpaid/Partial
            leftContent = `<input type="checkbox" class="fee-checkbox" 
                data-amount="${item.due}" 
                data-name="${item.name}" 
                id="chk_${index}" 
                onchange="handleFeeSelection(this)">`;
        }

        let statusHtml = "";
        if (item.status === 'Paid') statusHtml = '<span style="color:var(--green); font-weight:bold; font-size:12px">PAID</span>';
        else if (item.status === 'Partial') statusHtml = `<span style="color:#e67e22; font-weight:bold; font-size:12px">BAL: ₹${item.due}</span>`;
        else statusHtml = `<span style="color:var(--red); font-weight:bold; font-size:12px">₹${item.due}</span>`;

        div.innerHTML = `
            <div style="display:flex; align-items:center;">
                ${leftContent}
                <div class="fee-info">
                    <div class="fee-title">${item.name}</div>
                    <div class="fee-sub">${item.status === 'Partial' ? `Paid: ₹${item.paid}` : (item.status === 'Credit' ? 'Surplus' : 'Due Now')}</div>
                </div>
            </div>
            <div>${statusHtml}</div>
        `;

        // Click on card to toggle checkbox (UX)
        if (item.status !== 'Paid' && item.status !== 'Credit') {
            div.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    let chk = div.querySelector('input[type="checkbox"]');
                    chk.checked = !chk.checked;
                    handleFeeSelection(chk);
                }
            };
        }

        container.appendChild(div);
    });
}

// ================= 8. MULTI-SELECT PAYMENT (NEW) =================

function handleFeeSelection(checkbox) {
    if (IS_READ_ONLY) return;

    let amount = parseFloat(checkbox.dataset.amount);
    let name = checkbox.dataset.name;

    if (checkbox.checked) {
        selectedFeeItems.add({ name, amount });
    } else {
        // Remove object from set based on name
        selectedFeeItems.forEach(i => { if (i.name === name) selectedFeeItems.delete(i); });
    }

    updateFloatingButton();
}

function updateFloatingButton() {
    let total = 0;
    selectedFeeItems.forEach(i => total += i.amount);

    const fab = document.getElementById('fabPayContainer');
    document.getElementById('fabTotal').innerText = "₹" + total.toLocaleString('en-IN');

    if (total > 0) fab.classList.add('visible');
    else fab.classList.remove('visible');
}

function hideFloatingButton() {
    document.getElementById('fabPayContainer').classList.remove('visible');
}

function openMultiItemPayment() {
    triggerHaptic();
    let total = 0;
    let names = [];
    selectedFeeItems.forEach(i => { total += i.amount; names.push(i.name); });

    if (total === 0) return;

    // Setup Modal
    let displayName = names.length > 1 ? `Multiple (${names.length} Items)` : names[0];
    if (names.length > 3) displayName = `${names[0]}, ${names[1]} +${names.length - 2} more`;

    selectedFeeItem = { name: displayName, due: total, fullList: names.join(", ") };

    document.getElementById('bdHeadName').innerText = displayName;
    document.getElementById('bdTotal').innerText = "₹" + total;
    document.getElementById('payAmount').value = total;
    document.getElementById('finalPayable').innerText = "₹" + total;
    document.getElementById('waiverSection').style.display = 'none';
    document.getElementById('waiverInput').value = "";

    document.getElementById('modalOverlay').style.display = 'block';
    setTimeout(() => document.getElementById('itemModal').classList.add('open'), 10);
}

// ================= 9. PAYMENT SUBMISSION =================

function closeItemModal() {
    document.getElementById('itemModal').classList.remove('open');
    setTimeout(() => document.getElementById('modalOverlay').style.display = 'none', 300);
}

function toggleWaiver() {
    let sec = document.getElementById('waiverSection');
    if (sec.style.display === 'none') { sec.style.display = 'block'; document.getElementById('waiverInput').focus(); }
    else { sec.style.display = 'none'; document.getElementById('waiverInput').value = ""; calculateFinalTotal(); }
}

function calculateFinalTotal() {
    let due = selectedFeeItem ? selectedFeeItem.due : 0;
    let waiver = safeParse(document.getElementById('waiverInput').value);
    if (waiver > due) { waiver = due; document.getElementById('waiverInput').value = due; }
    document.getElementById('finalPayable').innerText = "₹" + (due - waiver);
    document.getElementById('payAmount').value = due - waiver;
}

function submitItemPayment() {
    // 1. अगर पहले से प्रोसेस चल रहा है या Read Only है, तो रुक जाओ (STOP DOUBLE TAP)
    if (isPaymentProcessing || IS_READ_ONLY) return;

    let payInput = document.getElementById('payAmount');
    let waiverInput = document.getElementById('waiverInput');
    let btn = document.querySelector('#itemModal .btn-primary'); // बटन को ढूंढें

    let amt = safeParse(payInput.value);
    let waiver = safeParse(waiverInput.value);

    // Validation
    if (amt <= 0 && waiver <= 0) return Swal.fire('Error', 'Invalid Amount', 'warning');

    // 2. प्रोसेसिंग शुरू: फ्लैग सेट करें और बटन का हुलिया बदलें
    isPaymentProcessing = true;
    let originalBtnText = btn.innerHTML;
    btn.innerHTML = `<i class="fa fa-circle-notch fa-spin"></i> Processing...`;
    btn.style.opacity = "0.7";
    btn.style.pointerEvents = "none"; // क्लिक बंद

    // Modal बंद करें
    closeItemModal();

    // डेटा तैयार करें
    let today = new Date().toISOString().split('T')[0];
    let feeHeadName = selectedFeeItem.fullList || selectedFeeItem.name;
    let sID = currentStudent.RollNo || currentStudent.AdmNo;

    let payload = {
        action: 'submitFee',
        date: today,
        admNo: sID,
        studentName: currentStudent.Name,
        feeHead: feeHeadName,
        amount: amt,
        discount: waiver,
        collectedBy: 'Admin'
    };

    // 3. Queue में डालें
    let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
    q.push(payload);
    localStorage.setItem('offlineQ', JSON.stringify(q));
    lastTransaction = payload;

    // --- MAIN FIX FOR "JUMPING STATUS" ---
    // हम यहाँ currentStudent.TotalPaid को मैन्युअली नहीं बढ़ाएंगे।
    // generateFeeReport अपने आप (पुराना Total + Offline Queue) जोड़ लेगा।
    // इससे "Double Counting" नहीं होगी।

    // UI रिफ्रेश करें
    loadProfile(currentStudent);

    // Success Modal दिखाएं
    document.getElementById('successModalOverlay').style.display = 'block';
    document.getElementById('successModal').style.display = 'block';
    document.getElementById('successMsg').innerText = `Received ₹${amt}`;

    // Selection साफ़ करें
    selectedFeeItems.clear();
    hideFloatingButton();

    // सर्वर को भेजने की कोशिश करें
    processOfflineQueue();

    // 4. प्रोसेसिंग खत्म: बटन को वापस नार्मल करें (थोड़ी देर बाद, ताकि गलती से भी क्लिक न हो)
    setTimeout(() => {
        isPaymentProcessing = false;
        if (btn) {
            btn.innerHTML = originalBtnText; // पुराना टेक्स्ट वापस (CONFIRM & COLLECT CASH)
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
        }
    }, 1000);
}

function closeSuccessModal() {
    document.getElementById('successModalOverlay').style.display = 'none';
    document.getElementById('successModal').style.display = 'none';
}

function sendWhatsApp() {
    if (!lastTransaction) return Swal.fire('Error', 'No Transaction Found', 'error');
    let receiptId = lastTransaction.receiptId || "PENDING";
    let dateStr = new Date().toLocaleDateString('en-GB');
    let schoolName = db.settings.School_Name || 'SCHOOL ADMIN';

    let msg = `*${schoolName}*` +
        `%0A━━━━━━━━━━━━━━━━━━` +
        `%0A                    *PAYMENT RECEIPT*` +
        `%0A` +
        `%0A                    *Student:* ${currentStudent.Name}` +
        `%0A                    *Roll No:* ${currentStudent.RollNo || currentStudent.AdmNo}` +
        `%0A` +
        `%0A                    *Amount Paid:* ₹${lastTransaction.amount}` +
        `%0A                    *Fees:* ${lastTransaction.feeHead}` +
        (lastTransaction.discount > 0 ? `%0A                    *Waiver:* ₹${lastTransaction.discount}` : ``) +
        `%0A` +
        `%0A                    *Date:* ${dateStr}` +
        `%0A━━━━━━━━━━━━━━━━━━` +
        `%0A           _Payment Successfully Received_`;

    let phone = "91" + currentStudent.Phone;
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// ================= 10. ANALYTICS & WALLET (PHASE 2 UPGRADE) =================

function loadWalletData() {
    let today = new Date().toISOString().split('T')[0];
    let allTrans = [...db.transactions];

    // Merge Offline Data
    let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
    q.forEach(x => { if (x.action === 'submitFee') allTrans.push({ Date: x.date, AmountPaid: x.amount, StudentName: x.studentName }); });

    let todayTotal = 0, todayCount = 0;
    let historyHtml = "";

    // Sort Descending
    allTrans.sort((a, b) => new Date(b.Date) - new Date(a.Date));

    // Stats
    let totalCollection = 0;
    allTrans.forEach(t => {
        let amt = safeParse(t.AmountPaid);
        totalCollection += amt;
        let d = t.Date ? t.Date.substring(0, 10) : "";
        if (d === today) { todayTotal += amt; todayCount++; }
    });

    // Recent 15
    allTrans.slice(0, 15).forEach(t => {
        historyHtml += `
            <div class="student-card" style="padding:10px;">
                <div>
                    <div style="font-weight:600">₹${t.AmountPaid}</div>
                    <div style="font-size:10px; color:#888">${formatDate(t.Date)}</div>
                </div>
                <div style="font-size:12px; text-align:right">${t.StudentName || 'Fee'}<br>
                <span style="font-size:9px; color:var(--text-sec)">${t.ReceiptNo || 'Pending'}</span></div>
            </div>`;
    });

    // Render Stats
    document.getElementById('dailyTotalAmount').innerText = "₹" + todayTotal.toLocaleString('en-IN');
    document.getElementById('dailyCount').innerText = todayCount + " Today";
    document.getElementById('walletHistoryList').innerHTML = historyHtml;

    // Render Additional Stats
    let walletCard = document.querySelector('.wallet-card');
    if (!document.getElementById('extraStats')) {
        let statsDiv = document.createElement('div');
        statsDiv.id = "extraStats";
        statsDiv.className = "stat-grid mt-20";
        statsDiv.innerHTML = `
            <div class="stat-box">
                <i class="fa-solid fa-users" style="color:var(--primary)"></i>
                <div class="stat-val">${db.students.length}</div>
                <div class="stat-label">Students</div>
            </div>
            <div class="stat-box">
                <i class="fa-solid fa-sack-dollar" style="color:var(--green)"></i>
                <div class="stat-val">₹${(totalCollection / 100000).toFixed(2)}L</div>
                <div class="stat-label">Total Rev</div>
            </div>
        `;
        walletCard.after(statsDiv);
    }

    initChart(allTrans);
}

function initChart(transactions) {
    const ctx = document.getElementById('collectionChart').getContext('2d');

    // 1. Last 7 Days Collection
    let labels = [], data = [];
    for (let i = 6; i >= 0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let ds = d.toISOString().split('T')[0];
        labels.push(d.getDate() + '/' + (d.getMonth() + 1));
        let sum = transactions.filter(t => (t.Date || "").startsWith(ds)).reduce((a, b) => a + safeParse(b.AmountPaid), 0);
        data.push(sum);
    }

    if (chartInstance) chartInstance.destroy();

    let color = document.body.classList.contains('dark-mode') ? '#fff' : '#00b894';

    chartInstance = new Chart(ctx, {
        type: 'bar', // Changed to Bar for better visual
        data: {
            labels: labels,
            datasets: [{
                label: 'Collection',
                data: data,
                backgroundColor: 'rgba(0, 184, 148, 0.5)',
                borderColor: color,
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });
}

// ================= 11. FORM & MISC (STANDARD) =================

// ================= 11. FORM & MISC (UPDATED WITH OLD DUES) =================

function openAdmissionForm() {
    if (IS_READ_ONLY) return Swal.fire('Restricted', 'Read Only Mode', 'error');
    navigateTo('screenForm');

    document.getElementById('formTitle').innerText = "New Admission";
    document.getElementById('editRollNo').value = "";

    // Clear Fields
    document.getElementById('inpName').value = "";
    document.getElementById('inpFather').value = "";
    document.getElementById('inpPhone').value = "";
    document.getElementById('inpVan').value = "";
    document.getElementById('inpVanStop').value = "Full";
    document.getElementById('inpAdm').value = "";
    document.getElementById('inpOldDue').value = ""; // Default Empty
    document.getElementById('inpAdm').placeholder = "Select Class first...";

    // Populate Class Dropdown
    let clsSelect = document.getElementById('inpClass');
    clsSelect.innerHTML = "<option value='' disabled selected>Select Class</option>";
    let uniqueClasses = [...new Set(db.feeStructure.map(f => f.Class))];
    uniqueClasses.forEach(c => {
        let opt = document.createElement('option'); opt.value = c; opt.innerText = c; clsSelect.appendChild(opt);
    });

    clsSelect.onchange = function () {
        document.getElementById('inpAdm').value = generateAutoRollNo(this.value);
    };
}

function openEditForm() {
    if (IS_READ_ONLY) return Swal.fire('Restricted', 'Read Only Mode', 'error');
    if (!currentStudent) return;
    openAdmissionForm(); // Setup basic form

    let sID = currentStudent.RollNo || currentStudent.AdmNo;
    document.getElementById('formTitle').innerText = "Edit Profile";
    document.getElementById('editRollNo').value = sID;

    // Fill Data
    document.getElementById('inpName').value = currentStudent.Name;
    document.getElementById('inpFather').value = currentStudent.FatherName;
    document.getElementById('inpClass').value = currentStudent.Class;
    document.getElementById('inpPhone').value = currentStudent.Phone;
    document.getElementById('inpAdm').value = sID;

    // Fill Financials
    document.getElementById('inpVan').value = currentStudent.VanFee_Monthly;
    document.getElementById('inpVanStop').value = currentStudent.VanStopAfter || "Full";
    document.getElementById('inpOldDue').value = currentStudent.OldDues || 0; // Show Old Dues
}

function saveStudent() {
    if (IS_READ_ONLY) return;

    let isEdit = document.getElementById('editRollNo').value !== "";

    // Collect Data
    let data = {
        RollNo: document.getElementById('inpAdm').value.toUpperCase(),
        Name: document.getElementById('inpName').value.trim(),
        FatherName: document.getElementById('inpFather').value.trim(),
        Class: document.getElementById('inpClass').value,
        Phone: document.getElementById('inpPhone').value,
        VanFee_Monthly: document.getElementById('inpVan').value || 0,
        VanStopAfter: document.getElementById('inpVanStop').value,
        OldDues: document.getElementById('inpOldDue').value || 0, // NEW FIELD
        Status: 'Active'
    };

    // Validation
    if (!data.Name || !data.RollNo || !data.Class) {
        return Swal.fire('Missing Data', 'Please fill Name, Class & ID', 'warning');
    }

    if (isEdit) {
        // Find Index
        let idx = db.students.findIndex(s => (s.RollNo == data.RollNo || s.AdmNo == data.RollNo));
        if (idx !== -1) {
            // Preserve Paid Data
            data.TotalPaid = db.students[idx].TotalPaid;
            db.students[idx] = data;
        }
    } else {
        // Check Duplicate
        if (db.students.find(s => (s.RollNo == data.RollNo || s.AdmNo == data.RollNo))) {
            return Swal.fire('Error', 'Student ID already exists!', 'error');
        }
        data.TotalPaid = 0;
        db.students.push(data);
    }

    // Save & Sync
    localStorage.setItem('schoolDB', JSON.stringify(db));

    let payload = { action: isEdit ? 'updateStudent' : 'addStudent', data: data };
    let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
    q.push(payload);
    localStorage.setItem('offlineQ', JSON.stringify(q));

    Swal.fire({ icon: 'success', title: 'Saved Successfully', timer: 1200, showConfirmButton: false });
    processOfflineQueue();

    if (isEdit) {
        loadProfile(data); // Refresh Profile
    } else {
        renderClassGrid();
        goBack();
    }
}

function generateAutoRollNo(className) {
    if (!className) return "";
    let prefix = (className.match(/^\d+/) ? className.match(/^\d+/)[0] : className.charAt(0)) + "C";
    let max = 0;
    db.students.forEach(s => {
        let sID = s.RollNo || s.AdmNo || "";
        if (sID.startsWith(prefix)) {
            let num = parseInt(sID.replace(prefix, ''));
            if (!isNaN(num) && num > max) max = num;
        }
    });
    return prefix + String(max + 1).padStart(3, '0');
}

function switchTab(tab) {
    triggerHaptic();
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + (tab === 'fees' ? 'Fees' : 'History')).classList.add('active');
    document.getElementById('contentFees').style.display = tab === 'fees' ? 'block' : 'none';
    document.getElementById('contentHistory').style.display = tab === 'history' ? 'block' : 'none';
    if (tab === 'history') renderHistory();
}

function renderHistory() {
    let h = document.getElementById('historyList');
    h.innerHTML = "";
    let sID = currentStudent.RollNo || currentStudent.AdmNo;
    let txs = db.transactions.filter(t => t.RollNo == sID || t.AdmNo == sID);

    // Merge Offline
    let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
    q.forEach(x => {
        if ((x.admNo == sID || (x.data && x.data.RollNo == sID)) && x.action == 'submitFee')
            txs.push({ Date: x.date, AmountPaid: x.amount, Waiver: x.discount, ReceiptNo: 'Pending' });
    });

    txs.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    if (txs.length === 0) h.innerHTML = "<div style='text-align:center; padding:20px; color:#888;'>No History</div>";

    txs.forEach(t => {
        let waiverHtml = (t.Waiver || t.Discount) > 0 ? `<div style="font-size:11px; color:#d35400;">Waiver: ₹${t.Waiver || t.Discount}</div>` : '';
        h.innerHTML += `
            <div class="student-card">
                <div><div style="font-weight:600;">₹${t.AmountPaid}</div><div style="font-size:10px; color:#888;">${formatDate(t.Date)}</div></div>
                <div style="text-align:right;"><div style="font-size:12px; color:var(--green);"><i class="fa-solid fa-check-circle"></i> Paid</div>${waiverHtml}</div>
            </div>`;
    });
}

// =========================================================
// PREMIUM PDF GENERATOR (REPLACEMENT FUNCTION)
// =========================================================

// =========================================================
// PREMIUM PDF GENERATOR (FINAL FIX - 100% VISIBLE DATA)
// =========================================================

function downloadStatement() {
    if (!currentStudent) return;

    // Import jsPDF methods
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // --- 1. CONFIG & COLORS ---
    const primaryColor = [44, 62, 80];    // Dark Blue
    const grayColor = [241, 242, 246];    // Light Gray

    let schoolName = (db.settings.School_Name || "SCHOOL ADMIN").toUpperCase();
    let session = db.settings.Current_Session || "Current Session";
    let sID = currentStudent.RollNo || currentStudent.AdmNo;

    // --- 2. HEADER SECTION ---
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, 'F');

    // School Name
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(schoolName, 105, 18, { align: 'center' });

    // Subtitles
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`ACADEMIC SESSION: ${session}`, 105, 28, { align: 'center' });
    doc.text("FEE STATEMENT & PAYMENT RECORD", 105, 34, { align: 'center' });

    // --- 3. STUDENT INFO BOX ---
    doc.setDrawColor(200);
    doc.setFillColor(...grayColor);
    doc.roundedRect(14, 48, 182, 30, 3, 3, 'FD');

    doc.setTextColor(44, 62, 80);
    doc.setFontSize(10);

    // Left Column
    doc.setFont("helvetica", "bold");
    doc.text("STUDENT NAME:", 20, 58);
    doc.text("FATHER'S NAME:", 20, 66);
    doc.text("CONTACT NO:", 20, 74);

    doc.setFont("helvetica", "normal");
    doc.text(currentStudent.Name.toUpperCase(), 60, 58);
    doc.text(currentStudent.FatherName.toUpperCase(), 60, 66);
    doc.text(currentStudent.Phone, 60, 74);

    // Right Column
    doc.setFont("helvetica", "bold");
    doc.text("ADMISSION NO:", 120, 58);
    doc.text("CLASS / SEC:", 120, 66);
    doc.text("GENERATED ON:", 120, 74);

    doc.setFont("helvetica", "normal");
    doc.text(String(sID), 155, 58);
    doc.text(currentStudent.Class, 155, 66);
    doc.text(new Date().toLocaleDateString('en-GB'), 155, 74);

    // --- 4. DATA COLLECTION & NORMALIZATION (THE FIX) ---

    // Get Raw Transactions
    let rawTrans = db.transactions.filter(t => t.RollNo == sID || t.AdmNo == sID);

    // Merge Offline Data
    if (!IS_READ_ONLY) {
        let q = JSON.parse(localStorage.getItem('offlineQ') || "[]");
        q.forEach(x => {
            let tID = x.admNo || x.data?.RollNo;
            if (tID == sID && x.action == 'submitFee') {
                rawTrans.push({
                    Date: x.date, AmountPaid: x.amount, Waiver: x.discount,
                    ReceiptNo: 'PENDING', feeHead: x.feeHead
                });
            }
        });
    }

    // *** CRITICAL STEP: NORMALIZE DATA ***
    // This ensures that no matter what the Sheet Header is, we get the data.
    let standardizedTrans = rawTrans.map(t => {
        return {
            date: t.Date || t.date || t['Date'] || new Date().toISOString(),
            receipt: t.ReceiptNo || t['Receipt No'] || t['Receipt_No'] || t.receiptId || 'PENDING',
            head: t.feeHead || t.FeeHead || t['Fee Head'] || t['Fee_Head'] || 'General Fee',
            amount: parseFloat(t.AmountPaid || t.amount || t['Amount Paid'] || 0),
            waiver: parseFloat(t.Waiver || t.Discount || t.discount || t.waiver || 0)
        };
    });

    // Sort Chronologically (Oldest First for Calculation)
    standardizedTrans.sort((a, b) => new Date(a.date) - new Date(b.date));

    // --- 5. MAIN TABLE LOGIC (Smart Date Mapping) ---

    // Use original report logic but mapped to standard trans
    // We recreate a simplified 'allTrans' for the helper function to understand
    let reportTransHelper = standardizedTrans.map(t => ({
        Date: t.date, AmountPaid: t.amount, Waiver: t.waiver, feeHead: t.head
    }));

    let report = generateFeeReport(currentStudent, reportTransHelper);
    let currentFeeStartMoney = 0;

    let rows = report.items.map(i => {
        let status = i.status;
        let finalDate = "-";

        let itemCost = i.amount;
        let amountPaidForThisItem = i.paid;

        if (amountPaidForThisItem > 0 || status === 'Paid') {
            let moneyNeeded = currentFeeStartMoney + amountPaidForThisItem;
            let moneyAccumulated = 0;

            for (let t of standardizedTrans) {
                let val = t.amount + t.waiver;
                moneyAccumulated += val;

                if (moneyAccumulated > currentFeeStartMoney) {
                    finalDate = formatDate(t.date);
                }
                if (moneyAccumulated >= moneyNeeded) break;
            }
        }

        currentFeeStartMoney += itemCost;

        if (status === 'Credit') return [i.name, 'On Account', '', '', 'CR ' + i.amount];
        if (status === 'Partial') status = `Partial (Pd: ${i.paid})`;
        let dueDisplay = i.due > 0 ? `${i.due}` : "-";

        return [
            i.name,
            finalDate,
            { content: i.amount, styles: { halign: 'right' } },
            status,
            { content: dueDisplay, styles: { halign: 'right', fontStyle: 'bold' } }
        ];
    });

    // Add Totals Row
    rows.push([
        { content: 'TOTAL OUTSTANDING DUE', colSpan: 4, styles: { halign: 'right', fillColor: [255, 234, 234], textColor: [200, 50, 50], fontStyle: 'bold' } },
        { content: `Rs. ${report.totalDue}`, styles: { halign: 'right', fillColor: [255, 234, 234], textColor: [200, 50, 50], fontStyle: 'bold' } }
    ]);

    // RENDER MAIN TABLE
    doc.autoTable({
        startY: 85,
        head: [['FEE HEAD', 'LAST PAYMENT', 'AMOUNT (Rs)', 'STATUS', 'BALANCE (Rs)']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 9, cellPadding: 3, textColor: 50, halign: 'center' },
        columnStyles: {
            0: { cellWidth: 60, halign: 'left' },
            2: { halign: 'right' },
            4: { halign: 'right' }
        },
        alternateRowStyles: { fillColor: [248, 249, 250] }
    });

    // --- 6. HISTORY TABLE (FIXED VISIBILITY) ---

    let finalY = doc.lastAutoTable.finalY + 15;
    if (finalY > 250) { doc.addPage(); finalY = 20; }

    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryColor);
    doc.text("RECENT TRANSACTION LOG", 14, finalY);
    doc.setLineWidth(0.5); doc.line(14, finalY + 2, 80, finalY + 2);

    // Sort Newest First for Display
    standardizedTrans.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Map Standardized Data to Table Rows (Safe Access)
    let histRows = standardizedTrans.map(t => [
        formatDate(t.date),   // Using standardized 'date'
        t.receipt,            // Using standardized 'receipt'
        t.head,               // Using standardized 'head'
        { content: t.amount, styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 150, 50] } },
        { content: t.waiver || '-', styles: { halign: 'right' } }
    ]);

    if (histRows.length > 0) {
        doc.autoTable({
            startY: finalY + 7,
            head: [['DATE', 'RECEIPT NO', 'DESCRIPTION', 'PAID (Rs)', 'WAIVER']],
            body: histRows,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            styles: { fontSize: 8, textColor: 80 },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
        });
    } else {
        doc.setFontSize(10); doc.setFont("helvetica", "italic"); doc.setTextColor(150);
        doc.text("No payment history found.", 14, finalY + 10);
    }

    // --- 7. FOOTER ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        let h = doc.internal.pageSize.height;

        doc.setDrawColor(200); doc.line(10, h - 25, 200, h - 25);
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(0);
        doc.text("Authorized Signatory", 170, h - 15, { align: 'center' });

        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
        doc.text("Computer generated fee statement.", 105, h - 10, { align: 'center' });
    }

    doc.save(`${currentStudent.Name}_FeeStatement.pdf`);
}

// =========================================================
// PREMIUM SESSION MANAGER LOGIC
// =========================================================

function openSessionManager() {
    document.getElementById('sessionOverlay').style.display = 'block';
    setTimeout(() => document.getElementById('sessionModal').classList.add('open'), 10);
    toggleAddSessionView(false); // Reset to list view
    renderSessionList();
}

function closeSessionModal() {
    document.getElementById('sessionModal').classList.remove('open');
    setTimeout(() => document.getElementById('sessionOverlay').style.display = 'none', 300);
}

function toggleAddSessionView(showForm) {
    let listView = document.getElementById('sessionListView');
    let formView = document.getElementById('addSessionForm');

    if (showForm) {
        listView.style.display = 'none';
        formView.style.display = 'block';
        document.getElementById('newSessionName').focus();
    } else {
        listView.style.display = 'block';
        formView.style.display = 'none';
    }
}

function renderSessionList() {
    // Get Data
    let sessions = JSON.parse(localStorage.getItem('all_sessions')) || [];
    let currentActive = JSON.parse(localStorage.getItem('active_session')) || { name: "Default", url: DEFAULT_URL };

    // Safety: Ensure at least default exists
    let hasDefault = sessions.some(s => s.url === DEFAULT_URL);
    if (!hasDefault) {
        sessions.unshift({ name: "Default Session", url: DEFAULT_URL, isReadOnly: false });
        localStorage.setItem('all_sessions', JSON.stringify(sessions));
    }

    let list = document.getElementById('sessionList');
    list.innerHTML = "";

    sessions.forEach((s, index) => {
        let isActive = (s.url === currentActive.url && s.name === currentActive.name);

        // Badge Logic
        let badge = isActive
            ? '<span class="badge-live"><i class="fa-solid fa-circle" style="font-size:6px; vertical-align:middle"></i> LIVE</span>'
            : (s.isReadOnly ? '<span class="badge-archive">ARCHIVE</span>' : '');

        // Delete Button Logic (Don't delete active or default)
        let isDefault = (s.url === DEFAULT_URL);
        let deleteBtn = (!isActive && !isDefault)
            ? `<button class="btn-delete" onclick="deleteSession(${index})"><i class="fa-solid fa-trash"></i></button>`
            : '';

        let switchBtn = !isActive
            ? `<button class="btn-switch" onclick="verifyConnectionAndSwitch(${index})">Switch</button>`
            : `<i class="fa-solid fa-circle-check" style="color:var(--green); font-size:20px; margin-right:5px;"></i>`;

        let div = document.createElement('div');
        div.className = `session-card ${isActive ? 'active-session' : ''}`;

        div.innerHTML = `
            <div class="session-info">
                <h4>${s.name}</h4>
                <div class="session-meta">
                    ${badge}
                    ${isDefault ? '<span style="font-size:9px; opacity:0.6">(Primary)</span>' : ''}
                </div>
            </div>
            <div class="session-actions">
                ${switchBtn}
                ${deleteBtn}
            </div>
        `;
        list.appendChild(div);
    });
}

function addNewSession() {
    triggerHaptic();
    let name = document.getElementById('newSessionName').value.trim();
    let url = document.getElementById('newSessionUrl').value.trim();
    let isReadOnly = document.getElementById('isReadOnlyCheck').checked;

    if (!name) return Swal.fire('Error', 'Enter Session Name', 'warning');
    if (!url || !url.startsWith('http')) return Swal.fire('Error', 'Invalid Script URL', 'warning');

    let sessions = JSON.parse(localStorage.getItem('all_sessions')) || [];

    // Check Duplicate
    if (sessions.some(s => s.name === name)) return Swal.fire('Error', 'Name already exists', 'warning');

    sessions.push({ name, url, isReadOnly });
    localStorage.setItem('all_sessions', JSON.stringify(sessions));

    Swal.fire({ icon: 'success', title: 'Database Connected', timer: 1000, showConfirmButton: false });

    document.getElementById('newSessionName').value = "";
    document.getElementById('newSessionUrl').value = "";
    toggleAddSessionView(false);
    renderSessionList();
}

function deleteSession(index) {
    triggerHaptic();
    Swal.fire({
        title: 'Delete Session?',
        text: "You will lose this connection link.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff7675',
        confirmButtonText: 'Yes, Delete'
    }).then((result) => {
        if (result.isConfirmed) {
            let sessions = JSON.parse(localStorage.getItem('all_sessions'));
            sessions.splice(index, 1);
            localStorage.setItem('all_sessions', JSON.stringify(sessions));
            renderSessionList();
        }
    });
}

async function verifyConnectionAndSwitch(index) {
    triggerHaptic();
    closeSessionModal();

    let sessions = JSON.parse(localStorage.getItem('all_sessions'));
    let selected = sessions[index];

    Swal.fire({
        title: 'Connecting...',
        text: `Switching to ${selected.name}`,
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        // Verify URL is valid by fetching data
        let res = await fetch(selected.url + "?action=getAllData");
        let data = await res.json();

        if (data.status === 'success') {
            localStorage.setItem('active_session', JSON.stringify(selected));
            localStorage.removeItem('schoolDB'); // Clear old data
            location.reload(); // Reload to fetch new data
        } else {
            throw new Error("Invalid Response");
        }
    } catch (e) {
        Swal.fire('Connection Failed', 'Could not connect to this database URL.', 'error');
        openSessionManager(); // Re-open modal if failed
    }
}
