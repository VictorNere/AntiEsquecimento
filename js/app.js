import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONFIGURAÇÃO DO FIREBASE (SUBSTITUA AQUI) ---
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    databaseURL: "https://antiesquecimento-1f7f1-default-rtdb.firebaseio.com/", 
    projectId: "SEU_PROJETO_ID",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- DADOS PADRÃO ---
const defaultCategories = [
    { id: 'carro', name: 'Carro', icon: 'fa-car', items: [] },
    { id: 'saude', name: 'Saúde', icon: 'fa-heart-pulse', items: [] },
    { id: 'compras', name: 'Compras', icon: 'fa-cart-shopping', items: [] },
    { id: 'casa', name: 'Casa', icon: 'fa-house', items: [] },
    { id: 'trabalho', name: 'Trabalho', icon: 'fa-briefcase', items: [] },
    { id: 'igreja', name: 'Igreja', icon: 'fa-church', items: [] },
    { id: 'escola', name: 'Escola/Faculdade', icon: 'fa-graduation-cap', items: [] },
    { id: 'pagamento', name: 'Pagamento', icon: 'fa-credit-card', items: [] },
    { id: 'familia', name: 'Família', icon: 'fa-users', items: [] }
];

let appData = { userId: null, score: 0, categories: JSON.parse(JSON.stringify(defaultCategories)), completedItems: [] };
let currentCategoryId = null, editingItemIndex = null, pendingAction = null, statsChart = null;

// --- ELEMENTOS ---
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const detailView = document.getElementById('detail-view');
const statsView = document.getElementById('stats-view');
const userIdInput = document.getElementById('user-id-input');
const displayUserId = document.getElementById('display-user-id');
const userScoreDisplay = document.getElementById('user-score');
const gridContainer = document.getElementById('category-grid');
const itemsList = document.getElementById('items-list');
const categoryTitle = document.getElementById('category-title');
const completedList = document.getElementById('completed-list');
const itemModal = document.getElementById('item-form-modal');
const confirmModal = document.getElementById('confirm-modal');
const completedModal = document.getElementById('completed-modal');
const btnLogin = document.getElementById('btn-login');
const itemNameIn = document.getElementById('item-name');
const itemObsIn = document.getElementById('item-obs');

// --- SISTEMA DE SOM (WEB AUDIO API) ---
function playSuccessSound() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1); // C6

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
}

// --- SYNC ---
btnLogin.addEventListener('click', async () => {
    const id = userIdInput.value.trim();
    if(id) {
        btnLogin.innerText = "Buscando...";
        btnLogin.disabled = true;
        await loadUserData(id);
        btnLogin.innerText = "Acessar";
        btnLogin.disabled = false;
    } else { showToast("Digite um ID válido", "error"); }
});

document.getElementById('btn-create-id').addEventListener('click', () => {
    userIdInput.value = 'USR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
});

document.getElementById('btn-logout').addEventListener('click', () => location.reload());

async function loadUserData(id) {
    appData.userId = id;
    const dbRef = ref(db);
    try {
        const snapshot = await get(child(dbRef, `users/${id}`));
        if (snapshot.exists()) {
            const data = snapshot.val();
            appData.score = data.score || 0;
            appData.categories = mergeCategories(data.categories);
            appData.completedItems = data.completedItems || [];
            showToast("Sincronizado!", "success");
        } else {
            appData.score = 0;
            appData.categories = JSON.parse(JSON.stringify(defaultCategories));
            appData.completedItems = [];
            await saveData();
            showToast("Criado!", "success");
        }
        displayUserId.innerText = `ID: ${appData.userId}`;
        switchView(dashboardView);
        renderDashboard();
    } catch (error) { console.error(error); showToast("Erro conexão", "error"); }
}

