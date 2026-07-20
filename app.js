// Detectores de erro para diagnóstico rápido em páginas quebradas.
// O banner visual só aparece com ?debug=1 na URL, para não expor mensagens
// internas de erro (ex: detalhes do Supabase) para visitantes comuns.
// O log no console continua sempre ativo, para depuração via DevTools.
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';

function mostrarBannerErro(prefixo, msg) {
    if (!DEBUG_MODE || !document || !document.body) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;background:#fee;border-bottom:1px solid #f99;color:#900;padding:8px;z-index:9999;font-family:monospace';
    el.textContent = prefixo + ': ' + msg;
    document.body.insertAdjacentElement('afterbegin', el);
}

window.addEventListener('error', (ev) => {
    try {
        const msg = ev && ev.message ? ev.message : String(ev);
        console.error('Window error:', ev);
        mostrarBannerErro('JS Error', msg);
    } catch (e) { console.error(e); }
});
window.addEventListener('unhandledrejection', (ev) => {
    try {
        const msg = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'Unhandled rejection';
        console.error('UnhandledRejection:', ev);
        mostrarBannerErro('UnhandledRejection', msg);
    } catch (e) { console.error(e); }
});

// Configuração do Supabase e helper escapeHTML() vêm de supabase-client.js
// (carregado antes deste arquivo em curadoria.html)

// Elementos do DOM
const loginSection = document.getElementById('login-section');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const userDisplay = document.getElementById('user-display');
const btnLogout = document.getElementById('btn-logout');
const fotosContainer = document.getElementById('fotos-container');
const statusFilter = document.getElementById('status-filter');

// Navegação entre telas do painel (menu lateral fixo)
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

// Dashboard
const metricTotal = document.getElementById('metric-total');
const metricAprovadas = document.getElementById('metric-aprovadas');
const metricPendentes = document.getElementById('metric-pendentes');
const btnAtualizarDashboard = document.getElementById('btn-atualizar-dashboard');

// Concursos (CRUD)
const concursoForm = document.getElementById('concurso-form');
const concursoIdInput = document.getElementById('concurso-id');
const concursoDescricaoInput = document.getElementById('concurso-descricao');
const concursoDataInput = document.getElementById('concurso-data');
const concursoAtivoInput = document.getElementById('concurso-ativo');
const concursoEncerradoInput = document.getElementById('concurso-encerrado');
const concursoSubmitBtn = document.getElementById('concurso-submit-btn');
const concursoCancelBtn = document.getElementById('concurso-cancel-btn');
const concursoError = document.getElementById('concurso-error');
const concursosContainer = document.getElementById('concursos-container');
let concursosCache = [];

// 1. Monitorar estado da autenticação (Mantém logado mesmo se atualizar a página)
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        // Usuário logado com sucesso!
        loginSection.classList.add('hidden');
        adminPanel.classList.remove('hidden');
        userDisplay.textContent = `Admin: ${session.user.email}`;
        switchView('dashboard');
    } else {
        // Usuário não logado
        loginSection.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    }
});

// 1b. Troca de tela (Dashboard / Concursos / Moderação de fotos)
function switchView(viewName) {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('hidden', view.id !== `view-${viewName}`));

    if (viewName === 'dashboard') carregarMetricas();
    else if (viewName === 'concursos') carregarConcursos();
    else if (viewName === 'moderacao') carregarFotos(statusFilter ? statusFilter.value : 'Todas');
}
navItems.forEach(item => item.addEventListener('click', () => switchView(item.dataset.view)));

// 2. Processo de Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const email = loginEmail.value;
    const password = loginPassword.value; // Corrigido aqui!

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            loginError.textContent = "Acesso negado: " + error.message;
            loginError.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Erro inesperado na requisição:", err);
        loginError.textContent = "Erro ao conectar com o servidor.";
        loginError.classList.remove('hidden');
    }
});

// 3. Processo de Logout
btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

if (statusFilter) {
    statusFilter.addEventListener('change', () => carregarFotos(statusFilter.value));
}

