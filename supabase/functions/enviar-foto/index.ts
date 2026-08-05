// Edge Function: enviar-foto
//
// Recebe { nome, url_foto, url_thumb, captchaToken, concurso_id }, valida o
// captchaToken direto com a Cloudflare (servidor a servidor — não dá pra
// falsificar via DevTools) e só então insere a linha em fotos_concurso,
// usando a Service Role Key.
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

// Origens permitidas a chamar essa function pelo navegador. Durante a
// migração de domínio (AruSuperGuia -> Órbita), os dois domínios de
// produção ficam liberados ao mesmo tempo — o antigo (arusuperguia.com.br)
// continua sendo quem o DNS aponta até a Fase 5 da migração cortar pro
// domínio novo; o novo (orbita.art.br) já é liberado desde já pra poder
// testar antes do corte. Remova o antigo da lista só depois que o DNS
// estiver definitivamente no ar em orbita.art.br. Os outros dois são só
// para testar localmente com a extensão Live Server do VSCode antes de
// subir mudanças (porta padrão dela é 5500, tanto em 127.0.0.1 quanto em
// localhost).
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

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { nome, url_foto, url_thumb, captchaToken, concurso_id } = await req.json();

        if (!nome || !url_foto || !url_thumb || !captchaToken || !concurso_id) {
            return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (typeof concurso_id !== "string") {
            return new Response(JSON.stringify({ error: "Concurso inválido." }), {
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

        if (typeof url_foto !== "string" || typeof url_thumb !== "string") {
            return new Response(JSON.stringify({ error: "URL da foto inválida." }), {
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

        // 2) Agora que múltiplos concursos podem estar ativos ao mesmo tempo
        // (ver sql/022_concursos_multiplos_ativos.sql), a function não descobre
        // mais sozinha "o" concurso ativo — quem envia a foto já sabe em qual
        // concurso está participando (veio da URL/tema daquela página) e manda
        // o id explicitamente. Só validamos aqui que esse concurso existe e
        // que ainda está aceitando envios, pra não confiar em nada que o
        // front-end tenha decidido sozinho.
        const { data: concurso, error: concursoError } = await supabaseAdmin
            .from("concursos")
            .select("id, ativo")
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

        if (!concurso.ativo) {
            return new Response(JSON.stringify({ error: "Este concurso não está mais aceitando envios." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const concursoId = concurso.id;

        // 3) Grava no banco com a Service Role (ignora RLS, pois já validamos tudo aqui)
        // .select("id").single() devolve o id gerado — reaproveitado pelo
        // front-end como "código de acompanhamento" (ver status.html), sem
        // precisar de nenhuma coluna nova só pra isso.
        const { data: fotoInserida, error: dbError } = await supabaseAdmin
            .from("fotos_concurso")
            .insert([{ nome_participante: nome, url_foto, url_thumb, aprovada: false, concurso_id: concursoId }])
            .select("id")
            .single();

        if (dbError) {
            return new Response(JSON.stringify({ error: dbError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ success: true, codigo: fotoInserida.id }), {
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
