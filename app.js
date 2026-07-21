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
const moderacaoConcursoFilter = document.getElementById('moderacao-concurso-filter');
const moderacaoTamanhoPagina = document.getElementById('moderacao-tamanho-pagina');
const moderacaoPaginacao = document.getElementById('moderacao-paginacao');
const moderacaoPaginaAnterior = document.getElementById('moderacao-pagina-anterior');
const moderacaoPaginaProxima = document.getElementById('moderacao-pagina-proxima');
const moderacaoPaginaInfo = document.getElementById('moderacao-pagina-info');
const contadorFotosModeracao = document.getElementById('contador-fotos-moderacao');
// Só define o concurso ativo como seleção padrão do filtro na primeira vez
// que a tela de moderação é aberta — depois disso, respeita o que o
// moderador escolheu, mesmo trocando de tela e voltando.
let filtroConcursoModeracaoInicializado = false;
// Página atual da grade de moderação — trocar filtro/concurso/tamanho de
// página sempre volta pra página 1; os botões Anterior/Próxima só mudam isso.
let paginaAtualModeracao = 1;

// Navegação entre telas do painel (menu lateral fixo)
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

// Dashboard
const metricTotal = document.getElementById('metric-total');
const metricAprovadas = document.getElementById('metric-aprovadas');
const metricPendentes = document.getElementById('metric-pendentes');
const btnAtualizarDashboard = document.getElementById('btn-atualizar-dashboard');
const metricasPorConcursoContainer = document.getElementById('metricas-por-concurso');

// Concursos (CRUD)
const concursoForm = document.getElementById('concurso-form');
const concursoIdInput = document.getElementById('concurso-id');
const concursoDescricaoInput = document.getElementById('concurso-descricao');
const concursoDataInput = document.getElementById('concurso-data');
const concursoAtivoInput = document.getElementById('concurso-ativo');
const concursoEncerradoInput = document.getElementById('concurso-encerrado');
const concursoQtdVencedoresInput = document.getElementById('concurso-qtd-vencedores');
const trofeuOpcoes = document.querySelectorAll('.trofeu-opcao');
const concursoRegulamentoArquivoInput = document.getElementById('concurso-regulamento-arquivo');
const concursoRegulamentoAtualDiv = document.getElementById('concurso-regulamento-atual');
const concursoRegulamentoLink = document.getElementById('concurso-regulamento-link');
const concursoRegulamentoRemoverInput = document.getElementById('concurso-regulamento-remover');
const concursoSubmitBtn = document.getElementById('concurso-submit-btn');
const concursoCancelBtn = document.getElementById('concurso-cancel-btn');
const concursoError = document.getElementById('concurso-error');
const concursosContainer = document.getElementById('concursos-container');
const concursoPatrocinadoresLista = document.getElementById('concurso-patrocinadores-lista');
const concursoPremiacoesLista = document.getElementById('concurso-premiacoes-lista');
const concursoPremiacoesLimiteTexto = document.getElementById('concurso-premiacoes-limite-texto');
const concursoStatusFilter = document.getElementById('concurso-status-filter');
const contadorConcursos = document.getElementById('contador-concursos');
let concursosCache = [];

// Patrocinadores (CRUD)
const patrocinadorForm = document.getElementById('patrocinador-form');
const patrocinadorIdInput = document.getElementById('patrocinador-id');
const patrocinadorNomeInput = document.getElementById('patrocinador-nome');
const patrocinadorUrlInput = document.getElementById('patrocinador-url');
const patrocinadorLogotipoArquivoInput = document.getElementById('patrocinador-logotipo-arquivo');
const patrocinadorLogotipoAtualDiv = document.getElementById('patrocinador-logotipo-atual');
const patrocinadorLogotipoPreview = document.getElementById('patrocinador-logotipo-preview');
const patrocinadorLogotipoRemoverInput = document.getElementById('patrocinador-logotipo-remover');
const patrocinadorAtivoInput = document.getElementById('patrocinador-ativo');
const patrocinadorSubmitBtn = document.getElementById('patrocinador-submit-btn');
const patrocinadorCancelBtn = document.getElementById('patrocinador-cancel-btn');
const patrocinadorError = document.getElementById('patrocinador-error');
const patrocinadoresContainer = document.getElementById('patrocinadores-container');
const patrocinadorStatusFilter = document.getElementById('patrocinador-status-filter');
const contadorPatrocinadores = document.getElementById('contador-patrocinadores');
let patrocinadoresCache = [];

// Premiações (CRUD)
const premiacaoForm = document.getElementById('premiacao-form');
const premiacaoIdInput = document.getElementById('premiacao-id');
const premiacaoDescricaoInput = document.getElementById('premiacao-descricao');
const premiacaoAtivoInput = document.getElementById('premiacao-ativo');
const premiacaoSubmitBtn = document.getElementById('premiacao-submit-btn');
const premiacaoCancelBtn = document.getElementById('premiacao-cancel-btn');
const premiacaoError = document.getElementById('premiacao-error');
const premiacoesContainer = document.getElementById('premiacoes-container');
const premiacaoStatusFilter = document.getElementById('premiacao-status-filter');
const contadorPremiacoes = document.getElementById('contador-premiacoes');
let premiacoesCache = [];

// 1. Monitorar estado da autenticação (Mantém logado mesmo se atualizar a página)
//
// Ter uma sessão válida do Supabase Auth NÃO é suficiente pra abrir o
// painel: qualquer visitante que faz login com o Google em votacao.html
// (só pra votar) também gera uma sessão válida no mesmo domínio. Por isso,
// toda sessão passa antes por is_admin() (função no banco, ver
// sql/014_admins_e_rls.sql) — só quem está na tabela "admins" entra.
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        validarAcessoAdmin(session);
    } else {
        loginSection.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    }
});