// 4. Buscar e renderizar as fotos do banco de dados
async function carregarFotos(filtro = 'Todas') {
    fotosContainer.innerHTML = '<p class="text-gray-500 text-center col-span-full">Carregando fotos...</p>';

    let query = supabase
        .from('fotos_concurso')
        .select('*, concursos(descricao)')
        .order('criado_em', { ascending: false });

    if (filtro === 'Aprovadas') {
        query = query.eq('aprovada', true);
    } else if (filtro === 'Pendentes') {
        query = query.eq('aprovada', false);
    }

    const { data: fotos, error } = await query;

    if (error) {
        fotosContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center col-span-full font-semibold">Erro ao carregar dados: ${error.message}</p>`;
        return;
    }

    if (fotos.length === 0) {
        fotosContainer.innerHTML = '<p class="text-gray-500 text-center col-span-full">Nenhuma foto enviada até o momento.</p>';
        return;
    }

    fotosContainer.innerHTML = '';

    fotos.forEach(foto => {
        const card = document.createElement('div');
        card.className = "ticket-sm overflow-hidden";

        card.innerHTML = `
            <img src="${escapeHTML(foto.url_foto)}" alt="Foto de participante" class="w-full h-48 object-cover">
            <div class="p-4">
                <p class="text-sm text-[var(--ink-soft)] mb-1">Participante: <strong class="text-[var(--ink)]">${escapeHTML(foto.nome_participante)}</strong></p>
                <p class="text-xs text-[var(--ink-soft)] mb-2">Concurso: <strong class="text-[var(--ink)]">${foto.concursos ? escapeHTML(foto.concursos.descricao) : 'Sem concurso vinculado'}</strong></p>
                <div class="flex items-center space-x-2 my-2">
                    <span class="stamp ${foto.aprovada ? 'stamp-fern' : 'stamp-amber'}">
                        ${foto.aprovada ? 'Aprovada (visível)' : 'Pendente'}
                    </span>
                </div>
                <div class="flex space-x-2 mt-4">
                    ${!foto.aprovada ?
                        `<button onclick="alterarStatusFoto('${foto.id}', true)" class="btn btn-fern flex-1 text-sm !py-1.5 !px-3">Aprovar</button>` :
                        `<button onclick="alterarStatusFoto('${foto.id}', false)" class="btn btn-amber flex-1 text-sm !py-1.5 !px-3">Desaprovar</button>`
                    }
                    <button onclick="deletarFoto('${foto.id}')" class="btn btn-ember text-sm !py-1.5 !px-3">Reprovar</button>
                </div>
            </div>
        `;
        fotosContainer.appendChild(card);
    });
}

// 5. Função para aprovar ou reprovar a foto
window.alterarStatusFoto = async function(id, status) {
    const { error } = await supabase
        .from('fotos_concurso')
        .update({ aprovada: status })
        .eq('id', id);

    if (error) {
        alert("Erro ao atualizar status: " + error.message);
    } else {
        carregarFotos(statusFilter ? statusFilter.value : 'Todas');
    }
}

// 6. Função para deletar a foto (se for imprópria, por exemplo)
window.deletarFoto = async function(id) {
    if (confirm("Tem certeza que deseja REPROVAR esta foto permanentemente?\nEssa ação excluirá a foto e não pode ser desfeita.")) {
        const { error } = await supabase
            .from('fotos_concurso')
            .delete()
            .eq('id', id);

        if (error) {
            alert("Erro ao deletar: " + error.message);
        } else {
            carregarFotos(statusFilter ? statusFilter.value : 'Todas');
        }
    }
}

// 7. Dashboard — cards com métricas da aplicação
async function carregarMetricas() {
    if (!metricTotal) return;

    metricTotal.textContent = '…';
    metricAprovadas.textContent = '…';
    metricPendentes.textContent = '…';
    if (btnAtualizarDashboard) btnAtualizarDashboard.disabled = true;

    const [totalRes, aprovadasRes, pendentesRes] = await Promise.all([
        supabase.from('fotos_concurso').select('*', { count: 'exact', head: true }),
        supabase.from('fotos_concurso').select('*', { count: 'exact', head: true }).eq('aprovada', true),
        supabase.from('fotos_concurso').select('*', { count: 'exact', head: true }).eq('aprovada', false),
    ]);

    metricTotal.textContent = totalRes.error ? '—' : totalRes.count;
    metricAprovadas.textContent = aprovadasRes.error ? '—' : aprovadasRes.count;
    metricPendentes.textContent = pendentesRes.error ? '—' : pendentesRes.count;
    if (btnAtualizarDashboard) btnAtualizarDashboard.disabled = false;
}

