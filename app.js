import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, onSnapshot, doc, 
  addDoc, updateDoc, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth } from './auth.js';

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Previene que aparezca el banner automático predeterminado del navegador en algunos móviles
  e.preventDefault();
  deferredPrompt = e;

  // Muestra tu propio botón de instalación en la interfaz (ej. en el menú lateral o perfil)
  const installBtn = document.getElementById('btnInstallApp');
  if (installBtn) {
    installBtn.classList.remove('hidden');
    
    installBtn.addEventListener('click', async () => {
      installBtn.classList.add('hidden');
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('El usuario aceptó instalar la PWA');
      }
      deferredPrompt = null;
    });
  }
});

// Proteger la página y verificar sesión activa
auth.protectPage();

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCpRWeFvvxHd4TUFX8cZ8da6xg5OeXfX1g",
  authDomain: "inventario-pcad.firebaseapp.com",
  projectId: "inventario-pcad",
  storageBucket: "inventario-pcad.firebasestorage.app",
  messagingSenderId: "189422203709",
  appId: "1:189422203709:web:f129d0a5a051e8c1b34b54",
  measurementId: "G-9TKQ2CL2HN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado local de la aplicación
let tools = [];
let currentFilter = 'all';
let searchQuery = '';
let currentHistoryToolId = null;

// Elementos del DOM
const cloudStatus = document.getElementById('cloudStatus');
const tableBody = document.getElementById('toolsTableBody');
const searchInput = document.getElementById('searchInput');
const addForm = document.getElementById('addToolForm');

// Modal Prestar
const lendModal = document.getElementById('lendModal');
const lendForm = document.getElementById('lendForm');

// Modal Editar Stock
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');

// Modal Devolución
const returnModal = document.getElementById('returnModal');
const returnForm = document.getElementById('returnForm');

// Modal Historial
const historyModal = document.getElementById('historyModal');

// --- FUNCIONES GLOBALES DE CIERRE DE MODALES ---
window.closeLendModal = () => {
  if (lendModal) lendModal.classList.add('hidden');
};

window.closeEditModal = () => {
  if (editModal) editModal.classList.add('hidden');
};

window.closeReturnModal = () => {
  if (returnModal) returnModal.classList.add('hidden');
};

window.closeHistoryModal = () => {
  if (historyModal) {
    historyModal.classList.add('hidden');
    currentHistoryToolId = null;
  }
};

// --- INICIALIZACIÓN Y NAVEGACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar interfaz y observador de sesión
  auth.renderUI();
  auth.initAuthObserver();

  // Listener para el botón de cerrar sesión
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  }

  // Escuchar cambios en Firestore en tiempo real
  listenToInventory();

  // Eventos de Búsqueda
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTools();
    });
  }

  // Evento Categoria Personalizada
  const categorySelect = document.getElementById('newToolCategory');
  if (categorySelect) {
    categorySelect.addEventListener('change', toggleCustomCategory);
  }

  // Evento Registrar / Agregar Equipo
  if (addForm) {
    addForm.addEventListener('submit', handleAddTool);
  }

  // Eventos Modales
  setupModalListeners();
});

// Cambiar entre pestañas principales (Inventario / Agregar)
window.switchMainTab = (tab) => {
  const sectionInv = document.getElementById('section-inventory');
  const sectionAdd = document.getElementById('section-add');
  const navInv = document.getElementById('nav-inventory');
  const navAdd = document.getElementById('nav-add');

  if (tab === 'inventory') {
    sectionInv?.classList.remove('hidden');
    sectionAdd?.classList.add('hidden');
    if (navInv) navInv.className = "py-2 px-6 font-semibold text-sm border-b-2 border-amber-400 text-amber-400 transition-all flex items-center gap-2";
    if (navAdd) navAdd.className = "admin-only py-2 px-6 font-semibold text-sm text-slate-400 hover:text-slate-200 border-b-2 border-transparent transition-all flex items-center gap-2";
  } else if (tab === 'add' && auth.isAdmin()) {
    sectionInv?.classList.add('hidden');
    sectionAdd?.classList.remove('hidden');
    if (navInv) navInv.className = "py-2 px-6 font-semibold text-sm text-slate-400 hover:text-slate-200 border-b-2 border-transparent transition-all flex items-center gap-2";
    if (navAdd) navAdd.className = "admin-only py-2 px-6 font-semibold text-sm border-b-2 border-amber-400 text-amber-400 transition-all flex items-center gap-2";
  }
};

