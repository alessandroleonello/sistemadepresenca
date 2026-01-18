let currentPage = 1;
let itemsPerPage = 10;
let currentEventoPage = 1;
let eventosItemsPerPage = 10;
let currentJustificativas = new Map();
let globalJustificativas = [];
let showCoordinatorsOnly = false;
let lastImportedIds = [];
let pendingImportList = [];
let pendingNewMinisterios = [];
let globalPresencas = [];
let ministerioColors = {};
let currentEventoView = 'cards';
let currentTipoFilter = '';
let currentMinisterioFilters = new Set();
let currentRetiroFilters = new Set();
let ministerioCoordinators = {};
let currentMinisterioView = localStorage.getItem('ministerioView') || 'cards';
let currentPessoaView = localStorage.getItem('pessoaView') || 'list';
let currentAniversarioView = localStorage.getItem('aniversarioView') || 'cards';
let eventoSelectionMode = false;
let selectedEventos = new Set();
let eventTypes = [];
let currentEventMinisterioFilter = '';
let currentEventSortOrder = 'desc';
let html5QrcodeScanner = null;
let customBirthdayMessage = '';
let customLowFreqMessage = '';
let currentLogs = [];
let isFullHistoryLoaded = false; // Controle para saber se carregamos tudo ou só recente
let userPending = false; // Controle global de status pendente
let globalPersonRetirosMap = {}; // Mapa de retiros visíveis por pessoa
let currentRetiroId = null; // ID do retiro sendo gerenciado atualmente
let currentRetiroTab = 'participantes'; // Aba atual da gestão de retiro
let currentTeamRoleFilter = ''; // Filtro de função da equipe

const TAG_PALETTE = [
    '#e0f2fe', // Sky
    '#dcfce7', // Green
    '#fef3c7', // Amber
    '#fee2e2', // Red
    '#f3e8ff', // Purple
    '#fae8ff', // Fuchsia
    '#ffedd5', // Orange
    '#ecfeff'  // Cyan
];

const TAG_TEXT_PALETTE = [
    '#0369a1', // Sky Dark
    '#15803d', // Green Dark
    '#b45309', // Amber Dark
    '#b91c1c', // Red Dark
    '#7e22ce', // Purple Dark
    '#a21caf', // Fuchsia Dark
    '#c2410c', // Orange Dark
    '#0e7490'  // Cyan Dark
];

// ==================== UTILITÁRIOS DE SEGURANÇA ====================
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Função Debounce para otimizar buscas
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// ==================== AUTENTICAÇÃO ====================

// Tentar ajustar persistência para evitar bloqueios de navegador (Tracking Prevention)
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .then(() => {
        // Persistência configurada
    })
    .catch((error) => {
        console.warn("Aviso: Navegador bloqueando persistência de login.", error);
    });

// Verificar estado de autenticação
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userData = await loadUserData();
            
            if (userData && userData.pending) {
                showScreen('pending');
            } else if (userData) {
                showScreen('main');
                loadDashboard();
            }
        } catch (error) {
            console.error("Erro ao carregar dados do usuário:", error);
            showToast("Erro ao carregar perfil. Verifique o console.", "error");
        }
    } else {
        showScreen('login');
    }
});

// Login
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const groupCode = document.getElementById('loginGroupCode')?.value;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        
        if (groupCode) {
            await joinGroup(groupCode);
        }
    } catch (error) {
        showToast('Erro ao fazer login: ' + error.message, 'error');
    }
}

// Login com Google
async function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        currentUser = user; // Garante que currentUser esteja definido para loadUserData
        
        // Verificar se o usuário já existe no banco
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Verifica se tem código de grupo digitado no input de login
            let groupCode = document.getElementById('loginGroupCode')?.value;
            
            // Se não tiver código digitado, pergunta ao usuário
            if (!groupCode) {
                const codeInput = prompt("Se você tem um código de grupo, digite abaixo para entrar.\nDeixe em branco para criar um novo grupo.");
                if (codeInput) {
                    groupCode = codeInput.trim();
                }
            }
            
            if (groupCode) {
                await joinGroup(groupCode);
                
                // Verifica se o usuário foi criado (se o código era válido)
                const userCheck = await db.collection('users').doc(user.uid).get();
                if (!userCheck.exists) {
                    // Se falhou ao entrar no grupo (código inválido), oferece criar novo
                    if (confirm("Não foi possível entrar no grupo (código inválido?). Deseja criar um novo grupo?")) {
                        await createNewGroup(user.uid, `Grupo de ${user.displayName || 'Usuário'}`);
                    }
                }
            } else {
                // Cria novo grupo automaticamente se não houver código
                await createNewGroup(user.uid, `Grupo de ${user.displayName || 'Usuário'}`);
            }
            
            // Força recarregamento dos dados
            const userData = await loadUserData();
            if (userData && userData.pending) {
                showScreen('pending');
            } else {
                showScreen('main');
                loadDashboard();
            }
        }
    } catch (error) {
        console.error("Erro no login Google:", error);
        showToast('Erro ao fazer login com Google: ' + error.message, 'error');
    }
}

// Mostrar formulário de registro
function showRegisterForm() {
    const modalBody = `
        <h2>Criar Conta</h2>
        <div class="form-group">
            <label>E-mail</label>
            <input type="email" id="regEmail" class="input-field" placeholder="seu@email.com">
        </div>
        <div class="form-group">
            <label>Senha</label>
            <input type="password" id="regPassword" class="input-field" placeholder="Mínimo 6 caracteres">
        </div>
        <div class="form-group">
            <label>Nome do Grupo</label>
            <input type="text" id="regGroupName" class="input-field" placeholder="Ex: Grupo JCC">
        </div>
        <div class="form-group">
            <label>Código do Grupo (deixe vazio para criar novo)</label>
            <input type="text" id="regGroupCode" class="input-field" placeholder="Código (opcional)">
        </div>
        <button onclick="handleRegister()" class="btn-primary">Criar Conta</button>
    `;
    
    showModal(modalBody);
}

// Registro
async function handleRegister() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const groupName = document.getElementById('regGroupName').value;
    const groupCode = document.getElementById('regGroupCode').value;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        currentUser = user; // Garante que o usuário atual esteja definido para as próximas funções

        if (groupCode) {
            // Entrar em grupo existente
            await joinGroup(groupCode);
        } else {
            // Criar novo grupo
            await createNewGroup(user.uid, groupName);
        }
        
        // Força o recarregamento dos dados agora que o grupo foi criado no banco
        const userData = await loadUserData();
        
        if (userData && userData.pending) {
            showScreen('pending');
        } else {
            showScreen('main');
            loadDashboard();
        }
        closeModal();
    } catch (error) {
        showToast('Erro ao criar conta: ' + error.message, 'error');
    }
}

// Criar novo grupo
async function createNewGroup(userId, groupName) {
    const code = generateGroupCode();
    
    const groupData = {
        name: groupName || 'Meu Grupo',
        code: code,
        ownerId: userId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ministerios: [
            'Coordenação', 'Núcleo', 'Música', 'Intercessão', 
            'Criatividade', 'R.D.A', 'Taty Teatro', 
            'Formação', 'Financeiro', 'Servo Geral'
        ]
    };
    
    const groupRef = await db.collection('groups').add(groupData);
    
    await db.collection('users').doc(userId).set({
        email: auth.currentUser.email,
        groupId: groupRef.id,
        role: 'superadmin',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    currentGroupId = groupRef.id;
}

// Entrar em grupo existente
async function joinGroup(code) {
    const groupsQuery = await db.collection('groups').where('code', '==', code).get();
    
    if (groupsQuery.empty) {
        showToast('Código de grupo inválido!', 'error');
        return;
    }
    
    const groupDoc = groupsQuery.docs[0];
    const groupId = groupDoc.id;
    
    await db.collection('users').doc(auth.currentUser.uid).set({
        email: auth.currentUser.email,
        groupId: groupId,
        role: 'coordenador',
        pending: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    currentGroupId = groupId;
}

// Gerar código do grupo
function generateGroupCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Logout
function handleLogout() {
    auth.signOut();
}

// Carregar dados do usuário
async function loadUserData() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    
    // Atualizar estado global de pendência
    if (userData) {
        userPending = userData.pending === true;
    }

    if (userData && userData.groupId) {
        currentGroupId = userData.groupId;
        
        const groupDoc = await db.collection('groups').doc(currentGroupId).get();
        const groupData = groupDoc.data();
        
        if(document.getElementById('groupNameSidebar')) document.getElementById('groupNameSidebar').textContent = groupData.name;
        if(document.getElementById('configGroupName')) document.getElementById('configGroupName').value = groupData.name;
        if(document.getElementById('groupNameMobile')) document.getElementById('groupNameMobile').textContent = groupData.name;
        if(document.getElementById('groupCodeDisplay')) document.getElementById('groupCodeDisplay').textContent = groupData.code;
        if(document.getElementById('userEmail')) document.getElementById('userEmail').textContent = currentUser.email;
        if(document.getElementById('userType')) document.getElementById('userType').textContent = userData.role === 'superadmin' ? 'Super Admin' : 'Coordenador';
        
        // Mostrar seção de coordenadores pendentes se for superadmin
        if (userData.role === 'superadmin') {
            if (document.getElementById('pendingCoordinators')) {
                document.getElementById('pendingCoordinators').style.display = 'block';
                loadPendingCoordinators();
            }
            if (document.getElementById('activeCoordinators')) {
                document.getElementById('activeCoordinators').style.display = 'block';
                loadActiveCoordinators();
            }
        }
        
        ministerios = groupData.ministerios || [];
        ministerioColors = groupData.ministerioColors || {};
        ministerioCoordinators = groupData.ministerioCoordinators || {};
        eventTypes = groupData.eventTypes || ['Formação', 'Reunião', 'Ensaio', 'Confraternização'];
        customBirthdayMessage = groupData.birthdayMessage || '';
        customLowFreqMessage = groupData.lowFreqMessage || '';

        if(document.getElementById('configBirthdayMessage')) document.getElementById('configBirthdayMessage').value = customBirthdayMessage;
        if(document.getElementById('configLowFreqMessage')) document.getElementById('configLowFreqMessage').value = customLowFreqMessage;

        loadMinisteriosOptions();
        loadEventTypeOptions();
        loadCardStates(); // Carregar estados salvos no banco
    }
    return userData;
}

// ==================== NAVEGAÇÃO ====================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName + 'Screen').classList.add('active');
}

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Fechar menu mobile ao navegar
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('mobile-open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }

    // Parar scanner se sair da seção de checkin
    if (sectionName !== 'checkin' && html5QrcodeScanner) {
        toggleBarcodeScanner();
    }

    // Carregar dados da seção
    switch(sectionName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'destaques':
            loadDestaques();
            break;
        case 'pessoas':
            loadPessoas();
            updateVisibleRetirosMap().then(() => loadPessoas(false));
            break;
        case 'eventos':
            loadEventos();
            break;
        case 'retiros':
            loadRetiros();
            break;
        case 'checkin':
            loadCheckinEventos();
            break;
        case 'ministerios':
            loadMinisterios();
            break;
        case 'configuracoes':
            loadLocalSettings();
            break;
        case 'logs':
            loadActivityLogs();
            break;
    }
}

// ==================== MODAL ====================

function showModal(content) {
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
    if (!currentGroupId) {
        console.warn("loadDashboard chamado sem currentGroupId definido. Aguardando...");
        return;
    }

    // Segurança: Não tentar carregar nada se o usuário estiver pendente
    if (userPending) {
        showScreen('pending');
        return;
    }

    console.log(`Carregando dashboard para o grupo: ${currentGroupId}`);

    try {
    // Carregar estatísticas
    const pessoasSnapshot = await db.collection('pessoas')
        .where('groupId', '==', currentGroupId)
        .get();
    
    // OTIMIZAÇÃO: Carregar apenas dados dos últimos 6 meses por padrão
    let eventosQuery = db.collection('eventos').where('groupId', '==', currentGroupId);
    let presencasQuery = db.collection('presencas').where('groupId', '==', currentGroupId);

    if (!isFullHistoryLoaded) {
        const limitDate = new Date();
        limitDate.setMonth(limitDate.getMonth() - 6); // 6 meses atrás
        limitDate.setHours(0, 0, 0, 0);
        
        // Eventos usam string YYYY-MM-DD
        const limitDateString = limitDate.toISOString().split('T')[0];
        
        eventosQuery = eventosQuery.where('data', '>=', limitDateString);
        // Presenças usam Timestamp
        presencasQuery = presencasQuery.where('timestamp', '>=', limitDate);
        
        // Aviso visual (opcional, pode ser removido se preferir)
        console.log("Carregando apenas dados recentes (últimos 6 meses).");
    }

    // TENTATIVA DE CARREGAMENTO COM FALLBACK
    let eventosSnapshot, presencasSnapshot;
    try {
        eventosSnapshot = await eventosQuery.get();
        presencasSnapshot = await presencasQuery.get();
    } catch (innerError) {
        // Se der erro de índice ou permissão na versão otimizada, volta para o modo completo automaticamente
        if (!isFullHistoryLoaded && (innerError.code === 'failed-precondition' || innerError.code === 'permission-denied')) {
            console.warn("Falha na otimização (Índice/Permissão). Ativando modo de compatibilidade...", innerError);
            isFullHistoryLoaded = true; // Força carregamento completo na próxima tentativa
            showToast("Modo de compatibilidade ativado (carregando histórico completo)...", "warning");
            return loadDashboard(); // Tenta novamente
        }
        throw innerError; // Se for outro erro, joga para o catch principal
    }

    // Filtrar presenças de pessoas que não existem mais (órfãs) para não distorcer estatísticas
    const validPessoaIds = new Set(pessoasSnapshot.docs.map(d => d.id));
    globalPresencas = presencasSnapshot.docs.map(doc => doc.data()).filter(p => validPessoaIds.has(p.pessoaId));
    const allPresencas = globalPresencas;

    // Carregar justificativas
    const justificativasSnapshot = await db.collection('justificativas')
        .where('groupId', '==', currentGroupId)
        .get();
    globalJustificativas = justificativasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Mapear contagem por evento
    const presencasPorEvento = {};
    allPresencas.forEach(p => {
        presencasPorEvento[p.eventoId] = (presencasPorEvento[p.eventoId] || 0) + 1;
    });
    
    pessoas = pessoasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calcular adesão para cada evento
    const totalServos = pessoas.filter(p => p.tipo === 'servo');
    
    eventos = eventosSnapshot.docs.map(doc => {
        const data = doc.data();
        const presenceCount = presencasPorEvento[doc.id] || 0;
        
        let eligibleCount = 0;
        if (data.destinatarios === 'todos') {
            eligibleCount = pessoas.length;
        } else if (data.destinatarios === 'servos') {
            if (!data.ministerios || data.ministerios.length === 0) {
                eligibleCount = totalServos.length;
            } else {
                eligibleCount = totalServos.filter(p => p.ministerios?.some(m => data.ministerios.includes(m))).length;
            }
        }
        
        const adherence = eligibleCount > 0 ? (presenceCount / eligibleCount) * 100 : 0;
        
        return { 
            id: doc.id, 
            ...data,
            presenceCount,
            eligibleCount,
            adherence
        };
    });
    
    const totalParticipantesCount = pessoas.length - totalServos.length;
    document.getElementById('totalPessoas').innerHTML = `
        ${pessoas.length}
        <div style="font-size: 0.4em; margin-top: 5px; font-weight: 500; color: var(--text-secondary);">
            <span style="color: var(--primary)">${totalServos.length} Servos</span>
            <span style="margin: 0 3px;">•</span>
            <span style="color: var(--success)">${totalParticipantesCount} Partic.</span>
        </div>
    `;
    
    const now = new Date();
    const pastEventsCount = eventos.filter(e => new Date(e.data + 'T' + e.horario) < now).length;
    const futureEventsCount = eventos.length - pastEventsCount;

    document.getElementById('totalEventos').innerHTML = `
        ${eventos.length}
        <div style="font-size: 0.4em; margin-top: 5px; font-weight: 500; color: var(--text-secondary);">
            <span style="color: var(--primary)">${futureEventsCount} Futuros</span>
            <span style="margin: 0 3px;">•</span>
            <span style="color: var(--text-tertiary)">${pastEventsCount} Realizados</span>
        </div>
    `;
    
    // Calcular pessoas com baixa frequência
    await calculateFrequencias(allPresencas);
    const baixaFreq = pessoas.filter(p => (p.frequencia || 0) < 50 && (p.totalEventosElegiveis || 0) > 0).length;
    document.getElementById('baixaFrequencia').textContent = baixaFreq;
    
    // Carregar próximos eventos
    loadProximosEventos();
    
    // Carregar gráfico de presença
    loadAttendanceChart();
    
    // Carregar aniversariantes
    loadAniversariantes();
    
    // Carregar pessoas com baixa frequência
    loadPessoasBaixaFrequencia();

    // Carregar gráfico de ministérios
    loadMinisteriosChart();

    // Carregar Top 3 Resumo
    loadTop3Summary();

    // Carregar mapa de retiros visíveis
    await updateVisibleRetirosMap();

    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        if (error.code === 'permission-denied') {
            // Verificar se o usuário está pendente (recuperação de estado)
            if (currentUser) {
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                const userData = userDoc.data();
                if (userData && userData.pending) {
                    userPending = true;
                    showScreen('pending');
                    return;
                }
            }

            // Mensagem detalhada para ajudar a resolver
            const isTrackingIssue = !auth.currentUser; // Se deu erro de permissão e o usuário parece nulo
            if (isTrackingIssue) {
                const modalBody = `
                    <h2>⚠️ Bloqueio Detectado</h2>
                    <p>O seu navegador está bloqueando o login por causa da 'Prevenção de Rastreamento'.</p>
                    <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <strong>Como Resolver:</strong>
                        <ol style="margin-left: 20px; margin-top: 10px;">
                            <li>Procure o ícone de escudo/cadeado na barra de endereço.</li>
                            <li>Clique nele e desative a proteção para este site.</li>
                            <li>Recarregue a página.</li>
                        </ol>
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="width: 100%">Entendi</button>
                `;
                showModal(modalBody);
            } else {
                showToast("Erro de Acesso: Permissão negada. Verifique se você foi aprovado ou se os índices do banco estão criados.", "error");
            }
        } else if (error.code === 'failed-precondition') {
            // Erro comum quando falta índice composto no Firestore
            const msg = "Otimização requer um índice no Firestore. Abra o console do navegador (F12) e clique no link fornecido pelo Firebase para criá-lo automaticamente.";
            console.warn(msg);
            showToast(msg, 'warning');
        }
    }
}

// Função para carregar histórico completo sob demanda
async function loadFullHistory() {
    const btn = document.getElementById('btnLoadHistory');
    if(btn) { btn.textContent = '⏳ Carregando...'; btn.disabled = true; }
    
    isFullHistoryLoaded = true;
    await loadDashboard();
    
    showToast('Histórico completo carregado!', 'success');
    if(btn) { btn.textContent = 'Histórico Completo Carregado'; }
}

async function loadDestaques() {
    // Garantir que os dados estejam carregados se o usuário acessar diretamente
    if (pessoas.length === 0 || eventos.length === 0) {
        await loadDashboard();
    }

    // Inicializar e carregar destaques (padrão: mês atual)
    // Verifica se já tem valor nos inputs para não resetar se o usuário já estiver na tela
    if (!document.getElementById('destaqueInicio').value) initDestaquesDates();
    else loadServosDestaque();
    
    if (!document.getElementById('destaquePartInicio').value) initDestaquesParticipantesDates();
    else loadParticipantesDestaque();

    if (!document.getElementById('destaqueMinInicio').value) initDestaquesMinisteriosDates();
    else loadMinisteriosDestaque();
}

function loadProximosEventos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const proximos = eventos
        .filter(e => {
            const dataEvento = new Date(e.data);
            const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
            dataEventoAjustada.setHours(0,0,0,0);
            return dataEventoAjustada >= hoje;
        })
        .sort((a, b) => new Date(a.data) - new Date(b.data))
        .slice(0, 5);
    
    const container = document.getElementById('proximosEventos');
    
    if (proximos.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum evento próximo</p>';
        return;
    }
    
    container.innerHTML = proximos.map(evento => {
        const dataEvento = new Date(evento.data);
        const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
        dataEventoAjustada.setHours(0,0,0,0);
        
        const diffTime = dataEventoAjustada.getTime() - hoje.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        let timeBadge = '';
        let cardStyle = '';

        if (diffDays === 0) {
            timeBadge = '<span class="badge badge-success" style="font-size: 0.8em;">É HOJE!</span>';
            cardStyle = 'border: 2px solid #28a745; background-color: #f0fff4;';
        } else if (diffDays === 1) {
            timeBadge = '<span class="badge badge-warning" style="font-size: 0.8em;">Amanhã</span>';
        } else {
            timeBadge = `<span class="badge badge-primary" style="font-size: 0.8em;">Faltam ${diffDays} dias</span>`;
        }

        const checkinButton = diffDays === 0 ? 
            `<button class="btn-primary" style="width: 100%; margin-top: 8px; padding: 6px; font-size: 0.9em;" onclick="quickCheckinNavigation('${evento.id}')">✅ Fazer Check-in</button>` : '';

        return `
        <div class="card" style="${cardStyle}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                <div style="flex: 1; margin-right: 10px;">
                    <h4 style="margin: 0; display: inline; margin-right: 5px;">${escapeHtml(evento.nome)}</h4>
                    ${evento.tipo ? `<span style="font-size: 0.75em; color: var(--text-secondary); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; vertical-align: middle; white-space: nowrap;">${escapeHtml(evento.tipo)}</span>` : ''}
                </div>
                ${timeBadge}
            </div>
            <p style="margin-bottom: 5px;">${formatDate(evento.data)} às ${escapeHtml(evento.horario)}</p>
            <p class="help-text" style="margin: 0;">${escapeHtml(evento.local)}</p>
            ${checkinButton}
        </div>
    `}).join('');
}

function loadAttendanceChart() {
    const container = document.getElementById('attendanceChart');
    if (!container) return;

    // Filtrar eventos passados
    const now = new Date();
    const pastEventos = eventos.filter(e => new Date(e.data + 'T' + e.horario) < now);
    
    // Ordenar por data (mais recente primeiro) para pegar os últimos 5
    pastEventos.sort((a, b) => new Date(b.data + 'T' + b.horario) - new Date(a.data + 'T' + a.horario));
    
    // Pegar os 5 últimos e inverter para mostrar cronologicamente (antigo -> novo)
    const last5 = pastEventos.slice(0, 5).reverse();

    if (last5.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum evento realizado ainda.</p>';
        return;
    }

    const html = `
        <div style="display: flex; align-items: flex-end; justify-content: space-around; height: 200px; padding: 20px 0 10px 0; border-bottom: 1px solid #eee; overflow-x: auto;">
            ${last5.map(e => {
                const percent = Math.round(e.adherence || 0);
                const height = Math.max(percent, 1); // Altura mínima visual
                // Cor baseada na porcentagem (Verde > 70, Amarelo > 40, Vermelho < 40)
                const color = percent >= 70 ? '#28a745' : (percent >= 40 ? '#ffc107' : '#dc3545');
                
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; width: 15%; group; position: relative;">
                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 0.85em; color: #555;">${percent}%</div>
                        <div style="width: 100%; background-color: ${color}; height: ${height}%; border-radius: 4px 4px 0 0; transition: height 0.3s ease; min-height: 4px;"></div>
                        <div style="margin-top: 10px; font-size: 0.75em; text-align: center; color: #666; line-height: 1.2;">
                            <div style="font-weight: 500; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;" title="${escapeHtml(e.nome)}">
                                ${escapeHtml(e.nome).length > 10 ? escapeHtml(e.nome).substring(0, 10) + '...' : escapeHtml(e.nome)}
                            </div>
                            <div>${formatDate(e.data).substring(0, 5)}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    container.innerHTML = html;
}

function loadMinisteriosChart() {
    const container = document.getElementById('ministeriosChart');
    if (!container) return;

    if (!ministerios || ministerios.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum ministério cadastrado.</p>';
        return;
    }

    // Contar pessoas por ministério
    const counts = {};
    ministerios.forEach(m => counts[m] = 0);
    
    pessoas.forEach(p => {
        if (p.ministerios) {
            p.ministerios.forEach(m => {
                if (counts[m] !== undefined) counts[m]++;
            });
        }
    });

    // Converter para array e ordenar
    const data = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const max = Math.max(...data.map(d => d.count)) || 1;

    container.innerHTML = data.map(item => {
        let color = ministerioColors[item.name];
        
        if (!color) {
            let hash = 0;
            for (let i = 0; i < item.name.length; i++) {
                hash = item.name.charCodeAt(i) + ((hash << 5) - hash);
            }
            const index = Math.abs(hash % TAG_TEXT_PALETTE.length);
            color = TAG_TEXT_PALETTE[index];
        } else {
            const paletteIndex = TAG_PALETTE.indexOf(color.toLowerCase());
            if (paletteIndex !== -1) {
                color = TAG_TEXT_PALETTE[paletteIndex];
            }
        }

        const safeName = item.name.replace(/'/g, "\\'");
        return `
        <div style="margin-bottom: 12px; cursor: pointer;" onclick="navigateToMinisterioFilter('${safeName}')" title="Filtrar por ${escapeHtml(item.name)}">
            <div class="ministry-row-header">
                <span>${escapeHtml(item.name)}</span>
                <span style="font-weight: 600; color: var(--text-primary);">${item.count}</span>
            </div>
            <div style="width: 100%; background: var(--bg-tertiary); height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="width: ${(item.count / max) * 100}%; background: ${color}; height: 100%; border-radius: 4px;"></div>
            </div>
        </div>
    `}).join('');
}

function loadTop3Summary() {
    const container = document.getElementById('top3SummaryContent');
    if (!container) return;

    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);

    // Filtrar eventos do mês atual
    const eventosPeriodo = eventos.filter(e => {
        const dataEvento = new Date(e.data);
        const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
        return dataEventoAjustada >= firstDay && dataEventoAjustada <= lastDay;
    });

    if (eventosPeriodo.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum evento realizado neste mês para calcular destaques.</p>';
        return;
    }

    const todasPresencas = globalPresencas;

    // --- Top 3 Servos ---
    const servosStats = pessoas
        .filter(p => p.tipo === 'servo')
        .map(servo => {
            const eventsEligible = eventosPeriodo.filter(evento => {
                if (evento.destinatarios === 'todos') return true;
                if (evento.destinatarios === 'servos') {
                    if (!evento.ministerios || evento.ministerios.length === 0) return true;
                    return servo.ministerios?.some(m => evento.ministerios.includes(m));
                }
                return false;
            });
            
            if (eventsEligible.length === 0) return null;

            const presencas = todasPresencas.filter(p => p.pessoaId === servo.id && eventsEligible.some(e => e.id === p.eventoId)).length;
            return {
                id: servo.id,
                nome: servo.nome,
                porcentagem: (presencas / eventsEligible.length) * 100,
                presencas
            };
        })
        .filter(s => s !== null)
        .sort((a, b) => b.porcentagem - a.porcentagem || b.presencas - a.presencas)
        .slice(0, 3);

    // --- Top 3 Participantes ---
    const partStats = pessoas
        .filter(p => p.tipo === 'participante')
        .map(part => {
            const eventsEligible = eventosPeriodo.filter(e => e.destinatarios === 'todos');
            if (eventsEligible.length === 0) return null;
            
            const presencas = todasPresencas.filter(p => p.pessoaId === part.id && eventsEligible.some(e => e.id === p.eventoId)).length;
            return {
                id: part.id,
                nome: part.nome,
                porcentagem: (presencas / eventsEligible.length) * 100,
                presencas
            };
        })
        .filter(p => p !== null)
        .sort((a, b) => b.porcentagem - a.porcentagem || b.presencas - a.presencas)
        .slice(0, 3);

    // --- Top 3 Ministérios ---
    const minStats = ministerios.map(minName => {
        const servosDoMinisterio = pessoas.filter(p => p.tipo === 'servo' && p.ministerios && p.ministerios.includes(minName));
        if (servosDoMinisterio.length === 0) return null;

        let totalPresencas = 0;
        let totalElegiveis = 0;

        servosDoMinisterio.forEach(servo => {
             const eventsEligible = eventosPeriodo.filter(evento => {
                if (evento.destinatarios === 'todos') return true;
                if (evento.destinatarios === 'servos') {
                    if (!evento.ministerios || evento.ministerios.length === 0) return true;
                    return servo.ministerios?.some(m => evento.ministerios.includes(m));
                }
                return false;
            });
            
            totalElegiveis += eventsEligible.length;
            totalPresencas += todasPresencas.filter(p => p.pessoaId === servo.id && eventsEligible.some(e => e.id === p.eventoId)).length;
        });

        if (totalElegiveis === 0) return null;

        return {
            nome: minName,
            porcentagem: (totalPresencas / totalElegiveis) * 100
        };
    })
    .filter(m => m !== null)
    .sort((a, b) => b.porcentagem - a.porcentagem)
    .slice(0, 3);

    // Renderizar
    const renderList = (list, type) => {
        if (list.length === 0) return '<p class="help-text" style="font-size: 0.8em;">Sem dados</p>';
        return list.map((item, i) => {
            const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉');
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.9em; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: 5px; overflow: hidden;">
                        <span>${medal}</span>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" ${item.id ? `onclick="showPessoaDetails('${item.id}')"` : ''}>${escapeHtml(item.nome)}</span>
                    </div>
                    <span class="badge badge-success" style="font-size: 0.75em; padding: 1px 6px;">${item.porcentagem.toFixed(0)}%</span>
                </div>
            `;
        }).join('');
    };

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
            <div><h4 style="margin-bottom: 10px; color: var(--primary);">Servos</h4>${renderList(servosStats)}</div>
            <div><h4 style="margin-bottom: 10px; color: var(--success);">Participantes</h4>${renderList(partStats)}</div>
            <div><h4 style="margin-bottom: 10px; color: var(--warning);">Ministérios</h4>${renderList(minStats)}</div>
        </div>
        <div style="text-align: center; margin-top: 10px;">
            <button class="btn-secondary" onclick="showSection('destaques')" style="font-size: 0.8em; padding: 4px 10px;">Ver Ranking Completo</button>
        </div>
    `;
}

function navigateToMinisterioFilter(name) {
    showSection('pessoas');
    showPessoaTab('lista');
    
    currentMinisterioFilters.clear();
    currentMinisterioFilters.add(name);
    updateMinisterioSelectVisuals();
    loadPessoas();
    showToast(`Filtrando por: ${name}`, 'info');
}

function loadAniversariantes() {
    const hoje = new Date();
    const mesAtual = hoje.getMonth(); // 0-11
    const diaAtual = hoje.getDate();
    
    const aniversariantes = pessoas.filter(p => {
        if (!p.dataNascimento) return false;
        // Formato YYYY-MM-DD
        const parts = p.dataNascimento.split('-');
        if (parts.length !== 3) return false;
        const mesNasc = parseInt(parts[1]) - 1;
        return mesNasc === mesAtual;
    });

    aniversariantes.sort((a, b) => {
        const diaA = parseInt(a.dataNascimento.split('-')[2]);
        const diaB = parseInt(b.dataNascimento.split('-')[2]);
        return diaA - diaB;
    });

    const container = document.getElementById('aniversariantesMes');
    
    if (aniversariantes.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum aniversariante este mês</p>';
        return;
    }

    container.innerHTML = aniversariantes.map(p => {
        const parts = p.dataNascimento.split('-');
        const dia = parseInt(parts[2]);
        
        // Idade que vai fazer este ano
        const idade = hoje.getFullYear() - parseInt(parts[0]);
        const isHoje = dia === diaAtual;
        const isPassou = dia < diaAtual;
        
        // Chave única baseada na data do aniversário deste ano (YYYY-M-D)
        // A inclusão do ano atual garante que o status reseta a cada ano
        const mesNasc = parseInt(parts[1]) - 1;
        const birthdayDateKey = `${hoje.getFullYear()}-${mesNasc}-${dia}`;
        const storageKey = `birthday_sent_${p.id}_${birthdayDateKey}`;
        const isSent = localStorage.getItem(storageKey) === 'true';
        
        let cardStyle = '';
        let statusText = `Dia ${dia}`;
        let badgeClass = 'primary';

        if (isHoje) {
            cardStyle = 'border: 2px solid #28a745; background-color: #f0fff4;';
            statusText = '<strong style="color: #28a745;">É HOJE!</strong>';
            badgeClass = 'success';
        } else if (isPassou && !isSent) {
            cardStyle = 'border: 2px solid #ef4444; background-color: #fef2f2;';
            statusText = `<strong style="color: #ef4444;">Dia ${dia} - Não enviado!</strong>`;
            badgeClass = 'danger';
        } else if (isPassou && isSent) {
            statusText = `Dia ${dia} (Enviado)`;
            cardStyle = 'opacity: 0.8;';
        }

        let actionsHtml = '';
        // Mostrar ações se é hoje ou se já passou (para permitir enviar atrasado ou marcar como enviado)
        if (isHoje || isPassou) {
            actionsHtml = `
                <div style="display: flex; gap: 10px; align-items: center; margin-top: 8px;">
                    <button onclick="sendBirthdayMessage('${p.id}', '${p.nome}', '${p.telefone}', '${birthdayDateKey}')" class="btn-icon" style="background-color: #25D366; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Enviar WhatsApp">
                        📱
                    </button>
                    <label style="display: flex; align-items: center; gap: 5px; font-size: 12px; cursor: pointer; color: ${isPassou && !isSent ? '#ef4444' : '#28a745'};">
                        <input type="checkbox" id="check_${p.id}" ${isSent ? 'checked' : ''} onchange="toggleBirthdayMessage('${p.id}', '${birthdayDateKey}')">
                        ${isSent ? 'Enviado' : 'Marcar enviado'}
                    </label>
                </div>
            `;
        }
        
        return `
            <div class="card flex-card" style="margin-bottom: 10px; padding: 10px; ${cardStyle}">
                <div>
                    <h4 style="margin: 0;">${escapeHtml(p.nome)} ${isHoje ? '🎂' : ''}</h4>
                    <p class="help-text" style="margin: 0;">${statusText}</p>
                    ${actionsHtml}
                </div>
                <span class="badge badge-${badgeClass}">🎉 ${idade} anos</span>
            </div>
        `;
    }).join('');
}

function sendBirthdayMessage(id, nome, telefone, dateKey) {
    if (!telefone) {
        showToast('Pessoa sem telefone cadastrado!', 'warning');
        return;
    }
    
    // Remove caracteres não numéricos
    const cleanPhone = telefone.replace(/\D/g, '');
    // Adiciona código do país se faltar (assume BR +55 se tiver 10 ou 11 dígitos)
    const fullPhone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
    
    const primeiroNome = nome.split(' ')[0];
    let message = customBirthdayMessage || `Parabéns {nome}! 🎉 Que Deus te abençoe muito neste dia especial!`;
    message = message.replace(/{nome}/g, primeiroNome);
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(url, '_blank');
    logActivity('Envio Mensagem', `Aniversário para ${nome}`, 'mensagens');
    
    // Marca como enviado automaticamente
    const storageKey = `birthday_sent_${id}_${dateKey}`;
    localStorage.setItem(storageKey, 'true');
    
    // Atualizar visualizações
    loadAniversariantes();
    if (document.getElementById('pessoaAniversarios').classList.contains('active')) {
        loadAniversariosTab();
    }
}

function toggleBirthdayMessage(id, dateKey, checkboxId = null) {
    const elId = checkboxId || `check_${id}`;
    const checkbox = document.getElementById(elId);
    const storageKey = `birthday_sent_${id}_${dateKey}`;
    
    if (checkbox && checkbox.checked) {
        localStorage.setItem(storageKey, 'true');
    } else {
        localStorage.removeItem(storageKey);
    }
    
    // Recarregar para atualizar o visual
    loadAniversariantes();
    if (document.getElementById('pessoaAniversarios').classList.contains('active')) {
        loadAniversariosTab();
    }
}

function loadPessoasBaixaFrequencia() {
    const baixaFreq = pessoas
        .filter(p => (p.frequencia || 0) < 50 && (p.totalEventosElegiveis || 0) > 0)
        .sort((a, b) => (a.frequencia || 0) - (b.frequencia || 0))
        .slice(0, 10);
    
    const container = document.getElementById('pessoasBaixaFrequencia');
    
    if (baixaFreq.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhuma pessoa com baixa frequência</p>';
        return;
    }
    
    container.innerHTML = baixaFreq.map(pessoa => `
        <div class="card flex-card">
            <div>
                <h4 style="margin: 0;">${escapeHtml(pessoa.nome)}</h4>
                <p class="help-text" style="margin: 0;">Frequência: ${(pessoa.frequencia || 0).toFixed(1)}%</p>
            </div>
            <button class="btn-icon" onclick="sendLowFrequencyMessage('${pessoa.nome}', '${pessoa.telefone}')" title="Enviar Mensagem" style="color: #25D366;">📱</button>
        </div>
    `).join('');
}

function sendLowFrequencyMessage(nome, telefone) {
    if (!telefone) return showToast('Pessoa sem telefone.', 'warning');
    
    const cleanPhone = telefone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
    const primeiroNome = nome.split(' ')[0];
    
    let message = customLowFreqMessage || `Olá {nome}, sentimos sua falta nos últimos eventos! Está tudo bem?`;
    message = message.replace(/{nome}/g, primeiroNome);
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
    logActivity('Envio Mensagem', `Baixa frequência para ${nome}`, 'mensagens');
}

function initDestaquesDates() {
    const date = new Date();
    // Primeiro dia do mês atual
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    // Último dia do mês atual
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    document.getElementById('destaqueInicio').value = firstDay.toISOString().split('T')[0];
    document.getElementById('destaqueFim').value = lastDay.toISOString().split('T')[0];

    loadServosDestaque();
}

async function loadServosDestaque() {
    const container = document.getElementById('servosDestaqueList');
    container.innerHTML = '<p class="help-text">Calculando...</p>';

    const inicio = document.getElementById('destaqueInicio').value;
    const fim = document.getElementById('destaqueFim').value;
    const only100 = document.getElementById('destaque100Only')?.checked;

    if (!inicio || !fim) {
        showToast("Selecione o período completo.", "warning");
        return;
    }

    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    // Ajustar data fim para o final do dia
    dataFim.setHours(23, 59, 59, 999);

    try {
        // 1. Filtrar eventos no período
        const eventosPeriodo = eventos.filter(e => {
            const dataEvento = new Date(e.data);
            // Ajustar fuso horário para comparação correta de datas (string YYYY-MM-DD para Date)
            const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
            return dataEventoAjustada >= dataInicio && dataEventoAjustada <= dataFim;
        });

        if (eventosPeriodo.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum evento neste período.</p>';
            return;
        }

        // 2. Buscar todas as presenças do grupo (para evitar N queries)
        // Usa a variável global carregada no dashboard para evitar nova requisição e garantir consistência
        const todasPresencas = globalPresencas;

        // 3. Calcular frequência para cada SERVO
        const servosStats = pessoas
            .filter(p => p.tipo === 'servo')
            .map(servo => {
                // Filtrar eventos elegíveis para este servo dentro do período
                const eventosElegiveis = eventosPeriodo.filter(evento => {
                    if (evento.destinatarios === 'todos') return true;
                    if (evento.destinatarios === 'servos') {
                        if (!evento.ministerios || evento.ministerios.length === 0) return true;
                        return servo.ministerios?.some(m => evento.ministerios.includes(m));
                    }
                    return false;
                });

                const totalElegiveis = eventosElegiveis.length;
                
                if (totalElegiveis === 0) {
                    return {
                        id: servo.id,
                        nome: servo.nome,
                        ministerios: servo.ministerios || [],
                        presencas: 0,
                        total: 0,
                        porcentagem: 0
                    };
                }

                // Contar presenças
                const presencasServo = todasPresencas.filter(p => 
                    p.pessoaId === servo.id && 
                    eventosElegiveis.some(e => e.id === p.eventoId)
                ).length;

                return {
                    id: servo.id,
                    nome: servo.nome,
                    ministerios: servo.ministerios,
                    presencas: presencasServo,
                    total: totalElegiveis,
                    porcentagem: (presencasServo / totalElegiveis) * 100
                };
            })
            .filter(item => item !== null) // Remove quem não teve eventos elegíveis
            .filter(item => !only100 || (item.porcentagem === 100 && item.total > 0)) // Filtro de 100%
            .sort((a, b) => b.porcentagem - a.porcentagem || b.presencas - a.presencas); // Ordenar por % e depois por qtd absoluta

        // 4. Renderizar
        container.innerHTML = servosStats.map((s, index) => {
            let rankStyle = '';
            let medal = '';
            
            if (s.presencas === 0) {
                rankStyle = 'border-left: 4px solid #ef4444; background-color: rgba(239, 68, 68, 0.1);';
            } else {
                if (index === 0) {
                    rankStyle = 'border-left: 4px solid #FFD700; background-color: rgba(255, 215, 0, 0.1);';
                    medal = '🥇 ';
                } else if (index === 1) {
                    rankStyle = 'border-left: 4px solid #C0C0C0; background-color: rgba(192, 192, 192, 0.1);';
                    medal = '🥈 ';
                } else if (index === 2) {
                    rankStyle = 'border-left: 4px solid #CD7F32; background-color: rgba(205, 127, 50, 0.1);';
                    medal = '🥉 ';
                }
            }

            return `
            <div class="card flex-card" style="margin-bottom: 10px; padding: 10px; ${rankStyle} cursor: pointer;" onclick="showPessoaDetails('${s.id}')" title="Ver histórico de ${s.nome}">
                <div>
                    <h4 style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${medal}#${index + 1} ${escapeHtml(s.nome)}</h4>
                    <p class="help-text" style="margin: 0; white-space: normal;">${s.ministerios.map(escapeHtml).join(', ')}</p>
                </div>
                <div class="text-right-desktop">
                    <span class="badge badge-success" style="font-size: 1.1em;">${s.porcentagem.toFixed(0)}%</span>
                    <p class="help-text" style="margin: 5px 0 0 0;">${s.presencas}/${s.total} eventos</p>
                </div>
            </div>
        `}).join('');

        if (servosStats.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum dado encontrado para servos neste período.</p>';
        }

    } catch (error) {
        console.error("Erro ao calcular destaques:", error);
        container.innerHTML = '<p class="help-text">Erro ao calcular ranking.</p>';
    }
}

function initDestaquesParticipantesDates() {
    const date = new Date();
    // Primeiro dia do mês atual
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    // Último dia do mês atual
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    document.getElementById('destaquePartInicio').value = firstDay.toISOString().split('T')[0];
    document.getElementById('destaquePartFim').value = lastDay.toISOString().split('T')[0];

    loadParticipantesDestaque();
}

async function loadParticipantesDestaque() {
    const container = document.getElementById('participantesDestaqueList');
    container.innerHTML = '<p class="help-text">Calculando...</p>';

    const inicio = document.getElementById('destaquePartInicio').value;
    const fim = document.getElementById('destaquePartFim').value;
    const only100 = document.getElementById('destaquePart100Only')?.checked;

    if (!inicio || !fim) {
        showToast("Selecione o período completo.", "warning");
        return;
    }

    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    dataFim.setHours(23, 59, 59, 999);

    try {
        const eventosPeriodo = eventos.filter(e => {
            const dataEvento = new Date(e.data);
            const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
            return dataEventoAjustada >= dataInicio && dataEventoAjustada <= dataFim;
        });

        if (eventosPeriodo.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum evento neste período.</p>';
            return;
        }

        const todasPresencas = globalPresencas;

        const partStats = pessoas
            .filter(p => p.tipo === 'participante')
            .map(part => {
                // Eventos elegíveis para participantes são apenas os marcados como 'todos'
                const eventosElegiveis = eventosPeriodo.filter(evento => evento.destinatarios === 'todos');

                const totalElegiveis = eventosElegiveis.length;
                
                if (totalElegiveis === 0) {
                    return {
                        id: part.id,
                        nome: part.nome,
                        presencas: 0,
                        total: 0,
                        porcentagem: 0
                    };
                }

                const presencasPart = todasPresencas.filter(p => 
                    p.pessoaId === part.id && 
                    eventosElegiveis.some(e => e.id === p.eventoId)
                ).length;

                return {
                    id: part.id,
                    nome: part.nome,
                    presencas: presencasPart,
                    total: totalElegiveis,
                    porcentagem: (presencasPart / totalElegiveis) * 100
                };
            })
            .filter(item => item !== null)
            .filter(item => !only100 || (item.porcentagem === 100 && item.total > 0))
            .sort((a, b) => b.porcentagem - a.porcentagem || b.presencas - a.presencas);

        container.innerHTML = partStats.map((s, index) => {
            let rankStyle = '';
            let medal = '';
            
            if (s.presencas === 0) {
                rankStyle = 'border-left: 4px solid #ef4444; background-color: rgba(239, 68, 68, 0.1);';
            } else {
                if (index === 0) {
                    rankStyle = 'border-left: 4px solid #FFD700; background-color: rgba(255, 215, 0, 0.1);';
                    medal = '🥇 ';
                } else if (index === 1) {
                    rankStyle = 'border-left: 4px solid #C0C0C0; background-color: rgba(192, 192, 192, 0.1);';
                    medal = '🥈 ';
                } else if (index === 2) {
                    rankStyle = 'border-left: 4px solid #CD7F32; background-color: rgba(205, 127, 50, 0.1);';
                    medal = '🥉 ';
                }
            }

            return `
            <div class="card flex-card" style="margin-bottom: 10px; padding: 10px; ${rankStyle} cursor: pointer;" onclick="showPessoaDetails('${s.id}')" title="Ver histórico de ${s.nome}">
                <div>
                    <h4 style="margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${medal}#${index + 1} ${escapeHtml(s.nome)}</h4>
                </div>
                <div class="text-right-desktop">
                    <span class="badge badge-success" style="font-size: 1.1em;">${s.porcentagem.toFixed(0)}%</span>
                    <p class="help-text" style="margin: 5px 0 0 0;">${s.presencas}/${s.total} eventos</p>
                </div>
            </div>
        `}).join('');

        if (partStats.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum dado encontrado para participantes neste período.</p>';
        }

    } catch (error) {
        console.error("Erro ao calcular destaques participantes:", error);
        container.innerHTML = '<p class="help-text">Erro ao calcular ranking.</p>';
    }
}

function initDestaquesMinisteriosDates() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    document.getElementById('destaqueMinInicio').value = firstDay.toISOString().split('T')[0];
    document.getElementById('destaqueMinFim').value = lastDay.toISOString().split('T')[0];

    loadMinisteriosDestaque();
}

async function loadMinisteriosDestaque() {
    const container = document.getElementById('ministeriosDestaqueList');
    container.innerHTML = '<p class="help-text">Calculando...</p>';

    const inicio = document.getElementById('destaqueMinInicio').value;
    const fim = document.getElementById('destaqueMinFim').value;

    if (!inicio || !fim) {
        showToast("Selecione o período completo.", "warning");
        return;
    }

    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    dataFim.setHours(23, 59, 59, 999);

    try {
        const eventosPeriodo = eventos.filter(e => {
            const dataEvento = new Date(e.data);
            const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
            return dataEventoAjustada >= dataInicio && dataEventoAjustada <= dataFim;
        });

        if (eventosPeriodo.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum evento neste período.</p>';
            return;
        }

        const todasPresencas = globalPresencas;

        const minStats = ministerios.map(minName => {
            // Servos deste ministério
            const servosDoMinisterio = pessoas.filter(p => p.ministerios && p.ministerios.includes(minName));
            
            if (servosDoMinisterio.length === 0) return null;

            let totalPresencas = 0;
            let totalElegiveis = 0;
            let topServo = null;

            servosDoMinisterio.forEach(servo => {
                // Eventos elegíveis para este servo
                const eventosElegiveis = eventosPeriodo.filter(evento => {
                    if (evento.destinatarios === 'todos') return true;
                    if (evento.destinatarios === 'servos') {
                        if (!evento.ministerios || evento.ministerios.length === 0) return true;
                        return servo.ministerios?.some(m => evento.ministerios.includes(m));
                    }
                    return false;
                });

                totalElegiveis += eventosElegiveis.length;
                
                const presencasServo = todasPresencas.filter(p => 
                    p.pessoaId === servo.id && 
                    eventosElegiveis.some(e => e.id === p.eventoId)
                ).length;
                
                totalPresencas += presencasServo;

                // Verificar se é o destaque do ministério
                if (presencasServo > 0) {
                    if (!topServo || presencasServo > topServo.presencas) {
                        topServo = {
                            id: servo.id,
                            nome: servo.nome,
                            presencas: presencasServo
                        };
                    }
                }
            });

            if (totalElegiveis === 0) return null;

            return {
                nome: minName,
                presencas: totalPresencas,
                total: totalElegiveis,
                servosCount: servosDoMinisterio.length,
                porcentagem: (totalPresencas / totalElegiveis) * 100,
                topServo: topServo
            };
        })
        .filter(item => item !== null)
        .sort((a, b) => b.porcentagem - a.porcentagem);

        container.innerHTML = minStats.map((s, index) => {
            const style = getMinisterioStyle(s.nome);
            const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(s.nome)}`;
            
            let rankStyle = '';
            let medal = '';
            if (index === 0) {
                rankStyle = 'border-left: 4px solid #FFD700; background-color: rgba(255, 215, 0, 0.1);';
                medal = '🥇 ';
            } else if (index === 1) {
                rankStyle = 'border-left: 4px solid #C0C0C0; background-color: rgba(192, 192, 192, 0.1);';
                medal = '🥈 ';
            } else if (index === 2) {
                rankStyle = 'border-left: 4px solid #CD7F32; background-color: rgba(205, 127, 50, 0.1);';
                medal = '🥉 ';
            }

            return `
            <div class="card" style="margin-bottom: 10px; padding: 10px; ${rankStyle}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <h4 style="margin: 0;">${medal}#${index + 1}</h4>
                            <span class="${className}" style="${style}; font-size: 0.9rem;">${escapeHtml(s.nome)}</span>
                        </div>
                        <p class="help-text" style="margin: 0;">${s.servosCount} servos</p>
                    </div>
                    <div class="text-right-desktop">
                        <span class="badge badge-success" style="font-size: 1.1em;">${s.porcentagem.toFixed(0)}%</span>
                        <p class="help-text" style="margin: 5px 0 0 0;">Média do grupo</p>
                    </div>
                </div>
                ${s.topServo ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;" onclick="showPessoaDetails('${s.topServo.id}')" title="Ver histórico de ${s.topServo.nome}">
                    ⭐ <strong>Destaque:</strong> ${escapeHtml(s.topServo.nome)} (${s.topServo.presencas} presenças)
                </div>
                ` : ''}
            </div>
        `}).join('');

        if (minStats.length === 0) {
            container.innerHTML = '<p class="help-text">Nenhum dado encontrado para ministérios neste período.</p>';
        }

    } catch (error) {
        console.error("Erro ao calcular destaques ministérios:", error);
        container.innerHTML = '<p class="help-text">Erro ao calcular ranking.</p>';
    }
}

// ==================== PESSOAS ====================

function getFilteredPessoas() {
    const search = document.getElementById('searchPessoa')?.value?.toLowerCase() || '';
    const ordem = document.getElementById('filterOrdem')?.value || '';

    let filtered = [...pessoas];
    
    // Filtrar por busca
    if (search) {
        filtered = filtered.filter(p => p.nome.toLowerCase().includes(search));
    }
    
    // Filtrar por tipo
    if (currentTipoFilter) {
        filtered = filtered.filter(p => p.tipo === currentTipoFilter);
    }

    // Filtrar por ministério
    if (currentMinisterioFilters.size > 0) {
        filtered = filtered.filter(p => 
            p.ministerios && 
            [...currentMinisterioFilters].every(m => p.ministerios.includes(m))
        );
    }
    
    // Filtrar por coordenadores
    if (showCoordinatorsOnly) {
        const allCoords = [];
        Object.values(ministerioCoordinators).forEach(val => {
            if (Array.isArray(val)) allCoords.push(...val);
            else if (val) allCoords.push(val);
        });
        const coordinatorIds = new Set(allCoords);
        filtered = filtered.filter(p => coordinatorIds.has(p.id));
    }

    // Filtrar por retiros
    if (currentRetiroFilters.size > 0) {
        filtered = filtered.filter(p => {
            const pRetiros = globalPersonRetirosMap[p.id] || [];
            return [...currentRetiroFilters].every(filterName => {
                return pRetiros.some(r => r.name === filterName && !r.isTeam);
            });
        });
    }

    // Ordenar
    if (ordem === 'nome') {
        filtered.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (ordem === 'idade') {
        filtered.sort((a, b) => calculateAge(a.dataNascimento) - calculateAge(b.dataNascimento));
    }
    
    return filtered;
}

async function loadPessoas(resetPage = true, animate = false) {
    if (resetPage) currentPage = 1;

    // Atualizar estado visual dos botões de visualização
    document.getElementById('btnPessoaViewList')?.classList.toggle('active', currentPessoaView === 'list');
    document.getElementById('btnPessoaViewCards')?.classList.toggle('active', currentPessoaView === 'cards');

    const itemsPerPageInput = document.getElementById('itemsPerPage');
    if (itemsPerPageInput) {
        const val = itemsPerPageInput.value;
        itemsPerPage = val === 'all' ? 999999 : parseInt(val);
    }

    const filtered = getFilteredPessoas();
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedList = filtered.slice(start, end);
    
    renderPessoasTable(paginatedList, filtered, totalPages, animate);
}

function toggleCoordinatorFilter() {
    showCoordinatorsOnly = !showCoordinatorsOnly;
    const btn = document.getElementById('btnCoordinatorFilter');
    
    if (showCoordinatorsOnly) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        showToast('Filtrando por coordenadores', 'info');
    } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        showToast('Filtro de coordenadores removido', 'info');
    }
    
    loadPessoas();
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2);
}

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 40%)`;
}