async function validarAcessoAdmin(session) {
    const { data: souAdmin, error } = await supabase.rpc('is_admin');

    if (error || !souAdmin) {
        // Sessão existe no Supabase Auth, mas não pertence a um admin
        // cadastrado (ex: conta Google usada em votacao.html) — barra o
        // acesso e desloga, em vez de deixar uma sessão "meio logada".
        await supabase.auth.signOut();
        loginSection.classList.remove('hidden');
        adminPanel.classList.add('hidden');
        loginError.textContent = 'Esta conta não tem permissão de acesso ao painel de curadoria.';
        loginError.classList.remove('hidden');
        return;
    }

    loginSection.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    userDisplay.textContent = `Admin: ${session.user.email}`;
    switchView('dashboard');
}

// 1b. Troca de tela (Dashboard / Concursos / Moderação de fotos)
function switchView(viewName) {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('hidden', view.id !== `view-${viewName}`));

    if (viewName === 'dashboard') { carregarMetricas(); carregarMetricasPorConcurso(); }
    else if (viewName === 'concursos') { carregarConcursos(); carregarListasVinculo(); }
    else if (viewName === 'moderacao') {
        carregarOpcoesConcursoModeracao().then(() => {
            paginaAtualModeracao = 1;
            carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao);
        });
    }
    else if (viewName === 'patrocinadores') carregarPatrocinadores();
    else if (viewName === 'premiacoes') carregarPremiacoes();
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
    statusFilter.addEventListener('change', () => {
        paginaAtualModeracao = 1;
        carregarFotos(statusFilter.value, moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao);
    });
}
if (moderacaoConcursoFilter) {
    moderacaoConcursoFilter.addEventListener('change', () => {
        paginaAtualModeracao = 1;
        carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter.value, paginaAtualModeracao);
    });
}
if (moderacaoTamanhoPagina) {
    moderacaoTamanhoPagina.addEventListener('change', () => {
        paginaAtualModeracao = 1;
        carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao);
    });
}
if (moderacaoPaginaAnterior) {
    moderacaoPaginaAnterior.addEventListener('click', () => {
        carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao - 1);
    });
}
if (moderacaoPaginaProxima) {
    moderacaoPaginaProxima.addEventListener('click', () => {
        carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao + 1);
    });
}

// Popula o <select> de concursos da tela de moderação. Na primeira vez que
// a tela é aberta, seleciona automaticamente o concurso ativo (se houver);
// nas próximas, mantém a escolha atual do moderador (ou cai para "Todos" se
// o concurso selecionado tiver sido removido nesse meio-tempo).
async function carregarOpcoesConcursoModeracao() {
    if (!moderacaoConcursoFilter) return;

    const selecaoAnterior = moderacaoConcursoFilter.value;

    const { data: concursos, error } = await supabase
        .from('concursos')
        .select('id, descricao, ativo')
        .order('criado_em', { ascending: false });

    if (error) {
        console.error('Erro ao carregar concursos para o filtro de moderação:', error);
        return;
    }

    const opcoes = ['<option value="todos">Todos os concursos</option>']
        .concat((concursos || []).map(c =>
            `<option value="${c.id}">${escapeHTML(c.descricao)}${c.ativo ? ' (ativo)' : ''}</option>`
        ));
    moderacaoConcursoFilter.innerHTML = opcoes.join('');

    if (!filtroConcursoModeracaoInicializado) {
        filtroConcursoModeracaoInicializado = true;
        const concursoAtivo = (concursos || []).find(c => c.ativo);
        moderacaoConcursoFilter.value = concursoAtivo ? concursoAtivo.id : 'todos';
    } else if ([...moderacaoConcursoFilter.options].some(o => o.value === selecaoAnterior)) {
        moderacaoConcursoFilter.value = selecaoAnterior;
    }
}

// Filtra uma lista já carregada pelo campo "ativo", conforme o valor de um
// <select> "Todos"/"Ativo"/"Inativo" — usado nas telas de Concursos,
// Patrocinadores e Premiações. Filtra só a exibição (a lista completa
// continua em cache, pra editarX(id) sempre achar qualquer item, mesmo os
// que estão escondidos pelo filtro no momento).
function filtrarPorAtivo(lista, filtro) {
    if (filtro === 'Ativo') return lista.filter(item => item.ativo);
    if (filtro === 'Inativo') return lista.filter(item => !item.ativo);
    return lista;
}

if (concursoStatusFilter) {
    concursoStatusFilter.addEventListener('change', () => renderizarConcursos());
}
if (patrocinadorStatusFilter) {
    patrocinadorStatusFilter.addEventListener('change', () => renderizarPatrocinadores());
}
if (premiacaoStatusFilter) {
    premiacaoStatusFilter.addEventListener('change', () => renderizarPremiacoes());
}

// Atualiza os controles de "Anterior"/"Próxima" e o texto "Página X de Y"
// abaixo da grade de moderação. Some por completo quando não há nada pra
// paginar (0 fotos no filtro atual).
function atualizarPaginacaoModeracao(totalPaginas) {
    if (!moderacaoPaginacao) return;

    if (totalPaginas <= 0) {
        moderacaoPaginacao.classList.add('hidden');
        return;
    }

    moderacaoPaginacao.classList.remove('hidden');
    moderacaoPaginaInfo.textContent = `Página ${paginaAtualModeracao} de ${totalPaginas}`;
    moderacaoPaginaAnterior.disabled = paginaAtualModeracao <= 1;
    moderacaoPaginaProxima.disabled = paginaAtualModeracao >= totalPaginas;
}