// Filtros rápidos (Todos, Disponibles, En Uso)
window.setFilter = (filter) => {
  currentFilter = filter;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.className = "tab-btn px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700";
  });
  
  const activeBtn = document.getElementById(`tab-${filter}`);
  if (activeBtn) {
    activeBtn.className = "tab-btn px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950";
  }
  renderTools();
};

function toggleCustomCategory() {
  const categorySelect = document.getElementById('newToolCategory');
  const customContainer = document.getElementById('customCategoryContainer');
  if (categorySelect && customContainer) {
    if (categorySelect.value === 'Otro tipo') {
      customContainer.classList.remove('hidden');
    } else {
      customContainer.classList.add('hidden');
    }
  }
}

// --- CONEXIÓN EN TIEMPO REAL CON FIRESTORE ---
function listenToInventory() {
  const toolsCollection = collection(db, "inventario");

  onSnapshot(toolsCollection, (snapshot) => {
    tools = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (cloudStatus) {
      cloudStatus.innerText = "☁️ Nube Conectada";
      cloudStatus.className = "text-xs px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800";
    }

    updateCounters();
    renderTools();

    // Si el modal de historial está abierto, refrescar sus datos en tiempo real
    if (historyModal && !historyModal.classList.contains('hidden') && currentHistoryToolId) {
      const updatedTool = tools.find(t => t.id === currentHistoryToolId);
      if (updatedTool) {
        renderHistoryContent(updatedTool);
      }
    }
  }, (error) => {
    console.error("Error al escuchar Firestore:", error);
    if (cloudStatus) {
      cloudStatus.innerText = "⚠️ Error de Conexión";
      cloudStatus.className = "text-xs px-3 py-1 rounded-full bg-red-950 text-red-400 border border-red-800";
    }
  });
}

// --- RENDERIZADO Y CONTADORES ---
function updateCounters() {
  const total = tools.length;
  const disponibles = tools.filter(t => (t.disponibles || 0) > 0).length;
  const enUso = tools.filter(t => (t.prestados || 0) > 0).length;

  const elAll = document.getElementById('count-all');
  const elDisp = document.getElementById('count-disponibles');
  const elUso = document.getElementById('count-enuso');

  if (elAll) elAll.innerText = total;
  if (elDisp) elDisp.innerText = disponibles;
  if (elUso) elUso.innerText = enUso;
}