async function saveData() {
    if (!appData.userId) return;
    try {
        await set(ref(db, 'users/' + appData.userId), {
            score: appData.score,
            categories: appData.categories,
            completedItems: appData.completedItems,
            lastUpdate: new Date().toISOString()
        });
    } catch (error) { console.error(error); }
}

function mergeCategories(savedCats) {
    let merged = JSON.parse(JSON.stringify(defaultCategories));
    if(!savedCats) return merged;
    savedCats.forEach(savedCat => {
        const index = merged.findIndex(c => c.id === savedCat.id);
        if(index !== -1) merged[index] = savedCat;
    });
    return merged;
}

// --- NAV ---
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    view.classList.remove('hidden'); view.classList.add('active');
}

document.getElementById('btn-back').onclick = () => { switchView(dashboardView); renderDashboard(); };
document.getElementById('btn-back-stats').onclick = () => { switchView(dashboardView); renderDashboard(); };

// --- ESTATÍSTICAS ---
document.getElementById('btn-view-stats').onclick = () => {
    switchView(statsView);
    renderStats();
};

function renderStats() {
    const completed = appData.completedItems || [];
    const today = new Date().toLocaleDateString();
    
    // Contadores
    document.getElementById('total-completed-count').innerText = completed.length;
    document.getElementById('today-completed-count').innerText = completed.filter(i => i.completedAt && i.completedAt.startsWith(today)).length;

    // Gráfico 7 dias
    const labels = [];
    const dataPoints = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString();
        labels.push(i === 0 ? 'Hoje' : dateStr.slice(0, 5)); // Ex: 10/12
        
        const count = completed.filter(item => item.completedAt && item.completedAt.startsWith(dateStr)).length;
        dataPoints.push(count);
    }

    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    if (statsChart) statsChart.destroy();

    statsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tarefas Concluídas',
                data: dataPoints,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { display: false }
                }
            }
        }
    });
}

// --- DASHBOARD ---
function renderDashboard() {
    gridContainer.innerHTML = '';
    userScoreDisplay.innerText = appData.score;
    
    const sortedCats = [...appData.categories].sort((a, b) => {
        const itemsA = a.items || [];
        const itemsB = b.items || [];
        const scoreA = itemsA.reduce((acc, i) => acc + i.urgency, 0);
        const scoreB = itemsB.reduce((acc, i) => acc + i.urgency, 0);
        return scoreB - scoreA;
    });

    sortedCats.forEach(cat => {
        const items = cat.items || [];
        const hasUrgent = items.some(i => i.urgency === 4);
        const counts = { 4:0, 3:0, 2:0, 1:0 };
        items.forEach(i => counts[i.urgency]++);

        const card = document.createElement('div');
        card.className = 'category-card';
        if(hasUrgent) card.classList.add('blink-urgent');
        card.onclick = () => openCategory(cat.id);

        let dotsHtml = '';
        [4,3,2,1].forEach(u => {
            for(let i=0; i < Math.min(counts[u], 5); i++) dotsHtml += `<div class="dot bg-u${u}"></div>`;
        });

        card.innerHTML = `<i class="fa-solid ${cat.icon} main-icon"></i><span class="category-name">${cat.name}</span><div class="urgency-dots">${dotsHtml}</div><span style="font-size: 0.7rem; color: #64748b; margin-top: 5px">${items.length} itens</span>`;
        gridContainer.appendChild(card);
    });
}

// --- ITENS ---
function openCategory(id) {
    currentCategoryId = id;
    const cat = appData.categories.find(c => c.id === id);
    if (!cat.items) cat.items = [];
    categoryTitle.innerText = cat.name;
    renderItems(cat);
    switchView(detailView);
}

