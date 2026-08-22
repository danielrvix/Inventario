import { auth as customAuth } from './auth.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

if (customAuth.isLoggedIn()) {
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');

  const registerModal = document.getElementById('registerModal');
  const openRegisterBtn = document.getElementById('openRegisterBtn');
  const closeRegisterBtn = document.getElementById('closeRegisterBtn');

  // Control del Modal de Registro
  if (openRegisterBtn && registerModal) {
    openRegisterBtn.addEventListener('click', () => registerModal.classList.remove('hidden'));
  }

  if (closeRegisterBtn && registerModal) {
    closeRegisterBtn.addEventListener('click', () => {
      registerModal.classList.add('hidden');
      if (registerError) registerError.classList.add('hidden');
    });
  }

  // 1. Lógica de Inicio de Sesión
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();
      const submitBtn = document.getElementById('loginSubmitBtn');

      if (loginError) {
        loginError.classList.add('hidden');
        loginError.innerText = '';
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = 'Verificando datos...';
        }

        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        const user = userCredential.user;

        let userRole = 'user'; 
        let userDisplayName = user.displayName || user.email.split('@')[0];

        try {
          const userDocSnap = await getDoc(doc(db, "usuarios", user.uid));
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.rol) userRole = userData.rol;
            if (userData.nombre) userDisplayName = userData.nombre;
          }
        } catch (dbError) {
          console.warn("No se pudo obtener el rol desde Firestore:", dbError);
        }

        customAuth.login({
          id: user.uid,
          nombre: userDisplayName,
          email: user.email,
          rol: userRole
        });

        window.location.href = 'index.html';

      } catch (error) {
        console.error("Error al autenticar:", error.code, error.message);
        let msg = '❌ Correo o contraseña incorrectos.';
        if (error.code === 'auth/too-many-requests') {
          msg = '⚠️ Demasiados intentos fallidos. Inténtalo más tarde.';
        }
        
        if (loginError) {
          loginError.innerText = msg;
          loginError.classList.remove('hidden');
        } else {
          alert(msg);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Iniciar Sesión';
        }
      }
    });
  }

  // 2. Lógica de Registro de Usuario con Código de Firebase
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nombre = document.getElementById('regNombre').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value.trim();
      const rol = document.getElementById('regRol').value;
      const secretKeyInput = document.getElementById('regSecretKey').value.trim();
      const regSubmitBtn = document.getElementById('regSubmitBtn');

      if (registerError) {
        registerError.classList.add('hidden');
        registerError.innerText = '';
      }

      try {
        if (regSubmitBtn) {
          regSubmitBtn.disabled = true;
          regSubmitBtn.innerText = 'Validando código...';
        }

        // 1. Validar el código secreto consultando Firestore
        const configDocRef = doc(db, "configuracion", "seguridad");
        const configDocSnap = await getDoc(configDocRef);

        if (!configDocSnap.exists()) {
          throw new Error("config/missing-code-doc");
        }

        const configData = configDocSnap.data();
        const codigoValido = configData.claveRegistro;

        if (secretKeyInput !== codigoValido) {
          throw new Error("auth/invalid-secret-key");
        }

        if (regSubmitBtn) {
          regSubmitBtn.innerText = 'Creando cuenta...';
        }

        // 2. Crear usuario en Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const user = userCredential.user;

        // 3. Guardar información extendida y rol en Firestore (colección "usuarios")
        await setDoc(doc(db, "usuarios", user.uid), {
          nombre: nombre,
          email: email,
          rol: rol,
          fechaRegistro: new Date().toISOString()
        });

        // Autenticar localmente y redirigir
        customAuth.login({
          id: user.uid,
          nombre: nombre,
          email: email,
          rol: rol
        });

        window.location.href = 'index.html';

      } catch (error) {
        console.error("Error al registrar:", error.code || error.message);
        let msg = '❌ Error al registrar el usuario.';
        
        if (error.message === 'auth/invalid-secret-key') {
          msg = '⚠️ La Clave Especial de Registro es incorrecta.';
        } else if (error.message === 'config/missing-code-doc') {
          msg = '⚠️ Error de configuración: No se encontró el documento "seguridad" en la colección "configuracion".';
        } else if (error.code === 'auth/email-already-in-use') {
          msg = '⚠️ Este correo electrónico ya está registrado.';
        } else if (error.code === 'auth/weak-password') {
          msg = '⚠️ La contraseña debe tener al menos 6 caracteres.';
        }

        if (registerError) {
          registerError.innerText = msg;
          registerError.classList.remove('hidden');
        } else {
          alert(msg);
        }
      } finally {
        if (regSubmitBtn) {
          regSubmitBtn.disabled = false;
          regSubmitBtn.innerText = 'Registrar';
        }
      }
    });
  }
});