function renderTools() {
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const filteredTools = tools.filter(tool => {
    const matchesSearch = 
      tool.nombre?.toLowerCase().includes(searchQuery) ||
      tool.serial?.toLowerCase().includes(searchQuery) ||
      tool.ubicacion?.toLowerCase().includes(searchQuery) ||
      tool.categoria?.toLowerCase().includes(searchQuery);

    if (currentFilter === 'Disponible') {
      return matchesSearch && (tool.disponibles || 0) > 0;
    }
    if (currentFilter === 'Prestado') {
      return matchesSearch && (tool.prestados || 0) > 0;
    }
    return matchesSearch;
  });

  if (filteredTools.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-500">
          No se encontraron equipos en el inventario.
        </td>
      </tr>
    `;
    return;
  }

  const isAdmin = auth.isAdmin();

  filteredTools.forEach(tool => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-800/40 transition";

    const statusBadge = tool.disponibles > 0 
      ? `<span class="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Disponible</span>`
      : `<span class="px-2.5 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Agotado / En Uso</span>`;

    tr.innerHTML = `
      <td class="p-4">
        <div class="font-bold text-slate-100">${tool.nombre}</div>
        <div class="text-xs text-slate-400">${tool.serial || 'S/N'}</div>
      </td>
      <td class="p-4">
        <div class="text-slate-200">${tool.categoria}</div>
        <div class="text-xs text-slate-400">${tool.ubicacion || 'Sin ubicación'}</div>
      </td>
      <td class="p-4 text-center font-semibold">
        <span class="text-amber-400">${tool.disponibles || 0}</span> / <span class="text-slate-400">${tool.cantidadTotal || 0}</span>
      </td>
      <td class="p-4">${statusBadge}</td>
      <td class="p-4 text-center">
        <div class="flex items-center justify-center gap-1.5">
          ${tool.disponibles > 0 ? `
            <button onclick="openLendModal('${tool.id}')" title="Prestar" class="p-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 rounded-lg transition text-xs font-medium">
              📤 Prestar
            </button>
          ` : ''}
          <button onclick="openHistoryModal('${tool.id}')" title="Historial" class="p-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg transition text-xs">
            📋 Movimientos
          </button>
          ${isAdmin ? `
            <button onclick="openEditModal('${tool.id}')" title="Editar Stock" class="p-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg transition text-xs">
              ✏️
            </button>
            <button onclick="deleteTool('${tool.id}')" title="Eliminar" class="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white rounded-lg transition text-xs">
              🗑️
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- CREAR Y MANTENER REGISTROS ---
async function handleAddTool(e) {
  e.preventDefault();
  if (!auth.isAdmin()) return alert('Acceso denegado');

  const nombreInput = document.getElementById('newToolName').value.trim();
  const cantidad = parseInt(document.getElementById('newToolQuantity').value) || 1;
  const serial = document.getElementById('newToolSerial').value.trim();
  const categorySelect = document.getElementById('newToolCategory').value;
  const customCategory = document.getElementById('newCustomCategory')?.value.trim();
  const condicion = document.getElementById('newToolCondition').value;
  const ubicacion = document.getElementById('newToolLocation').value.trim();

  const categoria = categorySelect === 'Otro tipo' ? (customCategory || 'General') : categorySelect;

  const existingTool = tools.find(t => t.nombre.toLowerCase() === nombreInput.toLowerCase());

  try {
    if (existingTool) {
      const toolRef = doc(db, "inventario", existingTool.id);
      await updateDoc(toolRef, {
        cantidadTotal: (existingTool.cantidadTotal || 0) + cantidad,
        disponibles: (existingTool.disponibles || 0) + cantidad
      });
      alert(`✅ Se sumaron ${cantidad} unidad(es) al equipo existente "${existingTool.nombre}".`);
    } else {
      await addDoc(collection(db, "inventario"), {
        nombre: nombreInput,
        cantidadTotal: cantidad,
        disponibles: cantidad,
        prestados: 0,
        serial: serial || 'S/N',
        categoria: categoria,
        condicion: condicion,
        ubicacion: ubicacion || 'Depósito Principal',
        prestamosActivos: [],
        historialDevueltos: [],
        createdAt: serverTimestamp()
      });
      alert('✅ Nuevo equipo guardado en inventario.');
    }

    addForm.reset();
    switchMainTab('inventory');
  } catch (error) {
    console.error("Error al guardar equipo:", error);
    alert('❌ Error al procesar la solicitud en Firestore.');
  }
}

window.deleteTool = async (id) => {
  if (!auth.isAdmin()) return;
  const tool = tools.find(t => t.id === id);
  if (!tool) return;

  if (confirm(`¿Está seguro de eliminar "${tool.nombre}" del inventario?`)) {
    try {
      await deleteDoc(doc(db, "inventario", id));
    } catch (error) {
      console.error("Error al eliminar equipo:", error);
    }
  }
};

// --- LOGICA DE PRESTAMOS Y DEVOLUCIONES ---
window.openLendModal = (id) => {
  const tool = tools.find(t => t.id === id);
  if (!tool || !lendModal) return;

  document.getElementById('lendToolId').value = tool.id;
  document.getElementById('lendToolName').innerText = tool.nombre;
  document.getElementById('lendAvailableStock').innerText = tool.disponibles;
  document.getElementById('lendQuantity').max = tool.disponibles;

  lendModal.classList.remove('hidden');
};

if (lendForm) {
  lendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('lendToolId').value;
    const qty = parseInt(document.getElementById('lendQuantity').value);
    const ci = document.getElementById('lendBorrowerCi').value.trim();
    const name = document.getElementById('lendBorrowerName').value.trim();
    const reason = document.getElementById('lendReason').value.trim();

    // 1. Obtenemos el usuario actual desde auth.js y extraemos su nombre
    const currentUser = auth.getUser();
    const nombreUsuario = currentUser ? currentUser.nombre : 'Usuario del Sistema';

    const tool = tools.find(t => t.id === id);
    if (!tool || qty > tool.disponibles) return alert('Cantidad no válida o stock insuficiente');

    const newLoan = {
      loanId: Date.now().toString(),
      cantidad: qty,
      cedula: ci,
      funcionario: name,                    // A quién se le presta físicamente
      registradoPor: nombreUsuario,         // 👈 Aquí se guarda el nombre exacto de tu usuario logueado
      fechaPrestamo: new Date().toLocaleString('es-VE')
    };

    const activos = tool.prestamosActivos || [];
    activos.push(newLoan);

    try {
      await updateDoc(doc(db, "inventario", id), {
        disponibles: tool.disponibles - qty,
        prestados: (tool.prestados || 0) + qty,
        prestamosActivos: activos
      });
      window.closeLendModal();
      lendForm.reset();
    } catch (error) {
      console.error("Error al procesar préstamo:", error);
      alert('❌ Error al registrar el préstamo.');
    }
  });
}