function renderItems(cat) {
    itemsList.innerHTML = '';
    const items = cat.items || [];
    const sortedItems = items.map((item, idx) => ({...item, originalIdx: idx})).sort((a, b) => b.urgency - a.urgency);

    if (sortedItems.length === 0) {
        itemsList.innerHTML = `<div style="text-align:center; color:#64748b; margin-top:50px;"><i class="fa-regular fa-folder-open" style="font-size: 3rem; margin-bottom:10px;"></i><p>Nenhum item pendente.</p></div>`;
        return;
    }

    sortedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = `item-card u${item.urgency}`;
        const labels = {1:'Baixa', 2:'Média', 3:'Alta', 4:'Urgente'};
        const itemIcon = detectIcon(item.name);

        div.innerHTML = `
            <div class="item-icon"><i class="fa-solid ${itemIcon}"></i></div>
            <div class="item-info"><span class="item-name">${item.name} <span class="item-badge badge-u${item.urgency}">${labels[item.urgency]}</span></span><p class="item-obs">${item.obs || 'Sem observações'}</p></div>
            <div class="item-actions">
                <button class="action-btn btn-edit" onclick="prepEdit(${item.originalIdx})"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn btn-complete" onclick="prepComplete(${item.originalIdx})"><i class="fa-solid fa-check"></i></button>
                <button class="action-btn btn-delete" onclick="prepDelete(${item.originalIdx})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        itemsList.appendChild(div);
    });
}

// --- CRUD ---
document.getElementById('btn-add-item').onclick = () => openItemModal();
document.getElementById('btn-cancel').onclick = () => itemModal.classList.add('hidden');
document.getElementById('btn-save').onclick = saveItem;

function openItemModal(idx = null) {
    editingItemIndex = idx;
    const title = document.getElementById('modal-title');
    if (idx !== null) {
        const cat = appData.categories.find(c => c.id === currentCategoryId);
        const item = cat.items[idx];
        title.innerText = "Editar Item";
        itemNameIn.value = item.name;
        itemObsIn.value = item.obs;
        document.querySelector(`input[name="urgency"][value="${item.urgency}"]`).checked = true;
    } else {
        title.innerText = "Novo Item";
        itemNameIn.value = '';
        itemObsIn.value = '';
        document.querySelector(`input[name="urgency"][value="1"]`).checked = true;
    }
    itemModal.classList.remove('hidden');
}

async function saveItem() {
    const name = itemNameIn.value.trim();
    if (!name) return showToast("Digite um nome", "error");
    const urgency = parseInt(document.querySelector('input[name="urgency"]:checked').value);
    const obs = itemObsIn.value;
    const cat = appData.categories.find(c => c.id === currentCategoryId);
    if (!cat.items) cat.items = [];
    const itemData = { name, urgency, obs, date: new Date().toLocaleDateString() };

    if (editingItemIndex !== null) {
        cat.items[editingItemIndex] = itemData;
        showToast("Item atualizado", "success");
    } else {
        cat.items.push(itemData);
        showToast("Item criado", "success");
    }
    itemModal.classList.add('hidden');
    renderItems(cat);
    await saveData();
}

window.prepEdit = (idx) => openItemModal(idx);
window.prepDelete = (idx) => confirmAction(() => deleteItem(idx), "Deseja realmente excluir?", "danger");
window.prepComplete = (idx) => confirmAction(() => completeItem(idx), "Concluir tarefa? +1 Ponto!", "success");

async function deleteItem(idx) {
    const cat = appData.categories.find(c => c.id === currentCategoryId);
    cat.items.splice(idx, 1);
    renderItems(cat);
    showToast("Item removido", "success");
    await saveData();
}

async function completeItem(idx) {
    playSuccessSound(); // TOCAR SOM!
    const cat = appData.categories.find(c => c.id === currentCategoryId);
    const item = cat.items[idx];
    if(!appData.completedItems) appData.completedItems = [];
    appData.completedItems.unshift({ ...item, originalCategory: cat.id, completedAt: new Date().toLocaleDateString() }); // Armazena data simples
    cat.items.splice(idx, 1);
    appData.score += 1;
    renderItems(cat);
    showToast("Concluído! +1 Ponto", "success");
    await saveData();
}

// --- CONCLUIDOS ---
document.getElementById('btn-view-completed').onclick = () => { renderCompletedList(); completedModal.classList.remove('hidden'); };
document.getElementById('btn-close-completed').onclick = () => completedModal.classList.add('hidden');

function renderCompletedList() {
    completedList.innerHTML = '';
    const completed = appData.completedItems || [];
    if(completed.length === 0) { completedList.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nenhum item concluído.</p>'; return; }
    completed.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'item-card'; div.style.borderLeftColor = '#4ade80'; div.style.opacity = '0.8';
        div.innerHTML = `<div class="item-info"><span class="item-name" style="text-decoration: line-through">${item.name}</span><p class="item-obs">Em: ${item.completedAt}</p></div><div class="item-actions"><button class="action-btn" onclick="restoreItem(${idx})"><i class="fa-solid fa-arrow-rotate-left"></i></button><button class="action-btn btn-delete" onclick="deleteCompleted(${idx})"><i class="fa-solid fa-trash"></i></button></div>`;
        completedList.appendChild(div);
    });
}

window.restoreItem = async (idx) => {
    const item = appData.completedItems[idx];
    const cat = appData.categories.find(c => c.id === item.originalCategory);
    if(cat) {
        if(!cat.items) cat.items = [];
        cat.items.push({ name: item.name, urgency: item.urgency, obs: item.obs });
        appData.completedItems.splice(idx, 1);
        appData.score = Math.max(0, appData.score - 1);
        renderCompletedList(); renderDashboard(); showToast("Restaurado", "success"); await saveData();
    }
};

window.deleteCompleted = (idx) => {
    confirmAction(async () => {
        appData.completedItems.splice(idx, 1);
        renderCompletedList(); await saveData();
    }, "Excluir permanentemente?", "danger");
};

// --- UTIL ---
function confirmAction(actionFn, text, type = 'danger') {
    pendingAction = actionFn;
    document.getElementById('confirm-text').innerText = text;
    const iconContainer = document.getElementById('confirm-icon-container');
    const iconI = document.getElementById('confirm-icon-i');
    const btnConfirm = document.getElementById('btn-confirm-yes');
    iconContainer.className = 'confirm-icon'; iconI.className = 'fa-solid'; btnConfirm.className = '';
    if(type === 'success') { iconContainer.classList.add('icon-success'); iconI.classList.add('fa-check'); btnConfirm.classList.add('btn-success'); } 
    else { iconContainer.classList.add('icon-danger'); iconI.classList.add('fa-trash-can'); btnConfirm.classList.add('btn-danger'); }
    confirmModal.classList.remove('hidden');
}

document.getElementById('btn-confirm-yes').onclick = () => { if(pendingAction) pendingAction(); confirmModal.classList.add('hidden'); pendingAction = null; };
document.getElementById('btn-confirm-no').onclick = () => { confirmModal.classList.add('hidden'); pendingAction = null; };

function showToast(msg, type='default') {
    const toast = document.createElement('div'); toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.style.animation = 'fadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000);
}

function detectIcon(name) {
    const lower = name.toLowerCase();
    if (lower.includes('luz') || lower.includes('energia')) return 'fa-lightbulb';
    if (lower.includes('agua') || lower.includes('água')) return 'fa-faucet-drip';
    if (lower.includes('net') || lower.includes('internet')) return 'fa-wifi';
    if (lower.includes('gas') || lower.includes('gás')) return 'fa-fire-burner';
    if (lower.includes('cartao') || lower.includes('cartão')) return 'fa-credit-card';
    if (lower.includes('medico') || lower.includes('médico') || lower.includes('remedio')) return 'fa-notes-medical';
    if (lower.includes('pao') || lower.includes('pão') || lower.includes('mercado')) return 'fa-basket-shopping';
    return 'fa-circle-check'; 
}

// --- PWA ---
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js')); }