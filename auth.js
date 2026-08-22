import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de Firebase
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
const firebaseAuth = getAuth(app);
const db = getFirestore(app);

class AuthService {
  constructor() {
    this.STORAGE_KEY = 'user_session';
  }

  // Inicia sesión guardando el objeto del usuario en localStorage
  login(userData) {
    const sessionData = {
      id: userData.id,
      nombre: userData.nombre,
      email: userData.email,
      rol: userData.rol, // 'admin' o 'user'
      loggedAt: new Date().toISOString()
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
  }

  // Elimina la sesión local y cierra sesión en Firebase
  async logout() {
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      console.error("Error al cerrar sesión en Firebase:", error);
    } finally {
      localStorage.removeItem(this.STORAGE_KEY);
      window.location.href = 'login.html';
    }
  }

  // Obtiene la información del usuario autenticado
  getUser() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }

  // Verifica si hay algún usuario logueado
  isLoggedIn() {
    return this.getUser() !== null;
  }

  // Verifica si el usuario actual tiene rol de administrador
  isAdmin() {
    const user = this.getUser();
    return user !== null && user.rol === 'admin';
  }

  // Método para proteger rutas según el nivel de acceso requerido
  protectPage(requireAdmin = false) {
    const user = this.getUser();

    // 1. Si no está logueado, va directo al login
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    // 2. Si la página exige admin y el usuario no lo es, redirige al inicio
    if (requireAdmin && user.rol !== 'admin') {
      alert('Acceso restringido: Se requieren permisos de Administrador.');
      window.location.href = 'index.html';
    }
  }

  // Sincroniza el estado de autenticación en segundo plano con Firebase
  initAuthObserver() {
    onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        // Si el token expira o el usuario se elimina desde Firebase Console
        if (this.isLoggedIn()) {
          this.logout();
        }
      } else {
        // Actualización silenciosa de rol por si cambió en Firestore
        try {
          const userDocSnap = await getDoc(doc(db, "users", user.uid));
          if (userDocSnap.exists()) {
            const currentSession = this.getUser();
            const cloudData = userDocSnap.data();

            if (currentSession && (currentSession.rol !== cloudData.rol || currentSession.nombre !== cloudData.nombre)) {
              this.login({
                id: user.uid,
                nombre: cloudData.nombre || currentSession.nombre,
                email: user.email,
                rol: cloudData.rol || currentSession.rol
              });
              this.renderUI();
            }
          }
        } catch (e) {
          console.warn("No se pudo verificar la actualización del rol:", e);
        }
      }
    });
  }

  // Aplica cambios visuales a la interfaz dependiendo del rol
  renderUI() {
    const user = this.getUser();
    if (!user) return;

    // Mostrar el nombre del usuario activo
    const userDisplay = document.getElementById('user-name-display');
    if (userDisplay) {
      userDisplay.textContent = `${user.nombre} (${user.rol.toUpperCase()})`;
    }

    // Ocultar elementos exclusivos de administradores si no tiene el rol
    if (!this.isAdmin()) {
      const adminElements = document.querySelectorAll('.admin-only');
      adminElements.forEach((element) => {
        element.style.display = 'none';
      });
    }

    // Evento automático al botón de cerrar sesión si existe en el DOM
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = () => this.logout();
    }
  }
}

export const auth = new AuthService();