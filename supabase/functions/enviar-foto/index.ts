// Edge Function: enviar-foto
//
// Recebe { nome, url_foto, captchaToken }, valida o captchaToken direto com a
// Cloudflare (servidor a servidor — não dá pra falsificar via DevTools) e só
// então insere a linha em fotos_concurso, usando a Service Role Key.
//
// Por que isso é necessário: hoje o front-end insere direto na tabela com a
// chave anônima, então qualquer pessoa pode abrir o DevTools, pular a
// verificação do widget do Turnstile e chamar o insert do Supabase na mão.
// Com essa function, a tabela passa a bloquear INSERT direto do anônimo
// (ver sql/002_bloquear_insert_direto.sql) e só aceita fotos que passaram
// por aqui.
//
// Deploy:
//   supabase functions deploy enviar-foto
//   supabase secrets set TURNSTILE_SECRET_KEY=<sua secret key da Cloudflare>
//
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// dentro do ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*", // troque pelo seu domínio em produção
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { nome, url_foto, captchaToken } = await req.json();

        if (!nome || !url_foto || !captchaToken) {
            return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // Nome não pode ser absurdamente longo (proteção simples contra abuso)
        if (typeof nome !== "string" || nome.length > 120) {
            return new Response(JSON.stringify({ error: "Nome inválido." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 1) Valida o token do Turnstile direto com a Cloudflare
        const verifyResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET_KEY,
                response: captchaToken,
                remoteip: req.headers.get("cf-connecting-ip") ?? undefined,
            }),
        });
        const verifyData = await verifyResp.json();

        if (!verifyData.success) {
            return new Response(JSON.stringify({ error: "Falha na verificação de segurança (CAPTCHA)." }), {
                status: 403,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // 2) Descobre o concurso ativo no momento do envio. Só pode existir
        // exatamente um concurso com "ativo = true" por vez — se não houver
        // nenhum, ou houver mais de um, o envio é bloqueado (é um erro de
        // configuração no painel de curadoria, não algo pro participante
        // resolver sozinho).
        const { data: concursosAtivos, error: concursoError } = await supabaseAdmin
            .from("concursos")
            .select("id")
            .eq("ativo", true);

        if (concursoError) {
            return new Response(JSON.stringify({ error: concursoError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (!concursosAtivos || concursosAtivos.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum concurso ativo no momento. Os envios estão temporariamente indisponíveis." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (concursosAtivos.length > 1) {
            return new Response(JSON.stringify({ error: "Configuração inválida: existe mais de um concurso ativo simultaneamente. Contate o suporte." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const concursoId = concursosAtivos[0].id;

        // 3) Grava no banco com a Service Role (ignora RLS, pois já validamos tudo aqui)
        const { error: dbError } = await supabaseAdmin
            .from("fotos_concurso")
            .insert([{ nome_participante: nome, url_foto, aprovada: false, concurso_id: concursoId }]);

        if (dbError) {
            return new Response(JSON.stringify({ error: dbError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ success: true }), {
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
