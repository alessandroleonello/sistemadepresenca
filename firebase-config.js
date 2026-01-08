// Configuração do Firebase
// IMPORTANTE: Substitua com suas credenciais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD0bi3ihTSqSIK0XayBeluZrzLaTGVZZ8g",
  authDomain: "listadepresenca-875fe.firebaseapp.com",
  projectId: "listadepresenca-875fe",
  storageBucket: "listadepresenca-875fe.firebasestorage.app",
  messagingSenderId: "752407522466",
  appId: "1:752407522466:web:0a4df2614e40c092843bfb"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Referências globais
let currentUser = null;
let currentGroupId = null;
let ministerios = [];
let pessoas = [];
let eventos = [];
let selectionMode = false;
let selectedItems = new Set();