// 4. Buscar e renderizar as fotos do banco de dados, uma página por vez
async function carregarFotos(filtro = 'Todas', concursoId = 'todos', pagina = 1) {
    fotosContainer.innerHTML = '<p class="text-gray-500 text-center col-span-full">Carregando fotos...</p>';
    contadorFotosModeracao.textContent = '';

    const tamanhoPagina = parseInt(moderacaoTamanhoPagina ? moderacaoTamanhoPagina.value : '6', 10) || 6;

    let query = supabase
        .from('fotos_concurso')
        .select('*, concursos(descricao)', { count: 'exact' })
        .order('criado_em', { ascending: false });

    if (filtro === 'Aprovadas') {
        query = query.eq('aprovada', true);
    } else if (filtro === 'Pendentes') {
        query = query.eq('aprovada', false);
    }

    if (concursoId && concursoId !== 'todos') {
        query = query.eq('concurso_id', concursoId);
    }

    const inicio = (pagina - 1) * tamanhoPagina;
    query = query.range(inicio, inicio + tamanhoPagina - 1);

    const { data: fotos, error, count } = await query;

    if (error) {
        fotosContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center col-span-full font-semibold">Erro ao carregar dados: ${error.message}</p>`;
        return;
    }

    const totalItens = count || 0;
    const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanhoPagina));

    // A página pedida ficou além do fim (ex: era a última e uma foto dela
    // acabou de ser reprovada/excluída) — volta pra última página válida em
    // vez de deixar o moderador olhando pra uma grade em branco.
    if (totalItens > 0 && pagina > totalPaginas) {
        return carregarFotos(filtro, concursoId, totalPaginas);
    }

    paginaAtualModeracao = pagina;
    contadorFotosModeracao.textContent = `(${totalItens})`;

    if (totalItens === 0) {
        fotosContainer.innerHTML = '<p class="text-gray-500 text-center col-span-full">Nenhuma foto enviada até o momento.</p>';
        atualizarPaginacaoModeracao(0);
        return;
    }

    fotosContainer.innerHTML = '';

    fotos.forEach(foto => {
        const card = document.createElement('div');
        card.className = "ticket-sm overflow-hidden";

        card.innerHTML = `
            <img src="${escapeHTML(foto.url_thumb || foto.url_foto)}" alt="Foto de participante" loading="lazy" class="w-full h-48 object-cover">
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

    atualizarPaginacaoModeracao(totalPaginas);
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
        carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao);
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
            carregarFotos(statusFilter ? statusFilter.value : 'Todas', moderacaoConcursoFilter ? moderacaoConcursoFilter.value : 'todos', paginaAtualModeracao);
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

// Mesmas métricas do bloco geral (Total/Aprovadas/Pendentes), mas separadas
// por concurso — útil pra saber de onde vêm as fotos quando há mais de um
// concurso cadastrado (ex: temporadas diferentes). Busca os concursos e as
// fotos (só concurso_id + aprovada, o necessário pra contar) em paralelo e
// agrupa no navegador, em vez de fazer 3 queries de contagem por concurso.
async function carregarMetricasPorConcurso() {
    if (!metricasPorConcursoContainer) return;
    metricasPorConcursoContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Buscando concursos...</p>';

    const [concursosRes, fotosRes] = await Promise.all([
        supabase.from('concursos').select('id, descricao, data, ativo').order('criado_em', { ascending: true }),
        supabase.from('fotos_concurso').select('concurso_id, aprovada'),
    ]);

    if (concursosRes.error) {
        metricasPorConcursoContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar concursos: ${escapeHTML(concursosRes.error.message)}</p>`;
        return;
    }
    if (fotosRes.error) {
        metricasPorConcursoContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar fotos: ${escapeHTML(fotosRes.error.message)}</p>`;
        return;
    }

    if (concursosRes.data.length === 0) {
        metricasPorConcursoContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum concurso cadastrado até o momento.</p>';
        return;
    }

    // Agrupa as fotos por concurso_id, contando total/aprovadas/pendentes.
    const contagemPorConcurso = {};
    fotosRes.data.forEach(foto => {
        const chave = foto.concurso_id || 'sem-concurso';
        if (!contagemPorConcurso[chave]) contagemPorConcurso[chave] = { total: 0, aprovadas: 0, pendentes: 0 };
        contagemPorConcurso[chave].total++;
        if (foto.aprovada) contagemPorConcurso[chave].aprovadas++;
        else contagemPorConcurso[chave].pendentes++;
    });

    function blocoMetricas(descricao, dataFormatada, ativo, contagem) {
        return `
            <div>
                <div class="flex items-center gap-2 mb-3">
                    <h4 class="font-semibold text-[var(--ink)]">${escapeHTML(descricao)}</h4>
                    ${dataFormatada ? `<span class="text-sm text-[var(--ink-soft)]">📅 ${dataFormatada}</span>` : ''}
                    ${ativo !== null ? `<span class="stamp ${ativo ? 'stamp-fern' : 'stamp-amber'}">${ativo ? 'Ativo' : 'Inativo'}</span>` : ''}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="ticket-sm-light p-5">
                        <p class="eyebrow text-[var(--fern-dark)] mb-2">Total de fotos</p>
                        <p class="font-display text-3xl text-[var(--ink)]">${contagem.total}</p>
                    </div>
                    <div class="ticket-sm-light p-5">
                        <p class="eyebrow text-[var(--fern-dark)] mb-2">Aprovadas</p>
                        <p class="font-display text-3xl text-[var(--ink)]">${contagem.aprovadas}</p>
                    </div>
                    <div class="ticket-sm-light p-5">
                        <p class="eyebrow text-[var(--ember-dark)] mb-2">Pendentes</p>
                        <p class="font-display text-3xl text-[var(--ink)]">${contagem.pendentes}</p>
                    </div>
                </div>
            </div>
        `;
    }

    const vazio = { total: 0, aprovadas: 0, pendentes: 0 };

    let html = concursosRes.data.map(concurso => {
        const dataFormatada = new Date(concurso.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const contagem = contagemPorConcurso[concurso.id] || vazio;
        return blocoMetricas(concurso.descricao, dataFormatada, concurso.ativo, contagem);
    }).join('');

    // Fotos sem concurso vinculado (ex: concurso excluído depois do envio) —
    // só mostra esse bloco extra se realmente existir alguma.
    if (contagemPorConcurso['sem-concurso']) {
        html += blocoMetricas('Sem concurso vinculado', null, null, contagemPorConcurso['sem-concurso']);
    }

    metricasPorConcursoContainer.innerHTML = html;
}

if (btnAtualizarDashboard) {
    btnAtualizarDashboard.addEventListener('click', () => {
        carregarMetricas();
        carregarMetricasPorConcurso();
    });
}

// 8. Concursos — CRUD básico (cadastro de concursos culturais)
async function carregarConcursos() {
    if (!concursosContainer) return;
    concursosContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Buscando concursos...</p>';

    const { data, error } = await supabase
        .from('concursos')
        .select('*, concursos_patrocinadores(patrocinador_id), concursos_premiacoes(premiacao_id, posicao)')
        .order('data', { ascending: false });

    if (error) {
        concursosContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar concursos: ${escapeHTML(error.message)}</p>`;
        return;
    }

    concursosCache = data;
    renderizarConcursos();
}