// --- LOGICA DE EDITAR STOCK (ADMIN) ---
window.openEditModal = (id) => {
  const tool = tools.find(t => t.id === id);
  if (!tool || !auth.isAdmin() || !editModal) return;

  document.getElementById('editToolId').value = tool.id;
  document.getElementById('editToolName').innerText = tool.nombre;
  document.getElementById('editCurrentTotal').innerText = tool.cantidadTotal;
  document.getElementById('editCurrentLoans').innerText = tool.prestados || 0;
  document.getElementById('editNewTotalQuantity').value = tool.cantidadTotal;

  editModal.classList.remove('hidden');
};

if (editForm) {
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editToolId').value;
    const newTotal = parseInt(document.getElementById('editNewTotalQuantity').value);

    const tool = tools.find(t => t.id === id);
    if (!tool) return;

    const prestados = tool.prestados || 0;
    if (newTotal < prestados) {
      return alert(`La nueva cantidad total no puede ser menor a los equipos actualmente en préstamo (${prestados}).`);
    }

    try {
      await updateDoc(doc(db, "inventario", id), {
        cantidadTotal: newTotal,
        disponibles: newTotal - prestados
      });
      window.closeEditModal();
    } catch (error) {
      console.error("Error al actualizar el stock:", error);
    }
  });
}

// --- HISTORIAL Y DEVOLUCIONES ---
window.openHistoryModal = (id) => {
  const tool = tools.find(t => t.id === id);
  if (!tool || !historyModal) return;

  currentHistoryToolId = id;
  const nameEl = document.getElementById('historyToolName');
  if (nameEl) nameEl.innerText = tool.nombre;

  renderHistoryContent(tool);
  historyModal.classList.remove('hidden');
};

