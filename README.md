# Sistema de Gestão de Presença e Eventos

Uma solução completa e moderna (SPA - Single Page Application) para gerenciamento de grupos, igrejas ou organizações. O sistema oferece controle total sobre membros, eventos, frequências e ministérios, com foco em usabilidade, dados em tempo real e segurança.

![Status](https://img.shields.io/badge/Status-Ativo-success)
![Tecnologia](https://img.shields.io/badge/Tech-HTML%20%7C%20CSS%20%7C%20JS%20%7C%20Firebase-orange)

## ✨ Funcionalidades Principais

### 📊 Dashboard Inteligente e Personalizável
- **Visão Geral:** Cards com total de pessoas, eventos e alertas de baixa frequência.
- **Layout Editável:** Arraste e solte (Drag & Drop) para organizar os cards como preferir.
- **Gráficos:** Acompanhe a média de presença dos últimos 5 eventos e a distribuição por ministérios.
- **Widgets:** Próximos eventos (com contagem regressiva), aniversariantes do mês e Top 3 destaques (Servos, Participantes e Ministérios).

### 👥 Gestão de Pessoas
- **Perfil Completo:** Dados pessoais, contato, responsável (para menores) e foto (avatar gerado).
- **Classificação:** Distinção entre **Participantes** e **Servos** (com associação a múltiplos ministérios).
- **Importação Inteligente:** Importe dados em massa via Excel/CSV com pré-visualização e opção de desfazer (Undo).
- **Exportação:** Exporte listas para CSV ou PDF (Aniversariantes).
- **Códigos de Barras:** Geração automática e impressão de etiquetas para check-in.
- **Comunicação:** Integração direta com WhatsApp para mensagens rápidas.

###  Gestão de Eventos
- **Flexibilidade:** Eventos únicos ou recorrentes, com filtros de público-alvo (Todos, Apenas Servos, Ministérios Específicos).
- **Timeline:** Visualização cronológica ou em cards.
- **Comparador:** Selecione múltiplos eventos para comparar a presença lado a lado (com exportação PDF).
- **Relatórios:** Exportação detalhada de presença por evento (Excel e PDF com gráficos).
- **Justificativas:** Registro de motivos para ausências e gestão de convidados.

### ✅ Sistema de Check-in
- **Múltiplos Métodos:**
  1. **Busca Rápida:** Digite 3 letras do nome.
  2. **Código de Barras:** Use a câmera do dispositivo ou leitor USB.
  3. **Cadastro Rápido:** Registre visitantes na hora sem sair da tela de check-in.
- **Feedback Visual:** Confirmação sonora e visual de sucesso ou erro.

### ⛪ Ministérios e Liderança
- **Gestão:** Crie e edite ministérios com cores personalizadas.
- **Coordenação:** Defina líderes para cada ministério.
- **Filtros:** Visualize pessoas e eventos filtrados por ministério específico.

### ⚙️ Configurações e Segurança
- **Multi-Grupo:** O sistema suporta múltiplos grupos isolados. Cada grupo tem seus próprios dados.
- **Acesso Hierárquico:**
  - **Super Admin:** Cria o grupo e aprova coordenadores.
  - **Coordenador:** Solicita acesso via código e aguarda aprovação.
- **Logs de Atividade:** Auditoria completa de quem fez o quê (criação, edição, exclusão, check-in), com arquivamento automático de logs antigos.
- **Personalização:** Defina mensagens padrão para aniversários e cobrança de frequência (com suporte a Emojis).
- **Modo Escuro:** Tema Dark/Light alternável.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3 (Variáveis CSS, Flexbox, Grid), JavaScript (ES6+).
- **Backend (BaaS):** Firebase (Authentication, Firestore Database).
- **Bibliotecas:**
  - `JsBarcode` (Geração de códigos de barras)
  - `SheetJS (xlsx)` (Importação/Exportação Excel)
  - `jsPDF` & `jspdf-autotable` (Geração de relatórios PDF)
  - `Html5-QRCode` (Leitura de QR/Barcode via câmera)

## 🚀 Como Configurar e Rodar

### 1. Pré-requisitos
- Uma conta Google para acessar o Firebase Console.
- Um servidor web local (ex: extensão "Live Server" do VS Code) ou hospedagem estática.

### 2. Configuração do Firebase
1. Crie um novo projeto no Firebase Console.
2. **Authentication:** Ative os provedores "E-mail/Senha" e "Google".
3. **Firestore Database:** Crie um banco de dados em modo de produção.
4. **Regras de Segurança:** Copie as regras abaixo para a aba "Rules" do Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Funções auxiliares
    function isAuthenticated() { return request.auth != null; }
    function getUserData() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function isUserInGroup() { return isAuthenticated() && resource.data.groupId == getUserData().groupId; }
    function isCreatingInOwnGroup() { return isAuthenticated() && request.resource.data.groupId == getUserData().groupId; }

    // Regras por coleção
    match /users/{userId} {
       allow read: if isAuthenticated();
       allow write: if isAuthenticated() && request.auth.uid == userId;
    }
    match /groups/{groupId} {
      allow create: if isAuthenticated();
      allow get, update, delete: if isAuthenticated() && getUserData().groupId == groupId;
      allow list: if isAuthenticated();
    }
    match /{collection}/{document=**} {
      allow read, update, delete: if (collection == 'pessoas' || collection == 'eventos' || collection == 'presencas' || collection == 'justificativas' || collection == 'activity_logs' || collection == 'archived_activity_logs' || collection == 'retiros' || collection == 'retiro_participantes') && isUserInGroup();
      allow create: if (collection == 'pessoas' || collection == 'eventos' || collection == 'presencas' || collection == 'justificativas' || collection == 'activity_logs' || collection == 'archived_activity_logs' || collection == 'retiros' || collection == 'retiro_participantes') && isCreatingInOwnGroup();
    }
  }
}
```

### 5. Obter Credenciais do Firebase

1. No console do Firebase, vá em "Configurações do Projeto" (ícone de engrenagem)
2. Role até "Seus apps" e clique no ícone web (</>)
3. Registre o app com um nome
4. Copie as credenciais fornecidas

### 6. Configurar o Projeto

Abra o arquivo `firebase-config.js` e substitua as credenciais:

```javascript
const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto-id",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "123456789",
    appId: "sua-app-id"
};
```

## 🎯 Como Usar

### Primeiro Acesso (Super Admin)

1. Abra o `index.html` no navegador
2. Clique em "Criar Conta"
3. Preencha:
   - E-mail
   - Senha (mínimo 6 caracteres)
   - Nome do Grupo (ex: "Grupo JCC")
   - Deixe o código do grupo vazio
4. Faça login
5. Um código será gerado automaticamente em Configurações

### Adicionar Coordenadores

1. Compartilhe o código do grupo (em Configurações)
2. O coordenador deve:
   - Criar uma conta
   - Inserir o código do grupo no cadastro
3. Como Super Admin, aprove o coordenador em Configurações > Coordenadores Pendentes

### Cadastrar Pessoas

1. Vá em "Pessoas"
2. Clique em "+ Nova Pessoa"
3. Preencha os dados:
   - Nome completo
   - Data de nascimento
   - Telefone (WhatsApp)
   - Endereço
   - Se menor de idade: dados do responsável
   - Tipo: Participante ou Servo
   - Se servo: selecione os ministérios
4. Clique em "Cadastrar"

### Criar Eventos

1. Vá em "Eventos"
2. Clique em "+ Novo Evento"
3. Preencha:
   - Nome do evento
   - Data e horário
   - Local
   - Tipo de evento
   - Se repete semanalmente
   - Destinatários (Todos ou Apenas Servos)
   - Se servos: selecione ministérios específicos (opcional)
4. Clique em "Criar Evento"

### Fazer Check-in

1. Vá em "Check-in"
2. Selecione o evento
3. Escolha o método:
   - **Busca por Nome**: Digite 3 letras e selecione a pessoa
   - **Código de Barras**: Escaneie o código impresso
   - **Cadastro Rápido**: Para visitantes novos

### Gerar Código de Barras

1. Vá em "Pessoas"
2. Clique no ícone 🏷️ ao lado da pessoa
3. Clique em "Imprimir PDF"
4. A pessoa deve levar o código impresso para fazer check-in rápido

### Visualizar Frequência

1. Vá em "Pessoas" > Aba "Relatório de Frequência"
2. Visualize a porcentagem de presença de cada pessoa
3. A frequência é calculada apenas para eventos elegíveis:
   - Participantes: apenas eventos "Para Todos"
   - Servos: eventos "Para Todos" + eventos de seus ministérios

## 📱 Recursos Especiais

### Sistema Multi-Grupos
- Cada grupo tem seu código único
- Dados completamente isolados entre grupos
- Perfeito para múltiplas organizações

### Frequência Inteligente
- Calcula apenas eventos elegíveis para cada pessoa
- Servos não são penalizados por faltar em eventos de outros ministérios
- Relatório visual com código de cores

### Check-in Flexível
- Três métodos diferentes para máxima praticidade
- Cadastro de visitantes em tempo real
- Histórico completo de presenças

## 🎨 Design

O sistema utiliza uma paleta de cores moderna e minimalista:
- Interface limpa e intuitiva
- Responsivo para mobile e desktop
- Animações suaves
- Alto contraste para acessibilidade

## 📊 Estrutura do Banco de Dados

### Collections:

**groups**
- name: string
- code: string (6 caracteres)
- ownerId: string
- ministerios: array
- createdAt: timestamp

**users**
- email: string
- groupId: string
- role: 'superadmin' | 'coordenador'
- pending: boolean
- createdAt: timestamp

**pessoas**
- nome: string
- dataNascimento: string
- telefone: string
- endereco: string
- responsavel: string
- telefoneResponsavel: string
- tipo: 'participante' | 'servo'
- ministerios: array
- barcode: string (único)
- groupId: string
- createdAt: timestamp

**eventos**
- nome: string
- data: string (YYYY-MM-DD)
- horario: string (HH:MM)
- local: string
- tipo: string
- repete: boolean
- destinatarios: 'todos' | 'servos'
- ministerios: array
- groupId: string
- createdAt: timestamp

**presencas**
- eventoId: string
- pessoaId: string
- groupId: string
- timestamp: timestamp

## 🔒 Segurança

- Autenticação via Firebase Authentication
- Regras de segurança no Firestore
- Isolamento completo de dados entre grupos
- Aprovação obrigatória de coordenadores pelo Super Admin

## 🐛 Solução de Problemas

### Erro de permissão no Firestore
- Verifique se as regras de segurança foram configuradas corretamente
- Certifique-se de estar logado

### Código de barras não funciona
- Verifique se a biblioteca JsBarcode está carregando
- Teste a conexão de internet

### Check-in não registra
- Verifique se o evento foi selecionado
- Confirme que a pessoa está cadastrada

## 📄 Licença

Este projeto é de código aberto e pode ser usado livremente.

## 🤝 Contribuições

Sugestões e melhorias são bem-vindas!

## 📞 Suporte

Para dúvidas ou problemas, entre em contato com o desenvolvedor.

---

Desenvolvido com ❤️ para facilitar o gerenciamento de grupos e eventos.