// Renderiza a partir do cache já carregado, aplicando o filtro Ativo/
// Inativo/Todos selecionado — não busca no banco de novo, já que a lista
// completa já está em memória (ver carregarConcursos).
function renderizarConcursos() {
    if (!concursosContainer) return;

    const filtro = concursoStatusFilter ? concursoStatusFilter.value : 'Todos';
    const data = filtrarPorAtivo(concursosCache, filtro);
    if (contadorConcursos) contadorConcursos.textContent = `(${data.length})`;

    if (concursosCache.length === 0) {
        concursosContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum concurso cadastrado até o momento.</p>';
        return;
    }

    if (data.length === 0) {
        concursosContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum concurso encontrado para esse filtro.</p>';
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
                    <span class="text-sm text-[var(--ink-soft)]">${'🏆'.repeat(concurso.qtd_vencedores || 3)}</span>
                    ${concurso.regulamento_pdf_url ? `<a href="${escapeHTML(concurso.regulamento_pdf_url)}" target="_blank" rel="noopener noreferrer" class="text-sm underline underline-offset-2 text-[var(--ink-soft)] hover:text-[var(--ink)]">📄 Regulamento</a>` : ''}
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

// Marca visualmente qual opção de troféu está selecionada e guarda o
// valor (1, 2 ou 3) no input escondido usado no payload do formulário.
function selecionarQtdVencedores(qtd) {
    concursoQtdVencedoresInput.value = qtd;
    trofeuOpcoes.forEach(botao => {
        botao.classList.toggle('selecionado', Number(botao.dataset.qtd) === Number(qtd));
    });
    aplicarLimitePremiacoes();
}

// A quantidade de premiações vinculadas não pode passar da quantidade de
// vencedores do concurso (1 vencedor = no máximo 1 premiação, e assim por
// diante) — e cada premiação marcada precisa dizer a QUAL posição (1º, 2º
// ou 3º lugar) ela pertence, sem repetir posição entre elas. Desmarca o
// excedente quando a quantidade de vencedores diminui, desabilita as opções
// restantes assim que o limite é atingido, e mantém os seletores de posição
// coerentes com o teto atual.
function aplicarLimitePremiacoes() {
    if (!concursoPremiacoesLista) return;
    const max = Number(concursoQtdVencedoresInput.value) || 3;
    const linhas = Array.from(concursoPremiacoesLista.querySelectorAll('.premiacao-linha'));
    let marcadas = linhas.filter(linha => linha.querySelector('.premiacao-checkbox').checked);

    if (marcadas.length > max) {
        marcadas.slice(max).forEach(linha => { linha.querySelector('.premiacao-checkbox').checked = false; });
        marcadas = linhas.filter(linha => linha.querySelector('.premiacao-checkbox').checked);
    }

    // Garante que nenhuma posição em uso esteja fora do teto atual nem
    // repetida — reatribui a primeira posição livre quando necessário.
    const posicoesEmUso = new Set();
    marcadas.forEach(linha => {
        const select = linha.querySelector('.premiacao-posicao');
        let valor = Number(select.value);
        if (!valor || valor > max || posicoesEmUso.has(valor)) {
            valor = [1, 2, 3].find(p => p <= max && !posicoesEmUso.has(p));
            select.value = valor;
        }
        select.dataset.posicaoAnterior = valor;
        posicoesEmUso.add(valor);
    });

    const atingiuLimite = marcadas.length >= max;
    linhas.forEach(linha => {
        const checkbox = linha.querySelector('.premiacao-checkbox');
        const select = linha.querySelector('.premiacao-posicao');
        checkbox.disabled = atingiuLimite && !checkbox.checked;
        linha.classList.toggle('opacity-40', checkbox.disabled);
        select.disabled = !checkbox.checked;
        Array.from(select.options).forEach(opt => { opt.hidden = Number(opt.value) > max; });
    });

    if (concursoPremiacoesLimiteTexto) {
        concursoPremiacoesLimiteTexto.textContent = `(selecione até ${max} e indique a posição de cada uma)`;
    }
}

// Ao trocar manualmente a posição de uma premiação pra uma que já está em
// uso por outra premiação marcada, troca as duas de lugar — em vez de só
// bloquear a ação, o que seria mais confuso pro admin.
function trocarPosicaoPremiacao(selectAlterado) {
    const novaPosicao = Number(selectAlterado.value);
    const posicaoAnterior = Number(selectAlterado.dataset.posicaoAnterior) || novaPosicao;
    const linhas = Array.from(concursoPremiacoesLista.querySelectorAll('.premiacao-linha'));

    const conflito = linhas.find(linha => {
        const select = linha.querySelector('.premiacao-posicao');
        const checkbox = linha.querySelector('.premiacao-checkbox');
        return select !== selectAlterado && checkbox.checked && Number(select.value) === novaPosicao;
    });

    if (conflito) {
        const selectConflito = conflito.querySelector('.premiacao-posicao');
        selectConflito.value = posicaoAnterior;
        selectConflito.dataset.posicaoAnterior = posicaoAnterior;
    }

    selectAlterado.dataset.posicaoAnterior = novaPosicao;
}

if (concursoPremiacoesLista) {
    concursoPremiacoesLista.addEventListener('change', (e) => {
        if (e.target.matches('.premiacao-checkbox')) aplicarLimitePremiacoes();
        else if (e.target.matches('.premiacao-posicao')) trocarPosicaoPremiacao(e.target);
    });
}

trofeuOpcoes.forEach(botao => {
    botao.addEventListener('click', () => selecionarQtdVencedores(botao.dataset.qtd));
});
if (trofeuOpcoes.length > 0) selecionarQtdVencedores(3);

// Desenha uma lista de checkboxes em formato de "pill" (mesmo componente
// reaproveitado pra patrocinadores e premiações vinculados ao concurso).
function renderizarListaVinculo(container, itens, campoNome, textoVazio) {
    if (!container) return;
    if (!itens || itens.length === 0) {
        container.innerHTML = `<p class="text-[var(--ink-soft)] text-sm">${textoVazio}</p>`;
        return;
    }
    container.innerHTML = itens.map(item => `
        <label class="flex items-center gap-2 ticket-sm px-3 py-1.5 text-sm text-[var(--ink)] cursor-pointer">
            <input type="checkbox" value="${item.id}" class="h-4 w-4 border-[var(--ink)] rounded cursor-pointer">
            ${escapeHTML(item[campoNome])}${item.ativo === false ? ' <span class="text-[var(--ink-soft)]">(inativo)</span>' : ''}
        </label>
    `).join('');
}

// Marca, dentro de uma lista já renderizada, os checkboxes cujo value está
// no array de ids selecionados (usado ao abrir um concurso para edição).
function marcarSelecionadosLista(container, idsSelecionados) {
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = idsSelecionados.includes(cb.value);
    });
}