function getMinisterioColorClass(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % 8) + 1;
    return `tag-color-${index}`;
}

function getContrastYIQ(hexcolor){
    if (!hexcolor) return '#495057';
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#1f2937' : '#ffffff';
}

function getMinisterioStyle(name) {
    const color = ministerioColors[name];
    if (!color) return '';
    const textColor = getContrastYIQ(color);
    return `background-color: ${color}; color: ${textColor}; border-color: ${color};`;
}

function filterByMinisterio(ministerio) {
    if (currentMinisterioFilters.has(ministerio)) {
        currentMinisterioFilters.delete(ministerio);
        showToast(`Filtro removido: ${ministerio}`, 'info');
    } else {
        currentMinisterioFilters.add(ministerio);
        showToast(`Filtro adicionado: ${ministerio}`, 'info');
    }
    updateMinisterioSelectVisuals();
    loadPessoas();
}

function filterByRetiro(retiro) {
    if (currentRetiroFilters.has(retiro)) {
        currentRetiroFilters.delete(retiro);
        showToast(`Filtro removido: ${retiro}`, 'info');
    } else {
        currentRetiroFilters.add(retiro);
        showToast(`Filtrando por: ${retiro}`, 'info');
    }
    loadPessoas();
}

function handleMinisterioSelect(value) {
    currentMinisterioFilters.clear();
    if (value) {
        currentMinisterioFilters.add(value);
        showToast(`Filtrando por: ${value}`, 'info');
    } else {
        showToast('Filtro de ministério removido', 'info');
    }
    loadPessoas();
}

function updateMinisterioSelectVisuals() {
    const select = document.getElementById('filterMinisterio');
    if (!select) return;
    
    if (currentMinisterioFilters.size === 1) {
        select.value = [...currentMinisterioFilters][0];
    } else {
        select.value = '';
    }
}

function filterByTipo(tipo) {
    if (currentTipoFilter === tipo) {
        currentTipoFilter = '';
        showToast('Filtro de tipo removido', 'info');
    } else {
        currentTipoFilter = tipo;
        showToast(`Filtrando por: ${tipo}`, 'info');
    }
    loadPessoas();
}

function setPessoaView(view) {
    currentPessoaView = view;
    localStorage.setItem('pessoaView', view);
    document.getElementById('btnPessoaViewList')?.classList.toggle('active', view === 'list');
    document.getElementById('btnPessoaViewCards')?.classList.toggle('active', view === 'cards');
    loadPessoas(false, true);
}

function clearPessoasFilters() {
    const search = document.getElementById('searchPessoa');
    const ministerio = document.getElementById('filterMinisterio');
    const ordem = document.getElementById('filterOrdem');

    if (search) search.value = '';
    if (ministerio) ministerio.value = '';
    if (ordem) ordem.value = 'nome';
    currentTipoFilter = '';
    currentMinisterioFilters.clear();
    currentRetiroFilters.clear();

    if (showCoordinatorsOnly) {
        showCoordinatorsOnly = false;
        const btn = document.getElementById('btnCoordinatorFilter');
        if (btn) {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }
    }
    
    loadPessoas();
    
    showToast('Filtros limpos', 'info');
}

function getCoordinatorRoles(personId) {
    const roles = [];
    if (!ministerioCoordinators) return roles;
    
    for (const [ministry, coordinators] of Object.entries(ministerioCoordinators)) {
        if (Array.isArray(coordinators)) {
            if (coordinators.includes(personId)) roles.push(ministry);
        } else if (coordinators === personId) {
            roles.push(ministry);
        }
    }
    return roles;
}