function renderHistoryContent(tool) {
  const activeContainer = document.getElementById('history-content-active');
  const returnedContainer = document.getElementById('history-content-returned');

  const activos = tool.prestamosActivos || [];
  const devueltos = tool.historialDevueltos || [];

  const countActiveEl = document.getElementById('countHistoryActive');
  const countReturnedEl = document.getElementById('countHistoryReturned');

  if (countActiveEl) countActiveEl.innerText = activos.length;
  if (countReturnedEl) countReturnedEl.innerText = devueltos.length;

  const isAdmin = auth.isAdmin();

  if (activeContainer) {
    activeContainer.innerHTML = activos.length === 0 
      ? `<p class="text-xs text-slate-500 py-4 text-center">No hay préstamos activos para este equipo.</p>`
      : activos.map(p => `
        <div class="bg-slate-900 border border-slate-700/60 rounded-lg p-3 flex items-center justify-between gap-2">
          <div>
            <p class="font-bold text-sm text-slate-200">Receptor: ${p.funcionario} (${p.cedula})</p>
            <p class="text-xs text-amber-400">Cantidad: ${p.cantidad} unidad(es) | ${p.fechaPrestamo}</p>
            <p class="text-xs text-slate-400 mt-0.5">Registrado por: <span class="text-slate-300 font-medium">${p.registradoPor || 'Sistema'}</span></p>
            ${p.motivo ? `<p class="text-xs text-slate-400 mt-0.5">Motivo: ${p.motivo}</p>` : ''}
          </div>
          <button onclick="openReturnModalFromHistory('${tool.id}', '${p.loanId}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition shrink-0">
            📥 Devolver
          </button>
        </div>
      `).join('');
  }

  // Limpiamos botón previo en devueltos para evitar duplicados
  const existingClearReturnedBtn = document.getElementById('clearReturnedBtnAdmin');
  if (existingClearReturnedBtn) existingClearReturnedBtn.remove();

  if (returnedContainer) {
    let returnedHtml = devueltos.length === 0
      ? `<p class="text-xs text-slate-500 py-4 text-center">No se registran devoluciones históricas.</p>`
      : devueltos.map(d => `
        <div class="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
          <p class="font-semibold text-slate-300">${d.funcionario} (${d.cedula})</p>
          <p class="text-emerald-400">Devueltos: ${d.cantidad} unidad(es) el ${d.fechaDevolucion}</p>
          ${d.observaciones ? `<p class="text-slate-400">Observación: ${d.observaciones}</p>` : ''}
        </div>
      `).join('');

    // Si es admin y hay elementos devueltos, agregamos el botón de borrado al final de esta pestaña
if (isAdmin && devueltos.length > 0) {
      returnedHtml += `
        <div id="clearReturnedBtnAdmin" class="mt-4 pt-3 border-t border-slate-800 text-right">
          <button onclick="openSelectReturnModal('${tool.id}')" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ml-auto">
            🗑️ Administrar / Borrar Devoluciones
          </button>
        </div>
      `;
    }

    returnedContainer.innerHTML = returnedHtml;
  }
}

// Función especial para cerrar el historial y abrir la devolución simultáneamente
window.openReturnModalFromHistory = (toolId, loanId) => {
  window.closeHistoryModal(); // Cierra el historial primero
  window.openReturnModal(toolId, loanId); // Abre el modal de devolución
};

window.openReturnModal = (toolId, loanId) => {
  const tool = tools.find(t => t.id === toolId);
  if (!tool || !returnModal) return;

  const loan = (tool.prestamosActivos || []).find(l => l.loanId === loanId);
  if (!loan) return;

  document.getElementById('returnToolId').value = toolId;
  document.getElementById('returnLoanId').value = loanId;
  document.getElementById('returnToolName').innerText = tool.nombre;
  document.getElementById('returnBorrowerName').innerText = loan.funcionario;
  document.getElementById('returnBorrowerCi').innerText = loan.cedula;
  document.getElementById('maxReturnLabel').innerText = loan.cantidad;
  document.getElementById('returnQuantity').value = loan.cantidad;
  document.getElementById('returnQuantity').max = loan.cantidad;

  returnModal.classList.remove('hidden');
};

if (returnForm) {
  returnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const toolId = document.getElementById('returnToolId').value;
    const loanId = document.getElementById('returnLoanId').value;
    const qtyToReturn = parseInt(document.getElementById('returnQuantity').value);
    const obs = document.getElementById('returnReason').value.trim();

    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;

    let activos = tool.prestamosActivos || [];
    let devueltos = tool.historialDevueltos || [];
    const loanIndex = activos.findIndex(l => l.loanId === loanId);

    if (loanIndex === -1) return;

    const currentLoan = activos[loanIndex];
    if (qtyToReturn > currentLoan.cantidad) return alert('Cantidad excede la prestada.');

    devueltos.push({
      loanId: currentLoan.loanId,
      funcionario: currentLoan.funcionario,
      cedula: currentLoan.cedula,
      cantidad: qtyToReturn,
      fechaDevolucion: new Date().toLocaleString('es-VE'),
      observaciones: obs || 'Devuelto normalmente'
    });

    if (qtyToReturn === currentLoan.cantidad) {
      activos.splice(loanIndex, 1);
    } else {
      activos[loanIndex].cantidad -= qtyToReturn;
    }

    try {
      await updateDoc(doc(db, "inventario", toolId), {
        disponibles: tool.disponibles + qtyToReturn,
        prestados: tool.prestados - qtyToReturn,
        prestamosActivos: activos,
        historialDevueltos: devueltos
      });

      window.closeReturnModal();
      returnForm.reset();
    } catch (error) {
      console.error("Error al procesar devolución:", error);
    }
  });
}