// Lê os checkboxes marcados numa lista renderizada e devolve os ids.
function obterSelecionadosLista(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// Desenha a lista de premiações com um seletor de posição (1º/2º/3º lugar)
// ao lado de cada checkbox — diferente da lista genérica de patrocinadores,
// porque aqui o admin precisa classificar cada premiação marcada.
function renderizarListaPremiacoes(itens) {
    if (!concursoPremiacoesLista) return;
    if (!itens || itens.length === 0) {
        concursoPremiacoesLista.innerHTML = '<p class="text-[var(--ink-soft)] text-sm">Nenhuma premiação cadastrada ainda.</p>';
        return;
    }
    concursoPremiacoesLista.innerHTML = itens.map(item => `
        <div class="premiacao-linha ticket-sm px-3 py-1.5 flex items-center gap-2 text-sm text-[var(--ink)]">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" value="${item.id}" class="premiacao-checkbox h-4 w-4 border-[var(--ink)] rounded cursor-pointer">
                ${escapeHTML(item.descricao)}${item.ativo === false ? ' <span class="text-[var(--ink-soft)]">(inativo)</span>' : ''}
            </label>
            <select class="premiacao-posicao border-2 border-[var(--ink)] rounded-lg text-xs px-1.5 py-1 bg-white disabled:opacity-40 disabled:cursor-not-allowed" disabled>
                <option value="1">1º lugar</option>
                <option value="2">2º lugar</option>
                <option value="3">3º lugar</option>
            </select>
        </div>
    `).join('');
}

// Marca as premiações vinculadas ao concurso (usado ao editar), já
// colocando cada uma na posição salva no banco.
function marcarSelecionadosPremiacoes(vinculos) {
    if (!concursoPremiacoesLista) return;
    concursoPremiacoesLista.querySelectorAll('.premiacao-linha').forEach(linha => {
        const checkbox = linha.querySelector('.premiacao-checkbox');
        const select = linha.querySelector('.premiacao-posicao');
        const vinculo = vinculos.find(v => v.premiacao_id === checkbox.value);
        checkbox.checked = Boolean(vinculo);
        if (vinculo) {
            select.value = vinculo.posicao;
            select.dataset.posicaoAnterior = vinculo.posicao;
        }
    });
}

// Lê as premiações marcadas e a posição escolhida para cada uma.
function obterSelecionadosPremiacoes() {
    if (!concursoPremiacoesLista) return [];
    return Array.from(concursoPremiacoesLista.querySelectorAll('.premiacao-linha'))
        .filter(linha => linha.querySelector('.premiacao-checkbox').checked)
        .map(linha => ({
            premiacao_id: linha.querySelector('.premiacao-checkbox').value,
            posicao: Number(linha.querySelector('.premiacao-posicao').value),
        }));
}

// Busca todos os patrocinadores e premiações cadastrados e desenha as
// listas de vínculo do formulário de concurso (chamado ao entrar na tela).
async function carregarListasVinculo() {
    const [patrocinadoresRes, premiacoesRes] = await Promise.all([
        supabase.from('patrocinadores').select('id, nome, ativo').order('nome', { ascending: true }),
        supabase.from('premiacoes').select('id, descricao, ativo').order('descricao', { ascending: true }),
    ]);

    renderizarListaVinculo(concursoPatrocinadoresLista, patrocinadoresRes.data, 'nome', 'Nenhum patrocinador cadastrado ainda.');
    renderizarListaPremiacoes(premiacoesRes.data);
    aplicarLimitePremiacoes();
}

function resetConcursoForm() {
    concursoForm.reset();
    concursoIdInput.value = '';
    concursoAtivoInput.checked = true;
    concursoEncerradoInput.checked = false;
    selecionarQtdVencedores(3);
    marcarSelecionadosLista(concursoPatrocinadoresLista, []);
    marcarSelecionadosPremiacoes([]);
    concursoRegulamentoAtualDiv.classList.add('hidden');
    concursoRegulamentoLink.href = '#';
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
    selecionarQtdVencedores(concurso.qtd_vencedores || 3);
    marcarSelecionadosLista(concursoPatrocinadoresLista, (concurso.concursos_patrocinadores || []).map(v => v.patrocinador_id));
    marcarSelecionadosPremiacoes((concurso.concursos_premiacoes || []).map(v => ({ premiacao_id: v.premiacao_id, posicao: v.posicao })));
    aplicarLimitePremiacoes();
    concursoRegulamentoArquivoInput.value = '';
    concursoRegulamentoRemoverInput.checked = false;
    if (concurso.regulamento_pdf_url) {
        concursoRegulamentoLink.href = concurso.regulamento_pdf_url;
        concursoRegulamentoAtualDiv.classList.remove('hidden');
    } else {
        concursoRegulamentoAtualDiv.classList.add('hidden');
    }
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

        const id = concursoIdInput.value;
        const arquivoRegulamento = concursoRegulamentoArquivoInput.files[0];

        const payload = {
            descricao: concursoDescricaoInput.value.trim(),
            data: concursoDataInput.value,
            ativo: concursoAtivoInput.checked,
            encerrado: concursoEncerradoInput.checked,
            qtd_vencedores: Number(concursoQtdVencedoresInput.value),
        };

        // Trava de segurança: a interface já desabilita checkboxes e limita
        // as posições disponíveis, mas validamos de novo aqui antes de
        // gravar qualquer coisa.
        const premiacoesParaValidar = obterSelecionadosPremiacoes();
        const posicoesUnicas = new Set(premiacoesParaValidar.map(p => p.posicao));
        if (premiacoesParaValidar.length > payload.qtd_vencedores) {
            concursoError.textContent = `Selecione no máximo ${payload.qtd_vencedores} premiação(ões) para a quantidade de vencedores escolhida.`;
            concursoError.classList.remove('hidden');
            return;
        }
        if (posicoesUnicas.size !== premiacoesParaValidar.length) {
            concursoError.textContent = 'Duas premiações não podem ocupar a mesma posição. Ajuste as posições antes de salvar.';
            concursoError.classList.remove('hidden');
            return;
        }

        concursoSubmitBtn.disabled = true;

        try {
            // Envia o PDF do regulamento para o Storage, se um novo arquivo
            // foi selecionado. Sempre gera um nome único pra não colidir com
            // regulamentos de outros concursos.
            if (arquivoRegulamento) {
                const nomeArquivoUnico = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.pdf`;
                const { error: storageError } = await supabase.storage
                    .from('arusuperguia-regulamentos')
                    .upload(nomeArquivoUnico, arquivoRegulamento, { contentType: 'application/pdf' });

                if (storageError) throw storageError;

                const { data: urlData } = supabase.storage
                    .from('arusuperguia-regulamentos')
                    .getPublicUrl(nomeArquivoUnico);

                payload.regulamento_pdf_url = urlData.publicUrl;
            } else if (id && concursoRegulamentoRemoverInput.checked) {
                payload.regulamento_pdf_url = null;
            }

            const { data: concursoSalvo, error } = id
                ? await supabase.from('concursos').update(payload).eq('id', id).select().single()
                : await supabase.from('concursos').insert([payload]).select().single();

            if (error) throw error;

            // Sincroniza os vínculos: apaga tudo que existia pra esse
            // concurso e regrava só o que está marcado agora (mais simples
            // e seguro do que calcular diffs de adição/remoção).
            const concursoIdSalvo = concursoSalvo.id;
            const patrocinadoresSelecionados = obterSelecionadosLista(concursoPatrocinadoresLista);
            const premiacoesSelecionadas = obterSelecionadosPremiacoes();

            await Promise.all([
                supabase.from('concursos_patrocinadores').delete().eq('concurso_id', concursoIdSalvo),
                supabase.from('concursos_premiacoes').delete().eq('concurso_id', concursoIdSalvo),
            ]);

            const inserts = [];
            if (patrocinadoresSelecionados.length > 0) {
                inserts.push(supabase.from('concursos_patrocinadores').insert(
                    patrocinadoresSelecionados.map(patrocinador_id => ({ concurso_id: concursoIdSalvo, patrocinador_id }))
                ));
            }
            if (premiacoesSelecionadas.length > 0) {
                inserts.push(supabase.from('concursos_premiacoes').insert(
                    premiacoesSelecionadas.map(p => ({ concurso_id: concursoIdSalvo, premiacao_id: p.premiacao_id, posicao: p.posicao }))
                ));
            }
            const resultadosVinculos = await Promise.all(inserts);
            const erroVinculo = resultadosVinculos.find(r => r.error);
            if (erroVinculo) throw erroVinculo.error;

            resetConcursoForm();
            carregarConcursos();
        } catch (error) {
            concursoError.textContent = error.code === '23505'
                ? 'Já existe outro concurso marcado como Ativo. Desative-o antes de ativar este.'
                : 'Erro ao salvar concurso: ' + error.message;
            concursoError.classList.remove('hidden');
        } finally {
            concursoSubmitBtn.disabled = false;
        }
    });
}

if (concursoCancelBtn) {
    concursoCancelBtn.addEventListener('click', resetConcursoForm);
}

// 9. Patrocinadores — CRUD básico (cadastro de patrocinadores do concurso)

// Redimensiona o logotipo no navegador antes do upload (mantém tamanho de
// arquivo pequeno) e converte para PNG, preservando transparência.
function comprimirLogotipo(file, maxLargura = 300) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const urlTemp = URL.createObjectURL(file);
        img.onload = () => {
            const escala = Math.min(1, maxLargura / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = img.width * escala;
            canvas.height = img.height * escala;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(urlTemp);
                blob ? resolve(blob) : reject(new Error('Falha ao processar o logotipo. Tente outra imagem.'));
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(urlTemp);
            reject(new Error('Não foi possível ler essa imagem.'));
        };
        img.src = urlTemp;
    });
}

async function carregarPatrocinadores() {
    if (!patrocinadoresContainer) return;
    patrocinadoresContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Buscando patrocinadores...</p>';

    const { data, error } = await supabase
        .from('patrocinadores')
        .select('*')
        .order('nome', { ascending: true });

    if (error) {
        patrocinadoresContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar patrocinadores: ${escapeHTML(error.message)}</p>`;
        return;
    }

    patrocinadoresCache = data;
    renderizarPatrocinadores();
}

// Renderiza a partir do cache já carregado, aplicando o filtro Ativo/
// Inativo/Todos selecionado — não busca no banco de novo.
function renderizarPatrocinadores() {
    if (!patrocinadoresContainer) return;

    const filtro = patrocinadorStatusFilter ? patrocinadorStatusFilter.value : 'Todos';
    const data = filtrarPorAtivo(patrocinadoresCache, filtro);
    if (contadorPatrocinadores) contadorPatrocinadores.textContent = `(${data.length})`;

    if (patrocinadoresCache.length === 0) {
        patrocinadoresContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum patrocinador cadastrado até o momento.</p>';
        return;
    }

    if (data.length === 0) {
        patrocinadoresContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhum patrocinador encontrado para esse filtro.</p>';
        return;
    }

    patrocinadoresContainer.innerHTML = '';

    data.forEach(patrocinador => {
        const row = document.createElement('div');
        row.className = 'ticket-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';
        row.innerHTML = `
            <div class="flex items-center gap-3">
                ${patrocinador.logotipo_url
                    ? `<img src="${escapeHTML(patrocinador.logotipo_url)}" alt="Logotipo de ${escapeHTML(patrocinador.nome)}" class="h-10 w-10 object-contain border-2 border-[var(--ink)] rounded-lg bg-white">`
                    : `<div class="h-10 w-10 flex items-center justify-center border-2 border-[var(--ink)] rounded-lg bg-white text-lg">🤝</div>`}
                <div>
                    <p class="font-semibold text-[var(--ink)]">${escapeHTML(patrocinador.nome)}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="stamp ${patrocinador.ativo ? 'stamp-fern' : 'stamp-amber'}">${patrocinador.ativo ? 'Ativo' : 'Inativo'}</span>
                        ${patrocinador.url_rede_social ? `<a href="${escapeHTML(patrocinador.url_rede_social)}" target="_blank" rel="noopener noreferrer" class="text-sm underline underline-offset-2 text-[var(--ink-soft)] hover:text-[var(--ink)]">🔗 Link</a>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editarPatrocinador('${patrocinador.id}')" class="btn btn-ghost text-sm !py-1.5 !px-3">Editar</button>
                <button onclick="excluirPatrocinador('${patrocinador.id}')" class="btn btn-ember text-sm !py-1.5 !px-3">Excluir</button>
            </div>
        `;
        patrocinadoresContainer.appendChild(row);
    });
}

function resetPatrocinadorForm() {
    patrocinadorForm.reset();
    patrocinadorIdInput.value = '';
    patrocinadorAtivoInput.checked = true;
    patrocinadorLogotipoAtualDiv.classList.add('hidden');
    patrocinadorLogotipoPreview.src = '';
    patrocinadorSubmitBtn.textContent = 'Cadastrar patrocinador';
    patrocinadorCancelBtn.classList.add('hidden');
    patrocinadorError.classList.add('hidden');
}

window.editarPatrocinador = function(id) {
    const patrocinador = patrocinadoresCache.find(p => p.id === id);
    if (!patrocinador) return;

    patrocinadorIdInput.value = patrocinador.id;
    patrocinadorNomeInput.value = patrocinador.nome;
    patrocinadorUrlInput.value = patrocinador.url_rede_social || '';
    patrocinadorAtivoInput.checked = patrocinador.ativo;
    patrocinadorLogotipoArquivoInput.value = '';
    patrocinadorLogotipoRemoverInput.checked = false;
    if (patrocinador.logotipo_url) {
        patrocinadorLogotipoPreview.src = patrocinador.logotipo_url;
        patrocinadorLogotipoAtualDiv.classList.remove('hidden');
    } else {
        patrocinadorLogotipoAtualDiv.classList.add('hidden');
    }
    patrocinadorSubmitBtn.textContent = 'Salvar alterações';
    patrocinadorCancelBtn.classList.remove('hidden');
    patrocinadorError.classList.add('hidden');
    patrocinadorNomeInput.focus();
}

window.excluirPatrocinador = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este patrocinador? Essa ação não pode ser desfeita.')) return;

    const { error } = await supabase.from('patrocinadores').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir patrocinador: ' + error.message);
    } else {
        if (patrocinadorIdInput.value === id) resetPatrocinadorForm();
        carregarPatrocinadores();
    }
}

if (patrocinadorForm) {
    patrocinadorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        patrocinadorError.classList.add('hidden');

        const id = patrocinadorIdInput.value;
        const arquivoLogotipo = patrocinadorLogotipoArquivoInput.files[0];

        const payload = {
            nome: patrocinadorNomeInput.value.trim(),
            url_rede_social: patrocinadorUrlInput.value.trim() || null,
            ativo: patrocinadorAtivoInput.checked,
        };

        patrocinadorSubmitBtn.disabled = true;

        try {
            // Envia o logotipo para o Storage, se um novo arquivo foi
            // selecionado. Sempre gera um nome único pra não colidir com
            // logotipos de outros patrocinadores.
            if (arquivoLogotipo) {
                const logotipoComprimido = await comprimirLogotipo(arquivoLogotipo);
                const nomeArquivoUnico = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.png`;
                const { error: storageError } = await supabase.storage
                    .from('arusuperguia-patrocinadores')
                    .upload(nomeArquivoUnico, logotipoComprimido, { contentType: 'image/png' });

                if (storageError) throw storageError;

                const { data: urlData } = supabase.storage
                    .from('arusuperguia-patrocinadores')
                    .getPublicUrl(nomeArquivoUnico);

                payload.logotipo_url = urlData.publicUrl;
            } else if (id && patrocinadorLogotipoRemoverInput.checked) {
                payload.logotipo_url = null;
            }

            const { error } = id
                ? await supabase.from('patrocinadores').update(payload).eq('id', id)
                : await supabase.from('patrocinadores').insert([payload]);

            if (error) throw error;

            resetPatrocinadorForm();
            carregarPatrocinadores();
        } catch (error) {
            patrocinadorError.textContent = 'Erro ao salvar patrocinador: ' + error.message;
            patrocinadorError.classList.remove('hidden');
        } finally {
            patrocinadorSubmitBtn.disabled = false;
        }
    });
}