function getRetiroTagsHtml(personId, showTeam = false) {
    const retiros = globalPersonRetirosMap[personId];
    if (!retiros || retiros.length === 0) return '';
    
    return retiros.map(r => {
        if (r.isTeam && !showTeam) return ''; // Esconde equipe se não for solicitado

        const isSelected = currentRetiroFilters.has(r.name);
        const borderStyle = isSelected ? 'border: 2px solid #fbbf24;' : '';
        const safeName = r.name.replace(/'/g, "\\'");
        const bgColor = r.isTeam ? '#f97316' : '#8b5cf6'; // Laranja para equipe, Roxo para participante
        const icon = r.isTeam ? '🛠️' : '⛺';
        
        return `<span class="badge" onclick="event.stopPropagation(); filterByRetiro('${safeName}')" style="background-color: ${bgColor}; color: white; font-size: 0.7em; margin-left: 4px; vertical-align: middle; cursor: pointer; ${borderStyle}" title="${isSelected ? 'Remover filtro' : 'Filtrar por ' + r.name} (${r.isTeam ? 'Equipe' : 'Participante'})">${icon} ${r.name}</span>`;
    }).join('');
}

function renderPessoasTable(pessoasList, allFilteredPessoas, totalPages = 1, animate = false) {
    const container = document.getElementById('pessoasTable');
    
    const search = document.getElementById('searchPessoa')?.value;
    const ordem = document.getElementById('filterOrdem')?.value;
    const hasFilters = search || currentMinisterioFilters.size > 0 || currentRetiroFilters.size > 0 || ordem || currentTipoFilter || showCoordinatorsOnly;

    if (pessoasList.length === 0) {
        let html = '<p class="help-text">Nenhuma pessoa encontrada</p>';
        if (hasFilters) {
            html += `<div style="text-align: center; margin-top: 10px;"><button class="btn-secondary" onclick="clearPessoasFilters()">Limpar Filtros</button></div>`;
        }
        container.innerHTML = html;
        return;
    }
    
    // Calcular resumo
    const totalVisible = pessoasList.length;
    const totalFiltered = allFilteredPessoas.length;
    const servos = allFilteredPessoas.filter(p => p.tipo === 'servo').length;
    const participantes = allFilteredPessoas.filter(p => p.tipo === 'participante').length;
    const isCardView = currentPessoaView === 'cards';
    const animationClass = animate ? 'fade-in' : '';

    let html = `
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.9em; color: var(--text-secondary); background: var(--bg-tertiary); padding: 8px 12px; border-radius: 8px;">
                <strong>Mostrando ${totalVisible} de ${totalFiltered}</strong> pessoas encontradas 
                <span style="margin: 0 5px; color: var(--border);">|</span> 
                <strong>${servos}</strong> Servos, <strong>${participantes}</strong> Participantes
            </div>
            ${hasFilters ? '<button class="btn-secondary" onclick="clearPessoasFilters()" style="font-size: 0.9em;">Limpar Filtros</button>' : ''}
        </div>
        
        <!-- Visualização Tabela (Desktop - Apenas se não estiver em modo Card) -->
        ${!isCardView ? `
        <div class="desktop-view ${animationClass}">
            <table class="table">
                <thead>
                    <tr>
                        ${selectionMode ? '<th><input type="checkbox" onchange="toggleSelectAll(this)"></th>' : ''}
                        <th>Nome</th>
                        <th>Idade</th>
                        <th>Telefone</th>
                        <th>Tipo</th>
                        <th>Ministérios</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${pessoasList.map(pessoa => {
                        const coordinatorRoles = getCoordinatorRoles(pessoa.id);
                        const coordinatorIcon = coordinatorRoles.length > 0 
                            ? `<span title="Coordenador(a) do ministério ${coordinatorRoles.join(', ')}" style="cursor: help; margin-left: 5px; font-size: 0.9em;">⭐</span>` 
                            : '';
                        return `
                        <tr class="${selectedItems.has(pessoa.id) ? 'selected' : ''} ${pessoa.tipo === 'servo' ? 'servo-row' : 'participante-row'}" onclick="showPessoaDetails('${pessoa.id}')">
                            ${selectionMode ? `<td><input type="checkbox" ${selectedItems.has(pessoa.id) ? 'checked' : ''} onchange="toggleSelect('${pessoa.id}')" onclick="event.stopPropagation()"></td>` : ''}
                            <td>
                                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 5px;">
                                    <div style="display: flex; align-items: center;">
                                        <div class="avatar" style="background-color: ${getAvatarColor(pessoa.nome)}">${getInitials(pessoa.nome)}</div>
                                        ${escapeHtml(pessoa.nome)} ${coordinatorIcon}
                                    </div>
                                    ${getRetiroTagsHtml(pessoa.id)}
                                </div>
                            </td>
                            <td>${calculateAge(pessoa.dataNascimento)} anos</td>
                            <td>${escapeHtml(pessoa.telefone)}</td>
                            <td><span class="badge badge-${pessoa.tipo === 'servo' ? 'primary' : 'success'}" style="cursor: pointer; ${currentTipoFilter === pessoa.tipo ? 'border: 2px solid currentColor;' : ''}" onclick="event.stopPropagation(); filterByTipo('${pessoa.tipo}')" title="${currentTipoFilter === pessoa.tipo ? 'Remover filtro' : 'Filtrar por ' + pessoa.tipo}">${pessoa.tipo}</span></td>
                            <td>
                                <div style="display: flex; flex-wrap: wrap; gap: 3px; max-width: 250px;">
                                    ${(pessoa.ministerios && pessoa.ministerios.length > 0) ? pessoa.ministerios.map(m => {
                                        const style = getMinisterioStyle(m);
                                        const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                                        const isSelected = currentMinisterioFilters.has(m);
                                        const activeStyle = isSelected ? 'border: 2px solid currentColor;' : '';
                                        return `<span onclick="event.stopPropagation(); filterByMinisterio('${m}')" class="${className}" style="${style} ${activeStyle}" title="${isSelected ? 'Remover filtro' : 'Filtrar por ' + m}">${escapeHtml(m)}</span>`;
                                    }).join('') : '<span style="color: var(--text-tertiary); font-size: 0.8em; font-style: italic;">Sem ministérios</span>'}
                                </div>
                            </td>
                            <td>
                                <div class="action-menu-container" onclick="event.stopPropagation()">
                                    <button class="action-menu-btn" onclick="toggleActionMenu('${pessoa.id}', event)" title="Ações">⋮</button>
                                    <div id="menu-${pessoa.id}" class="action-menu-dropdown">
                                        <button class="action-menu-item" onclick="openPersonWhatsApp('${escapeHtml(pessoa.nome)}', '${escapeHtml(pessoa.telefone)}')">
                                            <span style="width: 20px; text-align: center; color: #25D366;">📱</span> WhatsApp
                                        </button>
                                        <button class="action-menu-item" onclick="showPessoaDetails('${pessoa.id}')">
                                            <span style="width: 20px; text-align: center;">📋</span> Histórico
                                        </button>
                                        <button class="action-menu-item" onclick="editPessoa('${pessoa.id}')">
                                            <span style="width: 20px; text-align: center;">✏️</span> Editar
                                        </button>
                                        <button class="action-menu-item" onclick="generateBarcode('${pessoa.id}')">
                                            <span style="width: 20px; text-align: center;">🏷️</span> Gerar Código
                                        </button>
                                        <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
                                        <button class="action-menu-item danger" onclick="deletePessoa('${pessoa.id}')">
                                            <span style="width: 20px; text-align: center;">🗑️</span> Excluir
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <!-- Visualização Cards (Mobile ou Desktop se selecionado) -->
        <div class="${isCardView ? 'pessoas-grid' : 'mobile-view'} ${animationClass}">
            ${pessoasList.map(pessoa => {
                const coordinatorRoles = getCoordinatorRoles(pessoa.id);
                const coordinatorIcon = coordinatorRoles.length > 0 
                    ? `<span title="Coordenador(a) do ministério ${coordinatorRoles.join(', ')}" style="cursor: help; margin-left: 5px; font-size: 0.9em;">⭐</span>` 
                    : '';
                return `
                <div class="card pessoa-card ${pessoa.tipo}" style="margin-bottom: 1rem; ${selectedItems.has(pessoa.id) ? 'border: 2px solid var(--primary);' : ''}" onclick="showPessoaDetails('${pessoa.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${selectionMode ? `<input type="checkbox" ${selectedItems.has(pessoa.id) ? 'checked' : ''} onchange="toggleSelect('${pessoa.id}')" onclick="event.stopPropagation()" style="transform: scale(1.2);">` : ''}
                            <div class="avatar" style="background-color: ${getAvatarColor(pessoa.nome)}">${getInitials(pessoa.nome)}</div>
                            <div>
                                <h4 style="margin: 0;">${pessoa.nome} ${coordinatorIcon}</h4>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;">
                                    ${getRetiroTagsHtml(pessoa.id)}
                                </div>
                                <p class="help-text" style="margin: 0;">${calculateAge(pessoa.dataNascimento)} anos</p>
                            </div>
                        </div>
                        <span class="badge badge-${pessoa.tipo === 'servo' ? 'primary' : 'success'}" onclick="event.stopPropagation(); filterByTipo('${pessoa.tipo}')">${pessoa.tipo}</span>
                    </div>
                    
                    <div style="margin-bottom: 10px; padding-left: ${selectionMode ? '30px' : '0'};">
                        ${pessoa.telefone ? `<p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 5px;">📞 ${pessoa.telefone}</p>` : ''}
                        
                        ${(pessoa.ministerios && pessoa.ministerios.length > 0) ? `
                            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
                                ${pessoa.ministerios.map(m => {
                                    const style = getMinisterioStyle(m);
                                    const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                                    return `<span onclick="event.stopPropagation(); filterByMinisterio('${m}')" class="${className}" style="${style}">${m}</span>`;
                                }).join('')}
                            </div>
                        ` : '<div style="color: var(--text-tertiary); font-size: 0.8em; font-style: italic; margin-top: 8px;">Sem ministérios</div>'}
                    </div>

                    <div style="display: flex; gap: 5px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 10px;">
                        <button class="btn-secondary" onclick="event.stopPropagation(); openPersonWhatsApp('${pessoa.nome}', '${pessoa.telefone}')" style="flex: 1; padding: 8px;" title="WhatsApp">📱</button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); showPessoaDetails('${pessoa.id}')" style="flex: 1; padding: 8px;" title="Histórico">📋</button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); editPessoa('${pessoa.id}')" style="flex: 1; padding: 8px;" title="Editar">✏️</button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); deletePessoa('${pessoa.id}')" style="flex: 1; padding: 8px; color: var(--danger);" title="Excluir">🗑️</button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); generateBarcode('${pessoa.id}')" style="flex: 1; padding: 8px;" title="Código">🏷️</button>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;

    if (totalPages > 1) {
        html += `
            <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem;">
                <button class="btn-secondary" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
                <span>Página ${currentPage} de ${totalPages}</span>
                <button class="btn-secondary" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Próxima</button>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function changePage(newPage) {
    currentPage = newPage;
    loadPessoas(false);
}

function openPersonWhatsApp(nome, telefone) {
    if (!telefone) return showToast('Pessoa sem telefone.', 'warning');
    
    const cleanPhone = telefone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
    
    // Abre o chat sem mensagem pré-definida
    window.open(`https://wa.me/${fullPhone}`, '_blank');
}

// Mostrar formulário de nova pessoa
function showPessoaForm(pessoaId = null, prefillData = null) {
    const pessoa = pessoaId ? pessoas.find(p => p.id === pessoaId) : (prefillData || null);
    
    const modalBody = `
        <h2>${pessoa ? 'Editar' : 'Nova'} Pessoa</h2>
        <form id="pessoaForm">
            <div class="form-group">
                <label>Nome Completo *</label>
                <input type="text" id="pessoaNome" class="input-field" value="${pessoa?.nome || ''}" required>
                <div id="nameFeedback" style="font-size: 0.85em; margin-top: 4px; display: none;"></div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Data de Nascimento *</label>
                    <input type="date" id="pessoaDataNasc" class="input-field" value="${pessoa?.dataNascimento || ''}" required>
                </div>
                <div class="form-group">
                    <label>Telefone (WhatsApp)</label>
                    <input type="tel" id="pessoaTelefone" class="input-field" value="${pessoa?.telefone || ''}">
                </div>
            </div>
            
            <div class="form-group">
                <label>Endereço</label>
                <input type="text" id="pessoaEndereco" class="input-field" value="${pessoa?.endereco || ''}">
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Nome do Responsável</label>
                    <input type="text" id="pessoaResponsavel" class="input-field" value="${pessoa?.responsavel || ''}">
                </div>
                <div class="form-group">
                    <label>Telefone do Responsável</label>
                    <input type="tel" id="pessoaTelResp" class="input-field" value="${pessoa?.telefoneResponsavel || ''}">
                </div>
            </div>
            
            <div class="form-group">
                <label>Tipo de Participante</label>
                <select id="pessoaTipo" class="input-field">
                    <option value="participante" ${pessoa?.tipo === 'participante' ? 'selected' : ''}>Participante</option>
                    <option value="servo" ${pessoa?.tipo === 'servo' ? 'selected' : ''}>Servo</option>
                </select>
            </div>
            
            <div class="form-group" id="ministeriosGroup">
                <label>Ministérios</label>
                <div class="checkbox-group" id="ministeriosCheckboxes">
                    ${ministerios.map(m => `
                        <div class="checkbox-item">
                            <input type="checkbox" id="min_${m}" value="${m}" 
                                ${pessoa?.ministerios?.includes(m) ? 'checked' : ''}>
                            <label for="min_${m}">${m}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <button type="submit" class="btn-primary">${pessoa ? 'Atualizar' : 'Cadastrar'}</button>
        </form>
    `;
    
    showModal(modalBody);

    // Verificação de duplicidade em tempo real
    document.getElementById('pessoaNome').addEventListener('input', function(e) {
        const val = e.target.value.trim().toLowerCase();
        const feedback = document.getElementById('nameFeedback');
        
        if (val.length > 2) {
            // Verifica se existe alguém com nome similar (exceto a própria pessoa se for edição)
            const duplicata = pessoas.find(p => p.nome.toLowerCase() === val && p.id !== pessoaId);
            if (duplicata) {
                feedback.style.display = 'block';
                feedback.style.color = 'var(--warning)';
                feedback.innerHTML = `⚠️ Atenção: Já existe uma pessoa chamada <strong>${duplicata.nome}</strong> (${duplicata.tipo}).`;
            } else {
                feedback.style.display = 'none';
            }
        } else {
            feedback.style.display = 'none';
        }
    });
    
    document.getElementById('pessoaForm').onsubmit = async (e) => {
        e.preventDefault();
        const savedId = await savePessoa(pessoaId);
        if (savedId && prefillData && prefillData.onSave) {
            await prefillData.onSave(savedId);
        }
    };
}

async function savePessoa(pessoaId) {
    const btnSubmit = document.querySelector('#pessoaForm button[type="submit"]');
    let originalText = '';
    if (btnSubmit) {
        if (btnSubmit.disabled) return; // Previne múltiplos cliques
        btnSubmit.disabled = true;
        originalText = btnSubmit.textContent;
        btnSubmit.textContent = 'Salvando...';
    }

    const nome = document.getElementById('pessoaNome').value;
    const dataNascimento = document.getElementById('pessoaDataNasc').value;
    const telefone = document.getElementById('pessoaTelefone').value;
    const endereco = document.getElementById('pessoaEndereco').value;
    const responsavel = document.getElementById('pessoaResponsavel').value;
    const telefoneResponsavel = document.getElementById('pessoaTelResp').value;
    const tipo = document.getElementById('pessoaTipo').value;
    
    let ministeriosSelecionados = [];
    ministerios.forEach(m => {
        const checkbox = document.getElementById(`min_${m}`);
        if (checkbox && checkbox.checked) {
            ministeriosSelecionados.push(m);
        }
    });
    
    const pessoaData = {
        nome,
        dataNascimento,
        telefone,
        endereco,
        responsavel,
        telefoneResponsavel,
        tipo,
        ministerios: ministeriosSelecionados,
        groupId: currentGroupId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (!pessoaId) {
        pessoaData.barcode = generateBarcodeValue();
    }

    try {
        if (pessoaId) {
            // Capturar dados antigos para log de alterações
            const oldDoc = await db.collection('pessoas').doc(pessoaId).get();
            const oldData = oldDoc.data();

            await db.collection('pessoas').doc(pessoaId).update(pessoaData);
            
            // Calcular diferenças
            const changes = [];
            if (oldData.nome !== nome) changes.push(`Nome: "${oldData.nome}" → "${nome}"`);
            if (oldData.dataNascimento !== dataNascimento) changes.push(`Nascimento: "${formatDate(oldData.dataNascimento)}" → "${formatDate(dataNascimento)}"`);
            if (oldData.telefone !== telefone) changes.push(`Telefone: "${oldData.telefone}" → "${telefone}"`);
            if (oldData.tipo !== tipo) changes.push(`Tipo: "${oldData.tipo}" → "${tipo}"`);
            
            const oldMins = oldData.ministerios || [];
            const newMins = ministeriosSelecionados || [];
            const added = newMins.filter(x => !oldMins.includes(x));
            const removed = oldMins.filter(x => !newMins.includes(x));
            
            if (added.length) changes.push(`+ Ministérios: ${added.join(', ')}`);
            if (removed.length) changes.push(`- Ministérios: ${removed.join(', ')}`);
            
            const details = changes.length > 0 ? `Alterações em ${nome}:\n${changes.join('\n')}` : `Edição em ${nome} (sem alterações detectadas)`;
            logActivity('Editar Pessoa', details, 'pessoas');
            
            closeModal();
            await loadDashboard();
            loadPessoas();
            return pessoaId;
        } else {
            pessoaData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('pessoas').add(pessoaData);
            logActivity('Criar Pessoa', `Nome: ${nome}`, 'pessoas');
            
            closeModal();
            await loadDashboard();
            loadPessoas();
            return docRef.id;
        }
    } catch (error) {
        showToast('Erro ao salvar pessoa: ' + error.message, 'error');
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = originalText;
        }
        return null;
    }
}

function editPessoa(pessoaId) {
    showPessoaForm(pessoaId);
}

async function deletePessoa(pessoaId) {
    if (confirm('Tem certeza que deseja excluir esta pessoa?')) {
        const pessoa = pessoas.find(p => p.id === pessoaId);
        try {
            await db.collection('pessoas').doc(pessoaId).delete();
            logActivity('Excluir Pessoa', `Nome: ${pessoa ? pessoa.nome : 'Desconhecido'}`, 'pessoas');
            await loadDashboard();
            loadPessoas();
        } catch (error) {
            showToast('Erro ao excluir pessoa: ' + error.message, 'error');
        }
    }
}

// Modo de seleção
function toggleSelectionMode() {
    selectionMode = !selectionMode;
    selectedItems.clear();
    
    if (selectionMode) {
        document.getElementById('btnSelecionar').textContent = 'Cancelar Seleção';
        document.getElementById('selectionActions').style.display = 'flex';
    } else {
        document.getElementById('btnSelecionar').textContent = 'Modo Seleção';
        document.getElementById('selectionActions').style.display = 'none';
    }
    
    loadPessoas(false);
}

function toggleSelect(id) {
    if (selectedItems.has(id)) {
        selectedItems.delete(id);
    } else {
        selectedItems.add(id);
    }
    loadPessoas(false);
}

function toggleSelectAll(checkbox) {
    if (checkbox.checked) {
        pessoas.forEach(p => selectedItems.add(p.id));
    } else {
        selectedItems.clear();
    }
    loadPessoas(false);
}

function cancelSelection() {
    toggleSelectionMode();
}

async function deleteSelected() {
    if (selectedItems.size === 0) {
        showToast('Nenhuma pessoa selecionada', 'warning');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir ${selectedItems.size} pessoa(s)?`)) {
        try {
            const batch = db.batch();
            selectedItems.forEach(id => {
                batch.delete(db.collection('pessoas').doc(id));
            });
            await batch.commit();
            logActivity('Excluir em Massa', `Excluídas ${selectedItems.size} pessoas`, 'pessoas');
            
            toggleSelectionMode();
            await loadDashboard();
            loadPessoas();
        } catch (error) {
            showToast('Erro ao excluir pessoas: ' + error.message, 'error');
        }
    }
}

function printSelectedBarcodes() {
    if (selectedItems.size === 0) {
        showToast('Nenhuma pessoa selecionada', 'warning');
        return;
    }

    const selectedPeople = pessoas.filter(p => selectedItems.has(p.id));
    
    const win = window.open('', '', 'height=600,width=800');
    
    win.document.write(`
        <html>
            <head>
                <title>Imprimir Códigos de Barras</title>
                <style>
                    body { 
                        font-family: sans-serif; 
                        margin: 0; 
                        padding: 20px;
                    }
                    .barcode-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 15px;
                    }
                    .barcode-item {
                        border: 1px dashed #ccc;
                        padding: 10px;
                        text-align: center;
                        page-break-inside: avoid;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 140px;
                    }
                    h3 { margin: 0 0 5px 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                    svg { max-width: 100%; height: auto; }
                    @media print {
                        @page { margin: 1cm; }
                        .barcode-item { break-inside: avoid; }
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
            </head>
            <body>
                <div class="barcode-grid">
                    ${selectedPeople.map(p => `
                        <div class="barcode-item">
                            <h3>${p.nome}</h3>
                            <svg class="barcode"
                                jsbarcode-value="${p.barcode}"
                                jsbarcode-format="CODE128"
                                jsbarcode-width="2"
                                jsbarcode-height="50"
                                jsbarcode-fontSize="12"
                                jsbarcode-displayValue="true">
                            </svg>
                        </div>
                    `).join('')}
                </div>
                <script>
                    window.onload = function() {
                        try {
                            JsBarcode(".barcode").init();
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
                        } catch (e) {
                            console.error(e);
                            // Em janela popup, alert é aceitável, mas o toast na janela principal é melhor
                        }
                    }
                </script>
            </body>
        </html>
    `);
    
    win.document.close();
}

function exportPessoasCSV() {
    const filtered = getFilteredPessoas();
    
    if (filtered.length === 0) {
        showToast('Nenhuma pessoa para exportar.', 'warning');
        return;
    }
    
    // Cabeçalho do CSV
    let csvContent = "Nome,Data Nascimento,Idade,Telefone,Tipo,Ministerios\n";
    
    filtered.forEach(p => {
        const idade = calculateAge(p.dataNascimento);
        const ministerios = p.ministerios ? p.ministerios.join('; ') : '';
        const row = `"${p.nome}","${formatDate(p.dataNascimento)}","${idade}","${p.telefone}","${p.tipo}","${ministerios}"`;
        csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lista_pessoas.csv";
    link.click();
}

function downloadImportTemplate() {
    const headers = [
        "Nome completo",
        "Data de Nascimento",
        "Telefone",
        "Endereço",
        "Nome do Responsável",
        "Telefone do Responsável",
        "Serve em algum ministério?"
    ];

    const exampleRow = [
        "João Silva",
        "15/05/2000",
        "(11) 99999-9999",
        "Rua Exemplo, 123",
        "",
        "",
        "Música, Intercessão"
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    
    // Ajustar largura das colunas para melhor visualização
    ws['!cols'] = [{wch: 30}, {wch: 15}, {wch: 15}, {wch: 30}, {wch: 20}, {wch: 15}, {wch: 40}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Importação");

    XLSX.writeFile(wb, "modelo_importacao_pessoas.xlsx");
}

// ==================== IMPORTAÇÃO ====================

function triggerImport() {
    document.getElementById('importFile').click();
}

async function handleImportFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { cellDates: true });

            if (json.length === 0) {
                showToast("Planilha vazia!", "warning");
                return;
            }

            // Chama a pré-visualização em vez de processar direto
            previewImportData(json);
            
        } catch (error) {
            console.error(error);
            showToast("Erro ao ler arquivo: " + error.message, 'error');
        }
        input.value = ''; // Resetar input
    };
    reader.readAsArrayBuffer(file);
}

function previewImportData(data) {
    pendingImportList = [];
    pendingNewMinisterios = [];
    let tempMinisterios = [...ministerios];

    for (const row of data) {
        // Função auxiliar para buscar valor ignorando case sensitive nas chaves
        const getVal = (keyPart) => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
            return key ? row[key] : '';
        };

        const nome = getVal('Nome completo') || getVal('Nome');
        if (!nome) continue; // Pular linhas sem nome

        const dataNascRaw = getVal('Data de Nascimento');
        const telefone = getVal('Telefone');
        const endereco = getVal('Endereço');
        const responsavel = getVal('Nome do Responsável');
        const telResp = getVal('Telefone do Responsável');
        const ministerioRaw = getVal('Serve em algum ministério');

        // Validação de Duplicidade
        const telefoneLimpo = telefone ? String(telefone).replace(/\D/g, '') : '';
        let status = 'valid';
        let statusMsg = 'Pronto';
        
        const isDuplicate = pessoas.some(p => {
            if (p.nome.trim().toLowerCase() === nome.trim().toLowerCase()) return true;
            if (telefoneLimpo.length > 8 && p.telefone) {
                const pPhone = p.telefone.replace(/\D/g, '');
                if (pPhone === telefoneLimpo) return true;
            }
            return false;
        });

        if (isDuplicate) {
            status = 'duplicate';
            statusMsg = 'Duplicado';
        }

        // Processar Data de Nascimento
        let dataNascimento = '';
        if (dataNascRaw) {
            if (dataNascRaw instanceof Date) {
                // Formata o objeto Date para YYYY-MM-DD
                const year = dataNascRaw.getFullYear();
                const month = String(dataNascRaw.getMonth() + 1).padStart(2, '0');
                const day = String(dataNascRaw.getDate()).padStart(2, '0');
                dataNascimento = `${year}-${month}-${day}`;
            } else if (typeof dataNascRaw === 'number') {
                // Handle Excel serial date number
                const date = new Date((dataNascRaw - 25569) * 86400 * 1000);
                // Adjust for timezone offset to get the correct day
                const adjustedDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
                const year = adjustedDate.getFullYear();
                const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
                const day = String(adjustedDate.getDate()).padStart(2, '0');
                dataNascimento = `${year}-${month}-${day}`;
            } else if (typeof dataNascRaw === 'string' && dataNascRaw.includes('/')) {
                const parts = dataNascRaw.split('/');
                if (parts.length === 3) {
                    dataNascimento = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
        }

        // Processar Ministérios e Tipo
        let tipo = 'participante';
        let ministeriosSelecionados = [];

        if (ministerioRaw && typeof ministerioRaw === 'string') {
            const val = ministerioRaw.trim().toLowerCase();
            if (val !== 'não' && val !== 'nao' && val !== '') {
                tipo = 'servo';
                const parts = ministerioRaw.split(',').map(s => s.trim());
                
                parts.forEach(p => {
                    const normalized = normalizeMinisterioName(p, tempMinisterios);
                    if (normalized) {
                        if (!tempMinisterios.some(m => m.toLowerCase() === normalized.toLowerCase())) {
                            tempMinisterios.push(normalized);
                            if (!pendingNewMinisterios.includes(normalized)) {
                                pendingNewMinisterios.push(normalized);
                            }
                        }
                        ministeriosSelecionados.push(normalized);
                    }
                });
            }
        }

        // Adicionar "Servo Geral" automaticamente se for servo
        if (tipo === 'servo') {
            const servoGeralMinistry = 'Servo Geral';
            if (!ministeriosSelecionados.includes(servoGeralMinistry)) {
                ministeriosSelecionados.push(servoGeralMinistry);
            }
            if (!tempMinisterios.some(m => m.toLowerCase() === servoGeralMinistry.toLowerCase())) {
                tempMinisterios.push(servoGeralMinistry);
                if (!pendingNewMinisterios.includes(servoGeralMinistry)) {
                    pendingNewMinisterios.push(servoGeralMinistry);
                }
            }
        }

        const pessoaData = {
            nome: nome,
            dataNascimento: dataNascimento,
            telefone: telefone ? String(telefone) : '',
            endereco: endereco || '',
            responsavel: responsavel || '',
            telefoneResponsavel: telResp ? String(telResp) : '',
            tipo: tipo,
            ministerios: ministeriosSelecionados,
            groupId: currentGroupId
        };

        pendingImportList.push({
            data: pessoaData,
            status: status,
            statusMsg: statusMsg
        });
    }
    renderImportPreview();
}

function renderImportPreview() {
    const container = document.getElementById('importPreviewContainer');
    const tbody = document.getElementById('importPreviewBody');
    
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
    
    tbody.innerHTML = pendingImportList.map(item => `
        <tr style="${item.status === 'duplicate' ? 'opacity: 0.6; background: rgba(0,0,0,0.05);' : ''}">
            <td>${item.data.nome}</td>
            <td>${item.data.telefone}</td>
            <td>${item.data.tipo}</td>
            <td>${item.data.ministerios.join(', ')}</td>
            <td>
                <span class="badge badge-${item.status === 'valid' ? 'success' : 'warning'}">
                    ${item.statusMsg}
                </span>
            </td>
        </tr>
    `).join('');
}

function cancelImport() {
    document.getElementById('importPreviewContainer').style.display = 'none';
    pendingImportList = [];
    pendingNewMinisterios = [];
}

async function confirmImport() {
    const validItems = pendingImportList.filter(item => item.status === 'valid');
    
    if (validItems.length === 0) {
        showToast("Nenhum registro válido para importar.", "warning");
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    lastImportedIds = [];

    // Exibir loading
    const btnConfirm = document.querySelector('button[onclick="confirmImport()"]');
    const originalText = btnConfirm.textContent;
    btnConfirm.textContent = '⏳ Importando...';
    btnConfirm.disabled = true;

    for (const item of validItems) {
        try {
            const pessoaData = {
                ...item.data,
                barcode: generateBarcodeValue(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Adicionar pequeno delay para garantir unicidade do barcode baseado em timestamp
            await new Promise(r => setTimeout(r, 10)); 
            const docRef = await db.collection('pessoas').add(pessoaData);
            lastImportedIds.push(docRef.id);
            successCount++;
        } catch (err) {
            console.error("Erro ao importar", item.data.nome, err);
            errorCount++;
        }
    }

    // Se houve novos ministérios, atualiza o grupo no banco
    if (pendingNewMinisterios.length > 0) {
        try {
            // Atualiza lista local e remota
            pendingNewMinisterios.forEach(m => {
                if (!ministerios.includes(m)) ministerios.push(m);
            });
            
            await db.collection('groups').doc(currentGroupId).update({
                ministerios: ministerios
            });
            showToast('Novos ministérios foram identificados e criados automaticamente!', 'success');
        } catch (error) {
            console.error("Erro ao salvar novos ministérios:", error);
            showToast('Erro ao salvar novos ministérios.', 'error');
        }
    }

    btnConfirm.textContent = originalText;
    btnConfirm.disabled = false;
    document.getElementById('importPreviewContainer').style.display = 'none';

    logActivity('Importação', `Importadas ${successCount} pessoas`, 'sistema');
    await loadDashboard();
    loadPessoas();
    
    if (successCount > 0) {
        const cardUndo = document.getElementById('cardUndoImport');
        if (cardUndo) cardUndo.style.display = 'block';
    }
    
    showToast(`Importação concluída! Sucesso: ${successCount} | Erros: ${errorCount}`, 'success');
}

async function undoLastImport() {
    if (lastImportedIds.length === 0) return;

    if (!confirm(`Deseja desfazer a importação de ${lastImportedIds.length} registros?\nIsso excluirá as pessoas importadas recentemente.`)) {
        return;
    }

    const btnUndo = document.getElementById('btnUndoImport');
    const originalText = btnUndo.textContent;
    btnUndo.textContent = "⏳ Desfazendo...";
    btnUndo.disabled = true;

    try {
        // Processar em lotes de 500 (limite do Firestore para batch)
        const chunks = [];
        for (let i = 0; i < lastImportedIds.length; i += 500) {
            chunks.push(lastImportedIds.slice(i, i + 500));
        }

        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(id => {
                batch.delete(db.collection('pessoas').doc(id));
            });
            await batch.commit();
        }
        
        lastImportedIds = [];
        const cardUndo = document.getElementById('cardUndoImport');
        if (cardUndo) cardUndo.style.display = 'none';
        logActivity('Desfazer Importação', 'Importação recente desfeita', 'sistema');
        
        await loadDashboard();
        loadPessoas();
        showToast("Importação desfeita com sucesso!", "success");
    } catch (error) {
        console.error(error);
        showToast("Erro ao desfazer: " + error.message, 'error');
    } finally {
        btnUndo.textContent = originalText;
        btnUndo.disabled = false;
    }
}

function normalizeMinisterioName(input, currentList = ministerios) {
    const map = {
        'coordenação': 'Coordenação', 'coordenacao': 'Coordenação',
        'núcleo': 'Núcleo', 'nucleo': 'Núcleo',
        'música': 'Música', 'musica': 'Música',
        'interseção': 'Intercessão', 'intercessão': 'Intercessão', 'intercessao': 'Intercessão',
        'criativida': 'Criatividade', 'criatividade': 'Criatividade',
        'rda': 'R.D.A', 'r.d.a': 'R.D.A',
        'taty teatro': 'Taty Teatro',
        'formação': 'Formação', 'formacao': 'Formação',
        'financeiro': 'Financeiro',
        'servo geral': 'Servo Geral'
    };
    
    const lower = input.toLowerCase();
    if (map[lower]) return map[lower];
    
    // Tenta encontrar correspondência exata na lista fornecida
    const found = currentList.find(m => m.toLowerCase() === lower);
    if (found) return found;
    
    // Fallback: Capitaliza a primeira letra
    return input.charAt(0).toUpperCase() + input.slice(1);
}

// Gerar código de barras para pessoa
function generateBarcodeValue() {
    return 'PES' + Date.now().toString(36).toUpperCase();
}

async function generateBarcode(pessoaId) {
    const pessoa = pessoas.find(p => p.id === pessoaId);
    
    const modalBody = `
        <h2>Código de Barras - ${pessoa.nome}</h2>
        <div style="text-align: center; padding: 2rem;">
            <svg id="barcode"></svg>
            <p style="margin-top: 1rem;">Código: ${pessoa.barcode}</p>
        </div>
        <button onclick="printBarcode()" class="btn-primary">Imprimir PDF</button>
    `;
    
    showModal(modalBody);
    
    setTimeout(() => {
        JsBarcode("#barcode", pessoa.barcode, {
            format: "CODE128",
            width: 2,
            height: 100,
            displayValue: true
        });
    }, 100);
}

function printBarcode() {
    const svg = document.getElementById('barcode');
    const modalBody = document.getElementById('modalBody');
    const title = modalBody.querySelector('h2').textContent;
    const code = modalBody.querySelector('p').textContent;

    const win = window.open('', '', 'height=500,width=600');
    
    win.document.write(`
        <html>
            <head>
                <title>Imprimir Código</title>
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; margin: 0; }
                    h2 { margin-bottom: 20px; }
                    svg { max-width: 100%; }
                </style>
            </head>
            <body>
                <h2>${title}</h2>
                ${svg.outerHTML}
                <p>${code}</p>
            </body>
        </html>
    `);
    
    win.document.close();
    win.focus();
    setTimeout(() => {
        win.print();
        win.close();
    }, 250);
}

// Histórico de presença
async function showPessoaDetails(pessoaId) {
    try {
        const pessoa = pessoas.find(p => p.id === pessoaId);
        if (!pessoa) return;
        
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('pessoaId', '==', pessoaId)
            .orderBy('timestamp', 'desc')
            .get();
        
        const presencas = presencasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const eventosPresenca = await Promise.all(
            presencas.map(async (p) => {
                try {
                    const eventoDoc = await db.collection('eventos').doc(p.eventoId).get();
                    if (eventoDoc.exists) {
                        const data = eventoDoc.data();
                        return { ...data, id: eventoDoc.id, presencaId: p.id };
                    } else {
                        // Evento excluído - Retorna objeto placeholder para não quebrar a lista
                        return { 
                            id: p.eventoId, 
                            nome: 'Evento Excluído', 
                            data: null, 
                            deleted: true,
                            presencaId: p.id
                        };
                    }
                } catch (e) {
                    return { id: p.eventoId, nome: 'Erro ao carregar', data: null, deleted: true, presencaId: p.id };
                }
            })
        );
        
        // Não filtramos mais os nulos, para mostrar os excluídos
        const validEventos = eventosPresenca;
        
        const modalBody = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div class="avatar" style="width: 60px; height: 60px; font-size: 1.5rem; background-color: ${getAvatarColor(pessoa.nome)}">${getInitials(pessoa.nome)}</div>
                    <div>
                        <h2 style="margin: 0; font-size: 1.4rem;">${pessoa.nome}</h2>
                        <div style="display: flex; gap: 5px; align-items: center; margin-top: 5px; flex-wrap: wrap;">
                            <span class="badge badge-${pessoa.tipo === 'servo' ? 'primary' : 'success'}">${pessoa.tipo === 'servo' ? 'Servo' : 'Participante'}</span>
                            ${getRetiroTagsHtml(pessoa.id, true)}
                        </div>
                    </div>
                </div>
                <button class="btn-icon" onclick="editPessoa('${pessoa.id}')" title="Editar">✏️</button>
            </div>

            <div style="background: var(--bg-tertiary); padding: 1.2rem; border-radius: 8px; margin-bottom: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.2rem;">
                <div>
                    <label class="help-text" style="display: block; margin-bottom: 4px;">Telefone</label>
                    <div style="font-weight: 500; display: flex; align-items: center; gap: 5px;">
                        ${pessoa.telefone || '-'}
                        ${pessoa.telefone ? `<button class="btn-icon" style="padding: 2px; width: 24px; height: 24px; font-size: 0.8em;" onclick="openPersonWhatsApp('${pessoa.nome}', '${pessoa.telefone}')" title="WhatsApp">📱</button>` : ''}
                    </div>
                </div>
                <div>
                    <label class="help-text" style="display: block; margin-bottom: 4px;">Data de Nascimento</label>
                    <div style="font-weight: 500;">${formatDate(pessoa.dataNascimento)} (${calculateAge(pessoa.dataNascimento)} anos)</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <label class="help-text" style="display: block; margin-bottom: 4px;">Endereço</label>
                    <div style="font-weight: 500;">${pessoa.endereco || '-'}</div>
                </div>
                ${pessoa.responsavel ? `
                <div>
                    <label class="help-text" style="display: block; margin-bottom: 4px;">Responsável</label>
                    <div style="font-weight: 500;">${pessoa.responsavel}</div>
                </div>
                <div>
                    <label class="help-text" style="display: block; margin-bottom: 4px;">Tel. Responsável</label>
                    <div style="font-weight: 500;">${pessoa.telefoneResponsavel || '-'}</div>
                </div>
                ` : ''}
            </div>

            ${pessoa.ministerios && pessoa.ministerios.length > 0 ? `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; margin-bottom: 0.8rem;">Ministérios</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${pessoa.ministerios.map(m => {
                        const style = getMinisterioStyle(m);
                        const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                        return `<span class="${className}" style="${style}; font-size: 0.9rem; padding: 4px 10px;">${m}</span>`;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div style="border-top: 1px solid var(--border); padding-top: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-size: 1.1rem; margin: 0;">Histórico de Presença</h3>
                    <span class="badge badge-${(pessoa.frequencia || 0) >= 50 ? 'success' : 'warning'}">Frequência: ${(pessoa.frequencia || 0).toFixed(1)}%</span>
                </div>
                
                <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                    ${validEventos.length === 0 ? '<p class="help-text">Nenhum evento participado ainda</p>' : 
                        validEventos.map(evento => `
                            <div style="padding: 10px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 500;">${escapeHtml(evento.nome)}</div>
                                    <div style="font-size: 0.85rem; color: var(--text-secondary);">${evento.data ? formatDate(evento.data) : 'Data desconhecida'}</div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span class="badge badge-${evento.deleted ? 'danger' : 'success'}" style="font-size: 0.75rem;">${evento.deleted ? 'Excluído' : 'Presente'}</span>
                                    <button class="btn-icon" onclick="deletePresencaFromHistory('${evento.presencaId}', '${pessoaId}')" title="Remover Presença" style="color: #dc3545; padding: 4px;">🗑️</button>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;
        
        showModal(modalBody);
    } catch (error) {
        console.error(error);
        showToast('Erro ao carregar detalhes: ' + error.message, 'error');
    }
}

async function deletePresencaFromHistory(presencaId, pessoaId) {
    if (confirm('Tem certeza que deseja remover esta presença do histórico?')) {
        try {
            await db.collection('presencas').doc(presencaId).delete();
            logActivity('Remover Presença (Histórico)', `Pessoa ID: ${pessoaId}`, 'presencas');
            await showPessoaDetails(pessoaId);
            loadDashboard(); // Atualizar estatísticas globais
        } catch (error) {
            showToast('Erro ao remover presença: ' + error.message, 'error');
        }
    }
}

// Tabs de pessoa
function showPessoaTab(tab) {
    document.querySelectorAll('#pessoas .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#pessoas .tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`#pessoas button[onclick="showPessoaTab('${tab}')"]`);
    if (btn) btn.classList.add('active');
    
    if (tab === 'lista') {
        document.getElementById('pessoaLista').classList.add('active');
    } else if (tab === 'relatorio') {
        document.getElementById('pessoaRelatorio').classList.add('active');
        loadRelatorioFrequencia();
    } else if (tab === 'aniversarios') {
        document.getElementById('pessoaAniversarios').classList.add('active');
        loadAniversariosTab();
    } else if (tab === 'importacao') {
        document.getElementById('pessoaImportacao').classList.add('active');
    }
}

// Relatório de frequência
async function loadRelatorioFrequencia() {
    const startDate = document.getElementById('relatorioInicio')?.value;
    const endDate = document.getElementById('relatorioFim')?.value;

    await calculateFrequencias(null, startDate, endDate);
    
    const filterType = document.getElementById('filterRelatorioOrdem')?.value || 'maior_freq';
    let displayList = [...pessoas];

    if (filterType === 'com_justificativa') {
        const peopleWithJustifications = new Set(globalJustificativas.map(j => j.pessoaId));
        displayList = displayList.filter(p => peopleWithJustifications.has(p.id));
        displayList.sort((a, b) => (b.frequencia || 0) - (a.frequencia || 0));
    } else if (filterType === 'menor_freq') {
        displayList.sort((a, b) => (a.frequencia || 0) - (b.frequencia || 0));
    } else {
        displayList.sort((a, b) => (b.frequencia || 0) - (a.frequencia || 0));
    }
    
    const container = document.getElementById('relatorioFrequencia');
    
    if (displayList.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhuma pessoa encontrada com este filtro</p>';
        return;
    }
    
    container.innerHTML = displayList.map(pessoa => {
        const freq = pessoa.frequencia || 0;
        let classe = 'alta';
        if (freq < 50) classe = 'baixa';
        else if (freq < 75) classe = 'media';
        
        const justCount = globalJustificativas.filter(j => j.pessoaId === pessoa.id).length;
        
        return `
            <div class="pessoa-frequencia">
                <div class="pessoa-info">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h4 style="margin: 0;">${escapeHtml(pessoa.nome)}</h4>
                        ${justCount > 0 ? `<span class="badge badge-warning" style="cursor: pointer; font-size: 0.8em; padding: 2px 6px;" onclick="showJustificativasHistory('${pessoa.id}')" title="Ver Justificativas">📝 ${justCount}</span>` : ''}
                    </div>
                    <p>${pessoa.tipo === 'servo' ? 'Servo' : 'Participante'} - ${pessoa.totalEventosElegiveis || 0} eventos elegíveis</p>
                </div>
                <div class="frequencia-bar">
                    <div class="frequencia-fill ${classe}" style="width: ${freq}%">
                        ${freq.toFixed(1)}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function clearRelatorioFilters() {
    const start = document.getElementById('relatorioInicio');
    const end = document.getElementById('relatorioFim');
    if(start) start.value = '';
    if(end) end.value = '';
    loadRelatorioFrequencia();
}

function toggleBirthdayCard(btn) {
    const card = btn.closest('.card');
    const content = card.querySelector('.card-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = '➖';
    } else {
        content.style.display = 'none';
        btn.textContent = '➕';
    }
}

function toggleBirthdayMonth(monthKey) {
    const rows = document.querySelectorAll(`.birthday-row-${monthKey}`);
    const icon = document.getElementById(`icon-${monthKey}`);
    
    let isHidden = false;
    if (rows.length > 0) {
        isHidden = rows[0].style.display === 'none';
    }
    
    rows.forEach(row => {
        row.style.display = isHidden ? '' : 'none';
    });
    
    if (icon) {
        icon.textContent = isHidden ? '▼' : '▶';
    }
}

function setAniversarioView(view) {
    currentAniversarioView = view;
    localStorage.setItem('aniversarioView', view);
    loadAniversariosTab();
}

function loadAniversariosTab() {
    const container = document.getElementById('aniversariosList');
    
    // Atualizar estado dos botões
    document.getElementById('btnAnivViewCards')?.classList.toggle('active', currentAniversarioView === 'cards');
    document.getElementById('btnAnivViewList')?.classList.toggle('active', currentAniversarioView === 'list');
    
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    const birthdaysByMonth = {};
    months.forEach((_, i) => birthdaysByMonth[i] = []);
    
    pessoas.forEach(p => {
        if (!p.dataNascimento) return;
        // dataNascimento is YYYY-MM-DD
        const parts = p.dataNascimento.split('-');
        if (parts.length !== 3) return;
        const monthIndex = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        
        if (monthIndex >= 0 && monthIndex < 12) {
            birthdaysByMonth[monthIndex].push({ ...p, day });
        }
    });
    
    // Sort by day
    Object.keys(birthdaysByMonth).forEach(m => {
        birthdaysByMonth[m].sort((a, b) => a.day - b.day);
    });
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    const currentYear = today.getFullYear();

    if (currentAniversarioView === 'list') {
        container.className = 'table-container';
        
        const hasBirthdays = Object.values(birthdaysByMonth).some(arr => arr.length > 0);
        if (!hasBirthdays) {
            container.innerHTML = '<p class="help-text">Nenhum aniversariante cadastrado.</p>';
            return;
        }

        let html = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Nome</th>
                        <th>Idade (${currentYear})</th>
                        <th>Telefone</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        months.forEach((monthName, index) => {
            const people = birthdaysByMonth[index];
            if (people.length === 0) return;

            const isCurrentMonth = index === currentMonth;
            const monthKey = `month-${index}`;

            html += `
                <tr style="background-color: var(--bg-tertiary); cursor: pointer;" onclick="toggleBirthdayMonth('${monthKey}')">
                    <td colspan="5" style="font-weight: 600; color: var(--primary); padding: 10px 15px;">
                        <span id="icon-${monthKey}" style="display:inline-block; width:20px;">▼</span> 
                        ${escapeHtml(monthName)} ${isCurrentMonth ? '(Atual)' : ''}
                        <span class="badge badge-primary" style="font-size: 0.7em; margin-left: 10px; vertical-align: middle;">${people.length}</span>
                    </td>
                </tr>
            `;

            people.forEach(p => {
                const isToday = index === currentMonth && p.day === currentDay;
                        const parts = p.dataNascimento.split('-');
                        const birthYear = parseInt(parts[0]);
                        const turningAge = currentYear - birthYear;
                        
                        // Verificar status de envio
                const birthdayDateKey = `${currentYear}-${index}-${p.day}`;
                        const storageKey = `birthday_sent_${p.id}_${birthdayDateKey}`;
                        const isSent = localStorage.getItem(storageKey) === 'true';
                        
                        const rowStyle = isToday ? 'background-color: rgba(40, 167, 69, 0.1);' : '';
                        const dateStyle = isToday ? 'color: var(--success); font-weight: bold;' : '';

                html += `
                <tr class="birthday-row-${monthKey}" style="${rowStyle}">
                    <td style="${dateStyle}">${p.day} de ${escapeHtml(monthName)}</td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div class="avatar" style="width: 24px; height: 24px; font-size: 0.7em; background-color: ${getAvatarColor(p.nome)}">${getInitials(p.nome)}</div>
                                    <span style="cursor: pointer;" onclick="showPessoaDetails('${p.id}')">${escapeHtml(p.nome)} ${isToday ? '🎂' : ''}</span>
                                </div>
                            </td>
                            <td>${turningAge} anos</td>
                            <td>${p.telefone || '-'}</td>
                            <td>
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <button onclick="sendBirthdayMessage('${p.id}', '${p.nome}', '${p.telefone}', '${birthdayDateKey}')" class="btn-icon" style="color: #25D366;" title="Enviar WhatsApp">📱</button>
                                    <label style="display: flex; align-items: center; gap: 5px; font-size: 0.8em; cursor: pointer;">
                                        <input type="checkbox" id="check_tab_${p.id}" ${isSent ? 'checked' : ''} onchange="toggleBirthdayMessage('${p.id}', '${birthdayDateKey}', 'check_tab_${p.id}')">
                                        Enviado
                                    </label>
                                </div>
                            </td>
                        </tr>
                        `;
            });
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } else {
        container.className = 'aniversarios-grid';
        container.innerHTML = months.map((monthName, index) => {
            const people = birthdaysByMonth[index];
            const isCurrentMonth = index === currentMonth;
            const cardStyle = isCurrentMonth ? 'border: 2px solid var(--primary);' : '';
            
            return `
                <div class="card" style="${cardStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <h3 style="margin: 0; color: var(--primary);">
                            ${escapeHtml(monthName)} ${isCurrentMonth ? ' (Atual)' : ''}
                        </h3>
                        <button class="btn-icon" onclick="toggleBirthdayCard(this)" style="padding: 2px 8px; font-size: 0.8em;">➖</button>
                    </div>
                    <div class="card-content">
                        ${people.length === 0 ? '<p class="help-text">Nenhum aniversariante.</p>' : 
                            `<div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                ${people.map(p => {
                                    const isToday = isCurrentMonth && p.day === currentDay;
                                    const rowClass = isToday ? 'birthday-row birthday-today' : 'birthday-row';
                                    const extraIcon = isToday ? ' 🎂🎉' : '';
                                    
                                    return `
                                    <div class="${rowClass}" onclick="showPessoaDetails('${p.id}')">
                                        <span style="font-weight: 600; min-width: 25px; text-align: center;">${p.day}</span>
                                        <div class="avatar" style="width: 24px; height: 24px; font-size: 0.7em; background-color: ${getAvatarColor(p.nome)}; margin: 0;">${getInitials(p.nome)}</div>
                                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.nome)}${extraIcon}</span>
                                    </div>
                                `}).join('')}
                            </div>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function exportAniversariantesPDF() {
    if (!window.jspdf) return showToast("Erro: Biblioteca PDF não carregada.", "error");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const groupName = document.getElementById('groupNameSidebar')?.textContent || 'Grupo';
    const currentYear = new Date().getFullYear();

    // Cabeçalho do Documento
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(groupName.toUpperCase(), 14, 15);

    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235); // Azul Primary
    doc.text(`Aniversariantes de ${currentYear}`, 14, 25);

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    let yPos = 35;

    // Preparar dados
    const birthdaysByMonth = {};
    months.forEach((_, i) => birthdaysByMonth[i] = []);

    pessoas.forEach(p => {
        if (!p.dataNascimento) return;
        const parts = p.dataNascimento.split('-');
        if (parts.length !== 3) return;
        const monthIndex = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const birthYear = parseInt(parts[0]);
        
        if (monthIndex >= 0 && monthIndex < 12) {
            birthdaysByMonth[monthIndex].push({ ...p, day, birthYear });
        }
    });

    // Ordenar por dia
    Object.keys(birthdaysByMonth).forEach(m => {
        birthdaysByMonth[m].sort((a, b) => a.day - b.day);
    });

    // Gerar tabelas para cada mês
    for (let i = 0; i < 12; i++) {
        const monthName = months[i];
        const people = birthdaysByMonth[i];

        if (people.length === 0) continue;

        // Verificar se precisa de nova página para o cabeçalho do mês
        if (yPos > 260) {
            doc.addPage();
            yPos = 20;
        }

        // Cabeçalho do Mês
        doc.setFontSize(14);
        doc.setTextColor(37, 99, 235);
        doc.text(monthName, 14, yPos);
        yPos += 5;

        const tableBody = people.map(p => {
            const turningAge = currentYear - p.birthYear;
            return [
                p.day.toString().padStart(2, '0'),
                p.nome,
                `${turningAge} anos`,
                p.telefone || '-'
            ];
        });

        doc.autoTable({
            head: [['Dia', 'Nome', 'Idade em ' + currentYear, 'Telefone']],
            body: tableBody,
            startY: yPos,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 3, lineColor: [226, 232, 240] },
            headStyles: { 
                fillColor: [241, 245, 249], // Fundo cinza claro
                textColor: [15, 23, 42], // Texto escuro
                fontStyle: 'bold',
                lineWidth: 0
            },
            columnStyles: { 
                0: { fontStyle: 'bold', halign: 'center', cellWidth: 20, textColor: [37, 99, 235] }, // Dia em azul
                2: { halign: 'center', cellWidth: 30 }
            },
            margin: { left: 14, right: 14 }
        });
        
        yPos = doc.lastAutoTable.finalY + 10;
    }

    doc.save(`Aniversariantes_${currentYear}.pdf`);
    showToast('PDF de aniversariantes gerado!', 'success');
}

function showJustificativasHistory(pessoaId) {
    const pessoa = pessoas.find(p => p.id === pessoaId);
    const justificativas = globalJustificativas.filter(j => j.pessoaId === pessoaId);
    
    const history = justificativas.map(j => {
        const evento = eventos.find(e => e.id === j.eventoId);
        return {
            ...j,
            eventoNome: evento ? evento.nome : 'Evento desconhecido',
            eventoData: evento ? evento.data : '',
            eventoHorario: evento ? evento.horario : ''
        };
    }).sort((a, b) => new Date(b.eventoData) - new Date(a.eventoData));

    const modalBody = `
        <h2>Justificativas - ${escapeHtml(pessoa.nome)}</h2>
        <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
            ${history.length === 0 ? '<p>Nenhuma justificativa encontrada.</p>' : 
                history.map(h => `
                    <div class="card" style="margin-bottom: 10px; padding: 10px; border-left: 4px solid #ffc107;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">${escapeHtml(h.eventoNome)}</h4>
                                <p style="font-size: 0.85em; color: #666; margin-bottom: 8px;">${formatDate(h.eventoData)} às ${escapeHtml(h.eventoHorario)}</p>
                            </div>
                            <div>
                                <button class="btn-icon" onclick="editJustificativaFromHistory('${h.id}', '${pessoaId}')" title="Editar">✏️</button>
                                <button class="btn-icon" onclick="deleteJustificativaFromHistory('${h.id}', '${pessoaId}')" title="Excluir">🗑️</button>
                            </div>
                        </div>
                        <p style="background: #f9f9f9; padding: 8px; border-radius: 4px; font-style: italic; margin: 0;">"${escapeHtml(h.observation)}"</p>
                    </div>
                `).join('')
            }
        </div>
    `;
    showModal(modalBody);
}

async function editJustificativaFromHistory(justificativaId, pessoaId) {
    const just = globalJustificativas.find(j => j.id === justificativaId);
    if (!just) return;

    const newText = prompt("Editar justificativa:", just.observation);
    if (newText === null) return;

    try {
        if (newText.trim() === "") {
            if (confirm("Texto vazio. Deseja excluir a justificativa?")) {
                await deleteJustificativaFromHistory(justificativaId, pessoaId);
            }
            return;
        }

        await db.collection('justificativas').doc(justificativaId).update({
            observation: newText,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        logActivity('Editar Justificativa', `Pessoa ID: ${pessoaId}`, 'presencas');
        await loadDashboard();
        showJustificativasHistory(pessoaId);
    } catch (error) {
        showToast('Erro ao editar: ' + error.message, 'error');
    }
}

async function deleteJustificativaFromHistory(justificativaId, pessoaId) {
    if (confirm("Tem certeza que deseja excluir esta justificativa?")) {
        try {
            await db.collection('justificativas').doc(justificativaId).delete();
            logActivity('Excluir Justificativa', `Pessoa ID: ${pessoaId}`, 'presencas');
            await loadDashboard();
            showJustificativasHistory(pessoaId);
        } catch (error) {
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    }
}

function checkEligibility(pessoa, evento) {
    if (evento.destinatarios === 'todos') return true;
    
    if (evento.destinatarios === 'servos') {
        // Se o evento é para ministérios específicos, qualquer um com o ministério é elegível
        if (evento.ministerios && evento.ministerios.length > 0) {
            return pessoa.ministerios?.some(m => evento.ministerios.includes(m));
        }
        // Se é para todos os servos, mantém restrição de tipo
        return pessoa.tipo === 'servo';
    }
    
    return false;
}

// Calcular frequências
async function calculateFrequencias(allPresencas = null, startDate = null, endDate = null) {
    // Se não foi passado (ex: chamado pelo relatório), busca agora
    if (!allPresencas) {
        if (globalPresencas.length > 0) {
            allPresencas = globalPresencas;
        } else {
            const snapshot = await db.collection('presencas')
                .where('groupId', '==', currentGroupId)
                .get();
            allPresencas = snapshot.docs.map(doc => doc.data());
        }
    }

    // Usar justificativas globais
    const justificativasSet = new Set();
    globalJustificativas.forEach(data => {
        justificativasSet.add(`${data.pessoaId}_${data.eventoId}`);
    });

    // Mapear presenças por pessoa para acesso rápido
    const presencasPorPessoa = {};
    allPresencas.forEach(p => {
        if (!presencasPorPessoa[p.pessoaId]) {
            presencasPorPessoa[p.pessoaId] = new Set();
        }
        presencasPorPessoa[p.pessoaId].add(p.eventoId);
    });

    // Filtrar eventos se houver datas selecionadas
    let eventosParaCalculo = eventos;
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Incluir o dia final completo

        eventosParaCalculo = eventos.filter(e => {
            const dataEvento = new Date(e.data);
            const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
            return dataEventoAjustada >= start && dataEventoAjustada <= end;
        });
    }

    for (let pessoa of pessoas) {
        let presencasCount = 0;
        let totalConsiderado = 0;
        let hasEligibleEvents = false;
        const presencasPessoaIds = presencasPorPessoa[pessoa.id] || new Set();

        for (const evento of eventosParaCalculo) {
            const isEligible = checkEligibility(pessoa, evento);
            const presente = presencasPessoaIds.has(evento.id);
            const justificado = justificativasSet.has(`${pessoa.id}_${evento.id}`);
            
            if (isEligible) {
                hasEligibleEvents = true;
                if (presente) {
                    presencasCount++;
                    totalConsiderado++;
                } else if (!justificado) {
                    // Ausente e não justificado
                    totalConsiderado++;
                }
            } else {
                // Não elegível, mas presente (Convidado)
                if (presente) {
                    presencasCount++;
                    totalConsiderado++;
                }
            }
        }
        
        pessoa.frequencia = totalConsiderado > 0 ? (presencasCount / totalConsiderado) * 100 : (hasEligibleEvents ? 100 : 0);
        pessoa.totalEventosElegiveis = totalConsiderado;
    }
}

// ==================== EVENTOS ====================

async function loadEventos(resetPage = true) {
    if (resetPage) currentEventoPage = 1;

    const itemsPerPageInput = document.getElementById('eventosItemsPerPage');
    if (itemsPerPageInput) eventosItemsPerPage = parseInt(itemsPerPageInput.value);

    const search = document.getElementById('searchEvento')?.value?.toLowerCase() || '';
    const eventType = document.getElementById('filterEventType')?.value || '';
    const audience = document.getElementById('filterTargetAudience')?.value || '';
    
    let filtered = [...eventos];
    
    if (search) {
        filtered = filtered.filter(e => e.nome.toLowerCase().includes(search));
    }
    
    if (eventType) {
        filtered = filtered.filter(e => e.tipo === eventType);
    }
    
    if (audience) {
        if (audience === 'baixa_adesao') {
            // Filtra eventos passados com menos de 50% de adesão
            const now = new Date();
            filtered = filtered.filter(e => e.adherence < 50 && new Date(e.data + 'T' + e.horario) < now);
        } else if (audience === 'ministerio_especifico') {
            filtered = filtered.filter(e => e.destinatarios === 'servos' && e.ministerios && e.ministerios.length > 0);
        } else {
            filtered = filtered.filter(e => e.destinatarios === audience);
        }
    }
    
    if (currentEventMinisterioFilter) {
        filtered = filtered.filter(e => e.ministerios && e.ministerios.includes(currentEventMinisterioFilter));
    }
    
    filtered.sort((a, b) => {
        const dateA = new Date(a.data);
        const dateB = new Date(b.data);
        return currentEventSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // Paginação
    const totalPages = Math.ceil(filtered.length / eventosItemsPerPage) || 1;
    if (currentEventoPage > totalPages) currentEventoPage = totalPages;
    
    const start = (currentEventoPage - 1) * eventosItemsPerPage;
    const end = start + eventosItemsPerPage;
    const paginatedList = filtered.slice(start, end);
    
    renderEventosTimeline(paginatedList, totalPages);
}

function toggleEventSortOrder() {
    currentEventSortOrder = currentEventSortOrder === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('btnEventSort');
    if (btn) {
        btn.textContent = currentEventSortOrder === 'desc' ? '⬇️ Data' : '⬆️ Data';
        btn.title = currentEventSortOrder === 'desc' ? 'Ordenar: Mais recentes primeiro' : 'Ordenar: Mais antigos primeiro';
    }
    loadEventos();
}

function setEventoView(view) {
    currentEventoView = view;
    document.getElementById('btnViewCards').classList.toggle('active', view === 'cards');
    document.getElementById('btnViewList').classList.toggle('active', view === 'list');
    loadEventos(false);
}

function clearEventosFilters() {
    const search = document.getElementById('searchEvento');
    const eventType = document.getElementById('filterEventType');
    const audience = document.getElementById('filterTargetAudience');

    if (search) search.value = '';
    if (eventType) eventType.value = '';
    if (audience) audience.value = '';
    
    currentEventMinisterioFilter = '';
    
    loadEventos();
    showToast('Filtros de eventos limpos', 'info');
}

function renderEventosTimeline(eventosList, totalPages = 1) {
    const container = document.getElementById('eventosTable');
    
    const search = document.getElementById('searchEvento')?.value;
    const eventType = document.getElementById('filterEventType')?.value;
    const audience = document.getElementById('filterTargetAudience')?.value;
    const hasFilters = search || eventType || audience || currentEventMinisterioFilter;

    if (eventosList.length === 0) {
        let html = '<p class="help-text">Nenhum evento encontrado</p>';
        if (hasFilters) {
            html += `<div style="text-align: center; margin-top: 10px;"><button class="btn-secondary" onclick="clearEventosFilters()">Limpar Filtros</button></div>`;
        }
        container.innerHTML = html;
        return;
    }

    // Contar eventos por mês para exibição no separador
    const eventsByMonth = {};
    eventosList.forEach(e => {
        const m = e.data ? e.data.substring(0, 7) : 'unknown';
        eventsByMonth[m] = (eventsByMonth[m] || 0) + 1;
    });

    let html = '';
    let lastMonth = null;

    if (hasFilters) {
        html += `
            <div style="margin-bottom: 10px; display: flex; justify-content: flex-end;">
                <button class="btn-secondary" onclick="clearEventosFilters()" style="font-size: 0.9em;">Limpar Filtros</button>
            </div>
        `;
    }

    if (currentEventoView === 'list') {
        container.className = 'table-container';
        html += `
            <table class="table">
                <thead>
                    <tr>
                        ${eventoSelectionMode ? '<th><input type="checkbox" onchange="toggleSelectAllEventos(this)"></th>' : ''}
                        <th>Evento</th>
                        <th>Data</th>
                        <th>Horário</th>
                        <th>Local</th>
                        <th>Público</th>
                        <th>Adesão</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>`;
        
        eventosList.forEach(evento => {
            const currentMonth = evento.data ? evento.data.substring(0, 7) : '';
            if (currentMonth && currentMonth !== lastMonth) {
                const [year, month] = currentMonth.split('-');
                const dateObj = new Date(parseInt(year), parseInt(month) - 1);
                const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                const count = eventsByMonth[currentMonth] || 0;
                
                const colSpan = eventoSelectionMode ? 8 : 7;
                html += `
                    <tr style="background-color: var(--bg-tertiary); cursor: pointer;" onclick="toggleMonthEvents('${currentMonth}')">
                        <td colspan="${colSpan}" style="font-weight: 600; color: var(--primary); padding: 10px 15px; font-size: 0.95em;">
                            <span id="icon-${currentMonth}" style="display:inline-block; width:20px;">▼</span> 📅 ${capitalizedMonth} <span class="badge badge-primary" style="font-size: 0.7em; margin-left: 10px; vertical-align: middle;">${count} eventos</span>
                        </td>
                    </tr>
                `;
                lastMonth = currentMonth;
            }

            html += `
                        <tr class="event-row-${currentMonth}">
                            ${eventoSelectionMode ? `<td><input type="checkbox" ${selectedEventos.has(evento.id) ? 'checked' : ''} onchange="toggleSelectEvento('${evento.id}')"></td>` : ''}
                            <td>
                                <strong>${escapeHtml(evento.nome)}</strong>
                                ${evento.repete ? '<span class="badge badge-warning" style="font-size: 0.7em; margin-left: 5px;">Semanal</span>' : ''}
                                <div style="font-size: 0.85em; color: var(--text-secondary); margin-top: 4px; cursor: pointer; width: fit-content;" onclick="event.stopPropagation(); toggleEventTypeFilter('${evento.tipo}')" title="Filtrar por ${evento.tipo}">
                                    🏷️ ${escapeHtml(evento.tipo)}
                                </div>
                            </td>
                            <td>${formatDate(evento.data)}</td>
                            <td>${escapeHtml(evento.horario)}</td>
                            <td>${escapeHtml(evento.local)}</td>
                            <td>
                                <span class="badge badge-${evento.destinatarios === 'todos' ? 'success' : 'primary'}">${evento.destinatarios === 'todos' ? 'Todos' : 'Servos'}</span>
                                ${evento.ministerios && evento.ministerios.length > 0 ? 
                                    `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px;">
                                        ${evento.ministerios.map(m => {
                                            const style = getMinisterioStyle(m);
                                            const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                                            const isSelected = currentEventMinisterioFilter === m;
                                            const activeStyle = isSelected ? 'border: 2px solid currentColor;' : '';
                                            return `<span onclick="event.stopPropagation(); toggleEventMinisterioFilter('${m}')" class="${className}" style="${style} ${activeStyle}" title="${isSelected ? 'Remover filtro' : 'Filtrar por ' + m}">${escapeHtml(m)}</span>`;
                                        }).join('')}
                                    </div>` 
                                : ''}
                            </td>
                            <td>${(evento.adherence || 0).toFixed(0)}% (${evento.presenceCount || 0})</td>
                            <td>
                                <div class="action-menu-container">
                                    <button class="action-menu-btn" onclick="toggleActionMenu('evt-${evento.id}', event)" title="Ações">⋮</button>
                                    <div id="menu-evt-${evento.id}" class="action-menu-dropdown">
                                        <button class="action-menu-item" onclick="showEventoPresencas('${evento.id}')">👥 Presenças</button>
                                        <button class="action-menu-item" onclick="showEventoAusentes('${evento.id}')">🚫 Ausentes</button>
                                        <button class="action-menu-item" onclick="initSorteioEvento('${evento.id}')">🎲 Sortear Presente</button>
                                        <button class="action-menu-item" onclick="showExportOptions('${evento.id}')">📤 Exportar Relatório</button>
                                        <button class="action-menu-item" onclick="editEvento('${evento.id}')">✏️ Editar</button>
                                        <button class="action-menu-item" onclick="duplicateEvento('${evento.id}')">📑 Duplicar</button>
                                        <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
                                        <button class="action-menu-item danger" onclick="deleteEvento('${evento.id}')">🗑️ Excluir</button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
        });
        html += `</tbody></table>`;
    } else {
        container.className = 'eventos-grid';
        
        eventosList.forEach(evento => {
            const currentMonth = evento.data ? evento.data.substring(0, 7) : '';
            if (currentMonth && currentMonth !== lastMonth) {
                const [year, month] = currentMonth.split('-');
                const dateObj = new Date(parseInt(year), parseInt(month) - 1);
                const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                const count = eventsByMonth[currentMonth] || 0;
                
                html += `
                    <div style="grid-column: 1 / -1; margin-top: 15px; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 2px solid var(--border); color: var(--primary); font-weight: 600; font-size: 1.1em; display: flex; align-items: center; gap: 10px; cursor: pointer;" onclick="toggleMonthEvents('${currentMonth}')">
                        <span id="icon-${currentMonth}" style="display:inline-block; width:20px;">▼</span> <span>📅 ${capitalizedMonth}</span> <span class="badge badge-primary" style="font-size: 0.7em;">${count}</span>
                    </div>
                `;
                lastMonth = currentMonth;
            }

            html += `
            <div class="evento-card event-row-${currentMonth}">
                ${eventoSelectionMode ? `<div style="margin-bottom: 10px;"><input type="checkbox" ${selectedEventos.has(evento.id) ? 'checked' : ''} onchange="toggleSelectEvento('${evento.id}')" style="transform: scale(1.2);"> <span style="font-size: 0.9em; color: var(--text-secondary);">Selecionar</span></div>` : ''}
                <div class="evento-header">
                    <div>
                        <h3 class="evento-title">${escapeHtml(evento.nome)}</h3>
                        <p class="evento-date">${formatDate(evento.data)} às ${escapeHtml(evento.horario)}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <span class="badge badge-${evento.destinatarios === 'todos' ? 'success' : 'primary'}">
                            ${evento.destinatarios === 'todos' ? 'Todos' : 'Servos'}
                        </span>
                        <span style="font-size: 0.85em; color: #555; background: #f0f0f0; padding: 2px 8px; border-radius: 12px;">
                            👥 ${evento.presenceCount || 0} (${(evento.adherence || 0).toFixed(0)}%)
                        </span>
                    </div>
                </div>
                <div class="evento-details">
                    <span>📍 ${escapeHtml(evento.local)}</span>
                    <span style="cursor: pointer; border-bottom: 1px dotted var(--text-secondary);" onclick="event.stopPropagation(); toggleEventTypeFilter('${evento.tipo}')" title="Filtrar por ${evento.tipo}">🏷️ ${escapeHtml(evento.tipo)}</span>
                    ${evento.repete ? '<span class="badge badge-warning">Semanal</span>' : ''}
                    ${evento.observacao ? `<div style="width: 100%; margin-top: 5px; font-style: italic; font-size: 0.85em;">📝 ${escapeHtml(evento.observacao)}</div>` : ''}
                    ${evento.ministerios?.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 5px; align-items: center;">
                            <span style="margin-right: 2px;">⛪</span>
                            ${evento.ministerios.map(m => {
                                const style = getMinisterioStyle(m);
                                const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                                const isSelected = currentEventMinisterioFilter === m;
                                const activeStyle = isSelected ? 'border: 2px solid currentColor;' : '';
                                return `<span onclick="event.stopPropagation(); toggleEventMinisterioFilter('${m}')" class="${className}" style="${style} ${activeStyle}" title="${isSelected ? 'Remover filtro' : 'Filtrar por ' + m}">${escapeHtml(m)}</span>`;
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="evento-actions">
                    <button class="btn-icon" onclick="showEventoPresencas('${evento.id}')" title="Ver Presenças">👥</button>
                    <button class="btn-icon" onclick="showEventoAusentes('${evento.id}')" title="Ver Ausentes">🚫</button>
                    <button class="btn-icon" onclick="initSorteioEvento('${evento.id}')" title="Sortear Presente">🎲</button>
                    <button class="btn-icon" onclick="showExportOptions('${evento.id}')" title="Exportar Relatório">📤</button>
                    <button class="btn-icon" onclick="editEvento('${evento.id}')" title="Editar">✏️</button>
                    <button class="btn-icon" onclick="duplicateEvento('${evento.id}')" title="Duplicar">📑</button>
                    <button class="btn-icon" onclick="deleteEvento('${evento.id}')" title="Excluir">🗑️</button>
                </div>
            </div>
            `;
        });
    }

    if (totalPages > 1) {
        html += `
            <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; width: 100%; grid-column: 1 / -1;">
                <button class="btn-secondary" onclick="changeEventoPage(${currentEventoPage - 1})" ${currentEventoPage === 1 ? 'disabled' : ''}>Anterior</button>
                <span>Página ${currentEventoPage} de ${totalPages}</span>
                <button class="btn-secondary" onclick="changeEventoPage(${currentEventoPage + 1})" ${currentEventoPage === totalPages ? 'disabled' : ''}>Próxima</button>
            </div>
        `;
    }

    container.innerHTML = html;
}

function toggleMonthEvents(monthKey) {
    const rows = document.querySelectorAll(`.event-row-${monthKey}`);
    const icon = document.getElementById(`icon-${monthKey}`);
    
    let isHidden = false;
    if (rows.length > 0) {
        isHidden = rows[0].style.display === 'none';
    }
    
    rows.forEach(row => {
        row.style.display = isHidden ? '' : 'none';
    });
    
    if (icon) {
        icon.textContent = isHidden ? '▼' : '▶';
    }
}

function toggleEventTypeFilter(type) {
    const select = document.getElementById('filterEventType');
    if (!select) return;

    if (select.value === type) {
        select.value = '';
        showToast('Filtro de tipo removido', 'info');
    } else {
        let optionExists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === type) {
                optionExists = true;
                break;
            }
        }
        if (!optionExists) {
            const option = document.createElement('option');
            option.value = type;
            option.text = type;
            select.add(option);
        }
        select.value = type;
        showToast(`Filtrando eventos por: ${type}`, 'info');
    }
    loadEventos();
}

function toggleEventMinisterioFilter(ministerio) {
    if (currentEventMinisterioFilter === ministerio) {
        currentEventMinisterioFilter = '';
        showToast('Filtro de ministério removido', 'info');
    } else {
        currentEventMinisterioFilter = ministerio;
        showToast(`Filtrando eventos por: ${ministerio}`, 'info');
    }
    loadEventos();
}

function toggleEventoSelectionMode() {
    eventoSelectionMode = !eventoSelectionMode;
    selectedEventos.clear();
    
    const btn = document.getElementById('btnSelecionarEventos');
    const actions = document.getElementById('eventoSelectionActions');
    
    if (eventoSelectionMode) {
        btn.textContent = 'Cancelar Seleção';
        actions.style.display = 'flex';
    } else {
        btn.textContent = 'Modo Seleção';
        actions.style.display = 'none';
    }
    
    loadEventos(false);
}

function toggleSelectEvento(id) {
    if (selectedEventos.has(id)) {
        selectedEventos.delete(id);
    } else {
        selectedEventos.add(id);
    }
    loadEventos(false);
}

function toggleSelectAllEventos(checkbox) {
    // Seleciona todos os eventos filtrados atualmente
    const search = document.getElementById('searchEvento')?.value?.toLowerCase() || '';
    const eventType = document.getElementById('filterEventType')?.value || '';
    const audience = document.getElementById('filterTargetAudience')?.value || '';
    let filtered = [...eventos];
    
    if (search) filtered = filtered.filter(e => e.nome.toLowerCase().includes(search));
    
    if (eventType) filtered = filtered.filter(e => e.tipo === eventType);
    
    if (audience) {
        if (audience === 'baixa_adesao') {
            const now = new Date();
            filtered = filtered.filter(e => e.adherence < 50 && new Date(e.data + 'T' + e.horario) < now);
        } else if (audience === 'ministerio_especifico') {
            filtered = filtered.filter(e => e.destinatarios === 'servos' && e.ministerios && e.ministerios.length > 0);
        } else {
            filtered = filtered.filter(e => e.destinatarios === audience);
        }
    }
    
    if (checkbox.checked) {
        filtered.forEach(e => selectedEventos.add(e.id));
    } else {
        selectedEventos.clear();
    }
    loadEventos(false);
}

function cancelEventoSelection() {
    toggleEventoSelectionMode();
}

async function compareSelectedEventos() {
    if (selectedEventos.size < 2) {
        showToast("Selecione pelo menos 2 eventos para comparar.", "warning");
        return;
    }
    
    const selectedEventsList = eventos.filter(e => selectedEventos.has(e.id))
        .sort((a, b) => new Date(a.data) - new Date(b.data));
        
    const comparisonData = pessoas.map(p => {
        const row = {
            nome: p.nome,
            tipo: p.tipo,
            eventos: {},
            stats: { present: 0, eligible: 0 }
        };
        
        selectedEventsList.forEach(e => {
            const isEligible = checkEligibility(p, e);
            const isPresent = globalPresencas.some(pres => pres.pessoaId === p.id && pres.eventoId === e.id);
            const isJustified = globalJustificativas.some(just => just.pessoaId === p.id && just.eventoId === e.id);
            
            let status = '';
            let statusClass = '';
            
            if (isPresent) {
                status = isEligible ? 'Presente' : 'Presente (Convidado)';
                statusClass = 'success';
                row.stats.present++;
                row.stats.eligible++; 
            } else {
                if (isJustified) {
                    status = 'Justificado';
                    statusClass = 'warning';
                } else if (isEligible) {
                    status = 'Ausente';
                    statusClass = 'danger';
                    row.stats.eligible++;
                } else {
                    status = '-'; 
                    statusClass = 'secondary';
                }
            }
            
            row.eventos[e.id] = { status, statusClass };
        });
        
        row.percentage = row.stats.eligible > 0 ? (row.stats.present / row.stats.eligible) * 100 : null;
        return row;
    });
    
    comparisonData.sort((a, b) => a.nome.localeCompare(b.nome));
    
    window.currentComparisonData = { rows: comparisonData, events: selectedEventsList };
    
    const modalBody = `
        <h2>Comparação de Eventos</h2>
        <p class="help-text" style="margin-bottom: 1rem;">Comparando ${selectedEventsList.length} eventos selecionados.</p>
        
        <div style="overflow-x: auto; max-height: 60vh; margin-bottom: 1rem;">
            <table class="table" id="comparisonTable" style="font-size: 0.85rem;">
                <thead>
                    <tr>
                        <th style="position: sticky; left: 0; background: var(--bg-tertiary); z-index: 10;">Nome</th>
                        <th>Tipo</th>
                        ${selectedEventsList.map(e => `<th style="min-width: 100px;">${e.nome}<br><span style="font-size:0.8em; font-weight:normal;">${formatDate(e.data)}</span></th>`).join('')}
                        <th>Freq.</th>
                    </tr>
                </thead>
                <tbody>
                    ${comparisonData.map(row => `
                        <tr>
                            <td style="position: sticky; left: 0; background: var(--bg-primary); z-index: 10; border-right: 1px solid var(--border);"><strong>${escapeHtml(row.nome)}</strong></td>
                            <td><span class="badge badge-${row.tipo === 'servo' ? 'primary' : 'success'}" style="font-size: 0.7em;">${row.tipo}</span></td>
                            ${selectedEventsList.map(e => {
                                const cell = row.eventos[e.id];
                                let badgeClass = 'secondary';
                                if (cell.statusClass === 'success') badgeClass = 'success';
                                if (cell.statusClass === 'danger') badgeClass = 'danger';
                                if (cell.statusClass === 'warning') badgeClass = 'warning';
                                return `<td><span class="badge badge-${badgeClass}" style="font-size: 0.75em; white-space: normal;">${escapeHtml(cell.status)}</span></td>`;
                            }).join('')}
                            <td>${row.percentage !== null ? row.percentage.toFixed(0) + '%' : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div style="text-align: right;">
            <button onclick="exportComparisonPDF()" class="btn-primary">📄 Exportar PDF</button>
        </div>
    `;
    
    showModal(modalBody);
}

function changeEventoPage(newPage) {
    currentEventoPage = newPage;
    loadEventos(false);
}

function showEventoTab(tab) {
    document.querySelectorAll('#eventos .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#eventos .tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`#eventos button[onclick="showEventoTab('${tab}')"]`);
    if (btn) btn.classList.add('active');
    
    if (tab === 'lista') {
        document.getElementById('eventoLista').classList.add('active');
    } else {
        document.getElementById('eventoCriar').classList.add('active');
        showEventoForm();
    }
}

function showEventoForm(eventoId = null, prefillData = null) {
    const evento = prefillData || (eventoId ? eventos.find(e => e.id === eventoId) : null);
    
    const modalBody = `
        <h2>${eventoId ? 'Editar' : 'Novo'} Evento</h2>
        <form id="eventoForm">
            <div class="form-group">
                <label>Nome do Evento *</label>
                <input type="text" id="eventoNome" class="input-field" value="${evento?.nome || ''}" required>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Data *</label>
                    <input type="date" id="eventoData" class="input-field" value="${evento?.data || ''}" required>
                </div>
                <div class="form-group">
                    <label>Horário *</label>
                    <input type="time" id="eventoHorario" class="input-field" value="${evento?.horario || ''}" required>
                </div>
            </div>
            
            <div class="form-group">
                <label>Local</label>
                <input type="text" id="eventoLocal" class="input-field" value="${evento?.local || ''}">
            </div>
            
            <div class="form-group">
                <label>Tipo de Evento</label>
                <div style="display: flex; gap: 5px;">
                    <select id="eventoTipo" class="input-field">
                        ${eventTypes.map(t => `<option value="${t}" ${evento?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                        ${evento?.tipo && !eventTypes.includes(evento.tipo) ? `<option value="${evento.tipo}" selected>${evento.tipo}</option>` : ''}
                    </select>
                    <button type="button" class="btn-secondary" onclick="addEventType()" title="Adicionar Novo Tipo" style="padding: 0.5rem 1rem;">➕</button>
                    <button type="button" class="btn-danger" onclick="deleteEventType()" title="Excluir Tipo Selecionado" style="padding: 0.5rem 1rem;">🗑️</button>
                </div>
                <p class="help-text" style="margin-top: 5px;">Selecione ou adicione um novo tipo.</p>
            </div>
            
            <div class="form-group">
                <label>Observação (Opcional)</label>
                <textarea id="eventoObservacao" class="input-field" rows="2" placeholder="Detalhes adicionais sobre o evento...">${evento?.observacao || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="eventoRepete" ${evento?.repete ? 'checked' : ''}>
                    Repete semanalmente
                </label>
            </div>
            
            <div class="form-group">
                <label>Destinatários</label>
                <select id="eventoDestinatarios" class="input-field" onchange="toggleEventoMinisterios()">
                    <option value="todos" ${evento?.destinatarios === 'todos' ? 'selected' : ''}>Todos (Participantes e Servos)</option>
                    <option value="servos" ${evento?.destinatarios === 'servos' ? 'selected' : ''}>Apenas Servos</option>
                </select>
            </div>
            
            <div class="form-group" id="eventoMinisteriosGroup" style="display: ${evento?.destinatarios === 'servos' ? 'block' : 'none'}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <label style="margin-bottom: 0;">Ministérios Específicos</label>
                    <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8em;" onclick="toggleAllMinistriesSelection()">Selecionar/Deselecionar Todos</button>
                </div>
                <p class="help-text" style="margin-top: 0; margin-bottom: 10px;">Deixe vazio para todos os servos.</p>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${ministerios.map(m => {
                        const style = getMinisterioStyle(m);
                        const className = style ? 'ministerio-tag' : `ministerio-tag ${getMinisterioColorClass(m)}`;
                        const isSelected = evento?.ministerios?.includes(m);
                        const opacity = isSelected ? '1' : '0.5';
                        const border = isSelected ? '2px solid var(--text-primary)' : '1px solid transparent';
                        const transform = isSelected ? 'scale(1.05)' : 'scale(1)';
                        
                        return `<span onclick="toggleMinistrySelection(this)" class="${className} ministry-option ${isSelected ? 'selected' : ''}" data-value="${m}" style="${style} cursor: pointer; opacity: ${opacity}; border: ${border}; transform: ${transform}; font-size: 0.9rem; padding: 6px 12px; transition: all 0.2s;">${m}</span>`;
                    }).join('')}
                </div>
            </div>
            
            <button type="submit" class="btn-primary">${evento ? 'Atualizar' : 'Criar Evento'}</button>
        </form>
    `;
    
    showModal(modalBody);
    
    document.getElementById('eventoForm').onsubmit = async (e) => {
        e.preventDefault();
        await saveEvento(eventoId);
    };
}

async function addEventType() {
    const newType = prompt("Nome do novo tipo de evento:");
    if (!newType || newType.trim() === "") return;
    
    const normalized = newType.trim();
    if (eventTypes.includes(normalized)) {
        showToast("Este tipo já existe.", "warning");
        return;
    }
    
    try {
        const updatedTypes = [...eventTypes, normalized].sort();
        await db.collection('groups').doc(currentGroupId).update({
            eventTypes: updatedTypes
        });
        eventTypes = updatedTypes;
        
        // Atualizar select e selecionar o novo
        showEventoForm(); // Recarrega o form para atualizar a lista (mais simples)
        // Pequeno hack para pré-selecionar o novo valor após recarregar seria passar como parametro, mas o usuário pode selecionar manualmente agora.
        // Para melhor UX, vamos apenas adicionar ao DOM se o modal estiver aberto, mas recarregar o form é mais seguro para manter estado.
        // Vamos apenas adicionar ao select atual:
        const select = document.getElementById('eventoTipo');
        if (select) {
            const option = document.createElement('option');
            option.value = normalized;
            option.text = normalized;
            option.selected = true;
            select.add(option);
        }
        showToast("Tipo adicionado!", "success");
        loadEventTypeOptions(); // Atualizar filtro principal
    } catch (e) {
        showToast("Erro ao adicionar tipo: " + e.message, 'error');
    }
}

async function deleteEventType() {
    const select = document.getElementById('eventoTipo');
    if (!select) return;
    const typeToDelete = select.value;
    
    if (!typeToDelete) return;
    
    if (!eventTypes.includes(typeToDelete)) {
        showToast("Este tipo não está na lista salva.", "warning");
        return;
    }

    if (!confirm(`Deseja excluir o tipo "${typeToDelete}" da lista de opções?\n(Eventos existentes com este tipo NÃO serão alterados)`)) return;

    try {
        const updatedTypes = eventTypes.filter(t => t !== typeToDelete);
        await db.collection('groups').doc(currentGroupId).update({
            eventTypes: updatedTypes
        });
        eventTypes = updatedTypes;
        
        // Remover do select
        select.remove(select.selectedIndex);
        showToast("Tipo removido da lista!", "success");
        loadEventTypeOptions(); // Atualizar filtro principal
    } catch (e) {
        showToast("Erro ao remover tipo: " + e.message, 'error');
    }
}

function toggleEventoMinisterios() {
    const dest = document.getElementById('eventoDestinatarios').value;
    document.getElementById('eventoMinisteriosGroup').style.display = dest === 'servos' ? 'block' : 'none';
}

function toggleMinistrySelection(element) {
    const isSelected = element.classList.contains('selected');
    
    if (isSelected) {
        element.classList.remove('selected');
        element.style.opacity = '0.5';
        element.style.border = '1px solid transparent';
        element.style.transform = 'scale(1)';
    } else {
        element.classList.add('selected');
        element.style.opacity = '1';
        element.style.border = '2px solid var(--text-primary)';
        element.style.transform = 'scale(1.05)';
    }
}

function toggleAllMinistriesSelection() {
    const allOptions = document.querySelectorAll('.ministry-option');
    const allSelected = Array.from(allOptions).every(el => el.classList.contains('selected'));
    
    allOptions.forEach(el => {
        if (allSelected) {
            el.classList.remove('selected');
            el.style.opacity = '0.5';
            el.style.border = '1px solid transparent';
            el.style.transform = 'scale(1)';
        } else {
            el.classList.add('selected');
            el.style.opacity = '1';
            el.style.border = '2px solid var(--text-primary)';
            el.style.transform = 'scale(1.05)';
        }
    });
}

async function saveEvento(eventoId) {
    const nome = document.getElementById('eventoNome').value;
    const data = document.getElementById('eventoData').value;
    const horario = document.getElementById('eventoHorario').value;
    const local = document.getElementById('eventoLocal').value;
    const tipo = document.getElementById('eventoTipo').value;
    const observacao = document.getElementById('eventoObservacao').value;
    const repete = document.getElementById('eventoRepete').checked;
    const destinatarios = document.getElementById('eventoDestinatarios').value;
    
    // Validação de data passada para novos eventos
    if (!eventoId && data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [year, month, day] = data.split('-').map(Number);
        const inputDate = new Date(year, month - 1, day);
        
        if (inputDate < today) {
            if (!confirm("⚠️ A data selecionada é anterior a hoje.\n\nDeseja realmente criar um evento no passado?")) {
                return;
            }
        }
    }

    let ministeriosSelecionados = [];
    if (destinatarios === 'servos') {
        document.querySelectorAll('.ministry-option.selected').forEach(el => {
            ministeriosSelecionados.push(el.getAttribute('data-value'));
        });
    }
    
    const eventoData = {
        nome,
        data,
        horario,
        local,
        tipo,
        observacao,
        repete,
        destinatarios,
        ministerios: ministeriosSelecionados,
        groupId: currentGroupId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (eventoId) {
            await db.collection('eventos').doc(eventoId).update(eventoData);
        } else {
            eventoData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('eventos').add(eventoData);
        }
        
        logActivity(eventoId ? 'Editar Evento' : 'Criar Evento', `Nome: ${nome}`, 'eventos');
        closeModal();
        await loadDashboard();
        loadEventos();
    } catch (error) {
        showToast('Erro ao salvar evento: ' + error.message, 'error');
    }
}

function editEvento(eventoId) {
    showEventoForm(eventoId);
}

function duplicateEvento(eventoId) {
    const original = eventos.find(e => e.id === eventoId);
    if (!original) return;
    
    const copy = { ...original };
    copy.nome = `${copy.nome} (Cópia)`;
    
    showEventoForm(null, copy);
}

async function deleteEvento(eventoId) {
    if (confirm('Tem certeza que deseja excluir este evento?')) {
        const evento = eventos.find(e => e.id === eventoId);
        try {
            await db.collection('eventos').doc(eventoId).delete();
            logActivity('Excluir Evento', `Nome: ${evento ? evento.nome : 'Desconhecido'}`, 'eventos');
            await loadDashboard();
            loadEventos();
        } catch (error) {
            showToast('Erro ao excluir evento: ' + error.message, 'error');
        }
    }
}

async function showEventoPresencas(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    
    try {
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
            
        const presencasMap = new Map();
        presencasSnapshot.docs.forEach(doc => {
            presencasMap.set(doc.data().pessoaId, doc.id);
        });
        
        const pessoasPresentes = pessoas.filter(p => presencasMap.has(p.id));
        pessoasPresentes.sort((a, b) => a.nome.localeCompare(b.nome));
        
        const modalBody = `
            <h2>Presenças - ${escapeHtml(evento.nome)}</h2>
            <p style="margin-bottom: 1rem;">${formatDate(evento.data)} às ${escapeHtml(evento.horario)}</p>
            
            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                <h4 style="margin-bottom: 8px; font-size: 0.9rem;">Adicionar Presença Manual</h4>
                <div style="position: relative;">
                    <input type="text" id="searchToAdd" placeholder="Buscar pessoa para adicionar..." class="input-field" onkeyup="searchPeopleToAdd('${eventoId}', this.value)" autocomplete="off">
                    <div id="searchResultsToAdd" style="position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0 0 8px 8px; max-height: 200px; overflow-y: auto; z-index: 10; display: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <p><strong>Total de Presentes: ${pessoasPresentes.length}</strong></p>
                <input type="text" id="searchPresencas" placeholder="Buscar na lista..." class="input-field" style="width: 200px;" onkeyup="filterPresencasTable()">
            </div>
            
            <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem; border: 1px solid #eee; border-radius: 8px;">
                <table class="table" style="margin: 0;">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th style="width: 50px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="presencasTableBody">
                        ${pessoasPresentes.length === 0 ? 
                            '<tr><td colspan="4" style="text-align: center;">Nenhuma presença registrada</td></tr>' :
                            pessoasPresentes.map((p, index) => `
                                <tr>
                                    <td style="color: var(--text-secondary); font-size: 0.9em;">${index + 1}</td>
                                    <td>
                                        ${escapeHtml(p.nome)}
                                        ${!checkEligibility(p, evento) ? '<span class="badge badge-warning" style="font-size: 0.7em; margin-left: 5px;">Convidado</span>' : ''}
                                    </td>
                                    <td><span class="badge badge-${p.tipo === 'servo' ? 'primary' : 'success'}">${p.tipo}</span></td>
                                    <td>
                                        <button class="btn-icon" onclick="deletePresencaFromList('${presencasMap.get(p.id)}', '${eventoId}')" title="Remover Presença" style="color: #dc3545;">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
        
        showModal(modalBody);
    } catch (error) {
        showToast('Erro ao carregar presenças: ' + error.message, 'error');
    }
}

function searchPeopleToAdd(eventoId, query) {
    const container = document.getElementById('searchResultsToAdd');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = pessoas.filter(p => p.nome.toLowerCase().includes(lowerQuery)).slice(0, 5);
    
    if (matches.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = matches.map(p => `
        <div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;" onclick="confirmPresenceManual('${p.id}', '${eventoId}', true)">
            <span>${escapeHtml(p.nome)}</span>
            <span class="badge badge-${p.tipo === 'servo' ? 'primary' : 'success'}" style="font-size: 0.7em;">${p.tipo}</span>
        </div>
    `).join('');
    container.style.display = 'block';
}

async function confirmPresenceManual(pessoaId, eventoId, fromSearch = false) {
    // Verificar se já está presente
    const existing = await db.collection('presencas')
        .where('groupId', '==', currentGroupId)
        .where('eventoId', '==', eventoId)
        .where('pessoaId', '==', pessoaId)
        .get();
        
    if (!existing.empty) {
        showToast('Esta pessoa já está marcada como presente.', 'warning');
        if (fromSearch) {
             document.getElementById('searchToAdd').value = '';
             document.getElementById('searchResultsToAdd').style.display = 'none';
        }
        return;
    }

    if (confirm('Confirmar presença para esta pessoa?')) {
        try {
            const batch = db.batch();
            const ref = db.collection('presencas').doc();
            batch.set(ref, {
                groupId: currentGroupId,
                eventoId: eventoId,
                pessoaId: pessoaId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                manual: true
            });
            
            // Remover justificativa se existir
            const justSnapshot = await db.collection('justificativas')
                .where('groupId', '==', currentGroupId)
                .where('eventoId', '==', eventoId)
                .where('pessoaId', '==', pessoaId)
                .get();
                
            justSnapshot.forEach(doc => batch.delete(doc.ref));
            
            await batch.commit();
            showToast('Presença adicionada!', 'success');
            const p = pessoas.find(p => p.id === pessoaId);
            const e = eventos.find(ev => ev.id === eventoId);
            logActivity('Presença Manual', `Pessoa: ${p ? p.nome : pessoaId} no evento: ${e ? e.nome : eventoId}`, 'presencas');
            
            if (fromSearch) {
                showEventoPresencas(eventoId);
            } else {
                showEventoAusentes(eventoId);
            }
            loadDashboard();
        } catch (error) {
            showToast('Erro: ' + error.message, 'error');
        }
    }
}

function filterPresencasTable() {
    const input = document.getElementById('searchPresencas');
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('presencasTableBody');
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const nameCell = rows[i].getElementsByTagName('td')[1];
        if (nameCell) {
            const txtValue = nameCell.textContent || nameCell.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }
}

async function deletePresencaFromList(presencaId, eventoId) {
    if (confirm('Tem certeza que deseja remover esta presença?')) {
        try {
            await db.collection('presencas').doc(presencaId).delete();
            logActivity('Remover Presença', `ID Presença: ${presencaId}`, 'presencas');
            // Recarrega a lista para mostrar a atualização
            await showEventoPresencas(eventoId);
        } catch (error) {
            showToast('Erro ao remover presença: ' + error.message, 'error');
        }
    }
}

async function showEventoAusentes(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    
    try {
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
            
        const presencasIds = new Set(presencasSnapshot.docs.map(doc => doc.data().pessoaId));
        
        // Buscar justificativas
        const justificativasSnapshot = await db.collection('justificativas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
            
        currentJustificativas.clear();
        justificativasSnapshot.docs.forEach(doc => {
            currentJustificativas.set(doc.data().pessoaId, { id: doc.id, ...doc.data() });
        });

        // Determinar elegíveis
        let elegiveis = [];
        if (evento.destinatarios === 'todos') {
            elegiveis = pessoas;
        } else if (evento.destinatarios === 'servos') {
            if (!evento.ministerios || evento.ministerios.length === 0) {
                elegiveis = pessoas.filter(p => p.tipo === 'servo');
            } else {
                elegiveis = pessoas.filter(p => p.tipo === 'servo' && p.ministerios?.some(m => evento.ministerios.includes(m)));
            }
        }
        
        const ausentes = elegiveis.filter(p => !presencasIds.has(p.id));
        ausentes.sort((a, b) => a.nome.localeCompare(b.nome));
        
        const modalBody = `
            <h2>Ausentes - ${escapeHtml(evento.nome)}</h2>
            <p style="margin-bottom: 1rem;">${formatDate(evento.data)} às ${escapeHtml(evento.horario)}</p>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <p><strong>Total de Ausentes: ${ausentes.length}</strong></p>
                <input type="text" id="searchAusentes" placeholder="Buscar na lista..." class="input-field" style="width: 200px;" onkeyup="filterAusentesTable()">
            </div>
            
            <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem; border: 1px solid #eee; border-radius: 8px;">
                <table class="table" style="margin: 0;">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Telefone</th>
                            <th style="width: 50px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="ausentesTableBody">
                        ${ausentes.length === 0 ? 
                            '<tr><td colspan="5" style="text-align: center;">Todos compareceram! 🎉</td></tr>' :
                            ausentes.map((p, index) => {
                                const just = currentJustificativas.get(p.id);
                                return `
                                <tr>
                                    <td style="color: var(--text-secondary); font-size: 0.9em;">${index + 1}</td>
                                    <td>
                                        ${escapeHtml(p.nome)}
                                        ${just ? `<div style="font-size: 0.85em; color: #666; margin-top: 4px; font-style: italic;">📝 ${escapeHtml(just.observation)}</div>` : ''}
                                    </td>
                                    <td><span class="badge badge-${p.tipo === 'servo' ? 'primary' : 'success'}">${p.tipo}</span></td>
                                    <td>${escapeHtml(p.telefone || '')}</td>
                                    <td>
                                        <button class="btn-icon" onclick="confirmPresenceManual('${p.id}', '${eventoId}')" title="Marcar Presença" style="color: #28a745; margin-right: 5px;">✅</button>
                                        <button class="btn-icon" onclick="sendAbsentMessage('${escapeHtml(p.nome)}', '${p.telefone}', '${escapeHtml(evento.nome)}')" title="Enviar Mensagem" style="color: #25D366; margin-right: 5px;">📱</button>
                                        <button class="btn-icon" onclick="justifyAbsence('${p.id}', '${eventoId}')" title="${just ? 'Editar Justificativa' : 'Justificar Ausência'}" style="color: #ffc107;">📝</button>
                                    </td>
                                </tr>
                            `}).join('')
                        }
                    </tbody>
                </table>
            </div>
        `;
        
        showModal(modalBody);
    } catch (error) {
        showToast('Erro ao carregar ausentes: ' + error.message, 'error');
    }
}

function filterAusentesTable() {
    const input = document.getElementById('searchAusentes');
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('ausentesTableBody');
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const nameCell = rows[i].getElementsByTagName('td')[1];
        if (nameCell) {
            const txtValue = nameCell.textContent || nameCell.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }
}

async function justifyAbsence(pessoaId, eventoId) {
    const currentJust = currentJustificativas.get(pessoaId);
    const currentText = currentJust ? currentJust.observation : "";
    
    const observation = prompt("Motivo da ausência:", currentText);
    
    if (observation === null) return; // Cancelou
    
    try {
        if (observation.trim() === "") {
            if (currentJust) {
                if (confirm("Deseja remover a justificativa?")) {
                    await db.collection('justificativas').doc(currentJust.id).delete();
                } else {
                    return;
                }
            } else {
                return;
            }
        } else {
            const data = {
                groupId: currentGroupId,
                eventoId: eventoId,
                pessoaId: pessoaId,
                observation: observation,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (currentJust) {
                await db.collection('justificativas').doc(currentJust.id).update(data);
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('justificativas').add(data);
            }
        }
        
        logActivity('Justificar Ausência', `Pessoa ID: ${pessoaId} no evento ID: ${eventoId}`, 'presencas');
        // Recarregar lista
        await showEventoAusentes(eventoId);
        
        // Atualizar dados globais
        await loadDashboard();
    } catch (error) {
        showToast('Erro ao salvar justificativa: ' + error.message, 'error');
    }
}

function sendAbsentMessage(nome, telefone, eventoNome) {
    if (!telefone) return showToast('Pessoa sem telefone.', 'warning');
    
    const cleanPhone = telefone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length <= 11 ? '55' + cleanPhone : cleanPhone;
    const primeiroNome = nome.split(' ')[0];
    
    const message = `Olá ${primeiroNome}, sentimos sua falta no evento *${eventoNome}*! Está tudo bem?`;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
    logActivity('Envio Mensagem', `Ausência em ${eventoNome} para ${nome}`, 'mensagens');
}

function showExportOptions(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;

    const modalBody = `
        <h2>Exportar Relatório</h2>
        <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">Escolha o formato para o relatório do evento <strong>${escapeHtml(evento.nome)}</strong>:</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <button class="btn-secondary" onclick="exportEventoRelatorio('${eventoId}'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 1.5rem; height: 100%;">
                <span style="font-size: 2rem;">📊</span>
                <span>Excel</span>
            </button>
            <button class="btn-secondary" onclick="exportEventoRelatorioPDF('${eventoId}'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 1.5rem; height: 100%;">
                <span style="font-size: 2rem;">📄</span>
                <span>PDF</span>
            </button>
        </div>
    `;
    
    showModal(modalBody);
}

async function exportEventoRelatorio(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;

    const btn = document.activeElement;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '⏳';

    try {
        // 1. Buscar dados de presença e justificativas
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
        const presencasIds = new Set(presencasSnapshot.docs.map(doc => doc.data().pessoaId));

        const justificativasSnapshot = await db.collection('justificativas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
        const justificativasMap = new Map();
        justificativasSnapshot.docs.forEach(doc => {
            justificativasMap.set(doc.data().pessoaId, doc.data().observation);
        });

        // 2. Determinar pessoas elegíveis (público alvo)
        const elegiveis = pessoas.filter(p => checkEligibility(p, evento));
        
        // Identificar convidados (presentes que não eram elegíveis)
        const eligibleIds = new Set(elegiveis.map(p => p.id));
        const guests = pessoas.filter(p => presencasIds.has(p.id) && !eligibleIds.has(p.id));
        const allPeople = [...elegiveis, ...guests];

        // 3. Montar linhas do relatório
        const rows = allPeople.map(p => {
            const isGuest = !eligibleIds.has(p.id);
            let just = justificativasMap.get(p.id) || '';
            if (isGuest) {
                just = just ? `(Convidado) ${just}` : '(Convidado)';
            }

            return {
                "Nome": p.nome,
                "Tipo": p.tipo,
                "Telefone": p.telefone || '',
                "Status": presencasIds.has(p.id) ? 'Presente' : 'Ausente',
                "Justificativa": just
            };
        });

        rows.sort((a, b) => a.Nome.localeCompare(b.Nome));

        // 4. Gerar arquivo Excel
        const wb = XLSX.utils.book_new();

        // Sheet 1: Lista de Presença
        const wsLista = XLSX.utils.json_to_sheet(rows);
        wsLista['!cols'] = [{wch: 30}, {wch: 15}, {wch: 15}, {wch: 10}, {wch: 40}];
        XLSX.utils.book_append_sheet(wb, wsLista, "Lista Detalhada");

        // Exportar
        const fileName = `Relatorio_${evento.nome.replace(/[^a-z0-9]/gi, '_')}_${evento.data}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showToast('Relatório gerado com sucesso!', 'success');

    } catch (error) {
        console.error(error);
        showToast('Erro ao exportar relatório: ' + error.message, 'error');
    } finally {
        if (btn) btn.innerHTML = originalText;
    }
}

async function exportEventoRelatorioPDF(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;

    const btn = document.activeElement;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '⏳';

    try {
        // 1. Buscar dados (mesma lógica do Excel)
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
        const presencasIds = new Set(presencasSnapshot.docs.map(doc => doc.data().pessoaId));

        const justificativasSnapshot = await db.collection('justificativas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
        const justificativasMap = new Map();
        justificativasSnapshot.docs.forEach(doc => {
            justificativasMap.set(doc.data().pessoaId, doc.data().observation);
        });

        // Determinar elegíveis e convidados
        const elegiveis = pessoas.filter(p => checkEligibility(p, evento));
        const eligibleIds = new Set(elegiveis.map(p => p.id));
        const guests = pessoas.filter(p => presencasIds.has(p.id) && !eligibleIds.has(p.id));
        const allPeople = [...elegiveis, ...guests];

        const rows = allPeople.map(p => {
            const isGuest = !eligibleIds.has(p.id);
            let just = justificativasMap.get(p.id) || '';
            if (isGuest) {
                just = just ? `(Convidado) ${just}` : '(Convidado)';
            }

            return {
                nome: p.nome,
                tipo: p.tipo === 'servo' ? 'Servo' : 'Participante',
                telefone: p.telefone || '',
                status: presencasIds.has(p.id) ? 'Presente' : 'Ausente',
                justificativa: just,
                isGuest: isGuest
            };
        });

        rows.sort((a, b) => a.nome.localeCompare(b.nome));

        // 2. Gerar PDF
        if (!window.jspdf) {
            throw new Error("Biblioteca PDF não carregada. Recarregue a página.");
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Cabeçalho
        const groupName = document.getElementById('groupNameSidebar')?.textContent || 'Grupo';
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(groupName.toUpperCase(), 14, 15);

        doc.setFontSize(18);
        doc.setTextColor(37, 99, 235); // Azul Primary
        doc.text(evento.nome, 14, 25);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`${formatDate(evento.data)} às ${evento.horario} | ${evento.local || 'Local não informado'}`, 14, 33);
        doc.text(`Público: ${evento.destinatarios === 'todos' ? 'Todos' : 'Servos'}`, 14, 38);

        // Tabela
        const tableBody = rows.map(r => [r.nome, r.tipo, r.telefone, r.status, r.justificativa]);

        doc.autoTable({
            head: [['Nome', 'Tipo', 'Telefone', 'Status', 'Justificativa']],
            body: tableBody,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 3: { fontStyle: 'bold' } },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 3) {
                    if (data.cell.raw === 'Presente') {
                        data.cell.styles.textColor = [22, 163, 74]; // Verde
                    } else {
                        data.cell.styles.textColor = [220, 38, 38]; // Vermelho
                    }
                }
            }
        });

        // Resumo Final
        const total = rows.length;
        const presentesTotal = rows.filter(r => r.status === 'Presente').length;
        const convidados = rows.filter(r => r.isGuest).length;
        const presentesRegulares = presentesTotal - convidados;
        const ausentes = rows.filter(r => r.status === 'Ausente').length;
        const justificados = rows.filter(r => r.justificativa).length;
        
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(`Resumo: Total ${total} | Presentes: ${presentesTotal} (Convidados: ${convidados}) | Ausentes: ${ausentes} | Justificativas: ${justificados}`, 14, finalY);

        // Gráfico de Pizza
        if (total > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            const centerX = 100;
            const centerY = 100;
            const radius = 80;
            
            const dataPie = [
                { label: 'Presentes', value: presentesRegulares, color: '#16a34a' },
                { label: 'Convidados', value: convidados, color: '#f59e0b' },
                { label: 'Ausentes', value: ausentes, color: '#dc2626' }
            ];
            
            let startAngle = 0;
            
            // Desenhar fatias
            dataPie.forEach(slice => {
                if (slice.value === 0) return;
                const sliceAngle = (slice.value / total) * 2 * Math.PI;
                
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();
                startAngle += sliceAngle;
            });

            // Desenhar Legenda
            let legendY = 80;
            const legendX = 220;
            ctx.font = 'bold 14px Arial';
            
            dataPie.forEach(slice => {
                ctx.fillStyle = slice.color;
                ctx.fillRect(legendX, legendY, 15, 15);
                
                ctx.fillStyle = '#333';
                ctx.fillText(`${slice.label}: ${Math.round((slice.value/total)*100)}%`, legendX + 25, legendY + 12);
                
                legendY += 25;
            });

            const imgData = canvas.toDataURL('image/png');
            
            let chartY = finalY + 15;
            // Verificar se cabe na página (Altura A4 ~297mm)
            if (chartY + 60 > 280) {
                doc.addPage();
                chartY = 20;
            }
            
            doc.addImage(imgData, 'PNG', 14, chartY, 100, 50);
        }

        doc.save(`Relatorio_${evento.nome.replace(/[^a-z0-9]/gi, '_')}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');

    } catch (error) {
        console.error(error);
        showToast('Erro ao gerar PDF: ' + error.message, 'error');
    } finally {
        if (btn) btn.innerHTML = originalText;
    }
}

async function exportComparisonPDF() {
    const { rows, events } = window.currentComparisonData;
    if (!window.jspdf) return showToast("Erro: Biblioteca PDF não carregada.", "error");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); 
    
    const groupName = document.getElementById('groupNameSidebar')?.textContent || 'Grupo';
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(groupName.toUpperCase(), 14, 10);
    
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text("Comparativo de Presença", 14, 18);
    
    const headers = [['Nome', 'Tipo', ...events.map(e => `${e.nome}\n${formatDate(e.data)}`), 'Freq.']];
    const body = rows.map(r => [
        r.nome, 
        r.tipo, 
        ...events.map(e => r.eventos[e.id].status), 
        r.percentage !== null ? r.percentage.toFixed(0) + '%' : '-'
    ]);
    
    doc.autoTable({
        head: headers,
        body: body,
        startY: 25,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, halign: 'center', valign: 'middle' },
        columnStyles: { 0: { fontStyle: 'bold' } },
        didParseCell: function(data) {
            // Colunas de eventos começam no índice 2
            if (data.section === 'body' && data.column.index >= 2 && data.column.index < 2 + events.length) {
                const text = data.cell.raw;
                if (text && text.includes('Presente')) {
                    data.cell.styles.textColor = [22, 163, 74]; // Verde
                    data.cell.styles.fillColor = [240, 253, 244]; // Fundo Verde Claro
                } else if (text === 'Ausente') {
                    data.cell.styles.textColor = [220, 38, 38]; // Vermelho
                    data.cell.styles.fillColor = [254, 242, 242]; // Fundo Vermelho Claro
                } else if (text === 'Justificado') {
                    data.cell.styles.textColor = [217, 119, 6]; // Laranja
                    data.cell.styles.fillColor = [255, 251, 235]; // Fundo Laranja Claro
                }
            }
        }
    });
    
    doc.save('Comparativo_Presenca.pdf');
}

// ==================== LOGS DE ATIVIDADE ====================

async function logActivity(action, details, category = 'geral') {
    if (!currentUser || !currentGroupId) return;

    try {
        await db.collection('activity_logs').add({
            groupId: currentGroupId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            action: action,
            details: details,
            category: category,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao registrar log:", error);
    }
}

async function loadActivityLogs() {
    const container = document.getElementById('logsTableBody');
    container.innerHTML = '<tr><td colspan="4" style="text-align: center;">Carregando logs...</td></tr>';

    try {
        const logsSnapshot = await db.collection('activity_logs')
            .where('groupId', '==', currentGroupId)
            .orderBy('timestamp', 'desc')
            .limit(100) // Limitar aos últimos 100 logs para performance
            .get();

        if (logsSnapshot.empty) {
            container.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma atividade registrada recentemente.</td></tr>';
            currentLogs = [];
            return;
        }

        currentLogs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dateObj: data.timestamp ? data.timestamp.toDate() : new Date(0)
            };
        });

        filterLogsClientSide();

    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        container.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Erro ao carregar logs: ${error.message}</td></tr>`;
    }
}

async function archiveOldLogs() {
    if (!confirm('Deseja arquivar logs com mais de 30 dias? Eles serão movidos para uma coleção de arquivo.')) return;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
        const snapshot = await db.collection('activity_logs')
            .where('groupId', '==', currentGroupId)
            .where('timestamp', '<', thirtyDaysAgo)
            .get();
            
        if (snapshot.empty) {
            showToast('Nenhum log antigo para arquivar.', 'info');
            return;
        }
        
        // Processar em lotes
        const chunks = [];
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 500) {
            chunks.push(docs.slice(i, i + 500));
        }

        let count = 0;
        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(doc => {
                const data = doc.data();
                const archiveRef = db.collection('archived_activity_logs').doc(doc.id);
                batch.set(archiveRef, data);
                batch.delete(doc.ref);
                count++;
            });
            await batch.commit();
        }
        
        logActivity('Sistema', `Arquivados ${count} logs antigos`, 'sistema');
        loadActivityLogs();
        showToast(`${count} logs foram arquivados com sucesso.`, 'success');
        
    } catch (error) {
        console.error(error);
        showToast('Erro ao arquivar logs: ' + error.message, 'error');
    }
}

function showArchivedLogs() {
    const modalBody = `
        <h2>Logs Arquivados</h2>
        <p class="help-text" style="margin-bottom: 1rem;">Histórico de atividades com mais de 30 dias.</p>
        <div class="table-container" style="max-height: 60vh; overflow-y: auto;">
            <table class="table">
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Usuário</th>
                        <th>Ação</th>
                        <th>Detalhes</th>
                    </tr>
                </thead>
                <tbody id="archivedLogsTableBody">
                    <tr><td colspan="4" style="text-align: center;">Carregando...</td></tr>
                </tbody>
            </table>
        </div>
        <div style="text-align: right; margin-top: 1rem;">
            <button onclick="closeModal()" class="btn-secondary">Fechar</button>
        </div>
    `;
    showModal(modalBody);
    loadArchivedLogs();
}

async function loadArchivedLogs() {
    const container = document.getElementById('archivedLogsTableBody');
    try {
        const snapshot = await db.collection('archived_activity_logs')
            .where('groupId', '==', currentGroupId)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum log arquivado encontrado.</td></tr>';
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const log = doc.data();
            const date = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'Data desconhecida';
            const action = log.action || '';
            const isDeletion = action.includes('Excluir') || action.includes('Remover') || action.includes('Rejeitar') || action.includes('Desfazer');
            const badgeClass = isDeletion ? 'badge-danger' : 'badge-primary';
            
            return `
                <tr>
                    <td style="font-size: 0.85em; color: var(--text-secondary);">${date}</td>
                    <td>${log.userEmail}</td>
                    <td><span class="badge ${badgeClass}">${action}</span></td>
                    <td style="font-size: 0.9em; white-space: pre-wrap;">${log.details}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error("Erro ao carregar logs arquivados:", error);
        container.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Erro: ${error.message}</td></tr>`;
    }
}

function filterLogsClientSide() {
    const userFilter = document.getElementById('filterLogUser')?.value.toLowerCase() || '';
    const actionFilter = document.getElementById('filterLogAction')?.value.toLowerCase() || '';
    const dateFilter = document.getElementById('filterLogDate')?.value || '';

    let filtered = currentLogs;

    if (userFilter) {
        filtered = filtered.filter(log => (log.userEmail || '').toLowerCase().includes(userFilter));
    }

    if (actionFilter) {
        filtered = filtered.filter(log => (log.action || '').toLowerCase().includes(actionFilter));
    }

    if (dateFilter) {
        filtered = filtered.filter(log => {
            const logDateStr = log.dateObj.getFullYear() + '-' + 
                               String(log.dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                               String(log.dateObj.getDate()).padStart(2, '0');
            return logDateStr === dateFilter;
        });
    }

    renderLogsTable(filtered);
}

function showLogDetails(logId) {
    const log = currentLogs.find(l => l.id === logId);
    if (!log) return;

    const date = log.dateObj.toLocaleString('pt-BR');
    
    const modalBody = `
        <h2>Detalhes da Atividade</h2>
        <div style="margin-bottom: 1rem;">
            <p><strong>Data:</strong> ${date}</p>
            <p><strong>Usuário:</strong> ${log.userEmail}</p>
            <p><strong>Ação:</strong> <span class="badge badge-primary">${log.action}</span></p>
        </div>
        <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
            <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">DETALHES</h4>
            <div style="white-space: pre-wrap; font-family: monospace; font-size: 0.9rem; color: var(--text-primary);">${log.details}</div>
        </div>
        <div style="text-align: right; margin-top: 1rem;">
            <button onclick="closeModal()" class="btn-secondary">Fechar</button>
        </div>
    `;
    showModal(modalBody);
}

function renderLogsTable(logs) {
    const container = document.getElementById('logsTableBody');
    
    if (logs.length === 0) {
        container.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum log encontrado com os filtros atuais.</td></tr>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const date = log.dateObj.toLocaleString('pt-BR');
        const action = log.action || '';
        const isDeletion = action.includes('Excluir') || action.includes('Remover') || action.includes('Rejeitar') || action.includes('Desfazer');
        const badgeClass = isDeletion ? 'badge-danger' : 'badge-primary';
        const rowStyle = isDeletion ? 'background-color: rgba(239, 68, 68, 0.05);' : '';
        
        return `
            <tr style="${rowStyle} cursor: pointer;" onclick="showLogDetails('${log.id}')" title="Clique para ver detalhes">
                <td style="font-size: 0.85em; color: var(--text-secondary);">${date}</td>
                <td>${log.userEmail}</td>
                <td><span class="badge ${badgeClass}">${action}</span></td>
                <td style="font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;">${log.details}</td>
            </tr>
        `;
    }).join('');
}

// ==================== CHECK-IN ====================

async function loadCheckinEventos(preselectId = null) {
    const select = document.getElementById('checkinEvento');
    
    // Carregar apenas eventos futuros e do dia
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const eventosDisponiveis = eventos.filter(e => {
        const dataEvento = new Date(e.data);
        const dataEventoAjustada = new Date(dataEvento.getTime() + dataEvento.getTimezoneOffset() * 60000);
        dataEventoAjustada.setHours(0, 0, 0, 0);
        return dataEventoAjustada >= hoje;
    }).sort((a, b) => new Date(a.data) - new Date(b.data));
    
    select.innerHTML = '<option value="">Selecione um evento...</option>' +
        eventosDisponiveis.map(e => 
            `<option value="${e.id}">${escapeHtml(e.nome)} - ${formatDate(e.data)} ${escapeHtml(e.horario)}</option>`
        ).join('');
        
    if (preselectId) {
        select.value = preselectId;
        if (select.value === preselectId) {
            loadCheckinEvent();
        }
    }
}

function quickCheckinNavigation(eventoId) {
    // Navegar manualmente para evitar chamada duplicada ou sem argumentos do showSection
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById('checkin').classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.querySelector(`[data-section="checkin"]`);
    if (navItem) navItem.classList.add('active');
    
    // Fechar menu mobile se estiver aberto
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('mobile-open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }

    loadCheckinEventos(eventoId);
}

let currentCheckinEvento = null;

function loadCheckinEvent() {
    const eventoId = document.getElementById('checkinEvento').value;
    
    if (!eventoId) {
        document.getElementById('checkinInterface').style.display = 'none';
        return;
    }
    
    currentCheckinEvento = eventos.find(e => e.id === eventoId);
    document.getElementById('checkinInterface').style.display = 'block';
    loadCheckinList(eventoId);
}

function showCheckinMethod(method) {
    document.querySelectorAll('.checkin-methods .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.checkin-method').forEach(m => m.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById('checkin' + method.charAt(0).toUpperCase() + method.slice(1)).classList.add('active');
    
    // Parar scanner se sair da aba de código
    if (method !== 'codigo' && html5QrcodeScanner) {
        toggleBarcodeScanner();
    }

    if (method === 'codigo') {
        setTimeout(() => {
            document.getElementById('barcodeInput').focus();
        }, 100);
    }
}

// Busca por nome
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchCheckin');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            if (query.length < 3) {
                document.getElementById('searchResults').innerHTML = '';
                return;
            }
            
            const results = pessoas.filter(p => 
                p.nome.toLowerCase().includes(query)
            ).slice(0, 10);
            
            document.getElementById('searchResults').innerHTML = results.map(pessoa => `
                <div class="search-result-item" onclick="doCheckin('${pessoa.id}', 'Busca Manual')">
                    <div>
                        <strong>${escapeHtml(pessoa.nome)}</strong>
                        <p class="help-text">${pessoa.tipo === 'servo' ? 'Servo' : 'Participante'}</p>
                    </div>
                    <button class="btn-primary">Check-in</button>
                </div>
            `).join('');
        });
    }
    
    // Código de barras
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const barcode = e.target.value.trim();
                const pessoa = pessoas.find(p => p.barcode === barcode);
                
                if (pessoa) {
                    await doCheckin(pessoa.id, 'Código de Barras (Leitor/Digitação)');
                    e.target.value = '';
                } else {
                    showToast('Código de barras não encontrado!', 'error');
                    e.target.value = '';
                }
            }
        });
    }
});