// --- MANEJO DE EVENTOS EN MODALES ---
function setupModalListeners() {
  // Prestar
  document.getElementById('closeLendBtn')?.addEventListener('click', window.closeLendModal);
  document.getElementById('cancelLendBtn')?.addEventListener('click', window.closeLendModal);

  // Editar Stock
  document.getElementById('closeEditBtn')?.addEventListener('click', window.closeEditModal);
  document.getElementById('cancelEditBtn')?.addEventListener('click', window.closeEditModal);

  // Devolución
  document.getElementById('closeReturnBtn')?.addEventListener('click', window.closeReturnModal);
  document.getElementById('cancelReturnBtn')?.addEventListener('click', window.closeReturnModal);

  // Historial - Asignar eventos a todos los botones con clase o IDs para cerrar
  const closeHistoryBtns = document.querySelectorAll('.close-history-modal-btn');
  closeHistoryBtns.forEach(btn => {
    btn.addEventListener('click', window.closeHistoryModal);
  });

  document.getElementById('closeHistoryBtn')?.addEventListener('click', window.closeHistoryModal);
  document.getElementById('closeHistoryBtnFooter')?.addEventListener('click', window.closeHistoryModal);

  // Pestañas Historial
  const btnActive = document.getElementById('btn-tab-active');
  const btnReturned = document.getElementById('btn-tab-returned');
  const contentActive = document.getElementById('history-content-active');
  const contentReturned = document.getElementById('history-content-returned');

  btnActive?.addEventListener('click', () => {
    btnActive.className = "py-2 px-4 text-xs font-semibold border-b-2 border-amber-400 text-amber-400 transition-all flex items-center gap-1.5";
    if (btnReturned) btnReturned.className = "py-2 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5";
    contentActive?.classList.remove('hidden');
    contentReturned?.classList.add('hidden');
  });

  btnReturned?.addEventListener('click', () => {
    btnReturned.className = "py-2 px-4 text-xs font-semibold border-b-2 border-amber-400 text-amber-400 transition-all flex items-center gap-1.5";
    if (btnActive) btnActive.className = "py-2 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5";
    contentReturned?.classList.remove('hidden');
    contentActive?.classList.add('hidden');
  });
}

// --- FUNCIONES GLOBALES PARA GESTIONAR EL HISTORIAL DE DEVUELTOS ---

