// Edge Function: disparar-campanha
//
// Recebe { campanha_id }, autenticado (o front-end manda o JWT do admin
// logado no header Authorization). Monta a lista de destinatários da
// campanha (toda a base opt-in, ou só quem votou no concurso vinculado),
// envia via Resend em lotes e grava o evento "sent" de cada envio aceito.
//
// Por que uma Edge Function em vez de disparar direto do navegador: a API
// key do Resend não pode ficar no front-end (qualquer um poderia usá-la pra
// mandar e-mail em nome do domínio verificado), e a lista de e-mails dos
// usuários (auth.users) não é exposta por nenhuma tabela pública — só a
// Service Role Key enxerga isso.
//
// Deploy:
//   supabase functions deploy disparar-campanha
//   supabase secrets set RESEND_API_KEY=<api key do Resend>
//
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// dentro do ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mesmo padrão de CORS de enviar-foto — ver comentário lá pra detalhes de
// por que localhost/127.0.0.1:5500 (Live Server) também estão liberados.
const ORIGENS_PERMITIDAS = [
    "https://arusuperguia.com.br",
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
// Domínio arusuperguia.com.br verificado no Resend (SPF/DKIM) — antes disso
// só era possível enviar a partir de onboarding@resend.dev.
const REMETENTE = "AruSuperGuia <campanhas@arusuperguia.com.br>";

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { campanha_id } = await req.json();

        if (!campanha_id || typeof campanha_id !== "string") {
            return new Response(JSON.stringify({ error: "campanha_id é obrigatório." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 1) Confere is_admin() com o JWT de quem chamou (não com Service
        // Role) — é a mesma checagem que o front-end já faz, repetida aqui
        // porque a Service Role Key ignora RLS e qualquer um poderia chamar
        // esta function diretamente sem passar pelo painel.
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
            return new Response(JSON.stringify({ error: "Apenas administradores podem disparar campanhas." }), {
                status: 403,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // 2) Busca a campanha e recusa disparo duplicado.
        const { data: campanha, error: campanhaError } = await supabaseAdmin
            .from("campanhas_marketing")
            .select("id, concurso_id, assunto, corpo_html, status")
            .eq("id", campanha_id)
            .maybeSingle();

        if (campanhaError) {
            return new Response(JSON.stringify({ error: campanhaError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (!campanha) {
            return new Response(JSON.stringify({ error: "Campanha não encontrada." }), {
                status: 404,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (campanha.status === "enviando" || campanha.status === "concluida") {
            return new Response(JSON.stringify({ error: "Esta campanha já foi disparada." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 3) Monta a lista de destinatários opt-in.
        let userIds: string[];

        if (campanha.concurso_id === null) {
            const { data: optins, error: optinError } = await supabaseAdmin
                .from("preferencias_marketing")
                .select("user_id")
                .eq("optin_email_marketing", true);

            if (optinError) {
                return new Response(JSON.stringify({ error: optinError.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                });
            }

            userIds = (optins ?? []).map((o) => o.user_id);
        } else {
            // Quem votou em alguma foto daquele concurso, restrito a quem
            // também é opt-in — os dois filtros precisam valer ao mesmo
            // tempo, por isso o join é feito aqui e não com um "or".
            const { data: fotosDoConcurso, error: fotosError } = await supabaseAdmin
                .from("fotos_concurso")
                .select("id")
                .eq("concurso_id", campanha.concurso_id);

            if (fotosError) {
                return new Response(JSON.stringify({ error: fotosError.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                });
            }

            const fotoIds = (fotosDoConcurso ?? []).map((f) => f.id);

            if (fotoIds.length === 0) {
                userIds = [];
            } else {
                const { data: votantes, error: votosError } = await supabaseAdmin
                    .from("votos_realizados")
                    .select("user_id")
                    .in("foto_id", fotoIds);

                if (votosError) {
                    return new Response(JSON.stringify({ error: votosError.message }), {
                        status: 500,
                        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    });
                }

                const votantesUnicos = [...new Set((votantes ?? []).map((v) => v.user_id))];

                if (votantesUnicos.length === 0) {
                    userIds = [];
                } else {
                    const { data: optins, error: optinError } = await supabaseAdmin
                        .from("preferencias_marketing")
                        .select("user_id")
                        .eq("optin_email_marketing", true)
                        .in("user_id", votantesUnicos);

                    if (optinError) {
                        return new Response(JSON.stringify({ error: optinError.message }), {
                            status: 500,
                            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                        });
                    }

                    userIds = (optins ?? []).map((o) => o.user_id);
                }
            }
        }

        if (userIds.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum destinatário opt-in encontrado para esta campanha." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // Idempotência: se esta campanha já tinha começado a enviar antes
        // (ex: parou em "erro" por estourar a cota diária do plano do
        // Resend, no meio do envio) e o admin clica "Disparar" de novo, não
        // reenvia pra quem já recebeu — sem isso, um retry duplicaria o
        // e-mail pra parte da lista.
        const { data: jaEnviados, error: jaEnviadosError } = await supabaseAdmin
            .from("eventos_email")
            .select("destinatario_user_id")
            .eq("campanha_id", campanha_id)
            .eq("tipo", "sent");

        if (jaEnviadosError) {
            return new Response(JSON.stringify({ error: jaEnviadosError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const idsJaEnviados = new Set((jaEnviados ?? []).map((e) => e.destinatario_user_id));
        userIds = userIds.filter((id) => !idsJaEnviados.has(id));

        if (userIds.length === 0) {
            return new Response(JSON.stringify({ error: "Todos os destinatários já haviam recebido esta campanha numa tentativa anterior." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // auth.users não tem uma tabela pública equivalente — precisa do
        // Admin API (getUserById) pra resolver user_id -> e-mail.
        const destinatarios: { user_id: string; email: string }[] = [];
        for (const userId of userIds) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin.auth.admin.getUserById(userId);
            if (!usuarioError && usuario?.user?.email) {
                destinatarios.push({ user_id: userId, email: usuario.user.email });
            }
        }

        if (destinatarios.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum destinatário com e-mail válido encontrado." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 4) Marca como "enviando" antes de chamar o Resend, pra travar
        // disparo duplicado em corridas (dois cliques rápidos no botão).
        await supabaseAdmin
            .from("campanhas_marketing")
            .update({ status: "enviando" })
            .eq("id", campanha_id);

        // 5) Envia em lotes de até 100 destinatários (limite da API de batch
        // do Resend), um e-mail individual por destinatário dentro do lote
        // (não um único e-mail com todo mundo em cópia).
        const lotes = dividirEmLotes(destinatarios, TAMANHO_LOTE);
        let totalEnviados = 0;

        try {
            for (const lote of lotes) {
                const payloadLote = lote.map((destinatario) => ({
                    from: REMETENTE,
                    to: [destinatario.email],
                    subject: campanha.assunto,
                    html: campanha.corpo_html,
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

                // A resposta de /emails/batch devolve { data: [{ id }, ...] }
                // na mesma ordem dos destinatários enviados no lote.
                const idsRetornados: { id: string }[] = resendData?.data ?? [];

                const eventosParaGravar = idsRetornados.map((item, indice) => ({
                    campanha_id,
                    resend_email_id: item.id,
                    destinatario_user_id: lote[indice].user_id,
                    tipo: "sent",
                }));

                if (eventosParaGravar.length > 0) {
                    const { error: eventoError } = await supabaseAdmin
                        .from("eventos_email")
                        .insert(eventosParaGravar);

                    if (eventoError) {
                        throw new Error(eventoError.message);
                    }
                }

                totalEnviados += eventosParaGravar.length;
            }
        } catch (erroEnvio) {
            // Não deixa a campanha presa em "enviando" — marca erro e propaga
            // a mensagem pro admin decidir se tenta de novo.
            await supabaseAdmin
                .from("campanhas_marketing")
                .update({ status: "erro" })
                .eq("id", campanha_id);

            // Inclui quantos e-mails já saíram antes da falha (ex: parou no
            // meio por causa da cota diária do plano do Resend) — quem lê o
            // erro na tela precisa saber que parte da lista já foi
            // notificada, e que um novo "Disparar" não vai duplicar isso
            // (ver checagem de idempotência acima).
            const mensagemErro = totalEnviados > 0
                ? `${String((erroEnvio as Error).message ?? erroEnvio)} (${totalEnviados} e-mail(s) já enviados antes da falha — não serão reenviados numa nova tentativa.)`
                : String((erroEnvio as Error).message ?? erroEnvio);

            return new Response(JSON.stringify({ error: mensagemErro }), {
                status: 502,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 6) Fecha a campanha como concluída.
        await supabaseAdmin
            .from("campanhas_marketing")
            .update({ status: "concluida", enviado_em: new Date().toISOString() })
            .eq("id", campanha_id);

        return new Response(JSON.stringify({ success: true, enviados: totalEnviados }), {
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