function toggleBarcodeScanner() {
    const container = document.getElementById('scanner-container');
    const btn = document.getElementById('btnStartScanner');
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            container.style.display = 'none';
            btn.textContent = '📷 Abrir Câmera';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-primary');
            html5QrcodeScanner = null;
        }).catch(err => {
            console.error("Erro ao parar scanner:", err);
        });
    } else {
        container.style.display = 'block';
        btn.textContent = '⏹️ Parar Câmera';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');

        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    if (html5QrcodeScanner) html5QrcodeScanner.pause();

    const pessoa = pessoas.find(p => p.barcode === decodedText);
    
    if (pessoa) {
        await doCheckin(pessoa.id, 'Código de Barras (Câmera)');
    } else {
        showToast(`Código não encontrado: ${decodedText}`, 'error');
    }

    setTimeout(() => {
        if (html5QrcodeScanner) html5QrcodeScanner.resume();
    }, 1500);
}

function onScanFailure(error) {
    // Ignorar erros de leitura frame a frame
}

async function doCheckin(pessoaId, method = 'Manual') {
    if (!currentCheckinEvento) {
        alert('Selecione um evento primeiro!');
        return;
    }
    
    const pessoa = pessoas.find(p => p.id === pessoaId);
    
    const disableGuestConfirm = localStorage.getItem('disableGuestConfirm') === 'true';

    if (pessoa && !checkEligibility(pessoa, currentCheckinEvento) && !disableGuestConfirm) {
        if (!confirm(`⚠️ ${pessoa.nome} não faz parte do público-alvo deste evento.\n\nDeseja marcar presença como CONVIDADO(A)?`)) {
            return;
        }
    }
    
    // Verificar se já fez check-in
    const existingCheckin = await db.collection('presencas')
        .where('groupId', '==', currentGroupId)
        .where('eventoId', '==', currentCheckinEvento.id)
        .where('pessoaId', '==', pessoaId)
        .get();
    
    if (!existingCheckin.empty) {
        showToast('Esta pessoa já fez check-in neste evento!', 'warning');
        return;
    }
    
    try {
        await db.collection('presencas').add({
            groupId: currentGroupId,
            eventoId: currentCheckinEvento.id,
            pessoaId: pessoaId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('searchCheckin').value = '';
        document.getElementById('searchResults').innerHTML = '';
        const time = new Date().toLocaleTimeString('pt-BR');
        logActivity('Check-in', `Pessoa: ${pessoa ? pessoa.nome : pessoaId} no evento ${currentCheckinEvento.nome}. Método: ${method}. Horário: ${time}`, 'presencas');
        
        loadCheckinList(currentCheckinEvento.id);
    } catch (error) {
        showToast('Erro ao fazer check-in: ' + error.message, 'error');
    }
}

async function loadCheckinList(eventoId) {
    const presencasSnapshot = await db.collection('presencas')
        .where('groupId', '==', currentGroupId)
        .where('eventoId', '==', eventoId)
        .get();
    
    const presencas = presencasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    document.getElementById('checkinCount').textContent = presencas.length;
    
    const container = document.getElementById('checkinList');
    
    if (presencas.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum check-in registrado ainda</p>';
        return;
    }
    
    container.innerHTML = presencas.map(p => {
        const pessoa = pessoas.find(pes => pes.id === p.pessoaId);
        return `
            <div class="checkin-item">
                <span>${escapeHtml(pessoa?.nome || 'Pessoa')}</span>
                <button class="btn-icon" onclick="removeCheckin('${p.id}')" title="Remover">❌</button>
            </div>
        `;
    }).join('');
}

async function removeCheckin(checkinId) {
    if (confirm('Remover este check-in?')) {
        try {
            await db.collection('presencas').doc(checkinId).delete();
            logActivity('Remover Check-in', `Evento: ${currentCheckinEvento?.nome}`, 'presencas');
            loadCheckinList(currentCheckinEvento.id);
        } catch (error) {
            showToast('Erro ao remover check-in: ' + error.message, 'error');
        }
    }
}

// Cadastro rápido
async function quickRegisterAndCheckin() {
    const nome = document.getElementById('quickNome').value;
    const telefone = document.getElementById('quickTelefone').value;
    
    if (!nome) {
        showToast('Digite o nome da pessoa!', 'warning');
        return;
    }
    
    try {
        const pessoaData = {
            nome,
            telefone,
            dataNascimento: '',
            tipo: 'participante',
            groupId: currentGroupId,
            barcode: generateBarcodeValue(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('pessoas').add(pessoaData);
        
        logActivity('Cadastro Rápido', `Nome: ${nome}`, 'pessoas');
        await doCheckin(docRef.id, 'Cadastro Rápido');
        
        document.getElementById('quickNome').value = '';
        document.getElementById('quickTelefone').value = '';
        
        await loadDashboard();
    } catch (error) {
        showToast('Erro ao cadastrar: ' + error.message, 'error');
    }
}

// ==================== MINISTÉRIOS ====================

async function loadMinisterios() {
    // Garantir que pessoas estejam carregadas para buscar nomes dos coordenadores
    if (pessoas.length === 0) {
        await loadDashboard();
    }

    const groupDoc = await db.collection('groups').doc(currentGroupId).get();
    const data = groupDoc.data();
    ministerios = data.ministerios || [];
    ministerioColors = data.ministerioColors || {};
    ministerioCoordinators = data.ministerioCoordinators || {};
    
    // Atualizar estado visual dos botões
    document.getElementById('btnMinViewCards')?.classList.toggle('active', currentMinisterioView === 'cards');
    document.getElementById('btnMinViewList')?.classList.toggle('active', currentMinisterioView === 'list');

    renderMinisterios();
    loadMinisteriosOptions();
}

function getDefaultMinisterioColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % TAG_PALETTE.length);
    return TAG_PALETTE[index];
}

function generateRandomColor() {
    const usedColors = Object.values(ministerioColors);
    let color;
    let attempts = 0;
    do {
        color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        attempts++;
    } while (usedColors.includes(color) && attempts < 10);
    return color;
}

function restoreDefaultMinisterioColor() {
    const nameInput = document.getElementById('ministerioNome');
    const colorInput = document.getElementById('ministerioCor');
    
    if (nameInput && colorInput && nameInput.value) {
        const defaultColor = getDefaultMinisterioColor(nameInput.value);
        colorInput.value = defaultColor;
    }
}

function setMinisterioView(view) {
    currentMinisterioView = view;
    localStorage.setItem('ministerioView', view);
    document.getElementById('btnMinViewCards')?.classList.toggle('active', view === 'cards');
    document.getElementById('btnMinViewList')?.classList.toggle('active', view === 'list');
    renderMinisterios();
}

function renderMinisterios() {
    const container = document.getElementById('ministeriosList');
    const badge = document.getElementById('totalMinisteriosBadge');
    
    if (badge) badge.textContent = ministerios.length;
    
    if (ministerios.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum ministério cadastrado</p>';
        return;
    }
    
    if (currentMinisterioView === 'list') {
        container.className = 'table-container';
        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Ministério</th>
                        <th>Coordenador</th>
                        <th style="width: 50px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${ministerios.map(m => {
                        const color = ministerioColors[m] || getDefaultMinisterioColor(m);
                        const coordData = ministerioCoordinators[m];
                        const coordIds = Array.isArray(coordData) ? coordData : (coordData ? [coordData] : []);
                        const coords = coordIds.map(id => pessoas.find(p => p.id === id)).filter(p => p);
                        const safeName = m.replace(/\s+/g, '');
                        
                        return `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; border: 1px solid #cbd5e1;"></div>
                                    <strong>${escapeHtml(m)}</strong>
                                </div>
                            </td>
                            <td>
                                <div style="display: flex; flex-direction: column; gap: 5px; cursor: pointer;" onclick="editMinisterioCoordinator('${m}')" title="Alterar Coordenadores">
                                    ${coords.length > 0 ? coords.map(c => `
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div class="avatar" style="width: 24px; height: 24px; font-size: 0.7em; background-color: ${getAvatarColor(c.nome)}">${getInitials(c.nome)}</div>
                                            <span>${escapeHtml(c.nome)}</span>
                                        </div>
                                    `).join('') : '<span style="color: var(--text-tertiary); font-style: italic; font-size: 0.9em;">Definir Coordenadores</span>'}
                                    <div style="font-size: 0.8em; opacity: 0.5; margin-top: 2px;">✏️ Editar</div>
                                </div>
                            </td>
                            <td>
                                <div class="action-menu-container">
                                    <button class="action-menu-btn" onclick="toggleActionMenu('min-${safeName}', event)">⋮</button>
                                    <div id="menu-min-${safeName}" class="action-menu-dropdown">
                                        <button class="action-menu-item" onclick="editMinisterio('${m}')">✏️ Editar Nome/Cor</button>
                                        <button class="action-menu-item" onclick="editMinisterioCoordinator('${m}')">👤 Alterar Coordenador</button>
                                        <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
                                        <button class="action-menu-item danger" onclick="deleteMinisterio('${m}')">🗑️ Excluir</button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    } else {
        container.className = 'ministerios-grid';
        container.innerHTML = ministerios.map(m => {
            const coordData = ministerioCoordinators[m];
            const coordIds = Array.isArray(coordData) ? coordData : (coordData ? [coordData] : []);
            const coords = coordIds.map(id => pessoas.find(p => p.id === id)).filter(p => p);
            const safeName = m.replace(/\s+/g, '');

            return `
            <div class="ministerio-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${ministerioColors[m] || getDefaultMinisterioColor(m)}; border: 1px solid #cbd5e1;"></div>
                        <h3>${escapeHtml(m)}</h3>
                    </div>
                    <div class="action-menu-container">
                        <button class="action-menu-btn" onclick="toggleActionMenu('min-card-${safeName}', event)">⋮</button>
                        <div id="menu-min-card-${safeName}" class="action-menu-dropdown">
                            <button class="action-menu-item" onclick="editMinisterio('${m}')">✏️ Editar</button>
                            <button class="action-menu-item danger" onclick="deleteMinisterio('${m}')">🗑️ Excluir</button>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                    <label class="help-text" style="display: block; margin-bottom: 5px;">Coordenadores</label>
                    <div style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 5px; border-radius: 4px; transition: background 0.2s;" onclick="editMinisterioCoordinator('${m}')" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='transparent'">
                        <div style="display: flex; flex-direction: column; gap: 5px; width: 100%;">
                            ${coords.length > 0 ? coords.map(c => `
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div class="avatar" style="width: 32px; height: 32px; font-size: 0.8em; background-color: ${getAvatarColor(c.nome)}">${getInitials(c.nome)}</div>
                                    <span style="font-weight: 500;">${escapeHtml(c.nome)}</span>
                                </div>
                            `).join('') : '<span style="color: var(--text-tertiary); font-style: italic;">Toque para definir</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `}).join('');
    }
}

function loadMinisteriosOptions() {
    const select = document.getElementById('filterMinisterio');
    if (select) {
        select.innerHTML = '<option value="">Todos os Ministérios</option>' +
            ministerios.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    }
}

function loadEventTypeOptions() {
    const select = document.getElementById('filterEventType');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos os Tipos</option>' +
            eventTypes.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        if (eventTypes.includes(currentValue)) select.value = currentValue;
    }
}

function showMinisterioForm(ministerioNome = null) {
    let currentColor;
    if (ministerioNome) {
        currentColor = ministerioColors[ministerioNome] || getDefaultMinisterioColor(ministerioNome);
    } else {
        currentColor = generateRandomColor();
    }
    
    const modalBody = `
        <h2>${ministerioNome ? 'Editar' : 'Novo'} Ministério</h2>
        <form id="ministerioForm">
            <div class="form-group">
                <label>Nome do Ministério *</label>
                <input type="text" id="ministerioNome" class="input-field" value="${ministerioNome || ''}" required>
            </div>
            <div class="form-group">
                <label>Cor da Etiqueta</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="color" id="ministerioCor" value="${currentColor}" style="height: 40px; width: 60px; padding: 0; border: none; background: none; cursor: pointer;">
                    <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 0.8em;" onclick="restoreDefaultMinisterioColor()" title="Usar cor gerada pelo sistema">Restaurar Padrão</button>
                </div>
                <p class="help-text" style="margin-top: 5px;">Escolha uma cor para identificar este ministério</p>
            </div>
            <button type="submit" class="btn-primary">${ministerioNome ? 'Atualizar' : 'Adicionar'}</button>
        </form>
    `;
    
    showModal(modalBody);
    
    document.getElementById('ministerioForm').onsubmit = async (e) => {
        e.preventDefault();
        await saveMinisterio(ministerioNome);
    };
}

async function saveMinisterio(oldName) {
    const newName = document.getElementById('ministerioNome').value;
    const newColor = document.getElementById('ministerioCor').value;
    
    if (!newName) return;
    
    try {
        let updatedMinisterios = [...ministerios];
        let updatedColors = { ...ministerioColors };
        let updatedCoordinators = { ...ministerioCoordinators };
        
        if (oldName) {
            const index = updatedMinisterios.indexOf(oldName);
            if (index > -1) {
                updatedMinisterios[index] = newName;
                if (oldName !== newName) {
                    delete updatedColors[oldName];
                    // Mover coordenador para o novo nome
                    if (updatedCoordinators[oldName]) {
                        updatedCoordinators[newName] = updatedCoordinators[oldName];
                        delete updatedCoordinators[oldName];
                    }
                }
                updatedColors[newName] = newColor;
            }
        } else {
            if (updatedMinisterios.includes(newName)) {
                showToast('Este ministério já existe!', 'warning');
                return;
            }
            updatedMinisterios.push(newName);
            updatedColors[newName] = newColor;
        }
        
        await db.collection('groups').doc(currentGroupId).update({
            ministerios: updatedMinisterios,
            ministerioColors: updatedColors,
            ministerioCoordinators: updatedCoordinators
        });
        
        ministerios = updatedMinisterios;
        ministerioColors = updatedColors;
        ministerioCoordinators = updatedCoordinators;
        closeModal();
        logActivity(oldName ? 'Editar Ministério' : 'Criar Ministério', `Nome: ${newName}`, 'ministerios');
        loadMinisterios();
    } catch (error) {
        showToast('Erro ao salvar ministério: ' + error.message, 'error');
    }
}

function editMinisterio(nome) {
    showMinisterioForm(nome);
}

function editMinisterioCoordinator(ministerioName) {
    const coordData = ministerioCoordinators[ministerioName];
    const currentCoordIds = Array.isArray(coordData) ? coordData : (coordData ? [coordData] : []);
    
    // Filtrar servos
    const servos = pessoas.filter(p => p.tipo === 'servo').sort((a, b) => a.nome.localeCompare(b.nome));
    
    const modalBody = `
        <h2>Coordenadores - ${escapeHtml(ministerioName)}</h2>
        <p class="help-text" style="margin-bottom: 1rem;">Selecione os coordenadores responsáveis por este ministério.</p>
        
        <div class="form-group">
            <label>Selecione os Servos</label>
            <div class="checkbox-group" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 8px; display: block;">
                ${servos.map(p => `
                    <div class="checkbox-item" style="margin-bottom: 8px;">
                        <input type="checkbox" id="coord_${p.id}" value="${p.id}" ${currentCoordIds.includes(p.id) ? 'checked' : ''}>
                        <label for="coord_${p.id}" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <div class="avatar" style="width: 24px; height: 24px; font-size: 0.7em; background-color: ${getAvatarColor(p.nome)}; margin: 0;">${getInitials(p.nome)}</div>
                            ${escapeHtml(p.nome)}
                        </label>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <button onclick="saveMinisterioCoordinator('${ministerioName}')" class="btn-primary">Salvar</button>
    `;
    
    showModal(modalBody);
}

async function saveMinisterioCoordinator(ministerioName) {
    const selectedIds = [];
    document.querySelectorAll('input[id^="coord_"]:checked').forEach(cb => {
        selectedIds.push(cb.value);
    });
    
    try {
        const updatedCoordinators = { ...ministerioCoordinators };
        
        if (selectedIds.length > 0) {
            updatedCoordinators[ministerioName] = selectedIds;
        } else {
            delete updatedCoordinators[ministerioName];
        }
        
        await db.collection('groups').doc(currentGroupId).update({
            ministerioCoordinators: updatedCoordinators
        });
        
        ministerioCoordinators = updatedCoordinators;
        closeModal();
        renderMinisterios();
        logActivity('Atualizar Coordenadores', `Ministério: ${ministerioName}`, 'ministerios');
        showToast('Coordenadores atualizados!', 'success');
    } catch (error) {
        showToast('Erro ao salvar coordenadores: ' + error.message, 'error');
    }
}

async function deleteMinisterio(nome) {
    if (confirm(`Tem certeza que deseja excluir o ministério "${nome}"?`)) {
        try {
            const updatedMinisterios = ministerios.filter(m => m !== nome);
            const updatedColors = { ...ministerioColors };
            const updatedCoordinators = { ...ministerioCoordinators };
            delete updatedColors[nome];
            delete updatedCoordinators[nome];
            
            await db.collection('groups').doc(currentGroupId).update({
                ministerios: updatedMinisterios,
                ministerioColors: updatedColors,
                ministerioCoordinators: updatedCoordinators
            });
            
            ministerios = updatedMinisterios;
            ministerioColors = updatedColors;
            ministerioCoordinators = updatedCoordinators;
            loadMinisterios();
            logActivity('Excluir Ministério', `Nome: ${nome}`, 'ministerios');
        } catch (error) {
            showToast('Erro ao excluir ministério: ' + error.message, 'error');
        }
    }
}

// ==================== CONFIGURAÇÕES ====================

async function saveCustomMessages() {
    const birthdayMsg = document.getElementById('configBirthdayMessage').value;
    const lowFreqMsg = document.getElementById('configLowFreqMessage').value;
    
    try {
        await db.collection('groups').doc(currentGroupId).update({
            birthdayMessage: birthdayMsg,
            lowFreqMessage: lowFreqMsg
        });
        
        customBirthdayMessage = birthdayMsg;
        customLowFreqMessage = lowFreqMsg;
        
        logActivity('Configurações', 'Mensagens personalizadas atualizadas', 'sistema');
        showToast('Mensagens atualizadas!', 'success');
    } catch (error) {
        showToast('Erro ao salvar mensagens: ' + error.message, 'error');
    }
}

function toggleEmojiPicker(inputId, btn) {
    // Verificar se já existe um picker aberto neste botão
    let picker = btn.nextElementSibling;
    if (picker && picker.classList.contains('emoji-picker')) {
        picker.remove();
        return;
    }

    // Fechar outros pickers
    document.querySelectorAll('.emoji-picker').forEach(p => p.remove());

    picker = document.createElement('div');
    picker.className = 'emoji-picker';
    
    const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🤲', '👐', '🙌', '👏', '🤝', '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐', '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✍️', '🙏', '🦶', '🦵', '👂', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🆑', '🆘', '⛔', '📛', '🚫', '❌', '⭕', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗️', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '💹', '❇️', '✳️', '❎', '🌐', '💠', '🌀', '➿', 'Ⓜ️', '🏧', '🈂️', '🛂', '🛃', '🛄', '🛅', '♿', '🎦', '🅿️', '🚰', '🚹', '🚺', '🚻', '🚼', '🚾', '🛂', '🛃', '🛄', '🛅', '⚠️', '🚸', '⛔', '🚫', '🚳', '🚭', '🚯', '🚱', '🚷', '📵', '🔞', '☢️', '☣️', '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔃', '🔄', '🔙', '🔚', '🔛', 'soon', '🔜', 'top', '🔝', '🛐', '⚛️', '🕉', '✡️', '☸️', '☯️', '✝️', '☦️', '☪️', '☮️', '🕎', '🔯', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '⛎', '🔀', '🔁', '🔂', '▶️', '⏩', '⏭', '⏯', '◀️', '⏪', '⏮', '🔼', '⏫', '🔽', '⏬', '⏸', '⏹', '⏺', '⏏️', '🎦', '🔅', '🔆', '📶', '📳', '📴', '♀️', '♂️', '⚧', '✖️', '➕', '➖', '➗', '♾', '‼️', '⁉️', '❓', '❔', '❕', '❗️', '〰️', '💱', '💲', '⚕️', '♻️', '⚜️', '🔱', '📛', '🔰', '⭕', '✅', '☑️', '✔️', '✖️', '❌', '❎', '➰', '➿', '〽️', '✳️', '✴️', '❇️', '©️', '®️', '™️', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🅰️', '🆎', '🅱️', '🆑', '🆒', '🆓', 'ℹ️', '🆔', 'Ⓜ️', '🆕', '🆖', '🅾️', '🆗', '🅿️', '🆘', '🆙', '🆚', '🈁', '🈂️', '🈷️', '🈶', '🈯', '🉐', '🈹', '🈚', '🈲', '🉑', '🈸', '🈴', '🈳', '㊗️', '㊙️', '🈺', '🈵', '▪️', '▫️', '◻️', '◼️', '◽', '◾', '⬛', '⬜', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '🔴', '🔵', '🟠', '🟡', '🟢', '🟣', '🟤', '⚫', '⚪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '🎉', '🎂', '🎈', '🎁', '🕯️', '🎊', '🍰', '🧁', '🥳', '👏', '🙌', '🙏', '✝️', '⛪', '📖', '🕊️', '🔥', '✨', '🌟', '⭐', '🎵', '🎶', '🎸', '🎹', '🎤', '🥁', '🎷', '🎺', '🎻', '🎼', '🎧', '🎭', '🎨', '🎬', '🎪', '🎟️', '🎫', '🎗️', '🎖️', '🏆', '🏅', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏸', '🥅', '🏒', '🏑', '🥍', '🏏', '🥊', '🥋', '🥋', '🥅', '⛳', '⛸', '🎣', '🤿', '🎽', '🎿', '🥌', '🛷', '🧗', '🧗‍♀️', '🧗‍♂️', '🤺', '🤼', '🤼‍♀️', '🤼‍♂️', '🤸', '🤸‍♀️', '🤸‍♂️', '⛹', '⛹‍♀️', '⛹‍♂️', '🤾', '🤾‍♀️', '🤾‍♂️', '🧗', '🧗‍♀️', '🧗‍♂️', '🏌', '🏌‍♀️', '🏌‍♂️', '🧘', '🧘‍♀️', '🧘‍♂️', '🧖', '🧖‍♀️', '🧖‍♂️', '🏄', '🏄‍♀️', '🏄‍♂️', '🏊', '🏊‍♀️', '🏊‍♂️', '🤽', '🤽‍♀️', '🤾', '🤾‍♀️', '🤾‍♂️', '🏋', '🏋‍♀️', '🏋‍♂️', '🚴', '🚴‍♀️', '🚴‍♂️', '🚵', '🚵‍♀️', '🚵‍♂️', '🤸', '🤸‍♀️', '🤸‍♂️', '🤼', '🤼‍♀️', '🤼‍♂️', '🤽', '🤽‍♀️', '🤽‍♂️', '🤾', '🤾‍♀️', '🤾‍♂️', '🤹', '🤹‍♀️', '🤹‍♂️'];
    
    picker.innerHTML = emojis.map(emoji => 
        `<div class="emoji-option" onclick="insertEmoji('${inputId}', '${emoji}')">${emoji}</div>`
    ).join('');
    
    btn.parentNode.appendChild(picker);
    
    // Fechar ao clicar fora
    const closeHandler = (e) => {
        if (!picker.contains(e.target) && e.target !== btn) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function insertEmoji(inputId, emoji) {
    const input = document.getElementById(inputId);
    if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
    }
}

async function updateGroupName() {
    const newName = document.getElementById('configGroupName').value;
    
    if (!newName) {
        showToast('Digite um nome para o grupo!', 'warning');
        return;
    }
    
    try {
        await db.collection('groups').doc(currentGroupId).update({
            name: newName
        });
        
        document.getElementById('groupNameSidebar').textContent = newName;
        logActivity('Configurações', `Nome do grupo alterado para: ${newName}`, 'sistema');
        showToast('Nome do grupo atualizado!', 'success');
    } catch (error) {
        showToast('Erro ao atualizar nome: ' + error.message, 'error');
    }
}

function copyGroupCode() {
    const code = document.getElementById('groupCodeDisplay').textContent;
    navigator.clipboard.writeText(code);
    showToast('Código copiado!', 'success');
}

async function handleSwitchGroup() {
    const codeInput = document.getElementById('switchGroupCode');
    const code = codeInput.value.trim().toUpperCase();

    if (!code) {
        showToast('Digite o código do grupo.', 'warning');
        return;
    }

    if (confirm('Deseja trocar para o grupo com este código? Sua visualização atual será alterada.')) {
        try {
            const groupsQuery = await db.collection('groups').where('code', '==', code).get();

            if (groupsQuery.empty) {
                showToast('Grupo não encontrado.', 'error');
                return;
            }

            const groupDoc = groupsQuery.docs[0];
            const groupData = groupDoc.data();
            const newGroupId = groupDoc.id;

            if (newGroupId === currentGroupId) {
                showToast('Você já está neste grupo.', 'info');
                return;
            }

            // Determinar papel baseado na propriedade (se é dono, vira superadmin automaticamente)
            let role = 'coordenador';
            let pending = true;

            if (groupData.ownerId === currentUser.uid) {
                role = 'superadmin';
                pending = false;
            }

            // Atualizar usuário
            await db.collection('users').doc(currentUser.uid).update({
                groupId: newGroupId,
                role: role,
                pending: pending
            });

            codeInput.value = '';
            showToast('Trocando de grupo...', 'success');
            
            // Recarregar dados
            const userData = await loadUserData();
            
            if (userData && userData.pending) {
                showScreen('pending');
            } else {
                showScreen('main');
                loadDashboard();
            }

        } catch (error) {
            console.error(error);
            showToast('Erro ao trocar de grupo: ' + error.message, 'error');
        }
    }
}

async function loadPendingCoordinators() {
    const usersSnapshot = await db.collection('users')
        .where('groupId', '==', currentGroupId)
        .where('pending', '==', true)
        .get();
    
    const pending = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const container = document.getElementById('pendingList');
    
    if (pending.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum coordenador pendente</p>';
        return;
    }
    
    container.innerHTML = pending.map(user => `
        <div class="card">
            <p><strong>${escapeHtml(user.email)}</strong></p>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button class="btn-primary" onclick="approveCoordinator('${user.id}')">Aprovar</button>
                <button class="btn-danger" onclick="rejectCoordinator('${user.id}')">Rejeitar</button>
            </div>
        </div>
    `).join('');
}

async function approveCoordinator(userId) {
    try {
        await db.collection('users').doc(userId).update({
            pending: false
        });
        logActivity('Aprovar Coordenador', `ID Usuário: ${userId}`, 'sistema');
        loadPendingCoordinators();
    } catch (error) {
        if (error.code === 'permission-denied') {
            showToast('Permissão negada. Atualize as Regras de Segurança no Firebase Console.', 'error');
        } else {
            showToast('Erro ao aprovar: ' + error.message, 'error');
        }
    }
}

async function rejectCoordinator(userId) {
    if (confirm('Tem certeza que deseja rejeitar este coordenador?')) {
        try {
            await db.collection('users').doc(userId).delete();
            logActivity('Rejeitar Coordenador', `ID Usuário: ${userId}`, 'sistema');
            loadPendingCoordinators();
        } catch (error) {
            if (error.code === 'permission-denied') {
                showToast('Permissão negada. Atualize as Regras de Segurança no Firebase Console.', 'error');
            } else {
                showToast('Erro ao rejeitar: ' + error.message, 'error');
            }
        }
    }
}

async function loadActiveCoordinators() {
    const usersSnapshot = await db.collection('users')
        .where('groupId', '==', currentGroupId)
        .where('role', '==', 'coordenador')
        .where('pending', '==', false)
        .get();
    
    const active = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const container = document.getElementById('activeList');
    
    if (active.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum coordenador ativo.</p>';
        return;
    }
    
    container.innerHTML = active.map(user => `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 1rem;">
            <div>
                <p style="margin-bottom: 5px;"><strong>${escapeHtml(user.email)}</strong></p>
                <p class="help-text" style="margin: 0;">Entrou em: ${user.createdAt ? formatDate(user.createdAt.toDate()) : 'Data desconhecida'}</p>
            </div>
            <button class="btn-danger" onclick="removeCoordinator('${user.id}')" style="padding: 5px 10px; font-size: 0.9em;">Remover</button>
        </div>
    `).join('');
}

async function removeCoordinator(userId) {
    if (confirm('Tem certeza que deseja remover o acesso deste coordenador?')) {
        try {
            await db.collection('users').doc(userId).delete();
            logActivity('Remover Coordenador', `ID Usuário: ${userId}`, 'sistema');
            loadActiveCoordinators();
            showToast('Coordenador removido com sucesso.', 'success');
        } catch (error) {
            if (error.code === 'permission-denied') {
                showToast('Permissão negada.', 'error');
            } else {
                showToast('Erro ao remover: ' + error.message, 'error');
            }
        }
    }
}

async function checkApprovalStatus() {
    const btn = document.querySelector('#pendingScreen button');
    if(btn) btn.disabled = true;
    
    try {
        const userData = await loadUserData();
        if (userData && !userData.pending) {
            showToast('Aprovação confirmada!', 'success');
            showScreen('main');
            loadDashboard();
        } else {
            showToast('Ainda aguardando aprovação...', 'info');
        }
    } catch (e) {
        console.error(e);
    } finally {
        if(btn) btn.disabled = false;
    }
}

async function checkOrphanedPresences() {
    // Garante que os dados estejam carregados
    if (globalPresencas.length === 0) {
        showToast('Carregando dados...', 'info');
        await loadDashboard();
    }

    const activeEventIds = new Set(eventos.map(e => e.id));
    const orphans = globalPresencas.filter(p => !activeEventIds.has(p.eventoId));
    
    if (orphans.length === 0) {
        showToast('Nenhuma presença de evento excluído encontrada.', 'success');
        return;
    }
    
    // Agrupar por ID do Evento
    const groups = {};
    orphans.forEach(p => {
        if (!groups[p.eventoId]) groups[p.eventoId] = [];
        groups[p.eventoId].push(p.pessoaId);
    });
    
    let html = `<h2>Presenças de Eventos Excluídos</h2>
                <p class="help-text" style="margin-bottom: 1rem;">Estas pessoas têm presença marcada em eventos que foram excluídos. Você pode ver a lista abaixo.</p>
                <div style="max-height: 400px; overflow-y: auto;">`;
    
    for (const [evtId, personIds] of Object.entries(groups)) {
        const personNames = personIds.map(id => {
            const p = pessoas.find(pes => pes.id === id);
            return p ? escapeHtml(p.nome) : 'Pessoa Desconhecida';
        }).sort().join(', ');
        
        html += `
            <div class="card" style="margin-bottom: 10px; border-left: 4px solid #ef4444;">
                <h4 style="margin-bottom: 5px;">Evento ID: ${evtId}</h4>
                <p style="margin-bottom: 5px;"><strong>${personIds.length} pessoas presentes:</strong></p>
                <p class="help-text" style="background: var(--bg-tertiary); padding: 8px; border-radius: 4px;">${personNames}</p>
                <button class="btn-secondary" onclick="deleteOrphanedPresences('${evtId}')" style="margin-top: 10px; font-size: 0.8em; width: 100%;">🗑️ Limpar estas presenças (Irreversível)</button>
            </div>
        `;
    }
    html += '</div>';
    showModal(html);
}

async function deleteOrphanedPresences(eventoId) {
    if (!confirm('Tem certeza? Isso removerá permanentemente o histórico de presença dessas pessoas para este evento excluído.')) return;
    
    // Como não temos os IDs das presenças aqui (apenas no globalPresencas), precisamos buscar para deletar
    try {
        const snapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();
            
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        showToast('Presenças limpas com sucesso.', 'success');
        closeModal();
        await loadDashboard(); // Recarregar para atualizar globalPresencas
    } catch (error) {
        showToast('Erro ao limpar: ' + error.message, 'error');
    }
}

function loadLocalSettings() {
    const disableConfirm = localStorage.getItem('disableGuestConfirm') === 'true';
    const checkbox = document.getElementById('configDisableGuestConfirm');
    if (checkbox) {
        checkbox.checked = disableConfirm;
    }

    // Garantir que as mensagens personalizadas estejam preenchidas
    if(document.getElementById('configBirthdayMessage')) document.getElementById('configBirthdayMessage').value = customBirthdayMessage;
    if(document.getElementById('configLowFreqMessage')) document.getElementById('configLowFreqMessage').value = customLowFreqMessage;
}

function toggleGuestConfirm(checked) {
    localStorage.setItem('disableGuestConfirm', checked);
    if (checked) {
        showToast('Confirmação de convidado desativada', 'info');
    } else {
        showToast('Confirmação de convidado ativada', 'info');
    }
}

// ==================== UTILITÁRIOS ====================

function calculateAge(birthDate) {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// ==================== SORTEIO ====================

function initSorteioGeral() {
    if (pessoas.length === 0) return showToast("Nenhuma pessoa cadastrada.", "warning");
    runRaffleAnimation(pessoas, "Sorteio Geral (Todas as Pessoas)");
}

async function initSorteioEvento(eventoId) {
    const evento = eventos.find(e => e.id === eventoId);
    if (!evento) return;

    try {
        const presencasSnapshot = await db.collection('presencas')
            .where('groupId', '==', currentGroupId)
            .where('eventoId', '==', eventoId)
            .get();

        if (presencasSnapshot.empty) {
            return showToast("Nenhuma presença registrada neste evento.", "warning");
        }

        const presentesIds = new Set(presencasSnapshot.docs.map(doc => doc.data().pessoaId));
        const candidatos = pessoas.filter(p => presentesIds.has(p.id));

        if (candidatos.length === 0) return showToast("Nenhum presente encontrado na lista de pessoas.", "warning");

        runRaffleAnimation(candidatos, `Sorteio - ${evento.nome}`, evento.nome);
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar presenças para sorteio.", "error");
    }
}

function runRaffleAnimation(candidates, title, eventName = null) {
    window.currentRaffleCandidates = candidates;
    window.currentRaffleTitle = title;
    window.currentRaffleEventName = eventName;
    
    const modalBody = `
        <h2>${escapeHtml(title)}</h2>
        <p class="help-text" style="text-align: center;">Participantes: ${candidates.length}</p>
        <div style="text-align: center; padding: 2rem; overflow: hidden;">
            <div id="raffleDisplay" style="font-size: 2rem; font-weight: bold; color: var(--primary); min-height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; border: 2px dashed var(--border); border-radius: 12px; background: var(--bg-tertiary);">
                🎰 Preparado?
            </div>
            
            <button id="btnRaffleAction" onclick="startRaffleLogic()" class="btn-primary" style="font-size: 1.2rem; padding: 12px 30px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                Sortear
            </button>
            
            <div id="raffleWinner" style="display: none; animation: slideUp 0.5s ease;">
                <p style="font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 10px;">🎉 O ganhador é:</p>
                <div id="winnerName" style="font-size: 2.2rem; font-weight: 800; color: var(--success); margin-bottom: 20px; line-height: 1.2;"></div>
                <div class="avatar" id="winnerAvatar" style="width: 80px; height: 80px; font-size: 2rem; margin: 0 auto 20px auto;"></div>
                <div>
                    <button onclick="startRaffleLogic()" class="btn-secondary">Sortear Novamente</button>
                </div>
            </div>
        </div>
    `;
    showModal(modalBody);
}

window.startRaffleLogic = function() {
    const candidates = window.currentRaffleCandidates;
    const display = document.getElementById('raffleDisplay');
    const btn = document.getElementById('btnRaffleAction');
    const winnerDiv = document.getElementById('raffleWinner');
    const winnerName = document.getElementById('winnerName');
    const winnerAvatar = document.getElementById('winnerAvatar');

    if (!candidates || candidates.length === 0) return;

    btn.style.display = 'none';
    winnerDiv.style.display = 'none';
    display.style.display = 'flex';

    let duration = 2500; 
    let interval = 50;
    let elapsed = 0;
    let timer;

    const tick = () => {
        const random = candidates[Math.floor(Math.random() * candidates.length)];
        display.textContent = random.nome;
        
        elapsed += interval;
        
        if (elapsed < duration) {
            // Efeito de desaceleração
            if (elapsed > duration * 0.7) interval *= 1.1;
            timer = setTimeout(tick, interval);
        } else {
            // Finalizar
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            display.style.display = 'none';
            
            winnerName.textContent = winner.nome;
            winnerAvatar.textContent = getInitials(winner.nome);
            winnerAvatar.style.backgroundColor = getAvatarColor(winner.nome);
            
            winnerDiv.style.display = 'block';

            // Registrar no log
            let details = `Ganhador: ${winner.nome}`;
            if (window.currentRaffleEventName) {
                details += `\nEvento: ${window.currentRaffleEventName}`;
            } else {
                details += `\n${window.currentRaffleTitle}`;
            }
            logActivity('Sorteio', details, 'geral');
        }
    };
    
    tick();
}

function formatDate(dateString) {
    if (!dateString) return '';
    // Correção para datas YYYY-MM-DD aparecerem corretamente independente do fuso horário
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// ==================== RETIROS ====================

async function updateVisibleRetirosMap() {
    if (!currentGroupId) return;
    try {
        const retirosSnap = await db.collection('retiros')
            .where('groupId', '==', currentGroupId)
            .where('showInPersonList', '==', true)
            .get();

        if (retirosSnap.empty) {
            globalPersonRetirosMap = {};
            return;
        }

        const visibleRetiros = retirosSnap.docs.map(doc => ({id: doc.id, name: doc.data().nome}));
        const visibleRetiroIds = visibleRetiros.map(r => r.id);
        const retiroNames = {};
        visibleRetiros.forEach(r => retiroNames[r.id] = r.name);

        let participants = [];
        // Firestore 'in' query suporta max 10. Se houver mais, fazemos em lotes.
        const chunks = [];
        for (let i = 0; i < visibleRetiroIds.length; i += 10) {
            chunks.push(visibleRetiroIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const snap = await db.collection('retiro_participantes')
                .where('groupId', '==', currentGroupId)
                .where('retiroId', 'in', chunk)
                .get();
            participants = participants.concat(snap.docs.map(d => d.data()));
        }

        const map = {};
        participants.forEach(p => {
            if (p.personId) {
                if (!map[p.personId]) map[p.personId] = [];
                const rName = retiroNames[p.retiroId];
                if (rName) {
                    const isTeam = p.category === 'equipe';
                    // Evitar duplicatas
                    if (!map[p.personId].some(item => item.name === rName && item.isTeam === isTeam)) {
                        map[p.personId].push({ name: rName, isTeam: isTeam });
                    }
                }
            }
        });
        globalPersonRetirosMap = map;
    } catch (e) {
        console.error("Error updating visible retiros map:", e);
    }
}

async function renderRetirosListFromData(retiros, container) {
    if (retiros.length === 0) {
        container.innerHTML = '<p class="help-text">Nenhum retiro cadastrado.</p>';
        return;
    }

    try {
        // Buscar contagem de participantes para cada retiro
        const retirosWithCount = await Promise.all(retiros.map(async r => {
            const partSnapshot = await db.collection('retiro_participantes')
                .where('groupId', '==', currentGroupId)
                .where('retiroId', '==', r.id)
                .get();
            return { ...r, count: partSnapshot.size };
        }));

        container.innerHTML = retirosWithCount.map(r => `
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0; color: var(--primary);">${escapeHtml(r.nome)}</h3>
                        <p style="font-size: 0.9em; color: var(--text-secondary);">${formatDate(r.data)}</p>
                    </div>
                    <span class="badge badge-primary">👥 ${r.count}</span>
                </div>
                <p style="font-size: 0.9em; margin-bottom: 15px;">📍 ${escapeHtml(r.local || 'Local não informado')}</p>
                <div style="display: flex; gap: 5px; border-top: 1px solid var(--border); padding-top: 10px;">
                    <button class="btn-secondary" style="flex: 1;" onclick="openRetiroGestao('${r.id}')">💰 Gestão</button>
                    <button class="btn-icon" onclick="showRetiroForm('${r.id}')" title="Editar">✏️</button>
                    <button class="btn-icon" onclick="deleteRetiro('${r.id}')" title="Excluir" style="color: var(--danger);">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error("Erro ao renderizar lista:", error);
        container.innerHTML = '<p class="help-text">Erro ao carregar detalhes dos retiros.</p>';
    }
}

async function loadRetiros() {
    const container = document.getElementById('retirosList');
    container.innerHTML = '<p class="help-text">Carregando retiros...</p>';

    try {
        // Tenta query otimizada (requer índice composto)
        const snapshot = await db.collection('retiros')
            .where('groupId', '==', currentGroupId)
            .orderBy('data', 'desc')
            .get();

        const retiros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Garantir ordenação cronológica (mais recente primeiro)
        retiros.sort((a, b) => {
            const dateA = new Date(a.data || '1970-01-01');
            const dateB = new Date(b.data || '1970-01-01');
            return dateB - dateA;
        });

        populateRetiroFilterOptions(retiros);
        await renderRetirosListFromData(retiros, container);

    } catch (error) {
        console.error(error);
        
        // Fallback: Se der erro de permissão ou índice, tenta sem ordenação
        if (error.code === 'permission-denied' || error.code === 'failed-precondition') {
            try {
                console.warn("Tentando carregar sem ordenação (fallback)...");
                const snapshot = await db.collection('retiros')
                    .where('groupId', '==', currentGroupId)
                    .get();
                
                const retiros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Ordenar no cliente
                retiros.sort((a, b) => {
                    const dateA = new Date(a.data || '1970-01-01');
                    const dateB = new Date(b.data || '1970-01-01');
                    return dateB - dateA;
                });
                populateRetiroFilterOptions(retiros);
                
                await renderRetirosListFromData(retiros, container);
                return;
            } catch (innerError) {
                console.error("Erro no fallback:", innerError);
                container.innerHTML = `<p class="help-text" style="color: var(--danger)">Erro de Permissão: Verifique se as Regras do Firestore incluem 'retiros'.</p>`;
                return;
            }
        }
        
        container.innerHTML = `<p class="help-text" style="color: var(--danger)">Erro: ${error.message}</p>`;
    }
}

function showRetiroTab(tab) {
    document.querySelectorAll('#retiros .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#retiros .tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`#retiros button[onclick="showRetiroTab('${tab}')"]`);
    if (btn) btn.classList.add('active');
    
    if (tab === 'lista') {
        document.getElementById('retiroLista').classList.add('active');
    } else {
        document.getElementById('retiroFiltro').classList.add('active');
    }
}

function populateRetiroFilterOptions(retiros) {
    const select = document.getElementById('filterRetiroSelect');
    if (!select) return;
    
    let html = `
        <option value="">Selecione uma opção...</option>
        <option value="none">🚫 Pessoas que nunca fizeram retiro</option>
        <optgroup label="Participantes por Retiro">
    `;
    
    retiros.forEach(r => {
        html += `<option value="${r.id}">${escapeHtml(r.nome)} (${formatDate(r.data)})</option>`;
    });
    
    html += `</optgroup>`;
    select.innerHTML = html;
}

async function filterRetiroParticipants() {
    const select = document.getElementById('filterRetiroSelect');
    const container = document.getElementById('retiroFilterResults');
    const value = select.value;
    
    if (!value) {
        container.innerHTML = '<p class="help-text">Selecione uma opção acima para ver os resultados.</p>';
        return;
    }
    
    container.innerHTML = '<p class="help-text">Carregando...</p>';
    
    try {
        if (value === 'none') {
            // Buscar todos os participantes de todos os retiros do grupo
            const snapshot = await db.collection('retiro_participantes')
                .where('groupId', '==', currentGroupId)
                .get();
                
            const participantIds = new Set();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.personId) participantIds.add(data.personId);
            });
            
            const neverParticipated = pessoas.filter(p => !participantIds.has(p.id));
            neverParticipated.sort((a, b) => a.nome.localeCompare(b.nome));
            
            if (neverParticipated.length === 0) {
                container.innerHTML = '<p class="help-text">Todas as pessoas cadastradas já participaram de algum retiro! 🎉</p>';
                return;
            }
            
            renderRetiroFilterTable(neverParticipated, 'never');
            
        } else {
            // Retiro específico
            const snapshot = await db.collection('retiro_participantes')
                .where('groupId', '==', currentGroupId)
                .where('retiroId', '==', value)
                .orderBy('nome')
                .get();
                
            if (snapshot.empty) {
                container.innerHTML = '<p class="help-text">Nenhum participante encontrado neste retiro.</p>';
                return;
            }
            
            const participants = snapshot.docs.map(doc => doc.data());
            renderRetiroFilterTable(participants, 'specific');
        }
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="help-text" style="color: var(--danger)">Erro ao carregar dados: ${error.message}</p>`;
    }
}

function renderRetiroFilterTable(list, type) {
    const container = document.getElementById('retiroFilterResults');
    
    let html = `
        <div style="margin-bottom: 10px; font-weight: bold;">Total: ${list.length}</div>
        <table class="table">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    ${type === 'never' ? '<th>Telefone</th><th>Ações</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;
    
    list.forEach(item => {
        let nome, tipoBadge, telefoneCell = '', actionsCell = '';
        
        if (type === 'specific') {
            nome = item.nome;
            const tipoLabel = item.tipo === 'interno' ? 'Cadastrado' : 'Externo';
            const badgeClass = item.tipo === 'interno' ? 'success' : 'warning';
            tipoBadge = `<span class="badge badge-${badgeClass}">${tipoLabel}</span>`;
        } else {
            nome = item.nome;
            const badgeClass = item.tipo === 'servo' ? 'primary' : 'success';
            tipoBadge = `<span class="badge badge-${badgeClass}">${item.tipo}</span>`;
            telefoneCell = `<td>${item.telefone || '-'}</td>`;
            
            if (item.telefone) {
                actionsCell = `<td><button class="btn-icon" onclick="openPersonWhatsApp('${escapeHtml(item.nome)}', '${escapeHtml(item.telefone)}')" title="Enviar WhatsApp" style="color: #25D366;">📱</button></td>`;
            } else {
                actionsCell = `<td><span style="color: var(--text-tertiary);">-</span></td>`;
            }
        }
        
        html += `
            <tr>
                <td>${escapeHtml(nome)}</td>
                <td>${tipoBadge}</td>
                ${telefoneCell}
                ${actionsCell}
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function showRetiroForm(retiroId = null) {
    // Se for edição, buscar dados (poderia buscar do banco, mas vamos tentar pegar do DOM ou recarregar é rápido)
    // Para simplificar, vamos buscar do banco se tiver ID
    let retiro = null;
    
    const renderForm = (data = null) => {
        const modalBody = `
            <h2>${data ? 'Editar' : 'Novo'} Retiro</h2>
            <form id="retiroForm">
                <div class="form-group">
                    <label>Nome do Retiro *</label>
                    <input type="text" id="retiroNome" class="input-field" value="${data?.nome || ''}" required>
                </div>
                <div class="form-group">
                    <label>Data *</label>
                    <input type="date" id="retiroData" class="input-field" value="${data?.data || ''}" required>
                </div>
                <div class="form-group">
                    <label>Local</label>
                    <input type="text" id="retiroLocal" class="input-field" value="${data?.local || ''}">
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="retiroShowInList" ${data?.showInPersonList ? 'checked' : ''} style="width: 18px; height: 18px;">
                        Mostrar etiqueta na lista de pessoas
                    </label>
                    <p class="help-text" style="margin-top: 4px;">Se marcado, aparecerá uma etiqueta com o nome do retiro nos participantes.</p>
                </div>
                <button type="submit" class="btn-primary">${data ? 'Salvar Alterações' : 'Criar Retiro'}</button>
            </form>
        `;
        showModal(modalBody);

        document.getElementById('retiroForm').onsubmit = async (e) => {
            e.preventDefault();
            await saveRetiro(retiroId);
        };
    };

    if (retiroId) {
        db.collection('retiros').doc(retiroId).get().then(doc => {
            if (doc.exists) renderForm(doc.data());
        });
    } else {
        renderForm();
    }
}

async function saveRetiro(retiroId) {
    const nome = document.getElementById('retiroNome').value;
    const data = document.getElementById('retiroData').value;
    const local = document.getElementById('retiroLocal').value;
    const showInPersonList = document.getElementById('retiroShowInList').checked;

    const retiroData = {
        nome, data, local, showInPersonList,
        groupId: currentGroupId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (retiroId) {
            await db.collection('retiros').doc(retiroId).update(retiroData);
            logActivity('Editar Retiro', `Nome: ${nome}`, 'retiros');
        } else {
            retiroData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('retiros').add(retiroData);
            logActivity('Criar Retiro', `Nome: ${nome}`, 'retiros');
        }
        closeModal();
        loadRetiros();
        showToast('Retiro salvo com sucesso!', 'success');
        await updateVisibleRetirosMap();
    } catch (error) {
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

async function deleteRetiro(retiroId) {
    if (!confirm('Tem certeza? Isso excluirá o retiro e a lista de participantes dele.')) return;
    
    try {
        // Excluir participantes primeiro
        const parts = await db.collection('retiro_participantes')
            .where('groupId', '==', currentGroupId)
            .where('retiroId', '==', retiroId)
            .get();
        const batch = db.batch();
        parts.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('retiros').doc(retiroId));
        
        await batch.commit();
        loadRetiros();
        showToast('Retiro excluído.', 'success');
        await updateVisibleRetirosMap();
    } catch (error) {
        showToast('Erro ao excluir: ' + error.message, 'error');
    }
}

async function openRetiroGestao(retiroId) {
    currentRetiroId = retiroId;
    currentRetiroTab = 'participantes';
    currentTeamRoleFilter = '';
    
    // Navegação manual para a seção de gestão
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById('retiro-gestao').classList.add('active');
    
    const container = document.getElementById('gestaoRetiroContent');
    container.innerHTML = '<p class="help-text">Carregando dados do retiro...</p>';

    try {
    const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        if (!retiroDoc.exists) {
            showToast('Retiro não encontrado.', 'error');
            showSection('retiros');
            return;
        }
    const retiro = retiroDoc.data();
        document.getElementById('gestaoRetiroTitle').textContent = retiro.nome;

        await renderRetiroGestao(retiroId, retiro);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="help-text" style="color: var(--danger)">Erro ao carregar: ${error.message}</p>`;
    }
}

function switchRetiroTab(tab) {
    currentRetiroTab = tab;
    const retiroDoc = { data: () => ({}) }; // Mock simples pois renderRetiroGestao busca do banco
    db.collection('retiros').doc(currentRetiroId).get().then(doc => renderRetiroGestao(currentRetiroId, doc.data()));
}

function toggleTeamRoleCard(btn) {
    const card = btn.closest('.card');
    const content = card.querySelector('.card-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = '➖';
    } else {
        content.style.display = 'none';
        btn.textContent = '➕';
    }
}

function promptRegisterExternal(participantId, name) {
    if (confirm(`Deseja cadastrar "${name}" no sistema?\nIsso criará um novo cadastro de pessoa e vinculará a este participante.`)) {
        showPessoaForm(null, {
            nome: name,
            onSave: async (newPersonId) => {
                try {
                    await db.collection('retiro_participantes').doc(participantId).update({
                        personId: newPersonId,
                        tipo: 'interno'
                    });
                    showToast('Participante vinculado com sucesso!', 'success');
                    
                    // Atualizar a lista se estiver na tela de gestão
                    if (currentRetiroId) {
                        const retiroDoc = await db.collection('retiros').doc(currentRetiroId).get();
                        if (retiroDoc.exists) {
                            renderRetiroGestao(currentRetiroId, retiroDoc.data());
                        }
                    }
                    await updateVisibleRetirosMap();
                } catch (e) {
                    console.error(e);
                    showToast('Erro ao vincular: ' + e.message, 'error');
                }
            }
        });
    }
}

async function renderRetiroGestao(retiroId, retiroData) {
    const container = document.getElementById('gestaoRetiroContent');
    
    // Buscar participantes
    const snapshot = await db.collection('retiro_participantes')
        .where('groupId', '==', currentGroupId)
        .where('retiroId', '==', retiroId)
        .get();

    const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Ordenar por data de adição (mais recente primeiro)
    allData.sort((a, b) => {
        const timeA = a.addedAt && a.addedAt.toMillis ? a.addedAt.toMillis() : 0;
        const timeB = b.addedAt && b.addedAt.toMillis ? b.addedAt.toMillis() : 0;
        return timeB - timeA;
    });

    const participants = allData.filter(p => p.category !== 'equipe');
    const team = allData.filter(p => p.category === 'equipe');
    
    // Cálculos Financeiros
    const defaultPrice = retiroData.defaultPrice || 0;
    const defaultTeamPrice = retiroData.defaultTeamPrice || 0;
    let totalExpected = 0;
    let totalPaid = 0;
    let totalParticipants = participants.length;
    let paidCount = 0;

    participants.forEach(p => {
        const price = p.price !== undefined ? p.price : defaultPrice;
        const paid = p.paid || 0;
        totalExpected += Number(price);
        totalPaid += Number(paid);
        if (paid >= price && price > 0) paidCount++;
    });

    const pendingAmount = totalExpected - totalPaid;

    let html = `
        <div class="tabs">
            <button class="tab ${currentRetiroTab === 'participantes' ? 'active' : ''}" onclick="switchRetiroTab('participantes')">Participantes (${participants.length})</button>
            <button class="tab ${currentRetiroTab === 'equipe' ? 'active' : ''}" onclick="switchRetiroTab('equipe')">Equipe de Trabalho (${team.length})</button>
        </div>
    `;

    if (currentRetiroTab === 'participantes') {
        html += `
        <!-- Cards de Resumo Financeiro -->
        <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
            <div class="stat-card" style="padding: 1rem;">
                <div class="stat-icon" style="background: #dcfce7; color: #166534;">💰</div>
                <div class="stat-content">
                    <h3 style="font-size: 1.5rem;">R$ ${totalPaid.toFixed(2)}</h3>
                    <p>Total Arrecadado</p>
                </div>
            </div>
            <div class="stat-card" style="padding: 1rem;">
                <div class="stat-icon" style="background: #fee2e2; color: #991b1b;">⚠️</div>
                <div class="stat-content">
                    <h3 style="font-size: 1.5rem;">R$ ${pendingAmount.toFixed(2)}</h3>
                    <p>Pendente</p>
                </div>
            </div>
            <div class="stat-card" style="padding: 1rem;">
                <div class="stat-icon" style="background: #e0f2fe; color: #075985;">👥</div>
                <div class="stat-content">
                    <h3 style="font-size: 1.5rem;">${paidCount}/${totalParticipants}</h3>
                    <p>Pagamentos Concluídos</p>
                </div>
            </div>
        </div>

        <!-- Configuração e Adição -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card" style="margin-bottom: 0;">
                <h4 style="margin-bottom: 10px;">⚙️ Configuração Financeira</h4>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.9em;">Valor Padrão por Pessoa (R$)</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="number" id="retiroDefaultPrice" class="input-field" value="${defaultPrice}" step="0.01" min="0">
                        <button class="btn-primary" onclick="updateRetiroDefaultPrice('${retiroId}')">Salvar</button>
                    </div>
                    <p class="help-text">Alterar isso afetará novos participantes.</p>
                </div>
            </div>
        
            <div class="card" style="margin-bottom: 0; overflow: visible;">
                <h4 style="margin-bottom: 10px;">➕ Adicionar Participante</h4>
                <div style="position: relative;">
                    <input type="text" id="searchRetiroPart" placeholder="Buscar pessoa cadastrada..." class="input-field" onkeyup="searchPeopleForRetiro('${retiroId}', this.value)" autocomplete="off">
                    <div id="searchRetiroResults" style="position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border); max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-radius: 0 0 8px 8px;"></div>
                </div>
                <div style="display: flex; gap: 5px; margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px;">
                    <input type="text" id="externalNameRetiro" placeholder="Ou nome de pessoa externa" class="input-field">
                    <button class="btn-primary" onclick="addRetiroParticipant('${retiroId}', null, document.getElementById('externalNameRetiro').value, 'externo')">Adicionar</button>
                </div>
            </div>
        </div>

        <!-- Lista de Participantes -->
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>Valor (R$)</th>
                        <th>Pago (R$)</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${participants.length === 0 ? '<tr><td colspan="6" style="text-align: center;">Nenhum participante.</td></tr>' : 
                    participants.map(p => {
                        const price = p.price !== undefined ? p.price : defaultPrice;
                        const paid = p.paid || 0;
                        let statusBadge = '';
                        
                        if (paid >= price && price > 0) statusBadge = '<span class="badge badge-success">Pago</span>';
                        else if (paid > 0) statusBadge = '<span class="badge badge-warning">Parcial</span>';
                        else statusBadge = '<span class="badge badge-danger">Pendente</span>';

                        const isExternal = p.tipo !== 'interno';
                        const nameDisplay = isExternal 
                            ? `<span style="cursor: pointer; border-bottom: 1px dashed var(--text-secondary);" onclick="promptRegisterExternal('${p.id}', '${escapeHtml(p.nome)}')" title="Clique para cadastrar esta pessoa">${escapeHtml(p.nome)}</span>` 
                            : escapeHtml(p.nome);

                        return `
                        <tr>
                            <td>${nameDisplay}</td>
                            <td><span class="badge badge-${p.tipo === 'interno' ? 'success' : 'primary'}" style="font-size: 0.7em;">${p.tipo === 'interno' ? 'Cadastrado' : 'Externo'}</span></td>
                            <td>
                                <input type="number" class="input-field" style="width: 80px; padding: 4px;" value="${price}" onchange="updateParticipantPayment('${p.id}', 'price', this.value)" step="0.01">
                            </td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <input type="number" class="input-field" style="width: 80px; padding: 4px;" value="${paid}" onchange="updateParticipantPayment('${p.id}', 'paid', this.value)" step="0.01">
                                    <button class="btn-icon" onclick="updateParticipantPayment('${p.id}', 'paid', '${price}')" title="Pagar Total" style="color: var(--success); padding: 2px;">✅</button>
                                </div>
                            </td>
                            <td>${statusBadge}</td>
                            <td>
                                <button class="btn-icon" style="color: var(--danger);" onclick="removeRetiroParticipant('${p.id}', '${retiroId}')" title="Remover">🗑️</button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    } else {
        // ==================== ABA EQUIPE ====================
        
        const definedRoles = retiroData.roles || [];
        const usedRoles = new Set(team.map(m => m.role).filter(r => r));
        const allRoles = Array.from(new Set([...definedRoles, ...usedRoles])).sort();

        html += `
        <div style="margin-bottom: 1.5rem;">
            <div class="card" style="margin-bottom: 1.5rem;">
                <h4 style="margin-bottom: 10px;">⚙️ Configuração Financeira (Equipe)</h4>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.9em;">Valor Padrão por Membro (R$)</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="number" id="retiroDefaultTeamPrice" class="input-field" value="${defaultTeamPrice}" step="0.01" min="0">
                        <button class="btn-primary" onclick="updateRetiroDefaultTeamPrice('${retiroId}')">Salvar</button>
                    </div>
                    <p class="help-text">Alterar isso afetará novos membros da equipe.</p>
                </div>
            </div>

            <div class="card" style="margin-bottom: 1.5rem; background: var(--bg-tertiary);">
                <h4 style="margin-bottom: 10px;">➕ Criar Nova Função</h4>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="newRoleName" class="input-field" placeholder="Nome da função (ex: Cozinha, Louvor)">
                    <button class="btn-primary" onclick="createNewTeamRole('${retiroId}')">Criar Função</button>
                </div>
            </div>

            <div id="rolesContainer">
                ${allRoles.length === 0 ? '<p class="help-text">Nenhuma função criada. Crie uma função para começar a adicionar pessoas.</p>' : ''}
                ${allRoles.map(role => {
                    const members = team.filter(m => m.role === role);
                    const safeRole = escapeHtml(role);
                    const roleId = 'role-' + role.replace(/[^a-zA-Z0-9]/g, '');
                    
                    return `
                    <div class="card" style="margin-bottom: 1.5rem; overflow: visible;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0; color: var(--primary); font-size: 1.2rem;">${safeRole} <span class="badge badge-secondary" style="font-size: 0.6em; vertical-align: middle;">${members.length}</span></h3>
                                <button class="btn-icon" onclick="toggleTeamRoleCard(this)" style="padding: 2px 8px; font-size: 0.8em;">➖</button>
                            </div>
                            <button class="btn-icon" onclick="deleteTeamRole('${retiroId}', '${role.replace(/'/g, "\\'")}')" title="Excluir Função e Membros" style="color: var(--danger);">🗑️</button>
                        </div>
                        
                        <div class="card-content" style="overflow: visible;">
                            <div class="table-container" style="margin-bottom: 15px; box-shadow: none; border: 1px solid var(--border);">
                                <table class="table" style="margin: 0;">
                                    <thead>
                                        <tr>
                                            <th>Nome</th>
                                            <th>Valor (R$)</th>
                                            <th>Pago (R$)</th>
                                            <th>Status</th>
                                            <th style="width: 50px;">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${members.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-tertiary); font-style: italic;">Ninguém nesta função ainda.</td></tr>' : 
                                        members.map(m => {
                                            const price = m.price !== undefined ? m.price : 0;
                                            const paid = m.paid || 0;
                                            let statusBadge = '';
                                            
                                            if (paid >= price && price > 0) statusBadge = '<span class="badge badge-success">Pago</span>';
                                            else if (paid > 0) statusBadge = '<span class="badge badge-warning">Parcial</span>';
                                            else if (price > 0) statusBadge = '<span class="badge badge-danger">Pendente</span>';
                                            else statusBadge = '<span class="badge badge-secondary">Isento</span>';

                                            return `
                                            <tr>
                                                <td>${escapeHtml(m.nome)}</td>
                                                <td>
                                                    <input type="number" class="input-field" style="width: 80px; padding: 4px;" value="${price}" onchange="updateParticipantPayment('${m.id}', 'price', this.value)" step="0.01">
                                                </td>
                                                <td>
                                                    <div style="display: flex; align-items: center; gap: 5px;">
                                                        <input type="number" class="input-field" style="width: 80px; padding: 4px;" value="${paid}" onchange="updateParticipantPayment('${m.id}', 'paid', this.value)" step="0.01">
                                                        <button class="btn-icon" onclick="updateParticipantPayment('${m.id}', 'paid', '${price}')" title="Pagar Total" style="color: var(--success); padding: 2px;">✅</button>
                                                    </div>
                                                </td>
                                                <td>${statusBadge}</td>
                                                <td>
                                                    <button class="btn-icon" style="color: var(--danger);" onclick="removeRetiroParticipant('${m.id}', '${retiroId}')" title="Remover da equipe">🗑️</button>
                                                </td>
                                            </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <div style="position: relative;">
                                <input type="text" placeholder="🔍 Buscar pessoa para adicionar em ${safeRole}..." class="input-field" onkeyup="searchPeopleForSpecificRole('${retiroId}', '${role.replace(/'/g, "\\'")}', this.value, this)" autocomplete="off">
                                <div class="search-role-results" style="position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-primary); border: 1px solid var(--border); max-height: 200px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-radius: 0 0 8px 8px;"></div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }

    container.innerHTML = html;
}

async function createNewTeamRole(retiroId) {
    const input = document.getElementById('newRoleName');
    const roleName = input.value.trim();
    
    if (!roleName) return showToast('Digite o nome da função.', 'warning');
    
    try {
        await db.collection('retiros').doc(retiroId).update({
            roles: firebase.firestore.FieldValue.arrayUnion(roleName)
        });
        input.value = '';
        showToast('Função criada!', 'success');
        db.collection('retiros').doc(currentRetiroId).get().then(doc => renderRetiroGestao(currentRetiroId, doc.data()));
    } catch (e) {
        showToast('Erro ao criar função: ' + e.message, 'error');
    }
}

async function deleteTeamRole(retiroId, roleName) {
    if (!confirm(`Tem certeza que deseja excluir a função "${roleName}"?\nIsso também removerá todas as pessoas desta função.`)) return;
    
    try {
        // Remover a função da lista de roles
        await db.collection('retiros').doc(retiroId).update({
            roles: firebase.firestore.FieldValue.arrayRemove(roleName)
        });
        
        // Remover participantes dessa função
        const snapshot = await db.collection('retiro_participantes')
            .where('groupId', '==', currentGroupId)
            .where('retiroId', '==', retiroId)
            .where('role', '==', roleName)
            .get();
            
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        showToast('Função e membros excluídos.', 'success');
        db.collection('retiros').doc(currentRetiroId).get().then(doc => renderRetiroGestao(currentRetiroId, doc.data()));
        await updateVisibleRetirosMap();
    } catch (e) {
        showToast('Erro ao excluir função: ' + e.message, 'error');
    }
}

function searchPeopleForSpecificRole(retiroId, roleName, query, inputElement) {
    // Encontrar o container de resultados irmão do input
    const container = inputElement.nextElementSibling;
    
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = pessoas.filter(p => p.nome.toLowerCase().includes(lowerQuery)).slice(0, 5);
    
    if (matches.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = matches.map(p => `
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;" onclick="addRetiroTeamMemberWithRole('${retiroId}', '${p.id}', '${escapeHtml(p.nome)}', '${roleName.replace(/'/g, "\\'")}')">
            <span>${escapeHtml(p.nome)}</span>
            <span class="badge badge-primary" style="font-size: 0.7em;">Adicionar</span>
        </div>
    `).join('');
    container.style.display = 'block';
}

function searchPeopleForRetiro(retiroId, query) {
    const container = document.getElementById('searchRetiroResults');
    if (!query || query.length < 2) {
        container.style.display = 'none';
        return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = pessoas.filter(p => p.nome.toLowerCase().includes(lowerQuery)).slice(0, 5);
    
    if (matches.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = matches.map(p => `
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;" onclick="addRetiroParticipant('${retiroId}', '${p.id}', '${p.nome}', 'interno')">
            <span>${escapeHtml(p.nome)}</span>
            <span class="badge badge-success" style="font-size: 0.7em;">Cadastrado</span>
        </div>
    `).join('');
    container.style.display = 'block';
}

async function updateRetiroDefaultPrice(retiroId) {
    const price = parseFloat(document.getElementById('retiroDefaultPrice').value);
    if (isNaN(price)) return showToast('Valor inválido', 'warning');

    try {
        await db.collection('retiros').doc(retiroId).update({ defaultPrice: price });
        showToast('Valor padrão atualizado!', 'success');
        // Recarregar para atualizar cálculos
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        renderRetiroGestao(retiroId, retiroDoc.data());
    } catch (e) {
        showToast('Erro ao atualizar: ' + e.message, 'error');
    }
}

async function updateRetiroDefaultTeamPrice(retiroId) {
    const price = parseFloat(document.getElementById('retiroDefaultTeamPrice').value);
    if (isNaN(price)) return showToast('Valor inválido', 'warning');

    try {
        await db.collection('retiros').doc(retiroId).update({ defaultTeamPrice: price });
        
        if (confirm('Deseja atualizar o valor para todos os membros da equipe já cadastrados?\nIsso sobrescreverá valores individuais definidos anteriormente.')) {
            const snapshot = await db.collection('retiro_participantes')
                .where('groupId', '==', currentGroupId)
                .where('retiroId', '==', retiroId)
                .where('category', '==', 'equipe')
                .get();
            
            const chunks = [];
            const docs = snapshot.docs;
            for (let i = 0; i < docs.length; i += 500) {
                chunks.push(docs.slice(i, i + 500));
            }

            for (const chunk of chunks) {
                const batch = db.batch();
                chunk.forEach(doc => {
                    batch.update(doc.ref, { price: price });
                });
                await batch.commit();
            }
            showToast('Valor padrão e membros atualizados!', 'success');
        } else {
            showToast('Valor padrão atualizado (apenas novos)!', 'success');
        }

        // Recarregar para atualizar visualização
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        renderRetiroGestao(retiroId, retiroDoc.data());
    } catch (e) {
        showToast('Erro ao atualizar: ' + e.message, 'error');
    }
}

async function updateParticipantPayment(partId, field, value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    try {
        await db.collection('retiro_participantes').doc(partId).update({
            [field]: numValue
        });
        // Recarregar silenciosamente para atualizar totais e status
        const retiroDoc = await db.collection('retiros').doc(currentRetiroId).get();
        renderRetiroGestao(currentRetiroId, retiroDoc.data());
    } catch (e) {
        showToast('Erro ao salvar pagamento: ' + e.message, 'error');
    }
}

async function addRetiroParticipant(retiroId, personId, name, type) {
    if (!name) return showToast('Nome é obrigatório', 'warning');

    // Verificar duplicidade no retiro
    const existing = await db.collection('retiro_participantes')
        .where('groupId', '==', currentGroupId)
        .where('retiroId', '==', retiroId)
        .where('nome', '==', name) // Verificação simples por nome
        .get();

    if (!existing.empty) {
        return showToast('Esta pessoa já está na lista do retiro.', 'warning');
    }

    try {
        // Buscar valor padrão do retiro
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        const defaultPrice = retiroDoc.data().defaultPrice || 0;

        await db.collection('retiro_participantes').add({
            retiroId,
            groupId: currentGroupId,
            personId: personId || null,
            nome: name,
            tipo: type,
            addedAt: firebase.firestore.FieldValue.serverTimestamp(),
            price: defaultPrice,
            paid: 0
        });

        // Limpar inputs
        const searchInput = document.getElementById('searchRetiroPart');
        const extInput = document.getElementById('externalNameRetiro');
        const results = document.getElementById('searchRetiroResults');
        if (searchInput) searchInput.value = '';
        if (extInput) extInput.value = '';
        if (results) results.style.display = 'none';

        // Recarregar tela de gestão
        renderRetiroGestao(retiroId, retiroDoc.data());
        showToast('Participante adicionado!', 'success');
        await updateVisibleRetirosMap();
    } catch (error) {
        showToast('Erro ao adicionar: ' + error.message, 'error');
    }
}

async function addRetiroTeamMemberWithRole(retiroId, personId, name, role) {
    // Verificar duplicidade
    const existing = await db.collection('retiro_participantes')
        .where('groupId', '==', currentGroupId)
        .where('retiroId', '==', retiroId)
        .where('personId', '==', personId)
        .get();

    if (!existing.empty) {
        return showToast('Esta pessoa já está no retiro.', 'warning');
    }

    try {
        // Buscar valor padrão da equipe
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        const defaultTeamPrice = retiroDoc.data().defaultTeamPrice || 0;

        await db.collection('retiro_participantes').add({
            retiroId,
            groupId: currentGroupId,
            personId,
            nome: name,
            tipo: 'interno',
            category: 'equipe', // Marca como equipe
            role: role,
            addedAt: firebase.firestore.FieldValue.serverTimestamp(),
            price: defaultTeamPrice,
            paid: 0
        });

        
        db.collection('retiros').doc(retiroId).get().then(doc => renderRetiroGestao(retiroId, doc.data()));
        showToast('Membro da equipe adicionado!', 'success');
    } catch (error) {
        showToast('Erro ao adicionar: ' + error.message, 'error');
    }
}

async function removeRetiroParticipant(partId, retiroId) {
    if (!confirm('Remover participante?')) return;
    try {
        await db.collection('retiro_participantes').doc(partId).delete();
        
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        renderRetiroGestao(retiroId, retiroDoc.data());
        
        await updateVisibleRetirosMap();
    } catch (e) {
        showToast('Erro ao remover.', 'error');
    }
}

function showRetiroExportOptions() {
    const retiroId = currentRetiroId;
    if (!retiroId) return;

    const modalBody = `
        <h2>Exportar Relatório do Retiro</h2>
        <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">Selecione a lista que deseja exportar:</p>
        
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 10px; color: var(--primary);">👥 Participantes</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button class="btn-secondary" onclick="exportRetiroExcel('${retiroId}', 'participantes'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 1rem;">
                    <span style="font-size: 1.5rem;">📊</span>
                    <span>Excel</span>
                </button>
                <button class="btn-secondary" onclick="exportRetiroPDF('${retiroId}', 'participantes'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 1rem;">
                    <span style="font-size: 1.5rem;">📄</span>
                    <span>PDF</span>
                </button>
            </div>
        </div>

        <div>
            <h4 style="margin-bottom: 10px; color: var(--primary);">🛠️ Equipe de Trabalho</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button class="btn-secondary" onclick="exportRetiroExcel('${retiroId}', 'equipe'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 1rem;">
                    <span style="font-size: 1.5rem;">📊</span>
                    <span>Excel</span>
                </button>
                <button class="btn-secondary" onclick="exportRetiroPDF('${retiroId}', 'equipe'); closeModal()" style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 1rem;">
                    <span style="font-size: 1.5rem;">📄</span>
                    <span>PDF</span>
                </button>
            </div>
        </div>
    `;
    
    showModal(modalBody);
}

async function exportRetiroExcel(retiroId, type = 'participantes') {
    try {
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        const retiro = retiroDoc.data();
        const defaultPrice = retiro.defaultPrice || 0;

        const snapshot = await db.collection('retiro_participantes')
            .where('groupId', '==', currentGroupId)
            .where('retiroId', '==', retiroId)
            .get();

        let participants = snapshot.docs.map(doc => doc.data());
        
        // Filtrar por tipo
        if (type === 'equipe') {
            participants = participants.filter(p => p.category === 'equipe');
        } else {
            participants = participants.filter(p => p.category !== 'equipe');
        }
        
        participants.sort((a, b) => a.nome.localeCompare(b.nome));

        const rows = participants.map(p => {
            const price = p.price !== undefined ? p.price : (type === 'equipe' ? 0 : defaultPrice);
            const paid = p.paid || 0;
            let status = 'Pendente';
            if (paid >= price && price > 0) status = 'Pago';
            else if (paid > 0) status = 'Parcial';
            else if (price === 0) status = 'Isento';

            const row = {
                "Nome": p.nome,
            };

            if (type === 'equipe') {
                row["Função"] = p.role || '-';
            } else {
                row["Tipo"] = p.tipo === 'interno' ? 'Cadastrado' : 'Externo';
            }

            row["Valor (R$)"] = price;
            row["Pago (R$)"] = paid;
            row["Status"] = status;

            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        
        if (type === 'equipe') {
            ws['!cols'] = [{wch: 30}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}];
        } else {
            ws['!cols'] = [{wch: 30}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}];
        }
        
        const sheetName = type === 'equipe' ? "Equipe" : "Participantes";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        const suffix = type === 'equipe' ? '_Equipe' : '_Participantes';
        const fileName = `Retiro_${retiro.nome.replace(/[^a-z0-9]/gi, '_')}${suffix}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast(`Relatório de ${type} gerado!`, 'success');
    } catch (error) {
        console.error(error);
        showToast('Erro ao exportar: ' + error.message, 'error');
    }
}

async function exportRetiroPDF(retiroId, type = 'participantes') {
    if (!window.jspdf) return showToast("Erro: Biblioteca PDF não carregada.", "error");
    
    try {
        const retiroDoc = await db.collection('retiros').doc(retiroId).get();
        const retiro = retiroDoc.data();
        const defaultPrice = retiro.defaultPrice || 0;

        const snapshot = await db.collection('retiro_participantes')
            .where('groupId', '==', currentGroupId)
            .where('retiroId', '==', retiroId)
            .get();

        let participants = snapshot.docs.map(doc => doc.data());
        
        // Filtrar por tipo
        if (type === 'equipe') {
            participants = participants.filter(p => p.category === 'equipe');
        } else {
            participants = participants.filter(p => p.category !== 'equipe');
        }

        participants.sort((a, b) => a.nome.localeCompare(b.nome));

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const groupName = document.getElementById('groupNameSidebar')?.textContent || 'Grupo';
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(groupName.toUpperCase(), 14, 15);

        doc.setFontSize(18);
        doc.setTextColor(37, 99, 235);
        const titleSuffix = type === 'equipe' ? ' - Equipe de Trabalho' : ' - Participantes';
        doc.text(`Relatório: ${retiro.nome}${titleSuffix}`, 14, 25);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Data: ${formatDate(retiro.data)} | Local: ${retiro.local || '-'}`, 14, 32);

        const tableBody = participants.map(p => {
            const price = p.price !== undefined ? p.price : (type === 'equipe' ? 0 : defaultPrice);
            const paid = p.paid || 0;
            let status = 'Pendente';
            if (paid >= price && price > 0) status = 'Pago';
            else if (paid > 0) status = 'Parcial';
            else if (price === 0) status = 'Isento';
            
            const row = [p.nome];
            
            if (type === 'equipe') {
                row.push(p.role || '-');
            } else {
                row.push(p.tipo === 'interno' ? 'Cadastrado' : 'Externo');
            }
            
            row.push(`R$ ${price.toFixed(2)}`);
            row.push(`R$ ${paid.toFixed(2)}`);
            row.push(status);
            
            return row;
        });

        const headers = type === 'equipe' 
            ? [['Nome', 'Função', 'Valor', 'Pago', 'Status']]
            : [['Nome', 'Tipo', 'Valor', 'Pago', 'Status']];

        doc.autoTable({
            head: headers,
            body: tableBody,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            styles: { fontSize: 10, cellPadding: 3 },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 4) {
                    if (data.cell.raw === 'Pago') data.cell.styles.textColor = [22, 163, 74];
                    else if (data.cell.raw === 'Parcial') data.cell.styles.textColor = [217, 119, 6];
                    else if (data.cell.raw === 'Isento') data.cell.styles.textColor = [100, 116, 139];
                    else data.cell.styles.textColor = [220, 38, 38];
                }
            }
        });
        
        // Summary
        let totalExpected = 0;
        let totalPaid = 0;
        participants.forEach(p => {
            const price = p.price !== undefined ? p.price : (type === 'equipe' ? 0 : defaultPrice);
            const paid = p.paid || 0;
            totalExpected += Number(price);
            totalPaid += Number(paid);
        });
        
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(`Total ${type === 'equipe' ? 'Membros' : 'Participantes'}: ${participants.length}`, 14, finalY);
        doc.text(`Total Arrecadado: R$ ${totalPaid.toFixed(2)} / R$ ${totalExpected.toFixed(2)}`, 14, finalY + 6);

        const suffix = type === 'equipe' ? '_Equipe' : '_Participantes';
        doc.save(`Retiro_${retiro.nome.replace(/[^a-z0-9]/gi, '_')}${suffix}.pdf`);
        showToast('PDF gerado com sucesso!', 'success');

    } catch (error) {
        console.error(error);
        showToast('Erro ao exportar: ' + error.message, 'error');
    }
}

// ==================== LAYOUT DASHBOARD ====================

let isEditingLayout = false;
const defaultDashboardOrder = ['card-actions', 'card-proximos', 'card-aniversariantes', 'card-ministerios', 'card-baixa-freq', 'card-top3-summary', 'card-chart'];

function toggleEditLayout() {
    isEditingLayout = !isEditingLayout;
    const btnEdit = document.getElementById('btnEditLayout');
    const btnReset = document.getElementById('btnResetLayout');
    const cards = document.querySelectorAll('.dashboard-card');

    if (isEditingLayout) {
        btnEdit.textContent = 'Salvar Layout';
        btnEdit.classList.remove('btn-secondary');
        btnEdit.classList.add('btn-primary');
        btnReset.style.display = 'inline-block';
        
        cards.forEach(card => {
            card.setAttribute('draggable', 'true');
            card.style.cursor = 'move';
            card.style.border = '2px dashed #ccc';
        });
    } else {
        btnEdit.textContent = 'Editar Layout';
        btnEdit.classList.remove('btn-primary');
        btnEdit.classList.add('btn-secondary');
        btnReset.style.display = 'none';
        
        cards.forEach(card => {
            card.setAttribute('draggable', 'false');
            card.style.cursor = 'default';
            card.style.border = 'none';
        });
        
        // Salvar ordem ao sair do modo de edição
        saveDashboardOrder();
    }
}

function resetDashboardLayout() {
    if (confirm('Deseja restaurar a ordem padrão dos cards?')) {
        localStorage.removeItem('dashboardOrder');
        
        const container = document.getElementById('dashboardGrid');
        const currentCards = [...container.querySelectorAll('.dashboard-card')];
        const cardMap = new Map(currentCards.map(card => [card.id, card]));
        
        // Reordenar DOM para o padrão
        defaultDashboardOrder.forEach(id => {
            const card = cardMap.get(id);
            if (card) container.appendChild(card);
        });
        
        // Se estiver editando, sai do modo de edição
        if (isEditingLayout) {
            toggleEditLayout();
        }
    }
}

// ==================== MINIMIZAR CARDS ====================

function toggleCard(button) {
    const card = button.closest('.dashboard-card');
    const content = card.querySelector('.card-content');
    
    if (!content) return;

    // Garante que o estilo inline não interfira na classe CSS
    content.style.display = '';

    const isCollapsed = content.classList.toggle('collapsed');
    card.classList.toggle('card-collapsed', isCollapsed);
    button.textContent = isCollapsed ? '➕' : '➖';
    
    saveCardStates();
}

async function saveCardStates() {
    const states = {};
    document.querySelectorAll('.dashboard-card').forEach(card => {
        const content = card.querySelector('.card-content');
        if (content) {
            states[card.id] = content.classList.contains('collapsed'); // true se minimizado
        }
    });
    
    // Salvar localmente para acesso rápido
    localStorage.setItem('dashboardCardStates', JSON.stringify(states));
    
    // Salvar no banco de dados se estiver logado
    if (currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).update({
                dashboardCardStates: states
            });
        } catch (error) {
            console.error("Erro ao salvar estados dos cards:", error);
        }
    }
}

async function loadCardStates() {
    // 1. Tentar carregar do localStorage (rápido)
    let states = JSON.parse(localStorage.getItem('dashboardCardStates')) || {};

    // 2. Se logado, tentar carregar/mesclar do banco de dados
    if (currentUser) {
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const userData = userDoc.data();
            if (userData && userData.dashboardCardStates) {
                states = { ...states, ...userData.dashboardCardStates };
                // Atualizar localStorage
                localStorage.setItem('dashboardCardStates', JSON.stringify(states));
            }
        } catch (error) {
            console.error("Erro ao carregar estados do banco:", error);
        }
    }

    Object.keys(states).forEach(cardId => {
        const card = document.getElementById(cardId);
        if (card) {
            const content = card.querySelector('.card-content');
            const btn = card.querySelector('.toggle-card-btn');
            
            // Limpar estilo inline antigo se existir
            if (content) content.style.display = '';

            if (states[cardId]) { // Se true (minimizado)
                if (content) content.classList.add('collapsed');
                if (card) card.classList.add('card-collapsed');
                if (btn) btn.textContent = '➕';
            } else {
                if (content) content.classList.remove('collapsed');
                if (card) card.classList.remove('card-collapsed');
                if (btn) btn.textContent = '➖';
            }
        }
    });
}

// ==================== TEMA (DARK MODE) ====================

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        btn.textContent = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
        // Ajustar estilo do botão se necessário
        if (theme === 'dark') {
            btn.style.backgroundColor = 'rgba(255,255,255,0.1)';
            btn.style.color = '#fff';
            btn.style.border = '1px solid rgba(255,255,255,0.2)';
        } else {
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.border = '';
        }
    }
}

// ==================== DRAG AND DROP DASHBOARD ====================

function initDashboardDragAndDrop() {
    const container = document.getElementById('dashboardGrid');
    const cards = container.querySelectorAll('.dashboard-card');

    cards.forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
            card.style.opacity = '0.5';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            card.style.opacity = '1';
            saveDashboardOrder();
        });
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (afterElement == null) {
            container.appendChild(draggable);
        } else {
            container.insertBefore(draggable, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dashboard-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveDashboardOrder() {
    const container = document.getElementById('dashboardGrid');
    const cards = [...container.querySelectorAll('.dashboard-card')];
    const order = cards.map(card => card.id);
    localStorage.setItem('dashboardOrder', JSON.stringify(order));
}

function loadDashboardOrder() {
    const container = document.getElementById('dashboardGrid');
    const savedOrder = JSON.parse(localStorage.getItem('dashboardOrder'));

    if (!savedOrder) return;

    const currentCards = [...container.querySelectorAll('.dashboard-card')];
    const cardMap = new Map(currentCards.map(card => [card.id, card]));

    savedOrder.forEach(id => {
        const card = cardMap.get(id);
        if (card) {
            container.appendChild(card);
        }
    });
    
    // Adiciona quaisquer cards novos que não estejam na ordem salva
    currentCards.forEach(card => {
        if (!savedOrder.includes(card.id)) {
            // Se for o card de ações e não estiver salvo, coloca no topo
            if (card.id === 'card-actions') {
                container.insertBefore(card, container.firstChild);
            } else {
                container.appendChild(card);
            }
        }
    });
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
        <span style="font-size: 1.2rem;">${icon}</span>
        <span style="flex: 1;">${message}</span>
        <span class="toast-close" onclick="this.parentElement.remove()">&times;</span>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s ease forwards';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

// ==================== SIDEBAR TOGGLE ====================

function initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    
    if (!sidebar) return;

    // Configurar evento de clique
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            if (window.innerWidth <= 768) {
                toggleMobileMenu();
            } else {
                sidebar.classList.toggle('collapsed');
                localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
            }
        };
    }

    // Restaurar estado salvo
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }
}

function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

// ==================== ACTION MENU TOGGLE ====================

function toggleActionMenu(id, event) {
    if (event) event.stopPropagation();
    
    const menu = document.getElementById(`menu-${id}`);
    const allMenus = document.querySelectorAll('.action-menu-dropdown');
    
    // Fecha outros menus abertos
    allMenus.forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });
    
    if (menu) {
        menu.classList.toggle('show');
    }
}

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu-container')) {
        document.querySelectorAll('.action-menu-dropdown').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

// Listeners para busca em tempo real
document.addEventListener('DOMContentLoaded', () => {
    const searchPessoa = document.getElementById('searchPessoa');
    if (searchPessoa) {
        searchPessoa.addEventListener('input', debounce(() => loadPessoas(), 300));
    }
    
    const searchEvento = document.getElementById('searchEvento');
    if (searchEvento) {
        searchEvento.addEventListener('input', debounce(() => loadEventos(), 300));
    }
    
    // Inicializar Drag and Drop do Dashboard
    initDashboardDragAndDrop();
    loadDashboardOrder();
    loadCardStates();
    loadTheme();
    initSidebarToggle(); // Inicializar Sidebar
});
