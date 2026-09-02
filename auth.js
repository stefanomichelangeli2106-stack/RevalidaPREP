import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwyNIzkISCXhZLFpVURIL1jyKp6tXJ_MA",
  authDomain: "revalida-prep.firebaseapp.com",
  projectId: "revalida-prep",
  storageBucket: "revalida-prep.firebasestorage.app",
  messagingSenderId: "479699425105",
  appId: "1:479699425105:web:4de0e5c1fdb28cda2e6570",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const welcomeScreenEl = document.getElementById("welcome-screen");
const welcomeStartBtn = document.getElementById("welcome-start-btn");
const authScreenEl = document.getElementById("auth-screen");
const appEl = document.getElementById("app");
const userBarEl = document.getElementById("user-bar");
const userEmailEl = document.getElementById("user-email");
const errorEl = document.getElementById("auth-error");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const loginBtn = document.getElementById("auth-login-btn");
const signupBtn = document.getElementById("auth-signup-btn");
const googleBtn = document.getElementById("auth-google-btn");
const logoutBtn = document.getElementById("logout-btn");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}
function clearError() {
  errorEl.style.display = "none";
  errorEl.textContent = "";
}
function setButtonsDisabled(disabled) {
  [loginBtn, signupBtn, googleBtn].forEach((b) => { b.disabled = disabled; });
}

const ERROR_MESSAGES = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-password": "Digite uma senha.",
  "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
  "auth/email-already-in-use": "Esse e-mail já tem uma conta. Tente entrar em vez de criar uma nova.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Não existe conta com esse e-mail. Crie uma conta primeiro.",
  "auth/too-many-requests": "Muitas tentativas. Espere um pouco e tente novamente.",
  "auth/popup-closed-by-user": "Login com Google cancelado.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
};
function translateError(err) {
  return ERROR_MESSAGES[err && err.code] || "Ocorreu um erro. Tente novamente.";
}

loginBtn.addEventListener("click", async () => {
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { showError("Preencha e-mail e senha."); return; }
  setButtonsDisabled(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showError(translateError(err));
  } finally {
    setButtonsDisabled(false);
  }
});

signupBtn.addEventListener("click", async () => {
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { showError("Preencha e-mail e senha."); return; }
  setButtonsDisabled(true);
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showError(translateError(err));
  } finally {
    setButtonsDisabled(false);
  }
});

googleBtn.addEventListener("click", async () => {
  clearError();
  setButtonsDisabled(true);
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    showError(translateError(err));
  } finally {
    setButtonsDisabled(false);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

welcomeStartBtn.addEventListener("click", () => {
  welcomeScreenEl.style.display = "none";
  authScreenEl.style.display = "flex";
});

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); loginBtn.click(); }
  });
});

let appStarted = false;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    welcomeScreenEl.style.display = "flex";
    authScreenEl.style.display = "none";
    appEl.style.display = "none";
    userBarEl.style.display = "none";
    return;
  }
  if (appStarted) return;
  appStarted = true;

  welcomeScreenEl.style.display = "none";
  authScreenEl.style.display = "none";
  appEl.style.display = "grid";
  userBarEl.style.display = "flex";
  userEmailEl.textContent = user.email || user.displayName || "";

  const userRef = doc(db, "users", user.uid);
  let progressData = {};
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      progressData = (snap.data() && snap.data().progress) || {};
    } else {
      await setDoc(userRef, { email: user.email || null, createdAt: Date.now(), progress: {} });
    }
  } catch (err) {
    console.error("Erro ao carregar progresso do Firestore:", err);
  }

  window.initRevalidaApp(progressData, function (newProgress) {
    setDoc(userRef, { progress: newProgress }, { merge: true }).catch((err) => {
      console.error("Erro ao salvar progresso no Firestore:", err);
    });
  });
});
