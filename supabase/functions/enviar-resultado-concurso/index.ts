// Edge Function: enviar-resultado-concurso
//
// Recebe { concurso_id }, autenticado (o front-end manda o JWT do admin
// logado no header Authorization). Calcula os vencedores do concurso (top N
// por votos) e envia um e-mail avisando o resultado para quem aceitou saber
// (preferencias_resultado_concurso.quer_resultado = true naquele concurso).
//
// Mesmo motivo de existir como Edge Function que disparar-campanha: a API
// key do Resend não pode ficar no front-end, e a lista de e-mails dos
// usuários (auth.users) só é acessível via Service Role Key.
//
// Deploy:
//   supabase functions deploy enviar-resultado-concurso
//
// (RESEND_API_KEY já deve estar configurado como secret, usado também por
// disparar-campanha. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem
// automaticamente dentro do ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mesmo padrão de CORS de disparar-campanha/enviar-foto.
const ORIGENS_PERMITIDAS = [
    "https://arusuperguia.com.br",
    "https://orbita.art.br",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
];

function construirCorsHeaders(origin: string | null) {
    return {
        "Access-Control-Allow-Origin": origin && ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0],
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

// API do Resend aceita no máximo 100 destinatários por chamada de batch.
const TAMANHO_LOTE = 100;
const REMETENTE = "Órbita <campanhas@orbita.art.br>";

// Mesmo mapeamento de medalha por posição usado em votacao.html (selosPosicao).
const MEDALHAS = ["🥇", "🥈", "🥉"];

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

function escapeHtml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Mesma paleta "Órbita" usada hoje em index.html/votacao.html (--orbita-*),
// não a paleta antiga "Ticket de Expedição" de styles.css.
const COR_SURFACE_2 = "#eef0f3";
const COR_BORDER = "#e2e5ea";
const COR_INK = "#1f2430";
const COR_INK_SOFT = "#6b7280";
const COR_FERN = "#3C8156";

const NOMES_POSICAO = ["1º lugar", "2º lugar", "3º lugar"];

function linhaVencedor(nome: string, indice: number): string {
    const medalha = MEDALHAS[indice] || "🏅";
    const posicao = NOMES_POSICAO[indice] || `${indice + 1}º lugar`;
    return `
        <tr>
            <td style="padding:14px 20px;border-bottom:1px solid #e8e4da;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="font-size:28px;width:44px;">${medalha}</td>
                        <td style="padding-left:8px;">
                            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${COR_FERN};font-weight:bold;">${posicao}</div>
                            <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:${COR_INK};font-weight:bold;">${escapeHtml(nome)}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    `;
}

function montarHtmlResultado(nomeConcurso: string, vencedores: { nome_participante: string }[]): string {
    const linhas = vencedores
        .map((v, i) => linhaVencedor(v.nome_participante || "Participante", i))
        .join("");

    return `
        <div style="background:#F5F1E8;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e4da;">
                <tr>
                    <td style="background:${COR_SURFACE_2};border-bottom:1px solid ${COR_BORDER};padding:28px 24px;text-align:center;">
                        <div style="font-size:15px;color:${COR_INK};font-weight:bold;">Órbita</div>
                        <div style="font-size:20px;color:${COR_INK};font-weight:bold;margin-top:6px;">Resultado do concurso</div>
                        <div style="font-size:16px;color:${COR_INK_SOFT};margin-top:2px;">${escapeHtml(nomeConcurso)}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:20px 24px 4px;">
                        <p style="font-size:14px;color:${COR_INK};line-height:1.5;margin:0;">O concurso foi encerrado e o resultado já está disponível. Confira quem foram os vencedores:</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:8px 4px 4px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${linhas}
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding:20px 24px 28px;text-align:center;">
                        <p style="font-size:12px;color:#8a8578;margin:0;">Você recebeu este e-mail porque optou por saber o resultado deste concurso na tela de votação do Órbita.</p>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { concurso_id } = await req.json();

        if (!concurso_id || typeof concurso_id !== "string") {
            return new Response(JSON.stringify({ error: "concurso_id é obrigatório." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 1) Confere is_admin() com o JWT de quem chamou (não com Service
        // Role) — mesma checagem de disparar-campanha.
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Não autenticado." }), {
                status: 401,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseComoChamador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: souAdmin, error: adminError } = await supabaseComoChamador.rpc("is_admin");

        if (adminError || !souAdmin) {
            return new Response(JSON.stringify({ error: "Apenas administradores podem enviar o resultado." }), {
                status: 403,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // 2) Busca o concurso e confere que está encerrado — trava
        // redundante à do front-end (defesa em profundidade: a function
        // pode ser chamada diretamente por quem tiver um JWT de admin).
        const { data: concurso, error: concursoError } = await supabaseAdmin
            .from("concursos")
            .select("id, nome, descricao, qtd_vencedores, encerrado")
            .eq("id", concurso_id)
            .maybeSingle();

        if (concursoError) {
            return new Response(JSON.stringify({ error: concursoError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (!concurso) {
            return new Response(JSON.stringify({ error: "Concurso não encontrado." }), {
                status: 404,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (!concurso.encerrado) {
            return new Response(JSON.stringify({ error: "Só é possível enviar o resultado de um concurso encerrado." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 3) Calcula os vencedores — mesma ordenação usada em votacao.html
        // (votos desc, criado_em asc em caso de empate).
        const qtdVencedores = concurso.qtd_vencedores || 3;
        const { data: fotos, error: fotosError } = await supabaseAdmin
            .from("fotos_concurso")
            .select("nome_participante, votos")
            .eq("concurso_id", concurso_id)
            .eq("aprovada", true)
            .order("votos", { ascending: false })
            .order("criado_em", { ascending: true })
            .limit(qtdVencedores);

        if (fotosError) {
            return new Response(JSON.stringify({ error: fotosError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const vencedores = fotos ?? [];

        if (vencedores.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhuma foto aprovada encontrada para este concurso." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 4) Busca quem aceitou saber o resultado DESTE concurso.
        const { data: optins, error: optinError } = await supabaseAdmin
            .from("preferencias_resultado_concurso")
            .select("user_id")
            .eq("concurso_id", concurso_id)
            .eq("quer_resultado", true);

        if (optinError) {
            return new Response(JSON.stringify({ error: optinError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const userIds = (optins ?? []).map((o) => o.user_id);

        if (userIds.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum usuário optou por receber o resultado deste concurso." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // auth.users não tem tabela pública equivalente — precisa do Admin
        // API (getUserById) pra resolver user_id -> e-mail.
        const destinatarios: { email: string }[] = [];
        for (const userId of userIds) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin.auth.admin.getUserById(userId);
            if (!usuarioError && usuario?.user?.email) {
                destinatarios.push({ email: usuario.user.email });
            }
        }

        if (destinatarios.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum destinatário com e-mail válido encontrado." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const nomeConcurso = concurso.nome || concurso.descricao || "Concurso";
        const assunto = `Resultado do concurso "${nomeConcurso}"`;
        const html = montarHtmlResultado(nomeConcurso, vencedores);

        // 5) Envia em lotes de até 100 destinatários (limite da API de batch
        // do Resend), um e-mail individual por destinatário.
        const lotes = dividirEmLotes(destinatarios, TAMANHO_LOTE);
        let totalEnviados = 0;

        try {
            for (const lote of lotes) {
                const payloadLote = lote.map((destinatario) => ({
                    from: REMETENTE,
                    to: [destinatario.email],
                    subject: assunto,
                    html,
                }));

                const resendResp = await fetch("https://api.resend.com/emails/batch", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${RESEND_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payloadLote),
                });

                const resendData = await resendResp.json();

                if (!resendResp.ok) {
                    throw new Error(resendData?.message || "Falha ao enviar lote pelo Resend.");
                }

                totalEnviados += lote.length;
            }
        } catch (erroEnvio) {
            const mensagemErro = totalEnviados > 0
                ? `${String((erroEnvio as Error).message ?? erroEnvio)} (${totalEnviados} e-mail(s) já enviados antes da falha.)`
                : String((erroEnvio as Error).message ?? erroEnvio);

            return new Response(JSON.stringify({ error: mensagemErro }), {
                status: 502,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 6) Carimba o envio no concurso (idempotência: o botão "Enviar
        // resultado" some da UI depois disso, sobrando só "Reenviar mesmo
        // assim").
        await supabaseAdmin
            .from("concursos")
            .update({ resultado_enviado_em: new Date().toISOString() })
            .eq("id", concurso_id);

        return new Response(JSON.stringify({ success: true, enviados: totalEnviados, vencedores }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }
});
