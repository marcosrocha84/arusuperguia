// Edge Function: notificar-fotos-pendentes
//
// Chamada de hora em hora pelo pg_cron (ver sql/029_notificacao_fotos_pendentes.sql),
// sem nenhum usuário interativo por trás — por isso a autenticação aqui é
// diferente das outras functions (que checam is_admin() com o JWT de quem
// chamou): aqui só existe um chamador possível (o próprio cron do banco),
// então a checagem é simples: o Bearer recebido precisa ser exatamente a
// Service Role Key (guardada no Vault, nunca no front-end).
//
// Regras de negócio:
//   - Só notifica dentro do horário comercial (fora da janela de silêncio
//     22h-8h, horário de Brasília) — evita acordar o curador de madrugada
//     por causa de uma foto enviada às 3h.
//   - Só manda e-mail se o total de fotos pendentes MUDOU desde o último
//     aviso enviado (controle_notificacao_pendentes) — sem isso, mandaria
//     o mesmo e-mail toda hora enquanto ninguém aprova nada.
//   - Detalha por concurso (não só o total geral).
//
// Deploy:
//   supabase functions deploy notificar-fotos-pendentes
//
// (RESEND_API_KEY já deve estar configurado como secret, usado também por
// disparar-campanha/enviar-resultado-concurso. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY já existem automaticamente no ambiente de toda
// Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TAMANHO_LOTE = 100;
const REMETENTE = "Órbita <campanhas@orbita.art.br>";

// Janela de silêncio: nada é enviado entre HORA_INICIO_SILENCIO (inclusive)
// e HORA_FIM_SILENCIO (exclusive), no horário de Brasília.
const HORA_INICIO_SILENCIO = 22;
const HORA_FIM_SILENCIO = 8;
const FUSO_HORARIO = "America/Sao_Paulo";

const LINK_PAINEL = "https://orbita.art.br/curadoria.html";

function horaAtualNoFuso(): number {
    const formatado = new Intl.DateTimeFormat("en-US", {
        timeZone: FUSO_HORARIO,
        hour: "numeric",
        hourCycle: "h23",
    }).format(new Date());
    return Number(formatado);
}

function dentroDaJanelaDeSilencio(): boolean {
    const hora = horaAtualNoFuso();
    return hora >= HORA_INICIO_SILENCIO || hora < HORA_FIM_SILENCIO;
}

function escapeHtml(texto: string): string {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

// Mesma paleta "Órbita" usada no e-mail de resultado.
const COR_SURFACE_2 = "#eef0f3";
const COR_BORDER = "#e2e5ea";
const COR_INK = "#1f2430";
const COR_INK_SOFT = "#6b7280";

function montarHtmlDigest(totalPendentes: number, porConcurso: { nome: string; pendentes: number }[]): string {
    const plural = totalPendentes === 1 ? "" : "s";
    const linhas = porConcurso
        .map((c) => `
            <tr>
                <td style="padding:10px 20px;border-bottom:1px solid #e8e4da;font-family:Arial,Helvetica,sans-serif;">
                    <span style="font-size:14px;color:${COR_INK};font-weight:bold;">${escapeHtml(c.nome)}</span>
                    <span style="font-size:13px;color:${COR_INK_SOFT};"> — ${c.pendentes} pendente${c.pendentes === 1 ? "" : "s"}</span>
                </td>
            </tr>
        `)
        .join("");

    return `
        <div style="background:#F5F1E8;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e4da;">
                <tr>
                    <td style="background:${COR_SURFACE_2};border-bottom:1px solid ${COR_BORDER};padding:28px 24px;text-align:center;">
                        <div style="font-size:15px;color:${COR_INK};font-weight:bold;">Órbita</div>
                        <div style="font-size:20px;color:${COR_INK};font-weight:bold;margin-top:6px;">${totalPendentes} foto${plural} aguardando aprovação</div>
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
                        <a href="${LINK_PAINEL}" style="display:inline-block;background:${COR_INK};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:8px;">Abrir painel de curadoria</a>
                    </td>
                </tr>
            </table>
        </div>
    `;
}

Deno.serve(async (req) => {
    try {
        // Único chamador esperado é o pg_cron (via net.http_post), com a
        // Service Role Key no header — não há usuário interativo aqui, então
        // não faz sentido checar is_admin() via JWT de chamador como nas
        // outras functions.
        const authHeader = req.headers.get("authorization");
        const token = authHeader?.replace(/^Bearer\s+/i, "");

        if (!token || token !== SERVICE_ROLE_KEY) {
            return new Response(JSON.stringify({ error: "Não autorizado." }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (dentroDaJanelaDeSilencio()) {
            return new Response(JSON.stringify({ skipped: "janela_de_silencio" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // Mesmo filtro usado no card "Pendentes" do dashboard (app.js):
        // aprovada = false e reprovada = false.
        const { data: fotosPendentes, error: fotosError } = await supabaseAdmin
            .from("fotos_concurso")
            .select("concurso_id, concursos(nome, descricao)")
            .eq("aprovada", false)
            .eq("reprovada", false);

        if (fotosError) {
            return new Response(JSON.stringify({ error: fotosError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const porConcursoMap = new Map<string, { nome: string; pendentes: number }>();
        for (const foto of fotosPendentes ?? []) {
            const concurso = (foto as any).concursos;
            const nome = concurso?.nome || concurso?.descricao || "Concurso";
            const atual = porConcursoMap.get(foto.concurso_id) || { nome, pendentes: 0 };
            atual.pendentes += 1;
            porConcursoMap.set(foto.concurso_id, atual);
        }

        const porConcurso = [...porConcursoMap.values()].sort((a, b) => b.pendentes - a.pendentes);
        const total = porConcurso.reduce((soma, c) => soma + c.pendentes, 0);

        const { data: controle, error: controleError } = await supabaseAdmin
            .from("controle_notificacao_pendentes")
            .select("ultimo_total_notificado")
            .eq("id", 1)
            .maybeSingle();

        if (controleError) {
            return new Response(JSON.stringify({ error: controleError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const ultimoTotal = controle?.ultimo_total_notificado ?? -1;

        if (total === 0) {
            if (ultimoTotal !== 0) {
                await supabaseAdmin
                    .from("controle_notificacao_pendentes")
                    .update({ ultimo_total_notificado: 0 })
                    .eq("id", 1);
            }
            return new Response(JSON.stringify({ skipped: "nada_pendente" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (total === ultimoTotal) {
            return new Response(JSON.stringify({ skipped: "total_sem_mudanca", total }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { data: admins, error: adminsError } = await supabaseAdmin
            .from("admins")
            .select("email")
            .not("email", "is", null);

        if (adminsError) {
            return new Response(JSON.stringify({ error: adminsError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const destinatarios = (admins ?? []).filter((a) => a.email) as { email: string }[];

        if (destinatarios.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum admin com e-mail cadastrado." }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
            });
        }

        const plural = total === 1 ? "" : "s";
        const assunto = `${total} foto${plural} aguardando aprovação`;
        const html = montarHtmlDigest(total, porConcurso);

        const lotes = dividirEmLotes(destinatarios, TAMANHO_LOTE);

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
            }
        } catch (erroEnvio) {
            return new Response(JSON.stringify({ error: String((erroEnvio as Error).message ?? erroEnvio) }), {
                status: 502,
                headers: { "Content-Type": "application/json" },
            });
        }

        await supabaseAdmin
            .from("controle_notificacao_pendentes")
            .update({ ultimo_total_notificado: total, notificado_em: new Date().toISOString() })
            .eq("id", 1);

        return new Response(JSON.stringify({ success: true, total, enviados: destinatarios.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