window.openSelectReturnModal = (toolId) => {
  if (!auth.isAdmin()) {
    alert('Acceso denegado. Se requiere cuenta de administrador.');
    return;
  }
  
  const tool = tools.find(t => t.id === toolId);
  if (!tool || !tool.historialDevueltos || tool.historialDevueltos.length === 0) {
    alert('No hay registros en el historial de devoluciones para este equipo.');
    return;
  }

  // Creamos la modal si no existe en el DOM
  let modal = document.getElementById('selectReturnModal');
  if (!modal) {
    const modalHTML = `
      <div id="selectReturnModal" class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-amber-400">Seleccionar Devoluciones a Eliminar</h3>
            <button onclick="window.closeSelectReturnModal()" class="text-slate-400 hover:text-white text-sm">✕</button>
          </div>
          <p class="text-xs text-slate-400 mb-4">Selecciona los registros que deseas remover del historial o usa la opción general.</p>
          
          <div id="selectReturnList" class="max-h-60 overflow-y-auto space-y-2 mb-4 pr-1">
            <!-- Dinámico -->
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-slate-800">
            <button onclick="window.toggleSelectAllReturns(true)" class="text-xs text-slate-300 hover:text-white underline">Seleccionar todos</button>
            <div class="flex gap-2">
              <button onclick="window.closeSelectReturnModal()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold">Cancelar</button>
              <button id="btnDeleteSelected" class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold">🗑️ Borrar Seleccionados</button>
              <button id="btnClearAllReturns" class="px-3 py-1.5 bg-red-950 text-red-400 border border-red-800 hover:bg-red-900 rounded-lg text-xs font-semibold">⚠️ Borrar Todo</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById('selectReturnModal');
  }

  // Rellenar lista con checkboxes
  const listContainer = document.getElementById('selectReturnList');
  listContainer.innerHTML = tool.historialDevueltos.map((d, index) => `
    <label class="flex items-start gap-3 p-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg cursor-pointer transition">
      <input type="checkbox" value="${index}" class="return-checkbox mt-1 accent-amber-500">
      <div class="text-xs">
        <p class="font-semibold text-slate-200">Funcionario: ${d.funcionario} (${d.cedula}) - ${d.cantidad} un.</p>
        <p class="text-slate-400">Fecha: ${d.fechaDevolucion}</p>
        ${d.observaciones ? `<p class="text-slate-500 italic">Obs: ${d.observaciones}</p>` : ''}
      </div>
    </label>
  `).join('');

  // Asignar eventos de los botones internos mediante addEventListener para evitar fallos de onclick en elementos dinámicos
  document.getElementById('btnDeleteSelected').onclick = () => window.deleteSelectedReturns(toolId);
  document.getElementById('btnClearAllReturns').onclick = () => window.clearAllReturnedHistory(toolId);

  // Mostrar modal
  modal.classList.remove('hidden');
};

window.closeSelectReturnModal = () => {
  const modal = document.getElementById('selectReturnModal');
  if (modal) modal.classList.add('hidden');
};

window.toggleSelectAllReturns = (select) => {
  document.querySelectorAll('.return-checkbox').forEach(cb => cb.checked = select);
};

window.deleteSelectedReturns = async (toolId) => {
  const checkboxes = document.querySelectorAll('.return-checkbox:checked');
  if (checkboxes.length === 0) {
    alert('Por favor, seleccione al menos un registro para eliminar.');
    return;
  }

  if (!confirm(`¿Desea eliminar del historial los ${checkboxes.length} registros seleccionados?`)) return;

  const tool = tools.find(t => t.id === toolId);
  if (!tool) return;

  const indicesToDrop = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const nuevoHistorial = tool.historialDevueltos.filter((_, idx) => !indicesToDrop.includes(idx));

  try {
    await updateDoc(doc(db, "inventario", toolId), {
      historialDevueltos: nuevoHistorial
    });
    alert('✅ Registros seleccionados eliminados correctamente.');
    window.closeSelectReturnModal();
  } catch (error) {
    console.error("Error al eliminar registros seleccionados:", error);
    alert('❌ Ocurrió un error al actualizar Firestore.');
  }
};

window.clearAllReturnedHistory = async (toolId) => {
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return;

  if (!confirm(`⚠️ ¿Está seguro de borrar TODO el historial de devoluciones de "${tool.nombre}"?`)) return;

  try {
    await updateDoc(doc(db, "inventario", toolId), {
      historialDevueltos: []
    });
    alert('✅ Historial de devoluciones vaciado por completo.');
    window.closeSelectReturnModal();
  } catch (error) {
    console.error("Error al vaciar historial:", error);
    alert('❌ Ocurrió un error al procesar la solicitud.');
  }
  // --- REGISTRO DE SERVICE WORKER PARA PWA ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
      .catch(err => console.log('Error al registrar Service Worker:', err));
  });
}

// --- CAPTURA DEL BOTÓN DE INSTALACIÓN ---
let deferredPrompt;
const installBtn = document.getElementById('btnInstallApp');

window.addEventListener('beforeinstallprompt', (e) => {
  // Evita que aparezca el banner automático del navegador
  e.preventDefault();
  deferredPrompt = e;
  
  // Muestra el botón si estaba oculto
  if (installBtn) installBtn.classList.remove('hidden');
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      alert('Tu navegador no permite la instalación automática o la app ya está instalada. Puedes usar el menú del navegador (los 3 puntos) y seleccionar "Instalar aplicación".');
      return;
    }
    
    installBtn.classList.add('hidden');
    deferredPrompt.prompt();
    
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('Usuario aceptó instalar la PWA');
    } else {
      console.log('Usuario canceló la instalación');
    }
    deferredPrompt = null;
  });
}
};
