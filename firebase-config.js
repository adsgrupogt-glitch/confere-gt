// firebase-config.js
// Preencha com os valores do seu projeto Firebase
// (Console Firebase → Configurações do projeto → Seus apps → SDK setup and configuration)

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAsi73gUDaYHCsRHJBaf6g7hMErqaai7SY",
  authDomain: "confere-gt.firebaseapp.com",
  databaseURL: "https://confere-gt-default-rtdb.firebaseio.com",
  projectId: "confere-gt",
  storageBucket: "confere-gt.firebasestorage.app",
  messagingSenderId: "1014861475388",
  appId: "1:1014861475388:web:75e99ea188bd7e3eb85d39",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/*
  REGRAS DE SEGURANÇA DO REALTIME DATABASE (colar em Console → Realtime Database → Regras):

  {
    "rules": {
      "usuarios": {
        ".read": true,
        ".write": true
      },
      "folhas": {
        ".read": true,
        ".write": true
      }
    }
  }

  Isso é o suficiente para o MVP (autenticação própria por código de 6 dígitos,
  não pelo Firebase Auth). Quando o sistema for para produção de verdade, o
  ideal é migrar para Firebase Authentication + regras por usuário logado —
  fica como item de segurança para a Fase 2, não bloqueia o uso agora.
*/