if (btnAtualizarDashboard) {
    btnAtualizarDashboard.addEventListener('click', carregarMetricas);
}

// 8. Concursos — CRUD básico (cadastro de concursos culturais)
async function carregarConcursos() {
    if (!concursosContainer) return;
    concursosContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Buscando concursos...</p>';

    const { data, error } = await supabase
        .from('concursos')
        .select('*')
        .order('data', { ascending: false });

    if (error) {
        concursosContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar concursos: ${escapeHTML(error.message)}</p>`;
        return;
    }

    concursosCache = data;

    if (data.length === 0) {
        concursosContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum concurso cadastrado até o momento.</p>';
        return;
    }

    concursosContainer.innerHTML = '';

    data.forEach(concurso => {
        const dataFormatada = new Date(concurso.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const row = document.createElement('div');
        row.className = 'ticket-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';
        row.innerHTML = `
            <div>
                <p class="font-semibold text-[var(--ink)]">${escapeHTML(concurso.descricao)}</p>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-sm text-[var(--ink-soft)]">📅 ${dataFormatada}</span>
                    <span class="stamp ${concurso.ativo ? 'stamp-fern' : 'stamp-amber'}">${concurso.ativo ? 'Ativo' : 'Inativo'}</span>
                    ${concurso.encerrado ? '<span class="stamp stamp-ember">Encerrado</span>' : ''}
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editarConcurso('${concurso.id}')" class="btn btn-ghost text-sm !py-1.5 !px-3">Editar</button>
                <button onclick="excluirConcurso('${concurso.id}')" class="btn btn-ember text-sm !py-1.5 !px-3">Excluir</button>
            </div>
        `;
        concursosContainer.appendChild(row);
    });
}

function resetConcursoForm() {
    concursoForm.reset();
    concursoIdInput.value = '';
    concursoAtivoInput.checked = true;
    concursoEncerradoInput.checked = false;
    concursoSubmitBtn.textContent = 'Cadastrar concurso';
    concursoCancelBtn.classList.add('hidden');
    concursoError.classList.add('hidden');
}

window.editarConcurso = function(id) {
    const concurso = concursosCache.find(c => c.id === id);
    if (!concurso) return;

    concursoIdInput.value = concurso.id;
    concursoDescricaoInput.value = concurso.descricao;
    concursoDataInput.value = concurso.data;
    concursoAtivoInput.checked = concurso.ativo;
    concursoEncerradoInput.checked = concurso.encerrado;
    concursoSubmitBtn.textContent = 'Salvar alterações';
    concursoCancelBtn.classList.remove('hidden');
    concursoError.classList.add('hidden');
    concursoDescricaoInput.focus();
}

window.excluirConcurso = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este concurso? Essa ação não pode ser desfeita.')) return;

    const { error } = await supabase.from('concursos').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir concurso: ' + error.message);
    } else {
        if (concursoIdInput.value === id) resetConcursoForm();
        carregarConcursos();
    }
}

if (concursoForm) {
    concursoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        concursoError.classList.add('hidden');

        const payload = {
            descricao: concursoDescricaoInput.value.trim(),
            data: concursoDataInput.value,
            ativo: concursoAtivoInput.checked,
            encerrado: concursoEncerradoInput.checked,
        };

        const id = concursoIdInput.value;
        const { error } = id
            ? await supabase.from('concursos').update(payload).eq('id', id)
            : await supabase.from('concursos').insert([payload]);

        if (error) {
            concursoError.textContent = error.code === '23505'
                ? 'Já existe outro concurso marcado como Ativo. Desative-o antes de ativar este.'
                : 'Erro ao salvar concurso: ' + error.message;
            concursoError.classList.remove('hidden');
            return;
        }

        resetConcursoForm();
        carregarConcursos();
    });
}

if (concursoCancelBtn) {
    concursoCancelBtn.addEventListener('click', resetConcursoForm);
}