if (patrocinadorCancelBtn) {
    patrocinadorCancelBtn.addEventListener('click', resetPatrocinadorForm);
}

// 10. Premiações — CRUD básico (cadastro dos prêmios do concurso)
async function carregarPremiacoes() {
    if (!premiacoesContainer) return;
    premiacoesContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Buscando premiações...</p>';

    const { data, error } = await supabase
        .from('premiacoes')
        .select('*')
        .order('criado_em', { ascending: false });

    if (error) {
        premiacoesContainer.innerHTML = `<p class="text-[var(--ember-dark)] text-center font-semibold">Erro ao carregar premiações: ${escapeHTML(error.message)}</p>`;
        return;
    }

    premiacoesCache = data;
    renderizarPremiacoes();
}

// Renderiza a partir do cache já carregado, aplicando o filtro Ativo/
// Inativo/Todos selecionado — não busca no banco de novo.
function renderizarPremiacoes() {
    if (!premiacoesContainer) return;

    const filtro = premiacaoStatusFilter ? premiacaoStatusFilter.value : 'Todos';
    const data = filtrarPorAtivo(premiacoesCache, filtro);
    if (contadorPremiacoes) contadorPremiacoes.textContent = `(${data.length})`;

    if (premiacoesCache.length === 0) {
        premiacoesContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhuma premiação cadastrada até o momento.</p>';
        return;
    }

    if (data.length === 0) {
        premiacoesContainer.innerHTML = '<p class="text-[var(--ink-soft)] text-center">Nenhuma premiação encontrada para esse filtro.</p>';
        return;
    }

    premiacoesContainer.innerHTML = '';

    data.forEach(premiacao => {
        const row = document.createElement('div');
        row.className = 'ticket-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';
        row.innerHTML = `
            <div>
                <p class="font-semibold text-[var(--ink)]">${escapeHTML(premiacao.descricao)}</p>
                <span class="stamp ${premiacao.ativo ? 'stamp-fern' : 'stamp-amber'}">${premiacao.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="editarPremiacao('${premiacao.id}')" class="btn btn-ghost text-sm !py-1.5 !px-3">Editar</button>
                <button onclick="excluirPremiacao('${premiacao.id}')" class="btn btn-ember text-sm !py-1.5 !px-3">Excluir</button>
            </div>
        `;
        premiacoesContainer.appendChild(row);
    });
}

