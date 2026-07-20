// Configuração central do cliente Supabase.
// Usado por todas as páginas (index não precisa, enviar/votacao/curadoria precisam).
// A ANON KEY é pública por natureza (protegida pelas regras de RLS no banco),
// mas mantê-la em um único lugar facilita rotacionar a chave se precisar.
const SUPABASE_URL = "https://waapllqkahqzyzsvtuae.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhYXBsbHFrYWhxenl6c3Z0dWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzgyNTEsImV4cCI6MjA5OTg1NDI1MX0.RMPz1mjHXnLCysxPbSwgeGo7QLIuzwe0oH1pscLFGQA";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Escapa texto vindo de usuários antes de inserir em innerHTML.
// Usar sempre que um valor do banco (nome_participante, etc.) for
// interpolado dentro de um template de HTML.
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