function resetPremiacaoForm() {
    premiacaoForm.reset();
    premiacaoIdInput.value = '';
    premiacaoAtivoInput.checked = true;
    premiacaoSubmitBtn.textContent = 'Cadastrar premiação';
    premiacaoCancelBtn.classList.add('hidden');
    premiacaoError.classList.add('hidden');
}

window.editarPremiacao = function(id) {
    const premiacao = premiacoesCache.find(p => p.id === id);
    if (!premiacao) return;

    premiacaoIdInput.value = premiacao.id;
    premiacaoDescricaoInput.value = premiacao.descricao;
    premiacaoAtivoInput.checked = premiacao.ativo;
    premiacaoSubmitBtn.textContent = 'Salvar alterações';
    premiacaoCancelBtn.classList.remove('hidden');
    premiacaoError.classList.add('hidden');
    premiacaoDescricaoInput.focus();
}

window.excluirPremiacao = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta premiação? Essa ação não pode ser desfeita.')) return;

    const { error } = await supabase.from('premiacoes').delete().eq('id', id);

    if (error) {
        alert('Erro ao excluir premiação: ' + error.message);
    } else {
        if (premiacaoIdInput.value === id) resetPremiacaoForm();
        carregarPremiacoes();
    }
}

if (premiacaoForm) {
    premiacaoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        premiacaoError.classList.add('hidden');

        const id = premiacaoIdInput.value;
        const payload = {
            descricao: premiacaoDescricaoInput.value.trim(),
            ativo: premiacaoAtivoInput.checked,
        };

        premiacaoSubmitBtn.disabled = true;

        const { error } = id
            ? await supabase.from('premiacoes').update(payload).eq('id', id)
            : await supabase.from('premiacoes').insert([payload]);

        premiacaoSubmitBtn.disabled = false;

        if (error) {
            premiacaoError.textContent = 'Erro ao salvar premiação: ' + error.message;
            premiacaoError.classList.remove('hidden');
            return;
        }

        resetPremiacaoForm();
        carregarPremiacoes();
    });
}

if (premiacaoCancelBtn) {
    premiacaoCancelBtn.addEventListener('click', resetPremiacaoForm);
}